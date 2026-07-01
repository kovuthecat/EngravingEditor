# AGENTS.md

Instructions permanentes pour **Codex**. Codex charge ce fichier automatiquement ;
il ne charge PAS les autres — ce fichier pointe vers eux, sans les recopier.

## Rôle de Codex

Agent d'**exécution des tâches bien cadrées et vérifiables** : implémentation mécanique,
boilerplate, tests, refactors délimités, conversions, critères d'acceptation nets.
Objectif : économiser les tokens Claude. Grille des modèles : `WORKFLOW.md` §2.

## Avant toute tâche

Lire `TASKS.md` (index), puis le plan de la tâche `plans/PLAN_<id>.md` et exécuter uniquement
la/les tâches taguées **« Modèle : Codex »**. Ne lire que les fichiers listés sous « Lire ».
Contexte projet si nécessaire : `PROJECT_BRIEF.md`, `DECISIONS.md`, `PROJECT_MAP.md`, `SPEC.md`, `STATUS.md`.

## Commandes & règles

Commandes et règles générales : `CLAUDE.md`. Toute modif géométrique → `node test/run.js` vert.
App sans build, JS classic script (pas d'ES modules). Ne rien committer dans `vendor/`.

## Garde-fou — quand s'arrêter

S'arrêter et rendre la main dès que la tâche :
- devient floue, sous-spécifiée ou ouvre plusieurs options produit ;
- exige un changement de stack, une dépendance lourde ou un refactor structurant ;
- demande d'investiguer largement le repo pour comprendre un bug.

Alors : ne rien improviser, résumer le blocage, proposer l'escalade.
