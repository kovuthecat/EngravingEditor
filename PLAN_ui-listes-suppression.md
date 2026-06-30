# PLAN_ui-listes-suppression.md — Plan d'exécution (rédigé par Opus)

> Exécutants (Sonnet / Haiku / Codex) : faites UNIQUEMENT votre tâche.
> Suivez les Étapes dans l'ordre. Lisez UNIQUEMENT les fichiers sous « Lire ».
> Ne créez AUCUN fichier ni dépendance hors « Modifier ». Le design est fixé par Opus.
> Doute ou blocage → STOP, signalez, rendez la main. N'improvisez pas.

- Date : 2026-06-30 · Rédigé par : Opus · Branche : t2-isolated
- Plan parent / lié : —

## Objectif global

Deux améliorations UI de la bibliothèque de motifs :
1. Ranger les **personnages** et les **symboles** importés dans deux listes **repliables** distinctes (plus la grille mixte actuelle).
2. Permettre de **supprimer** un motif importé directement depuis la liste.

## Contexte / décision clé

- Aujourd'hui `addMotifToLibrary` (`src/app.js` ~L195) empile **tous** les motifs dans un unique
  `<div id="library">` (`index.html` L31), quel que soit `motif.role`. Chaque motif porte déjà
  `role ∈ {PERSONNAGE, SYMBOLE, DECOR}` → le tri par liste se fait sur ce champ, rien à calculer.
- **Décision A (décor)** : le décor (`role==="DECOR"`) passe aussi par `addMotifToLibrary` (import décor,
  `app.js` L1559). On lui donne sa **propre** grille sous la section « Décor » pour ne pas le perdre.
- **Décision B (cascade)** : supprimer un motif dont des exemplaires sont posés sur le plan laisserait des
  instances Konva orphelines (leur `motifId` ne se résoudrait plus → `exportSVG`/`instancesBottomToTop`
  plantent sur `state.motifs.find(...) === undefined`). Donc suppression motif = suppression de **toutes**
  ses instances ; `confirm()` listant le nombre d'exemplaires avant de procéder.
- **Undo** : `recordHistory()` prend un snapshot complet (`projectData()`) restauré via `loadProject`,
  qui reconstruit la bibliothèque depuis `state.motifs`. Donc un simple `recordHistory()` avant mutation
  suffit à rendre la suppression annulable (Ctrl+Z). Ne pas réinventer d'undo local.
- Pas d'ES modules, classic script, doit tourner en `file://`. Réutiliser le style existant
  (`details.advanced`, `.lib-item`) plutôt qu'inventer un nouveau look.

## Tâches

### T1 — Deux listes repliables (personnages / symboles) + grille décor · Modèle : Sonnet
- **But :** remplacer la grille unique `#library` par trois grilles (personnages, symboles, décor),
  les deux premières dans des `<details>` repliables avec compteur, et router chaque motif vers sa
  grille selon `motif.role`.
- **Lire :**
  - `index.html` L21-49 (sections « Motifs » et « Décor »)
  - `src/app.js` L194-209 (`addMotifToLibrary`), L1370-1388 (`loadProject`, nettoyage `#library`)
  - `src/style.css` L33-40 (`details.advanced` summary) et L79-83 (`#library`, `.lib-item`)
