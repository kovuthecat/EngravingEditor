# PLAN_ux_perf_edition.md — Plan d'exécution   (rédigé par Opus)

> **Exécutants (Sonnet / Haiku / Codex)** : faites UNIQUEMENT votre tâche.
> Suivez les **Étapes dans l'ordre**. Lisez UNIQUEMENT les fichiers sous « Lire ».
> Ne créez AUCUN fichier ni dépendance hors « Modifier ». Le design est fixé par Opus —
> ne reconcevez pas. Doute ou blocage → **STOP**, signalez, rendez la main. N'improvisez pas.
> Format de référence : WORKFLOW.md §4.

- **Date :** 2026-06-23 · **Rédigé par :** Opus · **Branche :** `feat/ux-perf-edition` (à créer depuis `main`)
- **Plan parent / lié :** `PLAN_edition_reactivite.md` (Lot 4, D-007) · `Rapport audit UI tablette stylet.md` (source des défauts ergo) · `Plan correction UI post audit.md` (perf décor déjà entamée)

## Objectif global

Rendre l'outil **utilisable sur tablette+stylet** : (1) tuer la lenteur du **grand décor** (import + édition),
(2) afficher en vert **uniquement la matière ajoutée** par un essai, (3) une **palette d'édition flottante**
tactile (slider taille, icônes, annuler), (4) réorganiser la sidebar, (5) remplacer le profil rond/plat inutile
par **pression du stylet** + **plume calligraphique inclinée**.

## Contexte / décision clé

- **Stack figée** (`CLAUDE.md`, `DECISIONS.md`) : classic scripts, pas d'ES modules, doit tourner en `file://`.
  Globaux `window.ML`, `Konva`, `ClipperLib`. **`vendor/*` : NE PAS éditer.**
- **Toute modif géométrique** (zones / occlusion / export / stroke) **doit passer `node test/run.js`**
  (cf. `CLAUDE.md`). Le test couvre 3 motifs perso/symbole (PAS de décor) → une modif réservée au décor
  laisse sa sortie **identique** par construction.
- **Décisions produit arrêtées avec Thibault (2026-06-23, cette session)** :
  - Cible **tablette + stylet** d'abord.
  - Lag dominant = **le grand décor** (`decor hybride.svg`, ~3936 sous-chemins / 549k points).
  - Matière **effacée** par la gomme : **aucun surlignage** (le trou apparaît tel quel) ; seule la matière
    **ajoutée** passe en vert.
  - Outils retenus : **pression stylet → largeur** + **plume calligraphique inclinée**. (Pot de peinture /
    contour-seul : écartés.)
  - **Palette flottante visible uniquement en mode édition**, et la **sidebar se replie** alors entièrement.
- **Repo git** désormais initialisé (remote GitHub `kovuthecat/EngravingEditor`) → commits atomiques **par
  tâche** + push possibles (contrairement aux anciens plans). Convention messages : `CONVENTIONS.md`.
