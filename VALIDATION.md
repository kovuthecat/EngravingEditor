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
