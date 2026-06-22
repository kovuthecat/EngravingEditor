# PROJECT_MAP.md

Carte synthétique du projet. Détail technique complet : voir `SPEC.md` (ne pas dupliquer ici).

---

## Vue d'ensemble

- **Type** : app web mono-page, sans build, sans framework (classic scripts globaux). Tourne en `file://`.
- **Zones fonctionnelles** : (1) I/O SVG, (2) géométrie/zones/occlusion, (3) UI + édition + état (Konva).
- **Flux principal** : importer motifs SVG (zones REMPLI/VIDE auto-détectées) → poser/éditer (ou packing) sur un contour SVG → exporter un SVG couleur des surfaces visibles (occlusion) en mm.
- **Dépendances structurantes** : `Konva` (canevas/édition), `ClipperLib` (booléen), vendored dans `vendor/`.

---

## Arborescence utile

```text
motif-layout/
  index.html        # UI + ordre de chargement des scripts
  src/
    svg.js          # parse SVG (<path>) -> sous-chemins + couleur -> window.ML.parseSVG
    geometry.js      # zones (parent/depth/role), régions, occlusion par surfaces, écriture SVG, px<->mm
                      #   -> window.ML.buildZones / motifFill / motifSilhouette / occludeSurfaces / writeSVG / ...
    app.js           # état, Konva, édition (zones + transform), packing, export, projet
    style.css
  vendor/           # konva.min.js, clipper.js (NE PAS éditer)
  test/
    run.js          # test headless (Node) du cœur logique, flux SVG
```

---

## Features principales

### Feature 1 — I/O SVG (`src/svg.js`)

Rôle : lire un SVG en sous-chemins (par `<path>`, avec couleur de `fill`), aplatis (Bézier C/S/Q/T) en
polylignes fermées.
Fichiers clés : `src/svg.js` (`ML.parseSVG`).
Flux : texte SVG → un `<path>` par groupe colorimétrique → sous-chemins (`M/L/H/V/C/S/Q/T/A/Z`,
abs+rel) → `{ paths:[{color,subpaths}], subpaths }` (le second champ à plat, pour le contour table).
Points de vigilance : pas de gestion de `<g transform="…">` (translate/scale) — un SVG qui en dépend
(ex. exports `potrace` typiques) s'importe à une échelle absolue fausse ; voir `SPEC.md §Coordonnées`.

### Feature 2 — Géométrie, zones & occlusion (`src/geometry.js`)

Rôle : détecter les zones d'un motif (parent/profondeur/rôle), calculer les régions/surfaces gravées,
calculer les surfaces réellement visibles (occlusion « autocollant » par surfaces) et écrire le SVG
d'export ; convertir px↔mm.
Fichiers clés : `src/geometry.js` (`ML.buildZones`, `ML.regionOf`, `ML.motifFill`, `ML.motifSilhouette`,
`ML.occludeSurfaces`, `ML.writeSVG`, `ML.pxPathsToMm`, `ML.insetPolygon`, `ML.absArea`).
Flux : `buildZones` (parent = plus petit sous-chemin de même couleur contenant le point intérieur) →
`motifFill` (union des régions REMPLI par couleur) → à l'export, pour chaque instance du **haut vers le
bas**, soustraire (Clipper `ctDifference`) l'union des **silhouettes** au-dessus, puis intersection avec
le contour, puis soustraction des zones interdites → `writeSVG` (un `<path fill-rule="evenodd">` par
couleur, en mm).
Points de vigilance : coords entières Clipper (×1000) ; un trou reste toujours rattaché à la couleur de
sa zone parente (ne pas le déplacer seul) ; toute modif géométrique doit passer `node test/run.js`.

### Feature 3 — UI / édition / état (`src/app.js`)

Rôle : bibliothèque de motifs, instances Konva éditables (dont l'éditeur de rôles de zones), packing,
export, persistance projet.
Fichiers clés : `src/app.js`, `index.html`, `src/style.css`.
Flux : import → `buildMotifFromSVG` (centré, `zones` via `ML.buildZones`, `silhouette` via
`ML.motifSilhouette`) → `addInstance` (Konva.Group : fond silhouette blanc opaque + une surface
`evenodd` par couleur via `ML.motifFill`) → édition (Transformer/drag/clavier/éditeur de zones) →
`exportSVG` (mappe via `getAbsoluteTransform(mainLayer)` → `ML.occludeSurfaces` → `ML.pxPathsToMm` →
`ML.writeSVG` → download).
Dépendances internes : appelle `ML.parseSVG` / `ML.buildZones` / `ML.motifFill` / `ML.motifSilhouette` /
`ML.occludeSurfaces` / `ML.pxPathsToMm` / `ML.writeSVG`.
Points de vigilance : `PX_PER_MM=4` (sans perte) ; garder le Transformer (uiLayer) au-dessus après
z-order ; pas d'ES modules ; un motif chargé sans `zones` (ancien format) est ignoré, pas migré.

---

## Fichiers transversaux importants

- Configuration : aucune (pas de package.json runtime, pas de .env).
- Routing / navigation : aucune (mono-page).
- État global : objet `state` dans `app.js` (motifs avec zones, boundary, seq) + arbre Konva (`mainLayer`).
- API / persistance : export/import de fichiers (SVG, JSON projet) côté navigateur (`download`, `FileReader`).
- UI partagée : `index.html` + `src/style.css`.

---

## Zones à risque ou coûteuses en contexte IA

- La détection de zones (`ML.buildZones`) + l'occlusion par surfaces (`ML.occludeSurfaces`) + le
  mapping de transform à l'export (`app.js instancesBottomToTop`) : toute modif géométrique doit passer
  `node test/run.js`.
- `src/svg.js` ignore `<g transform>` : risque de mauvaise échelle silencieuse à l'import (voir Feature 1).
- `vendor/*` : ne jamais éditer (libs tierces).

---

## Règles locales importantes

- **Pas d'ES modules / pas de bundler** : tout en classic script, attaché aux globals (`window.ML`, `Konva`, `ClipperLib`). L'app doit s'ouvrir en `file://`.
- Export toujours en mm, surfaces fermées avec `fill-rule="evenodd"`, une couleur de `fill` par calque Falcon.
- Le DXF (entrée et sortie) a été **retiré** le 2026-06-22 (`DECISIONS.md §D-004`) — ne pas le réintroduire sans une nouvelle décision documentée.
