# Plan P10 — Migration vers la nouvelle UI (maquette Claude Design)   (rédigé par Opus)

## Objectif d'ensemble

Migrer l'éditeur vers la **nouvelle interface** maquettée avec Claude Design
(`Maquette/handoff/am-lioration-ui-diteur-gravure/project/Editeur Gravure.dc.html`). C'est une
**refonte visuelle et de réorganisation spatiale uniquement** : **aucun changement de fonction**.
Chaque contrôle existant conserve son rôle ; on ne fait que le **déplacer, restyler et recâbler** dans
la nouvelle structure. La géométrie de cœur (`geometry.js`, occlusion, export, packing, édition stylet)
est **intouchée**.

La bascule d'architecture : on quitte la **sidebar unique scrollable en `<details>`** pour :
- une **barre supérieure** (60 px) : titre, Annuler/Rétablir, badge session, bouton **Exporter** ;
- un **rail d'icônes** vertical (78 px, 5 entrées : Motifs · Contour · Guides · Sélection · Export) qui
  ouvre un **panneau coulissant** (336 px) ; un seul panneau ouvert à la fois (`activePanel`) ;
- un **canevas** central (le `#stage` Konva **inchangé**) surmonté d'incrustations DOM : **contrôles de
  zoom** flottants (+/reset/−), **pastille d'aide**, **toast**, **barre contextuelle de sélection**
  (sombre, centrée bas), **chrome du mode édition** (pilule haut + barre d'outils bas) ;
- une **bannière « essais en attente »** pleine largeur sous la barre supérieure.

> **Le canevas reste Konva.** Les motifs « en dur » (masques CSS) de la maquette ne sont que des
> mock-ups de rendu : les vrais motifs restent des nœuds Konva. On récupère de la maquette la
> **structure, les couleurs, les espacements, les composants d'UI** — pas son moteur de rendu.

## Rapport avec le plan P9 (à trancher — cf. D-013 pt 1)

P9 (D-012) était déjà une refonte présentation iPad/Pencil, partiellement livrée. P10 **absorbe et
ré-exprime** les parties « chrome global » de P9 encore ouvertes :
- P9·S9 (dialogue custom + badge « essais en attente ») → **repris** par la bannière P10 (S2) + le
  dialogue custom (déjà en place, conservé).
- P9·S10 (Projet sticky + PWA/safe-area) → **repris/réorganisé** par la barre supérieure + panneau
  Export + passe responsive/PWA (S2, S5, S7).
- P9·S2/S7 (gains HTML, priorité stylet, zoom-to-fit) → **orthogonaux**, restent valables tels quels.

En revanche le **travail P9 sur le mode édition** (S4 barre d'outils, S5 tiroir contextuel, S6
lasso/brouillon flottants — livrés `[x]`) est **préservé et re-skinné**, jamais supprimé : la maquette
montre une barre d'édition simplifiée (5 outils + cycle de taille), mais « aucun changement de
fonction » impose de **conserver** lasso, modes de trait (Rond/Pression/Plume/Ombrage), lissage,
bascule doigt et popover de taille — ils restent dans le **tiroir ⚙** (S6).

## Décisions à ratifier par Thibault (proposition **D-013**)

Avant de lancer les sessions, figer dans `DECISIONS.md §D-013` :

1. **Périmètre** : P10 = refonte visuelle/spatiale depuis la maquette, **présentation seule**, zéro
   géométrie ; supersede les parties chrome-global encore ouvertes de P9 (S9, S10) sans jeter le
   travail édition de P9.
2. **Aucune fonction perdue** : tout contrôle omis par la maquette est **conservé**. Contrôles avancés
   d'édition → tiroir ⚙. Cases « activer marge / activer cadre » → conservées (la maquette les sous-
   entend toujours actives ; on garde un toggle, ou marge=0 ⇒ off).
3. **Couleur de gravure** : garder **uniquement** le sélecteur natif `<input type=color>` (tranché par
   Thibault le 2026-07-07). Les 6 pastilles de préréglage de la maquette **ne sont pas reprises**.
4. **Annuler/Rétablir global** : la barre supérieure pilote l'historique **projet** existant
   (`recordHistory`) ; on **ajoute un Rétablir** projet (pile redo) — extension mineure, pas une
   nouvelle logique d'état.
5. **Polices hors-ligne** : IBM Plex Sans/Mono **vendored** dans `vendor/fonts/` (l'app tourne en
   `file://`, pas de CDN Google Fonts). Repli = pile système si le vendoring est refusé.
