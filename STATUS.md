# STATUS.md

État à l'instant T : ce qui marche, ce qui casse. Historique détaillé des correctifs : `git log`.

> **Frontières** — STATUS : état actuel · `TASKS.md` : backlog + tâches · `plans/` : plan d'une tâche active · `VALIDATION.md` : checklist visuelle.
>
> **Dernière mise à jour :** 2026-07-03 (soir 5)

## Phase actuelle

Plan P6 (verrou décor + rafraîchir depuis PNG Procreate) codé, T1/T2/T3 terminés (`node test/run.js` vert). Reste : validation visuelle par Thibault (cf. `VALIDATION.md`, sections P6 · T1/T2/T3).

**Plan P7 en cours (T1/T2/T3/T4/T5/T6/T7/T8/T9/T10/T11/T12/T13/T14/T15 faites le 2026-07-03, reste T16)** : édition iPad/Pencil — corrections tactiles, tracé en
pointer events (stylet/doigt, coalescés, curseur, pression), perf décor (cache brouillon, Clipper
localisé par îlots, undo par commandes, autosave différé). 16 tâches : `plans/P7/index.md` ;
décisions : `DECISIONS.md §D-010` ; backlog : T-106 + T-110…T-124. Source : double audit
(Claude + Codex, `AUDIT_UI_IPAD_APPLE_PENCIL.md`). T4 (`pencil-probe.html`) = sonde autonome stylet Safari.
T5 : le tracé d'édition (pinceau/gomme/formes/lasso) capte désormais des Pointer Events natifs sur
`stage.container()` (attachés/détachés dans `enterEdit`/`exitEdit`), fondation stylet pour T6-T10.
T6 : modèle Procreate — stylet/souris dessinent, un doigt panne la vue (translation manuelle de
`stage.position()`, pas de `draggable`), deux doigts pan/zoom (Konva, inchangé) ; bascule
« ✍️ Doigt : navigue/dessine » dans la palette (`edit.fingerDraws`, non persisté).
T7 : trait libre + lasso ingèrent les points coalescés (`getCoalescedEvents`, repli `[e]` si absent)
avec décimation (seuil 1 px écran → local via `getAbsoluteScale`), aperçu prolongé par les points
prédits (`getPredictedEvents`, jamais dans `edit.pts`), premier point du down + dernier du up
toujours empilés même sous le seuil.
T8 : curseur d'outil dans `editLayer` (`editCursorNode`, coords locales — rayon `sizeMm * PX_PER_MM
/ 2` = taille réelle du trait à tout zoom) : cercle (pinceau/gomme, rouge en gomme), nib incliné
(mode Plume, suit `calliAngle`), réticule (ligne/rect/ellipse), point (lasso). Suit `pointermove`
même en survol (`buttons === 0`, Pencil) ; caché au toucher et hors du conteneur (`pointerleave`) ;
recréé (forme/couleur) par `buildEditCursor()` sur changement d'outil/mode/taille/angle, détruit à
`exitEdit`.
T9 : mode Pression rendu naturel — courbe gamma `pEff = p^γ` (γ = 0.6 Douce / 1 Normale / 1.6 Ferme,
boutons dans `#pressure-row`) et largeur minimale réglable (`edit.minWidthFrac`, slider 0-60 %, défaut
25 % = comportement précédent) ; mapping uniquement côté `app.js` (`applyStroke`), `ML.variableStroke`
inchangé ; gomme toujours insensible à la pression ; réglages de session, non persistés.
T10 : lissage optionnel du trait libre (pinceau/gomme uniquement) par EMA à 4 crans (Off/Léger/Moyen/
Fort, `s = 0/0.3/0.55/0.75`) appliquée à l'ingestion dans `moveStroke` (`edit.smoothing`,
`edit.smoothPrev`), après la décimation T7 ; dernier point brut du `pointerup` toujours empilé
(trait atteint le lever du stylet) ; défaut Off (comportement inchangé) ; lasso/formes non affectés ;
réglage de session, non persisté.
T11 : `editDraftGroup` (brouillon couleur + surcharge verte) mis en cache bitmap après chaque
`redrawEditLayer` (`safeCache(editDraftGroup, 1)`) — le mouvement pendant un trait ne coûte plus que
le blit d'un bitmap sur décor chargé (des milliers de contours retracés sinon). `getSelfRect` ajouté
aux deux `Konva.Shape` (sceneFunc sur canvas brut, même piège que `fillGroupContent`) ; `clearCache`
en tête de `redrawEditLayer` et dans `exitEdit`. `editPreview`/`lassoHighlight` restent enfants de
`editLayer` (frères, pas dans le groupe caché).
`node test/run.js` vert (aucune géométrie touchée), validation tactile/iPad restant à faire par
Thibault (cf. `VALIDATION.md`, sections P7 · T6/T7/T8/T9/T10/T11).
T12 : `ML.groupIslands` (regroupe contour extérieur + trous rattachés, cf. D-010) et
`ML.surfaceUnionLocal`/`ML.surfaceDifferenceLocal` (n'envoient à Clipper que les îlots dont la bbox
touche celle de l'argument ± 1 px ; les autres traversent inchangés). Géométrie seule — **pas encore
branché dans `app.js`** (branchement = T13). `node test/run.js` vert (5 nouveaux cas a-e comparés à
l'oracle plein) ; rien de visible avant T13.
T13 : `surfaceUnionLocal`/`surfaceDifferenceLocal` (T12) branchés dans `applyStroke`/`endShape`/les
trois `finalizeLasso*` (union du draft). Surcharge verte (`edit.added`) maintenue en session au lieu
d'un `addedRegions(réel, brouillon)` plein cadre à chaque trait : init dans `enterEdit`
(`edit.realFill` mis en cache) ; pinceau = union locale de la part du trait absente du réel ;
gomme = différence locale ; opérations non locales (`undoStroke`, les trois `finalizeLasso*`,
`applyMotifDraft`/`applyAllDrafts` — qui rafraîchit aussi `edit.realFill` —, `discardMotifDraft`) font
un recalcul plein. `redrawEditLayer` lit `edit.added` au lieu de le recalculer (l. ~1022).
`node test/run.js` vert (aucune géométrie nouvelle, T12 couvre déjà Clipper localisé) ; validation
visuelle restant à faire par Thibault (cf. `VALIDATION.md`, section P7 · T13).
T14 : undo d'édition remplacé par un historique de commandes + keyframes (`edit.history` : entrées
`{kind:"op", op, poly}` rejouables via `surfaceUnionLocal`/`surfaceDifferenceLocal`, ou
`{kind:"snapshot", draft}` pour l'état initial, les keyframes auto (toutes les 8 `op`) et les
mutations non rejouables — lasso ×3, Jeter). `pushEditEntry` gère l'insertion des keyframes, la
borne 30 (purge par l'avant via `trimEditHistory`, resynthétise un snapshot si la coupe tombe au
milieu d'une séquence d'ops) et vide `edit.redo` à chaque nouvelle mutation. `undoStroke`/`redoStroke`
dépilent vers l'autre pile et reconstruisent via `rebuildDraftFrom` (dernier snapshot + replay des
ops) ; les keyframes auto sont traversées en un seul clic (transparentes, sinon elles consommeraient
un undo/redo sans effet visible). Bouton **Rétablir** ajouté à côté d'Annuler (`index.html`, grid2
→ 3 colonnes), désactivé quand `edit.redo` est vide (Annuler désactivé quand l'historique n'a plus
qu'un snapshot) ; raccourci `Ctrl/Cmd+Maj+Z`. `node test/run.js` vert (aucune géométrie touchée) ;
validation visuelle restant à faire par Thibault (cf. `VALIDATION.md`, section P7 · T14).
T15 : **Autosave différé en période creuse** — debounce 1 s (au lieu de 300 ms) + `requestIdleCallback`
(timeout 4 s, fallback `setTimeout`) ; ne sauvegarder jamais pendant un trait (`edit.drawing` → replan).
`localSaveTimer` (debounce) + `idleCallbackId`/`idleCallbackType` (pour annulation). `flushLocalSave`
annule les deux et sauve immédiatement (événements `visibilitychange`/`pagehide` inchangés). Statut
« Sauvegarde... » → « Sauvegardé localement » inchangé. `node test/run.js` vert (aucune géométrie).
Validation de la fluidité édition : report `VALIDATION.md` (usage réel sur iPad).

**Plan P8 en cours (cadré 2026-07-02)** : impression 1:1 multi-feuilles A4 en **PDF** (jsPDF
vendored) pour décalque + pyrogravure — le dôme de la table écarte la gravure laser. Rendu
contours 0,3 mm couleur calque + surfaces gris clair, contour guitare pointillé, recouvrement
10 mm avec croix de recalage, règle de contrôle 100 mm, page de garde plan d'assemblage, sens
écran (pas de miroir). 4 tâches : `plans/P8/index.md` ; décisions : `DECISIONS.md §D-011` ;
backlog : T-125.
T1 (2026-07-03) : `ML.computeTiling(bbox, opts)` — pur, dans `geometry.js`. Pour chaque orientation
(portrait/paysage), calcule `cols`/`rows` (fenêtre utile − recouvrement) et retient celle au nombre
de feuilles minimal (égalité → portrait) ; grille centrée sur le bbox (`originX/Y`) ; retourne
`{ landscape, cols, rows, pageW, pageH, margin, overlap, uw, uh, pages: [{row, col, x, y, label}] }`.
Aucun rendu PDF/DOM (T2), pas encore branché dans `app.js` (T4). `node test/run.js` vert (5 cas :
1×1 centré, 500×380 égalité→portrait 3×2, 400×260 portrait 3×1, labels, recouvrement voisines).
T2 (2026-07-03) : jsPDF 2.5.1 UMD vendored (`vendor/jspdf.umd.min.js`, expose `window.jspdf.jsPDF`)
+ `src/print.js` (`ML.renderPrintPdf(scene, tiling, opts)`) : par page, clip fenêtre utile
(`rect`+`clip`+`discardPath`), pré-filtrage des sous-chemins par bbox, un `path()`/couleur pour
surfaces (gris clair `fillEvenOdd`) et contours (couleur calque, 0,3 mm), contour guitare + cavités
en pointillé gris. Aucune divergence d'API jsPDF par rapport au plan (`clip`/`discardPath`/`path`
présents tels quels). Smoke testé en Node (VM sandbox simulant les globals navigateur) :
`computeTiling` → `renderPrintPdf` sur une scène d'exemple produit un PDF valide multi-pages.
`node test/run.js` vert (aucune géométrie de cœur touchée). Pas d'UI/bouton (T4) — rendu réel à
valider visuellement à ce moment-là.
T3 (2026-07-03) : croix de recalage (4 coins + fantômes à `overlap` vers l'intérieur sur les bords
partagés), libellé par feuille (marge haute), règle de contrôle 100 mm graduée (marge basse), page
de garde insérée en position 1 via `doc.insertPage(1)` (dispo dans le jsPDF vendored — pas de repli
nécessaire) avec plan d'assemblage réduit (contours seuls + grille des fenêtres utiles + labels).
Bug trouvé et corrigé pendant la vérif Node : `doc.rect(...,null)` ne peint rien (ni trait ni
fond) dans ce jsPDF vendored — la grille du plan réduit était invisible ; fix = style `"S"`
explicite. Vérifié par un harnais Node (jsPDF tourne en CommonJS hors navigateur avec `atob`/`btoa`
globaux de Node) qui inspecte le flux PDF brut (non compressé) : opérateurs de tracé attendus
présents (croix, règle, textes, grille de la page de garde bien strokée). `node test/run.js` vert
(print.js hors périmètre des tests headless). Pas d'UI/bouton (T4) — rendu réel à valider sur
papier à ce moment-là (report `VALIDATION.md`, section prévue pour T2+T3+T4).
T4 (2026-07-03) : bouton **« PDF A4 1:1 »** dans la section Projet (`index.html`, à côté des exports
SVG/PNG/JPEG). `collectPrintScene()` dans `app.js` réutilise `instancesBottomToTop()` +
`ML.occludeSurfaces` (même géométrie que `exportPNG`), convertit px→mm par simple division
`PX_PER_MM` **sans passer par `ML.pxPathsToMm`** (pas de miroir laser, sens écran, D-011 pt 4-5) ;
bbox inclut le contour. `exportPdfA4()` enchaîne `ML.computeTiling` (T1) → `ML.renderPrintPdf` (T2/T3)
→ `doc.save("pattern-A4.pdf")`. `node test/run.js` vert (aucune géométrie de cœur touchée). Rendu
réel (papier/règle 100 mm/raccord des feuilles) à valider par Thibault (`VALIDATION.md`, section
« P8 · impression A4 »). Plan P8 complet (T1-T4 codés).

