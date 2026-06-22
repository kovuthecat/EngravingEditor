# DECISIONS.md

Journal des décisions techniques et produit.

## Format recommandé

```md
## YYYY-MM-DD — Titre de la décision
### Décision
### Contexte
### Alternatives envisagées
### Raison du choix
### Conséquences
### Impact IA (optionnel)
```

---

## Décisions

## 2026-06-21 — D-001 : Pas de génération IA, vectorisation manuelle en DXF

### Décision
Abandonner la génération par IA des motifs. Thibault dessine/vectorise lui-même chaque motif et fournit des **DXF**.

### Contexte
Idée initiale : générer le pattern via ChatGPT/DALL·E. Crainte de refus copyright (persos sous licence).

### Alternatives envisagées
- A : IA pure (style infidèle, raster, seamless raté, refus copyright).
- B : collage des vrais motifs vectorisés (retenu).
- C : hybride IA pour fillers.

### Raison du choix
L'IA est inadaptée techniquement (raster ≠ trait laser, tuile non fiable) et bloquée par le copyright. Thibault a déjà ~36 doodles dessinés → la tâche réelle est l'**assemblage**, pas la génération.

### Conséquences
L'outil prend des DXF en entrée ; pas de module de génération ni de vectorisation intégrée.

## 2026-06-21 — D-002 : App web pure sans build (Konva + Clipper)

### Décision
Construire un éditeur web mono-page, **sans build ni framework**, libs vendored : **Konva.js** (canevas/édition) + **Clipper** (booléen). Ouverture en `file://`.

### Contexte
Besoin d'une édition manuelle ergonomique (poignées rotation/échelle, z-order). Comparé : Qt (PySide6), web, intégration dans laser-tools (Tkinter).

### Alternatives envisagées
- Qt/PySide6 : robuste (ezdxf/Shapely) mais poignées à recoder, build séparé.
- Intégrer à laser-tools (Tkinter) : max réutilisation mais édition interactive laborieuse.
- Web : libs canevas (Konva/Fabric) les plus ergonomiques pour manipuler des objets.

### Raison du choix
Thibault a priorisé l'**ergonomie d'édition** et accepte de sortir de Python. Le « sans build » rend l'outil immédiat (double-clic). Risque DXF maîtrisé en reprenant la logique mm de laser-tools.

### Conséquences
JS « classic script » obligatoire (pas d'ES modules). Globals : `window.ML`, `Konva`, `ClipperLib`. Tests headless via Node.

### Impact IA
Contrainte structurante : ne pas introduire de modules/bundler. 4 fichiers source seulement.

## 2026-06-21 — D-003 : Occlusion « autocollant », silhouette = contour extérieur

### Décision
Modèle d'occlusion opaque : un motif au-dessus masque ce qui est dessous (pas de see-through). La **silhouette opaque** d'un motif = son **plus grand contour fermé** (fallback : enveloppe convexe).

### Contexte
Thibault veut que la partie chevauchée d'un motif ne soit plus visible. Options de silhouette proposées : contour exact / contour + marge / boîte / réglable.

### Raison du choix
Le contour extérieur donne un rendu « autocollant découpé » au plus près du trait. À l'export, on soustrait (Clipper) les silhouettes supérieures → le DXF ne contient que les traits visibles (gravure nette, sans lignes fantômes).

### Conséquences
Chaque motif doit avoir un contour extérieur fermé pour une silhouette propre ; sinon fallback convexe (moins fin). Marge blanche « sticker » = piste v1.

### Impact IA
Toute modif de l'occlusion passe par `node test/run.js` (+ rendu PNG de contrôle).

## 2026-06-22 — D-004 : Pipeline SVG only, motifs en zones REMPLI/VIDE, export SVG couleur+evenodd

### Décision
Basculer toute la pipeline sur le **SVG** : import des motifs ET du contour table en SVG (retrait
total du DXF, **entrée et sortie**). Un motif est décomposé en **zones** (sous-chemins), chacune
avec un rôle **REMPLI** ou **VIDE** (2 états). L'export produit un **SVG couleur** (une couleur de
`fill` par groupe), surfaces trouées via `fill-rule="evenodd"`, en mm.

