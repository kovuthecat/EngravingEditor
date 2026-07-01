# STATUS.md

État à l'instant T : ce qui marche, ce qui casse. Historique détaillé des correctifs : `git log`.

> **Frontières** — STATUS : état actuel · `TASKS.md` : backlog + tâches · `plans/` : plan d'une tâche active · `VALIDATION.md` : checklist visuelle.
>
> **Dernière mise à jour :** 2026-06-30

## Phase actuelle

Lot 5 (bibliothèque de base inlinée) codé et déployé. Reste : validation visuelle par Thibault (cf. `VALIDATION.md`).

## Ce qui fonctionne

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