- **Repères de code** (état au 2026-06-23) :
  - Import : `buildMotifFromSVG` [app.js:171](src/app.js#L171) ; handlers `import-perso/symbole/decor`
    [app.js:1531-1554](src/app.js#L1531) ; `readFiles` [app.js:1526](src/app.js#L1526).
  - Géométrie : `ML.buildZones` [geometry.js:93](src/geometry.js#L93), `ML.motifFill`
    [geometry.js:168](src/geometry.js#L168), `ML.motifSilhouette` [geometry.js:187](src/geometry.js#L187),
    `ML.strokeToPolygon` [geometry.js:205](src/geometry.js#L205), `ML.surfaceUnion`/`surfaceDifference`
    [geometry.js:218-227](src/geometry.js#L218). Échelle entière Clipper = constante `S` + `toInt`/`fromInt`.
  - Rendu vert : `drawThumb` [app.js:253](src/app.js#L253), `fillGroupContent` [app.js:291-296](src/app.js#L291),
    `redrawEditLayer` [app.js:707](src/app.js#L707) ; couleur `EDIT_DRAFT_COLOR` [app.js:6](src/app.js#L6).
  - Édition : objet `edit` [app.js:658](src/app.js#L658), `enterEdit`/`exitEdit` [app.js:738-783](src/app.js#L738),
    `applyStroke` [app.js:870](src/app.js#L870), `startStroke`/`moveStroke`/`endStroke`
    [app.js:972-992](src/app.js#L972), dispatch pointeur `stage.on("mousedown touchstart"...)`
    [app.js:1117-1139](src/app.js#L1117), câblage outils `setEditTool`/`setEditProfile` + boutons
    [app.js:1141-1180](src/app.js#L1141).
  - Recache transformend : [app.js:89-95](src/app.js#L89). Markup éditeur : `index.html`
    [98-136](index.html#L98) ; sidebar globale [22-172](index.html#L22).

---

## Tâches

# ─────────────  LOT 1 — Perf décor  ─────────────

### T1 — Simplifier la géométrie du décor à l'import · Modèle : Sonnet
- **Pourquoi ce modèle :** modif du cœur géométrique, choix de tolérance, validation non-régression + visuelle.
- **But :** réduire d'un ordre de grandeur le nb de points du **décor** avant `buildZones`/`motifFill`/
  `motifSilhouette`, sans perte visible, pour faire chuter le temps d'import et alléger tout le reste.
- **Lire :** `src/geometry.js` (constantes `S`/`toInt`/`fromInt` en tête + `ML.buildZones` 93-116) ;
  `src/app.js` `buildMotifFromSVG` (171-189) ; `STATUS.md §Ce qui casse` (note ⚠️ motifSilhouette/motifFill).
- **Modifier :** `src/geometry.js` (ajout d'un helper exporté) ; `src/app.js` (`buildMotifFromSVG` uniquement).
- **Hors périmètre :** ne PAS simplifier les motifs non-décor (garderaient une sortie de test modifiée) ;
  ne pas toucher `buildZones`/`motifFill`/`motifSilhouette` eux-mêmes ; ne pas changer le critère de zones.
- **Étapes :**
  1. Dans `geometry.js`, ajouter `ML.simplifySubpaths = function (subpaths, tolerancePx) { … }` : pour chaque
     sous-chemin `{pts, closed}`, `toInt(pts)` → `ClipperLib.Clipper.CleanPolygon(intPts, tolerancePx * S)` →
     `fromInt(...)`. Conserver `closed`. Ignorer un sous-chemin réduit à < 3 points après nettoyage.
  2. Dans `buildMotifFromSVG`, **juste après** la construction de `pxPaths` (ligne 177) et **seulement si**
     `role === "DECOR"` : remplacer `p.subpaths = ML.simplifySubpaths(p.subpaths, 0.1 * PX_PER_MM)` pour chaque
     `p` de `pxPaths` (tolérance 0,1 mm). Le reste de la fonction (centrage, `buildZones`…) inchangé.
  3. Vérifier que `S`, `toInt`, `fromInt` sont bien accessibles dans la portée du helper (mêmes que `strokeToPolygon`).
- **Validation :**
  - auto : `node test/run.js` → OK et **sortie inchangée** (les 3 motifs de test ne sont pas DECOR ; comparer
    `test/out_occluded.svg` à une copie d'avant : diff vide).
  - visuel : importer `exemple motif/Decor/decor hybride.svg` → import en **quelques secondes** (vs ~14-16 s) ;
    décor visuellement identique (zones, vides, see-through) ; export SVG toujours valide.
- **Si bloqué :** si `ClipperLib.Clipper.CleanPolygon` n'existe pas dans le vendored, STOP et signaler (ne pas
  écrire un Douglas-Peucker maison sans validation). Si le décor devient visiblement dégradé, STOP (tolérance trop forte).
- **Commit :** `perf(geometry): simplifie le décor à l'import (CleanPolygon 0,1mm)`
- **Statut :** [x] fait   ·   exécuté par : Sonnet   ·   le : 2026-06-23   ·   commit : 85947de

### T2 — Import non bloquant + overlay de progression · Modèle : Sonnet
- **Pourquoi ce modèle :** orchestration async + UI, jugement sur le point de yield, validation visuelle.
- **But :** que l'UI affiche « Import en cours… » **avant** le calcul lourd (même après T1) au lieu de paraître figée.
- **Lire :** `src/app.js` handlers `import-perso/symbole/decor` (1531-1554) + `readFiles` (1526-1528) ;
  `index.html` `<body>` (zone après `#app`, 174-176) ; `src/style.css` (fin de fichier, pour ajouter une règle).
- **Modifier :** `src/app.js`, `index.html`, `src/style.css`.
- **Hors périmètre :** ne pas rendre `buildMotifFromSVG` asynchrone en interne ; ne pas toucher l'export ni
  l'import contour (`import-svg`). Juste encadrer les 3 imports de motifs.
- **Étapes :**
  1. `index.html` : ajouter en fin de `<body>` (avant les `<script>`) un `<div id="busy-overlay" hidden><span>Import en cours…</span></div>`.
  2. `src/style.css` : `#busy-overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
     background: rgba(15,17,21,.7); color: #e5e7eb; font-size: 14px; z-index: 50; } #busy-overlay[hidden] { display: none; }`.
  3. `src/app.js` : ajouter un helper `function runWithBusy(fn) { const o = document.getElementById("busy-overlay");
     o.hidden = false; requestAnimationFrame(() => setTimeout(() => { try { fn(); } finally { o.hidden = true; } }, 0)); }`
     (le double yield rAF+setTimeout laisse le navigateur **peindre** l'overlay avant le gel synchrone).
  4. Dans les 3 handlers d'import motif, envelopper le corps du callback `readFiles` (de `recordHistory()` à
     `markProjectChanged()`) dans `runWithBusy(() => { … })`. Garder `e.target.value = ""` **hors** du wrap
     (reset immédiat de l'input).
- **Validation :**
  - auto : `node test/run.js` → OK (rien de géométrique).
  - visuel : importer le gros décor → l'overlay « Import en cours… » apparaît **immédiatement**, reste pendant
    le calcul, disparaît à la fin ; le motif apparaît bien dans la bibliothèque.
- **Si bloqué :** si l'overlay n'apparaît jamais (peinture non déclenchée), STOP et signaler — ne pas empiler
  des `setTimeout` arbitraires.
- **Commit :** `feat(ui): overlay d'import non bloquant`
- **Statut :** [x] fait   ·   exécuté par : Sonnet   ·   le : 2026-06-23   ·   commit : voir HEAD (validation visuelle non faite — skip demandé)

### T3 — Édition : fond silhouette statique (ne plus le retracer par trait) · Modèle : Sonnet
- **Pourquoi ce modèle :** refactor Konva du calque d'essai, validation visuelle de fluidité.
- **But :** sur le décor, supprimer le coût dominant par trait : `redrawEditLayer` reconstruit aujourd'hui le
  fond silhouette (des milliers de `Konva.Line`) à CHAQUE trait. Le construire **une seule fois** à l'entrée.
- **Lire :** `src/app.js` `editLayer` + `redrawEditLayer` (660-726), `syncEditLayerTransform` (731-736),
  `enterEdit`/`exitEdit` (738-783).
- **Modifier :** `src/app.js` uniquement.
- **Hors périmètre :** ne pas changer la géométrie du brouillon (`applyStroke`/`surfaceUnion/Difference`) ;
  ne pas toucher au rendu des instances (`fillGroupContent`).
- **Étapes :**
  1. Scinder `editLayer` en deux enfants : un `editStaticGroup` (fond silhouette blanc, construit + mis en
     cache **une fois**) et un `editDraftGroup` (le brouillon, re-tracé par trait). Les deux ajoutés à `editLayer`.
  2. Extraire de `redrawEditLayer` la boucle « fond silhouette » vers une fonction `buildEditStatic(motif)`
     appelée **une seule fois** dans `enterEdit` (après `syncEditLayerTransform`), qui peuple `editStaticGroup`
     puis `editStaticGroup.cache()`.
  3. `redrawEditLayer` ne reconstruit plus que `editDraftGroup` (la `Konva.Shape` du brouillon) + `uiLayer.batchDraw()`.
  4. `exitEdit` : vider/dé-cacher `editStaticGroup` ET `editDraftGroup` (remplacer le `editLayer.destroyChildren()`
     actuel par la purge des deux sous-groupes, en gardant les sous-groupes attachés ou en les recréant à l'entrée).
  5. Vérifier que la transform (`syncEditLayerTransform`) s'applique bien au conteneur `editLayer` parent
     (inchangé) → les deux sous-groupes en héritent.
- **Validation :**
  - auto : `node test/run.js` → OK (aucune géométrie touchée).
  - visuel : entrer en édition sur le **décor**, dessiner plusieurs traits rapides → chaque trait s'affiche
    sans à-coup perceptible ; sortir/rentrer → fond correct, brouillon restauré ; motif simple inchangé.
- **Si bloqué :** si le brouillon n'apparaît plus / décalé après la scission, STOP (problème de transform ou
  d'ordre des sous-groupes) — signaler, ne pas re-fusionner en cachant le bug.
- **Commit :** `perf(edit): fond silhouette statique mis en cache (1 tracé/session)`
- **Statut :** [x] fait   ·   exécuté par : Sonnet   ·   le : 2026-06-23   ·   commit : a04f3dd (validation visuelle non faite — skip demandé)

### T4 — Debounce du recache au transformend · Modèle : Haiku
- **Pourquoi ce modèle :** mécanique, localisé (un handler), peu de jugement.
- **But :** éviter un recache bitmap immédiat (coûteux sur gros décor) à chaque fin de transform ; le repousser
  après une courte inactivité.
- **Lire :** `src/app.js` handler `tr.on("transformend", …)` (89-95).
- **Modifier :** `src/app.js` (ce handler uniquement).
- **Hors périmètre :** ne pas toucher `transform`/`transformstart`, ni `fillGroupContent`, ni le cache d'édition.
- **Étapes :**
  1. Déclarer en portée module `let recacheTimer = null;`.
  2. Dans `transformend`, garder `markProjectChanged()` immédiat ; remplacer le `n.clearCache(); n.cache(...)`
     synchrone par : `clearTimeout(recacheTimer); recacheTimer = setTimeout(() => { const n = selected();
     if (n && n.getAttr("motifId") !== undefined) { n.clearCache(); n.cache({ pixelRatio: 2 }); n.getLayer()
     && n.getLayer().batchDraw(); } }, 150);`.
- **Validation :**
  - auto : `node test/run.js` → OK.
  - visuel : redimensionner plusieurs fois d'affilée le décor → pas de gel entre chaque ; le bitmap se renette
    ~150 ms après le dernier ajustement.
- **Si bloqué :** si `selected()` n'est pas accessible dans le `setTimeout`, STOP et signaler.
- **Commit :** `perf(ui): debounce recache au transformend`
- **Statut :** [x] fait   ·   exécuté par : Sonnet   ·   le : 2026-06-23   ·   commit : (voir git log)

# ─────────────  LOT 2 — Vert sur la matière ajoutée seulement  ─────────────

### T5 — N'afficher en vert que la matière ajoutée par l'essai · Modèle : Sonnet
- **Pourquoi ce modèle :** logique de rendu transverse (3 points), jugement sur la base à peindre, validation visuelle.
- **But :** au lieu de peindre **toute** la surface en vert dès qu'un essai existe, peindre le **résultat du
  brouillon en couleur normale** (donc une gomme = vrai trou = « juste l'absence ») et **superposer en vert
  uniquement `brouillon − surface réelle`** (matière ajoutée).
- **Lire :** `src/app.js` `exportFill` (212-219), `drawThumb` (240-261), `fillGroupContent` (270-339),
  `redrawEditLayer` (707-726), `EDIT_DRAFT_COLOR` (6) ; `src/geometry.js` `surfaceDifference` (224-227).
- **Modifier :** `src/app.js` uniquement.
- **Hors périmètre :** ne pas modifier `motif.surface`/`silhouette` (le vert reste display-only) ; ne pas
  toucher l'export (`instancesBottomToTop`/`writeSVG`) ni les helpers géométrie.
- **Étapes :**
  1. Ajouter un helper `function addedRegions(realContours, draftContours) { return ML.surfaceDifference(draftContours, realContours); }`
     (matière du brouillon absente du réel = ajout).
  2. **`fillGroupContent`** (291-296) : quand `pendingDraft` existe, NE PLUS forcer `fill = EDIT_DRAFT_COLOR`.
     Peindre la (les) surface(s) du brouillon en **couleur réelle** (`color`) comme un motif normal, PUIS
     ajouter une `Konva.Shape` supplémentaire (par couleur) qui peint `addedRegions(exportFill(motif)[color] || [], pendingDraft.surfaceByColor[color] || [])`
     en `EDIT_DRAFT_COLOR` (même `sceneFunc`/`fillRule` evenodd que les surfaces, `listening:false`).
  3. **`drawThumb`** (253-259) : même logique sur le canvas 2D — base = brouillon en couleur réelle, puis
     repasse `addedRegions(...)` en vert.
  4. **`redrawEditLayer`** (707-726) : pendant l'édition live, base = `edit.draft` en `motif.color`, puis
     overlay vert = `addedRegions(exportFill(motif)[motif.color] || [], edit.draft)`. (La « surface réelle »
     de référence = `exportFill(motif)`, qui ignore l'essai en cours.)
  5. Garder le cache du groupe (T3 préservé) : le vert reste baked, 0 coût/frame.
- **Validation :**
  - auto : `node test/run.js` → OK (rendu non couvert, mais vérifier l'absence de régression géométrique).
  - visuel : sur un motif, ajouter de la matière au pinceau → seule la **partie ajoutée** est verte, le reste
    du motif garde sa couleur ; gommer une partie → la zone gommée devient un **trou** (pas de vert, pas de
    surlignage) ; la vignette reflète la même chose ; Appliquer → tout repasse en couleur réelle.
- **Si bloqué :** si `exportFill(motif)[color]` est `undefined` pour une couleur du brouillon (motif neuf jamais
  rempli), traiter le réel comme `[]` (tout est « ajouté ») — ne pas planter ; si le comportement diverge, STOP.
- **Commit :** `feat(edit): vert uniquement sur la matière ajoutée par l'essai`
- **Statut :** [x] fait   ·   exécuté par : Sonnet   ·   le : 2026-06-23   ·   commit : 2e5f26e (validation visuelle non faite — skip demandé)

# ─────────────  LOT 3 — Palette flottante tactile + réorg sidebar  ─────────────

### T6 — Réorganiser la sidebar (collapsibles + déplacements) · Modèle : Sonnet
- **Pourquoi ce modèle :** restructuration HTML transverse + risque de casser des `id` câblés en JS.
- **But :** ranger import+bibliothèque dans un collapsible dédié ; déplacer dimensions contour, guides de
  gravure et rotation/échelle de la sélection dans « Avancé » ; garder Dupliquer/Supprimer + ordre Z accessibles.
- **Lire :** `index.html` (sidebar 22-172) ; `src/app.js` (uniquement la **liste des `id` câblés** — repérer
  via les `getElementById` autour de 1530-1600 et 648-649 : `import-*`, `library`, `dim-long/short`, `import-svg`,
  `chk-margin`, `margin-mm`, `insp-rot`, `insp-scale`, `btn-dup`, `btn-del`, `btn-up/down/front/back`) ;
  `src/style.css` `details.advanced` (33-40).
- **Modifier :** `index.html` uniquement (déplacement de blocs ; **aucun `id` renommé/supprimé**).
- **Hors périmètre :** ne RIEN renommer/supprimer comme `id` ou `name` (le JS s'y câble par `id`) ; ne pas
  toucher la logique JS ; ne pas déplacer les boutons d'édition (`#stylet-editor`) — c'est T7 qui les sort.
- **Étapes :**
  1. Envelopper la section « Motifs » (24-32) **et** la section « Décor » (34-39) **et** `#library` dans un
     `<details class="advanced" id="lib-section" open><summary>Motifs &amp; import</summary> … </details>`
     (garder tous les `<input>`/`#library` intacts à l'intérieur).
  2. Déplacer le **contenu** de « Contour » (43-48) et « Guides de gravure » (53-55) DANS le `<details class="advanced">`
     existant (58-76), en tête, sous deux `<h3>` (« Contour », « Guides de gravure »). Garder les `id` (`dim-long`,
     `dim-short`, `import-svg`, `chk-margin`, `margin-mm`).
  3. Dans `#inspector`, déplacer les deux `.row` rotation (80) et échelle (81) DANS un nouveau
     `<details class="advanced"><summary>Position fine</summary> … </details>` placé **après** les boutons
     Dupliquer/Supprimer et l'ordre Z. Garder `#insp-rot`/`#insp-scale`.
  4. Laisser `#btn-dup`/`#btn-del` (82-85) et le bloc ordre Z (137-143) **hors** collapsible (accès direct).
- **Validation :**
  - auto : `node test/run.js` → OK (aucun JS touché).
  - visuel : recharger → import/bibliothèque dans un repli « Motifs & import » ; contour/guides/position fine
    dans « Avancé » ; tous les contrôles **fonctionnent encore** (import, dim contour, marge, rotation/échelle,
    dup/suppr, ordre Z) — aucune erreur console `null` sur un `getElementById`.
- **Si bloqué :** si un bloc déplacé fait perdre un `id` référencé en JS (erreur console), STOP et signaler
  l'`id` fautif (ne pas le recréer ailleurs en doublon).
- **Commit :** `refactor(ui): regroupe import/contour/guides/position en collapsibles`
- **Statut :** [x] fait   ·   exécuté par : Sonnet   ·   le : 2026-06-23   ·   commit : voir HEAD (validation visuelle non faite — skip demandé)

### T7 — Palette d'édition flottante sur le canvas · Modèle : Sonnet
- **Pourquoi ce modèle :** nouvelle surface UI overlay + recâblage des contrôles, jugement tactile, validation visuelle.
- **But :** sortir les outils d'édition de la sidebar vers une **palette flottante** sur `#stage`, visible
  seulement en mode édition (slider taille + valeur, icônes d'outils ≥44 px, Annuler, Appliquer, Jeter, Sortir),
  et **replier la sidebar** pendant l'édition.
- **Lire :** `index.html` `#stylet-editor` (98-136) + `#stage` (174) ; `src/app.js` `enterEdit`/`exitEdit`
  (738-783), `populateStyletEditor` (698-704), câblage outils/boutons (1155-1180), `setEditTool`/`setEditProfile`
  (1141-1154), toggle sidebar `#btn-sidebar-toggle` (chercher son handler) ; `src/style.css` (fin).
- **Modifier :** `index.html`, `src/app.js`, `src/style.css`.
- **Hors périmètre :** ne pas changer la logique des outils eux-mêmes (pinceau/gomme/formes/lasso) ; garder le
  modèle profil rond/plat **tel quel pour l'instant** (Lot 4 le remplace) ; ne pas toucher la géométrie.
- **Étapes :**
  1. `index.html` : créer un `<div id="edit-palette" hidden>` **enfant de `#stage`** (ou frère, positionné
     absolu au-dessus). Y **déplacer** le contenu de `#stylet-tools` (icônes outils, tailles, profil) et les
     actions brouillon (`#stylet-draft-actions`), + ajouter un bouton `#btn-edit-undo` (« Annuler ») et un
     bouton `#btn-edit-exit` (« Sortir »). Conserver tous les `id` existants. Le bouton `#btn-edit`
     (« Entrer en édition ») RESTE dans l'inspecteur (point d'entrée).
  2. Remplacer l'`<input type="number" id="brush-size">` par un `<input type="range" id="brush-size"
     min="0.5" max="20" step="0.5">` + un `<span id="brush-size-val">` affichant la valeur en mm en direct
     (garder l'`id` `brush-size` pour ne pas casser le handler 1165 ; mettre à jour `#brush-size-val` dans ce handler).
  3. `src/style.css` : `#stage { position: relative; }` ; `#edit-palette { position: absolute; top: 8px;
     left: 8px; display: flex; flex-direction: column; gap: 6px; padding: 8px; background: rgba(18,21,28,.92);
     border: 1px solid #2f3644; border-radius: 10px; z-index: 20; max-width: 220px; } #edit-palette[hidden]
     { display: none; }` ; cibles `.btn` déjà ≥40 px (style existant) — vérifier que les icônes restent ≥44 px tactile.
  4. `src/app.js` :
     - `enterEdit` : `document.getElementById("edit-palette").hidden = false;` + replier la sidebar
       (`document.getElementById("app").classList.add("collapsed")` + `syncStageSize()` si dispo, sinon
       déclencher le même chemin que `#btn-sidebar-toggle`).
     - `exitEdit` : `…hidden = true;` + ré-afficher la sidebar (retirer `.collapsed` + resync) — **sauf** si
       l'utilisateur l'avait repliée manuellement avant (mémoriser un booléen `sidebarWasCollapsed` à l'entrée).
     - Câbler `#btn-edit-undo` → fonction `undoStroke` (fournie par T8 ; en attendant, no-op si absente : voir
       dépendances) ; `#btn-edit-exit` → `exitEdit()`.
     - `populateStyletEditor` : piloter l'affichage de `#edit-palette`/actions selon `inEdit`/`motifHasPendingWork`.
- **Validation :**
  - auto : `node test/run.js` → OK.
  - visuel (fenêtre étroite type tablette) : sélectionner un motif → « Entrer en édition » → la sidebar se
    replie, la palette apparaît sur le canvas, slider de taille fonctionne (valeur mm affichée), changement
    d'outil OK, Appliquer/Jeter OK, « Sortir » referme la palette et rouvre la sidebar.
- **Si bloqué :** si `syncStageSize()` n'existe pas sous ce nom, STOP et signaler (repérer le vrai resync de
  `#btn-sidebar-toggle` avant de l'appeler) ; ne pas dupliquer la logique de resize.
- **Déviation signalée :** `#edit-palette` n'est PAS un enfant littéral de `#stage` dans le HTML statique —
  `Konva.Stage` fait `container.innerHTML = ""` à la construction (`_buildDOM`), ce qui aurait effacé tout
  contenu HTML placé en dur dans `<main id="stage">`. Utilisé le repli explicitement permis par le plan
  (« ou frère, positionné absolu au-dessus ») : nouveau wrapper `#stage-wrap` (`position:relative`, flex)
  contenant `<main id="stage">` et `#edit-palette` comme frères ; `#edit-palette` reste `position:absolute;
  top/left:8px` mais relatif à `#stage-wrap` (équivalent visuel, robuste même si la sidebar ne se replie pas
  sur grand écran, cf. media query 900px existante non modifiée).
- **Commit :** `feat(edit): palette d'édition flottante tactile + sidebar repliée`
- **Statut :** [x] fait   ·   exécuté par : Sonnet   ·   le : 2026-06-23   ·   commit : voir HEAD (validation visuelle non faite — skip demandé)

### T8 — Annuler par trait pendant l'édition · Modèle : Sonnet
- **Pourquoi ce modèle :** gestion d'état (pile de snapshots), interaction clavier/bouton, validation.
- **But :** « Annuler » en mode édition retire **le dernier trait** du brouillon (sans toucher l'historique
  global du projet), au bouton `#btn-edit-undo` et via Ctrl+Z quand l'édition est active.
- **Lire :** `src/app.js` objet `edit` (658), `applyStroke` (870-876), `endShape` (955-966), lasso finalize
  (chercher `finalizeLasso*`), `redrawEditLayer` (707-726), keydown handler (1211-1218), `undo` global (1415).
- **Modifier :** `src/app.js` uniquement.
- **Hors périmètre :** ne pas modifier l'historique global (`undoStack`/`recordHistory`) ; ne pas persister la
  pile de traits (session uniquement).
- **Étapes :**
  1. Ajouter `edit.history = []` (pile bornée, ex. 30) dans l'init de `edit` et la réinitialiser dans
     `enterEdit`/`exitEdit`.
  2. Créer `function pushStrokeSnapshot() { edit.history.push(deepCopyContours(edit.draft)); if (edit.history.length > 30) edit.history.shift(); }`
     et l'appeler **avant** chaque mutation du brouillon : début de `applyStroke`, `endShape`, et les
     finalisations lasso qui mutent `edit.draft`.
  3. Créer `function undoStroke() { if (!edit.active || !edit.history.length) return; edit.draft = edit.history.pop();
     edit.dirty = edit.history.length > 0 || /* comparer au réel si besoin */ true; clearLassoSelection();
     redrawEditLayer(state.motifs.find(m => m.id === edit.motifId)); }`.
  4. Câbler `#btn-edit-undo` → `undoStroke` (remplace le no-op de T7). Dans le keydown (1213), si `edit.active`,
     **Ctrl+Z appelle `undoStroke()`** au lieu de `undo()` global.
- **Validation :**
  - auto : `node test/run.js` → OK.
  - visuel : faire 3 traits → « Annuler » 3× retire les traits un à un ; Ctrl+Z en édition agit sur les traits,
    pas sur le projet ; sortir d'édition puis Ctrl+Z → agit de nouveau sur le projet global.
- **Si bloqué :** si une mutation de `edit.draft` n'est pas couverte par un snapshot (un trait non annulable),
  STOP et lister les points de mutation manquants.
- **Commit :** `feat(edit): annuler par trait (pile de brouillon) + Ctrl+Z contextuel`
- **Statut :** [x] fait   ·   exécuté par : Sonnet   ·   le : 2026-06-23   ·   commit : voir HEAD (validation visuelle non faite — skip demandé)

### T9 — Repli auto des sections à l'entrée d'édition, restauration à la sortie · Modèle : Sonnet
- **Pourquoi ce modèle :** gestion d'état UI (mémoriser/restaurer l'ouvert), petit mais transverse aux `<details>`.
- **But :** quand on entre en édition, replier les sections/`<details>` ouverts de la sidebar, et **rouvrir
  exactement ceux qui l'étaient** à la sortie.
- **Lire :** `src/app.js` `enterEdit`/`exitEdit` (738-783) ; `index.html` après T6 (les `<details class="advanced">`
  et `#lib-section`).
- **Modifier :** `src/app.js` uniquement.
- **Hors périmètre :** ne pas modifier le markup (T6/T7 l'ont figé) ; ne pas toucher la logique d'édition.
- **Étapes :**
  1. Dans `enterEdit`, avant de replier la sidebar : `edit.reopenDetails = [...document.querySelectorAll("#sidebar details[open]")];`
     puis `edit.reopenDetails.forEach(d => d.open = false);`.
  2. Dans `exitEdit`, après ré-affichage sidebar : `(edit.reopenDetails || []).forEach(d => d.open = true);
     edit.reopenDetails = null;`.
- **Validation :**
  - auto : `node test/run.js` → OK.
  - visuel : ouvrir « Avancé » + « Motifs & import », entrer en édition → tout se replie ; sortir → les deux
    se rouvrent ; un `<details>` resté fermé reste fermé.
- **Si bloqué :** si `exitEdit` est aussi appelé hors interaction (ex. `clear`/`load` à 1368/1583) et rouvre des
  sections de façon indésirable, STOP et signaler (peut nécessiter de garder le garde `edit.reopenDetails` nul).
- **Commit :** `feat(edit): repli/restauration auto des sections en édition`
- **Statut :** [x] fait   ·   exécuté par : Sonnet   ·   le : 2026-06-23   ·   commit : a0022e7 (validation visuelle non faite — skip demandé)

# ─────────────  LOT 4 — Pression stylet + plume calligraphique  ─────────────

### T10 — Remplacer le contrôle profil par Rond / Pression / Calligraphie(angle) · Modèle : Sonnet
- **Pourquoi ce modèle :** UI + état, prépare la géométrie de T11/T12, jugement sur l'agencement palette.
- **But :** remplacer le toggle rond/plat (inutile) par un sélecteur de **mode de trait** + un slider d'**angle**
  (calligraphie), stocké dans `edit`. (La géométrie suit en T11/T12.)
- **Lire :** `index.html` bloc profil dans la palette (après T7 : `#profile-round`/`#profile-flat`) ;
  `src/app.js` `edit` (658), `setEditProfile` (1150-1154) + câblage (1176-1177).
- **Modifier :** `index.html`, `src/app.js`.
- **Hors périmètre :** ne pas écrire la géométrie ici (T11/T12) ; ne pas casser le pinceau actuel (le mode
  « Rond » reste le comportement d'aujourd'hui via `strokeToPolygon` round).
- **Étapes :**
  1. `index.html` : remplacer les deux boutons profil par 3 boutons `#mode-round` (« Rond »), `#mode-pressure`
     (« Pression »), `#mode-calli` (« Plume »), + une `.row` `<input type="range" id="calli-angle" min="0"
     max="180" step="5" value="45">` (affichée seulement en mode Plume, sinon `hidden`).
  2. `src/app.js` : dans `edit`, remplacer `profile: "round"` par `strokeMode: "round"` (`"round"|"pressure"|"calli"`)
     et ajouter `calliAngle: 45`. Remplacer `setEditProfile` par `setStrokeMode(mode)` (toggle `.on` sur les 3
     boutons + affiche/masque `#calli-angle`). Câbler les 3 boutons + le slider angle (`edit.calliAngle = +value`).
  3. **Conserver une rétro-compat** : là où `edit.profile` était lu (`strokeToPolygon(..., edit.profile)` en
     871/903, preview `lineCap` 914/977), introduire `edit.strokeMode` ; en mode `"round"` ou `"pressure"` le
     bout reste rond, `"calli"` n'est branché qu'en T12. **Pour cette tâche**, mapper provisoirement tous les
     modes sur le rendu rond actuel (aucune régression visuelle) — T11/T12 brancheront la vraie géométrie.
- **Validation :**
  - auto : `node test/run.js` → OK.
  - visuel : la palette montre 3 modes + slider d'angle (visible en Plume seulement) ; sélectionner chacun ne
    casse pas le tracé (tous se comportent comme « Rond » pour l'instant) ; aucun `null` console.
- **Si bloqué :** si `edit.profile` est référencé ailleurs que les 4 endroits listés, STOP et lister les
  occurrences avant de renommer.
- **Commit :** `feat(edit): sélecteur de mode de trait (rond/pression/plume) + angle`
- **Statut :** [x] fait   ·   exécuté par : Sonnet   ·   le : 2026-06-23   ·   commit : voir HEAD (validation visuelle non faite — skip demandé)

### T11 — Trait à largeur variable selon la pression du stylet · Modèle : Sonnet
- **Pourquoi ce modèle :** géométrie (nouveau helper Clipper) + capture d'événement, validation `node test/run.js`.
- **But :** en mode « Pression », la largeur du trait suit `e.evt.pressure` (stylet) ; le slider de taille = largeur max.
- **Lire :** `src/geometry.js` `strokeToPolygon` (205-214) + `surfaceUnion` (218-221) + `S`/`toInt`/`fromInt` ;
  `src/app.js` dispatch pointeur (1117-1139), `startStroke`/`moveStroke`/`endStroke` (972-992), `applyStroke`
  (870-876), `edit` (658).
- **Modifier :** `src/geometry.js` (nouveau helper) ; `src/app.js` (capture pression + branchement).
- **Hors périmètre :** ne pas modifier `strokeToPolygon` (gardé pour mode Rond/formes) ; ne pas toucher la gomme
  (reste uniforme) ; pas la calligraphie (T12).
- **Étapes :**
  1. `geometry.js` : `ML.variableStroke = function (pts, radii) { … }` où `radii[i]` = rayon px au point `i`.
     Construire l'union de **disques** (polygones ~16 côtés) de rayon `radii[i]` à chaque point + **quadrilatères**
     reliant disques consécutifs (tangentes), le tout via `unionInt`/`fromInt`. Retour `[{pts,closed:true}]`
     comme `strokeToPolygon`. Un seul point → un disque.
  2. `app.js` capture : dans le dispatch pointeur, lire la pression `const pr = (e.evt.pressure ?? e.evt.touches?.[0]?.force ?? 0.5) || 0.5;`
     (0 → 0.5, cas souris). Stocker un tableau `edit.pressures` en parallèle de `edit.pts` (push dans
     `startStroke`/`moveStroke`).
  3. `applyStroke` : si `edit.strokeMode === "pressure"`, calculer `radii = edit.pressures.map(p => maxR * (0.25 + 0.75*p))`
     avec `maxR = edit.sizeMm*PX_PER_MM/2`, puis `poly = ML.variableStroke(edit.pts, radii)` ; sinon
     `ML.strokeToPolygon` (round) comme aujourd'hui. Union/diff dans `edit.draft` inchangés.
  4. Réinitialiser `edit.pressures` dans `startStroke`/`endStroke` comme `edit.pts`.
- **Validation :**
  - auto : `node test/run.js` → OK (helper non utilisé par le test ; pas de régression).
  - visuel : sur tablette/stylet (ou émulation pointer avec pressure), un trait appuyé est plus épais qu'un
    trait léger ; à la souris, largeur ~constante (0.5) ; mode « Rond » inchangé.
- **Si bloqué :** si aucune source de pression n'est disponible (toujours 0.5), le signaler comme limitation
  (pas un échec) ; si `variableStroke` produit des trous/artefacts, STOP et joindre un cas.
- **Commit :** `feat(edit): trait à largeur variable selon la pression du stylet`
- **Statut :** [x] fait   ·   exécuté par : Sonnet   ·   le : 2026-06-23   ·   commit : dc50e7b (validation visuelle non faite — skip demandé)

### T12 — Plume calligraphique inclinée · Modèle : Sonnet
- **Pourquoi ce modèle :** géométrie (Minkowski / nib orienté), validation `node test/run.js` + visuelle.
- **But :** en mode « Plume », le trait est balayé par un **nib plat orienté** à `edit.calliAngle` → largeur
  variable selon la direction (épais perpendiculaire au nib, fin parallèle).
- **Lire :** `src/geometry.js` `strokeToPolygon` (205-214), `surfaceUnion` (218-221), `S`/`toInt`/`fromInt` ;
  `src/app.js` `applyStroke` (870-876), `shapePolygon`/`makeShapePreview` (900-921) si réutilisé, `edit` (658).
- **Modifier :** `src/geometry.js` (nouveau helper) ; `src/app.js` (branchement mode calli).
- **Hors périmètre :** ne pas changer pression (T11) ni round ; ne pas toucher la gomme.
- **Étapes :**
  1. `geometry.js` : `ML.calligraphicStroke = function (pts, widthPx, angleDeg) { … }`. Construire le **nib**
     = segment orienté de longueur `widthPx` à `angleDeg` (polygone fin : rectangle longueur `widthPx`,
     épaisseur ~`max(1, widthPx*0.15)`), centré sur l'origine. Balayer le long de `pts` via
     `ClipperLib.Clipper.MinkowskiSum(nib, toInt(pts), false)` puis `unionInt`/`fromInt`. Un seul point →
     le nib seul. Retour `[{pts,closed:true}]`.
  2. `app.js` `applyStroke` : si `edit.strokeMode === "calli"`, `poly = ML.calligraphicStroke(edit.pts,
     edit.sizeMm*PX_PER_MM, edit.calliAngle)`. (Combinable avec pression si simple ; sinon calli ignore la
     pression pour cette tâche.)
  3. Aperçu live : pour le mode calli, garder l'aperçu `Konva.Line` actuel (approximation) — l'exactitude
     vient à la fin de trait via le helper (acceptable).
- **Validation :**
  - auto : `node test/run.js` → OK.
  - visuel : un trait horizontal vs vertical avec angle 45° → épaisseurs nettement différentes (effet plume) ;
    changer l'angle change l'orientation de l'effet ; modes Rond/Pression inchangés.
- **Si bloqué :** si `ClipperLib.Clipper.MinkowskiSum` n'existe pas dans le vendored, STOP et signaler (fallback
  possible = union de rectangles orientés stampés le long du trait, mais à valider — ne pas improviser sans accord).
- **Commit :** `feat(edit): plume calligraphique inclinée (nib orienté)`
- **Statut :** [x] fait   ·   exécuté par : Sonnet   ·   le : 2026-06-23   ·   commit : eb53bb2 (validation visuelle non faite — skip demandé)

---

## Dépendances / ordre

```
LOT 1 (perf décor) — prioritaire, débloque l'usage réel
  T1 (geometry)  ─ indépendante ; sauvegarder out_occluded.svg avant pour diff
  T2 (async)     ─ indépendante de T1 (cumulatives)
  T3 (edit perf) ─ indépendante
  T4 (debounce)  ─ indépendante
  → T1, T2, T3, T4 sans conflit fort ; T1/T3 touchent geometry+app, faire en série pour éviter
    les conflits d'édition sur app.js. Ordre conseillé : T1 → T3 → T2 → T4.

LOT 2
  T5 (vert delta) ─ indépendant des autres lots (rendu). Peut suivre le Lot 1.

LOT 3 (UI tablette) — séquentiel, même zone HTML/JS
  T6 (réorg sidebar) → T7 (palette ; déplace #stylet-tools, suppose T6 fait)
                     → T8 (undo trait ; câble #btn-edit-undo créé en T7)
                     → T9 (repli auto ; suppose les <details> de T6/T7)
  Ordre IMPÉRATIF : T6 → T7 → T8 → T9.

LOT 4 (outils trait) — après T7 (palette accueille les contrôles)
  T10 (UI mode) → T11 (pression) ; T10 → T12 (calligraphie). T11 et T12 indépendants entre eux.
  Ordre : T10 → (T11, T12).

Global : LOT 1 → LOT 2 → LOT 3 → LOT 4 (comme validé avec Thibault).
```

## Après le lot — mise à jour du contexte (obligatoire)

- [ ] **PLAN** : chaque tâche faite → `[x]`, renseigner exécuté par / le / commit ; rien « en cours ».
- [ ] **STATUS.md** : déplacer les points perf décor (import lent, vert global) de « Ce qui casse » vers
  « Corrigé » ; documenter palette flottante, modes de trait (pression/calligraphie), undo par trait.
- [ ] **DECISIONS.md** : acter une décision **D-008** (UX tablette : palette flottante en édition, sidebar
  repliée, vert = matière ajoutée seule, profil rond/plat remplacé par pression+calligraphie). Acter aussi
  **D-007** (calque d'essai + PNG sens écran) si toujours pas fait — dette signalée dans la mémoire projet.
- [ ] **SPEC.md** : section édition stylet → décrire `variableStroke`/`calligraphicStroke`/`simplifySubpaths`
  et le rendu « vert = delta ».
- [ ] **PROJECT_MAP.md** : ajouter les nouveaux helpers géométrie + `#edit-palette` à la Feature 3.
- [ ] **Vérifier qu'aucun fichier de contexte n'est devenu faux.**
- [ ] Commits atomiques par tâche (messages ci-dessus) ; push sur `feat/ux-perf-edition` en fin de session.
