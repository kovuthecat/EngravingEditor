# PLAN_bibliotheque-base-motifs.md — Plan d'exécution   (rédigé par Opus)

> **Exécutants (Sonnet / Haiku / Codex)** : faites UNIQUEMENT votre tâche.
> Suivez les **Étapes dans l'ordre**. Lisez UNIQUEMENT les fichiers sous « Lire ».
> Ne créez AUCUN fichier ni dépendance hors « Modifier ». Le design est fixé par Opus —
> ne reconcevez pas. Doute ou blocage → **STOP**, signalez, rendez la main. N'improvisez pas.
> Format de référence : WORKFLOW.md §4.

- **Date :** 2026-06-30 · **Rédigé par :** Opus · **Branche :** — (main)
- **Plan parent / lié :** —

## Objectif global

Doter l'app d'une **bibliothèque de base** de motifs issue des dossiers `exemple motif/Personnages`
(→ rôle PERSONNAGE) et `exemple motif/Symboles` (→ rôle SYMBOLE). Ces motifs de base sont **inlinés dans
un bundle JS généré** (`src/builtin-motifs.js`), chargé en classic script, et affichés dans les grilles
de bibliothèque existantes à côté des motifs importés localement. L'ajout/suppression locale continue de
fonctionner ; supprimer un motif de base le **masque localement** (set persisté) sans toucher au dépôt.
Thibault contrôle les motifs de base **par simple commit + push** : un **hook pre-commit** régénère le
bundle automatiquement.

## Contexte / décision clé

**Décisions arrêtées avec Thibault (2026-06-30) — NE PAS reconcevoir :**

1. **Livraison = bundle JS inliné** (et non manifeste + `fetch`). Raison : l'app doit tourner en `file://`
   (double-clic), où `fetch` de fichiers locaux est bloqué. Le bundle `<script>` marche partout (file://,
   `http.server`, hébergement Netlify/Vercel/Pages). Coût accepté : ~4,6 Mo committés dans un fichier généré.
2. **Régénération = hook pre-commit auto** (`git config core.hooksPath tools/hooks`). Thibault édite les
   dossiers → commit → push, sans étape manuelle.

**Modèle de données (le contrat — à respecter à la lettre) :**

- Le bundle expose `window.ML_BUILTIN_MOTIFS = [{ id, name, role, svg }, …]`.
  - `id` = `"b:<Dossier>/<basename-sans-ext>"`, ex. `"b:Personnages/BB8"` (identifiant **stable**).
  - `role` = `PERSONNAGE` (dossier Personnages) ou `SYMBOLE` (dossier Symboles).
  - `svg` = contenu texte brut du fichier `.svg`.
- **`state.motifs`** continue de contenir les motifs de la bibliothèque, mais désormais : motifs locaux
  importés **+ built-ins matérialisés**. Un built-in matérialisé est un motif normal portant `builtin:true`
  et `id` = son id stable `b:…`. → **Toute la logique existante d'édition/placement/instances qui fait
  `state.motifs.find(...)` marche sans modification** (elle opère sur des motifs matérialisés).
- **`state.builtins`** = la liste brute `[{id,name,role,svg}]` du bundle (entrées légères non encore parsées).
- **`state.hiddenBuiltins`** = `Set` d'ids de built-ins masqués localement. **Persisté** dans le JSON projet.
- **Matérialisation paresseuse** : un built-in n'est parsé (`buildMotifFromSVG`) que quand sa vignette
  devient visible (IntersectionObserver) ou qu'on le pose. Évite de parser 132 motifs au démarrage.
- **Sérialisation** : `projectData()` n'inclut **jamais** les built-ins (`state.motifs.filter(m => !m.builtin)`),
  seulement les motifs locaux + `hiddenBuiltins`. Les built-ins se rechargent du bundle à chaque session.