**Plan P9 en cours (2026-07-03)** : refonte spatiale UI iPad/Pencil (couche présentation
seule, aucune géométrie). Reprend la refonte reportée par D-010 + le second audit du 2026-07-03
(`AUDIT_CODE_UI_IPAD_2026-07-03.md` + audit Playwright Codex). 12 sessions / 15 tâches (T-126…T-140) :
cibles tactiles 44 px, palette d'édition en barre d'outils + tiroir contextuel, actions lasso/brouillon
flottantes, gestes tap 2/3 doigts (Annuler/Rétablir), priorité stylet, zoom-to-fit + indicateur de mode,
dialogue custom (remplace les confirm imbriqués) + badge essais, Projet sticky, PWA, et volet Pencil Pro
**conditionnel** (twist→angle plume, mode ombrage) gaté par une validation de sonde sur iPad réel (T-138).
Plan : `plans/P9/index.md` ; décisions : `DECISIONS.md §D-012`. Garde-fou : `node test/run.js` reste vert
partout (rien ne touche `geometry.js`/`vendor/`) ; validation visuelle par Thibault (`VALIDATION.md`).
S6 (T-131, 2026-07-03) : `#lasso-actions`/`#stylet-draft-actions` sortis d'`#edit-palette` vers des
mini-barres flottantes (`#lasso-toolbar` positionnée en JS près du bbox de `edit.lasso.inside`,
figée à l'ouverture — `positionLassoToolbar()` ; bandeau vert fixe haut de canevas pour Appliquer/
Jeter). Notes permanentes du tiroir remplacées par un bouton « ? » → overlay `#edit-help` (fermeture
au tap). `node test/run.js` vert. Reste : validation visuelle iPad (`VALIDATION.md`, P9 · S6).
S7 (T-132, 2026-07-03) : priorité stylet (`edit.drawingPointerType`, posé dans `startStroke`/
`startShape`/`startLassoTrace`) — un contact touch isolé pendant un trait pen actif est ignoré dans
`editPointerDown` (ni pan, ni dessin doigt), le 2ᵉ-contact-annulation reste inchangé. Zoom-to-fit
animé (`Konva.Tween` sur `stage`, 200 ms) à l'entrée d'édition sur le bbox de `edit.node` (marge 10 %,
calculé relatif à `mainLayer`) ; `exitEdit` restaure `edit.prevView`. Indicateur de mode : classe
`#app.editing` (liseré bleu non-inset autour de `#stage`, un inset serait masqué par le canevas Konva)
+ bandeau `#edit-mode-banner` (« ✏️ {motif.name} »). `node test/run.js` vert. Reste : validation
visuelle iPad (`VALIDATION.md`, P9 · S7). S7 débloque S8 (T-133).
S8 (T-133, 2026-07-03) : tap 2/3 doigts = Annuler/Rétablir en édition. `edit.tapGesture =
{ maxFingers, startT, moved, starts }` posé/mis à jour dans `editPointerDown` sur chaque contact
touch (`starts` = Map pointerId→position de contact, pour détecter un déplacement par doigt) ;
`editPointerMove` marque `moved` si un contact dépasse ~10 px de son point de départ (vérifié même
au-delà de 2 contacts actifs, avant le early-return existant du pinch) ; `editPointerUp` évalue le
geste quand `activeTouchPointers` retombe à 0 : si `!moved` et durée `< 250 ms`, `maxFingers === 2`
→ `undoStroke()`, `=== 3` → `redoStroke()`. Un pinch avéré (`stage.on("touchstart")`, 2 doigts)
marque `moved = true` pour désolidariser le tap du zoom. `tapGesture` réinitialisé à
`enterEdit`/`exitEdit`. `node test/run.js` vert (aucune géométrie touchée). Reste : validation
visuelle iPad (`VALIDATION.md`, P9 · S8).
S9 (T-134, 2026-07-03) : dialogue custom `showDialog({title,message,buttons})` (Promise résolue par
le bouton tapé ou par la valeur d'annulation au tap backdrop, `#modal-backdrop`/`#modal` dans
`index.html`) remplace les `confirm()`. `guardPendingDrafts` réécrit `async` en 3 choix explicites
(« Appliquer et exporter » / « Exporter sans les essais » / « Annuler », D-012 pt 6) ; `exportSVG`/
`exportPNG`/`collectPrintScene`/`exportPdfA4` passés `async`/`await` (tous appelés depuis des
`onclick`, aucune valeur de retour consommée ailleurs → conversion directe). `deleteMotifFromLibrary`/
`hideBuiltin` passés `async`, `confirm()` de suppression remplacé par `showDialog` (bouton danger).
Les `alert()` d'export/erreur restent natifs (pas de choix à faire, coût async non justifié). Badge
`#draft-badge` dans le header (`refreshDraftCounter`), tap = déplie la sidebar et scrolle vers
`#section-projet`. `node test/run.js` vert (aucune géométrie touchée). Reste : validation visuelle
iPad (`VALIDATION.md`, P9 · S9). S9 débloque S10 (T-135/T-136).

