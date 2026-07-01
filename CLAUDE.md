# CLAUDE.md

Instructions permanentes pour Claude Code. Seul fichier chargé automatiquement : il pointe vers le reste.

## Commandes

```bash
# Lancer l'app (aucun build) : double-clic index.html (ou Lancer.bat)
python -m http.server          # si file:// bloqué → http://localhost:8000

node test/run.js                     # test headless du cœur géométrique
node tools/build-builtin-motifs.js   # régénère le bundle de motifs de base
```

- Pas de gestionnaire de paquets, pas de `.env`, pas de secret. Tout est vendored (`vendor/`).
- Node sert UNIQUEMENT aux tests headless ; le runtime de l'app est le navigateur.

## Règles générales

- Avant une tâche : `PROJECT_BRIEF.md` (produit), `DECISIONS.md` (archi — stack web pure, occlusion par contour), `PROJECT_MAP.md` (localisation), `SPEC.md` (détail technique).
- App **sans build, sans framework** : JS « classic script » (pas d'ES modules — doit tourner en `file://`). Libs en global (`Konva`, `ClipperLib`, `window.ML`).
- Modifier le minimum de fichiers, garder le style. Pas de dépendance lourde sans validation. Conventions : `CONVENTIONS.md`.

## Avant de coder

Plan court (max 5 lignes) : objectif, fichiers, 3-5 étapes, risques. Toute modif de géométrie (zones/occlusion/export SVG) → **valider via `node test/run.js`** (+ rendu visuel si pertinent, cf. `SPEC.md`).

## Validation

- **Auto (bloque le commit)** : `node test/run.js` vert sur toute modif géométrique.
- **Visuel (humain, non bloquant)** : consigner la checklist dans `VALIDATION.md` ; ne pas la vérifier soi-même (pas de navigateur/Playwright).

## Modèles, tâches & plans

- **Opus** conçoit et rédige les plans ; Sonnet/Haiku/Codex exécutent. Grille + barème effort : `WORKFLOW.md`. Codex : `AGENTS.md`.
- Backlog et tâches : `TASKS.md`. Plan d'une tâche active : `plans/PLAN_<id>.md` (format `WORKFLOW.md §4`). L'exécutant ne lit que les fichiers listés dans sa tâche.
- **Motifs de base** : déposer/retirer le `.svg` dans `exemple motif/Personnages|Symboles` → commit (le hook régénère le bundle) → push.

## Après modification

1. Mettre à jour `STATUS.md` ; les autres fichiers de contexte seulement si leur contenu change. Passer la tâche à `[x]` dans `TASKS.md`.
2. Fin de session : `git status`, commit atomique, push (remote GitHub `EngravingEditor`).

## Rapport de fin de tâche

Fichiers modifiés · Résumé · Tests lancés · À valider visuellement (→ `VALIDATION.md`) · Prochaine action.
