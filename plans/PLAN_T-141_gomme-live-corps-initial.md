# PLAN_T-141 — Gomme live sur le corps initial : masquer l'instance réelle pendant l'édition   (rédigé par Opus)

> Exécutant : fais UNIQUEMENT cette tâche, dans l'ordre des étapes. Lis UNIQUEMENT les fichiers
> sous « Lire ». Ne crée aucun fichier/dépendance hors « Modifier ». Design fixé — ne reconçois pas.
> Doute ou blocage → STOP, signale, rends la main.

- Date : 2026-07-04 · Modèle : Sonnet · effort : medium · Branche : feat/ux-perf-edition

## Objectif

En mode édition stylet, l'effacement du corps initial du motif doit se voir en direct (pas seulement
à la sortie). Aujourd'hui la zone gommée reste affichée en couleur pleine tant qu'on est en édition.

## Décision clé

**Cause (diagnostiquée, ne pas re-chercher).** Le fix 9da4322 (2026-07-04, `redrawEditLayer` repeint
le fond blanc « sticker » depuis `ML.silhouetteFromSurface(edit.draft)`) est correct côté calque
d'essai, mais il a révélé le vrai problème : **l'instance réelle du motif (`edit.node`, sur
`mainLayer`) n'est jamais masquée pendant l'édition** — elle est seulement décachée
(`g.clearCache()` dans `enterEdit`). Le calque d'essai (`editLayer`, sur `uiLayer`, donc AU-DESSUS
de `mainLayer`) la recouvrait via le sticker blanc ; maintenant que sticker + brouillon rétrécissent
sous la gomme, le « trou » laisse voir l'instance réelle intacte en dessous → visuellement rien ne
s'efface. Effacer un AJOUT marche, lui, car l'ajout n'existe que dans `editLayer`.

**Fix décidé : masquer `edit.node` pendant l'édition** (`visible(false)` dans `enterEdit`, restauré
dans `exitEdit`). Le calque d'essai est déjà l'affichage complet du motif en édition (sticker blanc
+ brouillon couleur) ; l'instance réelle en dessous ne sert à rien et ne fait que polluer.

Points vérifiés (pas besoin de re-vérifier) :
- `editPreview` (aperçu de trait en cours) est ajouté à `editLayer`, PAS au groupe réel — le
  commentaire l. ~594 de `fillGroupContent` (« startStroke() ajoute l'aperçu comme enfant de ce
  groupe ») est PÉRIMÉ ; le corriger (étape 4).
- `syncEditLayerTransform`, `localPoint`, `getAbsoluteScale` lisent des transforms : insensibles à
  `visible(false)`.
- `applyMotifDraft` pendant l'édition live appelle `rerenderMotif` → `fillGroupContent(g)` sur le
  nœud masqué : ne touche pas `visible`, le nœud reste masqué. OK.
- Konva : `Container.getClientRect()` saute les ENFANTS invisibles, pas le nœud appelé lui-même ;
  par prudence on masque APRÈS `zoomToFitEdit(g)` (étape 1).

## Lire

- `src/app.js` : fonctions `enterEdit` (~l. 1191-1244) et `exitEdit` (~l. 1245-1295) uniquement,
  plus le bloc de commentaires de `fillGroupContent` (~l. 590-600).
- (contexte si besoin) commentaire `(fix 2026-07-04)` dans `redrawEditLayer` (~l. 1136-1143).

## Modifier

- `src/app.js` (seul fichier de code)
- `STATUS.md`, `TASKS.md`, `VALIDATION.md` (fin de tâche)

## Hors périmètre

- Ne PAS toucher `redrawEditLayer`, `paintEditStatic`, ni la géométrie (`src/geometry.js`).
- Ne PAS changer le cas DECOR de `redrawEditLayer` (fond figé = limite documentée, inchangée).
- Ne PAS masquer les AUTRES instances du même motif (seul `edit.node` est édité/recouvert).

## Étapes

1. `enterEdit()` : après l'appel `zoomToFitEdit(g)` (fin de fonction), ajouter
   `g.visible(false); mainLayer.batchDraw();` avec un commentaire court : l'instance réelle est
   remplacée à l'écran par `editLayer` (sticker + brouillon) ; sans ça, la gomme sur le corps
   initial laisse voir l'instance intacte en dessous (suite du fix 2026-07-04).
2. `exitEdit()` : restaurer `editedNode.visible(true)` AVANT le bloc final
   `if (motif && wasDirty) rerenderMotif(...) else safeCache(editedNode, 2)` (garder null-check :
   `if (editedNode) editedNode.visible(true);`). `rerenderMotif`/`safeCache` redessinent ensuite ;
   ajouter `mainLayer.batchDraw()` si la branche `else` ne redessine pas déjà mainLayer.
3. Vérifier le chemin « Appliquer pendant l'édition live » (`applyMotifDraft`) : le nœud doit
   rester masqué après (on est toujours en édition). Aucun code à changer attendu — juste relire.
4. Mettre à jour le commentaire périmé de `fillGroupContent` (~l. 594-596) : l'aperçu de trait vit
   sur `editLayer` ; le décachage du groupe en édition reste nécessaire pour `rerenderMotif`
   pendant l'édition (Appliquer live), pas pour l'aperçu.
5. `node test/run.js` (aucune modif géométrique attendue, doit rester vert).

## Validation

- Auto (bloque le commit) : `node test/run.js` → vert.
- Humain (visuel, non bloquant, → `VALIDATION.md`) :
  1. Entrer en édition sur un motif MOTIF (pas décor) → gommer une zone du corps initial →
     le trou apparaît IMMÉDIATEMENT (fond de page visible, pas la couleur du motif).
  2. Gommer un ajout vert → disparaît en live (non-régression).
  3. Sortir de l'édition sans rien faire → le motif réapparaît normalement (pas d'instance
     restée invisible).
  4. Sortir avec brouillon modifié → motif rendu avec le vert « en attente » (non-régression).
  5. « Appliquer » PENDANT l'édition → rester en édition, affichage cohérent ; puis sortir →
     motif visible.
  6. Autres instances du même motif : restent visibles pendant toute l'édition.

## Si bloqué

Si après l'étape 1 le zoom-to-fit d'entrée cadre mal (bbox nul) → STOP, signaler : l'ordre
masquage/`zoomToFitEdit` est en cause, ne pas improviser un contournement.

## Commit

`fix(edit): masque l'instance réelle pendant l'édition — gomme live sur le corps initial [T-141]`

## Statut

[x] fait · exécuté par : Sonnet · le : 2026-07-04 · commit : (à venir)
