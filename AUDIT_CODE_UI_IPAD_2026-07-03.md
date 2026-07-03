# Audit de code UI — iPad + Apple Pencil Pro exclusivement — 3 juillet 2026

Audit statique du code (`index.html`, `src/style.css`, `src/app.js`) ciblé usage **iPad + Apple Pencil Pro uniquement**, en croisement avec l'audit Playwright de Codex du même jour (`output/playwright/AUDIT_UI_IPAD_APPLE_PENCIL_2026-07-03.md`). **Aucune modification de code** : uniquement des propositions, priorisées.

Référentiel cible : Apple HIG (cibles tactiles ≥ 44×44 pt), conventions iPadOS (gestes 2/3 doigts), capacités Pencil Pro accessibles au web.

---

## 1. Forces confirmées par le code

Le socle Pointer Events du mode édition est solide et bien au-dessus de la moyenne des apps web :

- **Pression** : `pointerPressure()` (app.js:1429) lit `e.pressure` pour `pointerType === "pen"` avec plancher 0.05, fallback 0.5 doigt/souris. Gamma réglable (Douce/Normale/Ferme) + largeur min.
- **Coalesced + predicted events** (app.js:1447-1466) : échantillonnage 240 Hz réel du Pencil, prédits utilisés pour l'aperçu seulement — c'est la bonne architecture (identique à ce que font les apps de dessin natives).
- **Survol Pencil (hover)** : `editPointerMove` met à jour le curseur d'outil même hors tracé (app.js:1734), et le curseur affiche le **diamètre réel** du pinceau à tout zoom. Le hover du Pencil Pro devrait donc déjà fonctionner ; `pointerleave` masque le curseur.
- **Second contact = annulation propre** du geste en cours (`cancelActiveStroke`, app.js:1484) et bascule pinch ; `pointercancel` géré.
- **Doigt navigue / Pencil dessine** par défaut, avec bascule explicite (`finger-draws`) : le bon modèle mental (celui de Procreate).
- Perf : cache bitmap statique/brouillon séparés, garde-fou canvas iOS 4096² (app.js:32-45), `100dvh`, sidebar auto-repliée en édition.

Les propositions ci-dessous ne remettent pas en cause cette architecture : elles portent sur la **couche présentation** et quelques comportements d'entrée.

---

## 2. P1 — Cibles tactiles (confirme le KO prioritaire de Codex)

Constats dans le code :

| Élément | Code | Taille effective | Cible HIG |
|---|---|---|---|
| `.btn` (tous boutons) | style.css:47-48 | `min-height: 40px` | 44 px |
| `#btn-undo` header | style.css:9 | `min-height: 34px` | 44 px |
| `×` bibliothèque (tactile) | style.css:99 | 24×24 px | 44 px |
| `.zone-toggle` | style.css:73 | ~22 px de haut (padding 3px, font 10) | 44 px |
| Sliders (`brush-size`, angle, pression, DPI) | natifs | pouce ~16-26 px | 44 px |
| Ancres Transformer | app.js:50 `anchorSize: 16` | 16 px **écran ÷ rien** | 44 px |
| Pastille déplacement | app.js:59 `radius: 20` | 40 px **× zoom stage** | 44 px |

Propositions :

1. **Variable CSS unique** `--tap: 44px` (48 px pour les outils de la palette d'édition, utilisés en aveugle pendant le dessin) appliquée à `.btn`, `.btn.sm`, `#btn-undo`, `.zone-toggle`.
2. **Étendre la zone de hit sans grossir le visuel** quand la densité compte (`×` des vignettes, `.zone-toggle`) : pseudo-élément `::after` transparent de 44×44 centré (technique standard, zéro impact layout).
3. **Sliders** : styliser `::-webkit-slider-thumb` à ~28 px + piste 44 px de hauteur de hit ; ou remplacer le slider de taille par un stepper +/− à gros boutons combiné aux 3 presets existants (1/3/8 mm), qui sont déjà la bonne idée.
4. **Ancres Konva** : sous `matchMedia("(pointer: coarse)")`, passer `anchorSize` à ~28 et augmenter `rotateAnchorOffset` ; la **pastille de déplacement** et les ancres devraient compenser l'échelle du stage (taille constante à l'écran, sinon à zoom 0.25 la pastille fait 10 px).
5. **Espacement** : garder ≥ 8 px entre cibles adjacentes de la palette (les rangées actuelles `gap:6px` avec boutons pleine largeur passent tout juste ; critique pour Pinceau/Gomme côte à côte).

