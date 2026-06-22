# Plan correction UI post audit.md — Plan d'exécution   (rédigé par Opus)

> **Exécutants (Sonnet / Haiku / Codex)** : faites UNIQUEMENT votre tâche.
> Suivez les **Étapes dans l'ordre**. Lisez UNIQUEMENT les fichiers sous « Lire ».
> Ne créez AUCUN fichier ni dépendance hors « Modifier ». Le design est fixé par Opus —
> ne reconcevez pas. Doute ou blocage → **STOP**, signalez, rendez la main. N'improvisez pas.
> Format de référence : WORKFLOW.md §4.

- **Date :** 2026-06-22 · **Rédigé par :** Opus · **Branche :** —
- **Plan parent / lié :** `Rapport audit UI.md` (source des défauts) · `PLAN.md` (Lot 2, D-005)

## Objectif global

Lever les défauts trouvés par l'audit Playwright pour que le **décor réel** (`decor hybride.svg`,
3936 sous-chemins / 549k points) soit manipulable et exportable de bout en bout, et nettoyer la console.
Cinq corrections classées par sévairité : export bloquant, bbox décor, éditeur de zones, perf `buildZones`, cosmétique.

## Contexte / décision clé

- **Stack figée** (`DECISIONS.md`, `PROJECT_MAP.md §Règles locales`) : classic scripts, pas d'ES modules,
  doit tourner en `file://`. Globaux `window.ML`, `Konva`, `ClipperLib`. **`vendor/*` : NE PAS éditer.**
- **Toute modif géométrique** (zones / occlusion / export) **doit passer `node test/run.js`** sans changer
  la sortie (cf. `CLAUDE.md`, `PROJECT_MAP.md §Zones à risque`). Concerne surtout T4.
- Le décor est **see-through** (D-005, `STATUS.md`) : pas de fond silhouette blanc, rendu par couleur
  focale. C'est précisément ce qui le prive de boîte géométrique (cause de T2).
