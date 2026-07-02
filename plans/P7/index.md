# Plan P7 — Édition iPad/Pencil : corrections, interaction stylet, performance   (rédigé par Opus)

## Objectif d'ensemble
Rendre l'édition de motif et de décor **fluide et confortable sur iPad + Apple Pencil Pro** :
corriger les bugs tactiles (trait fantôme, repli sidebar, cibles invisibles), migrer le tracé vers les
**Pointer Events** (stylet dessine / doigt navigue, pression fiable, points coalescés, curseur d'outil),
et supprimer les goulots de performance sur décor chargé (cache du brouillon, Clipper localisé par îlots,
undo par commandes, autosave différé). Décisions figées : `DECISIONS.md §D-010`.

## Tâches
| Tâche | Titre | Modèle | Effort | Dépend de | Statut |
| --- | --- | --- | --- | --- | --- |
| [T1](T1.md) | Garde `module.exports` en fin de `vendor/clipper.js` (= T-106) | Haiku | minimal | — | [ ] |
| [T2](T2.md) | CSS tactile : repli sidebar toutes largeurs, `.lib-del` visible, `100dvh`, `touch-action` | Haiku | low | — | [ ] |
| [T3](T3.md) | Annuler le trait en cours à l'arrivée d'un 2ᵉ contact | Haiku | low | — | [ ] |
| [T4](T4.md) | Page de sonde des capacités stylet (`test/pencil-probe.html`) | Haiku | low | — | [ ] |
| [T5](T5.md) | Tracé d'édition en Pointer Events natifs | Sonnet | high | T3 | [ ] |
| [T6](T6.md) | Stylet dessine, doigt navigue (+ bascule « dessin au doigt ») | Sonnet | medium | T5 | [ ] |
| [T7](T7.md) | Points coalescés + prédits + décimation | Sonnet | medium | T5 | [ ] |
| [T8](T8.md) | Curseur d'outil (taille réelle) + survol Pencil | Sonnet | medium | T5 | [ ] |
| [T9](T9.md) | Courbes de pression + largeur minimale | Sonnet | low | T5 | [ ] |
| [T10](T10.md) | Stabilisation de trait réglable (EMA) | Sonnet | low | T7 | [ ] |
| [T11](T11.md) | Cache bitmap du brouillon entre les traits | Sonnet | low | — | [ ] |
| [T12](T12.md) | Géométrie : union/différence localisées par îlots (bbox) + tests | Sonnet | high | — | [ ] |
| [T13](T13.md) | Branchement des ops localisées + surcharge verte incrémentale | Sonnet | medium | T11, T12 | [ ] |
| [T14](T14.md) | Undo d'édition par commandes + keyframes + bouton Rétablir | Sonnet | high | T13 | [ ] |
| [T15](T15.md) | Autosave différé en période creuse | Haiku | low | — | [ ] |
| [T16](T16.md) | Validation d'ensemble sur iPad + Pencil Pro (humain) | — (humain) | — | T1-T15 | [ ] |

Notes :
- **Deux chantiers parallélisables** : interaction (T3→T5→T6-T10) et performance (T11, T12→T13→T14).
  T1, T2, T4, T15 sont indépendantes.
- T4 (sonde) informe T7/T8 : si `getCoalescedEvents`/`getPredictedEvents`/survol sont absents du Safari
  de l'iPad, ces tâches livrent leur repli (comportement actuel) sans autre travail.
- **Hors périmètre du plan** (reporté, cf. D-010) : refonte spatiale (barre d'outils basse, plein écran,
  lasso contextuel, cycle brouillon renommé, appui long bibliothèque, aide contextuelle) → futur plan P8 ;
  barrel roll / tilt Pencil Pro → conditionné aux résultats de T4 ; redo global hors édition → P8.