### Contexte
Les exports réels de Thibault sont des SVG Inkscape **mono-couleur noir** : un seul `<path>` dont
les trous (yeux, évidements) sont des sous-chemins imbriqués gérés par fill-rule. Le DXF (splines
AutoCAD fragmentées) était plus pauvre et pénible (re-chaînage). L'outil de découpe utilisé est
**Falcon Design Space**.

### Tests décisifs (Falcon, 2026-06-22)
Variantes de `noiraude` importées dans Falcon (dossier `exemple motif/falcon-test/`) :
- **Falcon respecte `fill-rule:evenodd`** (yeux évidés rendus en bois) — validé jusqu'à
  64 sous-chemins / profondeur 6 (Majora).
- **Falcon sépare les calques par couleur de `fill`** (1 calque réglable par couleur).
- **fill vs stroke est ÉCARTÉ** : un `stroke` seul est mal interprété (rempli).
- Falcon génère en plus un calque « linéaire » (contour) par couleur : le **mode ligne vs
  remplissage appartient à Falcon**, choisi par calque — pas un rôle de zone.

### Alternatives envisagées
- Garder le DXF en entrée/sortie : rejeté (plus pauvre, et l'utilisateur veut le SVG couleur).
- 3ᵉ rôle « LIGNE » par zone : **rejeté** — sortir une zone sur une autre couleur la retire du
  path evenodd parent → Falcon remplit par-dessus et le trou disparaît. Le tracé au trait se fait
  via le mode de calque Falcon, à géométrie identique ; un groupe traçable indépendamment =
  couleur dédiée à l'export.
- Trous via soustraction Clipper en amont pour l'affichage : inutile (evenodd respecté). Clipper
  reste pour l'occlusion entre motifs et le calcul des régions.

### Raison du choix
Colle au format réel des fichiers, au comportement vérifié de Falcon, et au vocabulaire de
l'utilisateur (« zones remplies / vides »). Modèle simple à 2 états, extensible au multi-couleur
(ex. Spyro) sans cas particulier.

### Conséquences
- **Modèle motif** : `{ id, name, zones:[{id, pts, role:"REMPLI"|"VIDE", color, parent, depth}],
  silhouette }` (remplace `polylines`). Ordre document = z-order intra-motif.
- **Détection trous** : parent = plus petit contenant **de la même couleur** ; rôle par défaut
  alterne avec la profondeur (pair = REMPLI, impair = VIDE).
- **Surface gravée d'un motif** : union des **régions** REMPLI, où région(S) = contour S − union de
  ses enfants directs (Clipper). = « remplir jusqu'au sous-ensemble suivant » de Falcon.
- **Occlusion** : inchangée dans le principe (soustraire les silhouettes au-dessus) mais opère
  désormais sur des **surfaces pleines** ; silhouette = union des contours les plus extérieurs
  (sticker opaque, trous inclus).
- **Suppression** : `src/dxf.js` (parse + write), import DXF motifs/contour. Un trou reste
  toujours sur la couleur de sa zone parente (ne pas le déplacer seul).
- **Export** : `pattern.svg` (couleur+evenodd, mm) au lieu de `pattern.dxf`.

### Impact IA
Plan d'exécution : `PLAN.md`. Toute modif géométrique (régions, occlusion, export) passe par
`node test/run.js` réécrit en flux SVG + contrôle visuel via `exemple motif/falcon-test/`.

## 2026-06-22 — D-005 : Décor + rôles (DECOR / PERSONNAGE / SYMBOLE), occlusion par z-order et marge

### Décision
Introduire un **décor** (SVG de fond, ex. circuit + végétation) sur lequel se posent les motifs, et
**3 rôles** portés par le motif de bibliothèque : `role ∈ {PERSONNAGE, SYMBOLE, DECOR}`, chacun avec
une **couleur focale** (`color`) et une **marge de dégagement** (`margin`, mm), tous éditables.
Le rendu « posé sur / gravé dans / caché derrière » découle de **deux leviers seulement** :
le **z-order** (au-dessus / en dessous du décor) et la **marge**.

### Contexte
Thibault génère une image de décor et veut : (1) deux lignes d'upload distinctes (personnages,
symboles) appliquant directement les bons paramètres, (2) une couleur distincte par catégorie pour
régler séparément le laser, (3) des personnages **posés sur** le décor (sur une branche), des
symboles **gravés dans** le décor (dans un tronc), et (4) pouvoir **glisser un motif derrière** le
décor (personnage caché derrière un tronc). Cadre : D-004 (1 couleur `fill` = 1 calque Falcon).

