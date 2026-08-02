# STATUS.md

État à l'instant T : ce qui marche, ce qui casse. Historique détaillé des correctifs : `git log`.

> **Frontières** — STATUS : état actuel · `TASKS.md` : backlog + tâches · `plans/` : plan d'une tâche active · `VALIDATION.md` : checklist visuelle.
>
> **Dernière mise à jour :** 2026-08-02 (audit d'intégration du Générateur)

## Audit d'intégration du mode Générateur (2026-08-02)

Le mode Générateur (commits `97314b7`/`f907926`) **ne fonctionnait sur aucun chemin** : bugs trouvés
en pilotant l'app dans le navigateur in-app, tous reproduits puis corrigés.

1. **`host.editLayer.batchDraw` n'existe pas.** `editLayer` est un `Konva.Group` (app.js l.1043), pas
   un Layer. Les 7 appels de `generator-ui.js` jetaient une `TypeError` — dès `onEnterEdit`, donc à
   chaque entrée en édition. La fuite touchait aussi le mode **Dessin** : `cancelActiveStroke()`
   (2ᵉ doigt / `pointercancel`) appelle `GeneratorUI.cancelGesture()` → même throw. Fix : pont
   `EditHost.redrawOverlay()` → `uiLayer.batchDraw()`.
2. **Décor vierge posé en (NaN, NaN).** Le `Konva.Transformer` attaché par `select()` à un groupe de
   boîte 0×0 **réécrit x/y en NaN** sur le nœud (`Transformer.update`) ; `fitScale` sur une silhouette
   vide en produisait aussi. `localPoint()` ne rendait alors que des NaN : on pouvait tracer sans fin,
   rien n'apparaissait, sans une seule erreur. Fix en trois points : pas de Transformer sur une boîte
   vide (`selectedEmpty`), garde dans `fitScale`, filet dans `makeGroup` (couvre aussi le rechargement
   d'un projet déjà enregistré avec un exemplaire corrompu — cas réel en base locale).
3. **Le cadre de découpe était la mauvaise surface.** `st.zone` valait la silhouette de l'encre déjà
   posée (`edit.realFill`) : vide sur un décor neuf (plus rien ne bornait la pousse), et réduite au
   TRAIT lui-même sur un décor importé (tout ce qui ne recouvrait pas un trait existant était coupé —
   mesuré). Le cadre est désormais le **corps de la guitare moins les défonces**
   (`EditHost.getZoneLocal()`, `state.boundary`/`state.holes` ramenés en px locaux du motif), mémoïsé
   pour la session. Vérifié : zone = 440 × 325 mm, 6 contours (corps + 5 cavités) ; une branche tracée
   au-delà du bord est coupée net au contour.
4. **Un geste = deux Annuler.** Une fusion qui retire ET rajoute de la matière (glissé de poignée,
   semis) poussait deux entrées d'historique ; un Annuler laissait un état intermédiaire jamais vu.
   `rebuildDraftFrom` accepte maintenant une entrée `{kind:"op", ops:[…]}` rejouée en bloc.
5. Robustesse : `window.GeneratorUI` n'est publié qu'après un `init()` réussi (sinon l'édition entière
   tombait) ; `setEditMode("generate")` refuse et le dit si le générateur ne s'est pas branché ;
   `safeCache` ne tente plus de cacher un nœud vide (Konva écrivait une erreur à chaque appel).

**Ergonomie iPad du Générateur.** Poignées, bornes libres, tracé d'aperçu et pastille d'accroche
étaient dessinés à taille fixe en px LOCAUX : au zoom d'ensemble (×0,38) une poignée faisait 2,5 px
à l'écran. Compensées par `ecran()` (même principe que les ancres du Transformer, T-127) → 22 px de
diamètre constant, et tolérances de saisie élargies au dézoom (`tolBE`, jamais plus serrées qu'avant).
Puces de la galerie passées à 44 px (`--tap`) ; plus de `.focus()` à l'ouverture de la galerie (il
faisait monter le clavier iOS par-dessus un choix visuel) ; safe-area sur la galerie ; bandeau de mode
masqué pendant la galerie (il passait par-dessus, z-index 60 > 45) ; bascule Dessin/Générateur
compactée (726 × 66 px → 253 × 58, alignée à gauche) ; `zoomToFitEdit` cadre le contour de la table
quand le motif édité est vide.

`node test/run.js`, `test/app-check.js`, `test/branch-proto-check.js` verts. Reste à juger à l'œil :
`VALIDATION.md`. Reste à traiter : cf. `TASKS.md` (T-150…T-153).

## Phase actuelle

**Plan P10 lancé (2026-07-07)** : migration vers la nouvelle UI maquettée avec Claude Design
(refonte visuelle/spatiale seule, aucun changement de fonction, D-013). 8 sessions / 8 tâches
(T-142…T-149) : `plans/P10/index.md`. S1 (T-142, socle) codée : tokens CSS `:root` (couleurs oklch,
rayons, `--shadow-*`) repris de la maquette + IBM Plex Sans/Mono vendorées hors-ligne
(`vendor/fonts/`, aucune requête réseau). IBM Plex Sans servie par Google comme un seul fichier
variable (`wght` 400-700) — un seul `.woff2` couvre les 4 poids déclarés ; Mono a 3 fichiers statiques
distincts (400/500/600). Slider fusionné avec la règle P9·S1 (piste/pouce restylés, hit-area 44px
conservée). `body` racine bascule sur les tokens ; le reste de l'UI garde son habillage sombre actuel
jusqu'à S2-S7. `node test/run.js` vert (CSS/polices pur). Validation visuelle humaine restante
(`VALIDATION.md`, P10 · S1).

S2 (T-143, barre supérieure) codée : `<header>` remplacé par `.topbar` (60px, titre + Annuler/Rétablir
48×48 + badge session décoratif + bouton Exporter) et `#pending-banner` pleine largeur sous la barre
(visible si essais en attente, boutons Jeter/Appliquer). Historique **projet** étendu d'un Rétablir
réel : `redoStack` en miroir de `undoStack`, vidée à chaque nouvelle action, Ctrl+Maj+Z ajouté à côté de
Ctrl+Z (D-013 pt 4 — pas de nouvelle logique d'état, extension mineure de `recordHistory`/`undo`
existants). `discardAllDrafts()` ajoutée pour la bannière (branchée sur `discardMotifDraft` par motif,
même source `editDrafts` que `#draft-summary`, pas d'état dupliqué). Retirés du header :
`#btn-sidebar-toggle` (rail S3 gère la nav — sidebar dépliée par défaut en attendant), `.hint`,
`#draft-badge` (absorbé par la bannière) ; `#local-save-status` conservé masqué (`app.js` y écrit
toujours). Le bouton Exporter ouvre pour l'instant `#section-projet` (câblage minimal, S5 le
rebranchera sur le panneau Export). `node test/run.js` vert (aucune géométrie touchée). Reste :
validation visuelle humaine (`VALIDATION.md`, P10 · S2), puis S3 (rail + panneaux).

S3 (T-144, rail + panneaux) codée : sidebar unique remplacée par `#icon-rail` (78px, 5 boutons Motifs/
Contour/Guides/Sélection/Export, icônes CSS/SVG `currentColor`) + `#panel` (336px, slide-over, un seul
panneau ouvert à la fois via `activePanel`/`setPanel`, re-clic ferme). Panneaux **Motifs & décor**
(onglets Personnages/Symboles + import + bloc Décor SVG/PNG + rafraîchir + verrou), **Contour**
(dims + import SVG) et **Guides** (marge en slider, cadre W/H + nouveau slider rotation, zone
interdite, packing avec échelles en sliders) remplis avec les mêmes ids/handlers qu'avant — aucun
handler perdu (vérifié par script : 0 `getElementById` orphelin sur 143 ids). `#sidebar` réduit à
`#inspector` + `#section-projet` (Sélection/Export, portée S4/S5, laissés en habillage sombre existant,
pleinement fonctionnels — juste déplacés hors de l'ancien `<aside>` qui contenait tout). Rail
Sélection/Export : câblage minimal (déplie `#sidebar` / réutilise `openExportMinimal` de S2) en
attendant leurs panneaux dédiés. Écart maquette assumé et documenté (`plans/P10/S3.md`) : ajout d'un
slider « Rotation du cadre » (`frame-rot`, -45..45°) absent de l'app actuelle en tant que contrôle
dédié — alias pratique vers `frameNode.rotation()`, la fonction existait déjà via le Transformer/
`insp-rot` génériques (S4). `node test/run.js` vert (aucune géométrie touchée). Point de vigilance pour
S6 : le rail/panneau ne se replient pas encore en mode édition (seul l'ancien `#sidebar` résiduel le
fait) — décision de chrome d'édition à trancher là-bas. Reste : validation visuelle humaine
(`VALIDATION.md`, P10 · S3), puis S4 (panneau Sélection).

S4 (T-145, panneau Sélection) codée : `#inspector` (sidebar sombre résiduelle) + `#selection-palette`
supprimés, fusionnés dans `#panel-selection` (nouveau panneau coulissant du rail, `activePanel==
"selection"`). État vide/rempli togglé dans `updateInspector()` ; contenu motif (couleur/rôle/marge)
affiché seulement si le nœud sélectionné est un motif (zone/cadre en restent dépourvus, comme avant),
Dupliquer/Supprimer/Position fine (rotation/échelle) applicables à tout type de nœud sélectionné.
Écart tranché avec Thibault avant exécution : le plan `S4.md` se contredisait entre sa « Décision
clé » (picker couleur natif seul, D-013 pt 3) et son étape 1 (réintroduisait les 6 pastilles) —
confirmé : **picker natif seul**, pas de pastilles. `insp-margin`/`insp-rot`/`insp-scale` passés de
`type=number` à `type=range` (mêmes handlers) + labels mono synchronisés. `#btn-up`/`#btn-down`
(z-order pas-à-pas) retirés de l'UI (absents de la maquette), fonction conservée au clavier (`[`/`]`).
`#btn-dup` (doublon) retiré, un seul Dupliquer désormais. Barre contextuelle sombre
(`#selection-toolbar`, remplace `#selection-palette`) : Dupliquer/Descendre/Monter rebranchés sur
`duplicateSel`/`zorder("back")`/`zorder("front")` (mêmes handlers que « Tout devant/derrière »),
« ✎ Modifier » ouvre le panneau via `openSelectionPanel()` (ouverture forcée, pas un toggle) ;
visible si sélection hors édition. `zone-editor`/`stylet-editor` déplacés tels quels (hors périmètre,
chrome d'édition → S6, fonction préservée D-013 pt 2). Point de vigilance transmis à S6 (non traité
ici) : le nouveau `#panel`/`#icon-rail` ne se replie pas encore à l'entrée en édition (seul l'ancien
`#sidebar` résiduel le fait) — si le panneau Sélection est ouvert au moment d'entrer en édition, il
reste affiché avec des champs figés. `node test/run.js` vert (aucune géométrie touchée). Reste :
validation visuelle humaine (`VALIDATION.md`, P10 · S4), puis S5 (panneau Export).

S5 (T-146, panneau Export) codée : dernier vestige de l'ancienne sidebar (`#sidebar`, ne contenait
plus que la section « Export & sauvegarde » depuis S3/S4) **retiré** d'`index.html`, remplacé par
`#panel-export` (nouveau panneau coulissant du rail, mêmes ids/handlers — `export-dpi`, les 4 boutons
d'export, `btn-save`/`load-project`/`btn-clear`, `draft-summary` gardé discret pour
`refreshDraftCounter`). DPI resté en `input number` habillé (pas de `select` 3 valeurs, plage réelle
50-1200 conservée — branche « Si bloqué » retenue d'emblée). `openExportMinimal` (S2, câblage
provisoire) remplacé par `openExport()` (ouverture forcée du panneau, même schéma que
`openSelectionPanel` de S4) ; `rail-export` bascule désormais en toggle standard comme les autres
rails. Zoom flottant (+/reset/−) ajouté en incrustation bas-droite du canevas : même mécanique que la
molette/pinch existants (bornes 0.1-8, facteur 1.2/clic), centré sur le canevas ; label % synchronisé
aussi sur molette/pinch. Pastille d'aide canevas (bandeau haut-centre, masquée en souris desktop via
`pointer:fine`) et toast (`showToast`, nouveau helper minimal, 2.6 s) branché sur les 5 succès
imports/exports (SVG/PNG/JPEG/PDF/Enregistrer/Charger) — sans toucher `local-save-status` (autosave)
ni les dialogues custom de confirmation (`showDialog`). Ligne orpheline
`document.getElementById("sidebar").addEventListener(...)` retirée d'`app.js` (aurait planté au
chargement, `#sidebar` n'existant plus). `node test/run.js` vert (aucune géométrie touchée). Reste :
validation visuelle humaine (`VALIDATION.md`, P10 · S5), puis S6 (chrome mode édition).

