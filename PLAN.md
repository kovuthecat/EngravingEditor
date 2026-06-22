# PLAN.md — Pipeline SVG : motifs en zones REMPLI/VIDE + export SVG couleur

> **Exécutants (Sonnet / Haiku / Codex)** : faites UNIQUEMENT votre tâche.
> Suivez les **Étapes dans l'ordre**. Lisez UNIQUEMENT les fichiers sous « Lire ».
> Ne créez AUCUN fichier ni dépendance hors « Modifier ». Le design est fixé par Opus —
> ne reconcevez pas. Doute ou blocage → **STOP**, signalez, rendez la main. N'improvisez pas.

- **Date :** 2026-06-22 · **Rédigé par :** Opus · **Branche :** —
- **Plan parent / lié :** — · **Décision cadre :** `DECISIONS.md §D-004` (Lot 1) · `§D-005` (Lot 2 décor)

> **Mise à jour Sonnet le 2026-06-22** : **Lot 1 (T1-T7) entièrement fait**, validé visuellement
> (Playwright) et en headless (`node test/run.js`). Les deux cassures listées plus haut sont résolues :
> export SVG branché sur `motif.zones`/`ML.motifFill` (T5), import motifs cohérent SVG↔SVG (T5).
> DXF entièrement retiré (`src/dxf.js` supprimé). **Lot 2 (décor, T8-T12) peut démarrer.**
>
> **Mise à jour Sonnet le 2026-06-22 (T8-T9 faits)** : **T8 et T9 faits et validés visuellement.**
> ⚠️ **À planifier par Opus** : `ML.buildZones` (T2) prend ~35-40s (gèle l'onglet, ne plante pas) sur
> le **décor réel** de Thibault (`exemple motif/Decor/decor hybride.svg`, 3936 sous-chemins / 549k
> points) — confirmé que ce n'est pas un cas de test mais le fichier de production. Cause probable :
> comparaison exhaustive O(n²) des sous-chemins pour la détection parent/profondeur, sans filtre
> bbox préalable. Thibault a choisi de laisser ce point à ton arbitrage plutôt que de le corriger
> dans le cadre de T8/T9 (hors périmètre). Voir `STATUS.md` « Ce qui casse » pour le détail et la
> piste de fix pressentie (filtre bbox dans `ML.buildZones` avant le point-dans-polygone).

## Objectif global

Faire passer l'outil du DXF au **SVG de bout en bout**. Un motif devient un ensemble de **zones**
(sous-chemins) à rôle **REMPLI** ou **VIDE** ; l'utilisateur édite ces rôles ; l'export est un
**SVG couleur** (1 `fill` par groupe, trous via `fill-rule="evenodd"`, en mm) consommable par
Falcon Design Space. Retrait total du DXF (entrée + sortie).

## Contexte / décision clé

Tout est dans `DECISIONS.md §D-004` (à lire en entier avant de coder). Points structurants :
- **Modèle motif** : `{ id, name, zones:[{id, pts:[[x,y]], role:"REMPLI"|"VIDE", color, parent, depth}], silhouette:[[x,y]] }`. Remplace `polylines`. L'ordre des zones = z-order intra-motif (ordre du document SVG).
- **Détection trous** : parent d'une zone = plus petit sous-chemin la contenant **de même couleur** (test point intérieur). `depth` = longueur de la chaîne de parents. Rôle par défaut : `depth` pair → REMPLI, impair → VIDE.
- **Modèle « région »** : surface gravée d'un motif = **union des régions REMPLI**, où `région(S) = contour(S) − union(enfants directs de S)`. C'est le « remplir jusqu'au sous-ensemble suivant » de Falcon.
- **Silhouette** (occlusion « sticker ») = union des contours les plus extérieurs (zones `depth=0`), trous inclus → reste opaque.
- **Falcon** respecte `evenodd` et sépare par couleur ; le mode ligne/remplissage est choisi dans Falcon (pas un rôle de zone). Preuves : `exemple motif/falcon-test/`.

Référence de style : l'app est en **classic script** (pas d'ES modules), globals `window.ML`,
`Konva`, `ClipperLib`. Doit tourner en `file://`. 4 fichiers source.

---

## Tâches