### Décision technique
- **Défauts par rôle** : `PERSONNAGE {#000000, margin:2}` · `SYMBOLE {#c62828, margin:0}` ·
  `DECOR {#1565c0, margin:0}`. 3 couleurs → 3 calques Falcon réglables.
- **Le décor est un élément ordinaire de la pile** (z-order, sélectionnable, déplaçable/orientable).
- **Occlusion** : chaque instance a `occluder` = ce qui masque dessous (`silhouette` pour un motif,
  **`motifFill` réel avec ses vides** pour le décor) et `decorClear` = `silhouette` élargie de
  `margin`. Règle haut→bas : `visible_i = surface_i − union(maskFor(j,i))` pour `j` au-dessus, avec
  `maskFor(j,i) = (i est DECOR) ? decorClear_j : occluder_j`.
  → sous le décor = **caché derrière** (visible dans les vides) ; au-dessus margin>0 = **posé sur**
  (halo) ; au-dessus margin=0 = **gravé dans** (à fleur, pas de double passage laser).

### Alternatives envisagées
- Deux comportements codés en dur (posé vs gravé) : rejeté — le z-order + une marge suffisent et
  unifient le tout (un même perso peut être posé OU caché sans changer de réglage).
- Décor occultant par sa **silhouette** (sticker opaque) : rejeté — masquerait tout derrière lui ;
  on veut voir les motifs **dans les vides** entre branches → occlusion par `motifFill` réel.
- Décor figé en couche du bas : rejeté — empêche « caché derrière ».

### Conséquences
- Modèle motif enrichi : `+ role, color, margin`. Imports SVG par rôle (2 boutons motifs + 1 décor).
- `geometry.js` : `offsetPolygon` (offset positif, réutilise `insetPolygon`) + règle `maskFor` dans
  l'occlusion par surface. Rendu écran : décor **sans** fond silhouette blanc (vides transparents).
- **Limitation v1 assumée** : le halo (marge) n'est pas rendu à l'écran, seulement à l'export.
- **Dépend du Lot 1 (D-004) terminé** : s'appuie sur `motifFill`/`silhouette`, l'occlusion par
  surface et `writeSVG` (T5). Tâches : `PLAN.md` Lot 2 (T8-T12).

### Impact IA
Toute modif de l'occlusion (règle `maskFor`, offset marge) passe par `node test/run.js` (cas décor
ajouté en T11) + contrôle visuel de l'export `pattern.svg`.

## 2026-06-22 — D-006 : Import calibré (orientation + plafond d'échelle), usage tablette (tactile + hébergement), édition au stylet (surface éditable par motif)

### Décision
Trois chantiers groupés (Lot 3, `PLAN_tablette_edition.md`) :