S6 (T-147, chrome mode édition) codé : reskin **purement CSS/HTML** de `#edit-palette` — aucun id ni
handler changé (seul ajout : un second bouton Terminer dans la pilule, câblé sur `exitEdit`). Pilule
`#edit-mode-banner` reconstruite en bandeau fixe haut-centre (fond `--ink`, bouton Terminer accent),
absorbe l'ancien bandeau bleu ; liseré du canevas édité (`#app.editing #stage`) passé de `#2563eb` figé
à `var(--accent)`. Barre d'outils niveau 1 reskinée aux tokens (`--surface`/`--line`/rayon 16/
`--shadow-pop`) ; les 6 boutons d'outil (Pinceau/Gomme/Ligne/Rectangle/Cercle **+ Lasso conservé**,
D-013 pt 2) passés à 52×50 icône+label 9px, `?`/`⚙` laissés en icône seule 48×48. État actif unifié
(`.tool-btn.on` = fond accent/0.14 + encre accent) appliqué à la fois à la barre et à tous les toggles
du tiroir (modes de trait, lissage, pression, taille) — un doublon obsolète de cette règle (`#2563eb`
plein, résidu P9) a été supprimé au passage, il aurait écrasé la nouvelle par cascade.
`#btn-edit-exit` : « Sortir » → « Terminer » + style accent ; Annuler/Rétablir passés en boutons texte
transparents (maquette l.406-409). Popover de taille laissé intact (D-013 pt 2 : le « cycle de taille »
de la maquette = habillage de ce popover complet, pas un vrai cycle au clic), juste reskiné tokens/mono.
Tiroir ⚙, mini-barres lasso/brouillon et overlay d'aide reskinés tokens sans changement de structure ni
de logique ; `#stylet-draft-actions` repris dans la même famille verte que `.pending-banner` (S2).
`node test/run.js` vert (aucune géométrie touchée). Reste : validation visuelle humaine (`VALIDATION.md`,
P10 · S6), puis S7 (responsive/PWA/nettoyage).

