# PLAN_tablette_edition.md — Import calibré + Tablette tactile + Édition au stylet (Lot 3)

> **Exécutants (Sonnet / Haiku / Codex)** : faites UNIQUEMENT votre tâche.
> Suivez les **Étapes dans l'ordre**. Lisez UNIQUEMENT les fichiers sous « Lire ».
> Ne créez AUCUN fichier ni dépendance hors « Modifier ». Le design est fixé par Opus —
> ne reconcevez pas. Doute ou blocage → **STOP**, signalez, rendez la main. N'improvisez pas.
> Format de référence : WORKFLOW.md §4.

- **Date :** 2026-06-22 · **Rédigé par :** Opus · **Branche :** —
- **Plan parent / lié :** `PLAN.md` (Lot 1+2) · **Décision cadre :** `DECISIONS.md §D-006`

## Objectif global

Trois chantiers : (1) **calibrer l'import** des motifs (orientation + plafond d'échelle), (2) rendre
l'outil utilisable **sur tablette** (tactile + hébergement statique), (3) permettre **l'édition au
stylet** (pinceau/gomme) d'un motif sélectionné, en restant verrouillé dessus pendant l'édition.

## Contexte / décision clé — `DECISIONS.md §D-006` (à lire en entier avant de coder)

Points structurants arrêtés par Opus, **ne pas reconcevoir** :

- **Orientation** : SVG et écran sont en **y-bas** ; le flip `-y` de `buildMotifFromSVG` (hérité du DXF)
  pose les motifs tête en bas → **le retirer**. Le contour n'a jamais été flippé : c'est la référence.
- **Plafond d'échelle à l'ajout** : motif normal ≤ **1/10** du bbox contour, décor ≤ **1/1** (`decorFit`
  ≈0,92, inchangé). Le plafond **réduit seulement** (jamais agrandir) ; seulement à l'ajout manuel.
- **Tactile** : pinch-zoom + pan **deux doigts** ; `touch-action:none` ; cibles agrandies ; sidebar
  repliable. Le dessin (un doigt/stylet) ne pane pas la vue.
- **Accès tablette** : **hébergement statique** (URL), pas de build, documenté au README.
- **Édition stylet** : `motif.surface = { [color]:[{pts,closed}] }` (px local) qui **prime** sur la
  surface dérivée des zones **partout** ; initialisé paresseusement depuis `exportFill(motif)` au 1ᵉʳ
  coup. Pinceau = union, gomme = différence, avec un **polygone d'épaisseur** (offset Clipper de la
  polyligne). **Portée = le motif** (toutes ses copies, via `rerenderMotif`). Couleur = focale du motif.
  Silhouette **recalculée** depuis la surface éditée. Verrouillage en mode édition (cf. T6).

