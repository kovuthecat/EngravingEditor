# Plan P8 — Impression 1:1 multi-feuilles A4 (PDF) pour décalque   (rédigé par Opus)

## Objectif d'ensemble

Nouveau procédé de transfert (le dôme de la table rend le laser impraticable) : **imprimer le
pattern complet à l'échelle réelle** (motifs + décor + contour guitare) sur plusieurs feuilles A4,
les assembler (recouvrement 10 mm, croix de recalage), décalquer sur la guitare, pyrograver.
Sortie = **PDF multi-pages** généré dans l'app (jsPDF vendored), rendu **contours 0,3 mm couleur
calque + surfaces gris clair**, contour guitare en **pointillés**, **sens écran** (pas le miroir
laser). Décisions figées : `DECISIONS.md §D-011`.

Nota : P7 = plan iPad/Pencil (D-010), indépendant ; la refonte spatiale déférée par D-010
(évoquée comme « P8 » dans son texte) prendra le prochain numéro libre (P9).

## Tâches

| Tâche | Titre | Modèle | Effort | Dépend de | Statut |
| --- | --- | --- | --- | --- | --- |
| [T1](T1.md) | `ML.computeTiling` (tuilage A4 pur) + cas de test | Sonnet | medium | — | [ ] |
| [T2](T2.md) | jsPDF vendored + `src/print.js` : rendu des feuilles | Sonnet | high | T1 | [ ] |
| [T3](T3.md) | Repères (croix, libellés, règle 100 mm) + page de garde | Sonnet | medium | T2 | [ ] |
| [T4](T4.md) | `collectPrintScene()` + bouton « PDF A4 1:1 » (branchement) | Sonnet | medium | T2 | [ ] |

Notes : T1 est purement géométrique (seule tâche qui touche `geometry.js`/`test/run.js`).
T3 et T4 sont parallélisables après T2. Validation papier finale (échelle, recalage) : Thibault.