S7 (T-148, responsive/PWA/safe-area) codé : topbar, bannière d'essais, rail et shell protègent les
zones sûres ; sous 900 px, le panneau 336 px flotte après le rail au-dessus du canevas au lieu de le
comprimer. Les barres contextuelles Sélection/Édition défilent horizontalement si nécessaire, avec
cibles tactiles inchangées. Le chrome supérieur se compacte aux petites largeurs et les aides tactiles
redondantes sont masquées à la souris. `theme-color` et le manifest standalone sont alignés avec la
nouvelle surface claire. CSS mort de l'ancien `#sidebar` supprimé ; DOM ancien déjà absent. Tous les
inputs numériques conservent `inputmode="decimal"`. `node test/run.js`, parsing JSON du manifest et
`git diff --check` verts. Reste : validation humaine P10 · S8 sur iPad réel et desktop.

Plan P6 (verrou décor + rafraîchir depuis PNG Procreate) codé, T1/T2/T3 terminés (`node test/run.js` vert). Reste : validation visuelle par Thibault (cf. `VALIDATION.md`, sections P6 · T1/T2/T3).

**Plan P7 en cours (T1/T2/T3/T4/T5/T6/T7/T8/T9/T10/T11/T12/T13/T14/T15 faites le 2026-07-03, reste T16)** : édition iPad/Pencil — corrections tactiles, tracé en
pointer events (stylet/doigt, coalescés, curseur, pression), perf décor (cache brouillon, Clipper
localisé par îlots, undo par commandes, autosave différé). 16 tâches : `plans/P7/index.md` ;
décisions : `DECISIONS.md §D-010` ; backlog : T-106 + T-110…T-124. Source : double audit
(Claude + Codex, `AUDIT_UI_IPAD_APPLE_PENCIL.md`). T4 (`pencil-probe.html`) = sonde autonome stylet Safari.
T5 : le tracé d'édition (pinceau/gomme/formes/lasso) capte désormais des Pointer Events natifs sur
`stage.container()` (attachés/détachés dans `enterEdit`/`exitEdit`), fondation stylet pour T6-T10.
T6 : modèle Procreate — stylet/souris dessinent, un doigt panne la vue (translation manuelle de
`stage.position()`, pas de `draggable`), deux doigts pan/zoom (Konva, inchangé) ; bascule
« ✍️ Doigt : navigue/dessine » dans la palette (`edit.fingerDraws`, non persisté).
T7 : trait libre + lasso ingèrent les points coalescés (`getCoalescedEvents`, repli `[e]` si absent)
avec décimation (seuil 1 px écran → local via `getAbsoluteScale`), aperçu prolongé par les points
prédits (`getPredictedEvents`, jamais dans `edit.pts`), premier point du down + dernier du up
toujours empilés même sous le seuil.
T8 : curseur d'outil dans `editLayer` (`editCursorNode`, coords locales — rayon `sizeMm * PX_PER_MM
/ 2` = taille réelle du trait à tout zoom) : cercle (pinceau/gomme, rouge en gomme), nib incliné
(mode Plume, suit `calliAngle`), réticule (ligne/rect/ellipse), point (lasso). Suit `pointermove`
même en survol (`buttons === 0`, Pencil) ; caché au toucher et hors du conteneur (`pointerleave`) ;
recréé (forme/couleur) par `buildEditCursor()` sur changement d'outil/mode/taille/angle, détruit à
`exitEdit`.
T9 : mode Pression rendu naturel — courbe gamma `pEff = p^γ` (γ = 0.6 Douce / 1 Normale / 1.6 Ferme,
boutons dans `#pressure-row`) et largeur minimale réglable (`edit.minWidthFrac`, slider 0-60 %, défaut
25 % = comportement précédent) ; mapping uniquement côté `app.js` (`applyStroke`), `ML.variableStroke`
inchangé ; gomme toujours insensible à la pression ; réglages de session, non persistés.
T10 : lissage optionnel du trait libre (pinceau/gomme uniquement) par EMA à 4 crans (Off/Léger/Moyen/
Fort, `s = 0/0.3/0.55/0.75`) appliquée à l'ingestion dans `moveStroke` (`edit.smoothing`,
`edit.smoothPrev`), après la décimation T7 ; dernier point brut du `pointerup` toujours empilé
(trait atteint le lever du stylet) ; défaut Off (comportement inchangé) ; lasso/formes non affectés ;
réglage de session, non persisté.
T11 : `editDraftGroup` (brouillon couleur + surcharge verte) mis en cache bitmap après chaque
`redrawEditLayer` (`safeCache(editDraftGroup, 1)`) — le mouvement pendant un trait ne coûte plus que
le blit d'un bitmap sur décor chargé (des milliers de contours retracés sinon). `getSelfRect` ajouté
aux deux `Konva.Shape` (sceneFunc sur canvas brut, même piège que `fillGroupContent`) ; `clearCache`
en tête de `redrawEditLayer` et dans `exitEdit`. `editPreview`/`lassoHighlight` restent enfants de
`editLayer` (frères, pas dans le groupe caché).
`node test/run.js` vert (aucune géométrie touchée), validation tactile/iPad restant à faire par
Thibault (cf. `VALIDATION.md`, sections P7 · T6/T7/T8/T9/T10/T11).
T12 : `ML.groupIslands` (regroupe contour extérieur + trous rattachés, cf. D-010) et
`ML.surfaceUnionLocal`/`ML.surfaceDifferenceLocal` (n'envoient à Clipper que les îlots dont la bbox
touche celle de l'argument ± 1 px ; les autres traversent inchangés). Géométrie seule — **pas encore
branché dans `app.js`** (branchement = T13). `node test/run.js` vert (5 nouveaux cas a-e comparés à
l'oracle plein) ; rien de visible avant T13.
T13 : `surfaceUnionLocal`/`surfaceDifferenceLocal` (T12) branchés dans `applyStroke`/`endShape`/les
trois `finalizeLasso*` (union du draft). Surcharge verte (`edit.added`) maintenue en session au lieu
d'un `addedRegions(réel, brouillon)` plein cadre à chaque trait : init dans `enterEdit`
(`edit.realFill` mis en cache) ; pinceau = union locale de la part du trait absente du réel ;
gomme = différence locale ; opérations non locales (`undoStroke`, les trois `finalizeLasso*`,
`applyMotifDraft`/`applyAllDrafts` — qui rafraîchit aussi `edit.realFill` —, `discardMotifDraft`) font
un recalcul plein. `redrawEditLayer` lit `edit.added` au lieu de le recalculer (l. ~1022).
`node test/run.js` vert (aucune géométrie nouvelle, T12 couvre déjà Clipper localisé) ; validation
visuelle restant à faire par Thibault (cf. `VALIDATION.md`, section P7 · T13).
T14 : undo d'édition remplacé par un historique de commandes + keyframes (`edit.history` : entrées
`{kind:"op", op, poly}` rejouables via `surfaceUnionLocal`/`surfaceDifferenceLocal`, ou
`{kind:"snapshot", draft}` pour l'état initial, les keyframes auto (toutes les 8 `op`) et les
mutations non rejouables — lasso ×3, Jeter). `pushEditEntry` gère l'insertion des keyframes, la
borne 30 (purge par l'avant via `trimEditHistory`, resynthétise un snapshot si la coupe tombe au
milieu d'une séquence d'ops) et vide `edit.redo` à chaque nouvelle mutation. `undoStroke`/`redoStroke`
dépilent vers l'autre pile et reconstruisent via `rebuildDraftFrom` (dernier snapshot + replay des
ops) ; les keyframes auto sont traversées en un seul clic (transparentes, sinon elles consommeraient
un undo/redo sans effet visible). Bouton **Rétablir** ajouté à côté d'Annuler (`index.html`, grid2
→ 3 colonnes), désactivé quand `edit.redo` est vide (Annuler désactivé quand l'historique n'a plus
qu'un snapshot) ; raccourci `Ctrl/Cmd+Maj+Z`. `node test/run.js` vert (aucune géométrie touchée) ;
validation visuelle restant à faire par Thibault (cf. `VALIDATION.md`, section P7 · T14).
T15 : **Autosave différé en période creuse** — debounce 1 s (au lieu de 300 ms) + `requestIdleCallback`
(timeout 4 s, fallback `setTimeout`) ; ne sauvegarder jamais pendant un trait (`edit.drawing` → replan).
`localSaveTimer` (debounce) + `idleCallbackId`/`idleCallbackType` (pour annulation). `flushLocalSave`
annule les deux et sauve immédiatement (événements `visibilitychange`/`pagehide` inchangés). Statut
« Sauvegarde... » → « Sauvegardé localement » inchangé. `node test/run.js` vert (aucune géométrie).
Validation de la fluidité édition : report `VALIDATION.md` (usage réel sur iPad).

**Plan P8 en cours (cadré 2026-07-02)** : impression 1:1 multi-feuilles A4 en **PDF** (jsPDF
vendored) pour décalque + pyrogravure — le dôme de la table écarte la gravure laser. Rendu
contours 0,3 mm couleur calque + surfaces gris clair, contour guitare pointillé, recouvrement
10 mm avec croix de recalage, règle de contrôle 100 mm, page de garde plan d'assemblage, sens
écran (pas de miroir). 4 tâches : `plans/P8/index.md` ; décisions : `DECISIONS.md §D-011` ;
backlog : T-125.
T1 (2026-07-03) : `ML.computeTiling(bbox, opts)` — pur, dans `geometry.js`. Pour chaque orientation
(portrait/paysage), calcule `cols`/`rows` (fenêtre utile − recouvrement) et retient celle au nombre
de feuilles minimal (égalité → portrait) ; grille centrée sur le bbox (`originX/Y`) ; retourne
`{ landscape, cols, rows, pageW, pageH, margin, overlap, uw, uh, pages: [{row, col, x, y, label}] }`.
Aucun rendu PDF/DOM (T2), pas encore branché dans `app.js` (T4). `node test/run.js` vert (5 cas :
1×1 centré, 500×380 égalité→portrait 3×2, 400×260 portrait 3×1, labels, recouvrement voisines).
T2 (2026-07-03) : jsPDF 2.5.1 UMD vendored (`vendor/jspdf.umd.min.js`, expose `window.jspdf.jsPDF`)
+ `src/print.js` (`ML.renderPrintPdf(scene, tiling, opts)`) : par page, clip fenêtre utile
(`rect`+`clip`+`discardPath`), pré-filtrage des sous-chemins par bbox, un `path()`/couleur pour
surfaces (gris clair `fillEvenOdd`) et contours (couleur calque, 0,3 mm), contour guitare + cavités
en pointillé gris. Aucune divergence d'API jsPDF par rapport au plan (`clip`/`discardPath`/`path`
présents tels quels). Smoke testé en Node (VM sandbox simulant les globals navigateur) :
`computeTiling` → `renderPrintPdf` sur une scène d'exemple produit un PDF valide multi-pages.
`node test/run.js` vert (aucune géométrie de cœur touchée). Pas d'UI/bouton (T4) — rendu réel à
valider visuellement à ce moment-là.
T3 (2026-07-03) : croix de recalage (4 coins + fantômes à `overlap` vers l'intérieur sur les bords
partagés), libellé par feuille (marge haute), règle de contrôle 100 mm graduée (marge basse), page
de garde insérée en position 1 via `doc.insertPage(1)` (dispo dans le jsPDF vendored — pas de repli
nécessaire) avec plan d'assemblage réduit (contours seuls + grille des fenêtres utiles + labels).
Bug trouvé et corrigé pendant la vérif Node : `doc.rect(...,null)` ne peint rien (ni trait ni
fond) dans ce jsPDF vendored — la grille du plan réduit était invisible ; fix = style `"S"`
explicite. Vérifié par un harnais Node (jsPDF tourne en CommonJS hors navigateur avec `atob`/`btoa`
globaux de Node) qui inspecte le flux PDF brut (non compressé) : opérateurs de tracé attendus
présents (croix, règle, textes, grille de la page de garde bien strokée). `node test/run.js` vert
(print.js hors périmètre des tests headless). Pas d'UI/bouton (T4) — rendu réel à valider sur
papier à ce moment-là (report `VALIDATION.md`, section prévue pour T2+T3+T4).
T4 (2026-07-03) : bouton **« PDF A4 1:1 »** dans la section Projet (`index.html`, à côté des exports
SVG/PNG/JPEG). `collectPrintScene()` dans `app.js` réutilise `instancesBottomToTop()` +
`ML.occludeSurfaces` (même géométrie que `exportPNG`), convertit px→mm par simple division
`PX_PER_MM` **sans passer par `ML.pxPathsToMm`** (pas de miroir laser, sens écran, D-011 pt 4-5) ;
bbox inclut le contour. `exportPdfA4()` enchaîne `ML.computeTiling` (T1) → `ML.renderPrintPdf` (T2/T3)
→ `doc.save("pattern-A4.pdf")`. `node test/run.js` vert (aucune géométrie de cœur touchée). Rendu
réel (papier/règle 100 mm/raccord des feuilles) à valider par Thibault (`VALIDATION.md`, section
« P8 · impression A4 »). Plan P8 complet (T1-T4 codés).

