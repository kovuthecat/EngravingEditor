# Plan P9 — Refonte spatiale UI iPad/Pencil (couche présentation)   (rédigé par Opus)

## Objectif d'ensemble

Rendre l'UI (et surtout le mode édition) ergonomique sur **iPad + Apple Pencil Pro**, sans toucher à
la géométrie de cœur. Le socle fonctionnel (pointer events, pression, coalescés, perf localisée) est
acquis (D-010) ; P9 corrige la **couche présentation** : cibles tactiles ≥ 44 px, palette d'édition
en barre d'outils + tiroirs contextuels, gestes iPadOS (undo/redo 2/3 doigts), priorité stylet,
cadrage à l'entrée d'édition, dialogues custom, structure globale (Projet accessible, PWA). Décisions
figées : `DECISIONS.md §D-012`. Source : `AUDIT_CODE_UI_IPAD_2026-07-03.md` +
`output/playwright/AUDIT_UI_IPAD_APPLE_PENCIL_2026-07-03.md`.

**Garde-fou transverse** : aucune session ne modifie `geometry.js` ni `vendor/` ; `node test/run.js`
doit rester **vert/inchangé** partout (non-régression). Toute validation visuelle/tactile est
**humaine** (Thibault, iPad réel) → `VALIDATION.md`. Jamais de Playwright/navigateur côté IA.

## Sessions

| Session | Tâches | Titre | Modèle | Effort | Dépend de | Zone modifiée | Statut |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [S1](S1.md) | T-126 | Cibles tactiles CSS 44 px | Sonnet | medium | — | `src/style.css` | [ ] |
| [S2](S2.md) | T-127, T-128 | Ancres/pastille compensées + gains HTML | Sonnet | medium | — | `src/app.js`, `index.html` | [ ] |
| [S3](S3.md) | T-137 | Étendre la sonde Pencil (twist/tilt) | Haiku | low | — | `test/pencil-probe.html` | [x] fait |
| [S4](S4.md) | T-129 | Barre d'outils d'édition compacte | Sonnet | high | S2 | `index.html`, `src/style.css`, `src/app.js` | [x] |
| [S5](S5.md) | T-130 | Tiroir de réglages contextuel à l'outil | Sonnet | high | S4 | `index.html`, `src/style.css`, `src/app.js` | [ ] |
| [S6](S6.md) | T-131 | Actions lasso/brouillon flottantes + retrait notes | Sonnet | medium | S4 | `index.html`, `src/style.css`, `src/app.js` | [x] |
| [S7](S7.md) | T-132 | Priorité stylet + zoom-to-fit + indicateur de mode | Sonnet | medium | S4 | `src/app.js`, `src/style.css` | [ ] |
| [S8](S8.md) | T-133 | Gestes tap 2/3 doigts (Annuler/Rétablir) | Sonnet | high | S7 | `src/app.js` | [x] |
| [S9](S9.md) | T-134 | Dialogue custom + badge « essais en attente » | Sonnet | medium | — | `src/app.js`, `index.html`, `src/style.css` | [ ] |
| [S10](S10.md) | T-135, T-136 | Projet sticky + PWA (manifest, safe-area) | Sonnet | medium | — | `index.html`, `src/style.css`, `manifest.webmanifest` | [ ] |
| [S11](S11.md) | T-138, T-139 | Gate sonde + `twist`→angle plume + hover atténué | Sonnet | high | S3, T-138 | `src/app.js` | [x] gate tranché no-go (T-139 abandonnée) |
| [S12](S12.md) | T-140 | Mode « ombrage » par inclinaison Pencil | Sonnet | high | S11 | `src/app.js` | [x] fait |

## Ordonnancement

`src/app.js` est touché par presque toutes les sessions → **parallélisation limitée**, on sérialise
l'essentiel. Les seules disjonctions réelles sont exploitées en vague 1.

- **Vague 1 — parallélisable** : **S1** (`style.css` seul) · **S2** (`app.js`+`index.html`) · **S3**
  (`test/pencil-probe.html` seul) — trois zones disjointes, aucune dépendance.
- **Vague 2 — palette (séquentielle, `edit-palette`/`app.js` partagés)** : **S4** (après S2, `index.html`
  partagé), puis **S5** (après S4), puis **S6** (après S4). S5 et S6 **non parallèles** entre elles
  (même DOM palette + `app.js`).
- **Vague 3 — gestes & cadrage** : **S7** (après S4, réutilise le layout édition), puis **S8** (après
  S7 : les gestes 2/3 doigts s'appuient sur les handlers pointer touchés par S7).
- **Vague 4 — structure & feedback (parallélisable avec les vagues 2-3 si exécutée à froid AVANT
  elles ; sinon séquentielle car `app.js`/`index.html` partagés)** : **S9**, puis **S10** (`index.html`
  + `style.css` partagés → après S9).
- **Vague 5 — Pencil Pro (conditionnelle)** : **gate humain T-138** (Thibault valide la sonde étendue
  de S3 sur iPad) → si **go**, **S11** puis **S12** ; si **no-go**, les deux sessions sont abandonnées
  (fallback slider `calli-angle` conservé).
- **Consolidation (fin de chaque vague)** : statuts index/`TASKS.md`, `STATUS.md`, `VALIDATION.md`,
  push (humain ou session Haiku `low`). En vague parallèle : cf. `WORKFLOW.md §4d` (staging explicite,
  ne pas toucher les fichiers partagés, pas de push tant que la vague n'est pas consolidée).

## Notes de cadrage

- **Priorité de valeur** : S1 + S4 + S5 (cibles + barre d'outils + tiroir) portent l'essentiel du gain
  perçu et adressent les deux KO prioritaires de l'audit Codex. Si le temps manque, exécuter au moins
  Vague 1 + S4 + S5.
- **Chaque session est autonome** : le bandeau porte modèle/effort/vague ; l'exécutant n'ouvre que son
  `S<k>.md`.
- **S11/S12 restent à l'état `[ ]` tant que T-138 n'est pas tranché** — ne pas les lancer « au cas où ».
