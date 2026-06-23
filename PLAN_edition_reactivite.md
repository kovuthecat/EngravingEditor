# PLAN_edition_reactivite.md — Plan d'exécution   (rédigé par Opus)

> **Exécutants (Sonnet / Haiku / Codex)** : faites UNIQUEMENT votre tâche.
> Suivez les **Étapes dans l'ordre**. Lisez UNIQUEMENT les fichiers sous « Lire ».
> Ne créez AUCUN fichier ni dépendance hors « Modifier ». Le design est fixé par Opus —
> ne reconcevez pas. Doute ou blocage → **STOP**, signalez, rendez la main. N'improvisez pas.
> Format de référence : WORKFLOW.md §4.

- **Date :** 2026-06-22 · **Rédigé par :** Opus · **Branche :** —
- **Plan parent / lié :** `PLAN_tablette_edition.md` (D-006, mode stylet) · `Plan correction UI post audit.md` (perf décor) · `DECISIONS.md` (D-004/005/006)

## Objectif global

Lot 4 : rendre l'édition **fluide** et **non destructive façon Procreate**, fiabiliser la **sélection**
(box + clic), ajouter un **export PNG**, étendre le **guide offset** aux vides internes, et **alléger la
sidebar**. Réponses produit de Thibault (2026-06-22) intégrées : calque **d'essai** (pas multi-calques) ;
outils pinceau évolués + ligne/formes + lasso ; export **garde le miroir** ; 4 blocs UI repliés.

## Contexte / décision clé (proposition **D-007** à acter dans DECISIONS.md à la fin du lot)

- **Stack figée** : classic scripts, pas d'ES modules, `file://`. Globaux `window.ML`, `Konva`,
  `ClipperLib`. **`vendor/*` interdit d'édition.** Toute modif géométrique (zones/occlusion/export)
  **doit passer `node test/run.js` à sortie identique** (sauvegarder `test/out_occluded.svg` avant, diff après).
- **Édition = vecteur** (Clipper), jamais raster (D-006). Le calque d'essai reste des polygones.
- **Calque d'essai (D-007)** : l'édition ne mute plus `motif.surface` à chaque trait. Elle accumule
  dans un **brouillon** `edit.draft` (surface de travail, couleur focale) rendu sur un **calque Konva dédié**
  superposé à l'instance éditée. Les autres instances et le motif de bibliothèque **ne changent pas**
  pendant l'essai. **Appliquer** → `motif.surface = edit.draft`, recalcul silhouette, `rerenderMotif`
  (toutes instances + vignette), une seule fois. **Jeter** → on abandonne le brouillon. Portée = motif
  (cohérent D-006). Gain perf : le re-render lourd n'a lieu qu'à l'application.
- **Brouillons multiples en attente (D-007, ajout Thibault 2026-06-23)** : quitter l'édition d'un motif avec
  un brouillon modifié ne force plus Appliquer/Jeter — le brouillon est **rangé** dans `editDrafts` (map par
  `motifId`, **session uniquement, non sérialisée**). Revenir sur ce motif **restaure** son brouillon. Un
  **compteur « N essais en attente »** + un bouton **« Tout appliquer »** + un **garde-fou à l'export** (SVG
  ET PNG avertissent s'il reste des essais non appliqués) évitent l'oubli. Choix : les brouillons en attente
  **ne sont pas rendus** sur les instances non éditées (sinon on perd le gain perf — autant appliquer).
