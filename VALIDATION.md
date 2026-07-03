# VALIDATION.md — checklist visuelle (passe humaine)

> Validation visuelle déléguée à Thibault, non bloquante pour les commits. Claude ne la vérifie
> pas lui-même (pas de navigateur/Playwright). Légende : [ ] à valider · [x] OK · [!] à corriger.

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
