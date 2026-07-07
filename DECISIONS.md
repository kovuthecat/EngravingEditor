# DECISIONS.md

Journal des décisions techniques et produit.

## Format recommandé

```md
## YYYY-MM-DD — Titre de la décision
### Décision
### Contexte
### Alternatives envisagées
### Raison du choix
### Conséquences
### Impact IA (optionnel)
```

---

## Décisions

## 2026-06-21 — D-001 : Pas de génération IA, vectorisation manuelle en DXF

### Décision
Abandonner la génération par IA des motifs. Thibault dessine/vectorise lui-même chaque motif et fournit des **DXF**.

### Contexte
Idée initiale : générer le pattern via ChatGPT/DALL·E. Crainte de refus copyright (persos sous licence).

### Alternatives envisagées
- A : IA pure (style infidèle, raster, seamless raté, refus copyright).
- B : collage des vrais motifs vectorisés (retenu).
- C : hybride IA pour fillers.

### Raison du choix
L'IA est inadaptée techniquement (raster ≠ trait laser, tuile non fiable) et bloquée par le copyright. Thibault a déjà ~36 doodles dessinés → la tâche réelle est l'**assemblage**, pas la génération.

### Conséquences
L'outil prend des DXF en entrée ; pas de module de génération ni de vectorisation intégrée.

## 2026-06-21 — D-002 : App web pure sans build (Konva + Clipper)

### Décision
Construire un éditeur web mono-page, **sans build ni framework**, libs vendored : **Konva.js** (canevas/édition) + **Clipper** (booléen). Ouverture en `file://`.

### Contexte
Besoin d'une édition manuelle ergonomique (poignées rotation/échelle, z-order). Comparé : Qt (PySide6), web, intégration dans laser-tools (Tkinter).

### Alternatives envisagées
- Qt/PySide6 : robuste (ezdxf/Shapely) mais poignées à recoder, build séparé.
- Intégrer à laser-tools (Tkinter) : max réutilisation mais édition interactive laborieuse.
- Web : libs canevas (Konva/Fabric) les plus ergonomiques pour manipuler des objets.

### Raison du choix
Thibault a priorisé l'**ergonomie d'édition** et accepte de sortir de Python. Le « sans build » rend l'outil immédiat (double-clic). Risque DXF maîtrisé en reprenant la logique mm de laser-tools.

### Conséquences
JS « classic script » obligatoire (pas d'ES modules). Globals : `window.ML`, `Konva`, `ClipperLib`. Tests headless via Node.

### Impact IA
Contrainte structurante : ne pas introduire de modules/bundler. 4 fichiers source seulement.

## 2026-06-21 — D-003 : Occlusion « autocollant », silhouette = contour extérieur

### Décision
Modèle d'occlusion opaque : un motif au-dessus masque ce qui est dessous (pas de see-through). La **silhouette opaque** d'un motif = son **plus grand contour fermé** (fallback : enveloppe convexe).

### Contexte
Thibault veut que la partie chevauchée d'un motif ne soit plus visible. Options de silhouette proposées : contour exact / contour + marge / boîte / réglable.

### Raison du choix
Le contour extérieur donne un rendu « autocollant découpé » au plus près du trait. À l'export, on soustrait (Clipper) les silhouettes supérieures → le DXF ne contient que les traits visibles (gravure nette, sans lignes fantômes).

### Conséquences
Chaque motif doit avoir un contour extérieur fermé pour une silhouette propre ; sinon fallback convexe (moins fin). Marge blanche « sticker » = piste v1.

### Impact IA
Toute modif de l'occlusion passe par `node test/run.js` (+ rendu PNG de contrôle).

## 2026-06-22 — D-004 : Pipeline SVG only, motifs en zones REMPLI/VIDE, export SVG couleur+evenodd

### Décision
Basculer toute la pipeline sur le **SVG** : import des motifs ET du contour table en SVG (retrait
total du DXF, **entrée et sortie**). Un motif est décomposé en **zones** (sous-chemins), chacune
avec un rôle **REMPLI** ou **VIDE** (2 états). L'export produit un **SVG couleur** (une couleur de
`fill` par groupe), surfaces trouées via `fill-rule="evenodd"`, en mm.

### Contexte
Les exports réels de Thibault sont des SVG Inkscape **mono-couleur noir** : un seul `<path>` dont
les trous (yeux, évidements) sont des sous-chemins imbriqués gérés par fill-rule. Le DXF (splines
AutoCAD fragmentées) était plus pauvre et pénible (re-chaînage). L'outil de découpe utilisé est
**Falcon Design Space**.

### Tests décisifs (Falcon, 2026-06-22)
Variantes de `noiraude` importées dans Falcon (dossier `exemple motif/falcon-test/`) :
- **Falcon respecte `fill-rule:evenodd`** (yeux évidés rendus en bois) — validé jusqu'à
  64 sous-chemins / profondeur 6 (Majora).
- **Falcon sépare les calques par couleur de `fill`** (1 calque réglable par couleur).
- **fill vs stroke est ÉCARTÉ** : un `stroke` seul est mal interprété (rempli).
- Falcon génère en plus un calque « linéaire » (contour) par couleur : le **mode ligne vs
  remplissage appartient à Falcon**, choisi par calque — pas un rôle de zone.

### Alternatives envisagées
- Garder le DXF en entrée/sortie : rejeté (plus pauvre, et l'utilisateur veut le SVG couleur).
- 3ᵉ rôle « LIGNE » par zone : **rejeté** — sortir une zone sur une autre couleur la retire du
  path evenodd parent → Falcon remplit par-dessus et le trou disparaît. Le tracé au trait se fait
  via le mode de calque Falcon, à géométrie identique ; un groupe traçable indépendamment =
  couleur dédiée à l'export.
- Trous via soustraction Clipper en amont pour l'affichage : inutile (evenodd respecté). Clipper
  reste pour l'occlusion entre motifs et le calcul des régions.

### Raison du choix
Colle au format réel des fichiers, au comportement vérifié de Falcon, et au vocabulaire de
l'utilisateur (« zones remplies / vides »). Modèle simple à 2 états, extensible au multi-couleur
(ex. Spyro) sans cas particulier.

### Conséquences
- **Modèle motif** : `{ id, name, zones:[{id, pts, role:"REMPLI"|"VIDE", color, parent, depth}],
  silhouette }` (remplace `polylines`). Ordre document = z-order intra-motif.
- **Détection trous** : parent = plus petit contenant **de la même couleur** ; rôle par défaut
  alterne avec la profondeur (pair = REMPLI, impair = VIDE).
- **Surface gravée d'un motif** : union des **régions** REMPLI, où région(S) = contour S − union de
  ses enfants directs (Clipper). = « remplir jusqu'au sous-ensemble suivant » de Falcon.
- **Occlusion** : inchangée dans le principe (soustraire les silhouettes au-dessus) mais opère
  désormais sur des **surfaces pleines** ; silhouette = union des contours les plus extérieurs
  (sticker opaque, trous inclus).
- **Suppression** : `src/dxf.js` (parse + write), import DXF motifs/contour. Un trou reste
  toujours sur la couleur de sa zone parente (ne pas le déplacer seul).
- **Export** : `pattern.svg` (couleur+evenodd, mm) au lieu de `pattern.dxf`.

### Impact IA
Plan d'exécution : `PLAN.md`. Toute modif géométrique (régions, occlusion, export) passe par
`node test/run.js` réécrit en flux SVG + contrôle visuel via `exemple motif/falcon-test/`.

## 2026-06-22 — D-005 : Décor + rôles (DECOR / PERSONNAGE / SYMBOLE), occlusion par z-order et marge

### Décision
Introduire un **décor** (SVG de fond, ex. circuit + végétation) sur lequel se posent les motifs, et
**3 rôles** portés par le motif de bibliothèque : `role ∈ {PERSONNAGE, SYMBOLE, DECOR}`, chacun avec
une **couleur focale** (`color`) et une **marge de dégagement** (`margin`, mm), tous éditables.
Le rendu « posé sur / gravé dans / caché derrière » découle de **deux leviers seulement** :
le **z-order** (au-dessus / en dessous du décor) et la **marge**.

### Contexte
Thibault génère une image de décor et veut : (1) deux lignes d'upload distinctes (personnages,
symboles) appliquant directement les bons paramètres, (2) une couleur distincte par catégorie pour
régler séparément le laser, (3) des personnages **posés sur** le décor (sur une branche), des
symboles **gravés dans** le décor (dans un tronc), et (4) pouvoir **glisser un motif derrière** le
décor (personnage caché derrière un tronc). Cadre : D-004 (1 couleur `fill` = 1 calque Falcon).