- **Cause racine perf** (mesurée à l'audit) : tout est sur `mainLayer` ; le décor `sceneFunc` re-trace des
  milliers de contours **à chaque frame** de drag/zoom. Correctif Konva standard = `node.cache()`
  (rasterise le groupe en bitmap ; on déplace une image au lieu de re-tracer).
- **Cause racine box/clic/occlusion** : `ML.motifSilhouette` ne garde **que le plus gros morceau** d'union
  ([geometry.js:185](src/geometry.js#L185)). Conséquences : (a) le fond blanc + la bbox du groupe ne
  couvrent que ce blob ; (b) **à l'export, un motif en plusieurs morceaux n'occulte que par son plus gros
  bloc** — les autres morceaux ne masquent rien derrière eux. **Décision Thibault (2026-06-22) : tout le
  motif doit occulter ce qui est derrière lui** (chaque membre/élément séparé). On fait donc passer la
  silhouette en **multi-contours** (`motif.silhouette` = **liste** de contours fermés) **partout** :
  écran (fond blanc), bbox/sélection (`getSelfRect`), **et occlusion d'export** (occulteur = toutes les
  pièces). Les surfaces `sceneFunc` (dessinées sur `ctx._context` brut) reçoivent en plus `getSelfRect` +
  `hitFunc` (mesurables + cliquables).
- **Décor** : déjà conforme — son occulteur est sa **surface réelle `motifFill`** (toutes les branches /
  racines pleines occultent ; seuls ses **vides** laissent voir derrière, comportement D-005 voulu). T1 ne
  change donc rien au décor côté occlusion ; il ne touche que la silhouette des motifs normaux.
- **Export** : Thibault **garde le miroir vertical** du SVG (`pxPathsToMm` fait `-y`, cœur inchangé). En
  revanche le **PNG sort dans le sens écran** (rendu direct depuis le px monde, sans `-y`) — divergence
  volontaire d'orientation entre les deux exports.

---

## Tâches

### T1 — Silhouette multi-contours partout (occlusion + box + fond blanc) · Modèle : Sonnet
- **Pourquoi ce modèle :** modif du **cœur géométrique** (occlusion) + nombreux sites d'appel Konva ;
  `node test/run.js` à **re-baseliner** et validation navigateur + Falcon obligatoires.
- **But :** que **tout le motif occulte ce qui est derrière lui** (chaque morceau séparé), et que le
  Transformer/pastille/fond blanc couvrent l'ensemble. `motif.silhouette` devient une **liste de contours
  fermés** au lieu d'un polygone unique, utilisée partout (écran ET export).
- **Lire :** `src/geometry.js` `ML.motifSilhouette` (185-198), `ML.silhouetteFromSurface` (231-233),
  `ML.offsetPolygon` (156-159) ; `src/app.js` `buildMotifFromSVG` (165-183), `motifSilhouettePts` (218-221),
  `fillGroupContent` (251-280), `drawThumb` (223-243), `fitScale` (303-319), `instancesBottomToTop`
  (765-785), `loadProject` (recalcul silhouette, 837-843).
- **Modifier :** `src/geometry.js` (`motifSilhouette` + `silhouetteFromSurface` → multi-contours),
  `src/app.js` (tous les consommateurs de `motif.silhouette`).
- **Hors périmètre :** ne pas changer `motifFill`/`regionOf`/`occludeSurfaces` (la **mécanique** d'occlusion
  reste ; on ne change QUE la forme de l'occulteur d'un motif normal) ; le **décor reste occulté par sa
  surface réelle** (`fillPolys`), pas par sa silhouette — ne pas y toucher.
- **Étapes :**
  1. `geometry.js` : faire renvoyer à `ML.motifSilhouette(zones)` **toutes** les pièces de l'union des
     contours `depth===0` → `[[ [x,y].. ], ...]` (liste de contours fermés), plus seulement la plus grande.
     Idem `ML.silhouetteFromSurface(contours)`. Chaque contour est fermé (1er point répété).
  2. **Normaliser le modèle** : `motif.silhouette` est désormais une liste de contours. Ajouter un petit
     helper de compat `asContours(sil)` dans `app.js` qui enveloppe un ancien format (polygone unique
     `[[x,y]..]`, projets sauvegardés avant ce lot) en `[sil]` — détecter via `Array.isArray(sil[0][0])`.
     L'utiliser partout où on lit `motif.silhouette`.
  3. `fillGroupContent` : pour un motif **non-décor**, ajouter **une `Konva.Line` blanche par contour** ;
     pour le **décor**, **une `Konva.Line` transparente par contour** (bbox mesurable, voir T2). Plus de
     `silhouette.flat()` unique.
  4. `getSelfRect` sur chaque `Konva.Shape` de surface (bbox de ses contours, boucle sans spread, cf.
     `minMax`) → le groupe couvre la surface peinte entière (Transformer + `positionMoveHandle`).
  5. `drawThumb` : bbox = min/max sur **tous** les contours de silhouette ; tracer un poly blanc par contour.
  6. `fitScale` : bbox sur tous les contours de `motif.silhouette`.
  7. `instancesBottomToTop` : `silPieces = asContours(motifSilhouettePts(m)).map(mapPts)`. Pour un motif
     normal, **`occluder = silPieces`** (toutes les pièces, plus `[silhouette]`). `decorClear` =
     `silPieces.flatMap(p => ML.offsetPolygon(p, marginPx))`. Décor : `occluder` reste `fillPolys` (inchangé).
  8. `loadProject` : le recalcul de silhouette renvoie déjà une liste (via les fonctions modifiées) ; ne pas
     re-wrapper.
- **Validation :**
  - auto : `node test/run.js` tourne sans erreur. **La sortie `test/out_occluded.svg` VA changer** (occlusion
    plus complète) — c'est **attendu**. Procédure : sauver l'ancien `out_occluded.svg`, lancer, **comparer
    visuellement** le nouveau (rendu via `exemple motif/falcon-test/` ou ouverture navigateur) → les morceaux
    secondaires d'un motif **masquent maintenant** ce qui est dessous ; aucune surface fantôme, pas de `NaN`.
  - visuel : composer un perso multi-blocs au-dessus d'un autre motif → **chaque** morceau du perso du dessus
    cache la partie recouverte ; Transformer entoure tout ; décor : motif derrière une branche **caché**,
    visible seulement dans les vides (D-005 préservé).
  - Falcon : ouvrir le `pattern.svg` exporté d'une compo multi-blocs → géométrie cohérente (pas de traits
    fantômes sous un morceau).
- **Si bloqué :** si un consommateur de `motif.silhouette` lit encore l'ancien format à plat et plante
  (`flat()` sur une liste de contours), STOP et signaler le site manqué (ne pas re-aplatir globalement, ce
  qui casserait l'occlusion multi-pièces).
- **Commit :** `feat(occlusion): silhouette multi-contours — tout le motif occulte (box + fond inclus)`
- **Statut :** [x] fait   ·   exécuté par : Sonnet   ·   le : 2026-06-23   ·   commit : (voir `git log` — message ci-dessus)

### T2 — Cliquer sur n'importe quelle partie visible pour attraper le motif · Modèle : Sonnet
- **Pourquoi ce modèle :** subtilité Konva (canvas de hit vs `ctx._context`), validation navigateur.
- **But :** sélectionner/attraper un motif en cliquant **n'importe où sur sa surface peinte visible**, pas
  seulement sur le fond blanc.
- **Lire :** `src/app.js` `fillGroupContent` (251-280) ; doc Konva `hitFunc` (de mémoire — sinon STOP).
- **Modifier :** `src/app.js` (`fillGroupContent` uniquement).
- **Hors périmètre :** ne pas réécrire le `sceneFunc` (le rendu visuel reste identique) ; ne pas modifier
  l'occlusion d'export.
- **Étapes :**
  1. Diagnostic confirmé : le `sceneFunc` peint sur `ctx._context` (canvas brut) → rien n'est inscrit sur
     le **canvas de hit** Konva → la surface n'est pas cliquable, seul le fond blanc l'est (et seulement le
     plus gros blob avant T1).
  2. Ajouter à chaque `Konva.Shape` de surface un `hitFunc(ctx, shape)` qui **remplit les mêmes contours
     via l'API Konva** (`ctx.beginPath(); contours → ctx.moveTo/lineTo/closePath; ctx.fillStrokeShape(shape)`)
     pour que Konva peigne la colorKey sur le canvas de hit. Garder `fill-rule` : un clic dans un vide
     (trou VIDE) **ne** doit **pas** sélectionner (laisser passer dessous) → respecter evenodd dans le hit.
  3. Pour le **décor** (see-through), le hit reste porté par la `Line` transparente existante (déjà
     `listening:true`) ; ne pas ajouter de hit opaque qui le rendrait sélectionnable dans ses vides.
- **Validation :**
  - auto : `node test/run.js` → OK (rien de géométrique).
  - visuel : composer 2 motifs ; cliquer un trait visible du motif du dessus loin de son centre → il se
    sélectionne ; cliquer dans un trou VIDE du motif du dessus → on attrape ce qui est dessous, pas lui.
- **Si bloqué :** si l'API `fillStrokeShape`/`hitFunc` ne se comporte pas comme prévu (rien de cliquable),
  STOP et signaler — ne pas réintroduire de fond opaque qui casserait l'occlusion.
- **Commit :** `fix(select): hitFunc sur les surfaces (cliquer toute partie visible)`
- **Statut :** [x] fait   ·   exécuté par : Sonnet   ·   le : 2026-06-23   ·   commit : (voir `git log` — message ci-dessus). Validation visuelle laissée à Thibault (non faite par l'exécutant).

### T3 — Réactivité : cache Konva des groupes d'instances · Modèle : Sonnet
- **Pourquoi ce modèle :** jugement Konva (cache/invalidation), mesure FPS en navigateur obligatoire.
- **But :** rendre le drag/zoom/rotation **fluides** même avec un décor lourd, en rasterisant chaque groupe
  d'instance en bitmap (`node.cache()`), réinvalidé seulement quand sa géométrie change.
- **Lire :** `src/app.js` `makeGroup` (289-298), `fillGroupContent` (251-280), `rerenderMotif` (281-288),
  `addInstance` (321-340), les handlers `tr.on("transformend")` (89) et `g.on("dragend")` (295).
- **Modifier :** `src/app.js` (uniquement : `makeGroup`/`fillGroupContent`/`rerenderMotif` + invalidation).
- **Hors périmètre :** **après T1 et T2** (le cache doit inclure `getSelfRect`+`hitFunc`, donc les poser
  d'abord) ; ne pas changer la géométrie ni l'export ; ne pas cacher le décor see-through s'il perd sa
  transparence (vérifier visuellement — sinon STOP).
- **Étapes :**
  1. Après avoir peuplé un groupe (`fillGroupContent`), appeler `g.cache()` (Konva rasterise scène **et**
     hit). Vérifier que le hit reste correct après cache (le `hitFunc` de T2 est pris dans le cache).
  2. **Invalider/recacher** au bon moment : à la fin de `rerenderMotif` (géométrie changée), et sur
     `transformend` du nœud sélectionné (`g.clearCache(); g.cache()`) pour ré-affiner après un gros
     changement d'échelle (le bitmap caché se déforme sinon). Pas de recache pendant le drag (inutile).
  3. Si un `pixelRatio` par défaut floute trop au zoom fort, passer `g.cache({ pixelRatio: 2 })` (compromis
     mémoire/qualité) — laisser un commentaire.
  4. Vérifier le **décor see-through** : le cache ne doit pas peindre un fond noir/opaque ; si la
     transparence est perdue, STOP et signaler (ne pas forcer).
- **Validation :**
  - auto : `node test/run.js` → OK.
  - visuel : décor réel + ~10 motifs ; déplacer/zoomer → déplacement **nettement plus fluide** qu'avant
    (idéalement >30 FPS, comparer ressenti) ; rendu identique ; sélection/clic (T1/T2) toujours bons après
    cache ; export inchangé.
- **Si bloqué :** si le cache casse la transparence du décor ou le hit, STOP — ne pas désactiver T2 pour
  faire passer.
- **Commit :** `perf(render): cache Konva des groupes d'instances (drag fluide)`
- **Statut :** [x] fait   ·   exécuté par : Sonnet   ·   le : 2026-06-23   ·   commit : (voir `git log` — message ci-dessus). Validation visuelle (FPS, transparence décor, hit après cache) laissée à Thibault (non faite par l'exécutant). Note non prévue par le plan : `startStroke` (édition stylet) ajoute l'aperçu de trait comme enfant du groupe édité — un groupe caché n'afficherait pas cet ajout tardif. Ajout d'une garde dans `fillGroupContent` (pas de cache pendant `edit.active` sur ce nœud) + recache dans `exitEdit`. **Régression corrigée (Opus, 2026-06-23) :** cette garde seule était insuffisante — le groupe est mis en cache **à la création** (alors que `edit.active` est encore `false`), donc à l'entrée en édition il affichait un bitmap figé : aucun trait visible avant la sortie. Correctif = `g.clearCache()` + `mainLayer.batchDraw()` dans `enterEdit()` (le groupe rend ses enfants en direct pendant l'édition ; `exitEdit` recache). `node test/run.js` toujours OK. **À revérifier en navigateur : le trait pinceau/gomme est désormais visible pendant le dessin ET après application, en mode édition.**

### T4 — Réactivité : fondre maskLayer dans zonesLayer (6 → 5 calques) · Modèle : Sonnet
- **Pourquoi ce modèle :** refactor de rendu à risque visuel léger, validation navigateur.
- **But :** réduire d'un calque (avertissement Konva « >5 layers ») **sans changer l'aspect**, en
  supprimant `maskLayer` et en déplaçant sa `Konva.Shape` de masque comme **enfant du bas** de
  `zonesLayer` (donc juste **au-dessus** de `mainLayer`, à la même place qu'aujourd'hui dans la pile).
- **Correction de conception (Opus, 2026-06-23 — l'ancien T4 était erroné) :** l'ancien plan disait de
  fusionner `boundaryLayer` + `maskLayer` (« les deux calques `listening:false` »). **Impossible :** ils
  **enjambent `mainLayer`** — `boundaryLayer` est **sous** les motifs (fond blanc du corps, sur lequel les
  motifs se peignent), `maskLayer` est **au-dessus** (il repeint en couleur de fond tout ce qui déborde du
  corps : bords courbes du décor mis à l'échelle sur la bbox, cavités). Un calque unique n'occupe **qu'une**
  position dans la pile → il ne peut pas être à la fois sous et au-dessus de `mainLayer`. On retire donc
  l'autre calque `listening:false` superflu (`maskLayer`) en le **fondant dans le calque adjacent du
  dessus** (`zonesLayer`), ce qui préserve l'ordre de rendu **à l'identique**.
- **Lire :** `src/app.js` création des calques (20-26), `drawBoundary` (497-533, en particulier le bloc
  masque 522-531 et les `destroyChildren`/`batchDraw` 498-499 et 532), `setLocked`/toggle verrou (≈640,
  `zonesLayer.getChildren().forEach(... draggable)`), `loadProject` (892, 907-909).
- **Modifier :** `src/app.js` (déclaration des calques + `drawBoundary` + la ligne `draggable` du verrou).
- **Hors périmètre :** ne pas toucher `boundaryLayer`/`mainLayer`/`guideLayer`/`uiLayer` ; ne rien changer à
  la géométrie du contour ni du masque (mêmes points, même `evenodd`) ; ne pas toucher l'export.
- **Étapes :**
  1. Supprimer la déclaration `const maskLayer = …` (22) et la retirer du `stage.add(...)` (26) → il reste
     `boundaryLayer, mainLayer, zonesLayer, guideLayer, uiLayer` (5 calques).
  2. Dans `drawBoundary`, la `Konva.Shape` du masque (522-531) est désormais **ajoutée à `zonesLayer`** avec
     un attribut repère `isMask` (`sh.setAttr("isMask", true)`), `listening:false`, puis **`sh.moveToBottom()`**
     pour qu'elle reste sous les zones interdites (donc à la même hauteur visuelle qu'avant : au-dessus des
     motifs, sous zones/cadre/ui).
  3. Remplacer les `maskLayer.destroyChildren()` (498) et `maskLayer.batchDraw()` (499, 532) : pour le
     **destroy**, ne **pas** vider `zonesLayer` (ça supprimerait les zones interdites !) — détruire
     **uniquement** l'ancien masque : `zonesLayer.findOne((n) => n.getAttr("isMask"))?.destroy()` (ou une
     boucle `getChildren((n)=>n.getAttr("isMask")).forEach(d=>d.destroy())`). Pour le **draw**, utiliser
     `zonesLayer.batchDraw()`.
  4. **Verrou (≈640)** : `zonesLayer.getChildren().forEach((z) => z.draggable(!locked))` engloberait le
     masque ; restreindre aux zones réelles : `zonesLayer.getChildren((n) => n.getAttr("isZone")).forEach(...)`
     (le masque est `listening:false`, donc inoffensif, mais on évite de le rendre « draggable »).
  5. **Vérif `loadProject`** (rien à coder, juste valider l'ordre) : 892 fait `zonesLayer.destroyChildren()`
     (supprime aussi l'ancien masque), puis 907 `drawBoundary()` **recrée** le masque dans `zonesLayer`
     (en bas), puis 908 `makeZone(...)` rempile les zones **par-dessus**. Ordre préservé.
- **Validation :**
  - auto : `node test/run.js` → OK (aucune géométrie touchée).
  - visuel : import contour → aspect **identique** (corps blanc, cavités creusées, hors-corps en couleur de
    fond, marge ambre visible) ; un motif/décor qui déborde du corps est **toujours masqué** ; les **zones
    interdites restent visibles et cliquables** par-dessus le masque ; charger un projet avec zones →
    masque + zones bien rendus ; console : **plus d'avertissement « 6 layers »**.
- **Si bloqué :** si après le merge le masque **recouvre les zones interdites** (mauvais ordre → il n'est
  pas `moveToBottom`) ou si `zonesLayer.destroyChildren` efface le masque sans que `drawBoundary` le recrée
  (zones qui disparaissent), STOP et signaler — ne pas remettre `maskLayer`, ne pas vider `zonesLayer` dans
  `drawBoundary`.
- **Commit :** `perf(render): fond maskLayer dans zonesLayer (5 calques, ordre inchangé)`
- **Statut :** [x] fait   ·   exécuté par : Sonnet   ·   le : 2026-06-23   ·   commit : (voir `git log` — message ci-dessus). Validation visuelle (aspect identique, débord motif/décor toujours masqué, zones cliquables par-dessus, console sans avertissement 6 layers) laissée à Thibault (non faite par l'exécutant).

### T5 — Calques d'essai multiples (édition non destructive : Appliquer / Jeter / Tout appliquer) · Modèle : Sonnet
- **Pourquoi ce modèle :** chantier central (état d'édition multi-brouillons + Konva + perf + garde-fou
  export), validation navigateur lourde.
- **But :** éditer sur un **brouillon** sans modifier le motif ni ses copies ; pouvoir **laisser un brouillon
  en attente**, éditer un autre motif, **y revenir** (le brouillon est restauré) ; **Appliquer** valide le
  motif courant, **Jeter** l'abandonne, **Tout appliquer** valide tous les essais en attente d'un coup.
  Supprime le re-render à chaque trait (gain perf majeur).
- **Décision de conception (Thibault, 2026-06-23) :** un brouillon en attente **reste visible** sur ses
  instances, **rendu en vert** (couleur provisoire `EDIT_DRAFT_COLOR`, ~`#22c55e`) tant qu'il n'est pas
  validé. Pas de coût perf par frame : on ne fait **qu'un seul `rerenderMotif`** à la transition (sortie
  d'édition / Appliquer / Jeter), pas un re-render par trait — le vert est *baked* dans le cache du groupe
  (suit drag/zoom). Le vert **remplace** l'affichage de la surface réelle (gère la gomme correctement), il
  n'est pas une simple surcouche. En complément : un **compteur « N essais en attente »**, un bouton
  **« Tout appliquer »**, et un **garde-fou à l'export** (SVG ET PNG avertissent s'il reste des essais non
  appliqués). Le brouillon vert est **display-only** : l'export utilise toujours `motif.surface` (réel) tant
  qu'on n'a pas appliqué.
- **Lire :** `src/app.js` bloc édition stylet (628-743) : `edit`, `enterEdit`/`exitEdit`, `applyStroke`,
  `startStroke`/`moveStroke`/`endStroke`, handlers stage (720-733), `btn-edit` (740) ; `exportSVG` (786-800) ;
  suppression d'instance/motif (purge des brouillons orphelins) ; `index.html` `#stylet-editor` (92-103) ;
  `DECISIONS.md §D-006` (portée = motif).
- **Modifier :** `src/app.js` (bloc édition + `fillGroupContent`/`drawThumb` pour le rendu vert + garde-fou
  export), `index.html` (`#stylet-editor` : boutons Appliquer/Jeter + bloc global « N essais en attente /
  Tout appliquer », placé près des exports), `src/style.css` (styles boutons + compteur).
- **Hors périmètre :** portée inchangée (= motif, D-006) ; pas de raster ; **ne pas sérialiser** les
  brouillons dans la sauvegarde projet (session uniquement) ; ne pas modifier le cœur d'export
  (`pxPathsToMm`/occlusion) ; le vert est **display-only** (n'entre jamais dans l'export ni l'occlusion).
- **Étapes :**
  1. `editLayer` : `Konva.Layer` (ou groupe sur `uiLayer`) visible seulement en édition, calé sur
     `edit.node.getAbsoluteTransform()`.
  2. **Map de brouillons** : `const editDrafts = new Map()` (clé `motifId` → `{ surfaceByColor, dirty }`),
     **non sérialisée**.
  3. `enterEdit` : si `editDrafts.has(motif.id)`, **restaurer** ce brouillon dans `edit.draft` ; sinon
     `edit.draft = copie profonde de exportFill(motif)[couleur focale]`, `edit.dirty=false`. Rendre
     `edit.draft` sur `editLayer` (une `Konva.Shape` evenodd, couleur focale).
  4. Chaque trait/outil (T6/T7/T8) mute **`edit.draft`** (Clipper union si pinceau / différence si gomme) via
     `surfaceUnion`/`surfaceDifference`, met `edit.dirty=true`, et **redessine uniquement `editLayer`** (pas de
     `rerenderMotif`).
  5. **Rendu vert du brouillon en attente** : dans `fillGroupContent`, si `editDrafts.has(motif.id)`, rendre
     **le brouillon** (`editDrafts.get(id).surfaceByColor`) **en `EDIT_DRAFT_COLOR` (~`#22c55e`)** au lieu de
     `motif.surface` (le vert *remplace* l'affichage → gomme correcte). Idem `drawThumb` (vignette verte =
     repère « ce motif a un essai en attente »). La **silhouette/occlusion reste celle du réel** (`motif.silhouette`,
     non modifié) — le vert est purement visuel. Comme c'est dans `fillGroupContent`, le vert est *baked* dans
     le cache du groupe → suit drag/zoom sans coût par frame.
  6. `exitEdit` : si `edit.dirty`, **ranger** `edit.draft` dans `editDrafts` (plus de confirm bloquant) ;
     nettoyer `editLayer` ; **`rerenderMotif(motif)` une fois** (les instances passent au vert via l'étape 5) ;
     rafraîchir le compteur. Restaurer le reste de l'état (comme aujourd'hui).
  7. **« Appliquer au motif »** (motif courant) → `recordHistory()` ; `motif.surface = { [couleur]: edit.draft }` ;
     `motif.silhouette = ML.silhouetteFromSurface(...)` ; retirer `motif.id` d'`editDrafts` ; `rerenderMotif(motif)`
     (une fois → repasse de vert à la couleur réelle) ; `edit.dirty=false`.
  8. **« Jeter l'essai »** → retirer `motif.id` d'`editDrafts`, ré-initialiser `edit.draft` depuis le motif,
     `edit.dirty=false` ; `rerenderMotif(motif)` (repasse au réel) + redessiner `editLayer` si encore en édition.
  9. **« Tout appliquer (N) »** (visible hors édition aussi) → `recordHistory()` **une fois** ; pour chaque
     entrée d'`editDrafts` : appliquer comme étape 7 (surface, silhouette, `rerenderMotif`) ; vider la map ;
     rafraîchir le compteur.
  10. **Compteur** : afficher « N essais en attente » + bouton « Tout appliquer » dès `editDrafts.size > 0`.
  11. **Garde-fou export** : dans `exportSVG` (et `exportPNG` de T9), si `editDrafts.size > 0`, **avertir/
      confirmer** « N essais non appliqués — appliquer maintenant ? » (Appliquer-tout / Exporter quand même /
      Annuler).
  12. **Purge** : à la suppression d'une instance/d'un motif (et après undo qui supprime un motif), retirer
      l'entrée correspondante d'`editDrafts` (pas de brouillon orphelin).
  13. Vérifier que `recordHistory`/undo encadrent **l'application** (simple ou Tout appliquer), pas chaque
      trait du brouillon.
- **Validation :**
  - auto : `node test/run.js` → OK.
  - visuel : éditer le motif A (peindre), quitter sans valider → A (toutes ses instances + sa vignette)
    s'affiche **en vert** + badge « 1 essai en attente » ; éditer B, **revenir sur A** → le brouillon de A
    est **restauré** (édition en couleur réelle pendant le tracé, vert au repos) ; **Tout appliquer** → A et B
    repassent à leur couleur réelle, instances + vignettes à jour, map vidée, badge à 0 ; **Jeter** sur un
    essai → vert retiré, motif intact ; déplacer/zoomer un motif en attente → le vert **suit** sans gel
    (baked au cache) ; tenter un export avec un essai en attente → **avertissement**, et le SVG/PNG exporté
    contient la **couleur réelle** (pas le vert) ; chaque trait reste **instantané** (plus de gel par trait).
- **Si bloqué :** si la restauration décale le brouillon (mapping écran→local), STOP (réutiliser
  `getRelativePointerPosition` comme l'actuel `localPoint`) ; si un brouillon orphelin subsiste après
  suppression, STOP et signaler.
- **Commit :** `feat(edit): calques d'essai multiples (Appliquer / Jeter / Tout appliquer)`
- **Statut :** [x] fait   ·   exécuté par : Sonnet   ·   le : 2026-06-23   ·   commit : (voir `git log` — message ci-dessus). `editLayer` implémenté comme groupe sur `uiLayer` (pas un `Konva.Layer` dédié, pour rester à 5 calques après T4) calé sur `edit.node.getAbsoluteTransform(mainLayer).decompose()`. `effectiveDraft`/restauration lisent `Object.values(surfaceByColor)[0]` plutôt que la clé `motif.color` (robuste si la couleur focale change pendant qu'un essai est en attente). « Tout appliquer » range d'abord le brouillon live non rangé (s'il existe) avant de boucler sur `editDrafts`, pour ne pas perdre les derniers traits non encore mis en attente. Garde-fou export câblé sur `exportSVG` (PNG suivra en T9). Validation visuelle (restauration de brouillon, vert qui suit drag/zoom, Appliquer/Jeter/Tout appliquer, export avec avertissement) laissée à Thibault (non faite par l'exécutant).

### T6 — Pinceau : tailles mémorisées + profil rond / plat · Modèle : Haiku
- **Pourquoi ce modèle :** mécanique, paramétrage d'un helper existant + UI simple.
- **But :** offrir plusieurs tailles rapides et un profil de bout **rond** (actuel) **ou plat** au pinceau/gomme.
- **Lire :** `src/geometry.js` `ML.strokeToPolygon` (206-214) ; `src/app.js` `edit`/`setEditTool`/handlers
  pinceau (582-690) ; `index.html` `#stylet-tools` (95-102).
- **Modifier :** `src/geometry.js` (`strokeToPolygon` : paramètre de profil), `src/app.js` (état + câblage),
  `index.html` (boutons tailles + sélecteur de profil).
- **Hors périmètre :** pas de pot de remplissage (écarté par Thibault) ; ne pas toucher l'union/différence.
- **Étapes :**
  1. `strokeToPolygon(pts, radiusPx, endType)` : ajouter un paramètre optionnel `endType` (`"round"` par
     défaut = `etOpenRound` actuel ; `"flat"` = `etOpenButt` ; joints `jtRound` conservés). Défaut
     inchangé → pas de régression.
  2. `app.js` : `edit.profile = "round"` ; passer `edit.profile` à `strokeToPolygon` dans `applyStroke`
     (et dans les outils T5/T7). Boutons de taille rapides (ex. 1 / 3 / 8 mm) qui fixent `edit.sizeMm`.
  3. `index.html` : 2-3 boutons de taille + un petit toggle profil rond/plat dans `#stylet-tools`.
- **Validation :**
  - auto : `node test/run.js` → OK (défaut `round` inchangé).
  - visuel : tracer en rond puis en plat → bouts de trait visiblement différents ; boutons de taille
    changent l'épaisseur.
- **Si bloqué :** si `etOpenButt` n'existe pas sous ce nom dans `ClipperLib.EndType`, STOP et signaler.
- **Commit :** `feat(edit): tailles rapides + profil rond/plat du pinceau`
- **Statut :** [x] fait   ·   exécuté par : Sonnet   ·   le : 2026-06-23   ·   commit : (voir `git log` — message ci-dessus). Validation visuelle (bouts rond/plat, boutons de taille) non faite — laissée à Thibault sur demande explicite (skip).

### T7 — Outils ligne droite + rectangle + ellipse · Modèle : Sonnet
- **Pourquoi ce modèle :** géométrie + interaction (drag de pose), validation navigateur.
- **But :** tracer des **segments droits**, **rectangles** et **ellipses** ajoutés (pinceau) ou soustraits
  (gomme) au brouillon, avec aperçu en direct.
- **Lire :** `src/app.js` bloc édition après T5 (`edit.draft`, `editLayer`, `setEditTool`) ;
  `src/geometry.js` `strokeToPolygon`/`surfaceUnion`/`surfaceDifference`.
- **Modifier :** `src/app.js` (outils + handlers), `index.html` (boutons outils), `src/geometry.js`
  seulement si un helper de polygone d'ellipse/rect est nécessaire (sinon générer les points dans app.js).
- **Hors périmètre :** dépend de **T5** (brouillon). Ne pas écrire dans `motif.surface` directement.
- **Étapes :**
  1. Ajouter `edit.tool ∈ {brush, eraser, line, rect, ellipse}` (les 2 premiers existent). Pour
     line/rect/ellipse : pointer down = point d'ancrage, move = aperçu (sur `editLayer`), up = polygone final.
  2. **Ligne** : `strokeToPolygon([a,b], radiusPx, profil)` (épaisseur = taille courante). **Rect** :
     polygone des 4 coins (Maj = carré). **Ellipse** : échantillonner ~48 points (Maj = cercle).
  3. À `up`, union/différence dans `edit.draft` selon mode pinceau/gomme, `edit.dirty=true`, redessiner
     `editLayer`.
- **Validation :**
  - auto : `node test/run.js` → OK.
  - visuel : poser une ligne, un rectangle, une ellipse en mode pinceau (ajout) puis gomme (retrait) ;
    Maj contraint carré/cercle ; aperçu suit le pointeur ; Appliquer (T5) → présent à l'export.
- **Si bloqué :** si l'aperçu reste affiché après `up`, STOP et signaler (détruire l'aperçu avant le final).
- **Commit :** `feat(edit): outils ligne / rectangle / ellipse`
- **Statut :** [x] fait   ·   exécuté par : Sonnet   ·   le : 2026-06-23   ·   commit : (voir `git log` — message ci-dessus). Précision d'implémentation non explicite dans le plan : `edit.tool` reste le set plat `{brush,eraser,line,rect,ellipse}` (un seul bouton actif à la fois), mais l'ajout/soustraction est porté par un champ séparé `edit.op` (`"add"`/`"sub"`), mis à jour seulement par les boutons Pinceau/Gomme et conservé (sticky) quand on bascule sur Ligne/Rectangle/Ellipse — pour permettre de soustraire avec une forme sans dupliquer les boutons. Maj (`shiftKey`) contraint carré/cercle ; aperçu (`Konva.Line`/`Rect`/`Ellipse`) toujours détruit à `up`. Validation visuelle (aperçu en direct, Maj, Appliquer après forme) non faite — laissée à Thibault sur demande explicite (skip).

### T8 — Lasso : sélectionner une portion (déplacer / effacer / dupliquer) · Modèle : Sonnet
- **Pourquoi ce modèle :** plus complexe (sous-sélection géométrique + transform), validation navigateur.
- **But :** entourer une portion du brouillon au lasso, puis la **déplacer**, l'**effacer** ou la
  **dupliquer** à l'intérieur du motif édité.
- **Lire :** `src/app.js` bloc édition après T5/T7 (`edit.draft`, `editLayer`) ; `src/geometry.js`
  `strokeToPolygon` (pour fermer le lasso), `surfaceUnion`/`surfaceDifference`, `clipBy`/`unionPolys`.
- **Modifier :** `src/app.js` (outil lasso + manipulation), `src/geometry.js` si un helper
  d'**intersection** de surface par un polygone est nécessaire (sinon réutiliser `clipBy` ctIntersection
  exposé via un petit wrapper `ML.surfaceIntersect`).
- **Hors périmètre :** dépend de **T5**. Pas d'édition hors du motif courant ; pas de raster.
- **Étapes :**
  1. Outil `lasso` : tracer une polyligne fermée (au `up`). `inside = surfaceIntersect(edit.draft, lasso)`,
     `rest = surfaceDifference(edit.draft, lasso)`.
  2. **Effacer** : `edit.draft = rest`. **Déplacer** : afficher `inside` comme sélection draggable sur
     `editLayer` ; à la dépose, `edit.draft = surfaceUnion(rest, inside_translaté)`. **Dupliquer** :
     `edit.draft = surfaceUnion(edit.draft, inside_translaté)`.
  3. Boutons contextuels (Déplacer / Effacer / Dupliquer) visibles tant qu'une portion est sélectionnée ;
     `Échap` annule la sélection. `edit.dirty=true` à chaque opération.
- **Validation :**
  - auto : `node test/run.js` → OK (si `ML.surfaceIntersect` ajouté, il ne doit pas changer la sortie test).
  - visuel : entourer un œil d'un motif → le déplacer ailleurs / l'effacer / le dupliquer ; Appliquer (T5)
    → reflété sur toutes les instances + export.
- **Si bloqué :** si la translation d'`inside` introduit des slivers/inversions (orientation Clipper),
  STOP et signaler (ne pas bricoler le signe d'aire — cf. note `clipBy` dans STATUS).
- **Commit :** `feat(edit): lasso (déplacer / effacer / dupliquer une portion)`
- **Statut :** [x] fait   ·   exécuté par : Sonnet   ·   le : 2026-06-23   ·   commit : (voir `git log` — message ci-dessus). `ML.surfaceIntersect` ajouté à `geometry.js` (wrapper `clipBy ctIntersection`, comme prévu en fallback). La sélection (`edit.lasso = {inside, rest, offset}`) ne mute pas `edit.draft` tant qu'aucune action n'est choisie : le glissé est géré à la main (`edit.lassoDragAnchor`, hors du flag `edit.drawing` pour ne pas re-brancher les autres outils) plutôt que via le `draggable` natif de Konva, car `editLayer` est un groupe `listening:false` (cf. T4/T5) — y activer le hit serait revenu sur ce choix. Hit-test de la sélection via un evenodd maison (`pointInContours`, comptage de parité sur `ML.pointInPoly` par contour, trous compris). Toute sortie du flux lasso (changement d'outil, sortie d'édition, Appliquer/Jeter/Tout appliquer, Échap) annule la sélection en attente (`clearLassoSelection`) — alignement avec la remarque « pas de brouillon orphelin » du plan, étendue à la sélection lasso. Validation visuelle (lasso, glissé, Déplacer/Dupliquer/Effacer, Échap, Appliquer après lasso) non faite — laissée à Thibault sur demande explicite (skip).

### T9 — Export PNG/JPEG haute définition (sens écran) · Modèle : Sonnet
- **Pourquoi ce modèle :** réutilise la chaîne d'occlusion + rasterisation contrôlée, validation visuelle.
- **But :** exporter le pattern en **PNG** (et JPEG) haute déf, **dans le sens écran** (PAS le miroir du
  SVG), sans perte de définition.
- **Lire :** `src/app.js` `exportSVG` (786-800) et `instancesBottomToTop` (765-785) ; `src/geometry.js`
  `ML.occludeSurfaces` (244-270), `ML.pxPathsToMm` (337-345) — **lire `pxPathsToMm` seulement pour
  comprendre le `-y` à NE PAS reproduire dans le PNG**.
- **Modifier :** `src/app.js` (nouvelle fonction `exportPNG` + bouton), `index.html` (bouton + champ DPI).
- **Hors périmètre :** **ne pas** modifier `pxPathsToMm`/`writeSVG`/l'occlusion (le SVG garde son miroir,
  décision Thibault) ; le PNG diverge volontairement du SVG sur l'orientation.
- **Étapes :**
  1. Réutiliser `instancesBottomToTop` + `ML.occludeSurfaces` (+ `reservedPolys`, contour) pour obtenir la
     géométrie **visible en coordonnées px monde (écran, y-bas)** — c'est-à-dire **sans** passer par
     `pxPathsToMm` (qui applique le `-y` du SVG). Le PNG doit donc rester en repère écran.
  2. Calculer la bbox px de cette géométrie (helper `minMax`, sans spread). `dpiScale = dpi / 25.4 / PX_PER_MM`
     n'a pas de sens ici car on part du px : utiliser `scale = (dpi / 25.4) * (mm_par_px)`. Concrètement :
     1 px monde = `1/PX_PER_MM` mm, donc `pxToOut = (dpi/25.4) / PX_PER_MM`. Taille canvas =
     `bboxW*pxToOut × bboxH*pxToOut` (DPI réglable, défaut 300).
  3. `<canvas>` offscreen, fond **blanc**. Translater de `-bboxMin*pxToOut`, mettre à l'échelle `pxToOut`.
     Pour chaque couleur : `ctx.fillStyle=couleur` ; tracer tous les contours **px** ; `ctx.fill("evenodd")`.
     Aucune inversion d'axe → le PNG sort exactement comme à l'écran.
  4. `canvas.toBlob` → `pattern.png` (option `image/jpeg` qualité ~0.92). Réutiliser `download`.
  5. Garde anti-mémoire : si pixels totaux > ~40 Mpx, avertir et plafonner le DPI.
  6. **Garde-fou essais (dépend de T5)** : avant d'exporter, si `editDrafts.size > 0`, appliquer le même
     avertissement/confirm qu'`exportSVG` (Appliquer-tout / Exporter quand même / Annuler).
- **Validation :**
  - auto : `node test/run.js` → OK (export SVG inchangé).
  - visuel : exporter SVG **et** PNG de la même compo → le **PNG correspond à l'écran**, le SVG reste en
    miroir vertical (comportement voulu) ; PNG net à 300 dpi ; couleurs = couleurs focales ; vides = blanc.
- **Si bloqué :** si `toBlob` est indisponible en `file://` selon le navigateur, STOP et signaler
  (fallback `toDataURL` à valider, pas inventer).
- **Commit :** `feat(export): PNG/JPEG haute déf aligné sur le SVG`
- **Statut :** [ ] à faire   ·   exécuté par : —   ·   le : —   ·   commit : —

### T10 — Guide offset autour des vides internes (vers le corps) · Modèle : Haiku
- **Pourquoi ce modèle :** ajout localisé dans `drawBoundary`, helper `offsetPolygon` déjà présent.
- **But :** tracer, comme la marge du contour mais **vers l'extérieur du vide** (= dans le corps), un guide
  offset autour de chaque cavité/trou interne (`state.holes`).
- **Lire :** `src/app.js` `drawBoundary` bloc marge (462-468) ; `src/geometry.js` `ML.offsetPolygon`
  (156-159) et `ML.insetPolygon` (149-152).
- **Modifier :** `src/app.js` (`drawBoundary`), éventuellement `index.html`/`style.css` si Thibault veut un
  réglage séparé (sinon réutiliser `state.margin.mm`).
- **Hors périmètre :** guide **visuel uniquement** (n'affecte ni l'export ni le packing) ; ne pas changer
  l'offset intérieur du contour (existant).
- **Étapes :**
  1. Dans `drawBoundary`, à côté de l'`insetPolygon` du contour, ajouter une boucle sur `state.holes` :
     pour chaque trou, `ML.offsetPolygon(hole, state.margin.mm * PX_PER_MM)` (positif = élargit le vide =
     vers le corps) et tracer chaque anneau en tirets ambre (même style que la marge contour).
  2. Conditionner au même `state.margin.show && state.margin.mm > 0` (un seul réglage pour commencer ;
     ne créer un champ séparé que si Thibault le demande).
- **Validation :**
  - auto : `node test/run.js` → OK (purement visuel).
  - visuel : importer le contour guitare creusé → un liseré ambre apparaît **autour** de chaque cavité,
    **du côté corps** (le vide est élargi), distinct de la marge du contour (qui rentre vers l'intérieur).
- **Si bloqué :** si `offsetPolygon` renvoie un polygone vide pour un trou minuscule, l'ignorer (continue),
  ne pas planter.
- **Commit :** `feat(guide): offset des vides internes vers le corps`
- **Statut :** [ ] à faire   ·   exécuté par : —   ·   le : —   ·   commit : —

### T11 — Déclutter sidebar : section « Avancé » repliée · Modèle : Sonnet
- **Pourquoi ce modèle :** réorganisation DOM/CSS avec jugement d'ergonomie, validation visuelle.
- **But :** sortir du flux principal les 4 blocs jugés inutiles par Thibault (Packing, Zones interdites,
  Cadre laser, éditeur REMPLI/VIDE par zone) en les **repliant** dans une section « Avancé » fermée par
  défaut — **sans supprimer** le code (compat projets : zones interdites toujours soustraites à l'export).
- **Lire :** `index.html` sidebar (21-128) ; `src/style.css` (sections/boutons) ; `src/app.js`
  `populateZoneEditor`/`updateInspector` (uniquement pour comprendre où vit l'éditeur de zones).
- **Modifier :** `index.html` (regroupement en `<details>`), `src/style.css` (style `<details>/<summary>`).
- **Hors périmètre :** **ne pas** retirer les `id` ni les handlers `app.js` (tout reste câblé) ; ne pas
  toucher la logique d'export/packing ; ne pas masquer l'inspecteur (rotation/échelle/rôle/couleur/marge/
  z-order/édition stylet restent visibles).
- **Étapes :**
  1. Envelopper les blocs **Packing assisté**, **Cadre laser** (sous-partie de « Guides »), le bouton
     **+ Zone interdite** + sa note, et la sous-section **« Zones du motif (REMPLI/VIDE) »** de l'inspecteur
     dans un `<details>` « Avancé » (un dans la sidebar globale pour packing/zones/cadre ; l'éditeur
     REMPLI/VIDE peut devenir un `<details>` interne à l'inspecteur). `<summary>` cliquable, fermé par défaut.
  2. **Garder la marge de sécurité** hors du repli (elle sert au guide T10).
  3. Styler `<details>`/`<summary>` pour rester cohérent (couleur titres, padding) ; cibles ≥40px (tablette).
- **Validation :**
  - auto : `node test/run.js` → OK.
  - visuel : sidebar épurée par défaut (Motifs, Décor, Contour, Marge, Inspecteur, Projet) ; déplier
    « Avancé » → packing/zones/cadre/REMPLI-VIDE fonctionnent **comme avant** (handlers intacts) ;
    charger un ancien projet avec zones interdites → toujours soustraites à l'export.
- **Si bloqué :** si un `id` déplacé n'est plus trouvé au chargement de `app.js` (erreur console), STOP et
  signaler (un `id` a été perdu lors du déplacement).
- **Commit :** `refactor(ui): replie packing/zones/cadre/zones-motif dans « Avancé »`
- **Statut :** [x] fait   ·   exécuté par : Sonnet   ·   le : 2026-06-23   ·   commit : (voir `git log`). Un seul `<details class="advanced">` dans la sidebar globale regroupe Cadre laser / + Zone interdite / Packing assisté (placé après « Guides de gravure », fermé par défaut). L'éditeur REMPLI/VIDE (`#zone-editor`) est devenu un `<details class="advanced">` interne à l'inspecteur, fermé par défaut ; le div `#zone-editor` garde son toggle `style.display` géré par `app.js` (montré seulement si l'utilisateur déplie). Marge de sécurité restée visible hors repli (sert au guide T10). Aucun `id` déplacé, aucun handler touché. `node test/run.js` → OK. Validation visuelle laissée à Thibault (non faite par l'exécutant, sur demande explicite).

---

## Dépendances / ordre

```
T1 (box plein motif)  ─┐
T2 (clic surface)      ┘→  T3 (cache Konva : doit inclure selfRect+hitFunc)
T4 (fusion calques)    — indépendante
T5 (calque d'essai)    — après T1-T3 (réutilise node + cache ; base des outils)
T6 (pinceau profils)   ─┐
T7 (ligne/formes)       ├→ après T5 (écrivent dans edit.draft)
T8 (lasso)             ─┘   (T8 le plus complexe → en dernier des outils)
T9 (export PNG)        — indépendante (après occlusion existante)
T10 (offset vides)     — indépendante
T11 (déclutter UI)     — indépendante (faire tôt : confort de test)

Recommandé : T1 → T2 → T3 → T4 ; puis T5 → T6 → T7 → T8 ; T9/T10/T11 intercalées quand pratique.
T1, T2, T3, T5 touchent app.js → série pour éviter les conflits d'édition.
```

## Après le lot — mise à jour du contexte (obligatoire)

- [ ] **PLAN** : chaque tâche faite passée à `[x]`, exécuté par / le / commit renseignés.
- [ ] **DECISIONS.md** : acter **D-007** (calque d'essai non destructif + outils d'édition étendus +
  PNG dans le sens écran / SVG en miroir). Reprendre la section « Contexte / décision clé » ci-dessus.
- [ ] **STATUS.md** : refléter l'état réel (perf cache, sélection corrigée, édition non destructive, PNG,
  offset vides, sidebar épurée) ; retirer/replacer les entrées backlog concernées.
- [ ] **SPEC.md** : §Mode édition stylet → décrire le calque d'essai + Appliquer/Jeter + nouveaux outils ;
  §Guides → offset des vides ; §Exports → PNG ; §Fichiers/UI si la sidebar change structurellement.
- [ ] **PROJECT_MAP.md** : si de nouvelles fonctions `ML.*` (silhouetteAll, surfaceIntersect) ou un
  `editLayer` sont ajoutés, les localiser.
- [ ] **Vérifier qu'aucun fichier de contexte n'est devenu faux.**
- [ ] Commits atomiques par tâche ; init du dépôt git toujours en backlog (STATUS §Backlog).

## Notes / limites assumées

- **Occlusion = tout le motif** (décision Thibault 2026-06-22, intégrée à T1) : la silhouette passe en
  **multi-contours** et sert d'occulteur à l'export → chaque morceau séparé d'un motif masque ce qui est
  derrière lui. La sortie de `test/run.js` (`out_occluded.svg`) **change volontairement** ; la validation
  est visuelle + Falcon, pas un diff vide. Le **décor** était déjà conforme (occulte par sa surface réelle,
  voit dans ses vides).
- **Orientation des exports** (choix Thibault) : le **SVG garde son miroir vertical** (`pxPathsToMm`
  inchangé, cœur intact) ; le **PNG sort dans le sens écran** (rendu direct depuis le px monde, sans `-y`).
  Les deux exports divergent donc volontairement sur l'axe vertical. Réaligner le SVG sur l'écran serait un
  ticket séparé touchant `pxPathsToMm`.
- **Édition = motif** (D-006) : le calque d'essai s'applique au motif sélectionné (toutes ses instances),
  pas à une instance isolée.
- **Essais en attente = session-only** (D-007, T5) : les brouillons non appliqués vivent dans `editDrafts`
  (map en mémoire), **ne sont pas sauvegardés** dans le projet. Fermer/recharger l'app perd les essais non
  appliqués — d'où le compteur « N essais en attente », le bouton « Tout appliquer » et l'avertissement à
  l'export (SVG et PNG).
- **Brouillon en attente affiché en vert** (D-007, T5, choix Thibault 2026-06-23) : un motif avec un essai
  non validé s'affiche **en vert** (`EDIT_DRAFT_COLOR`) sur toutes ses instances + sa vignette, jusqu'à
  Appliquer/Jeter. C'est **display-only** : silhouette, occlusion et export restent calés sur `motif.surface`
  réel. Coût perf nul par frame (un seul `rerenderMotif` à chaque transition, vert *baked* dans le cache).
  **Limite assumée :** si le brouillon déborde la silhouette réelle (traits ajoutés au-delà), le vert peut
  apparaître sans fond blanc / hors occlusion calculée — provisoire, résolu à l'application.
