# AGENTS.md

Instructions permanentes pour **Codex** dans ce projet.
Codex charge ce fichier automatiquement. Il ne charge PAS les autres :
ce fichier pointe vers eux, sans les recopier.

## Rôle de Codex

Codex est l'agent d'**exécution des tâches bien cadrées et vérifiables** :
implémentation mécanique, boilerplate, tests, refactors délimités, conversions,
tâches à critères d'acceptation nets. Objectif : économiser les tokens Claude.

Répartition complète des modèles (Opus / Sonnet / Haiku / Codex) : voir `WORKFLOW.md`.

## Avant toute tâche

Lire `PLAN.md` et exécuter uniquement la/les tâches taguées **« Modèle : Codex »**.
Ne lire que les fichiers listés dans la section « Lire » de la tâche.

Si contexte projet nécessaire : `PROJECT_BRIEF.md`, `DECISIONS.md`, `PROJECT_MAP.md`, `STATUS.md`.

## Commandes & règles projet

Commandes (dev, build, test, lint, typecheck) et règles générales : voir `CLAUDE.md`.
Ne jamais committer de secret.

## Garde-fou — quand s'arrêter

S'arrêter et rendre la main dès que la tâche :

- devient floue, sous-spécifiée ou ouvre plusieurs options produit ;
- exige un changement de stack, une dépendance lourde ou un refactor structurant ;
- demande d'investiguer largement le repo pour comprendre la cause d'un bug.

Dans ces cas : ne rien improviser, résumer le blocage, proposer l'escalade.
