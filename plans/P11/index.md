# Plan P11 — Cohérence visuelle du Générateur de décor   (rédigé par Opus)

## Objectif d'ensemble

Le Générateur (branches/lianes/pistes/composants/personnages) fonctionne mais ses **jonctions**
manquent de cohérence : la transition organique→électronique est un pincement brutal, une radicelle
posée en bout de branche ne fusionne pas réellement avec l'effilement de la branche, les composants
sownés sur une piste peuvent se coller sans espace, et deux familles de sources (champignons, et les
personnages kodama/korok) ont des défauts en amont du moteur — perte de détail à l'extraction d'axes
pour les uns, prompts qui figent le visage/masque à l'identique pour les autres. Ce plan corrige les
trois fronts : **moteur** (`src/branch-engine.js`), **pipeline d'extraction** (`tools/motif-axes.py`),
et **prompts de génération** (`reference/prompts-motifs.html`, texte seul — aucune génération d'image
n'est faite par l'exécutant, cf. note S5).

Investigation menée dans la conversation de cadrage (rendus moteur isolés + audit
`node test/banc-composants.js` + lecture ciblée de `branch-engine.js` par un subagent Explore) :
constats et références de ligne dans chaque `S<k>.md`.

## Sessions

| Session | Tâches | Titre | Modèle | Effort | Env. | Dépend de | Zone modifiée | Statut |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [S1](S1.md) | T1 | Transition de largeur organique→piste (collier de jonction) | Sonnet | high | Desktop | — | `src/branch-engine.js` | [x] |
| [S2](S2.md) | T2 | Fusion branche/radicelle terminale (suppression du double effilement) | Sonnet | high | Desktop | S1 | `src/branch-engine.js` | [x] |
| [S3](S3.md) | T3-T4 | Pastille de connexion (pose montée) + espacement des composants sownés | Sonnet | medium | Desktop | — | `src/branch-engine.js` | [x] |
| [S4](S4.md) | T5 | Réglage de `tools/motif-axes.py` — préserver lamelles/taches des champignons | Sonnet | medium | — | — | `tools/motif-axes.py` | [x] |
| [S5](S5.md) | T6-T7 | Prompts kodama/korok (variété) + composants non conformes (à régénérer) | Sonnet | medium | — | — | `reference/prompts-motifs.html` | [x] |
| [S6](S6.md) | T8 | Consolidation — bancs d'essai, `STATUS.md`/`TASKS.md`, commits, push | Haiku | low | — | S1-S5 | `STATUS.md`, `TASKS.md`, `VALIDATION.md` | [x] |

## Ordonnancement

- **Vague 1 — parallélisable** : **S3** (poseCalc/sowAlong — zone disjointe du widthAt/pcbRibbon
  touché par S1/S2), **S4** (Python, fichier disjoint), **S5** (HTML de prompts, fichier disjoint).
  Aucune de ces trois ne dépend des deux autres ni de S1/S2.
- **Vague 2 — séquentielle** : **S1** (transition de largeur — touche `widthAt`/`pcbRibbon`, cœur de
  la loi d'effilement) puis **S2** (fusion radicelle — touche la même zone de largeur/effilement,
  risque de conflit sémantique si menée en parallèle de S1 : à faire **après**, pas en même temps).
- **Vague 3 — consolidation** : **S6**, après S1-S5. Bancs d'essai (`node test/run.js`,
  `test/banc-composants.js`, `test/banc-poses.js`, `test/branch-proto-check.js`), mise à jour
  `STATUS.md`/`TASKS.md`, commits tâche par tâche, un seul push.

## Ce que ce plan NE fait PAS

- **Aucune image n'est générée ni régénérée par l'exécutant.** S5 ne modifie que le texte des
  prompts dans `reference/prompts-motifs.html` ; Thibault génère lui-même les PNG (outil externe),
  les ré-encode (Pillow, cf. règle déjà connue anti-C2PA), puis relance à la main le pipeline déjà
  documenté en bas du fichier de prompts (`motif-axes.py` → `build-motif-bank.py` →
  `build-personnages-svg.js` → `build-builtin-motifs.js`). C'est un aller-retour humain hors plan.
- **Le fil de raccord "en zigzag" repéré à l'œil pendant le cadrage n'est PAS un bug moteur** :
  l'investigation a confirmé qu'aucun connecteur générique n'existe dans `branch-engine.js` — la
  résistance et la bobine sont simplement deux motifs légitimement en forme de spirale/ressort,
  posés proches l'un de l'autre. Pas de tâche dédiée ; l'espacement (S3) réduit déjà la confusion
  visuelle en les séparant.
