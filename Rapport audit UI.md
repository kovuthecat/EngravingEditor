# Rapport d’audit UI — Motif Layout

**Date :** 22 juin 2026  
**Environnement :** Windows, Playwright CLI, Chromium, viewport `1440 × 1000`  
**Application auditée :** `Outils/motif-layout/index.html`, servie temporairement sur `http://127.0.0.1:18765`

## Périmètre testé

- Import du contour guitare : `exemple motif/Contour guitare/Guitare sur fond blanc creusée.svg`.
- Import et placement du décor : `exemple motif/Decor/decor hybride.svg`.
- Import de plusieurs personnages : `noiraudes.svg` et `yoda.svg`.
- Import d’un symbole : `majora mask.svg`.
- Déplacement, rotation et redimensionnement.
- Changement de rôle `PERSONNAGE` / `SYMBOLE`.
- Modification du z-order.
- Export du SVG final.
- Contrôle de la console navigateur et du SVG téléchargé.

## Résumé

Le contour, le décor et les motifs peuvent être importés. Les interactions sur les motifs simples fonctionnent : déplacement, rotation, échelle numérique, changement de rôle et z-order. Deux défauts bloquent toutefois le flux complet avec le décor réel : sa manipulation peut produire des transformations `NaN`, et l’export volumineux dépasse la pile JavaScript.

## Résultats

| Test | Résultat | Observation |
|---|---:|---|
| Installation Playwright CLI | ✅ | Installation globale réussie. |
| Installation Chromium Playwright | ✅ | Chromium `v1226` installé. |
| Chargement de l’application | ✅ | Titre et interface corrects. |
| Import du contour guitare | ✅ | Canevas rendu sans nouvelle erreur. |
| Import du décor lourd | ✅ partiel | Import réussi après un calcul long et bloquant. |
| Placement initial du décor | ✅ | Instance créée au centre. |
| Échelle numérique du décor | ✅ | Passage de `1,00` à `0,20`. |
| Déplacement du décor | ❌ | Transformation Konva corrompue en `NaN`. |
| Import de personnages | ✅ | `noiraudes` et `yoda` ajoutés à la bibliothèque. |
| Import d’un symbole | ✅ | `majora mask` ajouté avec le rôle `SYMBOLE`. |
| Déplacement d’un motif simple | ✅ | Coordonnées modifiées correctement. |
| Rotation d’un motif simple | ✅ | Rotation réglée à `20°`. |
| Redimensionnement d’un motif simple | ✅ | Échelle réglée à `0,50`. |
| Changement de rôle | ✅ | `PERSONNAGE → SYMBOLE`, couleur et marge mises à jour. |
| Z-order | ✅ | Descendre et Tout devant vérifiés numériquement. |
| Export sans décor valide | ✅ partiel | XML valide, mais décor corrompu omis silencieusement. |
| Export nominal décor + motifs | ❌ | `RangeError: Maximum call stack size exceeded`. |

## Problèmes rencontrés

### 1. Export volumineux bloquant

**Sévérité :** bloquante  
**Fichier :** `src/app.js`, fonction `exportSVG`, autour de la ligne 525.

L’export avec le décor réel, un personnage et un symbole échoue sur :

```js
const w = Math.max(...allPts.map((p) => p[0]));
```

Le tableau de points est trop volumineux pour être passé comme arguments à `Math.max`.

**Erreur observée :**

```text
RangeError: Maximum call stack size exceeded
    at HTMLButtonElement.exportSVG (src/app.js:525:20)
```

### 2. Manipulation du décor corrompt sa transformation

**Sévérité :** bloquante  
**Surface :** groupe Konva du décor et `Konva.Transformer`.

Après tentative de déplacement du décor, ses attributs deviennent non numériques :

```json
{
  "x": null,
  "y": null,
  "rotation": null,
  "scaleX": null,
  "scaleY": null,
  "skewX": null
}
```

Les valeurs `null` correspondent à des `NaN` sérialisés par `JSON.stringify`. Le même déplacement fonctionne sur un personnage simple. La cause probable est l’absence de boîte géométrique exploitable pour le décor rendu uniquement avec un `Konva.Shape` personnalisé.

Conséquence : le décor est ensuite omis silencieusement de l’export.

### 3. Éditeur de zones trop volumineux

**Sévérité :** majeure  
**Surface :** `#zone-list` dans l’inspecteur.

La sélection du décor génère simultanément :

- `3 936` lignes DOM ;
- une hauteur de sidebar d’environ `92 019 px` ;
- des clics et snapshots dépassant régulièrement le timeout Playwright de 5 secondes.

Les contrôles de rôle, couleur, marge et z-order deviennent difficiles à utiliser.

### 4. Import du décor bloquant

**Sévérité :** majeure.

Le calcul du décor monopolise le thread principal pendant plus de 30 secondes. Aucun indicateur de progression n’est affiché et l’interface paraît figée.

La cause déjà identifiée est la recherche de parenté des zones en complexité proche de `O(n²)` dans `ML.buildZones`.

### 5. Erreur CommonJS de Clipper dans le navigateur

**Sévérité :** moyenne  
**Fichier :** `vendor/clipper.js`, autour de la ligne 6986.

```text
ReferenceError: module is not defined
```

Le fichier tente d’utiliser `module.exports` dans un script navigateur classique. La bibliothèque reste partiellement disponible avant cette erreur, mais la console n’est pas saine.

### 6. Trop de calques Konva

**Sévérité :** faible à moyenne.

```text
Konva warning: The stage has 6 layers. Recommended maximum number of layers is 3-5.
```

Cette organisation peut aggraver les problèmes de performance avec le décor lourd.

### 7. Favicon absent

**Sévérité :** mineure.

Le navigateur demande `/favicon.ico`, qui répond `404`. Cela n’affecte pas les fonctions de l’outil mais pollue la console.

## Export observé

Lors du premier export après corruption du décor :

- fichier XML valide ;
- taille : `129 771` octets ;
- `viewBox="0 0 378.4605 286.02975"` ;
- aucune valeur `NaN` ou `Infinity` dans le fichier ;
- un seul calque `#c62828` ;
- décor bleu absent sans message d’erreur.

Lors de l’export nominal avec trois instances valides avant calcul : l’export échoue avant téléchargement avec le dépassement de pile décrit plus haut.

## Conclusion

Le flux est utilisable pour des motifs simples, mais pas encore pour une composition complète avec le décor de production. Les corrections prioritaires sont :

1. remplacer les spreads volumineux dans l’export ;
2. fournir une bbox stable au décor pour Konva ;
3. paginer ou virtualiser l’éditeur de zones ;
4. accélérer `ML.buildZones` avec un préfiltre par bbox ;
5. nettoyer les erreurs Clipper et les avertissements Konva.

Le détail des corrections proposées se trouve dans `Plan correction UI post audit.md`.