1. **Import calibré** des motifs : (a) **ne plus flipper l'axe Y** à l'import (`buildMotifFromSVG`) —
   SVG et écran sont tous deux en y-bas, le flip héritait du DXF (y-haut) et posait les motifs **tête en
   bas** par rapport au contour ; (b) **plafond d'échelle** à l'ajout — un motif normal
   (PERSONNAGE/SYMBOLE) tient au **maximum dans 1/10** du bbox du contour, le **décor au maximum dans 1/1**
   (= `decorFit` actuel ≈0,92, inchangé). Le plafond ne fait que **réduire** (jamais agrandir) et ne
   s'applique qu'à un ajout manuel (pas au packing ni au chargement de projet, qui fournissent l'échelle).

2. **Usage tablette** : (a) **tactile** — pinch-to-zoom + pan **deux doigts**, `touch-action:none` sur le
   canevas, poignées/boutons agrandis, sidebar repliable (layout responsive) ; le dessin au doigt/stylet
   (un point) ne doit PAS paner la vue (pan réservé à deux doigts en mode édition). (b) **accès** =
   **hébergement statique en ligne** (Netlify/Vercel/GitHub Pages) → une URL ouverte dans le navigateur de
   la tablette. L'app reste sans build (fichiers statiques tels quels) ; le `file://` tablette est écarté
   (peu praticable sur iPad). Méthode documentée dans le README.

3. **Édition au stylet** : mode d'édition verrouillé sur le motif sélectionné, outils **pinceau**
   (ajoute de la matière) et **gomme** (en retire), épaisseur réglable. Le tracé du stylet devient un
   **polygone** (offset Clipper de la polyligne, bouts/joints arrondis) **unionné** (pinceau) ou
   **soustrait** (gomme) à la **surface éditable du motif**.
   - **Portée = le motif** (toutes ses instances), cohérent avec l'éditeur de rôles de zones existant
     (`rerenderMotif` re-rend toutes les copies + la vignette). Choix arrêté avec Thibault.
   - **Modèle** : champ optionnel `motif.surface = { [color]: [{pts,closed}] }` (px local, même repère que
     `zones`/`silhouette`). Quand il est présent, il **prime sur** la surface dérivée des zones partout :
     `exportFill`, rendu écran (`fillGroupContent`), vignette (`drawThumb`), export
     (`instancesBottomToTop`) et recalcul de `silhouette`. Il est **initialisé paresseusement** depuis
     `exportFill(motif)` (couleur focale fusionnée) au **premier** coup de stylet.
   - **Couleur** : les coups de stylet emploient la **couleur focale** du motif (clé unique). Un motif
     multi-couleur natif est donc aplati sur sa couleur focale dès la première édition (déjà le cas au rendu
     via `exportFill` — limitation assumée).
   - **Silhouette/occlusion** : après chaque coup, `silhouette` est **recalculée** depuis la surface
     éditée (contour extérieur, trous inclus) pour que l'occlusion « sticker » et le fond blanc restent
     cohérents. Le décor reste see-through (occulte par sa surface réelle, cf. D-005).
   - **Verrouillage** : en mode édition, `stage.draggable=false`, les clics ne changent pas la sélection
     (on reste sur le motif), le pan se fait à **deux doigts** (réutilise le tactile du chantier 2). Sortie
     explicite du mode → comportement normal restauré.

### Contexte
Retours de Thibault : (1) motifs importés « toujours beaucoup trop grands et souvent tête en bas » ;
(2) volonté d'utiliser l'outil **sur tablette** ; (3) volonté de **retoucher au stylet** décor et motifs
(effacer/dessiner) en **restant dans le motif sélectionné** pendant l'édition.

### Alternatives envisagées
- **Orientation** : compenser le flip ailleurs (export) plutôt qu'à l'import — rejeté : la cause est le
  `-y` d'import, le retirer aligne écran ET export (tous deux repassent par `pxPathsToMm`).
- **Plafond d'échelle** : agrandir aussi les petits motifs pour les normaliser — rejeté : « maximum 1/10 »
  est un plafond, on ne fait que réduire les trop-grands.
- **Édition par instance** (la copie posée seule) — rejeté avec Thibault : demande de dissocier la
  géométrie de l'instance du motif de bibliothèque (refonte d'état lourde) ; le besoin réel est de
  retoucher le motif, ses copies pouvant rester identiques. Réversible plus tard si besoin.
- **Édition raster** (peindre des pixels) — rejeté : sortie laser = vecteur ; on reste en polygones
  (booléens Clipper), cohérent avec tout le pipeline SVG.
- **Accès tablette en `file://`** (copier les fichiers) — rejeté : impraticable sur iPad, et casse les
  `fetch`/inputs selon le navigateur ; l'hébergement statique donne une URL stable.

### Conséquences
- `app.js` : import (flip retiré + plafond), tactile (multi-touch zoom/pan), mode édition stylet
  (état/verrouillage/outils/pointeur), lecture de `motif.surface` partout, persistance de `surface`.
- `geometry.js` : `ML.strokeToPolygon(pts, radiusPx)` (offset open-round Clipper), helpers
  d'union/différence de surface par couleur, recalcul de silhouette depuis une surface. **Toute modif
  géométrique passe par `node test/run.js`.**
- `index.html` / `style.css` : barre d'outils d'édition, sidebar repliable, cibles tactiles, `touch-action`.
- `README.md` : procédure d'hébergement statique pour la tablette.
- Persistance : `motif.surface` ajouté au JSON projet (absent = rendu par zones, rétro-compatible).

### Impact IA
Plan d'exécution : `PLAN_tablette_edition.md` (Lot 3). Géométrie (`strokeToPolygon`, union/différence,
silhouette) validée par `node test/run.js` + contrôle visuel ; le mode édition validé manuellement au
stylet/tactile. Le `file://` doit continuer de fonctionner en dev (pas d'ES modules introduits).