### Décision technique
- **Défauts par rôle** : `PERSONNAGE {#000000, margin:2}` · `SYMBOLE {#c62828, margin:0}` ·
  `DECOR {#1565c0, margin:0}`. 3 couleurs → 3 calques Falcon réglables.
- **Le décor est un élément ordinaire de la pile** (z-order, sélectionnable, déplaçable/orientable).
- **Occlusion** : chaque instance a `occluder` = ce qui masque dessous (`silhouette` pour un motif,
  **`motifFill` réel avec ses vides** pour le décor) et `decorClear` = `silhouette` élargie de
  `margin`. Règle haut→bas : `visible_i = surface_i − union(maskFor(j,i))` pour `j` au-dessus, avec
  `maskFor(j,i) = (i est DECOR) ? decorClear_j : occluder_j`.
  → sous le décor = **caché derrière** (visible dans les vides) ; au-dessus margin>0 = **posé sur**
  (halo) ; au-dessus margin=0 = **gravé dans** (à fleur, pas de double passage laser).

### Alternatives envisagées
- Deux comportements codés en dur (posé vs gravé) : rejeté — le z-order + une marge suffisent et
  unifient le tout (un même perso peut être posé OU caché sans changer de réglage).
- Décor occultant par sa **silhouette** (sticker opaque) : rejeté — masquerait tout derrière lui ;
  on veut voir les motifs **dans les vides** entre branches → occlusion par `motifFill` réel.
- Décor figé en couche du bas : rejeté — empêche « caché derrière ».

### Conséquences
- Modèle motif enrichi : `+ role, color, margin`. Imports SVG par rôle (2 boutons motifs + 1 décor).
- `geometry.js` : `offsetPolygon` (offset positif, réutilise `insetPolygon`) + règle `maskFor` dans
  l'occlusion par surface. Rendu écran : décor **sans** fond silhouette blanc (vides transparents).
- **Limitation v1 assumée** : le halo (marge) n'est pas rendu à l'écran, seulement à l'export.
- **Dépend du Lot 1 (D-004) terminé** : s'appuie sur `motifFill`/`silhouette`, l'occlusion par
  surface et `writeSVG` (T5). Tâches : `PLAN.md` Lot 2 (T8-T12).

### Impact IA
Toute modif de l'occlusion (règle `maskFor`, offset marge) passe par `node test/run.js` (cas décor
ajouté en T11) + contrôle visuel de l'export `pattern.svg`.

## 2026-06-22 — D-006 : Import calibré (orientation + plafond d'échelle), usage tablette (tactile + hébergement), édition au stylet (surface éditable par motif)

### Décision
Trois chantiers groupés (Lot 3, `PLAN_tablette_edition.md`) :

1. **Import calibré** des motifs : (a) **ne plus flipper l'axe Y** à l'import (`buildMotifFromSVG`) —
   SVG et écran sont tous deux en y-bas, le flip héritait du DXF (y-haut) et posait les motifs **tête en
   bas** par rapport au contour ; (b) **plafond d'échelle** à l'ajout — un motif normal
   (PERSONNAGE/SYMBOLE) tient au **maximum dans 1/10** du bbox du contour, le **décor au maximum dans 1/1**
   (= `decorFit` actuel ≈0,92, inchangé). Le plafond ne fait que **réduire** (jamais agrandir) et ne
   s'applique qu'à un ajout manuel (pas au packing ni au chargement de projet, qui fournissent l'échelle).

2. **Usage tablette** : (a) **tactile** — pinch-to-zoom + pan **deux doigts**, `touch-action:none` sur le
   canevas, poignées/boutons agrandis, sidebar repliable (layout responsive) ; le dessin au doigt/stylet
   (un point) ne doit PAS paner la vue (pan réservé à deux doigts en mode édition). (b) **accès** =
   **hébergement statique en ligne** (Netlify/Vercel/GitHub Pages) → une URL ouverte dans le navigateur de
   la tablette. L'app reste sans build (fichiers statiques tels quels) ; le `file://` tablette est écarté
   (peu praticable sur iPad). Méthode documentée dans le README.

3. **Édition au stylet** : mode d'édition verrouillé sur le motif sélectionné, outils **pinceau**
   (ajoute de la matière) et **gomme** (en retire), épaisseur réglable. Le tracé du stylet devient un
   **polygone** (offset Clipper de la polyligne, bouts/joints arrondis) **unionné** (pinceau) ou
   **soustrait** (gomme) à la **surface éditable du motif**.
   - **Portée = le motif** (toutes ses instances), cohérent avec l'éditeur de rôles de zones existant
     (`rerenderMotif` re-rend toutes les copies + la vignette). Choix arrêté avec Thibault.
   - **Modèle** : champ optionnel `motif.surface = { [color]: [{pts,closed}] }` (px local, même repère que
     `zones`/`silhouette`). Quand il est présent, il **prime sur** la surface dérivée des zones partout :
     `exportFill`, rendu écran (`fillGroupContent`), vignette (`drawThumb`), export
     (`instancesBottomToTop`) et recalcul de `silhouette`. Il est **initialisé paresseusement** depuis
     `exportFill(motif)` (couleur focale fusionnée) au **premier** coup de stylet.
   - **Couleur** : les coups de stylet emploient la **couleur focale** du motif (clé unique). Un motif
     multi-couleur natif est donc aplati sur sa couleur focale dès la première édition (déjà le cas au rendu
     via `exportFill` — limitation assumée).
   - **Silhouette/occlusion** : après chaque coup, `silhouette` est **recalculée** depuis la surface
     éditée (contour extérieur, trous inclus) pour que l'occlusion « sticker » et le fond blanc restent
     cohérents. Le décor reste see-through (occulte par sa surface réelle, cf. D-005).
   - **Verrouillage** : en mode édition, `stage.draggable=false`, les clics ne changent pas la sélection
     (on reste sur le motif), le pan se fait à **deux doigts** (réutilise le tactile du chantier 2). Sortie
     explicite du mode → comportement normal restauré.

### Contexte
Retours de Thibault : (1) motifs importés « toujours beaucoup trop grands et souvent tête en bas » ;
(2) volonté d'utiliser l'outil **sur tablette** ; (3) volonté de **retoucher au stylet** décor et motifs
(effacer/dessiner) en **restant dans le motif sélectionné** pendant l'édition.

### Alternatives envisagées
- **Orientation** : compenser le flip ailleurs (export) plutôt qu'à l'import — rejeté : la cause est le
  `-y` d'import, le retirer aligne écran ET export (tous deux repassent par `pxPathsToMm`).
- **Plafond d'échelle** : agrandir aussi les petits motifs pour les normaliser — rejeté : « maximum 1/10 »
  est un plafond, on ne fait que réduire les trop-grands.
- **Édition par instance** (la copie posée seule) — rejeté avec Thibault : demande de dissocier la
  géométrie de l'instance du motif de bibliothèque (refonte d'état lourde) ; le besoin réel est de
  retoucher le motif, ses copies pouvant rester identiques. Réversible plus tard si besoin.
- **Édition raster** (peindre des pixels) — rejeté : sortie laser = vecteur ; on reste en polygones
  (booléens Clipper), cohérent avec tout le pipeline SVG.
- **Accès tablette en `file://`** (copier les fichiers) — rejeté : impraticable sur iPad, et casse les
  `fetch`/inputs selon le navigateur ; l'hébergement statique donne une URL stable.

### Conséquences
- `app.js` : import (flip retiré + plafond), tactile (multi-touch zoom/pan), mode édition stylet
  (état/verrouillage/outils/pointeur), lecture de `motif.surface` partout, persistance de `surface`.
- `geometry.js` : `ML.strokeToPolygon(pts, radiusPx)` (offset open-round Clipper), helpers
  d'union/différence de surface par couleur, recalcul de silhouette depuis une surface. **Toute modif
  géométrique passe par `node test/run.js`.**
- `index.html` / `style.css` : barre d'outils d'édition, sidebar repliable, cibles tactiles, `touch-action`.
- `README.md` : procédure d'hébergement statique pour la tablette.
- Persistance : `motif.surface` ajouté au JSON projet (absent = rendu par zones, rétro-compatible).

