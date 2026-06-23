# Spec — Motif Layout

Outil de **mise en page de motifs SVG** sur une surface (table de guitare), pour gravure laser.
Combine **packing assisté** + **édition manuelle** (déplacer / tourner / redimensionner / z-order /
rôles de zones), avec un modèle d'occlusion **« autocollant »** par surfaces (un motif au-dessus
masque ce qui est dessous, pas de transparence).

## Stack
- **App web pure, sans build.** Ouvrir `index.html` (file:// suffit) ou servir le dossier.
- Canevas : **Konva.js** (vendored `vendor/konva.min.js`).
- Booléen géométrique : **Clipper** (vendored `vendor/clipper.js`).
- Pas de dépendance Node au runtime ; Node sert seulement aux tests headless (`test/`).

## Flux
1. **Importer des motifs SVG** → bibliothèque (vignettes). Chaque motif est décomposé en **zones**
   (sous-chemins) avec un rôle **REMPLI**/**VIDE** détecté automatiquement (profondeur d'imbrication).
   Clic sur la vignette = ajoute une instance au centre de la vue.
2. **Charger un contour SVG** (table) → corps + cavités auto-réservées, à l'échelle mm réelle. Sert de
   guide + clip d'export.
3. **Packing assisté** : disperse N motifs dans le contour (échelle/rotation aléatoires) comme point de départ.
4. **Édition manuelle** : sélection (clic), poignées rotation/échelle (Transformer), glisser, `Suppr`,
   `Ctrl+D`, `[`/`]` (z-order) ; éditeur de **rôles de zones** (REMPLI↔VIDE) par motif sélectionné.
5. **Exporter SVG** : calcule la géométrie **réellement visible** (occlusion par surfaces) et écrit un
   SVG couleur (`fill-rule="evenodd"`) en mm, consommable par Falcon Design Space.

## Modèle de motif (zones)
Un motif = `{ id, name, zones:[{id, pts, role, color, parent, depth}], silhouette, surface? }`. Détail complet :
`DECISIONS.md §D-004` (zones/silhouette), `§D-006` (surface override).
- **Zones** : un sous-chemin (`<path>` aplati) par zone, dans l'ordre document du SVG (= z-order
  intra-motif). `parent` = plus petit sous-chemin **de même couleur** contenant son point intérieur ;
  `depth` = longueur de la chaîne de parents ; rôle par défaut `depth` pair → **REMPLI**, impair → **VIDE**.
  Le rôle est éditable manuellement après import (panneau « Zones du motif », sélection requise).
- **Région** d'une zone REMPLI = son contour **moins l'union de ses enfants directs** (peu importe leur
  rôle) — « remplir jusqu'au sous-ensemble suivant », comme Falcon. Implémenté par `ML.regionOf`.
- **Surface gravée d'un motif** (`ML.motifFill`) = union des régions REMPLI, **groupées par couleur** →
  `{ [color]: [{pts,closed}] }`.
- **Surface override** (`motif.surface`, optionnel, Lot 3 T5-T6) = `{ [color]: [{pts,closed}] }` (px local),
  **prime** sur la surface dérivée des zones partout (rendu écran / export SVG / silhouette). Initialisée
  paresseusement au 1ᵉʳ coup d'édition stylet depuis `exportFill(motif)` (copie profonde). Mutable lors de
  l'édition au stylet (union/différence des traits, cf. « Mode édition stylet »).
- **Silhouette** (occlusion « sticker ») = union des contours `depth=0` (les plus extérieurs, toutes
  couleurs), trous inclus → reste opaque même au niveau d'une zone VIDE interne. **Ou**, si `motif.surface`
  existe : silhouette recalculée depuis tous les contours de `surface` (T6) pour cohérence fill/edge.

## Modèle d'occlusion par surfaces (« pas de see-through »)
- À l'écran (`makeGroup`/`drawThumb`) : fond **silhouette blanc** opaque dessous, puis une surface
  `Konva.Shape`/canvas par couleur (`ML.motifFill`), tracée avec `fill-rule="evenodd"` — les zones VIDE
  laissent voir le fond blanc (trous).
- À l'export (`ML.occludeSurfaces`) : pour chaque instance (du **haut vers le bas**), on soustrait
  (Clipper `ctDifference`) l'union des **silhouettes** de toutes les instances au-dessus de la surface
  remplie de l'instance courante (par couleur) ; puis intersection finale avec le **contour**, puis
  soustraction des **zones interdites** (`reservedPolys`).
- `ML.writeSVG(groupsMm, viewBoxMm)` écrit un `<path fill="couleur" fill-rule="evenodd">` par couleur
  visible, dans un `<svg viewBox="0 0 W H" width="Wmm" height="Hmm">` (mm).

## Coordonnées
- Affichage interne : px, `PX_PER_MM = 4` (sans perte, reconverti à l'export).
- Import SVG : pas de conversion d'unité — les coordonnées du `d="…"` sont utilisées telles quelles.
  **Limitation connue** : `src/svg.js` ne lit pas les attributs `<g transform="…">` (translate/scale)
  qui entourent souvent les `<path>` (ex. exports `potrace`) ; un SVG avec un tel wrapper s'importe à
  une échelle absolue fausse (proportions correctes, taille mm erronée). Contournement actuel : aucun —
  à corriger si un import produit une taille manifestement aberrante.
- Export SVG : px → mm avec flip Y, normalisé en coordonnées positives (`ML.pxPathsToMm`), origine mm
  commune à toutes les couleurs (conversion calculée sur l'ensemble des contours visibles, pas couleur
  par couleur, pour ne pas désaligner les calques).

## Import du contour SVG (corps + cavités)
`src/svg.js` parse les `<path d="…">` (aplatit Bézier C/S/Q/T, gère M/L/H/V/Z abs+rel) en sous-chemins
fermés. Le plus grand = **corps** ; les autres (au-dessus d'un seuil d'aire) = **cavités/trous réservés
automatiquement**. Mise à l'échelle aux **mm réels** via les dimensions saisies (« dim. longue/courte »
mappées sur le grand/petit axe du bbox) → l'export sort en mm réels (calibration intégrée). Rendu :
**corps en blanc** (zone à graver), cavités creusées, masque hors-corps — `evenodd` via `sceneFunc`.

## Zones interdites (cavités physiques)
À la place d'une détection automatique peu fiable pour le **contour table**, l'utilisateur **dessine des
rectangles** (`+ Zone interdite`) qu'il pose sur les cavités/boutons (le plan complet est affiché en fond
de référence gris). Ces zones : (1) sont **soustraites** à l'export (rien gravé dedans), (2) sont
**évitées** par le packing. Éditables comme les motifs (déplacer/redim/tourner). Stockées dans le projet.

## Mode édition stylet (Lot 3 T6, Lot 4 T5-T8)

Permet de **retoucher manuellement la surface gravée** d'un motif après import (pinceau/gomme au stylet ou
à la souris), en restant verrouillé sur ce motif pendant l'édition. Édition est **non destructive** (Lot 4) :
chaque coup mute un **brouillon temporaire**, rendu en **vert** sur l'instance, sans modifier `motif.surface`
(la surface réelle) tant qu'on ne clique pas « Appliquer ».

- **Entrée en mode édition** : sélectionner un motif → bouton « Entrer » → verrouillage (sélection bloquée,
  `stage.draggable(false)`, poignées Transformer masquées), aucune interaction avec autres motifs.
- **Outils** : radio pinceau / gomme + slider taille (mm) → `radiusPx = sizeMm * PX_PER_MM / 2`.
  - **Pinceau/Gomme** : union/différence de trait (offset ClipperOffset) au brouillon.
  - **Ligne / Rectangle / Ellipse** (T7) : pointerdown = ancrage, move = aperçu, up = polygone final appliqué.
    Maj = carré/cercle contraint.
  - **Lasso** (T8) : polyligne fermée pour sélectionner une portion, puis Déplacer/Dupliquer/Effacer.
- **Tracé** (un doigt/stylet seul ; deux doigts = pan) :
  - Pointer down/move/up → accumuler points en **coordonnées locales du motif** (via `node.getRelativePointerPosition()` inversé).
  - À `pointerup` : appliquer l'outil sur le **brouillon** (`edit.draft`, pas `motif.surface` directement).
  - Chaque coup : `edit.draft = surfaceUnion/surfaceDifference(edit.draft, poly)`, `edit.dirty=true`.
  - Redessiner uniquement `editLayer` (pas de `rerenderMotif` à chaque coup — gain perf majeur).
- **Appliquer/Jeter/Tout appliquer** (T5, non destructif) :
  - **Appliquer** au motif : `motif.surface = edit.draft`, recalcul silhouette, `rerenderMotif` une fois.
    Range l'essai depuis `editDrafts` si on revient dessus.
  - **Jeter** : abandonne le brouillon sans modifier le motif.
  - **Tout appliquer** : applique tous les essais en attente en une seule étape d'historique.
  - **Brouillon en attente** : affiché en **vert** sur toutes les instances du motif (display-only, silhouette/export
    restent réels) tant que non appliqué. Permet de quitter l'édition sans forcer Appliquer/Jeter — le brouillon
    est restauré au retour.
- **Sortie de mode édition** : bouton « Sortir » → si brouillon modifié, le range en attente (vert) ; restaure
  `stage.draggable(true)`, ré-affiche poignées.
- **Portée** : édition **par motif** (pas par instance) — toutes les copies du motif reflètent les changements.
  Couleur opérée = `motif.color` (couleur focale), pas de multi-couleur sous édition.
- **Persistance** : `motif.surface` est sérialisée dans le JSON projet et reflétée à l'export SVG (via `exportFill`).
  Les brouillons en attente (`editDrafts`) ne sont **pas sérialisés** (session uniquement) — recharger l'app
  les perd, d'où l'avertissement « N essais non appliqués » à l'export.

Points clés :

- Mapping écran→local critique : décalage = trait qui n'atterrit pas sous le stylet (validation obligatoire
  en navigateur réel ou tablette).
- Pinceau = union, gomme = différence : respect de la géométrie Clipper (éviter slivers/inversions).
- Deux doigts = pan (prioritaire) : ne pas dessiner à 2 pointeurs simultanés.

## Usage tablette (Lot 3, T2-T3)

L'outil supporte l'**utilisation sur écran tactile** sans aucune étape de build ou déploiement.

### Interaction tactile

- **Pinch-to-zoom** : deux doigts → zoom centré entre les doigts, échelonnage 0.1–8× (borné comme la molette).
- **Pan deux doigts** : deux doigts simultanés → déplacer la vue (pas de dessin à 2 pointeurs).
- **Dessin/édition** : un doigt seul (ou stylet) → tracer/sélectionner/déplacer motif (pinceau/gomme en mode édition).
- **Molette/glisser-fond desktop** : inchangés, pas dégradation sur clavier+souris.

### Hébergement statique

Aucune build, aucun serveur Node requis — l'app tourne en `file://` ou HTTP statique.

1. **Sur machine locale** :
   - Double-clic `index.html` ou ouvre `file:///chemin/vers/motif-layout/index.html`.
   - Si le navigateur bloque (CORS), servir le dossier : `python -m http.server` puis ouvre `http://localhost:8000`.

2. **Accès tablette / réseau** :
   - Déployer le dossier `motif-layout/` sur un hébergeur statique (ex. **Netlify**, **Vercel**, **GitHub Pages**) :
     - **Netlify Drop** : glisser-poser le dossier.
     - **Vercel** : `vercel deploy` (ou web UI).
     - **GitHub Pages** : pousser sur une branche, activer Pages dans les paramètres du repo.
   - Accéder à l'URL publique depuis n'importe quel appareil (tablette, téléphone, desktop).
   - Aucune installation, aucune clé API, tout est client-side (fichiers importés/exportés localement).

3. **Sauvegarder/restaurer** :
   - Bouton « Enregistrer » → télécharge `projet.mlayout.json` sur l'appareil.
   - Bouton « Charger » → sélectionne un JSON précédent, restaure l'état complet.
   - Aucune sauvegarde serveur — persistance uniquement en fichiers locaux.

### Layout responsive

- **Desktop** : sidebar (gauche, 270px) + canevas (droite, 100% flex).
- **Tablette/Mobile portrait** (< 900px) : bouton **☰** (toggle) dans le header ; clic → sidebar se replie
  (transitionne vers largeur 0) ; canevas s'agrandit au-dessus. Clic ☰ à nouveau → déplie.
- Cibles tactiles agrandies : boutons ≥40px de haut, ancres Transformer ≥16px, moveHandle ≥20px.

## Export PNG/JPEG haute définition (T9)

Complément de l'export SVG (qui reste en miroir vertical pour la machine laser) : **PNG/JPEG en sens
écran** pour aperçu/partage. Orientation diverge volontairement (D-007).

- **Format** : PNG par défaut, JPEG en option (qualité 0.92).
- **Définition** : DPI réglable (défaut 300) ; plafonné automatiquement si la sortie dépasserait ~40 Mpx
  (garde anti-mémoire pour éviter les gels navigateur).
- **Géométrie** : réutilise `instancesBottomToTop` + `ML.occludeSurfaces` (même occlusion que SVG),
  mais **sans** passer par `pxPathsToMm` (qui applique le flip `-y`). Le PNG reste en repère écran px,
  rendu direct via `canvas.getContext("2d")`.
- **Essais en attente** : même garde-fou que l'export SVG — avertir/confirmer si des brouillons non
  appliqués (via `guardPendingDrafts`).

Divergence intentionnelle avec le SVG :
- **SVG** (laser) : miroir vertical (convention gravure), calibré en mm.
- **PNG/JPEG** (écran) : sens écran, haute déf pour affichage/partage.

## Guides de gravure (visuels uniquement, sans effet sur l'export)
- **Marge de sécurité** : offset intérieur du contour (`ML.insetPolygon`, ClipperOffset arrondi), distance réglable en mm, dessiné en tirets ambre dans `boundaryLayer`. Sert à garder une marge par rapport au bord réel, en cas d'incertitude sur le calage physique de la pièce sous le laser. Recalculé à chaque changement de contour/valeur ; ignoré si le contour disparaît ou si l'offset fait disparaître le polygone (mm trop grand).
- **Cadre laser** : rectangle de dimensions réglables (mm, par défaut 400×415 = zone de gravure Falcon 2), affiché dans un calque dédié (`guideLayer`), déplaçable (glisser) et orientable (poignée de rotation du Transformer, redimensionnement désactivé). Sert à vérifier ce qui rentre dans la zone de gravure machine quand le contour la dépasse. Position/rotation/dimensions/visibilité stockées dans le projet (`frame`), au même titre que la marge (`margin`).

## Fichiers
```text
motif-layout/
├── index.html          # UI
├── src/
│   ├── app.js          # état, Konva, édition (zones + transform), packing, export, projet
│   ├── svg.js          # parse SVG (<path>) -> sous-chemins + couleur de fill
│   ├── geometry.js     # zones (parent/depth/role), régions, motifFill/silhouette, occlusion par surfaces, écriture SVG, px↔mm
│   └── style.css
├── vendor/             # konva.min.js, clipper.js (vendored)
├── test/               # run.js (test headless, flux SVG), renders
└── SPEC.md / README.md
```

## Persistance projet
`Enregistrer` → `projet.mlayout.json` (motifs avec leurs zones + contour + instances). `Charger`
recharge l'état complet ; un motif d'un ancien format (`polylines`, pré-D-004, sans `zones`) est
**ignoré et journalisé en console** plutôt que de planter le chargement — aucune migration automatique
n'est prévue. Si `silhouette` est absent d'un motif chargé, elle est recalculée via `ML.motifSilhouette`.

## TODO / pistes
- **Packing « cohérent » assisté** (en cours) : placement guidé tenant compte des **éléments physiques** de la table (boutons/potentiomètres, micros, sélecteur, jack) — zones interdites + points d'ancrage (ex. un bouton = œil d'un motif / centre d'un vinyle).
- Magnétisme / grille, alignement.
- Marge blanche optionnelle autour des silhouettes (effet sticker détouré).
- Supporter `<g transform="…">` dans `src/svg.js` (voir limitation ci-dessus, §Coordonnées).
- Lot 2 (décor / personnage / symbole, `DECISIONS.md §D-005`) : voir `PLAN.md` T8-T12.

## Tests
`node test/run.js` : parse 3 SVG d'exemple (`exemple motif/Motifs SVG/…` : noiraude, link, majora) →
zones → `motifFill` ; place les motifs en grille serrée (chevauchement volontaire) ; applique
`ML.occludeSurfaces` ; écrit `test/out_occluded.svg` (multi-couleur, `evenodd`, mm) ; logue le nombre de
points avant/après occlusion (réduction attendue si chevauchement géré) et la présence de l'en-tête
`viewBox`.