### T1 — Enrichir le parser SVG (couleur + groupage par path) · Modèle : Sonnet
- **But :** faire renvoyer à `ML.parseSVG` la **couleur de fill** et le **regroupement par `<path>`**, sans casser l'usage actuel (contour table).
- **Lire :** `src/svg.js` (entier) ; `src/app.js` lignes 388-403 (câblage import, pour connaître `ML.parseSVG(text).subpaths`).
- **Modifier :** `src/svg.js`.
- **Hors périmètre :** ne touche pas à la détection de zones (T2), au rendu, à `app.js`.
- **Étapes :**
  1. Garder `parsePath(d)` tel quel (aplatissement Bézier OK).
  2. Modifier `ML.parseSVG` : itérer sur chaque balise `<path …>` ; pour chacune extraire :
     - `d` (déjà fait) → ses sous-chemins via `parsePath`,
     - la couleur : chercher `fill:#rrggbb` dans `style="…"` **ou** `fill="#rrggbb"` ; défaut `"#000000"` ; si `fill:none`/`fill="none"` → garder `"none"`.
  3. Retourner `{ paths: [ { color, subpaths:[{pts,closed}] } ], subpaths: [ …tous les sous-chemins à plat… ] }`. **Le champ `subpaths` à plat doit rester** (le contour table l'utilise encore).
  4. Ne garder que les sous-chemins `pts.length >= 2` (comme aujourd'hui).
- **Validation :**
  - auto : `node -e "global.window={};require('./src/svg.js');const r=window.ML.parseSVG(require('fs').readFileSync('exemple motif/Spyro test svg.svg','utf8'));console.log('paths',r.paths.length,'couleurs',r.paths.map(p=>p.color).join(','),'flat',r.subpaths.length)"` → doit afficher `paths 8`, 8 couleurs distinctes, et un `flat` > 8.
  - visuel : —
- **Si bloqué :** si une balise `<path>` n'a ni `style` ni `fill`, applique `"#000000"` (ne STOP pas). Si `ML.parseSVG` est appelé ailleurs avec une signature incompatible, **STOP** et signale.
- **Commit :** `feat(svg): parseSVG renvoie couleur fill + groupage par path`
- **Statut :** [x] fait · exécuté par : Sonnet · le : 2026-06-22 · commit : —

### T2 — Détection de zones + helpers géométrie (containment, régions) · Modèle : Sonnet
- **Pourquoi ce modèle :** géométrie critique (Clipper, point-dans-polygone), jugement requis.
- **But :** ajouter dans `geometry.js` les helpers qui transforment des sous-chemins colorés en **zones** (parent/depth/role) et calculent **régions** et **union**.
- **Lire :** `src/geometry.js` (entier : réutiliser `toInt/fromInt`, `unionInt`, `clipBy`, `absArea`) ; `test/_svg_zones.js` **avant sa suppression** (logique `pointInPoly`/`interiorPoint`/`parent`/`depth` déjà éprouvée — la transposer). `DECISIONS.md §D-004`.
- **Modifier :** `src/geometry.js`.
- **Hors périmètre :** pas de rendu, pas d'`app.js`. Ne touche pas à `ML.occlude` (T5).
- **Étapes :**
  1. Exposer `ML.pointInPoly(pt, poly)` et `ML.interiorPoint(pts)` (copier depuis `_svg_zones.js`).
  2. `ML.buildZones(paths)` : `paths` = sortie `parseSVG().paths`. Aplatit en liste de zones `{pts, closed, color}` (ordre document conservé). Pour chaque zone, calcule `parent` = index du **plus petit** sous-chemin **de même couleur** qui contient son `interiorPoint` (aire strictement supérieure) ; `depth` = nb de parents chaînés ; `role` = `depth%2===0 ? "REMPLI" : "VIDE"`. Retourne le tableau de zones (avec `id` `"z"+i`).
  3. `ML.unionPolys(polys)` : exposer une union simple (réutiliser `unionInt` + `fromInt`) → `[[x,y]…][]`.
  4. `ML.regionOf(zone, children)` : `contour(zone) − union(children)` via Clipper `ctDifference` (closed) → `[{pts,closed}]`.
  5. `ML.motifFill(zones)` : pour chaque zone REMPLI, calcule sa région (enfants directs = zones dont `parent` = cette zone) ; **union de toutes les régions REMPLI** par **couleur** → retourne `{ [color]: [{pts,closed}] }` (un groupe de contours par couleur, trous inclus via orientation Clipper).
  6. `ML.motifSilhouette(zones)` : union des contours `depth===0` (toutes couleurs) → `[[x,y]]` fermé (le plus grand si l'union donne plusieurs morceaux ; sinon concat — garder simple : union, prendre tous les contours extérieurs).
- **Validation :**
  - auto : `node -e "global.window={};require('./src/geometry.js');require('./src/svg.js');const fs=require('fs');const p=window.ML.parseSVG(fs.readFileSync('exemple motif/noiraude test svg.svg','utf8'));const z=window.ML.buildZones(p.paths);console.log('zones',z.length,'roles',z.map(x=>x.role).join(','));const f=window.ML.motifFill(z);console.log('groupes',Object.keys(f),'contours',Object.values(f)[0].length)"` → `zones 5`, roles `REMPLI,VIDE,REMPLI,VIDE,REMPLI`, 1 groupe `#000000`.
  - visuel : —
- **Si bloqué :** si `unionInt`/`clipBy` ne sont pas accessibles (fonctions internes), **expose-les** au besoin via `ML.` mais NE réécris PAS leur logique. Si une couleur isolée n'a aucun REMPLI, son groupe = `[]` (ne STOP pas).
- **Commit :** `feat(geometry): zones (parent/depth/role) + régions + motifFill/silhouette`
- **Statut :** [x] fait · exécuté par : Sonnet · le : 2026-06-22 · commit : —

### T3 — Construction du motif depuis SVG + rendu écran fidèle · Modèle : Sonnet
- **Pourquoi ce modèle :** logique d'état + rendu Konva (sceneFunc/evenodd), validation visuelle.
- **But :** remplacer `buildMotif`(DXF) par une construction SVG → modèle `zones`, et rendre à l'écran les surfaces noires avec trous (evenodd) au lieu de traits.
- **Lire :** `src/app.js` lignes 1-160 (état, `buildMotif`, `addMotifToLibrary`, `drawThumb`, `makeGroup`) ; lignes 220-260 (le `sceneFunc`+`fill("evenodd")` du contour, à imiter) ; sortie de T1/T2.
- **Imiter :** le `sceneFunc` evenodd déjà utilisé pour `boundary` (~lignes 230-236).
- **Modifier :** `src/app.js`.
- **Hors périmètre :** pas l'export (T5), pas l'UI d'édition (T4), pas la persistance (T5/T6).
- **Étapes :**
  1. Remplacer `buildMotif(name, parsed)` par `buildMotifFromSVG(name, parsed)` : `parsed` = `parseSVG(text)`. mm→px y-flip (×`PX_PER_MM`, `-y`) sur tous les sous-chemins ; centrer sur le bbox global (comme l'actuel). Construire `zones` via `ML.buildZones(parsed.paths)` **après** la conversion px (convertir les pts des paths d'abord). Silhouette via `ML.motifSilhouette(zones)`. Retourner `{ id, name, zones, silhouette }`.
  2. `makeGroup(motif, …)` : au lieu de fond blanc + traits noirs, dessiner :
     - un fond **silhouette blanc** opaque (masque l'occlusion à l'écran) = `Konva.Line` closed fill `#fff` sur `motif.silhouette` (garder l'existant) ;
     - **par couleur** (issue de `ML.motifFill(motif.zones)`) un `Konva.Shape` avec `sceneFunc` qui trace tous les contours du groupe et fait `ctx.fillStrokeShape` avec `fill` = la couleur et **`context._context.fill('evenodd')`** (suivre le patron du boundary). Les trous VIDE laissent voir le fond blanc → effet correct.
  3. `drawThumb(cv, motif)` : même logique en canvas 2D natif (`ctx.fill('evenodd')` par couleur, fond silhouette blanc d'abord).
  4. Adapter toute référence à `motif.polylines` (recherche globale) → via `zones`/`motifFill`.
- **Validation :**
  - auto : `node -e "..."` chargeant `buildMotifFromSVG` n'est pas trivial sans DOM → se limiter à : l'app se charge sans erreur (syntaxe) `node --check src/app.js`.
  - visuel : **OBLIGATOIRE** — ouvrir `index.html`, importer `exemple motif/noiraude test svg.svg`, vérifier vignette + instance = corps noir, yeux en blanc (trous), pupilles noires.
- **Si bloqué :** si `ML.motifFill` renvoie des contours non imbriqués correctement (trous remplis), **STOP** et signale (problème T2, ne pas bricoler le rendu).
- **Commit :** `feat(app): motif SVG en zones + rendu evenodd à l'écran`
- **Statut :** [x] fait · exécuté par : Sonnet · le : 2026-06-22 · commit : — · (vérifié dans le code par Opus le 2026-06-22 : `buildMotifFromSVG`, `motifFill`, rendu evenodd présents — `app.js:77-149`)

### T4 — UI d'édition des rôles de zones (REMPLI/VIDE) par motif · Modèle : Sonnet
- **But :** permettre, motif sélectionné, de basculer chaque zone REMPLI↔VIDE et re-rendre.
- **Lire :** `src/app.js` (sélection `select()`, état `state.motifs`, `makeGroup`, `drawThumb`) ; `index.html` (zone de panneau latéral) ; `src/style.css`.
- **Modifier :** `src/app.js`, `index.html`, `src/style.css`.
- **Hors périmètre :** pas de changement de couleur de zone (hors scope v1) ; pas d'édition géométrique des zones.
- **Étapes :**
  1. Dans `index.html`, ajouter un conteneur `#zone-editor` (caché par défaut) dans le panneau.
  2. Quand une instance est sélectionnée (`select(g)`), retrouver son `motif` et peupler `#zone-editor` : une ligne par zone = pastille couleur + label (`#index` + aire) + un toggle **REMPLI/VIDE**. Trier par `depth` puis aire décroissante pour la lisibilité.
  3. Au toggle : modifier `zone.role` dans le motif, recalculer le rendu de **toutes les instances** de ce motif (re-`makeGroup` ou maj du `sceneFunc`) + la vignette. Recalculer `silhouette` si nécessaire (la silhouette ne dépend que des contours extérieurs, donc inchangée par un flip interne — ne pas recalculer inutilement).
  4. Désélection → cacher `#zone-editor`.
- **Validation :**
  - auto : `node --check src/app.js`.
  - visuel : **OBLIGATOIRE** — sélectionner noiraude, passer un œil VIDE→REMPLI : l'œil devient noir plein ; re-VIDE : redevient bois. La vignette suit.
- **Si bloqué :** si plusieurs instances partagent le motif et qu'un re-render global est lourd, garder simple (re-render toutes) ; ne pas introduire de cache d'instance sans validation. Toute hésitation UI → STOP.
- **Commit :** `feat(app): éditeur de rôles de zones (REMPLI/VIDE) par motif`
- **Statut :** [x] fait · exécuté par : Sonnet · le : 2026-06-22 · commit : — (pas de repo git encore)

### T5 — Occlusion par surface + export SVG + retrait DXF · Modèle : Sonnet
- **Pourquoi ce modèle :** cœur géométrique (export, occlusion) + suppression transverse ; validation `node test/run.js`.
- **But :** exporter un **SVG couleur** des surfaces réellement visibles (occlusion), et retirer tout le DXF.
- **Lire :** `src/geometry.js` (`ML.occlude`, `clipBy`, `pxPathsToMm`) ; `src/app.js` lignes 325-403 (`instancesBottomToTop`, `exportDXF`, câblage import) ; `src/dxf.js` (pour savoir ce qui disparaît) ; `DECISIONS.md §D-004`.
- **Modifier :** `src/geometry.js`, `src/app.js`, `index.html` ; **supprimer** `src/dxf.js`.
- **Hors périmètre :** ne change pas la détection de zones (T2) ni l'UI (T4).
- **Étapes :**
  1. `instancesBottomToTop()` : pour chaque groupe Konva, mapper via `getAbsoluteTransform` les **contours de `ML.motifFill(motif.zones)`** (par couleur) et la `silhouette`. Retourner `{ silhouette, groups:[{color, paths:[{pts,closed:true}]}] }`.
  2. Adapter `ML.occlude` (ou un nouveau `ML.occludeSurfaces`) pour traiter des **surfaces fermées par couleur** : du haut vers le bas, `visibleFill[color] = fill − union(silhouettes au-dessus)`, puis intersection `boundary`, puis soustraction `reservedPolys()` (zones interdites). Réutiliser `clipBy` (closed) et l'`above` existant. Conserver la signature/usage de `holes` et `boundary`.
  3. Ajouter `ML.writeSVG(groupsMm, viewBoxMm)` : pour chaque couleur, un `<path fill="couleur" fill-rule="evenodd" d="…Z">` concaténant tous ses contours ; en-tête `<svg viewBox="0 0 W H" width="Wmm" height="Hmm">` (mm). Y déjà flippé par `pxPathsToMm`.
  4. `exportSVG()` (remplace `exportDXF`) : occlusion → `ML.pxPathsToMm` par couleur → `writeSVG` → `download("pattern.svg", …, "image/svg+xml")`.
  5. **Retrait DXF** : supprimer `src/dxf.js` ; retirer son `<script>` de `index.html` ; supprimer `import-boundary` (DXF) ; brancher `import-motifs` sur `ML.parseSVG`+`buildMotifFromSVG` ; le contour reste via `import-svg` (`setBoundaryFromSVG`). Vérifier qu'aucune référence `parseDXF`/`writeDXF` ne subsiste (recherche globale).
- **Validation :**
  - auto : `node test/run.js` (réécrit en T6) → l'occlusion réduit la géométrie, en-tête SVG présent. En attendant T6 : `node --check src/app.js src/geometry.js` + recherche `grep -rn "parseDXF\|writeDXF\|dxf" src/ index.html` → **aucun** résultat.
  - visuel : **OBLIGATOIRE** — composer 2 motifs qui se chevauchent, exporter `pattern.svg`, l'ouvrir : les surfaces masquées n'apparaissent pas, trous respectés.
- **Si bloqué :** si l'occlusion de surfaces produit des artefacts (slivers), **STOP** et signale avant de bricoler des tolérances. Ne supprime `src/dxf.js` qu'une fois `import-motifs` rebranché et testé.
- **Commit :** `feat(export): occlusion surfaces + export SVG couleur, retrait DXF`
- **Statut :** [x] fait · exécuté par : Sonnet · le : 2026-06-22 · commit : — (pas de repo git encore)

### T6 — Persistance projet + test headless en flux SVG · Modèle : Haiku
- **But :** sérialiser le nouveau modèle `zones` et réécrire `test/run.js` pour le flux SVG.
- **Lire :** `src/app.js` (`saveProject`, `loadProject`) ; `test/run.js` (entier) ; sorties T2/T5.
- **Modifier :** `src/app.js` (save/load), `test/run.js`. Supprimer le dernier script jetable `test/_svg_zones.js` (les deux autres ont déjà été retirés).
- **Hors périmètre :** ne change pas la géométrie ni l'UI.
- **Étapes :**
  1. `saveProject`/`loadProject` : les motifs portent désormais `zones` (pas `polylines`) ; vérifier que le JSON round-trip (save→load) reconstruit zones + silhouette + instances. Si `silhouette` n'est pas sérialisée, la recalculer au load via `ML.motifSilhouette`.
  2. `test/run.js` : charger `src/geometry.js` + `src/svg.js` ; lire des SVG (depuis `exemple motif/` : noiraude, link, majora) ; `buildZones` → `motifFill` ; placer 2-3 instances en chevauchement (translation) ; `occlude` surfaces ; `writeSVG` → `test/out_occluded.svg` ; logguer nb zones/contours avant/après + présence en-tête SVG.
  3. Supprimer les 3 scripts jetables `test/_*.js`.
- **Validation :**
  - auto : `node test/run.js` → écrit `test/out_occluded.svg`, log « réduction si chevauchement », en-tête `viewBox` présent.
  - visuel : ouvrir `test/out_occluded.svg` (optionnel).
- **Si bloqué :** si un ancien `projet.mlayout.json` (format `polylines`) est chargé, ne pas planter : ignorer/loguer (pas de migration demandée). Si bloquant, STOP.
- **Commit :** `refactor(test+persist): flux SVG, modèle zones, retrait scripts jetables`
- **Statut :** [x] fait · exécuté par : Sonnet · le : 2026-06-22 · commit : — (pas de repo git encore)

### T7 — Mise à jour du contexte · Modèle : Sonnet
- **But :** refléter la nouvelle architecture dans la doc projet.
- **Lire :** `SPEC.md`, `PROJECT_MAP.md`, `STATUS.md`, `PROJECT_BRIEF.md`, `CLAUDE.md` (sections DXF) ; `DECISIONS.md §D-004` (déjà écrit).
- **Modifier :** `SPEC.md`, `PROJECT_MAP.md`, `STATUS.md` ; `PROJECT_BRIEF.md`/`CLAUDE.md` **seulement** si une mention DXF y devient fausse.
- **Hors périmètre :** ne pas réécrire les décisions (D-004 fait foi).
- **Étapes :**
  1. `SPEC.md` : remplacer la section I/O DXF par I/O **SVG** (modèle zones, régions, evenodd, export `pattern.svg`) ; mettre à jour l'arborescence (plus de `dxf.js`).
  2. `PROJECT_MAP.md` : Feature 1 devient « I/O SVG » ; corriger les pointeurs `parseDXF/writeDXF` → `parseSVG/buildZones/motifFill/writeSVG`.
  3. `STATUS.md` : nouvelle phase (« Phase 2 — pipeline SVG + zones »), ce qui marche / reste.
  4. Vérifier qu'aucun fichier de contexte ne reste **faux** sur le DXF.
- **Validation :** auto : `grep -rn "DXF\|dxf" SPEC.md PROJECT_MAP.md` → ne subsiste que des mentions historiques explicitement datées. visuel : —
- **Si bloqué :** si une mention DXF est ambiguë (historique vs actuelle), la dater plutôt que la supprimer.
- **Commit :** `docs: contexte aligné sur la pipeline SVG (D-004)`
- **Statut :** [x] fait · exécuté par : Sonnet · le : 2026-06-22 · commit : — (pas de repo git encore)

---

## Lot 2 — Décor / Personnage / Symbole

> **Ne démarre qu'après T7** (s'appuie sur le flux SVG, l'occlusion par surface et `writeSVG` de T5, et le test SVG de T6).

### Contexte / décision clé — `DECISIONS.md §D-005` (à lire en entier avant de coder)

Modèle figé par Opus, ne pas reconcevoir :

- **3 rôles**, portés par le **motif de bibliothèque** : `role ∈ {PERSONNAGE, SYMBOLE, DECOR}`, plus `color` (couleur focale d'export) et `margin` (mm, marge de dégagement du décor). Tous éditables après import.
- **Défauts par rôle** : `PERSONNAGE {color:"#000000", margin:2}` (halo → posé sur) · `SYMBOLE {color:"#c62828", margin:0}` (à fleur → gravé dans) · `DECOR {color:"#1565c0", margin:0}`. À l'export → 3 couleurs `fill` = **3 calques Falcon** réglables (cf. D-004).
- **Le décor est un élément ordinaire de la pile** (z-order normal, sélectionnable, déplaçable/orientable comme un motif). Il n'est PAS forcé en bas.
- **Occlusion** — chaque instance a :
  - `occluder` = forme qui masque ce qui est **dessous** : `silhouette` pour un motif, **`motifFill` (surface réelle, avec ses vides)** pour le décor.
  - `decorClear` = `silhouette` **élargie de `margin`** (offset Clipper positif) ; sert UNIQUEMENT à dégager le décor.
  - Règle de visibilité, du **haut vers le bas** : `visible_i = surface_i − union( maskFor(j, i) )` pour chaque `j` au-dessus de `i`, avec `maskFor(j, i) = (i est DECOR) ? decorClear_j : occluder_j`.
  - Conséquences automatiques : motif **sous** le décor → masqué par le `motifFill` du décor = **caché derrière**, visible dans les vides · personnage **au-dessus** (margin>0) → dégage le décor avec halo = **posé sur** · symbole au-dessus (margin=0) → dégage à fleur = **gravé dans**.
- **Rendu écran** : le décor se dessine **sans fond silhouette blanc** (seulement ses surfaces colorées) → les vides laissent voir les motifs placés dessous. Les motifs normaux gardent leur fond blanc (sticker). La marge halo n'est **pas** rendue à l'écran — effet visible seulement à l'export (limitation v1 assumée).

### T8 — Modèle rôle/couleur/marge + imports SVG par rôle (data + boutons) · Modèle : Sonnet
- **But :** ajouter `role`/`color`/`margin` au motif et offrir 3 imports SVG distincts (personnages, symboles, décor) appliquant les défauts du rôle.
- **Lire :** `app.js` (`buildMotifFromSVG` ~L77-95, `addMotifToLibrary`, câblage import ~L478-500) ; `index.html` section « Motifs » (L17-23) ; `DECISIONS.md §D-005`.
- **Modifier :** `src/app.js`, `index.html`.
- **Hors périmètre :** pas le rendu couleur (T9), pas l'inspecteur (T10), pas l'occlusion/export (T11).
- **Étapes :**
  1. Constante `ROLE_DEFAULTS = { PERSONNAGE:{color:"#000000",margin:2}, SYMBOLE:{color:"#c62828",margin:0}, DECOR:{color:"#1565c0",margin:0} }`.
  2. `buildMotifFromSVG(name, parsed, role)` : poser `motif.role`, `motif.color`, `motif.margin` depuis `ROLE_DEFAULTS[role]` (défaut `PERSONNAGE` si non fourni).
  3. `index.html` : dans « Motifs », remplacer l'unique import par **deux** boutons SVG — `#import-perso` (« Importer personnages… », `accept=".svg" multiple`) et `#import-symbole` (« Importer symboles… », `accept=".svg" multiple`). Ajouter une section **« Décor »** avec `#import-decor` (« Importer décor… », `accept=".svg"`).
  4. Câbler les 3 inputs : perso → `buildMotifFromSVG(base, parseSVG(text), "PERSONNAGE")` ; symbole → `"SYMBOLE"` ; décor → `"DECOR"`. Conserver le clic-pour-poser depuis la bibliothèque (identique aux motifs) pour les trois.
- **Validation :**
  - auto : `node --check src/app.js`.
  - visuel : **OBLIGATOIRE** — les 3 boutons sont présents ; importer un SVG via « personnages » crée une vignette dans la bibliothèque.
- **Si bloqué :** si le câblage import de T5 a une autre signature que `buildMotifFromSVG(base, parseSVG(text))`, **adapte l'appel** sans changer la logique de T5 ; si `parseSVG` n'existe pas (T5 non faite), **STOP**.
- **Commit :** `feat(app): rôles perso/symbole/décor + imports SVG par rôle`
- **Statut :** [x] fait · exécuté par : Sonnet · le : 2026-06-22 · commit : — (pas de repo git encore)
  - **Bug bloquant trouvé et corrigé en cours de route** (hors périmètre nominal mais nécessaire pour la validation visuelle OBLIGATOIRE) : `buildMotifFromSVG` calculait le centre via `Math.min(...xs)/Math.max(...xs)` (spread) — plante en `RangeError: Maximum call stack size exceeded` sur un SVG de décor à 549 090 points (`exemple motif/Decor/decor hybride.svg`). Remplacé par un helper `minMax()` en boucle (sans spread), appliqué aussi dans `drawThumb` (T9). Reste un point de **performance non corrigé** (hors périmètre, à signaler à Opus) : `ML.buildZones` prend ~35-40s sur ce même fichier (3936 sous-chemins) — gèle l'onglet pendant l'import mais ne plante pas.

### T9 — Rendu écran par couleur focale + décor « see-through » · Modèle : Sonnet
- **Pourquoi ce modèle :** rendu Konva (sceneFunc/evenodd) + validation visuelle.
- **But :** rendre chaque instance dans sa **couleur focale** (`motif.color`) et le **décor sans fond silhouette blanc** (vides transparents) ; vérifier qu'il participe au z-order.
- **Lire :** `app.js` (`makeGroup` ~L133-155, `drawThumb` ~L116-125, usage `ML.motifFill`) ; `DECISIONS.md §D-005`.
- **Imiter :** le `sceneFunc`+`fill("evenodd")` déjà en place dans `makeGroup`.
- **Modifier :** `src/app.js`.
- **Hors périmètre :** pas l'occlusion d'export (T11), pas l'inspecteur (T10).
- **Étapes :**
  1. Helper `exportFill(motif)` : si `motif.color` défini → fusionner **toutes** les surfaces REMPLI (`ML.motifFill(motif.zones)`, toutes couleurs confondues) sous une seule clé `{ [motif.color]: [...contours...] }` ; sinon renvoyer `ML.motifFill(motif.zones)` tel quel.
  2. `makeGroup` : utiliser `exportFill(motif)` pour les couleurs. Si `motif.role === "DECOR"` → **ne pas** dessiner le fond silhouette blanc opaque (le sauter) ; sinon le garder.
  3. `drawThumb` : même logique (couleur focale ; décor sans fond blanc).
  4. Vérifier que rien ne force le décor en bas du z-order (les boutons `[`/`]` et ▲/▼ doivent le déplacer comme un motif).
- **Validation :**
  - auto : `node --check src/app.js`.
  - visuel : **OBLIGATOIRE** — importer un décor (bleu) + un personnage (noir) ; glisser le perso **sous** le décor → il apparaît dans les vides du décor ; le remonter **au-dessus** → il masque le décor.
- **Si bloqué :** si `motifFill` mêle plusieurs couleurs et que la fusion casse l'`evenodd` (trous remplis), **STOP** et signale (ne pas bricoler les orientations).
- **Commit :** `feat(app): rendu couleur focale + décor see-through (z-order)`
- **Statut :** [x] fait · exécuté par : Sonnet · le : 2026-06-22 · commit : — (pas de repo git encore) — validé visuellement (Playwright) : perso noir+fond blanc, symbole rouge+fond blanc, décor bleu sans fond blanc, z-order perso/décor (devant/derrière) confirmé sur l'ordre des nœuds Konva.

### T10 — Inspecteur : éditer rôle / couleur / marge par motif · Modèle : Sonnet
- **But :** depuis la sélection, changer `role`, `color`, `margin` de l'élément, avec re-rendu.
- **Lire :** `app.js` (`select()`, section `#inspector`, re-render d'instances) ; `index.html` `#inspector` (L59-74) ; `src/style.css` ; `DECISIONS.md §D-005`.
- **Modifier :** `src/app.js`, `index.html`, `src/style.css`.
- **Hors périmètre :** pas d'édition géométrique des zones ; pas l'export.
- **Étapes :**
  1. `index.html` `#inspector` : ajouter un `<select>` rôle (Personnage/Symbole/Décor), un `<input type="color">` couleur, un `<input type="number">` marge (mm, `step=0.5 min=0`).
  2. `select(g)` : peupler ces champs depuis le `motif`. À chaque changement : mettre à jour `motif.role/color/margin`. **Changer le rôle réapplique les défauts** `ROLE_DEFAULTS[role]` (couleur + marge) ; changer couleur/marge seuls = override conservé.
  3. Après tout changement : re-rendre **toutes** les instances de ce motif + la vignette.
  4. `margin` reste stocké en **mm** sur le motif (conversion px à l'export, T11).
- **Validation :**
  - auto : `node --check src/app.js`.
  - visuel : **OBLIGATOIRE** — passer un symbole → personnage applique couleur noire + marge 2 ; saisir une couleur custom tient ; la vignette suit.
- **Si bloqué :** si plusieurs instances partagent le motif, re-render toutes (pas de cache). Toute hésitation UI → STOP.
- **Commit :** `feat(app): inspecteur rôle/couleur/marge par motif`
- **Statut :** [x] fait · exécuté par : Sonnet · le : 2026-06-22 · commit : — (pas de repo git encore) — validé visuellement (Playwright) : bascule SYMBOLE→PERSONNAGE réapplique bien couleur #000000 + marge 2 (rendu instance + vignette recolorés), couleur custom saisie tient après un changement de marge seul.

### T11 — Occlusion décor (posé/gravé/caché) + export multi-couleur + test · Modèle : Sonnet
- **Pourquoi ce modèle :** cœur géométrique (occlusion, offset Clipper) + export ; validation `node test/run.js`.
- **But :** étendre l'occlusion au décor selon la règle D-005, exporter toutes les couleurs (décor inclus), et couvrir le cas en headless.
- **Lire :** `src/geometry.js` (`ML.occludeSurfaces` de T5, `ML.insetPolygon`/`ClipperOffset`, `clipBy`) ; `src/app.js` (`instancesBottomToTop`, `exportSVG` de T5) ; `test/run.js` (flux SVG de T6) ; `DECISIONS.md §D-005`.
- **Modifier :** `src/geometry.js`, `src/app.js`, `test/run.js`.
- **Hors périmètre :** pas l'UI (T8-T10).
- **Étapes :**
  1. `ML.offsetPolygon(pts, deltaPx)` : offset **positif** (élargir) réutilisant le `ClipperOffset` arrondi déjà employé par `ML.insetPolygon` (delta>0). **Ne pas réécrire** la mécanique Clipper — factoriser/réutiliser celle d'`insetPolygon`.
  2. `instancesBottomToTop()` : pour chaque instance, fournir `{ role, color, fill, silhouette, margin }` (px), où `fill` = surfaces de `exportFill(motif)` mappées par `getAbsoluteTransform`, `silhouette` mappée, `margin` = `motif.margin × PX_PER_MM`. Calculer `occluder = role==="DECOR" ? fill : silhouette` et `decorClear = ML.offsetPolygon(silhouette, margin)`.
  3. `ML.occludeSurfaces` : remplacer la soustraction haut→bas par la règle D-005 — `visible_i = fill_i − union( maskFor(j,i) )` pour `j` au-dessus, `maskFor(j,i) = (instance_i.role==="DECOR") ? decorClear_j : occluder_j`. **Conserver** le clip `boundary` final + la soustraction des zones interdites (`reservedPolys`).
  4. `exportSVG()` : regrouper la géométrie visible **par couleur** (couleur décor incluse) → `ML.writeSVG` multi-couleur (T5).
  5. `test/run.js` : ajouter un cas décor — 1 décor + 1 perso au-dessus (margin>0) + 1 perso en dessous ; asserter : surface décor réduite sous le perso du dessus (halo), perso du dessous réduit par le `motifFill` du décor. Logguer avant/après.
- **Validation :**
  - auto : `node test/run.js` → réductions attendues, en-tête SVG, ≥1 couleur supplémentaire (décor).
  - visuel : **OBLIGATOIRE** — exporter `pattern.svg` : 3 couleurs ; perso posé = halo autour, symbole = à fleur, perso caché = tronqué par les branches du décor.
- **Si bloqué :** si l'occlusion produit des slivers ou si l'offset Clipper dégénère (marge trop grande), **STOP** et signale avant de bricoler des tolérances.
- **Commit :** `feat(export): occlusion décor (posé/gravé/caché) + export multi-couleur + test`
- **Statut :** [x] fait · exécuté par : Sonnet · le : 2026-06-22 · commit : — (pas de repo git encore)
  - **Bug bloquant trouvé et corrigé en cours de route** (hors périmètre nominal mais nécessaire pour la
    validation) : `clipBy` (geometry.js, écrite en T5) soumettait chaque contour du sujet **indépendamment**
    à son propre `Clipper.Execute`. Pour un sujet multi-contours avec trous (sortie de `ML.motifFill`,
    où un trou est encodé par une **aire signée négative** relative à ses contours sœurs), ce découpage
    par contour isolé détruit cette relation d'orientation : un trou ressort avec un signe d'aire **inversé**
    (donc « rempli » au lieu de « soustrait ») dès qu'il traverse `clipBy` — démontré avec un masque qui ne
    touche même pas le contour (no-op géométrique, le signe s'inverse quand même). Bug latent depuis T5,
    affectant potentiellement toute occlusion d'un motif à trous (Lot 1 compris), révélé en validant
    l'occlusion décor (aires avant/après incohérentes). **Fix** : `clipBy` soumet maintenant tous les
    contours du sujet **en une seule fois** (`AddPaths` au lieu d'une boucle de `AddPath` + `Execute` par
    contour) — un seul `Execute` par appel, qui préserve la règle `pftNonZero` entre contours sœurs. Pas de
    réécriture de la mécanique Clipper (même `ClipType`/`PolyFillType`), juste un seul sujet batché au lieu
    d'un sujet par contour. Ajouté `ML.signedArea` (alias de l'`area()` interne déjà existante) pour permettre
    aux validations de sommer une aire nette (trous en négatif) sans réécrire de helper.
  - **Étape 5 (cas décor `test/run.js`) durcie au-delà du minimum demandé** : en plus des réductions et de
    l'en-tête SVG, deux preuves numériques ajoutées (avant/après comparé à une variante sans marge, et à une
    variante où le décor occulte par sa silhouette au lieu de sa surface réelle) pour prouver concrètement le
    halo et le passage par les vides — pas juste une réduction quelconque.
  - Validé visuellement (Playwright) : scène décor (majora, bleu) + perso posé (noiraude, noir, margin 2 →
    halo blanc visible autour) + symbole (pacman, rouge, margin 0 → flush) + perso cliché en dessous (link,
    visible seulement par un éclat à travers une fente du décor) ; export `pattern.svg` contient les 3
    couleurs attendues.
  - Note : les chemins `exemple motif/Motifs SVG/{Personnages,Symboles}/...` ont été réorganisés en cours de
    session par Thibault vers `exemple motif/{Personnages,Symboles}/...` ; `test/run.js` a été mis à jour
    vers les nouveaux chemins.

### T12 — Contexte : documenter le décor · Modèle : Haiku
- **But :** refléter le Lot 2 dans la doc projet.
- **Lire :** `SPEC.md`, `PROJECT_MAP.md`, `STATUS.md` ; `DECISIONS.md §D-005` (déjà écrit).
- **Modifier :** `SPEC.md`, `PROJECT_MAP.md`, `STATUS.md`.
- **Hors périmètre :** ne pas réécrire les décisions (D-005 fait foi).
- **Étapes :**
  1. `SPEC.md` : ajouter une section « Décor / rôles » (3 rôles, occlusion posé/gravé/caché, 3 couleurs = 3 calques Falcon).
  2. `PROJECT_MAP.md` : citer les nouveaux imports + `exportFill`/`offsetPolygon`/règle `maskFor`.
  3. `STATUS.md` : marquer le Lot 2 fait, ce qui reste (limitation halo non rendue à l'écran).
- **Validation :** auto : `node --check src/app.js src/geometry.js`. visuel : —
- **Si bloqué :** rien de bloquant ; si une section devient ambiguë, dater plutôt que supprimer.
- **Commit :** `docs: contexte décor/rôles (D-005)`
- **Statut :** [ ] à faire · exécuté par : — · le : — · commit : —

## Dépendances / ordre

```
Lot 1 (SVG) :  T1 → T2 → T3 → T4
                         T2 → T5 (après T3)
               T3,T4,T5 → T6 → T7
Lot 2 (décor): T7 → T8 → T9 → T10 → T11 → T12   (T11 dépend de T5+T6)
```
Lot 1 — T1 d'abord (parser). T2 dépend de T1. T3 et T5 dépendent de T2 ; T5 après T3.
T4 après T3. T6 après T3/T5. T7 en dernier.
Lot 2 — ne démarre qu'après T7. T8→T9→T10→T11→T12 dans l'ordre ; T11 réutilise
`occludeSurfaces`/`writeSVG` (T5) et le test SVG (T6).

## Après le lot — mise à jour du contexte (obligatoire)

- [ ] **PLAN** : chaque tâche faite → `[x]` + exécuté par / le / commit.
- [ ] **STATUS.md** : état réel (Lot 1 en T7, Lot 2 en T12).
- [ ] **Autres fichiers de contexte** modifiés : `DECISIONS.md` (D-004 + D-005, déjà), `SPEC.md`, `PROJECT_MAP.md` (T7 + T12), `PROJECT_BRIEF.md`/`CLAUDE.md` si DXF devenu faux.
- [ ] **Vérifier qu'aucun fichier de contexte n'est devenu faux** (mentions DXF).
- [ ] Commits atomiques par tâche ; push en fin de session.