### Impact IA
Plan d'exécution : `PLAN_tablette_edition.md` (Lot 3). Géométrie (`strokeToPolygon`, union/différence,
silhouette) validée par `node test/run.js` + contrôle visuel ; le mode édition validé manuellement au
stylet/tactile. Le `file://` doit continuer de fonctionner en dev (pas d'ES modules introduits).

## 2026-06-23 — D-007 : Calques d'essai non destructifs (Appliquer/Jeter) + PNG orientation écran/SVG miroir

### Décision

Introduire **édition non destructive au stylet** et **dual-orientation export** : (1) **calque d'essai
(brouillon)** : chaque trait/forme pinceau/gomme mute un **brouillon temporaire**, rendu en **vert** sur
les instances du motif édité, sans modifier `motif.surface` (la surface réelle). Boutons **Appliquer**
(valide le brouillon = `motif.surface`) / **Jeter** (abandonne) / **Tout appliquer** (un coup). Un
brouillon peut rester **en attente** (session uniquement, non sérialisé) et être **restauré** au retour sur
ce motif. (2) **Divergence orientation export** : le **SVG garde son miroir vertical** (`pxPathsToMm`
inchangé, output pour laser), le **PNG sort en sens écran** (repère px direct, sans `-y`, pour aperçu/partage).

### Contexte

Thibault souhaitait tracer/retoucher librement sans peur de "casser" le motif au premier mauvais coup.
Lot 4 (`PLAN_edition_reactivite.md`, 2026-06-22) réorganise la pipeline édition autour de ce modèle
(T1 silhouette multi-contours, T2-T3 perf, T5 brouillons, T6-T8 outils, T9 PNG sens écran).

### Alternatives envisagées

- **Undo/redo par trait** : coûteux (recalcul silhouette/occlusion à chaque coup) + compliqué
  (backstack explosif). Rejeté.
- **Brouillons sérialisés** : persistance projet complexe (divergence load/save). Rejeté — session
  uniquement suffit avec le compteur « N essais » + avertissement export.
- **PNG = SVG à l'écran** : ignorerait le choix de Thibault (SVG pour machine, PNG pour partage).
  Rejeté — orientation diverge volontairement.

### Raison du choix

Le brouillon vert donne un **feedback immédiat** (retouche visible à l'écran) tout en **préservant la
version réelle**, et coûte 0 perf par frame (un seul re-render à la transition, vert baked au cache).
Dual-orientation export reflète deux usages distincts : laser (miroir) vs aperçu (écran).

### Conséquences

- **Édition** : `edit.draft` = brouillon local, `editDrafts` = map de brouillons en attente (session,
  non sérialisée) ; vert affiché via `fillGroupContent`/`drawThumb` si essai en attente.
- **Export** : SVG inchangé (miroir `pxPathsToMm` conservé) ; PNG nouveau repère écran (`canvas` direct),
  DPI réglable.
- **UI** : boutons Appliquer/Jeter (motif courant) + Tout appliquer (globaux) ; compteur « N essais
  en attente » ; avertissement/confirm à l'export si des essais non appliqués.
- **Outils** : pinceau/gomme + profils rond/plat (T6) ; ligne/rect/ellipse (T7) ; lasso
  déplacer/dupliquer/effacer (T8).
- **Perf** : silhouette **multi-contours** (chaque morceau d'un motif occulte séparément, T1),
  **hitFunc** sur surfaces (clic toute partie visible, T2), **cache Konva** des groupes (drag fluide,
  T3), **fusion calques** (5 au lieu de 6, T4) — tout le Lot 4.

### Impact IA

Plan `PLAN_edition_reactivite.md` (Lot 4). Toute modif géométrique (silhouette multi-contours, occlusion,
export) validée via `node test/run.js`. Édition au stylet et PNG validés manuellement en navigateur réel
ou tablette (validation visuelle explicitement sautée dans les tâches, report à Thibault).

## 2026-06-30 — D-008 : Bibliothèque de base inlinée + régénération auto par hook

### Décision

Embarquer une **bibliothèque de base** de motifs directement dans l'app (bundle JS inliné `src/builtin-motifs.js`,
chargé en `<script>`), source de motifs des dossiers `exemple motif/Personnages` (rôle PERSONNAGE) et
`exemple motif/Symboles` (rôle SYMBOLE). Tout motif de base peut être **masqué localement** (set persisté,
`state.hiddenBuiltins`) sans toucher au dépôt. Un motif de base édité est **promu en local** (passe
`builtin:false`) à la première mutation, alors sérialisé comme motif ordinaire (id stable `b:…` conservé).
La régénération du bundle est **automatisée** : hook pre-commit `tools/hooks/pre-commit` appelle
`node tools/build-builtin-motifs.js` et stage le résultat.

### Contexte

Lot 5 (`PLAN_bibliotheque-base-motifs.md`, 2026-06-30). Thibault voulait : (1) pouvoir proposer un lot
de motifs de base aux utilisateurs de l'app (sans import manuel) ; (2) les garder éditables localement
sans modifier le dépôt ; (3) rendre l'ajout/suppression des motifs de base transparent (commit/push
suffit, hook auto-régénère).

### Alternatives envisagées

- **Manifeste + fetch** (bundle trop gros pour bundler classique) : rejeté. `fetch` de fichiers locaux est
  bloqué en `file://`, mode visé pour le double-clic ; bundle JS inliné fonctionne partout (file://, http.server, Netlify).
- **Motifs versionnés dans le JSON projet** : rejeté. Complexe à maintenir ; les motifs de base sont des
  templates réutilisables, pas des instances. Matérialisation paresseuse (IntersectionObserver) rend
  l'inlining viable même avec ~132 motifs (~11,9 Mo compressés).
- **Édition promotionnée ↔ édition de copie** : édition qui mute le motif de bibliothèque partagé par toutes
  les instances (retenu) vs édition de la copie seule (inutile pour le besoin, trop d'état). Retenu :
  l'édition d'un motif de base crée une version locale privée.

### Raison du choix

L'inlining simplifie le déploiement (aucun fetch à l'init) et colle à l'usage « sans serveur ». L'automatisation
par hook élimine les sources d'erreur manuel (oubli de régénération avant commit). Le masquage local persistant
permet une expérience utilisateur lisse (bibliothèque complète au démarrage, chacun adapte à ses besoins).
La promotion locale à l'édition garde la géométrie du dépôt intacte tout en offrant les bénéfices d'une
édition locale.

### Conséquences

- **Génération du bundle** : `tools/build-builtin-motifs.js` (script Node, `fs` natif, zéro dépendance)
  scanne `exemple motif/Personnages` (93 motifs) et `exemple motif/Symboles` (39 motifs) → écrit
  `src/builtin-motifs.js = "window.ML_BUILTIN_MOTIFS = " + JSON..stringify([{id,name,role,svg},...])`.
- **Chargement** : `index.html` charge `<script src="src/builtin-motifs.js"></script>` avant `app.js`.
  `app.js` initialise `state.builtins = (window.ML_BUILTIN_MOTIFS || [])` et `state.hiddenBuiltins = new Set()`.
- **Affichage** : grilles bibliothèque (Personnages/Symboles) listent d'abord les motifs locaux, puis les
  built-ins non masqués. Vignettes dessinées paresseusement (IntersectionObserver) à la première visibilité.
- **Persistance** : `state.hiddenBuiltins` sérialisé dans le JSON projet (`projectData().hiddenBuiltins`).
  Motifs locaux filtrés (`state.motifs.filter(m => !m.builtin)`) à la sérialisation, les built-ins ne sont
  jamais persistés (rechargés du bundle à chaque session).
- **Édition** : à la première mutation (trait stylet, changement de rôle/couleur/marge) d'un built-in,
  `promoteIfBuiltin(motif)` passe `builtin=false` → le motif est dès lors sérialisé comme local.
  Son id `b:…` est conservé (stable). Au chargement, un motif local de cet id prime sur le built-in
  correspondant du bundle (pas de re-registration du built-in masqué).
- **Bouton « Restaurer la bibliothèque de base »** : efface `state.hiddenBuiltins` et re-rend les
  built-ins masqués. Utile pour recommencer.
- **Hook pre-commit** : `tools/hooks/pre-commit` (shell, +x) appelle `node tools/build-builtin-motifs.js`
  puis `git add src/builtin-motifs.js`. Script install : `tools/install-hook.sh` (Linux/macOS) et
  `tools/install-hook.bat` (Windows) configurent `git config core.hooksPath tools/hooks`.
- **Taille du bundle** : ~11,9 Mo (accepté). Diffs git lourds sur `src/builtin-motifs.js` (artefact
  généré) — attendu.

### Points de vigilance

- **`file://` + IntersectionObserver** : fallback acceptable si l'IO n'était pas supporté (matérialiser
  au clic seulement, vignette à l'affichage du `<details>`), mais tous les navigateurs le supportent en `file://`.
- **Collision d'ids** built-in vs local : préfixe `b:` + règle « local prime sur built-in » évitent les
  collisions implicites.
- **Édition multiples copie** : motifs de base partagés par toutes les instances ; une édition au stylet
  mute `motif.surface` de la version locale (sortie du built-in).

### Impact IA

Plan `PLAN_bibliotheque-base-motifs.md` (Lot 5). Validation geometry (T1 : nombre d'entrées) passée.
Validation visuelle (T2-T3 : affichage grille, masquage, édition/promotion) restant à faire par Thibault
(voir `PLAN §Validation`).

### Dépendances

T1 (générateur bundle) → T2 (intégration app) → T3 (édition/promotion) ; T1 → T4 (hook).
T2-T3-T4 → T5 (contexte).

## 2026-06-23 — D-008 : UX tablette édition (palette flottante, vert=delta, pression+plume)

### Décision

Quatre améliorations en une pour la **tablette + stylet** (Lot 1-4, `PLAN_ux_perf_edition.md`, 2026-06-23) :

1. **Perf décor** (`simplifySubpaths` : CleanPolygon 0,1mm), **import non bloquant** (overlay), 
   **fond silhouette en cache** (1 tracé/session), **debounce recache** (~150ms).

2. **Vert uniquement sur matière ajoutée** — au lieu d'afficher tout en vert, base = couleur réelle 
   + overlay vert = `draft − real` (matière ajoutée). Gomme = vrai trou (pas de vert ni de surlignage).

3. **Palette d'édition flottante** : déplacée du sidebar sur le canvas, visible seulement en édition. 
   **Sidebar se replie** automatiquement lors de l'entrée en édition, se ré-affiche à la sortie 
   (mémorisation de son état ouvert/fermé). **Sections `<details>` auto-repliées** en édition, 
   restaurées à la sortie. **Undo par trait** (pile ~30 snapshots) : `Ctrl+Z` contextuel en édition 
   → undo trait au lieu de undo global.

4. **Mode trait** : 3 boutons (Rond / Pression / Plume) + slider angle calligraphie (visible en Plume). 
   **Pression stylet** : largeur = slider × (0.25 + 0.75×pression). **Plume calligraphique** : 
   nib plat orienté balayé via Minkowski → épais perpendiculaire au nib, fin parallèle.

### Contexte

Lot 3 (`PLAN_tablette_edition.md`, D-006) introduisait l'édition au stylet (base). Retours de validation
par Thibault : (1) lenteur à l'import du gros décor (~14-16s) ; (2) tout le brouillon en vert vert
non discriminant (difficile de voir ce qui a été ajouté) ; (3) palette d'édition dans la sidebar peu
ergonomique sur petits écrans (collisions tactiles, sidebaw trop large) ; (4) manque de sensibilité
stylet (pression) et de traits expressifs (plume inclinée).

### Alternatives envisagées

- **Perf décor** : transformer les zones/fill/silhouette pour réduire les points (rejeté — c'est irréversible).
  Choix : simplifier SEULEMENT le décor à l'import, zéro impact sur les motifs normaux ; pinceau/gomme
  inchangés.

- **Vert global vs vert-delta** : vert global montrait le "halo" visuel du brouillon (acceptable) mais masquait
  la géométrie réelle dessous (mauvais). Rejeté — delta = **soustraction + superposition**.

- **Palette sidebar vs flottante** : sidebar surchargée sur tablette, fenêtres étroites inutilisables
  (touches chevauchavent). Palette flottante = gain d'espace + ergonomie tactile (petites icônes
  regroupées, pas d'scroll interminable).

- **Mode trait** : rond (existant) vs contour_seul / pot_de_peinture → rejeté. Pression + plume
  = deux axes de variabilité naturels au stylet (pression captée, angle capté/géométriquement prévisible).

### Raison du choix

Ces quatre améliorations surgissent de cas d'usage réels (Thibault en session). Elles convergent
sur un objectif : **édition au stylet sur tablette ergonomique et expressive** (perf ok, feedback clair,
interface adaptée, contrôle moteur). Les trois premières adressent les douleurs immédiates (lenteur,
clarté, layout) ; la quatrième ajoute du pouvoir moteur (pression + plume) sans complexity ajoutée
(interface simplement).

### Conséquences

- **Perf** : `ML.simplifySubpaths`, `#busy-overlay`, `editStaticGroup` + `editDraftGroup`, `recacheTimer`.
  Tests : `node test/run.js` OK (aucune géométrie de test touchée).
- **Rendu brouillon** : helpers `addedRegions(draft, real)`, trois points (`fillGroupContent`/`drawThumb`/`redrawEditLayer`).
- **UI** : nouveau wrapper `#stage-wrap`, `#edit-palette` frère du canvas, auto-show/hide en édition.
  Sélecteur `#mode-round/pressure/calli`, slider `#calli-angle`. Repliement `details[open]` mémorisé
  en `edit.reopenDetails`.
- **Édition** : pile `edit.history`, `pushStrokeSnapshot` (applyStroke/endShape/lasso) ; `undoStroke()` ;
  `edit.pressures` (pression/pt) ; `edit.strokeMode` et `edit.calliAngle` (remplacent `edit.profile`).
  Keydown : `Ctrl+Z` → `undoStroke()` si `edit.active`.
- **Géométrie** : `ML.variableStroke(pts, radii)` (disques + quads), `ML.calligraphicStroke(pts, width, angle)`
  (Minkowski nib). Validation geometry (`node test/run.js`) OK.
- **Rétro-compat** : `edit.profile` → `edit.strokeMode` (tous les modes mappent au rendu rond tant que T11/T12
  non branchés ; cette tâche les branche enfin).

### Validation

- Auto : `node test/run.js` ✓ (géométrie + helpers, sortie inchangée sur motifs de test).
- Smoke-test Node (`ML.calligraphicStroke` + `ML.variableStroke`) ✓.
- Visuelle : explicitement sautée (skip demandé par Thibault).

### Impact IA

Tous les 12 lots du plan marqués `[x]` (2026-06-23). Plan : `PLAN_ux_perf_edition.md` complète.
Mise à jour contexte (STATUS/DECISIONS/SPEC/PROJECT_MAP) + commit/push vers `main`.

### Conséquences
- **Édition** : `edit.draft` = brouillon local, `editDrafts` = map de brouillons en attente (session,
  non sérialisée) ; vert affiché via `fillGroupContent`/`drawThumb` si essai en attente.
- **Export** : SVG inchangé (miroir `pxPathsToMm` conservé) ; PNG nouveau repère écran (`canvas` direct),
  DPI réglable.
- **UI** : boutons Appliquer/Jeter (motif courant) + Tout appliquer (globaux) ; compteur « N essais
  en attente » ; avertissement/confirm à l'export si des essais non appliqués.
- **Outils** : pinceau/gomme + profils rond/plat (T6) ; ligne/rect/ellipse (T7) ; lasso
  déplacer/dupliquer/effacer (T8).
- **Perf** : silhouette **multi-contours** (chaque morceau d'un motif occulte séparément, T1),
  **hitFunc** sur surfaces (clic toute partie visible, T2), **cache Konva** des groupes (drag fluide,
  T3), **fusion calques** (5 au lieu de 6, T4) — tout le Lot 4.

### Impact IA
Plan `PLAN_edition_reactivite.md` (Lot 4). Toute modif géométrique (silhouette multi-contours, occlusion,
export) validée via `node test/run.js`. Édition au stylet et PNG validés manuellement en navigateur réel
ou tablette (validation visuelle explicitement sautée dans les tâches, report à Thibault).

## 2026-07-02 — D-009 : Verrou du décor + rafraîchir depuis PNG Procreate (vectorisation in-app)

### Décision
Deux fonctions décor (plan `plans/P6/`) :

1. **Verrou global du décor** : bascule `state.decorLocked` (booléen unique, pas par exemplaire). Quand
   actif, tous les exemplaires de rôle `DECOR` passent `node.listening(false)` (inertes au pointeur ; le
   clic **traverse** vers les motifs posés au-dessus). Gardes doublées dans `select()` et `enterEdit()`.
   Persisté dans le JSON projet, ré-appliqué au chargement et à chaque création d'exemplaire décor.
   **Aucun effet sur l'export** (verrou = UI/édition seulement).

2. **Rafraîchir le décor depuis un PNG** : import PNG (dessin Procreate) **vectorisé dans l'app** via
   `ImageTracer.js` (vendored), seuillage **sur l'alpha** → sortie bilevel mono-couleur (couleur focale
   décor) → `ML.parseSVG` → `buildMotifFromSVG(DECOR)`. Bouton **« Rafraîchir le décor »** qui **remplace
   la géométrie du décor existant sur place** (mute `zones`/`silhouette`, supprime `surface`, même
   `motif.id`, `rerenderMotif`) → tous les exemplaires **gardent** position/échelle/rotation/z-order (la
   transformation vit sur l'exemplaire). Re-sélection du fichier **à chaque** rafraîchissement.

### Contexte
Thibault : (1) déplace le décor par erreur pendant qu'il travaille les motifs → veut le figer ; (2)
retravaille souvent le décor sur iPad/Procreate (raster) et veut réinjecter la nouvelle version sans tout
replacer.

### Alternatives envisagées
- **Rafraîchir sans re-sélection (mémoriser le fichier)** : la seule voie « sans re-pick » côté web est la
  File System Access API (handle en IndexedDB) — **non supportée sur Safari iPad**, appareil principal de
  Thibault. Le `fetch` d'une URL fixe marcherait sur iPad mais impose une infra d'export/URL. **Écartés** au
  profit d'une **re-sélection à chaque fois** (universelle, un tap), choisie par Thibault.
- **Vectorisation hors app (Inkscape « Trace Bitmap ») + réimport SVG** : plus léger (aucune lib) mais casse
  le flux 100 % iPad. **Écarté** au profit de la **vectorisation in-app** (ImageTracer vendored), choisie par
  Thibault.
- **Décor raster gravé directement (niveaux de gris)** : incompatible avec le modèle d'occlusion vectoriel
  (posé sur / caché derrière / marge Clipper, cf. D-005). **Écarté** — le décor doit rester vectoriel.
- **Verrou par exemplaire** : le décor est en général unique ; un booléen global suffit et est plus simple.

### Raison du choix
`listening(false)` est le levier natif Konva exact pour « inerte mais laisse passer le clic ». La
vectorisation in-app garde toute la boucle sur l'iPad ; ImageTracer.js (fichier unique, zéro dépendance)
respecte la contrainte « sans build / vendored / `file://` » (D-002). Le remplacement sur place exploite
le fait que la transformation est portée par l'exemplaire, pas par la géométrie du motif → réinjection
sans replacement.

### Conséquences
- `src/app.js` : `state.decorLocked`, `applyDecorLock()`, gardes `select`/`enterEdit`, `listening` dans
  `makeGroup` ; `pngFileToParsedSVG(file, cb)`, imports décor PNG, `refreshDecor()` ; `projectData()`/
  `loadProject()` sérialisent `decorLocked`.
- `vendor/imagetracer.js` **ajouté** (tiers, ne pas éditer) ; `index.html` : `<script>` + boutons décor.
- **Limitation v1 assumée** : le recalage repose sur un **cadrage de canvas Procreate constant** (recentrage
  bbox). Un changement de cadrage entre deux dessins décale l'overlay — recalage auto non traité (piste v2).
- Rafraîchir **écrase** les retouches stylet du décor (`motif.surface` supprimé) — attendu (dessin refait).

### Impact IA
Plan d'exécution : `plans/P6/` (T1 verrou · T2 vectoriseur+import PNG · T3 rafraîchir). Aucune modif de la
géométrie de cœur → `node test/run.js` doit rester **vert/inchangé** (garde-fou de non-régression). Rendu
du décor vectorisé et comportement verrou/rafraîchir : **validation visuelle par Thibault** (report
`VALIDATION.md`, pas de navigateur/Playwright côté IA).

**Extension (2026-07-04)** : le seuillage sur l'alpha seul supposait un export Procreate à fond
**transparent**. Un PNG **aplati à fond blanc opaque** (alpha=255 partout) faisait passer l'image entière
pour de l'encre → décor vectorisé en un unique rectangle plein. Fix `pngFileToParsedSVG` (`src/app.js`),
**deux corrections** :
1. Encre = pixel **opaque ET sombre** (`lum = 0.299r+0.587g+0.114b < PNG_INK_LUM(=200)`) au lieu
   d'opaque seul → distingue le fond blanc de l'encre noire.
2. **Fond mis en blanc** (255,255,255,0), pas en noir transparent (0,0,0,0). Cause racine réelle :
   ImageTracer apparie chaque pixel à la couleur de palette la plus proche par **distance RGB** (l'alpha
   ne domine pas) ; l'ancien code mettait *tous* les pixels en RGB noir et ne jouait que sur l'alpha, donc
   le fond (0,0,0,0) était classé « noir » → rectangle plein même quand le seuillage était correct.

Couvre les deux cas (fond transparent d'origine + fond blanc opaque) sans détection de fond. Suppose encre
sombre sur fond clair (motif noir sur blanc, cas de Thibault) — un fond sombre casserait l'hypothèse (hors
scope). Vérifié hors navigateur : pipeline seuillage → ImageTracer → `parseSVG` sur `decor hybride.png`
donne 1129 chemins / 179 k points (motif réel), au lieu d'un rectangle de 6 points.

## 2026-07-02 — D-011 : Impression 1:1 multi-feuilles A4 (PDF) pour décalque/pyrogravure

### Décision
Ajouter un **export PDF A4 multi-pages à l'échelle réelle** du pattern complet (motifs + décor +
contour guitare), destiné à être imprimé, assemblé, décalqué sur la table puis pyrogravé (plan
`plans/P8/`). Choix arrêtés avec Thibault (2026-07-02) :

1. **Sortie = PDF multi-pages** généré dans l'app via **jsPDF vendored** (`vendor/jspdf.umd.min.js`,
   UMD classic script, global `window.jspdf`) — échelle mm garantie (imprimer à 100 %), fichier
   archivable, imprimable depuis iPad ou PC.
2. **Rendu décalque** : **contours** des surfaces visibles (trait 0,3 mm, couleur du calque
   noir/rouge/bleu) **+ remplissage gris très clair** (~RGB 230, `evenodd`) pour lire ce qui sera
   brûlé. Le **contour guitare + cavités** est tracé en **pointillés gris** (repère de pose, à ne
   pas décalquer).
3. **Assemblage par recouvrement 10 mm** : fenêtre utile par feuille = A4 − marges 10 mm, pas de
   grille = fenêtre − 10 mm ; **croix de recalage** aux coins de fenêtre + croix « fantômes » à
   10 mm des bords partagés (positions des coins de la feuille voisine) ; **libellé L·C** par
   feuille ; **règle de contrôle 100 mm** graduée sur chaque feuille (vérif d'échelle) ; **page de
   garde** = plan d'assemblage réduit + consignes (« imprimer 100 %, sans ajustement »).
4. **Orientation = sens écran** (comme l'export PNG, D-007) : le calque est posé face imprimée sur
   la guitare, pas de miroir laser.
5. **Géométrie = pipeline existant** : `instancesBottomToTop()` → `ML.occludeSurfaces` (occlusion,
   zones interdites déjà soustraites) → px→mm par division `PX_PER_MM` (sans flip). Le **tuilage**
   (`ML.computeTiling`, pur, testé headless) choisit portrait/paysage pour minimiser le nombre de
   feuilles et centre la grille sur le bbox.

### Contexte
Le dôme de la table de guitare complique trop la gravure laser (mise au point variable). Nouveau
procédé : impression papier 1:1 → décalque → pyrogravure. Le pattern dépasse largement un A4
(~500 mm), d'où le tuilage multi-feuilles avec repères.

### Alternatives envisagées
- **Impression navigateur** (`window.print()` + CSS `@page` mm) : zéro dépendance mais l'échelle
  exacte dépend du réglage « 100 % » de chaque dialogue d'impression — trop fragile pour un calque
  qui doit s'assembler au mm. Écarté par Thibault.
- **Un SVG par feuille** à imprimer soi-même : N téléchargements + N impressions, laborieux. Écarté.
- **Contours seuls** (sans gris) ou **surfaces pleines** (comme le SVG laser) : Thibault a choisi
  l'intermédiaire contours + gris clair (lisibilité brûlé/laissé, encre raisonnable).
- **Bord à bord + traits de coupe** : exige une coupe précise par feuille ; le recouvrement scotché
  est plus tolérant. Écarté.
- **Découpe des chemins par tuile via Clipper** : inutilement coûteux (gros décor × N pages) ; le
  **clip rectangulaire natif PDF** par page + un pré-filtrage bbox des sous-chemins suffisent.

### Raison du choix
Le PDF est le seul vecteur d'impression dont l'échelle ne dépend pas du navigateur. jsPDF (fichier
UMD unique, zéro dépendance) respecte la contrainte sans build/`file://` (D-002), même précédent
qu'ImageTracer (D-009). Tout le calcul géométrique lourd existe déjà (occlusion D-004/D-005) ; la
fonction n'ajoute que du tuilage pur + du dessin PDF.

### Conséquences
- `vendor/jspdf.umd.min.js` **ajouté** (tiers, ne pas éditer, ~360 Ko).
- `src/geometry.js` : `ML.computeTiling(bboxMm, opts)` (pur, cas de test dans `test/run.js`).
- `src/print.js` **nouveau** (classic script) : rendu du PDF (pages, clip, gris/contours,
  pointillés, croix, libellés, règle, page de garde) via `window.jspdf`.
- `src/app.js` : `collectPrintScene()` (réutilise le flux PNG, mm sens écran) + bouton
  « PDF A4 1:1 » (garde `guardPendingDrafts` comme les autres exports) → `pattern-A4.pdf`.
- `index.html` : 2 `<script>` (jspdf, print.js) + bouton export.
- Le rendu imprimé (échelle réelle, recalage des croix) se valide **sur papier** par Thibault
  (règle 100 mm) — hors de portée des tests headless.

### Impact IA
Plan d'exécution : `plans/P8/` (T1 tuilage · T2 rendu PDF · T3 repères+page de garde · T4 UI).
Seul `computeTiling` touche `geometry.js` → `node test/run.js` doit rester vert (cas ajoutés en T1).
Validation visuelle/papier : report `VALIDATION.md`.

### Amendement 2026-07-04 — rendu = aplat plein (annule le pt 2 « contours + gris clair »)
Le pt 2 (contours 0,3 mm + fond gris 230) produisait un **double trait creux** sur le décor : celui-ci
est un dessin au trait vectorisé (imagetracer trace chaque trait par ses **2 bords**), donc strocker le
pourtour dessine les deux bords de chaque trait. Décision Thibault : le PDF doit restituer le **dessin au
trait tel qu'à l'écran** — chaque tracé en **aplat opaque de la couleur du calque** (`fillEvenOdd`, sans
contour), comme `fillGroupContent`. `renderPrintPdf` `opts.style` par défaut **`"fill"`** ; `"outline"`
(ancien rendu) conservé en option seulement, case UI retirée. Diagnostic reproduit hors navigateur (jsPDF +
`pdftoppm` sur `projet.mlayout` réel) : evenodd émet bien `f*` et rend des traits pleins ; l'occlusion
Clipper ne dégrade pas le line-art. Contour guitare pointillé, croix, règle, page de garde inchangés.

## 2026-07-02 — D-010 : Édition iPad/Pencil — entrées pointer natives, stylet/doigt séparés, perf localisée

### Décision
Fusion de deux audits (Claude + Codex, `AUDIT_UI_IPAD_APPLE_PENCIL.md`) → plan `plans/P7/` en trois volets :

1. **Entrées** : en mode édition stylet, le tracé quitte les événements Konva `mouse*/touch*` pour des
   **Pointer Events natifs** attachés au conteneur du stage (`enterEdit` attache, `exitEdit` détache),
   mappés vers les coordonnées locales via `stage.setPointersPositions(e)` + `getRelativePointerPosition()`.
   Konva reste maître de tout le reste (sélection, Transformer, pinch deux doigts en touch events).
   Par défaut **le stylet dessine, le doigt navigue** (1 doigt = pan manuel en édition, 2 doigts = pinch
   existant) ; bascule « dessin au doigt » dans la palette pour l'usage sans Pencil. Un 2ᵉ contact
   **annule** le trait en cours (jamais d'application partielle). S'y ajoutent : points coalescés/prédits
   (`getCoalescedEvents`/`getPredictedEvents`, avec repli si absents), décimation des points, curseur
   d'outil (taille réelle mm, survol Pencil), courbes de pression (gamma) + largeur minimale,
   stabilisation EMA réglable (défaut : désactivée).
2. **Performance** (condition de fluidité sur décor) : cache bitmap de `editDraftGroup` entre les traits
   (le pointermove ne redessine plus tout le brouillon) ; **opérations Clipper localisées par îlots**
   (regroupement contour extérieur + trous, participation au calcul limitée aux îlots dont la bbox
   intersecte celle du trait — garantit qu'un trou n'est jamais séparé de son extérieur) ; surcharge
   verte (`addedRegions`) maintenue **incrémentalement** ; undo d'édition **par commandes + keyframes**
   (fin des copies profondes ×30 du draft, mémoire Safari iPad) + bouton **Rétablir** ; autosave différé
   en période creuse (`requestIdleCallback`, jamais pendant un trait).
3. **Exception vendored (unique)** : garder la dernière ligne de `vendor/clipper.js` (l. 6986,
   `module.exports` non gardé → `ReferenceError` console en navigateur) derrière la même garde
   `typeof module` que sa l. 81. Une ligne, aucune autre édition de `vendor/` autorisée.

Une **page de sonde** (`test/pencil-probe.html`, autonome) mesure sur l'iPad réel les capacités Safari
(pression, coalescés/prédits, `twist`, survol) **avant** d'exploiter les API incertaines.

### Contexte
Usage principal : iPad + Apple Pencil Pro. Constats croisés des deux audits : un doigt posé dessine
(pas de distinction stylet/doigt), un 2ᵉ contact applique un bout de trait fantôme, le repli de la
sidebar est inopérant en paysage iPad (règle CSS enfermée dans `max-width: 900px`), et sur un décor
chargé chaque mouvement redessine tout le brouillon tandis que chaque fin de trait paie un Clipper
plein cadre — l'outil saccade là où il doit être fluide.

### Alternatives envisagées
- **Konva `pointerdown/move/up`** au lieu de listeners natifs : n'expose ni `getCoalescedEvents` ni la
  capture de pointeur ni les événements de survol de manière fiable. **Écarté** — natif sur le conteneur,
  portée limitée au mode édition.
- **Web Worker Clipper** (géométrie hors thread UI) : compatibilité `file://` incertaine sur Safari
  (worker Blob à valider), complexité de synchronisation. **Reporté** — la localité par îlots + le cache
  du brouillon doivent suffire ; à réévaluer sur mesure réelle après P7.
- **Refonte spatiale** (barre d'outils basse, plein écran, lasso contextuel, renommage du cycle brouillon,
  appui long bibliothèque — audit Codex §2/7/8/9) : pertinente mais découplée. **Reportée à un plan P8**
  pour garder P7 livrable et mesurable.
- **Barrel roll / tilt Pencil Pro** (angle de plume au poignet) : support Safari de `twist` non confirmé.
  **Reporté** — conditionné aux résultats de la sonde T4.

### Raison du choix
Les pointer events sont la seule API qui distingue stylet/doigt et porte pression/coalescés/prédits —
prérequis de toute l'ergonomie Pencil. La localité par îlots rend le coût d'un trait proportionnel à la
zone touchée et non à la taille du décor, sans changer le modèle de données (`edit.draft` inchangé). Les
deux volets sont indépendants et parallélisables ; chacun se valide séparément.

### Conséquences
- `src/app.js` : listeners pointer attachés/détachés par `enterEdit`/`exitEdit` ; `cancelActiveStroke()` ;
  pan un doigt manuel en édition ; curseur d'outil ; courbes de pression ; stabilisation ; branchement des
  ops localisées ; undo par commandes + Rétablir ; autosave différé.
- `src/geometry.js` : `ML.groupIslands`, `ML.surfaceUnionLocal`, `ML.surfaceDifferenceLocal` (+ cas de
  test dédiés dans `test/run.js`).
- `src/style.css` / `index.html` : repli sidebar hors media query, `.lib-del` visible sans survol,
  `100dvh`, `touch-action`, boutons palette (doigt, pression, lissage, Rétablir).
- `vendor/clipper.js` : **une ligne** gardée (exception D-010, ne pas généraliser).
- `test/pencil-probe.html` **ajouté** (page de sonde autonome, hors app).

### Impact IA
Plan d'exécution : `plans/P7/` (16 tâches, cf. `index.md`). Toute tâche touchant `geometry.js` doit garder
`node test/run.js` **vert** (T12 en ajoute des cas). Fluidité, latence, palm rejection, survol, pression :
**validation par Thibault sur iPad réel uniquement** (report `VALIDATION.md`) — l'émulation ne reproduit ni
la pression ni la latence perçue (limite explicite de l'audit Codex).

## 2026-07-03 — D-012 : Refonte spatiale UI iPad/Pencil (couche présentation, plan P9)

### Décision
Exécuter la **refonte spatiale** de l'UI reportée par D-010 (« reportée à un plan P8 » → prend le
numéro libre **P9**), enrichie du second audit iPad/Pencil du 2026-07-03 (audit de code Claude +
audit Playwright Codex, cf. `AUDIT_CODE_UI_IPAD_2026-07-03.md` et
`output/playwright/AUDIT_UI_IPAD_APPLE_PENCIL_2026-07-03.md`). Périmètre **présentation et entrées
uniquement** : aucune modification de la géométrie de cœur (`geometry.js`/occlusion/export). Les
constats fonctionnels de D-010 (pointer events, pression, coalescés, perf localisée) sont **acquis** ;
P9 ne touche qu'à la lisibilité, l'atteignabilité tactile et l'ergonomie du mode édition.

Choix figés (l'exécutant ne reconçoit pas) :

1. **Cibles tactiles = 44 px minimum** (HIG). Variable CSS `--tap: 44px` sur boutons/toggles ;
   zones de hit élargies par pseudo-élément `::after` transparent 44×44 quand le visuel doit rester
   dense (`×` des vignettes, `.zone-toggle`) ; sliders à pouce ~28 px + piste de hit 44 px ; ancres
   Konva (`Transformer.anchorSize`) et pastille de déplacement **compensées de l'échelle du stage**
   (taille constante à l'écran) sous `matchMedia("(pointer: coarse)")`.
2. **Palette d'édition = barre d'outils + tiroirs**, pas un panneau de réglages. Niveau 1 (toujours
   visible, non scrollable) : les 6 outils en icônes ≥48 px + taille courante + Annuler/Rétablir +
   Sortir. Niveau 2 (tiroir contextuel à l'outil actif) : mode de trait, angle plume, dureté/largeur
   min, stabilisation, bascule doigt. Actions **lasso** et **Appliquer/Jeter** en mini-barres
   flottantes **près de l'action** (pas dans la palette). Notes d'aide permanentes remplacées par un
   bouton « ? ». La logique JS existante (`setEditTool`/`setStrokeMode`/…) est déjà découplée du
   layout : chantier HTML/CSS + recâblage, **pas** de refonte d'état.
3. **Gestes iPadOS** en édition : **tap 2 doigts = Annuler, tap 3 doigts = Rétablir** (convention
   Procreate/Notes), substituts tactiles des raccourcis clavier inaccessibles sans Magic Keyboard.
   Le **squeeze et le double-tap du Pencil Pro ne sont pas exposés au web** (PencilKit natif seul) →
   ne rien en promettre.
4. **Priorité stylet** : un contact `touch` reçu **pendant** un trait `pen` en cours est **ignoré**
   (ne démarre plus de pan) — la vue ne bouge plus sous le trait. Le rejet de paume iPadOS reste le
   premier filtre ; ceci couvre le doigt franc de l'autre main.
5. **Cadrage à l'entrée d'édition** : `enterEdit()` fait un **zoom-to-fit animé** sur le motif édité,
   `exitEdit()` **restaure** la vue précédente ; un **indicateur de mode** (liseré/bandeau) rend le
   mode édition et le motif ciblé explicites.
6. **Dialogues** : remplacer les `confirm()`/`alert()` natifs enchaînés (notamment les **deux
   confirm imbriqués** de `guardPendingDrafts`, à sémantique OK/Annuler inversée) par un **dialogue
   HTML custom** à boutons explicites. **Badge « essais en attente »** dans le header (visibilité de
   l'état vert non appliqué avant export).
7. **Structure globale** : la section **Projet** (exports, finalité de l'app) épinglée accessible
   (`position: sticky; bottom: 0` de la sidebar) plutôt que sous ~6 500 px de scroll ; `.hint` du
   header conditionné à `(pointer: coarse)` (les mentions molette/Ctrl+D/Suppr sont du desktop pur) ;
   `inputmode="decimal"` sur les `input[type=number]` (pavé numérique iPadOS). **PWA** : manifest +
   `apple-mobile-web-app-capable` + `viewport-fit=cover`/`safe-area-inset-*` (plein écran, ~70 px
   récupérés, pas de swipe-back accidentel).
8. **Pencil Pro (conditionnel)** : d'abord **étendre `test/pencil-probe.html`** pour logger `twist`,
   `altitudeAngle`, `azimuthAngle`, `tangentialPressure`, puis **validation humaine sur iPad réel**
   (go/no-go). Si `twist` est exposé : piloter l'**angle de la plume calligraphique** par la rotation
   du fût (fallback = slider `calli-angle` existant). Mode **ombrage** par inclinaison (4ᵉ mode de
   trait, réutilise `ML.variableStroke`, aucune géométrie nouvelle). Hover atténué (`buttons===0`).
   **Rien de tout cela n'est codé avant la validation de la sonde** (D-010 avait déjà conditionné
   `twist` aux résultats de la sonde).

### Contexte
Second passage d'audit iPad/Pencil (2026-07-03) : l'architecture d'entrée livrée par D-010 (pointer
events, pression, coalescés/prédits, hover, annulation au 2ᵉ contact) est saine ; le défaut résiduel
est **entièrement dans la couche présentation** — cibles < 44 px partout (boutons 40, Annuler header
34, `×` 24, sliders 16-26, ancres Konva 16, pastille qui rétrécit au dézoom), palette d'édition en
colonne unique dense et scrollable (Annuler/Sortir potentiellement hors écran), sidebar ~6 500 px
reléguant les exports, deux `confirm()` imbriqués illisibles, aucun geste tactile de substitution aux
raccourcis clavier, et un conflit doigt/Pencil pendant le trait.

### Alternatives envisagées
- **Sidebar en 3 onglets** (Bibliothèque / Réglages / Projet) au lieu d'épingler Projet en sticky :
  meilleure structure à terme mais refonte de layout plus lourde et arbitrage produit ouvert.
  **Reporté** — P9 retient le sticky (risque minimal, gain immédiat) ; onglets réévaluables plus tard.
- **Déplacer les exports dans le header** : la place existe (`.hint` libéré) mais concentre trop
  d'actions critiques dans une barre déjà étroite sur iPad. **Écarté** au profit du sticky sidebar.
- **Squeeze/double-tap Pencil Pro** comme undo/redo : **impossible** au web (non exposé) → gestes
  2/3 doigts retenus.
- **Refonte d'état de la palette** (composant/état dédié) : inutile, la logique est déjà découplée du
  DOM ; P9 reste un chantier de présentation + recâblage.

### Raison du choix
Le socle fonctionnel étant acquis, l'ergonomie perçue se joue désormais uniquement sur la
présentation ; ces changements sont à **faible risque** (aucune géométrie touchée sauf, marginalement,
le mapping du mode ombrage vers `variableStroke` déjà testé) et **indépendants** les uns des autres,
donc découpables en sessions courtes et validables séparément.

### Conséquences
- `src/style.css` : `--tap`, hit `::after`, sliders, media `(pointer: coarse)`, liseré/bandeau mode,
  barre d'outils + tiroir, mini-barres flottantes, sticky Projet, safe-area.
- `index.html` : DOM de la palette réorganisé, dialogue custom, badge header, `inputmode`, boutons
  Dupliquer/`?`, balises PWA + `viewport-fit=cover`.
- `src/app.js` : compensation écran des ancres/pastille, recâblage palette/tiroir/mini-barres, gestes
  2/3 doigts, priorité stylet, zoom-to-fit + indicateur, dialogue custom (remplace `confirm`/`alert`),
  badge, (conditionnel) `twist`→angle, mode ombrage, hover atténué.
- `test/pencil-probe.html` : sonde étendue (twist/tilt).
- **Nouveau** : `manifest.webmanifest` (PWA) + éventuelles icônes data-URI.
- **Aucune modification de `geometry.js` ni de `vendor/`** ; `node test/run.js` reste un garde-fou de
  non-régression (doit rester vert/inchangé partout).

### Impact IA
Plan d'exécution : `plans/P9/` (index + sessions `S<k>.md`, format `WORKFLOW.md §4`). Backlog :
`TASKS.md` T-126…T-140. Validation **visuelle/tactile par Thibault sur iPad + Pencil Pro** (report
`VALIDATION.md`) — jamais de Playwright/navigateur côté IA (les audits visuels restent le rôle de
Codex, cf. `AGENTS.md`). Le volet Pencil Pro (T-139/T-140) est **bloqué** tant que la sonde étendue
(T-137) n'a pas été validée sur matériel (gate humain T-138).

---

## 2026-07-07 — D-013 : Migration vers la nouvelle UI (maquette Claude Design, plan P10)

### Décision
Migrer l'éditeur vers la **nouvelle interface** maquettée avec Claude Design (bundle handoff
`Maquette/handoff/am-lioration-ui-diteur-gravure/project/Editeur Gravure.dc.html`). Périmètre :
refonte **visuelle et de réorganisation spatiale uniquement** — **zéro changement de fonction**,
**aucune modification de la géométrie de cœur** (`geometry.js`/occlusion/export/packing/édition
stylet). Chaque contrôle existant conserve son rôle ; il est déplacé, restylé et recâblé dans la
nouvelle structure (barre supérieure + rail d'icônes + panneaux coulissants + incrustations canevas),
en remplacement de la sidebar unique scrollable en `<details>`. **Le canevas reste Konva** : les
motifs en masques CSS de la maquette ne sont que des mock-ups de rendu, pas une cible d'implémentation.

Choix figés (l'exécutant ne reconçoit pas) :

1. **Périmètre / rapport à P9** : P10 supersede les parties **chrome-global** encore ouvertes de P9
   (S9 dialogue custom + badge essais, S10 sticky Projet + PWA/safe-area), ré-exprimées dans la
   nouvelle structure. Le travail **mode édition** de P9 (S4 barre d'outils, S5 tiroir contextuel, S6
   lasso/brouillon flottants — déjà livrés `[x]`) est **préservé intégralement**, jamais jeté.
2. **Aucune fonction perdue** : tout contrôle de l'UI actuelle omis par la maquette est **conservé**
   (cases « activer marge »/« activer cadre », second import décor PNG, etc.), au besoin dans un
   tiroir ou un emplacement adapté — jamais supprimé silencieusement.
3. **Couleur de gravure** : garder **uniquement** le sélecteur natif `<input type=color>` (`insp-color`,
   handler inchangé). Les 6 pastilles de préréglage visibles dans la maquette **ne sont pas reprises**
   (tranché par Thibault le 2026-07-07 — pas besoin de plus de choix de couleur).
4. **Barre d'outils du mode édition** : « garder toutes les fonctions de la barre d'édition, suivre
   seulement le style graphique » (tranché par Thibault le 2026-07-07). La structure P9 (barre niveau 1
   toujours visible + tiroir ⚙ niveau 2 contextuel + mini-barres flottantes lasso/brouillon) est
   **conservée telle quelle** ; seul l'habillage (tokens, rayons, ombres) change. Aucun outil (dont
   Lasso, modes Rond/Pression/Plume/Ombrage, lissage, bascule doigt) n'est retiré ni masqué par défaut.
5. **Annuler/Rétablir global** : la barre supérieure pilote l'historique **projet** existant
   (`recordHistory`), étendu d'une **pile redo** symétrique (extension mineure, pas une nouvelle
   logique d'état). Distinct de l'historique d'**édition** (`edit.history`/`edit.redo`), inchangé.
6. **Typographie hors-ligne** : IBM Plex Sans/Mono **vendored** dans `vendor/fonts/` (`@font-face`
   locaux, chemins relatifs) — l'app tourne en `file://`, aucun CDN Google Fonts. Repli = pile système
   si le vendoring des `.woff2` est bloqué.
7. **Palette de tokens** : les couleurs `oklch(...)` de la maquette sont adoptées telles quelles en
   variables CSS `:root` (Safari iPad ≥ 15 les supporte).
8. **Barre de sélection** : adopter la barre **sombre flottante centrée-bas** de la maquette
   (Dupliquer/Descendre/Monter/Modifier/Supprimer), en remplacement du `#selection-palette` positionné.

### Contexte
Thibault a maquetté la refonte avec Claude Design (outil `claude.ai/design`) et exporté un bundle
handoff HTML/CSS/JS de prototypage — non destiné à être copié tel quel, mais à servir de **spécification
visuelle** (dimensions, couleurs, rayons, composants) pour une réimplémentation dans la stack réelle du
projet (classic scripts + Konva, sans framework, sans build). Le prototype couvre : barre supérieure
(60 px), bannière essais en attente, rail d'icônes (78 px, 5 entrées), panneau coulissant (336 px,
un seul ouvert à la fois : Motifs/Contour/Guides/Sélection/Export), canevas avec zoom flottant/pastille
d'aide/toast/barre contextuelle sombre, chrome de mode édition (pilule + barre d'outils bas re-skinnée).

### Alternatives envisagées
- **Reprendre les 6 pastilles couleur en plus du picker natif** : proposé initialement (accès rapide),
  **écarté** par Thibault — le picker natif suffit, pas de besoin de préréglages supplémentaires.
- **Simplifier la barre d'édition aux 5 outils visibles dans la maquette** (Pinceau/Gomme/Ligne/
  Rectangle/Cercle) en reléguant Lasso/modes de trait/lissage ailleurs ou en option cachée : **écarté**
  — Thibault a explicitement demandé de garder toutes les fonctions existantes, seul le style change.
- **Réécrire le canevas motifs en DOM/CSS (masques)** comme le fait le prototype Claude Design :
  **écarté** — le prototype est un mock-up de rendu, pas une cible technique ; Konva reste le moteur.

### Raison du choix
La demande initiale de Thibault est explicite : « refonte uniquement, aucun changement de fonction ».
La maquette Claude Design sert de spec visuelle fidèle (dimensions/couleurs/composants) mais son medium
(HTML/CSS/JS de prototypage) ne dicte ni l'architecture technique (Konva conservé) ni le périmètre
fonctionnel (tout contrôle existant est un invariant, la maquette ne fait qu'proposer un habillage).

### Conséquences
- `index.html` : remplacement du `<header>` + `<aside id="sidebar">` par barre supérieure + rail +
  panneaux coulissants + incrustations canevas ; re-skin du chrome de mode édition (structure P9
  inchangée) ; ajout `vendor/fonts/`.
- `src/style.css` : nouveaux tokens (`:root`), typographie IBM Plex, styles des nouveaux composants
  (barre, rail, panneaux, barre sombre, zoom flottant, pilule/barre édition re-skinnée), passe
  responsive/safe-area.
- `src/app.js` : redo projet (pile miroir), recâblage de tous les handlers existants sur le nouveau DOM
  (mêmes ids/fonctions dans la mesure du possible), aucune nouvelle logique métier.
- **Aucune modification de `geometry.js` ni de `vendor/{konva,clipper,imagetracer,jspdf}`** ;
  `node test/run.js` reste un garde-fou de non-régression (doit rester vert/inchangé partout).
- Nettoyage final (S7) : suppression du DOM/CSS mort issu de l'ancienne sidebar une fois toutes les
  fonctions confirmées migrées.

### Impact IA
Plan d'exécution : `plans/P10/` (index + sessions `S1`…`S8`, format `WORKFLOW.md §4`). Backlog :
`TASKS.md` T-142…T-149. Validation **visuelle d'ensemble par Thibault sur iPad + Apple Pencil**
(S8, report `VALIDATION.md`) — jamais de Playwright/navigateur côté IA. Point de vigilance critique :
le mapping écran→local du trait d'édition ne doit subir **aucune régression** malgré le re-skin du
chrome (S6).
