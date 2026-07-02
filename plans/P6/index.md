# Plan P6 — Verrou du décor + rafraîchir depuis PNG Procreate   (rédigé par Opus)

## Objectif d'ensemble
Deux besoins de terrain sur le décor : (1) un **verrou** global qui rend le décor non
sélectionnable / non déplaçable / non éditable, pour ne plus le bouger par erreur ; (2) un flux
**« Rafraîchir le décor »** qui **vectorise un PNG** (dessiné sur iPad/Procreate) directement dans
l'app (ImageTracer.js vendored) et **remplace le décor sur place** en conservant position, échelle,
rotation et z-order. Décisions figées : `DECISIONS.md §D-009`.

## Tâches
| Tâche | Titre | Modèle | Effort | Dépend de | Statut |
| --- | --- | --- | --- | --- | --- |
| [T1](T1.md) | Verrou global du décor (bascule 🔒) | Sonnet | medium | — | [x] |
| [T2](T2.md) | Vectoriseur PNG→SVG (ImageTracer vendored) + import décor PNG | Sonnet | medium | — | [x] |
| [T3](T3.md) | Bouton « Rafraîchir le décor » (remplacement sur place) | Sonnet | medium | T2 | [x] |

Notes : T1 et T2 sont indépendantes (parallélisables). T3 réutilise le vectoriseur de T2.