6. **Palette oklch** : adoptée telle quelle en **tokens CSS** (Safari iPad ≥ 15 gère `oklch`).
7. **Barre de sélection** : adopter la **barre sombre flottante centrée-bas** de la maquette
   (Dupliquer/Descendre/Monter/Modifier/Supprimer) en remplacement du `#selection-palette` positionné.

## Sessions

| Session | Tâches | Titre | Modèle | Effort | Dépend de | Zone modifiée | Statut |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [S1](S1.md) | T-142 | Tokens de design + typographie vendored | Sonnet | medium | — | `src/style.css`, `vendor/fonts/`, `index.html` (head) | [x] |
| [S2](S2.md) | T-143 | Barre supérieure + Annuler/Rétablir global + bannière « essais » | Sonnet | high | S1 | `index.html`, `src/style.css`, `src/app.js` | [x] |
| [S3](S3.md) | T-144 | Rail d'icônes + panneaux coulissants (Motifs/Contour/Guides) | Sonnet | high | S2 | `index.html`, `src/style.css`, `src/app.js` | [x] |
| [S4](S4.md) | T-145 | Panneau Sélection + barre contextuelle sombre | Sonnet | high | S3 | `index.html`, `src/style.css`, `src/app.js` | [x] |
| [S5](S5.md) | T-146 | Panneau Export + zoom flottant + pastille d'aide + toast | Sonnet | medium | S3 | `index.html`, `src/style.css`, `src/app.js` | [x] |
| [S6](S6.md) | T-147 | Chrome mode édition (pilule + barre d'outils re-skinnée, tiroir préservé) | Sonnet | high | S3 | `index.html`, `src/style.css`, `src/app.js` | [x] |
| [S7](S7.md) | T-148 | Passe responsive/PWA/safe-area + nettoyage DOM mort | Sonnet | medium | S2-S6 | `index.html`, `src/style.css`, `manifest.webmanifest` | [x] |
| [S8](S8.md) | T-149 | Validation visuelle d'ensemble (iPad réel) | — (humain) | — | S1-S7 | `VALIDATION.md` | [ ] |

## Ordonnancement

`index.html` + `src/app.js` sont touchés par presque toutes les sessions → **peu de parallélisme**, on
sérialise. Garde-fou transverse : `node test/run.js` **vert/inchangé** partout (aucune géométrie) ;
toute validation visuelle est **humaine** (jamais Playwright/navigateur côté IA).

- **Vague 0 — socle** : **S1** (tokens + polices). Pré-requis visuel de tout le reste.
- **Vague 1 — squelette** : **S2** (barre sup. + shell historique) puis **S3** (rail + panneaux). S3
  installe la coquille des panneaux dont dépendent S4/S5/S6 → **bloquant**.
- **Vague 2 — contenus des panneaux (séquentielle, `app.js`/`index.html` partagés)** : **S4**
  (Sélection), **S5** (Export + zoom), **S6** (édition). Non parallèles entre elles (même DOM/`render`).
  Ordre conseillé S4 → S5 → S6 (S6 est le plus délicat, à faire en dernier avec le reste stabilisé).
- **Vague 3 — finition** : **S7** (responsive/PWA/nettoyage), après que S2-S6 aient posé le DOM final.
- **Vague 4 — recette** : **S8** humaine sur iPad → `VALIDATION.md`.

## Notes de cadrage

- **Migration DOM, pas réécriture logique** : les handlers de `app.js` existent déjà
  (`setEditTool`, `recordHistory`, `exportSVG`, `disperse`, packing, etc.). Chaque session **rebranche**
  les nouveaux nœuds sur ces handlers ; elle ne réécrit pas l'état ni la géométrie.
- **Fidélité maquette** : reproduire dimensions/couleurs/rayons/espacements donnés dans le `.dc.html`
  (barre 60 px, rail 78 px, panneau 336 px, tokens oklch, rayons 10-14 px, `--tap` 44-48 px). Ne pas
  reconcevoir : la maquette **est** la spec visuelle.
- **Chaque session est autonome** : bandeau modèle/effort/vague ; l'exécutant n'ouvre que son `S<k>.md`
  et la maquette en lecture seule.
- **Point de vigilance récurrent** : ne jamais casser le rendu Konva du `#stage` ni le mapping
  écran→local du trait (validation humaine sur iPad, cf. mémoire projet).