---

## 3. P1 — Palette d'édition : passer de « panneau de réglages » à « barre d'outils + tiroirs »

C'est le vrai sujet ergonomique du mode édition. La palette (index.html:161-223, style.css:41-43) est une **colonne unique de 220 px, scrollable**, qui empile en permanence : 6 outils, 3 actions lasso, slider taille + 3 presets, 3 modes de trait, 4 niveaux de stabilisation, bascule doigt, angle plume, 3 duretés + slider largeur min, 2 actions brouillon, Annuler/Rétablir/Sortir, et 3 paragraphes d'aide. Codex mesure la conséquence : dense, scrollable, cibles < 44 px, hiérarchie outil/forme/comportement illisible.

Problèmes structurels :

- **Fréquence d'usage mélangée** : pendant qu'on dessine, on change d'outil et de taille en continu ; on ne change le mode de trait, la stabilisation ou la dureté qu'une fois par session. Tout est au même niveau.
- **Annuler/Rétablir/Sortir en bas de la zone scrollable** : les actions les plus fréquentes et les plus critiques peuvent être hors écran.
- **Aide permanente** : les `.note` (index.html:173-174, 212) consomment ~1/3 de la hauteur pour du texte qu'on ne lit qu'une fois.
- **Position figée en haut-gauche** : recouvre le motif édité si celui-ci est à gauche de la vue (l'entrée en édition ne recadre pas la vue, cf. §5).

Organisation cible proposée (sans changer aucune fonctionnalité) :

1. **Barre d'outils compacte** (niveau 1) : les 6 outils en **icônes 48×48** (une colonne au bord gauche, ou une rangée en bas — le bas de l'écran est la zone la plus atteignable sur iPad tenu à deux mains), + taille courante (pastille montrant le diamètre, tap = ouvre les presets), + Annuler/Rétablir, + Sortir. Toujours visible, jamais scrollable.
2. **Tiroir de réglages contextuel** (niveau 2) : un popover ouvert par appui long ou par un bouton « ⚙ » sur l'outil actif, contenant ce qui concerne **cet outil seulement** : mode de trait + angle plume + dureté/largeur min (pinceau), stabilisation (pinceau/formes), bascule doigt. Se ferme au tap ailleurs. La logique JS existante (`setEditTool`, `setStrokeMode`, etc.) est déjà découplée du layout : c'est un chantier HTML/CSS quasi pur.
3. **Actions contextuelles là où l'action a lieu** : les 3 boutons lasso (Déplacer/Dupliquer/Effacer) en mini-toolbar flottante **près de la sélection surlignée** (position calculable depuis le bbox de `edit.lasso.inside`), pas dans la palette. Idem Appliquer/Jeter : bandeau fixe en haut du canevas quand `edit.dirty`, couleur verte cohérente avec le brouillon.
4. **Supprimer les `.note` permanentes** : remplacer par un bouton « ? » qui affiche l'aide en overlay, et/ou un hint one-shot à la première utilisation de chaque outil.
5. **Undo/Redo aussi par gestes** (cf. §4) pour pouvoir vider la barre au strict minimum.

---

## 4. P2 — Gestes iPadOS manquants (conventions que la main attend)

Le clavier porte aujourd'hui des raccourcis inaccessibles sans Magic Keyboard (app.js:1868-1876 : Ctrl+Z, Ctrl+D, Suppr, `[`/`]`, Échap pour le lasso). Sur iPad pur, aucune alternative gestuelle :