- **Imiter :** le style `#sidebar details.advanced summary` (chevron ▸/▾) pour les `<summary>` repliables.
- **Modifier :** `index.html`, `src/app.js`, `src/style.css` — RIEN d'autre.
- **Hors périmètre :** ne pas toucher la géométrie (svg.js/geometry.js, zones, occlusion, export), ne pas
  toucher les imports décor/contour eux-mêmes, ne pas modifier `buildMotifFromSVG`. Pas de suppression
  (c'est T2).
- **Étapes :**
  1. `index.html` section « Motifs » : supprimer `<div id="library"></div>`. À la place, après les deux
     boutons d'import, ajouter deux blocs repliables (ouverts par défaut) :
     ```html
     <details class="lib-group" open>
       <summary>Personnages <span class="lib-count" id="count-perso">0</span></summary>
       <div id="library-perso" class="library-grid"></div>
     </details>
     <details class="lib-group" open>
       <summary>Symboles <span class="lib-count" id="count-symbole">0</span></summary>
       <div id="library-symbole" class="library-grid"></div>
     </details>
     ```
  2. `index.html` section « Décor » : après le bouton d'import décor, ajouter
     `<div id="library-decor" class="library-grid"></div>`.
  3. `src/app.js` `addMotifToLibrary` : remplacer
     `document.getElementById("library").appendChild(item);` par un routage :
     ```js
     const gridId = motif.role === "SYMBOLE" ? "library-symbole"
                  : motif.role === "DECOR"   ? "library-decor"
                  :                            "library-perso";
     document.getElementById(gridId).appendChild(item);
     updateLibCounts();
     ```
  4. `src/app.js` : ajouter une petite fonction `updateLibCounts()` (près de `addMotifToLibrary`) qui met
     à jour les deux badges :
     ```js
     function updateLibCounts() {
       document.getElementById("count-perso").textContent =
         document.getElementById("library-perso").childElementCount;
       document.getElementById("count-symbole").textContent =
         document.getElementById("library-symbole").childElementCount;
     }
     ```
  5. `src/app.js` `loadProject` : remplacer `document.getElementById("library").innerHTML = "";` par le
     vidage des trois grilles :
     ```js
     ["library-perso", "library-symbole", "library-decor"].forEach(
       (id) => { document.getElementById(id).innerHTML = ""; });
     ```
     et appeler `updateLibCounts();` juste après la boucle `for (const m of data.motifs)` (après les
     `addMotifToLibrary(m)`).
  6. `src/style.css` : renommer la règle `#library { … }` en `.library-grid { … }` (mêmes propriétés).
     Ajouter :
     ```css
     #sidebar details.lib-group { margin: 8px 0; }
     #sidebar details.lib-group summary { list-style: none; cursor: pointer; font-size: 12px;
       color: #b6bdca; padding: 4px 0; display: flex; align-items: center; gap: 6px; }
     #sidebar details.lib-group summary::-webkit-details-marker { display: none; }
     #sidebar details.lib-group summary::before { content: "▸"; width: 14px; color: #6b7280; }
     #sidebar details.lib-group[open] summary::before { content: "▾"; }
     .lib-count { font-size: 10px; color: #6b7280; }
     ```
- **Validation :** auto `node test/run.js` → tout passe (aucune logique géométrique touchée) ·
  visuel (Thibault) : importer 2 personnages + 2 symboles → ils apparaissent dans la bonne liste, le
  compteur du summary est correct, chaque `<details>` se replie/déplie au clic, importer un décor
  l'affiche sous « Décor ».
- **Si bloqué :** si un id (`library-perso`/`library-symbole`/`library-decor`) n'existe pas au moment
  d'appeler `getElementById` (ordre de chargement), STOP et signaler — ne pas créer les divs en JS.
- **Commit :** `feat(ui): listes repliables personnages/symboles + grille decor`
- **Statut :** [x] fait · exécuté par : Sonnet · le : 2026-06-30 · commit : cf03a2c

### T2 — Bouton de suppression d'un motif depuis la bibliothèque (cascade) · Modèle : Sonnet
- **Pourquoi ce modèle :** jugement requis (état Konva, édition active, sélection, undo, instances liées).
- **But :** ajouter à chaque `.lib-item` un bouton « × » qui supprime le motif de la bibliothèque, ses
  exemplaires posés sur le plan, et l'entrée DOM — de façon annulable (Ctrl+Z).
- **Lire :**
  - `src/app.js` L194-209 (`addMotifToLibrary` après T1), L345-353 (sélection des Groups par `motifId`),
    L661-689 (objet `edit`, `editDrafts`), L764-775 (`exitEdit`), L1197-1204 (`deleteSel`, patron de
    suppression d'instance), L1410+ (`projectSnapshot`/undo — pour confirmer que `recordHistory` suffit)
  - `src/style.css` L80-83 (`.lib-item`)
- **Imiter :** `deleteSel` (`app.js` L1197) pour le couple `recordHistory()` + `destroy()` + `batchDraw()`
  + `markProjectChanged()`.
- **Modifier :** `src/app.js`, `src/style.css` — RIEN d'autre. (Dépend de T1 : grilles + `updateLibCounts`.)
- **Hors périmètre :** ne pas toucher la géométrie/export, ne pas modifier `deleteSel` (suppression
  d'instance sélectionnée), ne pas ajouter de confirmation ailleurs, pas de réorganisation du DOM au-delà
  du bouton.
- **Étapes :**
  1. Dans `addMotifToLibrary`, après avoir construit `label`, créer le bouton et l'ajouter à `item` :
     ```js
     const del = document.createElement("button");
     del.className = "lib-del"; del.type = "button"; del.textContent = "×";
     del.title = "Supprimer ce motif de la bibliothèque";
     del.onclick = (e) => { e.stopPropagation(); if (deleteMotifFromLibrary(motif.id)) item.remove(); };
     item.append(cv, label, del);
     ```
     (remplacer l'actuel `item.append(cv, label);`). Le `stopPropagation` empêche le `item.onclick`
     d'ajouter une instance au moment du clic sur « × ».
  2. Ajouter la fonction `deleteMotifFromLibrary(motifId)` (près de `addMotifToLibrary`). Elle renvoie
     `true` si la suppression a eu lieu, `false` si annulée :
     ```js
     function deleteMotifFromLibrary(motifId) {
       const motif = state.motifs.find((m) => m.id === motifId);
       if (!motif) return false;
       const insts = mainLayer.getChildren(
         (n) => n.getClassName() === "Group" && n.getAttr("motifId") === motifId);
       if (insts.length && !confirm(
           `« ${motif.name} » a ${insts.length} exemplaire(s) sur le plan. Supprimer le motif et ses exemplaires ?`))
         return false;
       recordHistory();
       if (edit.active && edit.motifId === motifId) exitEdit();
       const sel = selected();
       if (sel && sel.getAttr("motifId") === motifId) select(null);
       insts.forEach((n) => n.destroy());
       mainLayer.batchDraw();
       editDrafts.delete(motifId); refreshDraftCounter();
       delete motifThumbs[motifId];
       state.motifs = state.motifs.filter((m) => m.id !== motifId);
       markProjectChanged();
       updateLibCounts();
       return true;
     }
     ```
     Vérifier le nom exact de la fonction de comptage des brouillons (`refreshDraftCounter`) à L1377 ;
     si différent, utiliser le nom réel.
  3. `src/style.css` : adapter `.lib-item` pour positionner le « × » en coin, et styler `.lib-del` :
     ```css
     .lib-item { position: relative; }
     .lib-del { position: absolute; top: 1px; right: 1px; width: 16px; height: 16px; padding: 0;
       line-height: 14px; font-size: 12px; border: none; border-radius: 4px; cursor: pointer;
       background: rgba(15,18,24,0.7); color: #b6bdca; opacity: 0; }
     .lib-item:hover .lib-del { opacity: 1; }
     .lib-del:hover { background: #ef4444; color: #fff; }
     ```
- **Validation :** auto `node test/run.js` → tout passe · visuel (Thibault) : (a) « × » apparaît au survol
  d'une vignette ; (b) supprimer un motif sans exemplaire → il disparaît de la liste, compteur décrémenté,
  pas d'instance affectée ; (c) supprimer un motif posé N fois → `confirm`, puis les N exemplaires
  disparaissent du plan ; (d) Ctrl+Z restaure motif + exemplaires ; (e) Exporter SVG après suppression
  ne lève pas d'erreur console.
- **Si bloqué :** si `selected()`, `exitEdit`, `editDrafts` ou `refreshDraftCounter` n'ont pas exactement
  ces noms/signatures dans `app.js`, STOP et signaler — ne pas inventer de variante.
- **Commit :** `feat(ui): suppression d'un motif depuis la bibliotheque (cascade instances)`
- **Statut :** [ ] à faire · exécuté par : — · le : — · commit : —

## Dépendances / ordre

T1 → T2 (T2 réutilise les grilles et `updateLibCounts` introduits par T1). Commits séparés.

## Après le lot — mise à jour du contexte (obligatoire)

- PLAN : tâches faites → [x], renseigner exécuté par / le / commit.
- `STATUS.md` : noter la feature « bibliothèque : listes repliables perso/symbole + suppression motif ».
- `PROJECT_MAP.md` Feature 3 : seulement si la description de la bibliothèque devient fausse (mention de
  `#library` unique) — la mettre à jour le cas échéant.
- Pas de décision d'architecture nouvelle → ne pas toucher `DECISIONS.md` (sauf si Thibault le demande).
- Commits atomiques par tâche ; push en fin de session.
