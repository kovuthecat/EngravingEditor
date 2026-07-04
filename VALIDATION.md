# VALIDATION.md — checklist visuelle (passe humaine)

> Validation visuelle déléguée à Thibault, non bloquante pour les commits. Claude ne la vérifie
> pas lui-même (pas de navigateur/Playwright). Légende : [ ] à valider · [x] OK · [!] à corriger.

## T-141 — Gomme live sur le corps initial : masquer l'instance réelle (2026-07-04)

**Auto-validation :** ✅ `node test/run.js` vert (aucune géométrie touchée).
Suite du fix « gomme n'effaçait pas le corps initial » (voir plus bas) : l'instance réelle
(`edit.node`) est maintenant masquée (`visible(false)`) à l'entrée en édition et restaurée à la
sortie, pour ne plus se voir en dessous du calque d'essai pendant la gomme.

- [ ] Entrer en édition sur un motif MOTIF (pas décor) → gommer une zone du corps initial → le trou
  apparaît IMMÉDIATEMENT (fond de page visible, pas la couleur du motif).
- [ ] Gommer un ajout vert → disparaît en live (non-régression).
- [ ] Sortir de l'édition sans rien faire → le motif réapparaît normalement (pas d'instance restée
  invisible).
- [ ] Sortir avec brouillon modifié → motif rendu avec le vert « en attente » (non-régression).
- [ ] « Appliquer » PENDANT l'édition → rester en édition, affichage cohérent ; puis sortir → motif
  visible.
- [ ] Autres instances du même motif : restent visibles pendant toute l'édition.

## Fix — section « Export & sauvegarde » repliable (post-P9, 2026-07-04)

**Auto-validation :** ✅ `node test/run.js` vert (aucune géométrie touchée).
Section ex-« Projet » (sticky bas de sidebar, D-012 pt 7) repassée en `<details class="advanced">`
repliable, renommée « Export & sauvegarde » — prenait trop de place en sidebar tablette. Le badge
`#draft-badge` déplie désormais la section avant de scroller vers elle.

- [ ] Sur tablette (sidebar ouverte), la section est repliée par défaut et n'occupe qu'une ligne
  d'en-tête « Export & sauvegarde », comme la section « Avancé ».
- [ ] Cliquer sur l'en-tête déplie/replie la section (chevron ▸/▾ cohérent avec « Avancé »).
- [ ] Avec des essais en attente, taper le badge du header déplie la sidebar **et** la section, puis
  scrolle jusqu'à elle (le contenu — DPI, boutons d'export, etc. — est visible sans clic supplémentaire).
- [ ] Les boutons (Exporter SVG/PNG/JPEG, PDF A4, Enregistrer, Charger, Tout effacer) fonctionnent
  normalement une fois la section dépliée.

## Fix — Import PNG décor à fond blanc opaque (D-009 extension, 2026-07-04)