1. **Tap 2 doigts = Annuler, tap 3 doigts = Rétablir** (standard Procreate/Notes/Freeform) en mode édition. Implémentable dans `editPointerDown/Up` : contacts touch quasi simultanés, sans déplacement, durée < ~250 ms — l'infrastructure `activeTouchPointers` existe déjà.
2. **Échap n'existe pas sur iPad** : la sortie de sélection lasso doit avoir un équivalent tactile visible (bouton « ✕ » sur la mini-toolbar lasso proposée en §3.3).
3. **Double-tap 2 doigts (ou bouton « recadrer »)** = zoom-to-fit du motif édité.
4. **Dupliquer** : absent de `#selection-palette` (index.html:146-160) alors que `btn-dup` est enterré dans l'inspecteur sidebar (repliée sur iPad). L'ajouter à la palette de sélection.
5. **Priorité stylet pendant le tracé** : dans `editPointerDown` (app.js:1701-1712), un contact doigt reçu **pendant** un trait Pencil en cours démarre un pan (`panAnchor`) — la vue bouge sous le trait. Le rejet de paume iPadOS filtre l'essentiel, mais pas un doigt franc de l'autre main. Proposition : si `edit.drawing` avec un pointer `pen` actif, ignorer les `pointerdown` de type `touch` (ou ne les accepter que comme 2e contact d'annulation).

---

## 5. P2 — Entrée/sortie d'édition : cadrer la scène

`enterEdit()` (app.js:1122-1169) verrouille et replie la sidebar mais **ne recadre pas la vue** : le motif édité peut être petit, décentré, ou partiellement sous la palette.

1. **Zoom-to-fit animé sur le motif à l'entrée** (bbox de `edit.node` → `stage.scale/position`, transition ~200 ms), **restauration de la vue précédente à la sortie**. Grosse amélioration perçue pour un coût faible : tout ce qu'il faut (`getClientRect`, `syncStageSize`) existe.
2. **Indicateur de mode visible** : en édition, seul l'apparition de la palette signale le mode. Proposition : liseré coloré autour du canevas ou bandeau discret « Édition : {nom du motif} » — utile aussi pour comprendre pourquoi la sélection est verrouillée.
3. La bascule `Entrer en édition` vit dans `#selection-palette` : bien. La renommer avec une icône ✏️ + libellé, et en faire la cible la plus grosse de la palette (action primaire).

---

## 6. P2 — Ergonomie globale hors édition

1. **Sidebar ~6 500 px** (mesure Codex) : la section **Projet** (exports, la finalité de l'app) est inaccessible sans un long scroll. Propositions au choix : (a) déplacer Exporter/Enregistrer dans le header (il y a la place : le `.hint` libéré, cf. point 3) ; (b) sidebar en 3 onglets (Bibliothèque / Réglages / Projet) au lieu d'accordéons empilés ; (c) a minima, épingler Projet en bas de la sidebar (`position: sticky; bottom: 0`).
2. **Palette de sélection** : positionnée en haut-gauche fixe, loin de la sélection. La placer près du bbox de la sélection (comme la pastille de déplacement le fait déjà) ou en barre bas d'écran.
3. **`.hint` du header** (index.html:18) : « molette = zoom · Suppr = supprimer · Ctrl+D = dupliquer » est du desktop pur, affiché sur iPad paysage (masqué seulement < 700 px). Sous `(pointer: coarse)`, le remplacer par les gestes tactiles réels ou le supprimer.
4. **`confirm()`/`alert()` natifs** : `guardPendingDrafts` (app.js:1290-1296) enchaîne **deux confirm imbriqués** avec sémantique OK/Annuler inversée entre les deux — illisible, surtout dans les feuilles modales iPadOS. Proposition : un seul dialogue HTML custom à 3 boutons explicites (« Appliquer et exporter » / « Exporter sans les essais » / « Annuler »). Idem pour les confirm de suppression de motif.
5. **Claviers virtuels** : tous les `input type="number"` (dimensions, marge, DPI, échelles packing) gagneraient `inputmode="decimal"` pour ouvrir le pavé numérique iPadOS au lieu du clavier complet.
6. **Compteur d'essais en attente** (`#draft-summary`) : dans la section Projet de la sidebar → invisible la plupart du temps. Un badge sur le header (à côté d'Annuler) rendrait l'état « il reste du vert non appliqué » impossible à rater avant un export.
7. **PWA / plein écran** : ajouter un manifest + `apple-mobile-web-app-capable` pour l'installation sur l'écran d'accueil : sans la barre Safari, on récupère ~70 px de hauteur et on évite le swipe-back accidentel — pertinent pour une app 100 % tactile. Prévoir alors `viewport-fit=cover` + `env(safe-area-inset-*)` sur header/palettes.

---

## 7. P3 — Exploiter le Pencil **Pro** spécifiquement

État des capacités web (à confirmer sur matériel — c'est exactement le rôle de `test/pencil-probe.html`, à étendre pour logger `twist`, `altitudeAngle`, `azimuthAngle`, `tangentialPressure`) :

1. **Barrel roll (rotation du fût)** : exposé en Pointer Events via `twist` sur les WebKit récents (support Pencil Pro annoncé côté WebKit ; **à vérifier** sur l'iPadOS cible avec la probe). Si disponible : **piloter l'angle de la plume calligraphique par la rotation physique du stylet**, le slider `calli-angle` devenant le fallback. C'est LA fonctionnalité qui ferait du mode Plume un vrai outil de calligraphie.
2. **Inclinaison** (`altitudeAngle`/`azimuthAngle`, dispo depuis longtemps sur Pencil) : option « ombrage » (largeur ↑ quand le stylet se couche) en 4e mode de trait — même chaîne géométrique que `variableStroke`, coût contenu.
3. **Squeeze et double-tap Pencil** : **non exposés au web** (réservés aux apps natives via PencilKit). Ne rien promettre ; c'est une raison de plus d'avoir les gestes 2/3 doigts (§4.1) comme substitut.
4. **Hover** : déjà fonctionnel par construction (§1). Micro-amélioration : pendant le survol (`buttons === 0`), afficher le curseur d'outil en opacité réduite pour distinguer « je vise » de « je touche ».

---

## 8. Croisement avec l'audit Playwright de Codex

| Constat Codex | Confirmation code | Traité par |
|---|---|---|
| KO cibles < 44 px (boutons 40, × 24, sliders 16-26) | Oui — valeurs retrouvées dans style.css | §2 |
| Sidebar 6 500 px, Projet sous la ligne de flottaison | Oui — accordéons empilés, pas de hiérarchie | §6.1 |
| Palette 220 px dense, trop de texte d'aide | Oui — colonne unique scrollable | §3 |
| Header sous-dimensionné (menu 40, Annuler 88×34) | Oui — style.css:7-9 | §2.1 |
| Hiérarchie outil/forme/comportement insuffisante | Oui — tout au même niveau dans le DOM | §3.1-3.2 |
| Pencil/pinch/pointercancel/réentrée OK | Oui — architecture Pointer Events saine | §1 |
| NT : hover, pression physique, rejet de paume | Points §4.5, §7 à valider sur matériel | probe |

---

## 9. Ordre de mise en œuvre recommandé

1. **Lot A (quick wins, ~1 session)** : variable `--tap` 44 px + hit étendu `::after` + sliders épaissis + ancres/pastille compensées ; `inputmode="decimal"` ; hint header conditionné à `(pointer: coarse)` ; Dupliquer dans la palette de sélection.
2. **Lot B (restructuration palette, le cœur)** : barre d'outils icônes 48 px + tiroirs contextuels + actions lasso/brouillon flottantes + suppression des notes permanentes.
3. **Lot C (gestes + cadrage)** : tap 2/3 doigts undo/redo, priorité stylet sur contact doigt pendant un trait, zoom-to-fit à l'entrée en édition, indicateur de mode.
4. **Lot D (structure globale)** : sidebar en onglets ou exports dans le header, dialogue custom remplaçant les confirm imbriqués, badge essais en attente, PWA.
5. **Lot E (Pencil Pro, après validation probe)** : twist → angle de plume, mode ombrage par inclinaison, hover atténué.

Chaque lot est indépendant ; A et C sont à très faible risque (aucune géométrie touchée, `node test/run.js` non concerné sauf mode ombrage du lot E).

---

## Limites

Audit statique : les tailles effectives au rendu, le comportement réel du hover/twist Pencil Pro, et le rejet de paume ne peuvent être certifiés que sur iPad physique (cf. NT de l'audit Codex). Les propositions §7 sont conditionnées aux résultats de `test/pencil-probe.html` étendu.
