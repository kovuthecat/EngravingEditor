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
- [x] T-106 — Nettoyer l'export CommonJS non gardé de `vendor/clipper.js:6986` (sans casser l'UMD) · modèle: Haiku, effort: minimal · plan: `plans/P7/` (T1)
- [x] T-107 — Verrou global du décor (non sélectionnable/déplaçable/éditable) · modèle: Sonnet, effort: medium · plan: `plans/P6/` (T1)
- [x] T-108 — Vectoriseur PNG→SVG (ImageTracer vendored) + import décor PNG · modèle: Sonnet, effort: medium · plan: `plans/P6/` (T2)
- [x] T-109 — Bouton « Rafraîchir le décor » (remplacement sur place depuis PNG) · modèle: Sonnet, effort: medium · plan: `plans/P6/` (T3, dépend T2)
- [x] T-110 — CSS tactile iPad (repli sidebar toutes largeurs, lib-del visible, 100dvh, touch-action) · modèle: Haiku, effort: low · plan: `plans/P7/` (T2)
- [x] T-111 — Annuler le trait en cours à l'arrivée d'un 2e contact (trait fantôme) · modèle: Haiku, effort: low · plan: `plans/P7/` (T3)
- [x] T-112 — Page de sonde des capacités stylet Safari (`test/pencil-probe.html`) · modèle: Haiku, effort: low · plan: `plans/P7/` (T4)
- [x] T-113 — Tracé d'édition en Pointer Events natifs · modèle: Sonnet, effort: high · plan: `plans/P7/` (T5, dépend T3)
- [x] T-114 — Stylet dessine / doigt navigue + bascule « dessin au doigt » · modèle: Sonnet, effort: medium · plan: `plans/P7/` (T6, dépend T5)
- [x] T-115 — Points coalescés + prédits + décimation du trait · modèle: Sonnet, effort: medium · plan: `plans/P7/` (T7, dépend T5)
- [x] T-116 — Curseur d'outil taille réelle + survol Pencil · modèle: Sonnet, effort: medium · plan: `plans/P7/` (T8, dépend T5)
- [x] T-117 — Courbes de pression (gamma) + largeur minimale · modèle: Sonnet, effort: low · plan: `plans/P7/` (T9, dépend T5)
- [x] T-118 — Stabilisation de trait réglable (EMA) · modèle: Sonnet, effort: low · plan: `plans/P7/` (T10, dépend T7)
- [x] T-119 — Cache bitmap du brouillon d'édition entre les traits · modèle: Sonnet, effort: low · plan: `plans/P7/` (T11)
- [x] T-120 — Géométrie : union/différence localisées par îlots + tests · modèle: Sonnet, effort: high · plan: `plans/P7/` (T12)
- [x] T-121 — Branchement ops localisées + surcharge verte incrémentale · modèle: Sonnet, effort: medium · plan: `plans/P7/` (T13, dépend T11+T12)
- [x] T-122 — Undo d'édition par commandes + keyframes + Rétablir · modèle: Sonnet, effort: high · plan: `plans/P7/` (T14, dépend T13)
- [x] T-123 — Autosave différé en période creuse (idle) · modèle: Haiku, effort: low · plan: `plans/P7/` (T15)
- [ ] T-124 — Validation d'ensemble P7 sur iPad + Pencil Pro · modèle: — (humain) · plan: `plans/P7/` (T16, dépend T1-T15)
- [x] T-125 — Impression 1:1 multi-feuilles A4 (PDF jsPDF, décalque pyrogravure) · modèle: Sonnet, effort: medium (T2: high) · plan: `plans/P8/` (D-011)

### P9 — Refonte spatiale UI iPad/Pencil (couche présentation, D-012)