Référence de style : **classic script** (pas d'ES modules), globals `window.ML`/`Konva`/`ClipperLib`,
doit tourner en `file://`. 4 fichiers source. Toute modif géométrique → `node test/run.js`.

---

## Tâches

### T1 — Import calibré : retirer le flip Y + plafond d'échelle (1/10 motif, 1/1 décor) · Modèle : Sonnet
- **Pourquoi ce modèle :** logique d'état + validation visuelle d'orientation/échelle.
- **But :** importer les motifs **dans le bon sens** et **assez petits** (plafond), sans toucher décor.
- **Lire :** `src/app.js` — `minMax` (L107-113), `buildMotifFromSVG` (L121-139), `decorFit` (L243-261),
  `addInstance` (L263-277), `viewCenterDesign` (L279-282) ; `DECISIONS.md §D-006` (chantier 1).
- **Imiter :** `decorFit` (déjà le patron « calculer une échelle pour tenir dans le contour/vue »).
- **Modifier :** `src/app.js`.
- **Hors périmètre :** ne touche pas au packing, au save/load, au tactile, à l'édition stylet. Ne change
  pas `decorFit` (le décor reste à son comportement actuel).
- **Étapes :**
  1. Dans `buildMotifFromSVG`, remplacer `toPx = ([x, y]) => [x * PX_PER_MM, -y * PX_PER_MM]` par
     `toPx = ([x, y]) => [x * PX_PER_MM, y * PX_PER_MM]` (retrait du flip). Mettre à jour le commentaire
     (« SVG y-bas = écran y-bas, pas de flip ; l'export reflippe via pxPathsToMm »).
  2. Généraliser `decorFit(motif)` → `fitScale(motif, fraction)` : même calcul de cible (bbox contour, ou
     vue si pas de contour) ; renvoyer une **échelle** `Math.min(tw / mw, th / mh) * fraction`. Adapter
     l'unique appelant décor pour passer `fraction = 0.92` et garder le centrage (x/y) actuel — donc
     `fitScale` peut renvoyer `{ scale, x, y }` comme aujourd'hui (ne pas casser le centrage décor).
  3. Dans `addInstance`, pour un motif **non-DECOR** ajouté **sans** `opts.scale` ni `opts.x` (ajout
     manuel) : calculer `capScale = fitScale(motif, 0.1).scale` et appliquer `scale = Math.min(1, capScale)`
     (réduire seulement). **Position** : garder le centre de vue actuel (`c`), ne pas recadrer comme le
     décor. Le décor garde sa branche `decorFit`/`fitScale(…,0.92)` existante (position recadrée).
  4. Vérifier que packing (`opts.scale` fourni) et `loadProject` (`opts.scale` fourni, `silent`) ne sont
     **pas** affectés (le plafond ne s'applique que si `opts.scale == null`).
- **Validation :**
  - auto : `node --check src/app.js`.
  - visuel : **OBLIGATOIRE** — charger un contour ; importer un personnage SVG : il apparaît **à
    l'endroit** (même sens que dans Inkscape) et **petit** (~1/10 du contour) ; importer un décor : tient
    dans le contour comme avant ; le packing et un projet chargé gardent leurs tailles.
- **Si bloqué :** si un appelant de `decorFit` autre que `addInstance` existe (recherche globale), adapter
  sans changer sa sémantique ; si retirer le flip casse l'export (orientation mm), **STOP** et signale
  (ne pas réintroduire un flip compensatoire ailleurs).
- **Commit :** `fix(app): import sans flip Y + plafond d'échelle (1/10 motif, 1/1 décor)`
- **Statut :** [x] fait · exécuté par : Sonnet · le : 2026-06-22 · commit : — (pas de git initialisé, cf. STATUS backlog) — validé visuellement (Playwright) : boo (PERSONNAGE) apparaît à l'endroit (plus de flip), capé à ratio 0.085×0.100 du bbox contour (axe limitant exactement à 1/10, jamais agrandi) ; décor hybride toujours capé à fitScale(...,0.92) (ratio hauteur 0.92, comportement inchangé) ; packing/loadProject non affectés (chemin opts.scale non null).

### T2 — Tactile : pinch-zoom + pan deux doigts + touch-action + cibles agrandies · Modèle : Sonnet
- **Pourquoi ce modèle :** interaction Konva multi-touch (jugement) + validation tactile.
- **But :** zoom/pan au doigt sur tablette, sans casser souris/molette desktop.
- **Lire :** `src/app.js` — Konva stage/`tr`/`moveHandle` (L17-101), handler `wheel` (L90-101),
  `resize` (L103-105) ; `src/style.css` (entier) ; `index.html` (`<main id="stage">`, header hint).
- **Modifier :** `src/app.js`, `src/style.css`.
- **Hors périmètre :** pas la sidebar repliable (T3), pas l'édition stylet (T6). Ne change pas la logique
  de sélection/export.
- **Étapes :**
  1. `style.css` : sur `#stage` (ou son conteneur) ajouter `touch-action: none;` (empêche le navigateur de
     scroller/zoomer la page sous le doigt). Agrandir les **boutons** (`.btn`, `.btn.sm`) à une cible
     tactile ≥ 40px de haut (padding) **sans** dégrader le desktop (rester sobre).
  2. `app.js` : agrandir `tr` `anchorSize` (10 → ~16) et le rayon de `moveHandle` (14 → ~20) pour le doigt.
  3. `app.js` : ajouter le **pinch-to-zoom + pan deux doigts** sur le stage via `touchmove`/`touchend`
     (deux pointeurs) : mémoriser la distance et le centre des deux touches au départ ; à chaque
     `touchmove` à 2 doigts, échelle = ratio des distances (bornée comme la molette : 0.1–8), recentrer
     sur le **point milieu** comme le fait `wheel` (même maths de recadrage stage). À `touchend`, réinit.
     Désactiver `stage.draggable` **uniquement** pendant un geste 2 doigts puis le rétablir (sinon le pan
     1 doigt Konva natif reste pour déplacer la vue hors édition).
  4. `app.js` : après un zoom tactile, appeler `positionMoveHandle()` (comme `wheel`).
  5. `index.html` : compléter le `hint` du header (« pincer = zoom · deux doigts = déplacer la vue »).
- **Validation :**
  - auto : `node --check src/app.js`.
  - visuel : **OBLIGATOIRE (tablette ou émulation tactile navigateur)** — pincer zoome centré entre les
    doigts, deux doigts panent ; un doigt sur un motif le sélectionne/déplace ; molette + glisser fond
    desktop inchangés ; la page elle-même ne scrolle/zoome pas sous le doigt.
- **Si bloqué :** si `stage.draggable` (pan natif Konva 1 doigt) entre en conflit avec le pinch, **STOP**
  et signale avant d'implémenter un pan manuel complet (on veut le minimum). Ne pas introduire de lib.
- **Commit :** `feat(app): tactile — pinch-zoom + pan deux doigts + cibles agrandies`
- **Statut :** [x] fait (code) · exécuté par : Sonnet · le : 2026-06-22 · commit : — (validation visuelle tactile restant à faire par Thibault)

### T3 — Layout responsive : sidebar repliable · Modèle : Sonnet
- **But :** sur écran étroit (tablette portrait), pouvoir replier la sidebar pour gagner le canevas.
- **Lire :** `index.html` (`#app`, `#sidebar`, `<main id="stage">`, header) ; `src/style.css` (entier).
- **Modifier :** `index.html`, `src/style.css`, `src/app.js` (uniquement le câblage du bouton + un
  `stage.width/height` après bascule).
- **Hors périmètre :** ne change pas le contenu de la sidebar ni les interactions canevas (T2).
- **Étapes :**
  1. `index.html` : ajouter un bouton **☰** (toggle) dans le header.
  2. `style.css` : sous un breakpoint (ex. `max-width: 900px`), la sidebar devient un panneau
     **rétractable** (classe `.collapsed` sur `#app` ou `#sidebar` : largeur 0 / hors-écran translaté,
     transition courte). En desktop large, comportement actuel inchangé.
  3. `app.js` : `onclick` du toggle bascule la classe, puis `stage.width(stageEl.clientWidth);
     stage.height(stageEl.clientHeight); stage.batchDraw();` (réutiliser la logique du handler `resize`).
- **Validation :**
  - auto : `node --check src/app.js`.
  - visuel : **OBLIGATOIRE** — en fenêtre étroite, ☰ replie/déplie la sidebar et le canevas se
    redimensionne ; en large, rien ne change.
- **Si bloqué :** si le redimensionnement du stage laisse une zone morte, réutiliser exactement le handler
  `resize` existant ; toute hésitation layout → STOP.
- **Commit :** `feat(ui): sidebar repliable (responsive tablette)`
- **Statut :** [x] fait · exécuté par : Sonnet · le : 2026-06-22 · commit : — (pas de git initialisé, cf. STATUS backlog)

### T4 — Géométrie : tracé→polygone + union/différence de surface + silhouette depuis surface · Modèle : Sonnet
- **Pourquoi ce modèle :** cœur géométrique (Clipper, offset, booléens) ; validation `node test/run.js`.
- **But :** fournir les primitives que T6 appellera : transformer une polyligne stylet en polygone épais,
  unir/soustraire ce polygone à une surface `{color:[{pts,closed}]}`, recalculer une silhouette.
- **Lire :** `src/geometry.js` (entier — réutiliser `toInt/fromInt`, `unionInt`, `clipBy`, `offsetPolygon`/
  `insetPolygon`, `absArea`, `signedArea`, `motifSilhouette`) ; `DECISIONS.md §D-006` (chantier 3).
- **Imiter :** `ML.offsetPolygon`/`insetPolygon` (patron ClipperOffset déjà en place).
- **Modifier :** `src/geometry.js`.
- **Hors périmètre :** pas d'`app.js`, pas de rendu, pas d'UI. Ne touche pas `occludeSurfaces`.
- **Étapes :**
  1. `ML.strokeToPolygon(pts, radiusPx)` : offset **open-round** (ClipperOffset `jtRound`, `etOpenRound`)
     de la polyligne `pts` avec `delta = radiusPx` → renvoie `[{pts,closed:true}, …]` (≥1 contour fermé).
     Réutiliser la mécanique d'`offsetPolygon` (mêmes échelle entière `×1000`, arrondi) ; un seul point
     (clic sans déplacement) → cercle (gérer `pts.length===1` en offsetant un micro-segment).
  2. `ML.surfaceUnion(contours, addContours)` : union Clipper (closed, `pftNonZero`) de deux jeux de
     contours fermés → `[{pts,closed:true}]`. Réutiliser `unionInt`/`fromInt`. Conserve les trous
     (orientation) comme `motifFill`.
  3. `ML.surfaceDifference(contours, cutContours)` : `clipBy(contours, cutContours, ctDifference)` (déjà
     batché correctement depuis T11) → `[{pts,closed:true}]`.
  4. `ML.silhouetteFromSurface(contours)` : contour(s) extérieur(s) d'un jeu de contours fermés (pour le
     fond blanc sticker + occluder) — réutiliser la logique de `motifSilhouette` (union des contours,
     garder les enveloppes extérieures). Si trivial, déléguer à `motifSilhouette` adaptée à une entrée
     « contours » plutôt que « zones ».
- **Validation :**
  - auto : `node test/run.js` → **inchangé** (les nouveaux helpers ne sont pas encore appelés ; vérifie
    juste la non-régression). + test direct des helpers (adapter le chargement de `clipper.js`/`geometry.js`
    sur le patron déjà utilisé en tête de `test/run.js`) :
    `strokeToPolygon([[0,0],[100,0]],10)` → ≥1 contour fermé ;
    `surfaceUnion([carré], stroke)` → ≥1 contour ; `surfaceDifference(union, stroke)` → ≥1 contour ;
    aucun crash ni `NaN`.
  - visuel : —
- **Si bloqué :** si `ClipperOffset`/`etOpenRound` n'est pas exposé par le `clipper.js` vendored, **STOP**
  et signale (ne pas patcher `vendor/`). Si `unionInt`/`clipBy` ne sont pas accessibles, les exposer via
  `ML.` **sans** réécrire leur logique (comme fait en T2 du Lot 1).
- **Commit :** `feat(geometry): strokeToPolygon + union/différence de surface + silhouetteFromSurface`
- **Statut :** [x] fait · exécuté par : Sonnet · le : 2026-06-22 · commit : — (pas de git initialisé, cf. STATUS backlog)

### T5 — Surface override : lecture de `motif.surface` partout (rendu/export/silhouette) + persistance · Modèle : Sonnet
- **Pourquoi ce modèle :** modif transverse du chemin de rendu/export, risque de désalignement.
- **But :** quand `motif.surface` existe, l'utiliser **à la place** de la surface dérivée des zones,
  partout, et le sauvegarder/charger. **Aucune UI d'édition ici** (T6).
- **Lire :** `src/app.js` — `exportFill` (L160-166), `drawThumb` (L168-188), `fillGroupContent`
  (L196-224), `rerenderMotif` (L226-232), `instancesBottomToTop` (L564-584), `saveProject` (L602-622),
  `loadProject` (L623-654) ; `DECISIONS.md §D-006` (chantier 3, « Modèle »).
- **Modifier :** `src/app.js`.
- **Hors périmètre :** pas d'outil stylet (T6), pas de géométrie (T4 fournit les helpers).
- **Étapes :**
  1. `exportFill(motif)` : **si `motif.surface` existe**, le renvoyer tel quel (`{ [color]: [...] }`) ;
     sinon comportement actuel (fusion `motifFill` sous couleur focale). C'est le **point d'entrée unique**
     → `drawThumb`, `fillGroupContent`, `instancesBottomToTop` en héritent sans autre changement (vérifier
     qu'ils passent bien tous par `exportFill`).
  2. Silhouette : ajouter un helper local `motifSilhouettePts(motif)` = si `motif.surface` →
     `ML.silhouetteFromSurface(toutes les contours de surface)` ; sinon `motif.silhouette`. Remplacer les
     usages de `motif.silhouette` dans `fillGroupContent` (fond blanc + ligne see-through) et
     `instancesBottomToTop` (`silhouette`/`decorClear`) par ce helper. **Ne pas** muter `motif.silhouette`
     ici (T6 le recalcule à l'édition) — lecture seule.
  3. `saveProject` : `motif.surface` est déjà sérialisé s'il est sur l'objet motif (les motifs sont
     poussés tels quels) — vérifier qu'il part bien dans le JSON.
  4. `loadProject` : un motif chargé avec `surface` doit être accepté (déjà le cas, on pousse `m`) ;
     s'assurer qu'on **ne recalcule pas** `silhouette` par-dessus une `surface` présente d'une façon qui
     désaligne (garder la silhouette stockée ; sinon `silhouetteFromSurface`).
- **Validation :**
  - auto : `node --check src/app.js` ; `node test/run.js` (non-régression du flux sans `surface`).
  - visuel : **OBLIGATOIRE** — sans `surface`, tout rend comme avant (motif/décor identiques) ; en
    injectant manuellement un `motif.surface` simple (via console) puis `rerenderMotif`, l'instance + la
    vignette affichent la surface injectée ; save→load conserve la `surface`.
- **Si bloqué :** si un chemin de rendu/export n'utilise PAS `exportFill` (surface dérivée ailleurs),
  **STOP** et signale la liste exacte avant de dupliquer la condition.
- **Commit :** `feat(app): motif.surface prime sur les zones (rendu/export/silhouette) + persistance`
- **Statut :** [x] fait · exécuté par : Sonnet · le : 2026-06-22 · commit : — (pas de git initialisé, cf. STATUS backlog)

### T6 — Mode édition au stylet : pinceau / gomme, verrouillage sur le motif · Modèle : Sonnet
- **Pourquoi ce modèle :** interaction pointeur + intégration géométrie + validation manuelle au stylet.
- **But :** sur un motif sélectionné, entrer en mode édition, dessiner (pinceau) / effacer (gomme) au
  stylet, en restant verrouillé sur ce motif ; chaque coup mute `motif.surface` et re-rend.
- **Lire :** `src/app.js` — `select`/`selected` (L64-79), `makeGroup` (L233-241), `rerenderMotif`
  (L226-232), `exportFill` (après T5), gestion clic/pan (L82-101), tactile (T2) ; sortie T4 (helpers) ;
  `index.html` `#inspector` (L67-98) ; `src/style.css` ; `DECISIONS.md §D-006` (chantier 3).
- **Imiter :** `populateMotifEditor`/câblage inspecteur (L430-456) pour l'UI ; `decorFit`/transform pour
  le passage écran→local.
- **Modifier :** `src/app.js`, `index.html`, `src/style.css`.
- **Hors périmètre :** pas de changement des helpers géométrie (T4), pas de l'export (déjà via T5). Pas
  d'édition par instance (portée = motif, D-006).
- **Étapes :**
  1. `index.html` : dans `#inspector`, ajouter un bloc **« Édition (stylet) »** : bouton bascule
     `#btn-edit` (Entrer/Sortir), deux boutons outils `#tool-brush` / `#tool-eraser` (radio visuel), un
     `#brush-size` (mm, `type=range` ou number). Caché si pas de sélection de motif (comme `#motif-editor`).
  2. État `edit = { active:false, motifId:null, tool:"brush", sizeMm:3 }`. `enterEdit()` : exige un motif
     sélectionné ; mémorise `motifId` ; **verrouille** : `stage.draggable(false)`, masquer `tr`+`moveHandle`,
     ignorer la (dé)sélection (le handler `click tap` du stage et des autres groupes ne change pas la
     sélection tant que `edit.active`). `exitEdit()` : restaure `stage.draggable(true)`, ré-affiche les
     poignées, re-sélectionne le motif.
  3. **Initialisation paresseuse** : au 1ᵉʳ coup, si `motif.surface` absent → `motif.surface =
     exportFill(motif)` (copie profonde des contours) — D-006.
  4. **Tracé** : sur le groupe de l'instance en édition, capter `pointerdown/move/up` (Konva
     `mousedown/move/up` + `touch*`, ou pointer events) : pendant un trait, accumuler les points en
     **coordonnées locales du motif** = `g.getAbsoluteTransform(mainLayer).copy().invert().point(...)`
     puis diviser par l'échelle de l'instance ? → non : `getAbsoluteTransform(mainLayer)` mappe local→
     mainLayer ; inverser pour mainLayer→local. Vérifier sur un cas simple. Un doigt/stylet = trait ;
     **deux doigts = pan** (le geste 2 doigts de T2 reste prioritaire, ne pas dessiner à 2 pointeurs).
  5. **Fin de trait** (`pointerup`) : `poly = ML.strokeToPolygon(localPts, (sizeMm*PX_PER_MM)/2)` ;
     `key = motif.color` ; `motif.surface[key] = (tool==="brush")
     ? ML.surfaceUnion(motif.surface[key]||[], poly)
     : ML.surfaceDifference(motif.surface[key]||[], poly)`. Puis **recalculer** `motif.silhouette =
     ML.silhouetteFromSurface(toutes les contours de motif.surface)` (occlusion/fond blanc cohérents).
     `rerenderMotif(motif)` (re-rend toutes les instances + vignette).
  6. **Aperçu du trait en cours** (optionnel, si simple) : une `Konva.Line` temporaire dans `uiLayer`
     suivant le pointeur, supprimée au `pointerup`. Si non trivial, s'en passer (STOP-friendly).
  7. Curseur/halo de taille de pinceau (optionnel) : ne pas bloquer dessus.
- **Validation :**
  - auto : `node --check src/app.js`.
  - visuel : **OBLIGATOIRE (stylet/tactile ou souris)** — sélectionner un motif → « Entrer » ; pinceau :
    dessiner ajoute de la matière (couleur focale) ; gomme : effacer retire de la matière (trou) ;
    pendant l'édition, cliquer ailleurs **ne change pas** la sélection et ne pane pas à un doigt ; deux
    doigts panent ; « Sortir » restaure poignées + pan ; toutes les copies du motif suivent ; export SVG
    reflète la surface éditée ; save→load conserve l'édition.
- **Si bloqué :** si le mapping écran→local du tracé produit un décalage (le trait n'atterrit pas sous le
  stylet), **STOP** et signale avec un exemple chiffré (ne pas empiler des facteurs d'échelle au hasard).
  Si la mutation Clipper produit des artefacts (trous inversés, slivers), **STOP** (problème T4).
- **Commit :** `feat(app): mode édition stylet (pinceau/gomme) verrouillé sur le motif`
- **Statut :** [x] fait · exécuté par : Sonnet · le : 2026-06-22 · commit : — (pas de git initialisé, cf. STATUS backlog) — validé fonctionnellement (Playwright, souris — cf. validation T6 admet « stylet/tactile ou souris ») : import `boo.svg` → sélection → « Entrer en édition » verrouille (clic fond pendant l'édition ne désélectionne pas, vignette inchangée tant qu'aucun trait) ; un trait pinceau modifie la vignette (matière ajoutée) ; un trait gomme au même endroit la modifie à nouveau (matière retirée) ; « Sortir » restaure la désélection au clic fond ; `saveProject` → JSON contient `motif.surface` avec au moins un contour par couleur focale ; `exportSVG` reste bien formé (`<svg>`/`<path>`) après édition. Mapping écran→local via `Konva.Node.getRelativePointerPosition()` (équivalent à l'inversion de `getAbsoluteTransform` suggérée, plus direct) — aucun décalage observé. Verrouillage implémenté en bloquant `select()` au niveau des handlers `click tap` (stage/groupes/zones/cadre) + `draggable(false)` sur toute la pile (`setCanvasLocked`) ; `duplicateSel`/`deleteSel` ignorés pendant l'édition (évite de détruire/dupliquer le nœud verrouillé) ; `loadProject`/« Tout effacer » appellent `exitEdit()` avant reset.

### T7 — Contexte + README hébergement tablette · Modèle : Haiku
- **But :** refléter le Lot 3 dans la doc et documenter l'hébergement statique pour la tablette.
- **Lire :** `STATUS.md`, `SPEC.md`, `PROJECT_MAP.md`, `README.md`, `CLAUDE.md` ; `DECISIONS.md §D-006`
  (déjà écrit) ; ce PLAN (statuts réels après T1-T6).
- **Modifier :** `STATUS.md`, `SPEC.md`, `PROJECT_MAP.md`, `README.md` ; `CLAUDE.md` seulement si une
  commande devient fausse.
- **Hors périmètre :** ne pas réécrire D-006 (fait foi) ; ne pas re-toucher le code.
- **Étapes :**
  1. `STATUS.md` : marquer fait ce qui l'est (import calibré, tactile, sidebar repliable, surface override,
     mode stylet), lister ce qui reste/limites (édition par motif et non par instance ; couleur focale
     unique sous édition ; perf surface sur gros décor à surveiller).
  2. `SPEC.md` : ajouter une section « Édition au stylet » (surface override, pinceau/gomme, verrouillage)
     et « Usage tablette » (tactile + hébergement) ; mettre à jour `motif.surface` dans le modèle motif et
     la persistance.
  3. `PROJECT_MAP.md` : citer `strokeToPolygon`/`surfaceUnion`/`surfaceDifference`/`silhouetteFromSurface`
     (geometry) et le mode édition (app).
  4. `README.md` : section « Utiliser sur tablette » — héberger les fichiers statiques (ex. déposer le
     dossier sur Netlify/Vercel ou activer GitHub Pages), ouvrir l'URL ; rappeler que c'est sans build.
- **Validation :** auto : `node --check src/app.js src/geometry.js`. visuel : —
- **Si bloqué :** si une section devient ambiguë (historique vs actuel), dater plutôt que supprimer.
- **Commit :** `docs: contexte Lot 3 (import calibré, tablette, édition stylet) + README hébergement`
- **Statut :** [x] fait · exécuté par : Haiku · le : 2026-06-22 · commit : — (pas de git initialisé, cf. STATUS backlog) — mis à jour STATUS/SPEC/PROJECT_MAP/README avec Lot 3 (T1-T6), ajout sections mode stylet + usage tablette + hébergement statique, modèle motif enrichi avec `surface` override

## Dépendances / ordre

```
T1  (import)            indépendante
T2  (tactile zoom/pan)  indépendante  ─┐
T3  (sidebar repliable) après/avec T2  │ (chantier tablette)
T4  (géométrie)         indépendante  ─┐
T5  (surface override)  indépendante   │ (chantier édition)
T6  (mode stylet)       après T2 + T4 + T5
T7  (contexte/README)   après T1–T6
```
T1, T2, T4, T5 sont parallélisables. T3 après T2 (réutilise le resize). T6 dépend du tactile (T2, pour
le pan 2 doigts), des helpers (T4) et du chemin de lecture surface (T5). T7 en dernier.

## Après le lot — mise à jour du contexte (obligatoire)

- [x] **PLAN** : chaque tâche faite → `[x]` + exécuté par / le / commit.
- [x] **STATUS.md** : état réel (ce qui marche / casse / limites).
- [x] **Autres fichiers de contexte modifiés** : `SPEC.md`, `PROJECT_MAP.md`, `README.md` (T7) ;
  `DECISIONS.md` (D-006, déjà écrit) ; `CLAUDE.md` si une commande change.
- [x] **Vérifier qu'aucun fichier de contexte n'est devenu faux** (orientation, échelle, persistance).
- [ ] Commits atomiques par tâche ; init git du dépôt toujours en backlog (STATUS).
