# CLAUDE.md

Instructions permanentes pour Claude Code dans ce projet.
Seul fichier chargé automatiquement : il pointe vers le reste, sans le recopier.

## Commandes

```bash
# Lancer l'app (aucun build)
#   - double-clic index.html  (ou Lancer.bat)
#   - si file:// bloqué par le navigateur :
python -m http.server          # puis http://localhost:8000

# Test headless du cœur (parse SVG -> zones -> occlusion par surfaces -> écriture SVG)
node test/run.js
```

- Pas de gestionnaire de paquets, pas de `.env`, pas de secret. Tout est vendored (`vendor/`).
- Node sert UNIQUEMENT aux tests headless ; le runtime de l'app est le navigateur.

## Règles générales

- Lire `PROJECT_BRIEF.md` avant une tâche importante.
- Lire `DECISIONS.md` avant une proposition d'architecture (décisions déjà arrêtées : stack web pure, occlusion par contour extérieur).
- Lire `PROJECT_MAP.md` pour localiser les zones ; `SPEC.md` pour le détail technique.
- App **sans build, sans framework** : garder du JS « classic script » (pas d'ES modules — doit tourner en `file://`). Les libs s'attachent en global (`Konva`, `ClipperLib`, `window.ML`).
- Modifier le minimum de fichiers, conserver le style existant. Pas de dépendance lourde sans validation.
- Conventions d'architecture et git : voir `CONVENTIONS.md`.

## Avant de coder

Produire un plan court (max 5 lignes) : objectif, fichiers concernés, plan 3-5 étapes, risques.
Si une modif touche la géométrie (zones/occlusion/export SVG), **valider via `node test/run.js`** et, si pertinent, un rendu visuel (voir SPEC.md §Tests).

## Modèles & PLAN

Opus rédige les plans au format `PLAN Template.md` ; Sonnet/Haiku/Codex exécutent les tâches taguées en ne lisant que les fichiers listés. Grille complète : `WORKFLOW.md`. Instructions Codex : `AGENTS.md`.

## Après modification

1. Mettre à jour `STATUS.md`. Les autres fichiers de contexte (`DECISIONS`, `PROJECT_MAP`, `PROJECT_BRIEF`, `SPEC`) seulement si leur contenu change réellement.
2. En fin de session : `git status`, commit atomique, push (le repo n'a pas encore de git — voir STATUS §Backlog).

## Rapport de fin de tâche

1. Fichiers modifiés  2. Résumé  3. Tests lancés  4. À vérifier manuellement  5. Prochaine action recommandée.