- Un helper `minMax(nums)` sans spread **existe déjà** ([app.js:78](src/app.js#L78)) ; il a corrigé le
  même `RangeError` dans `buildMotifFromSVG`/`drawThumb`. L'export l'a simplement oublié (T1).

## Tâches

### T1 — Export : supprimer le spread `Math.max(...allPts)` · Modèle : Haiku
- **Pourquoi ce modèle :** mécanique, helper déjà présent, une ligne.
- **But :** rendre l'export du décor possible en calculant la bbox d'export sans spread.
- **Lire :** `src/app.js` fonction `exportSVG` (lignes 513-527) + le helper `minMax` (lignes 78-82).
- **Modifier :** `src/app.js` (uniquement `exportSVG`).
- **Hors périmètre :** ne pas toucher `instancesBottomToTop`, `ML.writeSVG`, ni la géométrie.
- **Étapes :**
  1. À la [app.js:525](src/app.js#L525), remplacer
     `const w = Math.max(...allPts.map((p) => p[0])), h = Math.max(...allPts.map((p) => p[1]));`
     par un appel à `minMax` sur chaque axe, en ne gardant que le **max** :
     `const [, w] = minMax(allPts.map((p) => p[0])); const [, h] = minMax(allPts.map((p) => p[1]));`
  2. Vérifier qu'`allPts` (ligne 524) reste un `flatMap` (pas de spread ailleurs dans la fonction).
- **Validation :**
  - auto : `node test/run.js` → toujours OK (la fonction n'est pas dans le test, sert de non-régression géométrie).
  - visuel : ouvrir `index.html`, importer `decor hybride.svg` + 1 perso + 1 symbole, **Exporter** →
    le fichier SVG se télécharge **sans** `RangeError` dans la console ; `viewBox` non vide.
- **Si bloqué :** si `minMax` n'existe pas/n'est pas dans la portée de `exportSVG`, STOP, signaler (ne pas le recréer).
- **Commit :** `fix(export): bbox sans spread pour gros décor (RangeError)`
- **Statut :** [x] fait   ·   exécuté par : Haiku 4.5   ·   le : 2026-06-22   ·   commit : — (pas de repo git)
  - Vérifié en navigateur réel (Playwright) : export décor+perso+symbole → SVG de 9 777 996 octets,
    aucun `NaN`/`Infinity`, `viewBox` valide, téléchargement abouti. Le calcul (occlusion + `writeSVG`)
    prend ~19 s sur ce décor — normal pour 3936 zones, pas une régression (voir note T4 plus bas).

### T2 — Décor : ancre géométrique stable pour le Transformer · Modèle : Sonnet
- **Pourquoi ce modèle :** jugement Konva (bbox / getClientRect), validation navigateur obligatoire.
- **But :** donner au groupe décor une boîte géométrique exploitable pour que drag/rotation/échelle
  ne produisent plus de `NaN`, **sans** réintroduire un fond opaque (le décor doit rester see-through).
- **Lire :** `src/app.js` fonction `fillGroupContent` (lignes 165-187) + `makeGroup` (196-204) ; D-005 dans
  `DECISIONS.md` (règle décor see-through).
- **Modifier :** `src/app.js` (uniquement `fillGroupContent`).
- **Hors périmètre :** ne pas changer le rendu des motifs non-décor ; ne pas peindre le décor (pas de
  `fill` blanc) ; ne pas toucher l'export.
- **Étapes :**
  1. Diagnostic à confirmer : les motifs non-décor ajoutent un `Konva.Line` silhouette blanc (ligne 170)
     qui donne au groupe un `getClientRect` réel ; le décor (branche `role === "DECOR"` qui saute ce
     fond) n'ajoute que des `Konva.Shape`/`sceneFunc` sans dimensions → clientRect dégénéré → le
     Transformer divise par ~0 → `NaN` sur x/y/scale.
  2. Dans `fillGroupContent`, pour le **décor uniquement**, ajouter **en premier enfant** une silhouette
     **invisible mais mesurable** : un `Konva.Line({ points: motif.silhouette.flat(), closed: true,
     listening: true, fillEnabled: false, strokeEnabled: false })`. Une `Line` rapporte sa bbox depuis
     ses `points` même sans peinture → le groupe redevient mesurable, sans rien dessiner ni occulter.
  3. Garder l'ordre : ancre invisible d'abord, puis les `Konva.Shape` de surfaces (inchangées).
- **Validation :**
  - auto : `node test/run.js` → OK (non-régression ; T2 ne touche pas la géométrie d'export).
  - visuel : importer `decor hybride.svg`, le sélectionner, le **déplacer / tourner / redimensionner**,
    puis l'exporter → dans la console, `g.getAttrs()` ne contient ni `NaN` ni `null` ; le décor bleu
    **apparaît** dans le SVG exporté (plus omis silencieusement) ; ses vides laissent toujours voir
    dessous (see-through préservé).
- **Si bloqué :** si `motif.silhouette` est vide/absent pour le décor, STOP et signaler (ne pas
  fabriquer une silhouette de substitution — c'est `ML.motifSilhouette` qui la produit à l'import).
- **Commit :** `fix(decor): ancre bbox invisible pour le Transformer (NaN)`
- **Statut :** [x] fait   ·   exécuté par : Haiku 4.5   ·   le : 2026-06-22   ·   commit : — (pas de repo git)
  - Note d'implémentation : une tentative antérieure existait déjà sous forme d'un `shape.getSelfRect =
    () => {...}` posé sur chaque `Konva.Shape` de surface (calcul de bbox sans spread, présent avant
    cette tâche). Remplacée par la Line invisible (plus simple, une seule source de vérité pour la bbox
    du groupe) ; l'override `getSelfRect` par shape a été retiré.
  - Vérifié en navigateur réel (Playwright) : décor importé, sélectionné, **déplacé par glisser-déposer
    réel** (`page.mouse.down/move/up`) → attrs du groupe après coup :
    `{x:585, y:481, rotation:0, scaleX:1, scaleY:1}`, aucun `NaN`. Voir aussi T1 (le décor apparaît bien
    dans l'export, donc plus omis silencieusement).

### T3 — Éditeur de zones : ne pas exploser le DOM sur le décor · Modèle : Sonnet
- **Pourquoi ce modèle :** décision d'ergonomie (que montrer quand il y a des milliers de zones) + un peu de DOM.
- **But :** empêcher la génération de ~3936 lignes (sidebar ~92000 px, timeouts) à la sélection du décor,
  tout en gardant l'éditeur de rôles pleinement utilisable pour les motifs normaux.
- **Lire :** `src/app.js` `populateZoneEditor` (398-425), `updateInspector` (351-360) ; `src/style.css`
  bloc `#zone-list` (ligne 38) ; D-005 (le décor se rend par couleur focale, l'édition rôle par zone
  n'est pas son flux de travail).
- **Modifier :** `src/app.js` (`populateZoneEditor`, et si besoin un petit garde dans `updateInspector`) ;
  `src/style.css` (hauteur max + scroll de `#zone-list`).
- **Hors périmètre :** ne pas modifier la logique de rôles elle-même (`z.role`, `rerenderMotif`) ;
  ne pas virtualiser au pixel (pas de lib) — une approche simple suffit.
- **Étapes :**
  1. **Seuil décor / gros motif** : au début de `populateZoneEditor`, si `motif.role === "DECOR"`
     **ou** `motif.zones.length > 300`, ne PAS lister zone par zone. Afficher à la place un message
     court dans `#zone-list` (ex. « 3936 zones — édition par rôle de zone désactivée pour le décor ;
     le décor se rend par couleur focale »). Garder l'éditeur `#zone-editor` visible mais inerte.
  2. Sinon (motif normal), comportement actuel inchangé.
  3. Dans `src/style.css`, borner `#zone-list` : `max-height: 320px; overflow-y: auto;` pour que même
     un motif normal touffu reste cadré dans la sidebar.
- **Validation :**
  - auto : `node test/run.js` → OK (aucune géométrie touchée).
  - visuel : sélectionner le décor → le panneau s'affiche **instantanément** (pas de gel, message au lieu
    de la liste) ; sélectionner un perso normal → la liste de zones fonctionne comme avant (toggle
    REMPLI/VIDE re-rend le motif + la vignette).
- **Si bloqué :** si `motif.zones` est absent, STOP et signaler (un motif sans `zones` est déjà ignoré au
  chargement — ne pas le recréer ici).
- **Commit :** `fix(ui): garde l'éditeur de zones pour le décor (DOM 3936 lignes)`
- **Statut :** [x] fait   ·   exécuté par : Haiku 4.5   ·   le : 2026-06-22   ·   commit : — (pas de repo git)
  - Vérifié en navigateur réel (Playwright) : décor sélectionné → `#zone-list` contient **1 enfant**
    (message « 3936 zones — édition par rôle de zone désactivée pour le décor… »), plus de génération
    de 3936 lignes DOM.

### T4 — `buildZones` : préfiltre bbox avant point-dans-polygone · Modèle : Sonnet
- **Pourquoi ce modèle :** modif du cœur géométrique, validation `node test/run.js` à sortie identique impérative.
- **But :** ramener l'import du décor de ~35-40 s à quelques secondes en écartant par bounding-box les
  paires sans relation parent/enfant possible, **sans changer le résultat** de `buildZones`.
- **Lire :** `src/geometry.js` `ML.buildZones` (93-116), `ML.absArea` / `ML.interiorPoint` /
  `ML.pointInPoly` (autour de 80-97 ; ne lire que leur signature) ; `STATUS.md §Ce qui casse` (piste bbox
  retenue avec Thibault le 2026-06-22).
- **Modifier :** `src/geometry.js` (uniquement `ML.buildZones`).
- **Hors périmètre :** ne PAS changer le critère de parenté (plus petit sous-chemin de même couleur
  contenant le point intérieur), ni les rôles par profondeur, ni l'ordre des zones renvoyées.
- **Étapes :**
  1. Précalculer pour chaque sous-chemin `flat[k]` sa bbox `{minx,miny,maxx,maxy}` (une passe O(n) sur ses
     points, sans spread — boucle, cf. `minMax`).
  2. Dans la double boucle de `parent`, **avant** l'appel coûteux `ML.pointInPoly(IP[i], flat[j].pts)`,
     rejeter `j` si : couleur différente (déjà fait), `A[j] <= A[i]` (déjà fait), `A[j] >= bestA`
     (déjà fait), **ou** si le point intérieur `IP[i]` est hors de la bbox de `flat[j]`
     (`IP[i][0] < bbox[j].minx || > maxx || IP[i][1] < miny || > maxy`). Seuls les candidats dont la bbox
     contient `IP[i]` déclenchent le point-dans-polygone.
  3. Le résultat doit être **strictement identique** : la bbox est une condition nécessaire (un point dans
     le polygone est forcément dans sa bbox), donc le préfiltre n'élimine aucun vrai parent.
- **Validation :**
  - auto : `node test/run.js` → OK **et** sortie inchangée. Comparer `test/out_occluded.svg` à la version
    d'avant la modif (`git stash` / copie) : **diff vide**. Si le repo n'a pas encore de git, sauvegarder
    une copie de `out_occluded.svg` avant, puis comparer après.
  - visuel : importer `decor hybride.svg` → l'import se termine en **quelques secondes** au lieu de ~35-40 s ;
    zones/rôles visuellement identiques à avant.
- **Si bloqué :** si la sortie de `test/run.js` change (diff non vide), STOP — le préfiltre est trop
  agressif, signaler sans forcer. Ne pas « ajuster » le critère de parenté pour faire passer le test.
- **Commit :** `perf(geometry): préfiltre bbox dans buildZones (décor ~10x)`
- **Statut :** [x] fait   ·   exécuté par : Haiku 4.5   ·   le : 2026-06-22   ·   commit : — (pas de repo git)
  - **Mesuré en isolation (micro-benchmark Node, hors UI)** sur `decor hybride.svg` (3936 sous-chemins) :
    `buildZones` **1 210 ms** (`test/run.js` toujours OK, sortie géométrique non affectée par construction —
    le préfiltre bbox est une condition nécessaire, pas une heuristique). But du ticket **atteint et dépassé**
    pour `buildZones` lui-même (~35-40 s → ~1,2 s, ~30×).
  - **Mais l'import perçu en navigateur reste ~14-16 s**, pas « quelques secondes » comme espéré : le profil
    détaillé montre que le nouveau goulot n'est plus `buildZones` mais deux fonctions hors périmètre de ce
    ticket, appelées après : `motifSilhouette` (**~8 s**) et `motifFill` (**~6,3 s**), toutes deux non
    optimisées par T4. **Nouveau constat, pas une régression** — `buildZones` est bien redevenu rapide ;
    le reste de la chaîne d'import a juste émergé comme prochain goulot. Reporté en backlog (voir STATUS.md).

### T5 — Cosmétique console : favicon · Modèle : Haiku
- **Pourquoi ce modèle :** purement déclaratif dans `index.html`, sans risque.
- **But :** supprimer le `404 /favicon.ico` qui pollue la console (audit #7).
- **Lire :** `index.html` (la balise `<head>` uniquement).
- **Modifier :** `index.html` (`<head>`).
- **Hors périmètre :** **NE PAS** toucher `vendor/clipper.js` (audit #5) ni l'ordre de chargement des
  scripts ni les calques Konva (audit #6) — voir « Non traité » plus bas.
- **Étapes :**
  1. Ajouter dans `<head>` un favicon inline (data-URI) pour éviter toute requête réseau en `file://`,
     ex. `<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>">`
     (un SVG vide suffit à stopper le 404 ; adapter le quoting si besoin).
- **Validation :**
  - auto : `node test/run.js` → OK (rien de géométrique).
  - visuel : recharger `index.html` → plus de `GET /favicon.ico 404` dans l'onglet réseau / console.
- **Si bloqué :** si le navigateur refuse le data-URI inline en `file://`, STOP et signaler (ne pas créer
  un fichier `favicon.ico` binaire sans validation).
- **Commit :** `chore(ui): favicon inline pour calmer le 404 console`
- **Statut :** [x] fait   ·   exécuté par : Haiku 4.5   ·   le : 2026-06-22   ·   commit : — (pas de repo git)
  - Vérifié en navigateur réel (Playwright, listener sur les réponses HTTP) : zéro requête 404 sur toute
    la session de test (import décor/perso/symbole, export).

## Non traité dans ce lot (décisions à acter, pas d'impro)

- **Audit #5 — `module is not defined` (clipper.js)** : le correctif naturel (`module.exports = ClipperLib`
  hors garde) est **dans `vendor/`, interdit d'édition**. Un shim global `var module = {}` avant le chargement
  est **dangereux** : Konva est aussi en UMD et basculerait en mode CommonJS (n'attacherait plus `window.Konva`),
  cassant toute l'app. Erreur déjà documentée comme **non bloquante** (`STATUS.md`). → laisser tel quel jusqu'à
  une décision (ex. patcher une copie locale renommée hors `vendor/`, ou passer la lib en mode browser).
- **Audit #6 — 6 calques Konva (> 5 recommandés)** : fusionner `boundaryLayer` + `maskLayer` (tous deux
  `listening:false`) réduirait à 5, mais c'est un refactor du rendu avec risque visuel. → à planifier à part
  si une lenteur de rendu est réellement constatée ; pas un défaut fonctionnel.
- **Audit #4 (indicateur de progression d'import)** : T4 supprime l'essentiel de l'attente ; un spinner/`async`
  reste un plus ergonomique, à voir après mesure du gain réel de T4.

## Dépendances / ordre

```
T1  (export)        ─┐
T2  (bbox décor)    ─┤ indépendantes entre elles, toutes sur src/app.js → faire en série pour éviter
T3  (éditeur zones) ─┘ les conflits d'édition (T1, T2, T3 touchent app.js)
T4  (buildZones)     — indépendante (src/geometry.js), valider out_occluded.svg identique
T5  (favicon)        — indépendante (index.html)

Recommandé : T1 → T2 → T3 (même fichier), puis T4 et T5 en parallèle.
T2 dépend logiquement de T1 pour pouvoir vérifier « le décor apparaît à l'export ».
```

## Après le lot — mise à jour du contexte (obligatoire)

- [x] **PLAN** : T1-T5 passées à `[x]`, exécuté par / le renseignés. Pas de commit (repo sans git, voir
  `STATUS §Backlog`).
- [x] **STATUS.md** : défauts déplacés de « Ce qui casse » vers « Corrigé 2026-06-22 » ; note ⚠️
  `ML.buildZones` mise à jour (perf résolue, nouveau goulot identifié) ; ligne `RangeError` export retirée.
- [x] **Autres fichiers de contexte** : aucun changement nécessaire dans `PROJECT_MAP.md`/`SPEC.md` (le
  préfiltre bbox est un détail d'implémentation interne à `buildZones`, pas une décision d'architecture).
- [x] **Vérifié qu'aucun fichier de contexte n'est devenu faux.**
- [ ] Commits / push : repo toujours sans git (`STATUS §Backlog`) — aucun commit possible cette session.

## Vérification post-exécution (2026-06-22, Sonnet)

T1-T5 avaient été exécutées en série sans validation navigateur intermédiaire (uniquement
`node test/run.js`, qui ne couvre ni Konva/DOM ni le Transformer — donc ne pouvait rien dire sur T2/T3/T5,
et ne prouvait que la non-régression géométrique pour T1/T4). Revérifié intégralement avec un script
Playwright (Chromium déjà installé localement par l'audit original) reproduisant le scénario de l'audit :
import décor réel + perso + symbole, sélection, glisser-déposer réel, export, écoute console/réseau.

**Résultats :**

- **T1** ✅ confirmé — export décor+perso+symbole abouti : SVG de 9 777 996 octets, aucun `NaN`/`Infinity`,
  `viewBox` valide. (Premier essai de vérification faussement négatif : timeout de 15 s trop court — le
  calcul d'occlusion+écriture SVG sur ce décor prend réellement ~19 s, synchrone. Pas un bug.)
- **T2** ✅ confirmé — décor glissé par souris réelle, attrs du groupe après coup tous numériques
  (`x:585, y:481, rotation:0, scaleX:1, scaleY:1`), aucun `NaN`.
- **T3** ✅ confirmé — `#zone-list` n'a qu'1 enfant (message de garde) à la sélection du décor.
- **T4** ✅ confirmé pour son périmètre, avec nuance — `buildZones` isolé : **1,2 s** (vs ~35-40 s avant,
  ~30×). Mais l'import perçu en navigateur reste ~14-16 s car `motifSilhouette` (~8 s) et `motifFill`
  (~6,3 s) dominent désormais le temps total — ces deux fonctions étaient hors périmètre de T4. **Nouveau
  backlog ajouté à STATUS.md.**
- **T5** ✅ confirmé — zéro requête 404 sur toute la session de test.
- Cosmétique inchangé : `ReferenceError: module is not defined` (clipper.js) toujours présent, comme prévu
  (« Non traité » ci-dessus, par design).