- [ ] T-126 — Cibles tactiles CSS 44 px (`--tap`, hit `::after`, sliders, hint coarse) · modèle: Sonnet, effort: medium · plan: `plans/P9/` (S1)
- [ ] T-127 — Ancres Transformer + pastille compensées écran (coarse) · modèle: Sonnet, effort: medium · plan: `plans/P9/` (S2)
- [ ] T-128 — `inputmode="decimal"` + Dupliquer dans la palette de sélection · modèle: Sonnet, effort: medium (low) · plan: `plans/P9/` (S2)
- [ ] T-129 — Barre d'outils d'édition compacte, toujours visible (niveau 1) · modèle: Sonnet, effort: high · plan: `plans/P9/` (S4, dépend S2)
- [ ] T-130 — Tiroir de réglages contextuel à l'outil actif · modèle: Sonnet, effort: high · plan: `plans/P9/` (S5, dépend S4)
- [x] T-131 — Actions lasso/brouillon flottantes + retrait des notes (aide « ? ») · modèle: Sonnet, effort: medium · plan: `plans/P9/` (S6, dépend S4)
- [x] T-132 — Priorité stylet + zoom-to-fit + indicateur de mode · modèle: Sonnet, effort: medium · plan: `plans/P9/` (S7, dépend S4)
- [x] T-133 — Gestes tap 2/3 doigts (Annuler/Rétablir) en édition · modèle: Sonnet, effort: high · plan: `plans/P9/` (S8, dépend S7)
- [x] T-134 — Dialogue de confirmation custom (remplace confirm imbriqués) + badge essais · modèle: Sonnet, effort: medium · plan: `plans/P9/` (S9)
- [x] T-135 — Section Projet épinglée (sticky) en bas de sidebar · modèle: Sonnet, effort: medium (low) · plan: `plans/P9/` (S10, dépend S9)
- [x] T-136 — PWA : manifest + plein écran iPad + safe-area · modèle: Sonnet, effort: medium · plan: `plans/P9/` (S10)
- [x] T-137 — Étendre `test/pencil-probe.html` (twist/altitude/azimuth/tangential) · modèle: Haiku, effort: low · plan: `plans/P9/` (S3)
- [x] T-138 — [Humain] Valider capacités Pencil Pro sur iPad (gate go/no-go Lot E) · modèle: — (humain) · plan: `plans/P9/` (S11, dépend T-137)
- [x] T-139 — `twist` → angle de plume + hover atténué · abandonnée (no-go : twist non exposé par Safari sur cet iPad) · plan: `plans/P9/` (S11, dépend T-138)
- [x] T-140 — Mode « ombrage » par inclinaison Pencil (variableStroke, si go) · modèle: Sonnet, effort: high · plan: `plans/P9/` (S12, dépend T-138)
- [x] T-141 — Gomme live sur le corps initial : masquer `edit.node` pendant l'édition · modèle: Sonnet, effort: medium · plan: `plans/PLAN_T-141_gomme-live-corps-initial.md`

### P10 — Migration vers la nouvelle UI (maquette Claude Design, D-013 à ratifier)

> Refonte **visuelle/spatiale seule**, aucun changement de fonction. Ratifier `DECISIONS.md §D-013` avant lancement. Absorbe les parties chrome-global encore ouvertes de P9 (S9/S10).

- [x] T-142 — Tokens de design + typographie IBM Plex vendored (socle) · modèle: Sonnet, effort: medium · plan: `plans/P10/` (S1)
- [x] T-143 — Barre supérieure + Annuler/Rétablir global + bannière « essais » · modèle: Sonnet, effort: high · plan: `plans/P10/` (S2, dépend S1)
- [x] T-144 — Rail d'icônes + panneaux coulissants (Motifs/Contour/Guides) · modèle: Sonnet, effort: high · plan: `plans/P10/` (S3, dépend S2)
- [x] T-145 — Panneau Sélection + barre contextuelle sombre · modèle: Sonnet, effort: high · plan: `plans/P10/` (S4, dépend S3)
- [x] T-146 — Panneau Export + zoom flottant + pastille d'aide + toast · modèle: Sonnet, effort: medium · plan: `plans/P10/` (S5, dépend S3)
- [x] T-147 — Chrome mode édition (pilule + barre re-skinnée, tiroir préservé) · modèle: Sonnet, effort: high · plan: `plans/P10/` (S6, dépend S3)
- [x] T-148 — Passe responsive/PWA/safe-area + nettoyage DOM mort · modèle: Sonnet, effort: medium · plan: `plans/P10/` (S7, dépend S2-S6)
- [ ] T-149 — [Humain] Validation visuelle d'ensemble sur iPad réel · modèle: — (humain) · plan: `plans/P10/` (S8, dépend S1-S7)
