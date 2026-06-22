# STATUS.md

Photo à l'instant T : ce qui marche, ce qui casse. Mis à jour en fin de session.

> **Frontières** — **STATUS** : état actuel + backlog futur · **PLAN.md** : tâches actives en cours d'exécution.

> **Dernière mise à jour :** 2026-06-22

## Phase actuelle

Phase 2 — pipeline SVG + zones (Lot 1, `DECISIONS.md §D-004`). **Atteint (T1-T7).**

Objectif : faire passer l'outil du DXF au SVG de bout en bout — motifs décomposés en zones
REMPLI/VIDE (édition de rôle), surface gravée = union des régions REMPLI par couleur, occlusion par
surfaces (plus par traits), export SVG couleur/`evenodd` en mm. Retrait total du DXF (entrée + sortie).

Lot 2 (décor / personnage / symbole, `DECISIONS.md §D-005`) : **T8-T11 faits**, T12 (doc) restant —
voir `PLAN.md`.

Lot 3 (import calibré, tablette, édition stylet, `DECISIONS.md §D-006`, `PLAN_tablette_edition.md`) : **T1-T6 faits** (code), **T7 en cours** (contexte/README).

## Ce qui fonctionne

- **Import SVG motifs** (multi) → bibliothèque avec vignettes (corps + couleurs + trous) ; clic = pose une instance.
- **Détection de zones automatique** (`ML.buildZones`) : parent = plus petit sous-chemin de même couleur contenant le point intérieur, rôle par défaut alterné avec la profondeur. **Éditeur de rôles** (REMPLI↔VIDE) par motif sélectionné, re-rend toutes les instances + la vignette.
- **Rendu écran fidèle** : fond silhouette blanc + surfaces `evenodd` par couleur (Konva `sceneFunc` + canvas 2D pour les vignettes).
- **Import contour SVG** (seul mode désormais) : sous-chemins fermés → corps + **cavités/trous auto-réservés** ; **échelle mm réelle** via dimensions saisies (calibration intégrée) ; **corps rendu en BLANC** (zone à graver), cavités creusées, masque hors-corps. Validé sur `Guitare sur fond blanc creusée.svg` → corps exact 440×325 mm, 5 cavités.
- **Zones interdites manuelles** (rectangles éditables) en complément : soustraites à l'export + évitées par le packing.
- **Guides de gravure** (purement visuels, n'affectent pas l'export) : marge de sécurité = offset intérieur réglable (mm) du contour ; cadre laser Falcon 2 = rectangle 400×415mm (dimensions modifiables) déplaçable/orientable.
- Édition manuelle : sélection (motif ou zone), poignées rotation/échelle, glisser, `Suppr`, `Ctrl+D`, `[`/`]` (z-order), molette zoom, pan.
- Packing assisté : dispersion de N motifs dans le contour, évite les zones.
- **Export SVG en mm**, couleur (un `fill` par groupe) + `fill-rule="evenodd"`, avec **occlusion par surfaces** (silhouettes au-dessus soustraites de la surface remplie) + clip corps + soustraction zones interdites.
- Save/load projet JSON (motifs avec zones, contour, zones interdites, instances) ; un motif d'un ancien format (`polylines`, sans `zones`) est ignoré et journalisé plutôt que de planter le chargement.
- **DXF entièrement retiré** : plus de `src/dxf.js`, plus d'import/export DXF, plus de script `dxf.js` chargé par `index.html`.
- **Validé en headless** : `test/run.js` réécrit pour le flux SVG (parse 3 motifs d'exemple → zones → `motifFill` → occlusion par surfaces → `writeSVG`), écrit `test/out_occluded.svg`.
- **Validé en navigateur réel** (Playwright, cette session) : import motif → toggle de zone (œil VIDE→REMPLI, rendu + vignette suivent) ; composition de 2 instances chevauchantes → export SVG → surface masquée absente, trou respecté.
- **Lot 2 — rôles motif (T8-T9, `DECISIONS.md §D-005`)** : chaque motif porte `role` (PERSONNAGE/SYMBOLE/DECOR) + `color` (couleur focale) + `margin` (mm), posés par défaut depuis `ROLE_DEFAULTS` à l'import. **3 boutons d'import distincts** : « Importer personnages… » (`#import-perso`), « Importer symboles… » (`#import-symbole`), section « Décor » avec « Importer décor… » (`#import-decor`) — tous alimentent la même bibliothèque cliquable. **Rendu par couleur focale** (`exportFill`) : toutes les surfaces REMPLI d'un motif fusionnent sous sa couleur de rôle (noir perso / rouge symbole / bleu décor) à l'écran (instance + vignette) comme à l'export. **Décor see-through** : pas de fond silhouette blanc (contrairement aux motifs normaux) → ses vides laissent voir ce qui est placé dessous ; le z-order (`▲▼⏫⏬`) le traite comme une instance normale, déplaçable devant/derrière. Validé visuellement (Playwright) : perso noir+fond blanc, symbole rouge+fond blanc, décor bleu sans fond, occultation devant/derrière confirmée sur l'ordre des nœuds Konva.
- **Lot 2 — inspecteur rôle/couleur/marge (T10)** : motif sélectionné → `#motif-editor` (select rôle, `<input type="color">`, marge mm). Changer le rôle réapplique `ROLE_DEFAULTS` (couleur+marge) ; changer couleur/marge seuls conserve un override manuel. Re-rend toutes les instances du motif + sa vignette. Validé visuellement (Playwright).
- **Lot 2 — occlusion décor + export multi-couleur (T11, `DECISIONS.md §D-005`)** : `ML.offsetPolygon` (offset positif, factorisé depuis `insetPolygon`) ; chaque instance fournit `occluder` (silhouette, ou surface réelle avec vides pour un décor) + `decorClear` (silhouette élargie de sa marge) ; `ML.occludeSurfaces` applique la règle `maskFor(j,i) = (i est DECOR) ? decorClear_j : occluder_j` du haut vers le bas. `exportSVG`/`instancesBottomToTop` utilisent désormais `exportFill` (couleur focale, décor inclus). Validé en headless (`node test/run.js`, cas décor dédié avec preuves numériques du halo et du passage par les vides) et visuellement (Playwright) : export 3 couleurs, halo blanc autour du perso posé, symbole flush, perso caché visible seulement par une fente du décor.
- **Lot 3 — sidebar repliable (T3, `PLAN_tablette_edition.md`)** : bouton `☰` dans le header bascule `.collapsed` sur `#app` ; sous `max-width:900px`, la sidebar transitionne vers largeur 0 (sinon comportement desktop inchangé). `app.js` factorise `syncStageSize()` (resynchronise `stage.width/height`), appelée immédiatement au clic + sur `transitionend` de `#sidebar` pour capter la taille finale après la transition CSS. Validé visuellement (Playwright, fenêtre étroite vs large) : repli/dépli sans zone morte, aucun changement en fenêtre large.
- **Lot 3 — import calibré (T1, `PLAN_tablette_edition.md §D-006`)** : retrait du flip Y dans `buildMotifFromSVG` (motifs **à l'endroit**) ; plafond d'échelle à l'ajout : motif normal ≤ **1/10** du bbox contour, décor ≤ **1/1** (via `fitScale` généralisée). Ajout manuel seul (packing/save+load non affectés). Validé en navigateur (Playwright) : import `boo.svg` orientation correcte, capé à 0.085×0.100 du bbox, décor hybrid inchangé, packing préservé.
- **Lot 3 — interactions tactiles (T2, `PLAN_tablette_edition.md`)** : pinch-to-zoom (deux doigts, centré) + pan deux doigts, sans dégradation desktop (molette/glisser-fond inchangés) ; `touch-action:none` sur `#stage` ; anchorSize du Transformer agrandis (10→16), rayon moveHandle (14→20) pour le doigt ; cibles tactiles `.btn` ≥40px. Code implémenté. Validation tactile restant à faire (Thibault en Playwright/simulateur de toucher).
- **Lot 3 — helpers géométrie (T4, `PLAN_tablette_edition.md`)** : `ML.strokeToPolygon(pts, radiusPx)` (offset open-round ClipperOffset), `ML.surfaceUnion(contours, addContours)`, `ML.surfaceDifference(contours, cutContours)`, `ML.silhouetteFromSurface(contours)` pour l'édition stylet. Validés en isolation (helpers implémentés, pas de régression `node test/run.js`).
- **Lot 3 — surface override (T5, `PLAN_tablette_edition.md`)** : `motif.surface` = `{[color]:[{pts,closed}]}` (px local) **prime** sur surface dérivée des zones partout (rendu/export/silhouette) ; persisté en save/load. Point d'entrée unique via `exportFill`. Validé en navigateur (console : surface injectée puis `rerenderMotif` → vignette + instances mises à jour, save/load préservé).
- **Lot 3 — mode édition stylet (T6, `PLAN_tablette_edition.md`)** : bouton bascule « Entrer/Sortir » édition ; outils pinceau/gomme + slider taille (mm) ; verrouillage motif (sélection bloquée, `stage.draggable(false)`, poignées masquées) ; tracé en coordonnées locales motif via `getRelativePointerPosition()` ; fin de trait = `strokeToPolygon` → `surfaceUnion`/`surfaceDifference` sur `motif.surface[motif.color]`, recalcul `silhouette`, `rerenderMotif`. Validé en navigateur (Playwright, souris) : traits pinceau ajoutent matière, traits gomme retirent matière, « Sortir » restaure état, `motif.surface` persisté/exporté SVG correct, toutes copies du motif suivent l'édition.

## Ce qui casse / n'est pas testé

- **Édition stylet (Lot 3 T6)** : **validation tactile restant à faire** — code implémenté (Playwright confirmé en souris/un doigt), simulation tactile navigateur ou tablette réelle recommandée avant usage production.
- **Édition par instance vs par motif** : l'édition stylet mute `motif.surface` (partagé par toutes les instances) — édition par instance seule non supportée (limitation D-006).
- **Couleur unique sous édition** : le pinceau/gomme opère sur `motif.color` (couleur focale) ; édition multi-couleurs par motif non supportée.
- **`src/svg.js` ignore `<g transform="…">`** : un SVG dont les `<path>` sont enveloppés dans un groupe avec translate/scale (ex. exports `potrace` typiques) s'importe à une échelle absolue fausse (proportions correctes, taille mm erronée). Constaté pendant la validation T5 (export d'un motif à ~1750mm au lieu de ~175mm). Pas corrigé — voir `SPEC.md` TODO.
- **`vendor/clipper.js:6986`** fait un `module.exports = ClipperLib;` inconditionnel (hors du garde `typeof module`) → lève une `ReferenceError: module is not defined` non bloquante dans la console navigateur. Cosmétique, sans impact fonctionnel constaté. Pas corrigeable sans toucher `vendor/` (interdit) ou risquer de casser le chargement UMD de Konva — voir `Plan correction UI post audit.md §Non traité`.
- Occlusion ~1 s pour ~40 instances (acceptable ; à surveiller au-delà de ~100) — non re-mesuré depuis le passage aux surfaces (probablement plus coûteux qu'avant, à profiler si lenteur perçue).
- Validation navigateur faite via automation (Playwright + Chromium déjà en cache localement), pas encore par usage manuel direct de Thibault.
- **⚠️ Nouveau goulot d'étranglement sur le décor : `motifSilhouette` + `motifFill`** (geometry.js), pas `buildZones` (résolu, voir « Corrigé » plus bas). Mesuré en isolation sur `decor hybride.svg` (3936 sous-chemins) : `motifSilhouette` ~8 s, `motifFill` ~6,3 s → l'import perçu en navigateur reste ~14-16 s malgré le fix `buildZones`. Cause probable : mêmes opérations Clipper (union) appliquées à un volume de points très supérieur aux motifs normaux, sans préfiltre. Non corrigé — candidat pour un futur lot perf (cf. backlog).

### Corrigé 2026-06-22 (T3 — zone morte au redéploiement de la sidebar)

- **Bug découvert pendant la validation de T3** : après repli **puis redéploiement** de la sidebar
  (fenêtre étroite), elle ne retrouvait pas ses 270px mais se figeait à ~25px (zone morte). Cause :
  `#stage` est un flex item sans `min-width` explicite ; par défaut `min-width:auto` borne sa taille
  minimale au contenu, et le wrapper Konva (largeur CSS fixée en px par `stage.width()`) avait gardé la
  largeur pleine écran fixée pendant le repli — empêchant le flex item de rétrécir quand la sidebar
  réclamait sa place. **Fix** : `min-width: 0;` ajouté à la règle `#stage` (`src/style.css`) — fix
  standard du piège « canvas/Konva dans un flex container ». Détecté et corrigé via Playwright
  (mesure de `#sidebar`/`#stage`/`canvas` à plusieurs instants pendant la transition CSS).

## Backlog

### À faire

- [ ] **Lot 2 — Décor/Personnage/Symbole** (`DECISIONS.md §D-005`, `PLAN.md` T8-T12) : rôles + couleur focale + marge par motif, imports par rôle, inspecteur rôle/couleur/marge, occlusion `maskFor` (posé/gravé/caché) + export multi-couleur **faits (T8-T11)** ; reste la doc (T12).
- [ ] Profiler/optimiser `ML.motifSilhouette` + `ML.motifFill` pour les gros SVG de décor (~8s + ~6,3s constatés sur 3936 sous-chemins — `ML.buildZones` lui n'est plus le goulot, voir « Ce qui casse » et `Plan correction UI post audit.md` T4).
- [ ] Corriger `src/svg.js` pour supporter `<g transform="…">` (translate/scale) — fausse échelle sinon sur certains SVG.
- [ ] **Points d'ancrage** : faire dialoguer un motif avec un bouton (ex. bouton = œil / centre de vinyle) — au-delà des zones interdites.
- [ ] Magnétisme / alignement ; marge blanche « sticker » optionnelle ; densité de packing contrôlée.
- [ ] Initialiser un dépôt git pour le projet (toujours pas fait).

### Bugs connus

- `src/svg.js` n'applique pas `<g transform>` → échelle d'import potentiellement fausse (voir ci-dessus).
- `vendor/clipper.js` lève une erreur console non bloquante (`module is not defined`).

### Corrigé 2026-06-22 (poignée de déplacement)

- **Pastille de déplacement** au centre de la sélection (`moveHandle` dans `uiLayer`, `src/app.js`) :
  pastille bleue + icône 4-flèches, `mousedown` → `node.startDrag()` (Konva gère le suivi pointeur,
  pas de saut ni de maths d'échelle). Repositionnée sur `select()`, `stage.dragmove/dragend`,
  `tr.transform` et au zoom molette. Utile surtout pour le décor see-through (centre souvent vide) :
  on attrape la pastille au lieu de viser un trait. Le glisser direct du corps reste possible.

### Corrigé 2026-06-22 (décor : ajustement au contour + sélectionnable)

Constaté par Thibault : un décor importé arrive **beaucoup plus grand que le contour** et reste
**non sélectionnable/non déplaçable** (poignées hors écran, fond non cliquable). Corrigé dans `src/app.js` :

- **Auto-ajustement à l'ajout (`decorFit`)** : un motif de rôle DECOR est désormais mis à l'échelle et
  centré pour tenir dans le bbox du contour (ou, à défaut de contour, dans la vue courante), à 92 %
  pour ne pas coller au bord. Ne s'applique qu'au décor et seulement si l'ajout ne force pas déjà
  `x`/`scale` (donc save/load et packing inchangés). Traite la cause racine de « décor trop grand »
  (échelle absolue SVG + `svg.js` ignore `<g transform>`).
- **Décor cliquable/déplaçable** : le fond see-through du décor passe de `Konva.Line` muette
  (`fillEnabled:false`) à un `fill:"rgba(0,0,0,0)"` — invisible à l'écran mais peint sur le canvas de
  hit (colorKey opaque), donc toute la silhouette est de nouveau cliquable et déplaçable. Combiné à
  l'auto-ajustement, les poignées du Transformer reviennent dans le champ de vision.
- Validé : `node test/run.js` OK (géométrie/export inchangés), `node --check src/app.js` OK. **À vérifier
  manuellement en navigateur** : import décor → tient dans le contour, clic-glisser + poignées OK.

### Corrigé 2026-06-22 (Plan correction UI post audit — T1-T5)

Suite à `Rapport audit UI.md` (audit Playwright du flux décor réel). Détail complet et vérification
navigateur dans `Plan correction UI post audit.md`.

- **T1 — `RangeError: Maximum call stack size exceeded` à l'export d'une composition avec le décor réel** :
  `exportSVG` calculait la bbox finale via `Math.max(...allPts.map(...))` (spread) — dépasse la pile JS
  sur les gros volumes de points du décor. Remplacé par le helper `minMax()` déjà utilisé ailleurs
  (`app.js:exportSVG`). Vérifié : export décor+perso+symbole abouti, SVG ~9,8 Mo, aucun `NaN`/`Infinity`.
- **T2 — Déplacement du décor corrompait sa transformation Konva (`NaN`)** : le décor (see-through, D-005)
  n'a pas de fond silhouette blanc comme les motifs normaux, donc son groupe Konva n'avait aucune bbox
  mesurable → le Transformer/drag divisait par une géométrie dégénérée. Fix : `Line` invisible
  (`fillEnabled:false, strokeEnabled:false`) ajoutée en premier enfant du groupe décor, restaure la bbox
  sans rien peindre (`app.js:fillGroupContent`). Remplace une tentative antérieure incomplète
  (`shape.getSelfRect` par surface, retirée). Vérifié par glisser-déposer réel (Playwright) : attrs du
  groupe après déplacement tous numériques.
- **T3 — Éditeur de zones génère ~3936 lignes DOM à la sélection du décor** (sidebar ~92 000 px, timeouts).
  Garde ajoutée dans `populateZoneEditor` : décor ou motif >300 zones → message court au lieu de la liste
  (`app.js`) ; `#zone-list` borné en hauteur + scroll (`style.css`).
- **T4 — `ML.buildZones` ~35-40s sur le décor réel** : préfiltre bbox ajouté avant le `pointInPoly` coûteux
  dans la recherche de parent (`geometry.js:buildZones`) — condition nécessaire (un point dans un polygone
  est forcément dans sa bbox), donc sortie strictement identique (`node test/run.js` non affecté). Mesuré
  en isolation : **35-40s → ~1,2s** (~30×). L'import perçu en navigateur reste ~14-16s car le goulot s'est
  déplacé vers `motifSilhouette`/`motifFill` (hors périmètre de ce fix, voir « Ce qui casse » + backlog).
- **T5 — `GET /favicon.ico 404` polluait la console** : favicon SVG inline en data-URI ajouté dans
  `index.html`.

### Corrigé 2026-06-22 (Lot 2, D-005, T10-T11)

- **Bug latent dans `clipBy` (geometry.js, écrit en T5) : les trous d'un motif s'inversaient en surface pleine après occlusion.** `clipBy` soumettait chaque contour du sujet **indépendamment** à son propre `Clipper.Execute`. Pour un sujet multi-contours avec trous (sortie de `ML.motifFill`, où un trou est encodé par une aire signée **négative** relative à ses contours sœurs), ce découpage par contour isolé détruit la relation d'orientation entre contours : un trou ressort avec un signe d'aire **inversé** (donc « rempli » au lieu de « soustrait ») dès qu'il traverse `clipBy` — vérifié avec un masque qui ne touche même pas le contour (no-op géométrique, le signe s'inversait quand même). Affectait potentiellement toute occlusion d'un motif à trous depuis T5 (Lot 1 compris), révélé en validant l'occlusion décor de T11 (aires avant/après incohérentes). **Fix** : `clipBy` soumet désormais tous les contours du sujet **en une seule fois** (`AddPaths`) à un seul `Execute`, qui préserve la règle `pftNonZero` entre contours sœurs — pas de réécriture de la mécanique Clipper, juste un sujet batché au lieu d'un sujet par contour. `ML.signedArea` ajouté (alias de l'`area()` interne) pour permettre aux validations de sommer une aire nette (trous en négatif).

### Corrigé 2026-06-22 (Lot 2, D-005, T8-T9)

- **`RangeError: Maximum call stack size exceeded` à l'import d'un décor volumineux** : `buildMotifFromSVG`/`drawThumb` calculaient le centrage/bbox via `Math.min(...xs)`/`Math.max(...xs)` (spread) — dépasse la pile JS au-delà de quelques dizaines de milliers de points. Remplacé par un helper `minMax()` en boucle. Découvert et corrigé pendant la validation visuelle obligatoire de T8/T9 sur `decor hybride.svg` (549k points).

### Corrigé 2026-06-22 (Lot 1, D-004)

- **Pipeline DXF → SVG de bout en bout** (T1-T7) : parser SVG par couleur (`ML.parseSVG`), détection de
  zones REMPLI/VIDE (`ML.buildZones`), régions/surfaces par couleur (`ML.regionOf`/`ML.motifFill`),
  rendu écran `evenodd`, éditeur de rôles de zones, occlusion par surfaces (`ML.occludeSurfaces`),
  export SVG couleur (`ML.writeSVG`), retrait total du DXF (entrée + sortie + `src/dxf.js`), test
  headless réécrit en flux SVG.

### Corrigé 2026-06-21

- **Occultation à l'écran qui ne se faisait pas** (et z-order sans effet visible) : les motifs réels (splines/LWPOLYLINE, DXF — depuis retiré) avaient un contour extérieur **fragmenté en plusieurs morceaux ouverts** ; remplacé par un chaînage des fragments en boucle fermée (fallback enveloppe convexe). Devenu sans objet depuis le retrait du DXF, conservé ici pour mémoire.

### Dette technique

- Packing = dispersion naïve (pas de contrôle fin densité/recouvrement).
- `src/svg.js` : pas de gestion de `<g transform>` (voir bugs connus).
- Occlusion par surfaces non re-mesurée en performance depuis D-004.

## Validation manuelle

- [x] Navigateur (automatisé, Playwright) : import SVG, édition de zones, export SVG — voir « Ce qui fonctionne ».
- [ ] Desktop navigateur principal, usage manuel direct par Thibault : ouvrir `index.html`, importer des motifs SVG réels, éditer, exporter, vérifier dans Falcon Design Space.
- [ ] Mobile / tablette : non prévu.
- [ ] Build production : N/A (sans build).
- [ ] Déploiement : N/A (local).