**Auto-validation :** ✅ `node test/run.js` vert + vérif pipeline hors navigateur sur `decor hybride.png`
(seuillage → ImageTracer → parseSVG donne 1129 chemins / 179 k points au lieu d'un rectangle de 6 points).
**Bug d'origine (2 causes) :** un PNG aplati à fond **blanc opaque** se vectorisait en rectangle plein.
(1) seuillage sur l'alpha seul → tout l'opaque pris pour de l'encre ; (2) surtout, le fond était mis en
noir transparent `(0,0,0,0)`, or ImageTracer apparie par **distance RGB** (pas l'alpha) → fond classé
« noir ». Fix : encre = opaque **ET** sombre (lum < 200) → noir ; fond → **blanc**.

- [ ] Importer un PNG **fond blanc / trait noir** (le cas qui posait problème) → le décor vectorisé
  montre le trait réel, pas un rectangle plein.
- [ ] Importer un PNG **fond transparent** (export Procreate classique, cf. P6 · T2 ci-dessous) → toujours
  correct (non-régression du comportement D-009 d'origine).
- [ ] « Rafraîchir le décor… » avec un PNG fond blanc → même correction (fonction partagée).

## P9 · S9 — Dialogue custom + badge « essais en attente » (T-134)

**Auto-validation :** ✅ `node test/run.js` vert (aucune géométrie touchée).
Choix pris pendant l'exécution : `showDialog` implémenté en Promise réutilisable (`#modal-backdrop`/
`#modal`), fermeture au tap backdrop = valeur d'annulation. `guardPendingDrafts`, `deleteMotifFromLibrary`
et `hideBuiltin` passés en `async` ; tous leurs appelants sont des `onclick` (aucune valeur de retour
consommée ailleurs), donc conversion directe sans callback. Les `alert()` d'export/erreur (SVG/PNG/PDF,
vectorisation, DPI plafonné) sont **conservés tels quels** — pas de confirm/choix à faire, coût de
l'async non justifié pour un simple message, conformément à l'option laissée par le plan (§Étapes 4).
Tap sur le badge : ré-ouvre la sidebar si repliée puis scroll animé vers la section Projet (pas de
« Tout appliquer » direct, pour laisser le choix explicite).
- [ ] Sur iPad, avec des essais en attente : Exporter SVG/PNG/PDF ouvre le dialogue à 3 choix
  (« Appliquer et exporter » / « Exporter sans les essais » / « Annuler »), cibles ≥ 44 px, lisible en
  modale (pas d'empilement confus comme avec les `confirm()`).
- [ ] « Appliquer et exporter » applique bien tous les essais puis lance l'export normalement.
- [ ] « Exporter sans les essais » exporte sans appliquer (les essais restent en attente après).
- [ ] « Annuler » ferme le dialogue sans rien exporter ni appliquer.
- [ ] Tap sur le fond (backdrop) du dialogue = équivalent Annuler.
- [ ] Supprimer un motif (ou masquer un motif de base) ayant des exemplaires sur le plan : le dialogue
  custom (bouton rouge « Supprimer »/« Masquer » + « Annuler ») remplace le `confirm()` natif.
- [ ] Le badge « N essais » apparaît dans le header dès qu'un essai est en attente, disparaît à 0 ; tap
  dessus ouvre/déplie la sidebar et scrolle jusqu'à la section Projet.

## P9 · S8 — Gestes tap 2/3 doigts (Annuler/Rétablir) (T-133)

**Auto-validation :** ✅ `node test/run.js` vert (aucune géométrie touchée).
Choix pris pendant l'exécution : disqualification du tap sur mouvement par doigt (`starts` : Map
pointerId→position au contact, seuil 10 px) ET sur pinch avéré (`stage.on("touchstart")` 2 doigts
marque `moved = true`) — double garde-fou comme suggéré par le plan (§Étapes 4). Bornes 10 px /
250 ms reprises telles quelles du plan, à ajuster si le ressenti iPad le demande (cf. §Si bloqué).
- [ ] Sur iPad, en édition : tracer un trait puis taper rapidement à 2 doigts → le dernier trait est
  annulé (pas de trait parasite ajouté par le tap lui-même).
- [ ] Taper à 3 doigts juste après → le trait annulé est rétabli.
- [ ] Faire un pinch-zoom (2 doigts, avec déplacement net) : aucun Annuler ne se déclenche.
- [ ] Faire un pan à 2 doigts (translation sans écart significatif de distance) : vérifier qu'aucun
  Annuler intempestif ne se déclenche (cas limite mentionné en §Si bloqué du plan).
- [ ] Poser puis lever 2 doigts très lentement (> 250 ms) : aucun Annuler ne se déclenche (hors
  fenêtre de temps).
- [ ] Sortir puis rentrer en édition sur un autre motif : les gestes tap fonctionnent toujours (pas
  d'état résiduel de la session précédente).

## P9 · S7 — Priorité stylet + zoom-to-fit + indicateur de mode (T-132)

**Auto-validation :** ✅ `node test/run.js` vert (aucune géométrie touchée).
Choix pris pendant l'exécution : cadrage animé via `Konva.Tween` sur `stage` (200 ms, `EaseInOut`),
marge de 10 % de chaque côté (bbox du motif pris relatif à `mainLayer`, insensible au pan/zoom courant).
Le contact touch pendant un trait pen est totalement ignoré (ni pan, ni dessin doigt), pas seulement
empêché de paner — cohérent avec l'objectif de priorité et sans effet de bord identifié. Le 2ᵉ contact
(annulation) reste vérifié avant la règle de priorité, donc toujours actif.
- [ ] Sur iPad, tracer un trait Pencil puis poser un doigt de l'autre main pendant le trait en cours :
  la vue ne bouge plus (pan bloqué) et le trait continue normalement sous le stylet.
- [ ] Poser un 2ᵉ doigt pendant un trait pen (main qui tient la tablette comprise) : le trait est
  toujours annulé comme avant (pas de régression sur le pinch-annulation).
- [ ] Entrer en édition sur un petit motif et sur un grand motif : la vue se recentre et zoome à chaque
  fois sur le motif édité (marge visible autour), avec une petite animation.
- [ ] Sortir de l'édition : la vue revient exactement à son cadrage d'avant (même zoom/position qu'avant
  d'entrer).
- [ ] Le mode édition est visuellement évident (liseré bleu autour du canevas + bandeau « ✏️ {nom du
  motif} » en haut), et disparaît à la sortie.

## P9 · S6 — Actions lasso/brouillon flottantes + retrait des notes (T-131)

**Auto-validation :** ✅ `node test/run.js` vert (aucune géométrie touchée).
Choix pris pendant l'exécution : mini-barre lasso positionnée **une seule fois à l'ouverture** de la
sélection (bbox de `edit.lasso.inside`, sans offset), ne suit pas le glissé manuel (option la plus
simple retenue par §Étapes 1 du plan).
- [ ] Sur iPad, en édition : tracer un lasso sur une portion du brouillon → une mini-barre (Déplacer/
  Dupliquer/Effacer/✕) apparaît juste au-dessus de la sélection, cibles ≥ 44 px.
- [ ] Glisser la sélection lassée : la mini-barre reste à sa position d'ouverture (comportement attendu,
  pas un bug).
- [ ] ✕ referme la sélection sans agir (équivalent Échap tactile).
- [ ] Modifier le brouillon (pinceau) → bandeau vert « Appliquer / Jeter l'essai » apparaît en haut du
  canevas ; Appliquer/Jeter le fait disparaître.
- [ ] Bouton « ? » dans la barre d'outils niveau 1 ouvre un overlay avec les 3 textes d'aide (formes,
  lasso, gestes) ; tap n'importe où dans l'overlay le referme.
- [ ] La palette d'édition (tiroir ⚙) n'a plus de pavés de texte permanents.

## P9 · S3 — Sonde Pencil Pro (twist/altitude/azimuth/tangentialPressure)

**Auto-validation :** ✅ HTML valide, aucune erreur console attendue.
- [x] Thibault sur iPad Pro + Pencil Pro : ouvert `http://<ip-locale>:8000/test/pencil-probe.html`
  (via `python -m http.server`, `file://` insuffisant pour les pointer events pen).
- [x] Roulé/incliné le Pencil, bilan copié → voir gate T-138 ci-dessous.

## P9 · S11 · gate T-138 — Verdict Pencil Pro (2026-07-04)

**Bilan sonde (iPad + Pencil Pro réel) :** tout vert sauf `coalesced > 1`, `twist ≠ 0`,
`twist varie`, `tangentialPressure varie` (rouges). `altitude varie` et `azimuth varie` : verts.

- **Twist (barrel roll) → NO-GO T-139.** Le Pencil Pro sur cet iPad n'expose pas de rotation
  exploitable à Safari (`twist` figé). **S11 abandonnée** : pas de mapping twist→angle de plume,
  le slider `#calli-angle` reste seul contrôle. Le hover atténué (bundlé dans T-139) n'est pas
  livré non plus (même tâche).
- **Altitude (inclinaison) → GO T-140.** `altitudeAngle` varie bien à l'inclinaison du stylet.
  **S12 lancée directement** (sans passer par S11 — pas de conflit de code, S12 ne touche pas les
  lignes que S11 aurait modifiées).

Statuts mis à jour : `plans/P9/S11.md` (T-138 → [x] tranché no-go/go mixte, T-139 → abandonnée),
`plans/P9/index.md`.

## P9 · S12 — Mode « ombrage » par inclinaison Pencil (T-140)

**Auto-validation :** ✅ `node test/run.js` vert (aucune géométrie touchée, `variableStroke` déjà
couvert). Smoke Node (script ad hoc, non conservé) : radii dérivés d'altitudes de test
(π/2 → 0.05 rad) via la fonction de mapping → `ML.variableStroke` retourne un polygone non vide.
Choix pris pendant l'exécution : mapping linéaire `altitude→largeur` (pas de gamma réglable comme la
pression), borne basse fixe `SHADE_MIN_FRAC = 0.2` (pas de nouveau slider, conforme au plan) ;
fallback trait constant (`ML.strokeToPolygon`, mode courant) dès que `edit.drawingPointerType !==
"pen"` ou qu'une inclinaison de la passe n'est pas finie (capteur absent/instable) ; gomme insensible
comme les autres modes variables.

- [ ] Sur iPad + Pencil Pro, mode Ombrage actif : coucher le stylet élargit le trait, le redresser
  l'affine, en continu.
- [ ] Les autres modes (Rond/Pression/Plume) restent inchangés ; bascule entre modes cohérente.
- [ ] Gomme en mode Ombrage : largeur constante (insensible à l'inclinaison), comme en Pression/Plume.
- [ ] Au doigt/souris (pas de Pencil) : trait à largeur constante, pas de tremblement ni d'erreur.
- [ ] Curseur d'outil : cercle à la taille réelle (`sizeMm`), pas de comportement différent de Rond.

## P9 · S2 — Ancres/pastille compensées + gains HTML

- [ ] T-127 — iPad : zoomer/dézoomer (molette + pinch) → ancres et pastille gardent une taille
  confortable au doigt à tout zoom ; le déplacement via la pastille reste précis.
- [ ] T-128 — iPad : taper dans un champ numérique ouvre le pavé décimal ; sélectionner un motif →
  Dupliquer visible dans la palette flottante et fonctionnel.

## P8 · impression A4

- [ ] le bouton produit un PDF ; page 1 = page de garde avec plan d'assemblage cohérent ;
- [ ] nombre de feuilles et orientation plausibles pour le pattern courant ;
- [ ] imprimer 2 feuilles voisines à 100 % : la règle fait exactement 100 mm à la règle métal ;
- [ ] les croix de bord de l'une se superposent aux croix intérieures de l'autre, motifs continus
  au raccord ;
- [ ] contour guitare en pointillés, surfaces gris clair + contours nets dans la couleur du calque,
  orientation identique à l'écran (pas de miroir).

### Rendu aplat plein par défaut (2026-07-04)

Le PDF restitue maintenant le dessin au trait tel qu'à l'écran (aplat opaque couleur calque, sans contour).
Diagnostic vérifié hors navigateur (jsPDF + `pdftoppm` sur le projet réel), mais le rendu papier reste à
confirmer :

- [ ] « PDF A4 1:1 » → chaque tracé du décor est un **trait plein** dans sa couleur (pas de double contour
  creux) ; personnages/symboles idem dans leur couleur ; identique à l'écran.
- [ ] contour guitare toujours en pointillés, croix de recalage / règle 100 mm / page de garde inchangées.
- [ ] imprimer 1 feuille et vérifier que le trait plein se décalque/pyrograve bien (lisibilité, encre).

## Lot 5 — bibliothèque de base (site déployé Vercel)
- [ ] Les grilles Personnages/Symboles listent les motifs des dossiers ; les vignettes se dessinent au défilement.
- [ ] Clic sur un built-in → instance posée.
- [ ] « × » sur un built-in → masqué, et toujours masqué après rechargement de la page.
- [ ] « Restaurer la bibliothèque de base » → tout revient.
- [ ] Éditer au stylet un built-in → rechargement conserve l'édition ; `git status` propre côté `exemple motif/`.

## Édition stylet — tactile (tablette réelle)
- [ ] Pinceau / gomme / formes / lasso au doigt et au stylet ; pression et plume calligraphique.
- [ ] Palette flottante visible en mode édition, cibles ≥ 44 px.

## Correctifs à confirmer
- [ ] iPad : fond visible hors mode édition (régression cache Konva corrigée via `safeCache`).
- [ ] Décor : tient dans le contour, cliquable/déplaçable (poignées du Transformer visibles).

## P7 · T14 — Undo par commandes + keyframes + Rétablir

- [ ] 12 traits puis 12 Annuler → retour exact à l'état d'entrée (traverse les keyframes) ; puis 12
  Rétablir → retour à l'état final.
- [ ] Annuler ×2 puis un nouveau trait → Rétablir grisé (branche redo bien invalidée).
- [ ] Lasso Déplacer puis Annuler → la portion revient à sa place ; Rétablir → re-déplacée.
- [ ] Sur décor chargé : Annuler reste réactif (< ~1 s) après une longue session de traits.

## P7 · T13 — Ops localisées + surcharge verte incrémentale

- [ ] Sur un décor chargé : la fin de trait (lever du stylet) ne gèle plus l'interface.
- [ ] Le vert reste exact : pinceau hors du réel = vert ; pinceau sur du réel = pas de vert ; gomme
  sur du vert = le vert disparaît ; après Annuler (undo), le vert correspond toujours au delta réel.
- [ ] Lasso Déplacer/Dupliquer/Effacer : le vert reste cohérent après l'action.
- [ ] Appliquer : tout le vert disparaît ; Jeter : le brouillon revient au réel sans vert.
- [ ] Comparer visuellement un même enchaînement de traits avant/après la tâche sur un petit motif :
  rendu identique.

## P7 · T11 — Cache bitmap du brouillon entre les traits

- [ ] Sur un décor chargé, en édition : l'aperçu pendant le trait est nettement plus fluide qu'avant ;
  après le lever, le trait fusionné apparaît correctement (pas de bitmap vide ni de décalage).
- [ ] Gomme, formes, lasso (surlignage orange et glissé) : rendu inchangé.
- [ ] Zoomer fort pendant l'édition : le brouillon peut être un peu plus doux (bitmap), mais jamais
  absent ni tronqué (garde `safeCache` iOS).

## P6 · T1 — Verrou global du décor (bascule 🔒)

- [ ] Verrou ON : impossible de sélectionner/déplacer/éditer le décor ; un motif posé au-dessus du
  décor reste sélectionnable (le clic traverse le décor verrouillé).
- [ ] Verrou OFF : le décor redevient sélectionnable/déplaçable/éditable normalement.
- [ ] Verrouiller pendant que le décor est sélectionné → il se désélectionne. Verrouiller pendant
  l'édition (stylet) d'un décor → on sort de l'édition.
- [ ] Enregistrer le projet avec verrou ON → recharger : l'état verrou est restauré (libellé du
  bouton 🔒/🔓, `aria-pressed`, et comportement effectif inchangés après rechargement).

## P6 · T2 — Import décor PNG vectorisé en interne (ImageTracer vendored)

- [ ] Importer un PNG de décor Procreate (« Importer décor (PNG)… ») → une vignette apparaît dans la
  bibliothèque Décor ; l'ajouter au plan → le trait vectorisé ressemble au dessin d'origine, en une
  seule couleur (couleur focale décor).
- [ ] Fichier illisible / image vide / tracé sans encre détectée → message d'erreur propre (`alert`),
  pas de crash, overlay « Import en cours… » ne reste pas bloqué affiché.
- [ ] `file://` (double-clic sur `index.html`, sans serveur) : l'import PNG fonctionne (ImageTracer
  chargé en `<script>` vendored, pas de dépendance réseau).
