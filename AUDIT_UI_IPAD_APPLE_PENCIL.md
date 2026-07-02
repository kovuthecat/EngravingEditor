# Audit UI — iPad et Apple Pencil

## Objectif

Évaluer le confort d’édition des motifs et des décors sur iPad avec un Apple Pencil, puis identifier les améliorations nécessaires pour obtenir un outil réellement ergonomique en usage tactile.

## Conclusion générale

L’éditeur possède déjà une base fonctionnelle pertinente pour le stylet : dessin libre, gomme, formes, lasso, pression, plume, annulation par trait et navigation à deux doigts.

L’interface reste toutefois organisée comme une application desktop adaptée au tactile. Pour rendre l’édition confortable sur iPad, le chantier principal consiste à créer un véritable **mode dessin centré sur le canevas et le Pencil**, avec des commandes tactiles dimensionnées correctement et une séparation nette entre les actions du stylet et celles des doigts.

## Problèmes prioritaires

### 1. Corriger l’erreur JavaScript

L’audit détecte l’erreur `module is not defined` au chargement. Même si l’interface apparaît, cette erreur peut interrompre une partie de l’initialisation et rendre certains comportements imprévisibles.

Cette anomalie doit être corrigée avant toute validation fonctionnelle approfondie.

### 2. Donner la priorité au canevas pendant l’édition

La barre latérale occupe 270 px et la palette flottante peut atteindre 220 px. En orientation portrait, la surface réellement disponible pour dessiner devient rapidement insuffisante.

Recommandations :

- masquer automatiquement la bibliothèque à l’entrée en édition ;
- afficher le canevas en plein écran ;
- remplacer la palette verticale par une barre d’outils compacte en bas de l’écran ;
- placer les réglages secondaires dans une popover ou un panneau temporaire ;
- permettre de rappeler la bibliothèque sans quitter le mode d’édition.

### 3. Agrandir les cibles tactiles

Les boutons utilisent actuellement une hauteur minimale de 40 px. Plusieurs contrôles sont encore plus petits, notamment la suppression d’un motif, certaines bascules et les champs numériques.

Toutes les actions tactiles importantes devraient disposer d’une cible d’au moins **44 × 44 points**. Les contrôles dangereux ne doivent pas dépendre du survol, qui n’existe pas sur iPad.

Pour les éléments de bibliothèque, un appui long peut ouvrir un menu contextuel contenant `Renommer`, `Dupliquer` et `Supprimer`.

### 4. Distinguer l’Apple Pencil du doigt

Le code traite actuellement tout contact unique comme un trait. Un doigt posé accidentellement peut donc dessiner à la place du Pencil.

Comportement cible :

- Apple Pencil : dessiner ou gommer ;
- un doigt : sélectionner ou déplacer la vue selon le mode actif ;
- deux doigts : déplacer la vue et zoomer ;
- option `Dessiner uniquement avec l’Apple Pencil` ;
- interruption propre du trait si un geste multitouch commence.

Cette séparation est l’amélioration la plus importante pour le confort et la prévention des erreurs.

### 5. Améliorer le traitement de la pression

La pression du stylet est déjà lue et utilisée pour faire varier la largeur. L’implémentation reste cependant minimale.

Améliorations recommandées :

- stabilisation du trait réglable ;
- courbes de pression `Douce`, `Normale` et `Ferme` ;
- aperçu fidèle de l’épaisseur pendant le tracé ;
- réglage de la largeur minimale ;
- exploitation de l’inclinaison et de l’azimut du Pencil lorsque Safari les expose ;
- pression désactivée pour la gomme, sauf choix explicite.

Le mode `Plume` gagnerait à utiliser l’orientation réelle du Pencil plutôt qu’un angle uniquement manuel.

### 6. Renforcer le retour visuel

Avant et pendant le dessin, l’utilisateur doit pouvoir anticiper précisément le résultat.

Ajouter :

- un curseur circulaire représentant la taille réelle du pinceau ou de la gomme ;
- une apparence distincte pour chaque outil ;
- une surbrillance claire du motif ou du décor édité ;
- un indicateur permanent de l’outil, de la taille et du mode de trait ;
- un aperçu fidèle de la pression pendant le tracé.

### 7. Clarifier le cycle de brouillon

Les actions `Appliquer`, `Jeter l’essai` et `Sortir` introduisent une ambiguïté : le devenir des modifications lors de la sortie n’est pas immédiatement évident.

Proposition :

- action principale `Terminer` ;
- action destructive `Annuler les modifications` ;
- sauvegarde automatique du brouillon ;
- badge visible `Modifications non appliquées` ;
- confirmation uniquement lorsqu’une action entraîne réellement une perte.

### 8. Rendre le lasso plus manipulable

Après avoir dessiné le lasso, l’utilisateur doit toucher précisément la zone sélectionnée pour la déplacer, puis choisir une action dans la palette. Cette interaction sera difficile sur les petits éléments.

Améliorations :

- boîte englobante visible ;
- poignée centrale de déplacement ;
- tolérance tactile supérieure à la géométrie visible ;
- déplacement immédiat après fermeture du lasso ;
- actions contextuelles proches de la sélection ;
- poignées dimensionnées pour le tactile.

### 9. Remplacer les aides desktop par une aide contextuelle

Le bandeau actuel décrit la molette, les raccourcis clavier et les touches `Suppr`, `Ctrl+D`, `[` et `]`. Ces indications occupent de la place sans aider l’utilisateur principal sur iPad.

Les raccourcis peuvent rester disponibles pour un clavier externe, mais toutes les fonctions importantes doivent être exposées dans l’interface. Le bandeau devrait afficher uniquement les gestes utiles dans le contexte courant.

## Organisation cible sur iPad

- **Barre haute** : retour, nom du projet, annuler, rétablir et état de sauvegarde.
- **Canevas** : plein écran, sans panneau permanent pendant le dessin.
- **Barre basse** : sélectionner, pinceau, gomme, formes et lasso.
- **Réglages contextuels** : taille, pression, plume et options de l’outil courant.
- **Bibliothèque** : panneau latéral escamotable.
- **Sélection** : palette contextuelle proche de l’objet sans le masquer.
- **Navigation** : Pencil pour dessiner, doigts pour naviguer.

## Ordre de mise en œuvre recommandé

1. Corriger `module is not defined`.
2. Différencier Pencil et doigt.
3. Porter toutes les cibles tactiles à 44 points minimum.
4. Créer le mode canevas plein écran avec barre d’outils basse.
5. Clarifier le cycle brouillon, application et sortie.
6. Ajouter stabilisation, courbes de pression et curseur d’outil.
7. Optimiser le lasso et les poignées tactiles.
8. Valider sur un véritable iPad avec Apple Pencil.

## Limites de l’audit

L’émulation navigateur permet d’évaluer le viewport, la disposition et les événements tactiles, mais elle ne reproduit pas fidèlement :

- la pression réelle ;
- l’inclinaison et l’azimut ;
- la latence perçue ;
- le rejet de paume ;
- le confort sur une session de dessin prolongée.

Une validation finale sur matériel réel reste donc indispensable.
