# CLAUDE.md

Instructions permanentes pour Claude Code. Seul fichier chargé automatiquement : il pointe vers le reste.

## Commandes

```bash
# Lancer l'app (aucun build) : double-clic index.html (ou Lancer.bat)
python -m http.server          # si file:// bloqué → http://localhost:8000

node test/run.js                     # test headless du cœur géométrique
node test/branch-proto-check.js      # prototype : géométrie, poses, encombrement
node test/app-check.js               # APP : scripts, identifiants DOM, générateur exécuté
node test/page-check.js              # prototype : la page se charge et le sélecteur répond
node test/banc-motifs.js [taille_mm] # balaie TOUS les motifs : lesquels se posent, à quelle taille
node test/banc-poses.js              # les 5 manières de poser + une chaîne branche→composant→piste
node test/banc-composants.js         # chaque composant dans son contexte + images mal dessinées
node test/banc-croisements.js        # les 12 paires d'éléments qui se croisent
node test/banc-esthetique.js         # spécimens isolés : effilement, écorce, vias
node tools/build-builtin-motifs.js   # régénère le bundle de motifs de base
```

- Pas de gestionnaire de paquets, pas de `.env`, pas de secret. Tout est vendored (`vendor/`).
- Node sert UNIQUEMENT aux tests headless ; le runtime de l'app est le navigateur.

@C:\Users\kovu\SynologyDrive\Thibault\Projets\Templates\CLAUDE-BASE.md

## Règles spécifiques au projet

- App **sans build, sans framework** : JS « classic script » (pas d'ES modules — doit tourner en `file://`). Libs en global (`Konva`, `ClipperLib`, `window.ML`).
- Avant une tâche : `PROJECT_BRIEF.md` (produit), `DECISIONS.md` (archi — stack web pure, occlusion par contour), `PROJECT_MAP.md` (localisation), `SPEC.md` (détail technique).
- Toute modif de géométrie (zones/occlusion/export SVG) → **valider via `node test/run.js`** (+ rendu visuel si pertinent, cf. `SPEC.md`) ; bloque le commit.
- **Motifs de base** : la bibliothèque ne contient plus que les personnages (kodama, korok) ; la catégorie Symboles a été retirée. Chaîne de fabrication dans `MOTIFS.md`.
- Remote GitHub `EngravingEditor`, branche `main`.
