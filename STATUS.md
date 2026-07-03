# STATUS.md

État à l'instant T : ce qui marche, ce qui casse. Historique détaillé des correctifs : `git log`.

> **Frontières** — STATUS : état actuel · `TASKS.md` : backlog + tâches · `plans/` : plan d'une tâche active · `VALIDATION.md` : checklist visuelle.
>
> **Dernière mise à jour :** 2026-07-03

## Phase actuelle

Plan P6 (verrou décor + rafraîchir depuis PNG Procreate) codé, T1/T2/T3 terminés (`node test/run.js` vert). Reste : validation visuelle par Thibault (cf. `VALIDATION.md`, sections P6 · T1/T2/T3).

**Plan P7 en cours (T1/T2/T3/T4/T5/T6/T7 faites le 2026-07-03, reste T8-T16)** : édition iPad/Pencil — corrections tactiles, tracé en
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
`node test/run.js` vert (aucune géométrie touchée), validation tactile/iPad restant à faire par
Thibault (cf. `VALIDATION.md`, sections P7 · T6/T7).

**Plan P8 cadré (2026-07-02), non démarré** : impression 1:1 multi-feuilles A4 en **PDF** (jsPDF
vendored) pour décalque + pyrogravure — le dôme de la table écarte la gravure laser. Rendu
contours 0,3 mm couleur calque + surfaces gris clair, contour guitare pointillé, recouvrement
10 mm avec croix de recalage, règle de contrôle 100 mm, page de garde plan d'assemblage, sens
écran (pas de miroir). 4 tâches : `plans/P8/index.md` ; décisions : `DECISIONS.md §D-011` ;
backlog : T-125.

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