**Plan P9 en cours (2026-07-03)** : refonte spatiale UI iPad/Pencil (couche présentation
seule, aucune géométrie). Reprend la refonte reportée par D-010 + le second audit du 2026-07-03
(`AUDIT_CODE_UI_IPAD_2026-07-03.md` + audit Playwright Codex). 12 sessions / 15 tâches (T-126…T-140) :
cibles tactiles 44 px, palette d'édition en barre d'outils + tiroir contextuel, actions lasso/brouillon
flottantes, gestes tap 2/3 doigts (Annuler/Rétablir), priorité stylet, zoom-to-fit + indicateur de mode,
dialogue custom (remplace les confirm imbriqués) + badge essais, Projet sticky, PWA, et volet Pencil Pro
**conditionnel** (twist→angle plume, mode ombrage) gaté par une validation de sonde sur iPad réel (T-138).
Plan : `plans/P9/index.md` ; décisions : `DECISIONS.md §D-012`. Garde-fou : `node test/run.js` reste vert
partout (rien ne touche `geometry.js`/`vendor/`) ; validation visuelle par Thibault (`VALIDATION.md`).
S6 (T-131, 2026-07-03) : `#lasso-actions`/`#stylet-draft-actions` sortis d'`#edit-palette` vers des
mini-barres flottantes (`#lasso-toolbar` positionnée en JS près du bbox de `edit.lasso.inside`,
figée à l'ouverture — `positionLassoToolbar()` ; bandeau vert fixe haut de canevas pour Appliquer/
Jeter). Notes permanentes du tiroir remplacées par un bouton « ? » → overlay `#edit-help` (fermeture
au tap). `node test/run.js` vert. Reste : validation visuelle iPad (`VALIDATION.md`, P9 · S6).
S7 (T-132, 2026-07-03) : priorité stylet (`edit.drawingPointerType`, posé dans `startStroke`/
`startShape`/`startLassoTrace`) — un contact touch isolé pendant un trait pen actif est ignoré dans
`editPointerDown` (ni pan, ni dessin doigt), le 2ᵉ-contact-annulation reste inchangé. Zoom-to-fit
animé (`Konva.Tween` sur `stage`, 200 ms) à l'entrée d'édition sur le bbox de `edit.node` (marge 10 %,
calculé relatif à `mainLayer`) ; `exitEdit` restaure `edit.prevView`. Indicateur de mode : classe
`#app.editing` (liseré bleu non-inset autour de `#stage`, un inset serait masqué par le canevas Konva)
+ bandeau `#edit-mode-banner` (« ✏️ {motif.name} »). `node test/run.js` vert. Reste : validation
visuelle iPad (`VALIDATION.md`, P9 · S7). S7 débloque S8 (T-133).
S8 (T-133, 2026-07-03) : tap 2/3 doigts = Annuler/Rétablir en édition. `edit.tapGesture =
{ maxFingers, startT, moved, starts }` posé/mis à jour dans `editPointerDown` sur chaque contact
touch (`starts` = Map pointerId→position de contact, pour détecter un déplacement par doigt) ;
`editPointerMove` marque `moved` si un contact dépasse ~10 px de son point de départ (vérifié même
au-delà de 2 contacts actifs, avant le early-return existant du pinch) ; `editPointerUp` évalue le
geste quand `activeTouchPointers` retombe à 0 : si `!moved` et durée `< 250 ms`, `maxFingers === 2`
→ `undoStroke()`, `=== 3` → `redoStroke()`. Un pinch avéré (`stage.on("touchstart")`, 2 doigts)
marque `moved = true` pour désolidariser le tap du zoom. `tapGesture` réinitialisé à
`enterEdit`/`exitEdit`. `node test/run.js` vert (aucune géométrie touchée). Reste : validation
visuelle iPad (`VALIDATION.md`, P9 · S8).
S9 (T-134, 2026-07-03) : dialogue custom `showDialog({title,message,buttons})` (Promise résolue par
le bouton tapé ou par la valeur d'annulation au tap backdrop, `#modal-backdrop`/`#modal` dans
`index.html`) remplace les `confirm()`. `guardPendingDrafts` réécrit `async` en 3 choix explicites
(« Appliquer et exporter » / « Exporter sans les essais » / « Annuler », D-012 pt 6) ; `exportSVG`/
`exportPNG`/`collectPrintScene`/`exportPdfA4` passés `async`/`await` (tous appelés depuis des
`onclick`, aucune valeur de retour consommée ailleurs → conversion directe). `deleteMotifFromLibrary`/
`hideBuiltin` passés `async`, `confirm()` de suppression remplacé par `showDialog` (bouton danger).
Les `alert()` d'export/erreur restent natifs (pas de choix à faire, coût async non justifié). Badge
`#draft-badge` dans le header (`refreshDraftCounter`), tap = déplie la sidebar et scrolle vers
`#section-projet`. `node test/run.js` vert (aucune géométrie touchée). Reste : validation visuelle
iPad (`VALIDATION.md`, P9 · S9). S9 débloque S10 (T-135/T-136).
S3 (T-137, 2026-07-03) : sonde `test/pencil-probe.html` étendue (`twist`/`altitudeAngle`/
`azimuthAngle`/`tangentialPressure` loggés avec min/max + verdict « varie »/« figé » par champ),
fichier isolé hors app. Débloque le gate humain T-138.
Gate T-138 (2026-07-04, `VALIDATION.md` P9 · S11 · gate) : sur iPad + Pencil Pro réel, `twist`
figé (**no-go T-139**, S11 abandonnée, slider `#calli-angle` reste seul contrôle d'angle plume) ;
`altitudeAngle` varie (**go T-140**).
S12 (T-140, 2026-07-04) : 4ᵉ mode de trait **Ombrage** (inclinaison Pencil) — `edit.altitudes`
capturé en parallèle de `edit.pressures` (`startStroke`/`moveStroke`/`endStroke`, via
`e.altitudeAngle`, `NaN` si non-Pencil) ; branche `strokeMode === "shade"` dans `applyStroke` :
mapping linéaire couché→large/vertical→fin (borne basse fixe `SHADE_MIN_FRAC = 0.2`, pas de nouveau
slider) appelle `ML.variableStroke` (même géométrie que le mode Pression) ; actif seulement au
Pencil (`edit.drawingPointerType === "pen"` et altitudes finies), sinon repli trait constant ; gomme
insensible comme les autres modes variables. Bouton « Ombrage » ajouté à côté de Rond/Pression/Plume
(`index.html`, `setStrokeMode`) ; curseur inchangé (cercle, comme Rond — seul le mode Plume a un
curseur dédié). `node test/run.js` vert (aucune géométrie nouvelle) + smoke Node ad hoc confirmant un
polygone non vide. Reste : validation visuelle iPad (`VALIDATION.md`, P9 · S12). **Plan P9 complet
(T-126…T-140, T-139 abandonnée par gate no-go).**

Ajustement post-P9 (2026-07-04) : la section « Projet » (épinglée en bas de sidebar depuis D-012 pt 7)
prenait trop de place en sidebar tablette. Repassée en `<details class="advanced">` repliable comme
« Avancé », renommée **« Export & sauvegarde »** (le nom « Projet » entrait en confusion avec l'historique/
sauvegarde locale du header). Le badge essais en attente (`#draft-badge`) déplie désormais aussi la
section avant de scroller vers elle. `node test/run.js` vert (aucune géométrie touchée) ; à valider
visuellement (`VALIDATION.md`).

Bug corrigé (2026-07-04) : **la gomme n'effaçait pas le corps initial du motif en direct** (ne
« s'appliquait » qu'à la sortie d'édition). Cause : le fond blanc « sticker » (`editStaticGroup`)
était construit UNE fois à `enterEdit` (`buildEditStatic`) puis figé/caché (optimisation T3) ; effacer
retirait bien la couleur (`editDraftGroup`, depuis `edit.draft`) mais le fond blanc restait plein →
la zone effacée virait au blanc au lieu de disparaître, et la silhouette ne rétrécissait qu'à la
sortie (`rerenderMotif` la recalculait alors). Les traits *tracés* (hors silhouette d'origine)
s'effaçaient bien, d'où le symptôme « efface mes traits mais pas le motif initial ». Fix :
`buildEditStatic` scindé en `paintEditStatic(silhouette)` + wrapper ; `redrawEditLayer` repeint
désormais le fond depuis `ML.silhouetteFromSurface(edit.draft)` (== ce que produit `rerenderMotif`)
à chaque trait, **sauf pour le décor** (see-through + milliers de contours → fond figé conservé,
coût T3 ; effacement du corps d'un décor toujours visible à la sortie, limite documentée).
`redrawEditLayer` étant appelé une fois par trait (pas par frame — `moveStroke` ne touche que
l'aperçu), le surcoût sur un motif normal est négligeable. `node test/run.js` vert + smoke Node
(la silhouette rétrécit après effacement du bord). À valider sur iPad (`VALIDATION.md`).

Bug corrigé (2026-07-04) : en édition, le stylet dessinait ET déplaçait le stage en même temps
(dessin impossible). Cause : `endPinch()` (l. ~205, pinch-zoom deux doigts hors édition) réactivait
inconditionnellement `stage.draggable(true)` après un geste deux doigts, y compris pendant l'édition
où `enterEdit` force `stage.draggable(false)` (le pan un doigt y est géré à la main par
`edit.panAnchor`). Tout pinch/contact deux doigts pendant l'édition (pinch-zoom volontaire ou contact
parasite) réactivait donc le drag natif Konva du stage, qui captait aussi le stylet en plus du tracé
custom. Fix : `stage.draggable(!edit.active)` dans `endPinch`. `node test/run.js` vert (aucune
géométrie touchée) ; à valider sur iPad par Thibault (`VALIDATION.md`).

T-141 (2026-07-04) : suite du fix « gomme n'effaçait pas le corps initial » ci-dessus — celui-ci avait
révélé le vrai problème : l'instance réelle du motif (`edit.node`, sur `mainLayer`) n'était jamais
masquée pendant l'édition (seulement décachée), et le calque d'essai qui la recouvrait via le sticker
blanc laisse désormais voir le motif intact en dessous dès que sticker+brouillon rétrécissent sous la
gomme. Fix : `g.visible(false)` dans `enterEdit` (après `zoomToFitEdit`, pour ne pas fausser son bbox),
restauré (`editedNode.visible(true)`) dans `exitEdit` avant le `rerenderMotif`/`safeCache` final
(`mainLayer.batchDraw()` ajouté à la branche `safeCache`, qui ne redessinait pas). Comportement pendant
« Appliquer » en édition live (`applyMotifDraft` → `rerenderMotif` → `fillGroupContent`) inchangé : ne
touche pas `visible`, le nœud reste masqué tant qu'on est en édition. Commentaire périmé de
`fillGroupContent` (qui attribuait l'exception de cache à l'aperçu de trait, en fait sur `editLayer`)
corrigé au passage. `node test/run.js` vert (aucune géométrie touchée) ; à valider visuellement
(`VALIDATION.md`, checklist T-141).

Rendu PDF = aplat plein par défaut (2026-07-04) : le PDF d'impression restitue désormais le **dessin au
trait tel qu'à l'écran** — `ML.renderPrintPdf` `opts.style` par défaut `"fill"` (aplat opaque couleur calque,
evenodd, **sans contour**) ; `"outline"` (ancien : fond gris + contour couleur 0,3 mm) conservé en option
seulement. Bouton « PDF A4 1:1 » sans case à cocher (`#pdf-fill` retiré). **Diagnostic** (reproduit hors
navigateur avec jsPDF + `pdftoppm`, projet réel `projet.mlayout`) : le décor est un dessin au trait
vectorisé (imagetracer trace chaque trait par ses **2 bords**) ; le mode `"outline"` strokait chaque bord →
traits **creux/doublés** (le « double contour » signalé). Le remplissage **evenodd** (`f*`, vérifié dans le
flux PDF) rend au contraire des traits pleins identiques à l'écran (`fillGroupContent`). L'occlusion Clipper
(`occludeSurfaces`, nonzero) ne dégrade PAS le line-art (490 régions in/out inchangées). `node test/run.js`
vert (print.js hors périmètre headless) ; rendu réel validé par rastérisation `pdftoppm` du PDF du projet
réel (voir `VALIDATION.md`, P8 · rendu aplat).

## Ce qui fonctionne

- **Verrou global du décor** (bouton 🔒/🔓) : décor inerte au pointeur (sélection/déplacement/édition bloqués), clic traversant vers les motifs posés au-dessus, état persisté dans le projet JSON.
- **Import décor PNG vectorisé in-app** (`vendor/imagetracer.js` vendored, seuillage bilevel encre=opaque+sombre → noir, fond → blanc — couvre fond transparent Procreate *et* fond blanc opaque, cf. D-009 extension 2026-07-04) et **« Rafraîchir le décor »** (remplacement de la géométrie sur place, position/échelle/rotation/z-order des exemplaires préservées).
- **Import SVG** (perso / symbole / décor via 3 boutons) → bibliothèque à vignettes ; clic = pose une instance. Grilles repliables par rôle + suppression motif (× avec cascade des instances, annulable Ctrl+Z).
- **Bibliothèque de base inlinée** (`src/builtin-motifs.js`, ~132 motifs) : matérialisation paresseuse (IntersectionObserver), masquage local persistant (`hiddenBuiltins`), promotion en motif local à la 1ʳᵉ édition. Régénérée par hook pre-commit (`tools/build-builtin-motifs.js`).
- **Détection de zones** (`ML.buildZones`) + éditeur de rôles REMPLI/VIDE par motif.
- **Rôles motif** (PERSONNAGE noir / SYMBOLE rouge / DECOR bleu see-through) + couleur focale + marge ; inspecteur rôle/couleur/marge.
- **Import contour** calibré en mm réels (corps blanc à graver + cavités auto) ; zones interdites manuelles ; guides de gravure (marge offset, cadre Falcon).
- **Occlusion par surfaces** à l'export (`ML.occludeSurfaces`, règle `maskFor` décor/perso) ; **export SVG mm** multi-couleur `evenodd`.
- **Édition** : sélection/rotation/échelle/glisser, z-order, zoom/pan, pinch tactile ; **édition stylet non destructive** (calques d'essai, pinceau/gomme/formes/lasso, pression + plume calligraphique) ; **export PNG** (sens écran).
- **Packing** assisté ; save/load projet JSON.
- **Validé headless** : `node test/run.js` (parse → zones → occlusion par surfaces → writeSVG).

## Ce qui casse / n'est pas testé

- **Validation tactile de l'édition stylet** : code OK (souris/Playwright), reste à valider sur tablette réelle.
- **`src/svg.js` ignore `<g transform>`** → échelle d'import fausse sur certains SVG (ex. exports potrace). Non corrigé (T-102).
- **`vendor/clipper.js:6986`** : `module.exports` non gardé → `ReferenceError` console non bloquante (vendor intouchable, T-106).
- Édition stylet mute `motif.surface` (partagé par toutes les instances) et opère sur une seule couleur focale.
- Occlusion ~1 s / 40 instances (à surveiller au-delà de ~100, non re-profilé depuis le passage aux surfaces).

## Dette technique

- Packing = dispersion naïve (pas de contrôle densité/recouvrement).
- `motifSilhouette`/`motifFill` coûteux sur gros décors (~8 s + ~6 s sur 3936 sous-chemins) — à profiler (T-103).
- Perf occlusion par surfaces non re-mesurée depuis D-004.