- **Édition d'un built-in → promotion en local** : à la **première mutation** (stylet / rôle / couleur) d'un
  built-in, on passe `m.builtin = false`. Il est dès lors sérialisé comme motif local (id `b:…` conservé).
  Au rechargement, **un motif local prime sur le built-in de même id** (le built-in n'est pas réenregistré).
  → l'original du dépôt reste intact, l'édition persiste localement, **aucun remappage d'instance requis**.

**Pourquoi ce modèle :** il réutilise tout le pipeline existant (édition stylet D-006, éditeur de rôles,
occlusion, persistance IndexedDB) en n'ajoutant qu'une couche « source » au-dessus de `state.motifs` et deux
règles de filtrage à la (dé)sérialisation. Voir PROJECT_MAP §Feature 3 et DECISIONS §D-005/D-006.

## Tâches

### T1 — Générateur de bundle + intégration `<script>` · Modèle : Sonnet
- **Pourquoi ce modèle :** script Node neuf + échappement correct ; pas de géométrie, mais jugement sur les cas limites (noms accentués/espaces).
- **But :** créer le script qui scanne les deux dossiers et écrit `src/builtin-motifs.js`, puis l'exécuter et brancher le bundle dans `index.html`.
- **Lire :** ce PLAN (§Contexte, modèle de données) ; `test/run.js` (uniquement pour le style « script Node sans dépendance, `fs` natif ») ; `index.html` lignes 204-208 (ordre des `<script>`).
- **Imiter :** style « classic JS, pas d'ES modules » du repo ; `test/run.js` pour le `require('fs')` natif.
- **Modifier / créer :**
  - `tools/build-builtin-motifs.js` (créer)
  - `src/builtin-motifs.js` (généré par le script — **ne pas l'écrire à la main**, le produire en lançant le script)
  - `index.html` (ajouter une ligne `<script>`)
- **Hors périmètre :** ne PAS toucher `src/app.js`, `src/svg.js`, `src/geometry.js`, `vendor/`. Ne PAS parser/transformer les SVG (on inline le texte brut). Ne PAS inclure le dossier `Convertis` ni `countour et decor` ni `falcon-test`.
- **Étapes :**
  1. Créer `tools/build-builtin-motifs.js` (Node, `require('fs')`, `require('path')`, zéro dépendance) :
     - constantes : racine = dossier parent de `tools/` ; sources = `[{dir:"exemple motif/Personnages", role:"PERSONNAGE", prefix:"Personnages"}, {dir:"exemple motif/Symboles", role:"SYMBOLE", prefix:"Symboles"}]`.
     - pour chaque source : `fs.readdirSync`, filtrer `.svg` (insensible casse), trier alpha ; pour chaque fichier : `base = nom sans extension` ; entrée `{ id: "b:" + prefix + "/" + base, name: base, role, svg: fs.readFileSync(chemin,"utf8") }`.
     - sortie : écrire `src/builtin-motifs.js` =
       `"// Généré par tools/build-builtin-motifs.js — NE PAS ÉDITER À LA MAIN.\nwindow.ML_BUILTIN_MOTIFS = " + JSON.stringify(entries) + ";\n"`.
       (`JSON.stringify` gère l'échappement des SVG, espaces et accents dans les noms.)
     - logguer en fin : nombre d'entrées par rôle + taille du fichier écrit.
  2. Lancer `node tools/build-builtin-motifs.js` → vérifier que `src/builtin-motifs.js` est créé avec ~93 PERSONNAGE + ~39 SYMBOLE = ~132 entrées.
  3. Dans `index.html`, ajouter **avant** `<script src="src/app.js"></script>` (et après `src/geometry.js`) : `<script src="src/builtin-motifs.js"></script>`.
- **Validation :**
  - auto : `node tools/build-builtin-motifs.js` → log « 93 PERSONNAGE, 39 SYMBOLE » (ou comptes réels des dossiers), pas d'exception.
  - auto : `node -e "global.window={};require('./src/builtin-motifs.js');console.log(window.ML_BUILTIN_MOTIFS.length, window.ML_BUILTIN_MOTIFS[0].id)"` → affiche un nombre > 100 et un id `b:Personnages/…`.
  - auto : `node test/run.js` → toujours vert (rien de géométrique touché).
  - visuel : —
- **Si bloqué :** si un dossier source est absent ou vide, **STOP**, signaler (ne pas inventer de chemin). Si `JSON.stringify` produit un fichier > 10 Mo, **STOP** et signaler (taille anormale = mauvais dossier scanné).
- **Commit :** `feat(motifs): générateur de bundle built-in + inline des dossiers Personnages/Symboles`
- **Statut :** [x] fait   ·   exécuté par : Sonnet   ·   le : 2026-06-30   ·   commit : d4d4c01

### T2 — Intégration du catalogue dans l'app (registre, vignettes paresseuses, masquage, persistance) · Modèle : Sonnet
- **Pourquoi ce modèle :** tâche centrale, jugement sur l'état/persistance et l'intégration UI ; aucune géométrie nouvelle (réutilise `buildMotifFromSVG`/`addInstance`/`drawThumb`).
- **But :** afficher les built-ins dans les grilles de bibliothèque, paresseusement ; gérer leur masquage local persistant ; exclure les built-ins de la sérialisation ; bouton « Restaurer la bibliothèque de base ».
- **Lire :** ce PLAN (§Contexte, modèle de données) ; `src/app.js` lignes 195-269 (`buildMotifFromSVG`, `addMotifToLibrary`, `deleteMotifFromLibrary`, `updateLibCounts`), 481+ (`addInstance` — en-tête seulement), 1555-1620 (`projectData`/`loadProject`), 1695-1715 (`restoreLocalProject`), 1822-1829 (fin câblage/init) ; `index.html` la section bibliothèque (grilles `library-perso`/`library-symbole`, compteurs `count-perso`/`count-symbole`, boutons d'import) ; `src/style.css` la classe `.lib-item`.
- **Imiter :** `addMotifToLibrary` (création d'un `.lib-item` : canvas vignette + label + bouton `×`).
- **Modifier :** `src/app.js`, `index.html`, `src/style.css`.
- **Hors périmètre :** ne PAS modifier `buildMotifFromSVG`, `addInstance`, `drawThumb`, `exportFill`, ni quoi que ce soit de géométrique. Ne PAS toucher l'édition stylet ici (c'est T3). Ne PAS sérialiser les built-ins.
- **Étapes :**
  1. **État** : initialiser `state.builtins = (window.ML_BUILTIN_MOTIFS || [])` et `state.hiddenBuiltins = new Set()`. (Si l'objet `state` est figé/typé ailleurs, ajouter ces champs là où `state` est déclaré.)
  2. **Helper `materializeBuiltin(entry)`** : si un motif d'id `entry.id` existe déjà dans `state.motifs`, le renvoyer ; sinon `const motif = buildMotifFromSVG(entry.name, ML.parseSVG(entry.svg), entry.role); motif.id = entry.id; motif.builtin = true; state.motifs.push(motif);` puis renvoyer `motif`. **Ne pas** appeler `markProjectChanged()` (matérialiser ne salit pas le projet).
  3. **Helper `renderBuiltinItem(entry)`** : créer un `.lib-item` (même structure que `addMotifToLibrary` : canvas 64×64, label = `entry.name`, bouton `×`) **sans** matérialiser tout de suite. Le canvas reste vide jusqu'à ce qu'un IntersectionObserver le rende visible → alors `const m = materializeBuiltin(entry); drawThumb(cv, m); motifThumbs[m.id] = cv;` (une seule fois, puis `unobserve`). Clic sur l'item : `addInstance(materializeBuiltin(entry))`. Bouton `×` : `hideBuiltin(entry.id)`. Router vers `library-perso` / `library-symbole` selon `entry.role`. Appeler `updateLibCounts()`.
  4. **Helper `registerBuiltins()`** : vider toute trace de built-ins déjà rendus si besoin, puis pour chaque `entry` de `state.builtins` **dont l'id n'est ni dans `state.hiddenBuiltins` ni déjà un motif local** (un motif de `state.motifs` sans `builtin` portant cet id — cas d'un built-in promu, cf. T3) : `renderBuiltinItem(entry)`. Utiliser un seul IntersectionObserver partagé (root = la sidebar/grille).
  5. **`hideBuiltin(id)`** : `state.hiddenBuiltins.add(id)` ; si le built-in est matérialisé et/ou posé, réutiliser la cascade de `deleteMotifFromLibrary(id)` (suppression des instances avec confirmation) ; retirer son `.lib-item` du DOM ; `markProjectChanged()` ; `updateLibCounts()`.
  6. **`restoreBuiltins()`** (bouton) : `state.hiddenBuiltins.clear()` ; re-rendre les built-ins manquants (`registerBuiltins()` après avoir purgé les items built-in du DOM pour éviter les doublons) ; `markProjectChanged()`.
  7. **`deleteMotifFromLibrary`** : au début, si le motif ciblé porte `builtin` **ou** si son id est un id de `state.builtins`, déléguer à `hideBuiltin(id)` plutôt que de le supprimer définitivement (sinon il reviendrait au reload, ce qui est correct, mais on veut le masquer **persistant**).
  8. **`projectData()`** : remplacer `motifs: state.motifs` par `motifs: state.motifs.filter((m) => !m.builtin)` et ajouter `hiddenBuiltins: [...state.hiddenBuiltins]`.
  9. **`loadProject(data)`** : après la reconstruction des motifs locaux (boucle existante sur `data.motifs`) et avant/après `updateLibCounts()` : `state.hiddenBuiltins = new Set(data.hiddenBuiltins || [])` ; purger du DOM les items built-in éventuels ; appeler `registerBuiltins()`. Puis, dans la boucle de résolution des instances (ligne ~1615-1618), si `it.motifId` commence par `"b:"` et n'est pas trouvé dans `state.motifs`, le matérialiser via l'entrée correspondante de `state.builtins` avant `addInstance`.
  10. **Démarrage** : dans `restoreLocalProject`, brancher `registerBuiltins()` aussi dans la branche « aucun projet sauvegardé » (sinon le catalogue n'apparaît qu'après un loadProject). S'assurer que `registerBuiltins()` est appelé exactement une fois au démarrage (soit via loadProject, soit via la branche « nouveau projet »).
  11. **UI** : dans `index.html`, ajouter un bouton « Restaurer la bibliothèque de base » (id `btn-restore-builtins`) près des compteurs/sections de bibliothèque ; le câbler à `restoreBuiltins()`. Un style discret dans `style.css` si nécessaire. Optionnel : un libellé visuel distinguant un item built-in d'un item local (ex. classe `.builtin` + petite pastille) — léger, non bloquant.
- **Validation :**
  - auto : `node test/run.js` → vert.
  - auto : `node -e "..."` n'est pas pertinent (DOM) ; se limiter à `node test/run.js`.
  - visuel (Thibault, à consigner dans STATUS) : au lancement, les grilles Personnages/Symboles listent les motifs des dossiers ; faire défiler → les vignettes se dessinent ; cliquer un built-in → instance posée ; `×` sur un built-in → masqué, et **toujours masqué après rechargement de la page** ; « Restaurer la bibliothèque de base » → tout revient ; importer un SVG local → s'ajoute et persiste comme avant.
- **Si bloqué :** si `state` n'est pas extensible (objet figé) ou si `addInstance`/`buildMotifFromSVG` ont une signature différente de celle décrite, **STOP** et signaler — ne pas réécrire ces fonctions. Si l'IntersectionObserver est indisponible en `file://` sur le navigateur cible, fallback acceptable : matérialiser au clic seulement et dessiner la vignette à la première ouverture de la section `<details>`.
- **Commit :** `feat(motifs): bibliothèque de base lazy depuis le bundle + masquage local persistant`
- **Statut :** [x] fait (codé) · **jamais commité ni pushé avant le 2026-06-30** — le code est resté en working tree
  seul, le site déployé n'avait donc ni `state.builtins` ni `registerBuiltins`/`restoreBuiltins` : le catalogue
  ne s'affichait jamais en prod malgré le bouton « Restaurer » présent dans `index.html`. Rattrapé et committé
  (avec T3) dans `8d52090` le 2026-06-30, en même temps qu'une curation manuelle des dossiers source — commit
  non atomique par tâche, dérogation à la règle habituelle pour corriger l'oubli au plus vite.
  · exécuté par : Sonnet · le : 2026-06-30 · commit : 8d52090

### T3 — Édition d'un built-in → promotion en motif local · Modèle : Sonnet
- **Pourquoi ce modèle :** jugement sur les points de mutation ; touche l'édition (stylet/rôle/couleur) — vérification sérialisation requise.
- **But :** rendre persistante l'édition locale d'un motif de base sans modifier le dépôt : à la première mutation d'un built-in, le « promouvoir » (passer `builtin:false`) pour qu'il soit sérialisé, l'original du bundle restant intact.
- **Lire :** ce PLAN (§Contexte, règle « édition → promotion ») ; `src/app.js` les fonctions qui mutent un motif puis appellent `markProjectChanged()` : commit du stylet (autour de `exitEdit`/apply de `motif.surface`, ~927-952), sauvegarde de l'éditeur de rôles de zones, et les handlers inspecteur rôle/couleur (`insp-role`, `insp-color`). Lire aussi `loadProject` modifié par T2 (règle « local prime sur built-in »).
- **Modifier :** `src/app.js`.
- **Hors périmètre :** ne PAS remapper d'instances (inutile : l'id stable est conservé). Ne PAS toucher la géométrie. Ne PAS dupliquer le motif (on flippe un flag, on ne clone pas).
- **Étapes :**
  1. Ajouter un helper `promoteIfBuiltin(motif)` : `if (motif && motif.builtin) { motif.builtin = false; }`. (Effet : il sera désormais inclus par `projectData().motifs`, et `registerBuiltins()` le sautera car son id existe comme motif local.)
  2. Appeler `promoteIfBuiltin(motif)` à chaque point de **mutation persistée** d'un motif :
     - au commit d'un trait stylet (là où `motif.surface` est écrit / `editDrafts` est posé) ;
     - à la sauvegarde de l'éditeur de rôles de zones (là où `motif.zones`/rôles changent) ;
     - dans les handlers inspecteur qui changent `motif.role`, `motif.color`, `motif.margin`.
     (Repérer ces points par la présence de `markProjectChanged()` à proximité d'une écriture sur un objet motif ; ajouter l'appel **juste avant** la mutation ou juste avant `markProjectChanged()`.)
  3. Vérifier que `registerBuiltins()` (T2 étape 4) saute bien tout id présent comme motif **local** dans `state.motifs` — un built-in promu ne doit PAS être re-rendu en double au prochain `loadProject`.
- **Validation :**
  - auto : `node test/run.js` → vert.
  - visuel (Thibault, STATUS) : éditer au stylet un motif de base → recharger la page → l'édition est conservée ; le fichier SVG du dépôt est inchangé (`git status` propre côté `exemple motif/`).
- **Si bloqué :** si les points de mutation ne sont pas identifiables sans ambiguïté, **STOP** et signaler les lignes candidates — ne pas saupoudrer `promoteIfBuiltin` partout. Fallback acceptable si la promotion s'avère risquée : désactiver l'entrée en édition (`enterEdit`) pour un motif `builtin` avec un message « Dupliquez ce motif de base pour l'éditer » — signaler ce choix.
- **Commit :** `feat(motifs): promotion locale d'un motif de base à la première édition`
- **Statut :** [x] fait (codé) · même oubli que T2 (jamais commité avant ce jour), rattrapé dans le même commit
  `8d52090` · exécuté par : Sonnet · le : 2026-06-30 · commit : 8d52090

### T4 — Hook pre-commit de régénération + installation + docs · Modèle : Haiku
- **Pourquoi ce modèle :** mécanique (scripts shell + doc), pas de logique applicative.
- **But :** régénérer `src/builtin-motifs.js` automatiquement à chaque commit et documenter le workflow « éditer dossiers → commit → push ».
- **Lire :** ce PLAN (§Contexte décision 2) ; `tools/build-builtin-motifs.js` (créé en T1, pour le nom exact) ; `README.md` (section hébergement/usage), `WORKFLOW.md` (où documenter), `CLAUDE.md` §Commandes.
- **Modifier / créer :**
  - `tools/hooks/pre-commit` (créer)
  - `tools/install-hook.sh` et `tools/install-hook.bat` (créer)
  - `README.md`, `WORKFLOW.md`, `CLAUDE.md` (ajouter la procédure)
- **Hors périmètre :** ne PAS modifier `src/app.js` ni la logique. Ne PAS committer de config locale `.git/`.
- **Étapes :**
  1. `tools/hooks/pre-commit` (sh, `#!/bin/sh`) :
     ```sh
     #!/bin/sh
     node tools/build-builtin-motifs.js || { echo "build-builtin-motifs a échoué"; exit 1; }
     git add src/builtin-motifs.js
     ```
  2. `tools/install-hook.sh` : `git config core.hooksPath tools/hooks` (+ `chmod +x tools/hooks/pre-commit`).
     `tools/install-hook.bat` : `git config core.hooksPath tools/hooks`.
  3. Documenter dans `README.md` + `WORKFLOW.md` : « Pour ajouter/retirer un motif de base : déposer/supprimer le `.svg` dans `exemple motif/Personnages` ou `exemple motif/Symboles`, puis `git commit` (le hook régénère `src/builtin-motifs.js`) et `git push`. Installer le hook une fois : `sh tools/install-hook.sh` (ou `tools\install-hook.bat`). »
  4. Ajouter dans `CLAUDE.md` §Commandes une ligne `node tools/build-builtin-motifs.js  # régénère le bundle de motifs de base`.
- **Validation :**
  - auto : `sh tools/install-hook.sh` → `git config --get core.hooksPath` retourne `tools/hooks`.
  - auto : déposer/retirer un `.svg` factice dans un des dossiers, `git add` autre chose, `git commit` → le hook régénère `src/builtin-motifs.js` et l'inclut au commit ; retirer le `.svg` factice ensuite.
  - visuel : —
- **Si bloqué :** si `core.hooksPath` n'est pas supporté par la version git locale, **STOP** et signaler (fallback : copier le hook dans `.git/hooks/pre-commit`). Ne pas committer dans `.git/`.
- **Commit :** `chore(motifs): hook pre-commit régénérant le bundle + doc workflow`
- **Statut :** [x] fait   ·   exécuté par : Sonnet   ·   le : 2026-06-30   ·   commit : 110b2b2

### T5 — Mise à jour du contexte · Modèle : Sonnet
- **But :** consigner la fonctionnalité et la décision d'architecture.
- **Lire :** ce PLAN entier ; `STATUS.md`, `DECISIONS.md` (dernière décision D-007 pour numéroter D-008), `PROJECT_MAP.md` §Feature 3, `SPEC.md`.
- **Modifier :** `STATUS.md` (obligatoire) ; `DECISIONS.md` (nouvelle **D-008 — bibliothèque de base inlinée + hook**) ; `PROJECT_MAP.md` §Feature 3 (mentionner `builtin-motifs.js`, `state.builtins`/`hiddenBuiltins`, matérialisation paresseuse) ; `SPEC.md` si un détail technique mérite d'y figurer ; `README.md` déjà couvert en T4.
- **Hors périmètre :** ne rien écrire de faux ; ne pas dupliquer le détail technique entre fichiers.
- **Étapes :** passer T1-T4 à `[x]` ; refléter dans STATUS l'état réel (ce qui marche, validation visuelle restant à faire par Thibault) ; rédiger D-008 (problème, options bundle vs manifeste, décision, conséquences) ; mettre à jour PROJECT_MAP §Feature 3 et l'arborescence (`tools/`, `src/builtin-motifs.js`).
- **Validation :** auto : `node test/run.js` → vert. visuel : —
- **Si bloqué :** —
- **Commit :** `docs(motifs): STATUS + D-008 + PROJECT_MAP pour la bibliothèque de base`
- **Statut :** [x] fait   ·   exécuté par : Sonnet   ·   le : 2026-06-30   ·   commit : afe8467

## Dépendances / ordre

```
T1 (bundle) → T2 (intégration app) → T3 (promotion édition)
T1 → T4 (hook : a besoin du nom du script)
T2, T3, T4 → T5 (contexte)
```
T2 dépend de T1 (a besoin de `window.ML_BUILTIN_MOTIFS`). T3 dépend de T2 (règle « local prime sur built-in »
posée en T2). T4 ne dépend que de T1. T5 en dernier.

## Risques

- **Taille du bundle (~4,6 Mo)** : accepté (décision 1). Diffs git lourds sur `src/builtin-motifs.js` —
  attendu, c'est un artefact généré.
- **Perf démarrage** : mitigée par la matérialisation paresseuse (IntersectionObserver). Si 132 vignettes
  visibles d'un coup posaient problème, replier les sections `<details>` par défaut (déjà le cas).
- **Collision d'ids** built-in vs local : évitée par le préfixe `b:` et la règle « local prime sur built-in »
  (T2 étape 4 + T3).
- **`file://` + IntersectionObserver** : fallback prévu (T2 « Si bloqué »).

## Après le lot — mise à jour du contexte (obligatoire)

- [ ] **PLAN** : passer chaque tâche faite à `[x]`, renseigner exécuté par / le / commit.
- [ ] **STATUS.md** : état réel (marche / à valider visuellement / backlog).
- [ ] **Autres fichiers de contexte, SEULEMENT si changé** : DECISIONS.md (D-008), PROJECT_MAP.md, SPEC.md, README.md, WORKFLOW.md, CLAUDE.md.
- [ ] **Vérifier qu'aucun fichier de contexte n'est devenu faux.**
- [ ] Commits atomiques par tâche (messages ci-dessus) ; push en fin de session.
