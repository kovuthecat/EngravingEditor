# Audit UI iPad + Apple Pencil Pro — 3 juillet 2026

## Méthode

Cible : https://engraving-editor.vercel.app/ · Playwright iPad Pro 11 paysage 1194×834, DPR 2, tactile · Pencil simulé par événements CDP `pointerType=pen`. Fichiers d’exemple autorisés et chargés.

**Limite :** Playwright ne reproduit pas le rejet de paume, le hover/pression physiques ni une impression papier.  
Légende : **OK**, **KO**, **PARTIEL**, **NT** (matériel/référence requis).

## Synthèse ergonomique

Aucune erreur console/page/réseau et aucun débordement horizontal. Le mode édition gère Pencil, doigt, pinch, `pointercancel`, réentrée et Undo/Redo.

Défauts prioritaires :

- **KO : cibles < 44 px.** Boutons à 40 px de haut, × à 24×24, sliders à 16–26 px.
- Sidebar d’environ 6 500 px pour 765 px visibles : Projet est très loin sous la ligne de flottaison.
- Palette 220 px dense, scrollable, avec trop de texte d’aide.
- Header sous-dimensionné : menu 40×40, Annuler 88×34.
- Hiérarchie insuffisante entre outil, forme et comportement du trait.

Points positifs : fond visible, `100dvh`, sidebar repliée à 0 px en édition puis restaurée à 270 px, 92 personnages/24 symboles.

## Checklist VALIDATION.md

### P8 · PDF A4

- **OK** PDF généré : 913 372 octets, 5 pages A4 paysage.
- **OK** garde + plan 2×2 + 4 feuilles cohérentes.
- **NT** règle physique de 100 mm.
- **NT** superposition des croix/raccords imprimés.
- **PARTIEL** structure et orientation cohérentes ; miroir/rendu final à confirmer sur papier.

### Lot 5 · bibliothèque

- **OK** grilles 92/24 et vignettes différées.
- **OK** clic built-in → instance.
- **OK** × persiste après sauvegarde IndexedDB complète/reload.
- **OK** Restaurer persiste après reload.
- **PARTIEL** Pencil/Undo testés ; `exemple motif/` propre ; persistance d’une retouche appliquée non prouvée.

### Édition tactile

- **PARTIEL** outils, doigt, Pencil, Pression et Plume activables.
- **KO** palette visible, mais cibles sous 44 px.

### Correctifs

- **OK** fond iPad visible.
- **OK** décor posé/sélectionnable avec palette/Transformer ; tenue exacte dans contour à confirmer.

### T14 · Undo/Redo

- **OK** 12 traits → 12 Undo : pixels identiques ; 12 Redo : pixels identiques.
- **OK** deux Undo + nouveau trait → Redo désactivé.
- **NT** lasso Déplacer + Undo/Redo.
- **OK** aucune opération > 1 s après 30 traits.

### T13 · opérations/vert

- **OK** décor : médiane 389 ms, p95 450 ms, max 540 ms par séquence Playwright.
- **NT** exactitude du vert avec pinceau/gomme/Undo.
- **NT** vert après les trois actions lasso.
- **PARTIEL** Appliquer/Jeter présents ; disparition du vert non prouvée.
- **NT** comparaison historique avant/après.

### T11 · cache brouillon

- **PARTIEL** aucun bitmap vide/décalé ni erreur ; absence de baseline de fluidité.
- **PARTIEL** gomme/formes/lasso activables ; rendu lasso non couvert.
- **NT** cache à fort zoom sur iPad réel.

### P6 T1 · verrou décor

- **OK** ON retire la sélection et donne `aria-pressed=true`.
- **OK** OFF réactive.
- **PARTIEL** verrou pendant sélection confirmé ; pendant édition non isolé.
- **OK** reload après sauvegarde restaure verrou/libellé/`aria-pressed`.

### P6 T2 · import PNG

- **OK** décor hybride vectorisé en 445 ms.
- **OK** invalide : alerte propre, overlay retiré, aucun crash.
- **OK** `file://` fonctionne.
- **OK** PNG 3024×4032 importé en 832 ms.

### P6 T3 · rafraîchir

- **PARTIEL** commande/input fonctionnels ; conservation transformation non établie.
- **NT** ciblage entre deux décors.
- **OK** sans décor : message exact, aucun crash.
- **NT** écrasement de `motif.surface`.

### P7 T1 · Clipper

- **OK** aucune `ReferenceError`.
- **OK** `node test/run.js` entièrement vert.

### P7 T2 · CSS iPad

- **OK** repli/dépli ; entrée édition replie, sortie restaure.
- **OK** `100dvh`, scène au bas du viewport.
- **PARTIEL** × visible, touch-action/anti-callout présents ; Safari réel à confirmer.
- **KO ergonomie** × = 24×24.

### P7 T3 · deuxième contact

- **OK** pinch modifie la vue sans marque.
- **NT** annulation Rectangle/Lasso en cours.
- **NT** sélection lasso survivant au pinch.

### P7 T5 · Pointer Events

- **NT** desktop exclu.
- **OK** Pencil dessine, pinch navigue, `pointercancel` sans marque.
- **OK** sortie/réentrée fiable.

### P7 T6 · Pencil/doigt

- **OK** Pencil dessine ; doigt navigue ; deux doigts zooment.
- **OK** bascule navigue/dessine dans les deux sens.
- **PARTIEL** `pointercancel` validé ; rejet de paume NT.
- **NT** desktop exclu.

### P7 T7 · coalescés/prédits

- **NT** lissage/proximité/vibration exigent le matériel.
- **PARTIEL** Pression accepte les traits sans fin > 1 s.
- **NT** desktop exclu.

### P7 T8 · curseur

- **NT** souris desktop exclue.
- **PARTIEL** rendus distincts gomme/plume/formes/lasso ; forme/couleur exactes non certifiées.
- **PARTIEL** réticule/point détectés par différences de capture.
- **NT** hover Pencil Pro.
- **PARTIEL** absent après sortie ; `pointerleave` exact non confirmé.
- **NT** décision T4 matérielle.

### P7 T9 · pression

- **PARTIEL** Douce/Normale/Ferme, largeur min et pressions variables acceptées.
- **NT** gomme constante selon pression physique.
- **NT** souris exclue.

### P7 T10 · stabilisation

- **OK** Off par défaut ; Léger/Moyen/Fort activables.
- **NT** tremblement fort zoom et fin sous pointe.
- **PARTIEL** formes/lasso restent activables ; invariance visuelle non établie.

## Artefacts

`ipad-initial.png`, `ipad-builtin-selected.png`, `ipad-edit-mode.png`, `ipad-contour-decor.png`, `ipad-export.pdf`, `ipad-pdf-page-1.png` à `3.png`, `ipad-probe.json` dans `output/playwright/`.

## Verdict

**Validation partielle.** Les parcours essentiels sont stables. Le défaut prioritaire est la taille des cibles tactiles. Pression, hover, rejet de paume, lasso et assemblage papier restent à confirmer sur iPad + Apple Pencil Pro physiques.