## Ce qui fonctionne

- **Verrou global du décor** (bouton 🔒/🔓) : décor inerte au pointeur (sélection/déplacement/édition bloqués), clic traversant vers les motifs posés au-dessus, état persisté dans le projet JSON.
- **Import décor PNG vectorisé in-app** (`vendor/imagetracer.js` vendored, seuillage sur l'alpha) et **« Rafraîchir le décor »** (remplacement de la géométrie sur place, position/échelle/rotation/z-order des exemplaires préservées).
- **Import SVG** (perso / symbole / décor via 3 boutons) → bibliothèque à vignettes ; clic = pose une instance. Grilles repliables par rôle + suppression motif (× avec cascade des instances, annulable Ctrl+Z).
- **Bibliothèque de base inlinée** (`src/builtin-motifs.js`, ~132 motifs) : matérialisation paresseuse (IntersectionObserver), masquage local persistant (`hiddenBuiltins`), promotion en motif local à la 1ʳᵉ édition. Régénérée par hook pre-commit (`tools/build-builtin-motifs.js`).
- **Détection de zones** (`ML.buildZones`) + éditeur de rôles REMPLI/VIDE par motif.
- **Rôles motif** (PERSONNAGE noir / SYMBOLE rouge / DECOR bleu see-through) + couleur focale + marge ; inspecteur rôle/couleur/marge.
- **Import contour** calibré en mm réels (corps blanc à graver + cavités auto) ; zones interdites manuelles ; guides de gravure (marge offset, cadre Falcon).
- **Occlusion par surfaces** à l'export (`ML.occludeSurfaces`, règle `maskFor` décor/perso) ; **export SVG mm** multi-couleur `evenodd`.
- **Édition** : sélection/rotation/échelle/glisser, z-order, zoom/pan, pinch tactile ; **édition stylet non destructive** (calques d'essai, pinceau/gomme/formes/lasso, pression + plume calligraphique) ; **export PNG** (sens écran).
- **Packing** assisté ; save/load projet JSON.
- **Validé headless** : `node test/run.js` (parse → zones → occlusion par surfaces → writeSVG).

## Ce qui casse / n'est pas testé

- **Validation tactile de l'édition stylet** : code OK (souris/Playwright), reste à valider sur tablette réelle.
- **`src/svg.js` ignore `<g transform>`** → échelle d'import fausse sur certains SVG (ex. exports potrace). Non corrigé (T-102).
- **`vendor/clipper.js:6986`** : `module.exports` non gardé → `ReferenceError` console non bloquante (vendor intouchable, T-106).
- Édition stylet mute `motif.surface` (partagé par toutes les instances) et opère sur une seule couleur focale.
- Occlusion ~1 s / 40 instances (à surveiller au-delà de ~100, non re-profilé depuis le passage aux surfaces).

## Dette technique

- Packing = dispersion naïve (pas de contrôle densité/recouvrement).
- `motifSilhouette`/`motifFill` coûteux sur gros décors (~8 s + ~6 s sur 3936 sous-chemins) — à profiler (T-103).
- Perf occlusion par surfaces non re-mesurée depuis D-004.
