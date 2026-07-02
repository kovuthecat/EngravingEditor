# TASKS.md

Index des tâches : backlog + actives. Une ligne par tâche. Plan créé dans `plans/PLAN_<id>.md` au démarrage.

> **Frontières** — TASKS : le quoi · `STATUS.md` : l'état · `plans/` : le comment · `VALIDATION.md` : visuel.
> Convention : `- [statut] T-ID — titre · modèle: X, effort: Y · plan: <lien ou —>`
> effort : `minimal · low · medium · high · max` (à vérifier avant de lancer la session).

## Tâches

- [ ] T-101 — Validation visuelle Lot 5 (bibliothèque de base) sur le site déployé · modèle: — (humain) · plan: — (cf. `VALIDATION.md`)
- [ ] T-102 — Supporter `<g transform>` dans `src/svg.js` (échelle d'import correcte) · modèle: Sonnet, effort: medium · plan: —
- [ ] T-103 — Profiler/optimiser `ML.motifSilhouette` + `ML.motifFill` sur gros décors · modèle: Sonnet, effort: high · plan: —
- [ ] T-104 — Points d'ancrage : faire dialoguer un motif avec un bouton (œil / centre de vinyle) · modèle: Opus→Sonnet, effort: high · plan: —
- [ ] T-105 — Magnétisme/alignement ; marge « sticker » optionnelle ; densité de packing réglable · modèle: Sonnet, effort: medium · plan: —
- [ ] T-106 — Nettoyer l'export CommonJS non gardé de `vendor/clipper.js:6986` (sans casser l'UMD) · modèle: Haiku, effort: minimal · plan: `plans/P7/` (T1)
- [x] T-107 — Verrou global du décor (non sélectionnable/déplaçable/éditable) · modèle: Sonnet, effort: medium · plan: `plans/P6/` (T1)
- [x] T-108 — Vectoriseur PNG→SVG (ImageTracer vendored) + import décor PNG · modèle: Sonnet, effort: medium · plan: `plans/P6/` (T2)
- [x] T-109 — Bouton « Rafraîchir le décor » (remplacement sur place depuis PNG) · modèle: Sonnet, effort: medium · plan: `plans/P6/` (T3, dépend T2)
- [ ] T-110 — CSS tactile iPad (repli sidebar toutes largeurs, lib-del visible, 100dvh, touch-action) · modèle: Haiku, effort: low · plan: `plans/P7/` (T2)
- [ ] T-111 — Annuler le trait en cours à l'arrivée d'un 2e contact (trait fantôme) · modèle: Haiku, effort: low · plan: `plans/P7/` (T3)
- [ ] T-112 — Page de sonde des capacités stylet Safari (`test/pencil-probe.html`) · modèle: Haiku, effort: low · plan: `plans/P7/` (T4)
- [ ] T-113 — Tracé d'édition en Pointer Events natifs · modèle: Sonnet, effort: high · plan: `plans/P7/` (T5, dépend T3)
- [ ] T-114 — Stylet dessine / doigt navigue + bascule « dessin au doigt » · modèle: Sonnet, effort: medium · plan: `plans/P7/` (T6, dépend T5)
- [ ] T-115 — Points coalescés + prédits + décimation du trait · modèle: Sonnet, effort: medium · plan: `plans/P7/` (T7, dépend T5)
- [ ] T-116 — Curseur d'outil taille réelle + survol Pencil · modèle: Sonnet, effort: medium · plan: `plans/P7/` (T8, dépend T5)
- [ ] T-117 — Courbes de pression (gamma) + largeur minimale · modèle: Sonnet, effort: low · plan: `plans/P7/` (T9, dépend T5)
- [ ] T-118 — Stabilisation de trait réglable (EMA) · modèle: Sonnet, effort: low · plan: `plans/P7/` (T10, dépend T7)
- [ ] T-119 — Cache bitmap du brouillon d'édition entre les traits · modèle: Sonnet, effort: low · plan: `plans/P7/` (T11)
- [ ] T-120 — Géométrie : union/différence localisées par îlots + tests · modèle: Sonnet, effort: high · plan: `plans/P7/` (T12)
- [ ] T-121 — Branchement ops localisées + surcharge verte incrémentale · modèle: Sonnet, effort: medium · plan: `plans/P7/` (T13, dépend T11+T12)
- [ ] T-122 — Undo d'édition par commandes + keyframes + Rétablir · modèle: Sonnet, effort: high · plan: `plans/P7/` (T14, dépend T13)
- [ ] T-123 — Autosave différé en période creuse (idle) · modèle: Haiku, effort: low · plan: `plans/P7/` (T15)
- [ ] T-124 — Validation d'ensemble P7 sur iPad + Pencil Pro · modèle: — (humain) · plan: `plans/P7/` (T16, dépend T1-T15)
- [ ] T-125 — Impression 1:1 multi-feuilles A4 (PDF jsPDF, décalque pyrogravure) · modèle: Sonnet, effort: medium (T2: high) · plan: `plans/P8/` (D-011)
