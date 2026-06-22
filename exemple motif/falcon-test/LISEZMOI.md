# Tests Falcon Design Space — « noiraude »

But : décider **comment l'export SVG de motif-layout doit coder la distinction
« zone remplie » (gravure surface) vs « ligne à tracer »** pour que Falcon crée
des **calques séparés réglables**. On teste 3 hypothèses + 1 contrôle.

Tous les fichiers dérivent du même dessin (noiraude), découpé en sous-chemins :
corps (1) · yeux (2) · pupilles (2). Aperçu visuel : ouvrir `apercu.html`.

## Protocole

Importe chaque fichier **séparément** dans Falcon, puis note :

| Fichier | Hypothèse testée | À observer dans Falcon |
|---|---|---|
| `noiraude_A_couleurs.svg` | Falcon sépare par **couleur de remplissage** | Combien de calques ? Un « noir » + un « rouge » distincts et réglables séparément ? Les yeux apparaissent-ils en bois (trous respectés) ? |
| `noiraude_B_fill-vs-stroke.svg` | Falcon distingue **surface pleine (fill)** vs **trait (stroke)** | Le corps plein et le contour bleu tombent-ils sur 2 calques différents ? Le trait reste-t-il une ligne fine (pas une surface) ? |
| `noiraude_C_fidele-evenodd.svg` | Falcon respecte **fill-rule:evenodd** (trous) sur 1 seul path | Les yeux sont-ils évidés (bois) ou remplis noir ? 1 seul calque ? |
| `noiraude_D_separes-pleins.svg` | Contrôle négatif (aucun trou encodé) | Doit donner un blob noir (yeux pleins). Confirme qu'il FAUT encoder les trous. |

## Comment lire les résultats → décision d'export

- **Si A donne 2 calques par couleur** → convention possible : « une couleur = un
  rôle laser » (ex. noir = gravure pleine, autre couleur = autre passe).
- **Si B sépare fill et stroke en 2 calques** → convention retenue probable :
  zones REMPLI exportées en `fill`, zones LIGNE en `stroke` (+ couleurs dédiées).
- **Si C respecte evenodd** → on peut exporter les trous proprement dans un seul
  path par zone remplie. **Sinon**, l'export devra émettre les surfaces trouées
  autrement (ex. soustraction Clipper en amont, ou chemins inversés).
- **D** sert juste à confirmer qu'un export « tout plein sans trous » est faux.

## À me renvoyer

Pour chaque fichier : **nb de calques**, **leur nom/couleur**, **trous respectés
oui/non**, et si possible une **capture** de la liste des calques. Avec ça je fige
la tâche T6 (export SVG) du plan.

> Fichiers de travail jetables : `test/_explore_noiraude.js` et
> `test/_gen_falcon_tests.js` (régénèrent ce dossier). Supprimables après décision.