- [ ] PNG de grande résolution (> 2000 px de côté) : le tracé reste raisonnablement rapide (pas de gel
  du navigateur), l'image est mise à l'échelle proportionnellement avant vectorisation.

## P6 · T3 — Bouton « Rafraîchir le décor » (remplacement sur place depuis PNG)

- [ ] Poser un décor, le déplacer/redimensionner ; « Rafraîchir le décor… » avec un PNG modifié →
  le trait change **sans** que l'exemplaire bouge (position/échelle/rotation/z-order conservés).
- [ ] Deux décors différents sur le plan → le rafraîchissement vise bien le décor sélectionné (et,
  s'il n'y en a qu'un seul posé, aucune sélection nécessaire).
- [ ] Aucun décor dans la bibliothèque → message clair (« Sélectionne d'abord le décor à
  rafraîchir. »), pas de crash.
- [ ] Un décor avait des retouches stylet (`motif.surface`) → après rafraîchissement, elles sont
  écrasées par le nouveau tracé (attendu, cf. `DECISIONS.md` §D-009).

## P7 · T1 — Garde l'export CommonJS final de `vendor/clipper.js`

- [ ] Ouvrir l'app (console navigateur) : **aucune** `ReferenceError: module is not defined` au chargement.
- [ ] Les tests Node (`node test/run.js`) passent vert (export CommonJS toujours fonctionnel).

## P7 · T2 — CSS tactile iPad (repli sidebar, lib-del, 100dvh, touch-action)

- [ ] Desktop fenêtre large (> 900 px) : le bouton ☰ replie/déplie la sidebar ; « Entrer en édition »
  replie automatiquement, « Sortir » restaure.
- [ ] iPad paysage : idem ; le bas de l'app (section Projet) n'est pas masqué par la barre Safari.
- [ ] iPad : le × des vignettes de bibliothèque est visible sans survol ; pas de zoom page au double-tap
  sur les boutons ; pas de loupe à l'appui long sur le canevas.

## P7 · T3 — Un 2ᵉ contact annule le trait en cours (tablette)

- [ ] En édition : commencer un trait, poser un 2ᵉ doigt → **aucune** marque appliquée, le pinch
  zoome/panne normalement ; relever les doigts → aucun trait résiduel.
- [ ] Même test avec Rectangle en cours et avec un tracé de lasso en cours → annulés proprement.
- [ ] Une sélection lasso déjà fermée (surlignée orange) **survit** à un pinch.

## P7 · T5 — Tracé d'édition en Pointer Events natifs

- [ ] Desktop souris : pinceau, gomme, ligne (+Maj), rectangle (+Maj), ellipse, lasso (tracé, glissé,
  3 actions), annulation par trait — comportement identique à avant.
- [ ] iPad : un doigt dessine (comme avant, T6 changera ça), deux doigts pan/zoom sans marque ;
  Pencil dessine ; tirer le centre de notifications pendant un trait (`pointercancel`) → pas de marque.
- [ ] Sortir puis re-rentrer en édition : le tracé fonctionne toujours (listeners bien détachés/rattachés).

## P7 · T6 — Stylet dessine, doigt navigue (+ bascule « dessin au doigt »)

- [ ] iPad : Pencil dessine ; un doigt panne la vue (aucune marque) ; deux doigts zooment (inchangé).
- [ ] Bascule « ✍️ Doigt : navigue » → « Doigt : dessine » → le doigt trace de nouveau (ancien
  comportement) ; rebasculer → le doigt panne à nouveau.
- [ ] Paume posée pendant un trait Pencil (2ᵉ contact) → pas de marque parasite, le trait Pencil en
  cours saute proprement à `pointercancel` (T3/T5), jamais de fragment appliqué.
- [ ] Desktop souris : dessine, rien ne change (comportement identique à T5).

## P7 · T7 — Points coalescés + prédits + décimation du trait

- [ ] iPad : un trait rapide en courbe est lisse (pas de segments anguleux) ; l'aperçu colle mieux à
  la pointe du Pencil ; un trait lent ne « vibre » pas plus qu'avant.
- [ ] Mode Pression : traits rapides fluides, pas de gel à la fin du trait plus long qu'avant.
- [ ] Desktop : aucun changement perceptible.

## P7 · T8 — Curseur d'outil (taille réelle) + survol Pencil

- [ ] Desktop souris : le cercle suit le pointeur en mode édition ; son diamètre correspond exactement
  au trait posé (Pinceau), à deux zooms différents.
- [ ] Il devient rouge en Gomme ; en mode Plume, le curseur est un nib incliné qui suit le slider d'angle.
- [ ] Outils ligne/rectangle/ellipse : réticule en croix ; lasso : point.
- [ ] iPad M2+ : le cercle apparaît en **survol** du Pencil avant tout contact avec la vitre ; il ne
  s'affiche jamais au doigt (bascule « dessin au doigt » incluse).
- [ ] Le curseur disparaît en sortant du mode édition (aucun résidu) et à la sortie du conteneur du
  canevas (`pointerleave`).
- [ ] Si le survol Pencil n'émet aucun `pointermove` sur l'iPad de test (bilan sonde T4 négatif) :
  noter ici que seul le curseur pendant-le-tracé + souris a été livré.

## P7 · T9 — Courbes de pression + largeur minimale

- [ ] iPad, mode Pression : Douce = trait épais dès l'effleurement ; Ferme = il faut appuyer pour
  épaissir ; Normale = comme avant. Largeur min 0 % : un trait léger devient très fin.
- [ ] La gomme garde une largeur constante quelle que soit la pression.
- [ ] Souris : trait de largeur moyenne constante (pression 0.5), pas de régression.

## P7 · T10 — Stabilisation de trait réglable (EMA)

- [ ] Off (par défaut) : comportement identique à avant.
- [ ] Fort, à fort zoom : un trait volontairement tremblé sort nettement plus régulier ; le trait se
  termine bien sous la pointe (pas de « queue » qui s'arrête avant le lever).
- [ ] Le lasso et les formes ne sont pas affectés par le réglage.

## P9 · S10 — Projet sticky + PWA (manifest, safe-area)

- [ ] T-135 : sur iPad, scroller la sidebar (bibliothèque longue) → la section **Projet**
  (Exporter/Enregistrer) reste visible en bas sans dérouler jusqu'au bout.
- [ ] T-135 : sidebar repliée (`#app.collapsed`) → rien ne dépasse, aucun résidu visible.
- [ ] T-136 : sur iPad, « Ajouter à l'écran d'accueil » → l'app se lance en plein écran (sans barre
  Safari), icône et nom corrects sur l'écran d'accueil.
- [ ] T-136 : en paysage (notch/coins arrondis), le header et les barres flottantes d'édition ne sont
  pas masqués par les zones sûres.
- [ ] T-136 : ouverture normale en `file://` et via URL statique — aucune erreur console, comportement
  inchangé (manifest ignoré sans incidence).

## Fix 2026-07-04 — Gomme n'efface pas le corps initial en direct

- [ ] En édition, gomme sur le **corps initial** du motif (pas seulement un trait ajouté) : la zone
  disparaît **immédiatement** sous le stylet, pas seulement à la sortie d'édition.
- [ ] Effacer un **bord** du motif : la silhouette blanche (fond « sticker ») rétrécit en direct.
- [ ] Effacer un morceau **intérieur** d'un motif plein : la zone passe au blanc du corps (cohérent
  avec le rendu après Appliquer), pas de résidu de couleur.
- [ ] Les traits **ajoutés** (pinceau) s'effacent toujours correctement (pas de régression).
- [ ] Annuler/Rétablir après un effacement : le fond blanc suit l'état reconstruit.
- [ ] Décor (si édité déverrouillé) : effacement du corps encore visible seulement à la sortie
  (limite connue, fond figé pour la perf) — vérifier qu'il n'y a pas de ralentissement.
- [ ] Motif normal : pas de ralentissement perceptible pendant le tracé (fond recalculé une fois
  par trait, pas par frame).

## Fix 2026-07-04 — Stylet dessine ET déplace en même temps (conflit pan/tracé)

- [ ] iPad, en édition : pincer-zoomer à deux doigts, relâcher, puis dessiner au stylet sans lever le
  regard vers un autre geste → le trait suit le stylet sans que la vue ne glisse en même temps.
- [ ] Idem après un contact parasite à deux doigts (ex. paume posée un instant) pendant l'édition.
- [ ] Le pan un doigt (mode navigue) et le pinch-zoom deux doigts restent inchangés en édition.
- [ ] Hors édition, le pan un doigt natif Konva fonctionne toujours normalement après un pinch-zoom.
