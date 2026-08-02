# VALIDATION.md — checklist visuelle (passe humaine)

> Validation visuelle déléguée à Thibault, non bloquante pour les commits. Claude ne la vérifie
> pas lui-même (pas de navigateur/Playwright). Légende : [ ] à valider · [x] OK · [!] à corriger.

## P10 · S1 — Tokens de design + typographie IBM Plex vendored (T-142, 2026-07-07)

**Auto-validation :** ✅ `node test/run.js` vert (CSS/polices pur, aucune géométrie touchée).
Socle visuel de la nouvelle UI (maquette Claude Design) : tokens `:root` (couleurs oklch, rayons,
`--tap`, ombres) repris de la maquette, IBM Plex Sans/Mono vendorées dans `vendor/fonts/`. IBM Plex
Sans est servie par Google comme un seul fichier **variable** (`wght` 400-700) — les 4 poids déclarés
pointent donc vers le même `.woff2` (comportement navigateur normal). Le layout/DOM n'est pas encore
touché (S2-S7) : seul le fond de `body` (racine, pas visible car couvert par header/#app) et le
slider basculent sur les tokens à ce stade.

- [ ] Ouvrir `index.html` en `file://` (double-clic) : l'app reste affichable normalement, aucune
  erreur console liée aux polices.
- [ ] Onglet réseau du navigateur : **aucune requête externe** (pas de `fonts.googleapis.com` ni
  `fonts.gstatic.com`).
- [ ] Un slider (ex. taille de trait en édition) a le nouveau look : piste fine claire, gros pouce
  avec liseré blanc — comparer visuellement à la maquette (`Editeur Gravure.dc.html` l.17-20).
- [ ] Zoomer sur un texte quelconque (ex. header, `body`) : si le rendu bascule vers IBM Plex, vérifier
  que les caractères accentués français (é, è, à, ç, œ) s'affichent correctement.

## P10 · S2 — Barre supérieure + Annuler/Rétablir global + bannière « essais » (T-143, 2026-07-07)

**Auto-validation :** ✅ `node test/run.js` vert (aucune géométrie touchée).
`<header>` remplacé par la barre supérieure de la maquette (60px, titre/sous-titre, séparateur,
Annuler/Rétablir, badge session décoratif, bouton Exporter) + bannière « essais en attente » pleine
largeur. Historique **projet** étendu d'un Rétablir réel (pile redo miroir de l'undo existant).

- [ ] Ouvrir `index.html` en `file://` : la barre supérieure ressemble à la maquette
  (`Editeur Gravure.dc.html` l.34-54) — titre « Motif Layout » + sous-titre, séparateur, deux boutons
  ronds 48×48, badge vert « Session locale · iPad », bouton orange « Exporter ».
- [ ] Déplacer un motif → le bouton **Annuler** devient actif (opacité pleine) ; cliquer → le motif
  revient à sa position précédente, et **Rétablir** devient actif à son tour.
- [ ] Cliquer **Rétablir** → le motif reprend sa nouvelle position. Refaire une action après un Annuler
  → **Rétablir** redevient grisé/inactif (la pile redo est vidée par une nouvelle action, normal).
- [ ] Raccourcis clavier : Ctrl+Z annule, Ctrl+Maj+Z rétablit (hors mode édition).
- [ ] Entrer en édition sur un motif, faire un ou plusieurs traits (essai en attente) → la **bannière
  verte** apparaît sous la barre supérieure avec le bon décompte (« 1 essai en attente » /
  « N essais en attente »).
- [ ] Bouton **Jeter** de la bannière → l'essai disparaît (motif revient à son état réel), la bannière
  se masque.
- [ ] Refaire un essai, cliquer **Appliquer** dans la bannière → l'essai est appliqué au motif (plus de
  surbrillance verte), la bannière se masque.
- [ ] Bouton **Exporter** de la barre → ouvre/déplie la section « Export & sauvegarde » de la sidebar
  actuelle (câblage minimal, sera remplacé par le panneau dédié en S5) — pas d'erreur console.
- [ ] Entrer en édition sur un motif : la sidebar se replie automatiquement comme avant (non-régression
  du repli auto `#app.collapsed`, le bouton ☰ manuel a été retiré du header en attendant le rail S3).

## P10 · S3 — Rail d'icônes + panneaux coulissants (Motifs/Contour/Guides) (T-144, 2026-07-07)

**Auto-validation :** ✅ `node test/run.js` vert (aucune géométrie touchée) ; script de vérification
`getElementById` → 0 id orphelin sur 143.
Sidebar unique remplacée par un rail d'icônes (78px, 5 boutons) + un panneau coulissant (336px, un seul
ouvert à la fois). Contenu Motifs/Contour/Guides déplacé depuis l'ancienne sidebar, mêmes ids/handlers.
Sélection/Export (hors périmètre, S4/S5) restent accessibles via l'ancien `#sidebar` résiduel
(désormais réduit à ces deux sections). Écart maquette assumé : un slider « Rotation du cadre » a été
ajouté au panneau Guides (absent de l'app comme contrôle dédié, la fonction existait déjà via la
poignée de rotation du Transformer + le champ Rotation° du panneau Sélection) — à confirmer que ce
double accès n'est pas déroutant, sinon signaler pour retrait en S4.

- [ ] Ouvrir `index.html` en `file://` : rail de 5 boutons à gauche (Motifs, Contour, Guides,
  Sélection, Export) — ressemble à la maquette (`Editeur Gravure.dc.html` l.67-107). Canevas pleine
  largeur par défaut (aucun panneau ouvert au chargement).
- [ ] Cliquer **Motifs** → le panneau s'ouvre (336px) avec les onglets Personnages/Symboles, les
  grilles de vignettes (identiques à avant), le bloc Décor (aperçu, import SVG/PNG, rafraîchir,
  verrou). Re-cliquer **Motifs** → le panneau se ferme.
- [ ] Basculer l'onglet Symboles → la grille Symboles s'affiche (Personnages se masque) ; compteurs
  corrects sous chaque grille.
- [ ] Importer un personnage/symbole (SVG) depuis les tuiles pointillées du panneau → apparaît dans la
  bonne grille, comme avant.
- [ ] Cliquer **Contour** (le panneau Motifs se ferme, Contour s'ouvre — un seul panneau à la fois) :
  dims longue/courte + bouton « Charger un contour SVG » fonctionnels comme avant.
- [ ] Cliquer **Guides** : marge de sécurité (slider, la valeur mm affichée à droite suit le doigt),
  case à cocher toujours présente ; cadre laser W/H + case à cocher + **slider rotation** (tourne le
  cadre sur le canevas, la valeur ° suit) ; zone interdite (bouton +) ; rangement assisté (nombre +
  sliders échelle min/max + Disperser) — tous opérants comme avant la migration.
- [ ] Sélectionner le cadre laser sur le canevas et le faire pivoter via la poignée du Transformer →
  revenir au panneau Guides, le slider Rotation du cadre reflète la nouvelle valeur (sync au moment où
  la sélection se met à jour, pas en continu pendant le drag — comme le champ Rotation° existant).
- [ ] Cliquer **Sélection** dans le rail (aucun motif sélectionné) → rien de visible ne casse. Avec un
  motif sélectionné, l'inspecteur (ancienne sidebar résiduelle) doit rester accessible.
- [ ] Cliquer **Export** dans le rail → ouvre la section « Export & sauvegarde » (même comportement
  que le bouton Exporter de la barre supérieure, S2).
- [ ] Décor : les deux boutons d'import (SVG et PNG) sont bien présents et fonctionnels côte à côte,
  rafraîchir (↻) et verrou décor opérants.
- [ ] Entrer en édition sur un motif : le rail/panneau restent visibles (pas de repli automatique,
  différent de l'ancienne sidebar — attendu, cf. notes S3, à trancher en S6 si gênant sur iPad).

## P10 · S4 — Panneau Sélection + barre contextuelle sombre (T-145, 2026-07-07)

**Auto-validation :** ✅ `node test/run.js` vert (aucune géométrie touchée).
`#inspector` + `#selection-palette` remplacés par `#panel-selection` (panneau coulissant du rail,
« Sélection ») et `#selection-toolbar` (barre sombre flottante bas-centrée du canevas). Couleur de
gravure = picker natif seul, pas de pastilles (écart de plan tranché par Thibault le 2026-07-07,
conforme à D-013 pt 3). Marge/Rotation/Échelle passés en sliders avec labels mono.

- [ ] Ouvrir `index.html` en `file://`, sans sélection : cliquer **Sélection** dans le rail → le
  panneau s'ouvre avec le message « Appuyez sur un motif du canevas pour afficher ses réglages ici. »
  (pas de contenu vide/cassé).
- [ ] Sélectionner un motif posé (personnage/symbole) : le panneau Sélection (s'il est ouvert)
  affiche bouton sombre « ✎ Entrer en édition », Dupliquer/Supprimer, Couleur de gravure (picker
  natif seul — pas de grille de pastilles), Rôle, Marge du motif (slider + valeur mm), Ordre (z)
  Tout devant/derrière, Position fine (Rotation/Échelle en sliders + valeurs °/×) — comparer à la
  maquette (`Editeur Gravure.dc.html` l.244-291, sans les pastilles).
- [ ] En même temps, la **barre contextuelle sombre** apparaît centrée en bas du canevas (⧉
  Dupliquer, ▼ Descendre, ▲ Monter, séparateur, ✎ Modifier en accent, Supprimer en rouge clair) —
  comparer à la maquette (l.385-395).
- [ ] Bouger le slider Marge/Rotation/Échelle (panneau) : la valeur mono à droite suit en direct, et
  le motif se met à jour sur le canevas (marge/rotation/échelle) sans attendre le relâchement.
- [ ] Bouton **✎ Modifier** de la barre sombre : si le panneau Sélection n'est pas déjà ouvert, il
  s'ouvre ; s'il est déjà ouvert, il **reste ouvert** (pas de fermeture intempestive).
- [ ] Dupliquer / Supprimer : fonctionnent identiquement depuis le panneau **et** depuis la barre
  sombre (mêmes résultats qu'avant la migration).
- [ ] ▼ Descendre / ▲ Monter (barre sombre) envoient bien le motif tout en bas / tout en haut de la
  pile (même effet que « Tout devant »/« Tout derrière » du panneau, pas un pas-à-pas).
- [ ] Cliquer « ✎ Entrer en édition » : la barre sombre disparaît (remplacée par le chrome d'édition
  bas, S6) ; sortir de l'édition (bouton Sortir du chrome d'édition) → la barre sombre réapparaît si
  le motif est toujours sélectionné.
- [ ] Désélectionner (tap dans le vide du canevas) : le panneau Sélection (s'il est ouvert) repasse
  au message vide, et la barre sombre disparaît.
- [ ] Sélectionner une **zone interdite** ou le **cadre laser** (pas un motif) : Dupliquer/Supprimer/
  Position fine restent disponibles, mais Couleur/Rôle/Marge/Entrer en édition sont absents (comme
  avant la migration — ces réglages sont spécifiques aux motifs).
- [ ] Point de vigilance (à noter, pas bloquant pour cette session, transmis à S6) : ouvrir le
  panneau Sélection puis entrer en édition sur le motif sélectionné → vérifier ce qui se passe
  visuellement (le panneau peut rester affiché avec des valeurs figées pendant que le chrome
  d'édition prend le relais en bas) ; signaler si c'est gênant.

## P10 · S6 — Chrome mode édition : pilule + barre re-skinnée, tiroir préservé (T-147, 2026-07-07)

**Auto-validation :** ✅ `node test/run.js` vert (aucune géométrie touchée, CSS/HTML + un handler pur).
Reskin **purement visuel** de `#edit-palette` — mêmes ids/handlers qu'avant P10, D-013 pt 2 (zéro
fonction d'édition perdue) respecté : lasso, 4 modes de trait, lissage, bascule doigt et popover de
taille restent tous accessibles (dans le tiroir ⚙ ou la barre selon leur emplacement P9).

- [ ] Ouvrir `index.html` en `file://`, entrer en édition sur un motif (bouton ✎ ou « Entrer en
  édition ») : une **pilule sombre** apparaît fixée en haut-centre (« ✎ Édition des zones — {nom du
  motif} · contour et décor restent visibles » + bouton **Terminer** orange) — comparer à la maquette
  (`Editeur Gravure.dc.html` l.421-427). Le liseré orange autour du canevas est bien visible (avant :
  bleu).
- [ ] En bas de l'écran, la **barre d'outils** a le nouveau look clair (fond blanc cassé, bord fin,
  ombre portée, coins arrondis) — comparer à la maquette (l.397-411). Les 5 boutons **Pinceau / Gomme /
  Ligne / Rectangle / Cercle** ont chacun une icône + un petit libellé sous l'icône.
- [ ] Le bouton **Lasso** est bien présent dans la même barre (à droite des 5 précédents, absent de la
  maquette mais requis — D-013 pt 2) : cliquer dessus l'active comme avant (tracé lasso fonctionnel).
- [ ] Cliquer chaque outil : le bouton actif passe en fond orange clair + icône/texte orange (plus de
  bleu plein) ; un seul actif à la fois.
- [ ] Le bouton taille (ex. « 3 mm ») a le nouveau look (police mono, bordure fine) ; cliquer dessus
  ouvre toujours le popover complet (slider + 1/3/8 mm) — aucune fonction retirée malgré le look
  « cycle » de la maquette.
- [ ] Boutons **?** (aide) et **⚙** (tiroir) toujours présents dans la barre, fonctionnels comme avant
  (l'aide ouvre l'overlay reskiné ; ⚙ ouvre/ferme le tiroir, surligné en orange quand ouvert).
- [ ] **Annuler** / **Rétablir** : boutons texte sans fond ; **Terminer** (ex-« Sortir ») : bouton plein
  orange, à droite — cliquer ferme bien l'édition (identique au bouton Terminer de la pilule en haut).
- [ ] Ouvrir le **tiroir ⚙** : fond clair reskiné, tous les contrôles P9 présents selon l'outil actif —
  Pinceau : Rond/Pression/Plume/Ombrage + angle plume/dureté selon le mode + lissage ; Gomme : lissage
  seul ; Formes/Lasso : rien (comme avant). Bascule **« Doigt : navigue/dessine »** toujours visible et
  fonctionnelle en bas du tiroir, quel que soit l'outil.
- [ ] Tracer un lasso sur une portion du brouillon : la **mini-barre flottante** (Déplacer/Dupliquer/
  Effacer/✕) apparaît avec le nouveau look clair, toujours positionnée près de la sélection comme avant.
- [ ] Modifier le brouillon (pinceau) : le **bandeau vert** « Essai en attente / Appliquer / Jeter
  l'essai » apparaît en haut du canevas avec le nouveau style (vert cohérent avec la bannière « essais »
  de la barre supérieure) — Appliquer/Jeter fonctionnent comme avant.
- [ ] **Undo/redo d'édition** (bouton et geste 2/3 doigts iPad) : fonctionnent identiquement à avant la
  migration.
- [ ] **Mapping du trait à tout zoom** : zoomer/dézoomer pendant l'édition, tracer un trait au stylet à
  plusieurs niveaux de zoom → le trait apparaît exactement sous la pointe, sans décalage (non-régression
  du moteur de trait, non touché par cette session).
- [ ] Sortir de l'édition (Terminer, pilule ou barre) : la pilule et la barre disparaissent proprement,
  le canevas revient à son état normal (pas de résidu visuel).

## P10 · S5 — Panneau Export + zoom flottant + pastille d'aide + toast (T-146, 2026-07-07)

**Auto-validation :** ✅ `node test/run.js` vert (aucune géométrie touchée).
Dernier vestige de l'ancienne sidebar (`#sidebar`, section « Export & sauvegarde » seule) remplacé par
`#panel-export` (panneau coulissant du rail, mêmes ids/handlers). Zoom flottant (+/reset/−), pastille
d'aide canevas et toast (nouveau, non bloquant) ajoutés en incrustations DOM du canevas.

- [ ] Ouvrir `index.html` en `file://` : cliquer **Export** dans le rail (ou le bouton « Exporter » de
  la barre supérieure) → le panneau s'ouvre avec DPI (input number 50-1200), grille 2×2 Exporter SVG/
  PNG/JPEG/PDF A4, note d'orientation, séparateur, « Enregistrer sur cet iPad » (accent), Charger/Tout
  effacer — comparer à la maquette (`Editeur Gravure.dc.html` l.293-321).
- [ ] Exporter SVG/PNG/JPEG/PDF : chaque bouton télécharge bien le fichier attendu (comportement
  identique à avant la migration) **et** un petit toast sombre apparaît brièvement en haut du canevas
  (« SVG exporté », etc.), disparaît seul après ~2,5 s.
- [ ] Enregistrer / Charger un projet `.json` / Tout effacer : fonctionnent comme avant ; Enregistrer
  et Charger déclenchent aussi le toast.
- [ ] Avec des essais en attente (édition stylet non appliquée) : le bandeau vert compact « N essai(s)
  en attente » + « Tout appliquer » apparaît en haut du panneau Export (redondant avec la bannière
  pleine largeur de S2, mais fonctionnel) ; « Tout appliquer » applique bien tous les essais.
- [ ] Cliquer **Export** dans le rail alors que le panneau est déjà ouvert → il se referme (toggle
  standard, comme Motifs/Contour/Guides/Sélection) ; re-cliquer le bouton **Exporter** de la barre
  supérieure alors qu'un autre panneau est ouvert → force l'ouverture du panneau Export (comme
  « ✎ Modifier » force Sélection en S4).
- [ ] Zoom flottant bas-droite du canevas (+ / % / −) : **+** zoome, **−** dézoome, le label % au
  centre reflète toujours le zoom courant. Cliquer sur le label (reset) → revient à 100 % centré.
- [ ] Molette souris et pinch tactile (zoom existant) : toujours fonctionnels, **et** le label % du
  zoom flottant se met à jour en même temps (pas seulement via les boutons +/−).
- [ ] Pastille d'aide « Glisser un motif pour le déplacer · appuyer pour le sélectionner » visible en
  haut du canevas **au doigt/tablette** ; sur desktop avec souris (`hover:hover` + `pointer:fine`),
  elle doit être masquée (pas de doublon avec un éventuel comportement souris).
- [ ] Aucune erreur console au chargement (en particulier, pas de `TypeError` lié à un `#sidebar`
  disparu) ; le repli automatique de panneau à l'entrée en mode édition (comportement hérité,
  point de vigilance transmis par S3/S4) n'est pas dégradé par ce retrait.

## T-141 — Gomme live sur le corps initial : masquer l'instance réelle (2026-07-04)

**Auto-validation :** ✅ `node test/run.js` vert (aucune géométrie touchée).
Suite du fix « gomme n'effaçait pas le corps initial » (voir plus bas) : l'instance réelle
(`edit.node`) est maintenant masquée (`visible(false)`) à l'entrée en édition et restaurée à la
sortie, pour ne plus se voir en dessous du calque d'essai pendant la gomme.

- [ ] Entrer en édition sur un motif MOTIF (pas décor) → gommer une zone du corps initial → le trou
  apparaît IMMÉDIATEMENT (fond de page visible, pas la couleur du motif).
- [ ] Gommer un ajout vert → disparaît en live (non-régression).
- [ ] Sortir de l'édition sans rien faire → le motif réapparaît normalement (pas d'instance restée
  invisible).
- [ ] Sortir avec brouillon modifié → motif rendu avec le vert « en attente » (non-régression).
- [ ] « Appliquer » PENDANT l'édition → rester en édition, affichage cohérent ; puis sortir → motif
  visible.
- [ ] Autres instances du même motif : restent visibles pendant toute l'édition.

## Fix — section « Export & sauvegarde » repliable (post-P9, 2026-07-04)

**Auto-validation :** ✅ `node test/run.js` vert (aucune géométrie touchée).
Section ex-« Projet » (sticky bas de sidebar, D-012 pt 7) repassée en `<details class="advanced">`
repliable, renommée « Export & sauvegarde » — prenait trop de place en sidebar tablette. Le badge
`#draft-badge` déplie désormais la section avant de scroller vers elle.

- [ ] Sur tablette (sidebar ouverte), la section est repliée par défaut et n'occupe qu'une ligne
  d'en-tête « Export & sauvegarde », comme la section « Avancé ».
- [ ] Cliquer sur l'en-tête déplie/replie la section (chevron ▸/▾ cohérent avec « Avancé »).
- [ ] Avec des essais en attente, taper le badge du header déplie la sidebar **et** la section, puis
  scrolle jusqu'à elle (le contenu — DPI, boutons d'export, etc. — est visible sans clic supplémentaire).
- [ ] Les boutons (Exporter SVG/PNG/JPEG, PDF A4, Enregistrer, Charger, Tout effacer) fonctionnent
  normalement une fois la section dépliée.

## Fix — Import PNG décor à fond blanc opaque (D-009 extension, 2026-07-04)

**Auto-validation :** ✅ `node test/run.js` vert + vérif pipeline hors navigateur sur `decor hybride.png`
(seuillage → ImageTracer → parseSVG donne 1129 chemins / 179 k points au lieu d'un rectangle de 6 points).
**Bug d'origine (2 causes) :** un PNG aplati à fond **blanc opaque** se vectorisait en rectangle plein.
(1) seuillage sur l'alpha seul → tout l'opaque pris pour de l'encre ; (2) surtout, le fond était mis en
noir transparent `(0,0,0,0)`, or ImageTracer apparie par **distance RGB** (pas l'alpha) → fond classé
« noir ». Fix : encre = opaque **ET** sombre (lum < 200) → noir ; fond → **blanc**.

- [ ] Importer un PNG **fond blanc / trait noir** (le cas qui posait problème) → le décor vectorisé
  montre le trait réel, pas un rectangle plein.
- [ ] Importer un PNG **fond transparent** (export Procreate classique, cf. P6 · T2 ci-dessous) → toujours
  correct (non-régression du comportement D-009 d'origine).
- [ ] « Rafraîchir le décor… » avec un PNG fond blanc → même correction (fonction partagée).

## P9 · S9 — Dialogue custom + badge « essais en attente » (T-134)

**Auto-validation :** ✅ `node test/run.js` vert (aucune géométrie touchée).
Choix pris pendant l'exécution : `showDialog` implémenté en Promise réutilisable (`#modal-backdrop`/
`#modal`), fermeture au tap backdrop = valeur d'annulation. `guardPendingDrafts`, `deleteMotifFromLibrary`
et `hideBuiltin` passés en `async` ; tous leurs appelants sont des `onclick` (aucune valeur de retour
consommée ailleurs), donc conversion directe sans callback. Les `alert()` d'export/erreur (SVG/PNG/PDF,
vectorisation, DPI plafonné) sont **conservés tels quels** — pas de confirm/choix à faire, coût de
l'async non justifié pour un simple message, conformément à l'option laissée par le plan (§Étapes 4).
Tap sur le badge : ré-ouvre la sidebar si repliée puis scroll animé vers la section Projet (pas de
« Tout appliquer » direct, pour laisser le choix explicite).
- [ ] Sur iPad, avec des essais en attente : Exporter SVG/PNG/PDF ouvre le dialogue à 3 choix
  (« Appliquer et exporter » / « Exporter sans les essais » / « Annuler »), cibles ≥ 44 px, lisible en
  modale (pas d'empilement confus comme avec les `confirm()`).
- [ ] « Appliquer et exporter » applique bien tous les essais puis lance l'export normalement.
- [ ] « Exporter sans les essais » exporte sans appliquer (les essais restent en attente après).
- [ ] « Annuler » ferme le dialogue sans rien exporter ni appliquer.
- [ ] Tap sur le fond (backdrop) du dialogue = équivalent Annuler.
- [ ] Supprimer un motif (ou masquer un motif de base) ayant des exemplaires sur le plan : le dialogue
  custom (bouton rouge « Supprimer »/« Masquer » + « Annuler ») remplace le `confirm()` natif.
- [ ] Le badge « N essais » apparaît dans le header dès qu'un essai est en attente, disparaît à 0 ; tap
  dessus ouvre/déplie la sidebar et scrolle jusqu'à la section Projet.

## P9 · S8 — Gestes tap 2/3 doigts (Annuler/Rétablir) (T-133)

**Auto-validation :** ✅ `node test/run.js` vert (aucune géométrie touchée).
Choix pris pendant l'exécution : disqualification du tap sur mouvement par doigt (`starts` : Map
pointerId→position au contact, seuil 10 px) ET sur pinch avéré (`stage.on("touchstart")` 2 doigts
marque `moved = true`) — double garde-fou comme suggéré par le plan (§Étapes 4). Bornes 10 px /
250 ms reprises telles quelles du plan, à ajuster si le ressenti iPad le demande (cf. §Si bloqué).
- [ ] Sur iPad, en édition : tracer un trait puis taper rapidement à 2 doigts → le dernier trait est
  annulé (pas de trait parasite ajouté par le tap lui-même).
- [ ] Taper à 3 doigts juste après → le trait annulé est rétabli.
- [ ] Faire un pinch-zoom (2 doigts, avec déplacement net) : aucun Annuler ne se déclenche.
- [ ] Faire un pan à 2 doigts (translation sans écart significatif de distance) : vérifier qu'aucun
  Annuler intempestif ne se déclenche (cas limite mentionné en §Si bloqué du plan).
- [ ] Poser puis lever 2 doigts très lentement (> 250 ms) : aucun Annuler ne se déclenche (hors
  fenêtre de temps).
- [ ] Sortir puis rentrer en édition sur un autre motif : les gestes tap fonctionnent toujours (pas
  d'état résiduel de la session précédente).

## P9 · S7 — Priorité stylet + zoom-to-fit + indicateur de mode (T-132)

**Auto-validation :** ✅ `node test/run.js` vert (aucune géométrie touchée).
Choix pris pendant l'exécution : cadrage animé via `Konva.Tween` sur `stage` (200 ms, `EaseInOut`),
marge de 10 % de chaque côté (bbox du motif pris relatif à `mainLayer`, insensible au pan/zoom courant).
Le contact touch pendant un trait pen est totalement ignoré (ni pan, ni dessin doigt), pas seulement
empêché de paner — cohérent avec l'objectif de priorité et sans effet de bord identifié. Le 2ᵉ contact
(annulation) reste vérifié avant la règle de priorité, donc toujours actif.
- [ ] Sur iPad, tracer un trait Pencil puis poser un doigt de l'autre main pendant le trait en cours :
  la vue ne bouge plus (pan bloqué) et le trait continue normalement sous le stylet.
- [ ] Poser un 2ᵉ doigt pendant un trait pen (main qui tient la tablette comprise) : le trait est
  toujours annulé comme avant (pas de régression sur le pinch-annulation).
- [ ] Entrer en édition sur un petit motif et sur un grand motif : la vue se recentre et zoome à chaque
  fois sur le motif édité (marge visible autour), avec une petite animation.
- [ ] Sortir de l'édition : la vue revient exactement à son cadrage d'avant (même zoom/position qu'avant
  d'entrer).
- [ ] Le mode édition est visuellement évident (liseré bleu autour du canevas + bandeau « ✏️ {nom du
  motif} » en haut), et disparaît à la sortie.

## P9 · S6 — Actions lasso/brouillon flottantes + retrait des notes (T-131)

**Auto-validation :** ✅ `node test/run.js` vert (aucune géométrie touchée).
Choix pris pendant l'exécution : mini-barre lasso positionnée **une seule fois à l'ouverture** de la
sélection (bbox de `edit.lasso.inside`, sans offset), ne suit pas le glissé manuel (option la plus
simple retenue par §Étapes 1 du plan).
- [ ] Sur iPad, en édition : tracer un lasso sur une portion du brouillon → une mini-barre (Déplacer/
  Dupliquer/Effacer/✕) apparaît juste au-dessus de la sélection, cibles ≥ 44 px.
- [ ] Glisser la sélection lassée : la mini-barre reste à sa position d'ouverture (comportement attendu,
  pas un bug).
- [ ] ✕ referme la sélection sans agir (équivalent Échap tactile).
- [ ] Modifier le brouillon (pinceau) → bandeau vert « Appliquer / Jeter l'essai » apparaît en haut du
  canevas ; Appliquer/Jeter le fait disparaître.
- [ ] Bouton « ? » dans la barre d'outils niveau 1 ouvre un overlay avec les 3 textes d'aide (formes,
  lasso, gestes) ; tap n'importe où dans l'overlay le referme.
- [ ] La palette d'édition (tiroir ⚙) n'a plus de pavés de texte permanents.

## P9 · S3 — Sonde Pencil Pro (twist/altitude/azimuth/tangentialPressure)

**Auto-validation :** ✅ HTML valide, aucune erreur console attendue.
- [x] Thibault sur iPad Pro + Pencil Pro : ouvert `http://<ip-locale>:8000/test/pencil-probe.html`
  (via `python -m http.server`, `file://` insuffisant pour les pointer events pen).
- [x] Roulé/incliné le Pencil, bilan copié → voir gate T-138 ci-dessous.

## P9 · S11 · gate T-138 — Verdict Pencil Pro (2026-07-04)

**Bilan sonde (iPad + Pencil Pro réel) :** tout vert sauf `coalesced > 1`, `twist ≠ 0`,
`twist varie`, `tangentialPressure varie` (rouges). `altitude varie` et `azimuth varie` : verts.

- **Twist (barrel roll) → NO-GO T-139.** Le Pencil Pro sur cet iPad n'expose pas de rotation
  exploitable à Safari (`twist` figé). **S11 abandonnée** : pas de mapping twist→angle de plume,
  le slider `#calli-angle` reste seul contrôle. Le hover atténué (bundlé dans T-139) n'est pas
  livré non plus (même tâche).
- **Altitude (inclinaison) → GO T-140.** `altitudeAngle` varie bien à l'inclinaison du stylet.
  **S12 lancée directement** (sans passer par S11 — pas de conflit de code, S12 ne touche pas les
  lignes que S11 aurait modifiées).

Statuts mis à jour : `plans/P9/S11.md` (T-138 → [x] tranché no-go/go mixte, T-139 → abandonnée),
`plans/P9/index.md`.

## P9 · S12 — Mode « ombrage » par inclinaison Pencil (T-140)

**Auto-validation :** ✅ `node test/run.js` vert (aucune géométrie touchée, `variableStroke` déjà
couvert). Smoke Node (script ad hoc, non conservé) : radii dérivés d'altitudes de test
(π/2 → 0.05 rad) via la fonction de mapping → `ML.variableStroke` retourne un polygone non vide.
Choix pris pendant l'exécution : mapping linéaire `altitude→largeur` (pas de gamma réglable comme la
pression), borne basse fixe `SHADE_MIN_FRAC = 0.2` (pas de nouveau slider, conforme au plan) ;
fallback trait constant (`ML.strokeToPolygon`, mode courant) dès que `edit.drawingPointerType !==
"pen"` ou qu'une inclinaison de la passe n'est pas finie (capteur absent/instable) ; gomme insensible
comme les autres modes variables.

- [ ] Sur iPad + Pencil Pro, mode Ombrage actif : coucher le stylet élargit le trait, le redresser
  l'affine, en continu.
- [ ] Les autres modes (Rond/Pression/Plume) restent inchangés ; bascule entre modes cohérente.
- [ ] Gomme en mode Ombrage : largeur constante (insensible à l'inclinaison), comme en Pression/Plume.
- [ ] Au doigt/souris (pas de Pencil) : trait à largeur constante, pas de tremblement ni d'erreur.
- [ ] Curseur d'outil : cercle à la taille réelle (`sizeMm`), pas de comportement différent de Rond.

## P9 · S2 — Ancres/pastille compensées + gains HTML

- [ ] T-127 — iPad : zoomer/dézoomer (molette + pinch) → ancres et pastille gardent une taille
  confortable au doigt à tout zoom ; le déplacement via la pastille reste précis.
- [ ] T-128 — iPad : taper dans un champ numérique ouvre le pavé décimal ; sélectionner un motif →
  Dupliquer visible dans la palette flottante et fonctionnel.

## P8 · impression A4

- [ ] le bouton produit un PDF ; page 1 = page de garde avec plan d'assemblage cohérent ;
- [ ] nombre de feuilles et orientation plausibles pour le pattern courant ;
- [ ] imprimer 2 feuilles voisines à 100 % : la règle fait exactement 100 mm à la règle métal ;
- [ ] les croix de bord de l'une se superposent aux croix intérieures de l'autre, motifs continus
  au raccord ;
- [ ] contour guitare en pointillés, surfaces gris clair + contours nets dans la couleur du calque,
  orientation identique à l'écran (pas de miroir).

### Rendu aplat plein par défaut (2026-07-04)

Le PDF restitue maintenant le dessin au trait tel qu'à l'écran (aplat opaque couleur calque, sans contour).
Diagnostic vérifié hors navigateur (jsPDF + `pdftoppm` sur le projet réel), mais le rendu papier reste à
confirmer :

- [ ] « PDF A4 1:1 » → chaque tracé du décor est un **trait plein** dans sa couleur (pas de double contour
  creux) ; personnages/symboles idem dans leur couleur ; identique à l'écran.
- [ ] contour guitare toujours en pointillés, croix de recalage / règle 100 mm / page de garde inchangées.
- [ ] imprimer 1 feuille et vérifier que le trait plein se décalque/pyrograve bien (lisibilité, encre).

## Lot 5 — bibliothèque de base (site déployé Vercel)
- [ ] Les grilles Personnages/Symboles listent les motifs des dossiers ; les vignettes se dessinent au défilement.
- [ ] Clic sur un built-in → instance posée.
- [ ] « × » sur un built-in → masqué, et toujours masqué après rechargement de la page.
- [ ] « Restaurer la bibliothèque de base » → tout revient.
- [ ] Éditer au stylet un built-in → rechargement conserve l'édition ; `git status` propre côté `exemple motif/`.

## Édition stylet — tactile (tablette réelle)
- [ ] Pinceau / gomme / formes / lasso au doigt et au stylet ; pression et plume calligraphique.
- [ ] Palette flottante visible en mode édition, cibles ≥ 44 px.

## Correctifs à confirmer
- [ ] iPad : fond visible hors mode édition (régression cache Konva corrigée via `safeCache`).
- [ ] Décor : tient dans le contour, cliquable/déplaçable (poignées du Transformer visibles).

## P7 · T14 — Undo par commandes + keyframes + Rétablir

- [ ] 12 traits puis 12 Annuler → retour exact à l'état d'entrée (traverse les keyframes) ; puis 12
  Rétablir → retour à l'état final.
- [ ] Annuler ×2 puis un nouveau trait → Rétablir grisé (branche redo bien invalidée).
- [ ] Lasso Déplacer puis Annuler → la portion revient à sa place ; Rétablir → re-déplacée.
- [ ] Sur décor chargé : Annuler reste réactif (< ~1 s) après une longue session de traits.

## P7 · T13 — Ops localisées + surcharge verte incrémentale

- [ ] Sur un décor chargé : la fin de trait (lever du stylet) ne gèle plus l'interface.
- [ ] Le vert reste exact : pinceau hors du réel = vert ; pinceau sur du réel = pas de vert ; gomme
  sur du vert = le vert disparaît ; après Annuler (undo), le vert correspond toujours au delta réel.
- [ ] Lasso Déplacer/Dupliquer/Effacer : le vert reste cohérent après l'action.
- [ ] Appliquer : tout le vert disparaît ; Jeter : le brouillon revient au réel sans vert.
- [ ] Comparer visuellement un même enchaînement de traits avant/après la tâche sur un petit motif :
  rendu identique.

## P7 · T11 — Cache bitmap du brouillon entre les traits

- [ ] Sur un décor chargé, en édition : l'aperçu pendant le trait est nettement plus fluide qu'avant ;
  après le lever, le trait fusionné apparaît correctement (pas de bitmap vide ni de décalage).
- [ ] Gomme, formes, lasso (surlignage orange et glissé) : rendu inchangé.
- [ ] Zoomer fort pendant l'édition : le brouillon peut être un peu plus doux (bitmap), mais jamais
  absent ni tronqué (garde `safeCache` iOS).

## P6 · T1 — Verrou global du décor (bascule 🔒)

- [ ] Verrou ON : impossible de sélectionner/déplacer/éditer le décor ; un motif posé au-dessus du
  décor reste sélectionnable (le clic traverse le décor verrouillé).
- [ ] Verrou OFF : le décor redevient sélectionnable/déplaçable/éditable normalement.
- [ ] Verrouiller pendant que le décor est sélectionné → il se désélectionne. Verrouiller pendant
  l'édition (stylet) d'un décor → on sort de l'édition.
- [ ] Enregistrer le projet avec verrou ON → recharger : l'état verrou est restauré (libellé du
  bouton 🔒/🔓, `aria-pressed`, et comportement effectif inchangés après rechargement).

## P6 · T2 — Import décor PNG vectorisé en interne (ImageTracer vendored)

- [ ] Importer un PNG de décor Procreate (« Importer décor (PNG)… ») → une vignette apparaît dans la
  bibliothèque Décor ; l'ajouter au plan → le trait vectorisé ressemble au dessin d'origine, en une
  seule couleur (couleur focale décor).
- [ ] Fichier illisible / image vide / tracé sans encre détectée → message d'erreur propre (`alert`),
  pas de crash, overlay « Import en cours… » ne reste pas bloqué affiché.
- [ ] `file://` (double-clic sur `index.html`, sans serveur) : l'import PNG fonctionne (ImageTracer
  chargé en `<script>` vendored, pas de dépendance réseau).
- [ ] PNG de grande résolution (> 2000 px de côté) : le tracé reste raisonnablement rapide (pas de gel
  du navigateur), l'image est mise à l'échelle proportionnellement avant vectorisation.

## P6 · T3 — Bouton « Rafraîchir le décor » (remplacement sur place depuis PNG)

- [ ] Poser un décor, le déplacer/redimensionner ; « Rafraîchir le décor… » avec un PNG modifié →
  le trait change **sans** que l'exemplaire bouge (position/échelle/rotation/z-order conservés).
- [ ] Deux décors différents sur le plan → le rafraîchissement vise bien le décor sélectionné (et,
  s'il n'y en a qu'un seul posé, aucune sélection nécessaire).
- [ ] Aucun décor dans la bibliothèque → message clair (« Sélectionne d'abord le décor à
  rafraîchir. »), pas de crash.
- [ ] Un décor avait des retouches stylet (`motif.surface`) → après rafraîchissement, elles sont
  écrasées par le nouveau tracé (attendu, cf. `DECISIONS.md` §D-009).

## P7 · T1 — Garde l'export CommonJS final de `vendor/clipper.js`

- [ ] Ouvrir l'app (console navigateur) : **aucune** `ReferenceError: module is not defined` au chargement.
- [ ] Les tests Node (`node test/run.js`) passent vert (export CommonJS toujours fonctionnel).

## P7 · T2 — CSS tactile iPad (repli sidebar, lib-del, 100dvh, touch-action)

- [ ] Desktop fenêtre large (> 900 px) : le bouton ☰ replie/déplie la sidebar ; « Entrer en édition »
  replie automatiquement, « Sortir » restaure.
- [ ] iPad paysage : idem ; le bas de l'app (section Projet) n'est pas masqué par la barre Safari.
- [ ] iPad : le × des vignettes de bibliothèque est visible sans survol ; pas de zoom page au double-tap
  sur les boutons ; pas de loupe à l'appui long sur le canevas.

## P7 · T3 — Un 2ᵉ contact annule le trait en cours (tablette)

- [ ] En édition : commencer un trait, poser un 2ᵉ doigt → **aucune** marque appliquée, le pinch
  zoome/panne normalement ; relever les doigts → aucun trait résiduel.
- [ ] Même test avec Rectangle en cours et avec un tracé de lasso en cours → annulés proprement.
- [ ] Une sélection lasso déjà fermée (surlignée orange) **survit** à un pinch.

## P7 · T5 — Tracé d'édition en Pointer Events natifs

- [ ] Desktop souris : pinceau, gomme, ligne (+Maj), rectangle (+Maj), ellipse, lasso (tracé, glissé,
  3 actions), annulation par trait — comportement identique à avant.
- [ ] iPad : un doigt dessine (comme avant, T6 changera ça), deux doigts pan/zoom sans marque ;
  Pencil dessine ; tirer le centre de notifications pendant un trait (`pointercancel`) → pas de marque.
- [ ] Sortir puis re-rentrer en édition : le tracé fonctionne toujours (listeners bien détachés/rattachés).

## P7 · T6 — Stylet dessine, doigt navigue (+ bascule « dessin au doigt »)

- [ ] iPad : Pencil dessine ; un doigt panne la vue (aucune marque) ; deux doigts zooment (inchangé).
- [ ] Bascule « ✍️ Doigt : navigue » → « Doigt : dessine » → le doigt trace de nouveau (ancien
  comportement) ; rebasculer → le doigt panne à nouveau.
- [ ] Paume posée pendant un trait Pencil (2ᵉ contact) → pas de marque parasite, le trait Pencil en
  cours saute proprement à `pointercancel` (T3/T5), jamais de fragment appliqué.
- [ ] Desktop souris : dessine, rien ne change (comportement identique à T5).

## P7 · T7 — Points coalescés + prédits + décimation du trait

- [ ] iPad : un trait rapide en courbe est lisse (pas de segments anguleux) ; l'aperçu colle mieux à
  la pointe du Pencil ; un trait lent ne « vibre » pas plus qu'avant.
- [ ] Mode Pression : traits rapides fluides, pas de gel à la fin du trait plus long qu'avant.
- [ ] Desktop : aucun changement perceptible.

## P7 · T8 — Curseur d'outil (taille réelle) + survol Pencil

- [ ] Desktop souris : le cercle suit le pointeur en mode édition ; son diamètre correspond exactement
  au trait posé (Pinceau), à deux zooms différents.
- [ ] Il devient rouge en Gomme ; en mode Plume, le curseur est un nib incliné qui suit le slider d'angle.
- [ ] Outils ligne/rectangle/ellipse : réticule en croix ; lasso : point.
- [ ] iPad M2+ : le cercle apparaît en **survol** du Pencil avant tout contact avec la vitre ; il ne
  s'affiche jamais au doigt (bascule « dessin au doigt » incluse).
- [ ] Le curseur disparaît en sortant du mode édition (aucun résidu) et à la sortie du conteneur du
  canevas (`pointerleave`).
- [ ] Si le survol Pencil n'émet aucun `pointermove` sur l'iPad de test (bilan sonde T4 négatif) :
  noter ici que seul le curseur pendant-le-tracé + souris a été livré.

## P7 · T9 — Courbes de pression + largeur minimale

- [ ] iPad, mode Pression : Douce = trait épais dès l'effleurement ; Ferme = il faut appuyer pour
  épaissir ; Normale = comme avant. Largeur min 0 % : un trait léger devient très fin.
- [ ] La gomme garde une largeur constante quelle que soit la pression.
- [ ] Souris : trait de largeur moyenne constante (pression 0.5), pas de régression.

## P7 · T10 — Stabilisation de trait réglable (EMA)

- [ ] Off (par défaut) : comportement identique à avant.
- [ ] Fort, à fort zoom : un trait volontairement tremblé sort nettement plus régulier ; le trait se
  termine bien sous la pointe (pas de « queue » qui s'arrête avant le lever).
- [ ] Le lasso et les formes ne sont pas affectés par le réglage.

## P9 · S10 — Projet sticky + PWA (manifest, safe-area)

- [ ] T-135 : sur iPad, scroller la sidebar (bibliothèque longue) → la section **Projet**
  (Exporter/Enregistrer) reste visible en bas sans dérouler jusqu'au bout.
- [ ] T-135 : sidebar repliée (`#app.collapsed`) → rien ne dépasse, aucun résidu visible.
- [ ] T-136 : sur iPad, « Ajouter à l'écran d'accueil » → l'app se lance en plein écran (sans barre
  Safari), icône et nom corrects sur l'écran d'accueil.
- [ ] T-136 : en paysage (notch/coins arrondis), le header et les barres flottantes d'édition ne sont
  pas masqués par les zones sûres.
- [ ] T-136 : ouverture normale en `file://` et via URL statique — aucune erreur console, comportement
  inchangé (manifest ignoré sans incidence).

## P10 · S7 — Responsive / PWA / safe-area

- [ ] iPad portrait : ouvrir chacun des cinq panneaux ; le panneau flotte après le rail, le canevas reste
  visible et aucune commande ne sort de l'écran.
- [ ] iPad paysage en mode standalone : topbar, rail, zoom, barre de sélection, barre d'édition, toast et
  pilule d'édition restent hors encoche/coins arrondis/home indicator.
- [ ] Barre Sélection puis barre Édition : faire défiler horizontalement jusqu'aux dernières actions ;
  toutes les cibles restent au moins à 44 px et aucune action n'est inaccessible.
- [ ] Desktop souris : panneaux, molette, raccourcis clavier et boutons Export restent fonctionnels ; la
  pastille d'aide tactile et le badge iPad redondant ne sont pas affichés.
- [ ] Ajouter à l'écran d'accueil : nom « Motif Layout », icône, surface claire au lancement et affichage
  standalone cohérents.
- [ ] Ouvrir directement `index.html` en `file://` : polices IBM Plex locales, application complète,
  aucune requête réseau ni erreur console liée à un identifiant DOM retiré.

## Fix 2026-07-04 — Gomme n'efface pas le corps initial en direct

- [ ] En édition, gomme sur le **corps initial** du motif (pas seulement un trait ajouté) : la zone
  disparaît **immédiatement** sous le stylet, pas seulement à la sortie d'édition.
- [ ] Effacer un **bord** du motif : la silhouette blanche (fond « sticker ») rétrécit en direct.
- [ ] Effacer un morceau **intérieur** d'un motif plein : la zone passe au blanc du corps (cohérent
  avec le rendu après Appliquer), pas de résidu de couleur.
- [ ] Les traits **ajoutés** (pinceau) s'effacent toujours correctement (pas de régression).
- [ ] Annuler/Rétablir après un effacement : le fond blanc suit l'état reconstruit.
- [ ] Décor (si édité déverrouillé) : effacement du corps encore visible seulement à la sortie
  (limite connue, fond figé pour la perf) — vérifier qu'il n'y a pas de ralentissement.
- [ ] Motif normal : pas de ralentissement perceptible pendant le tracé (fond recalculé une fois
  par trait, pas par frame).

## Fix 2026-07-04 — Stylet dessine ET déplace en même temps (conflit pan/tracé)

- [ ] iPad, en édition : pincer-zoomer à deux doigts, relâcher, puis dessiner au stylet sans lever le
  regard vers un autre geste → le trait suit le stylet sans que la vue ne glisse en même temps.
- [ ] Idem après un contact parasite à deux doigts (ex. paume posée un instant) pendant l'édition.
- [ ] Le pan un doigt (mode navigue) et le pinch-zoom deux doigts restent inchangés en édition.
- [ ] Hors édition, le pan un doigt natif Konva fonctionne toujours normalement après un pinch-zoom.

## 2026-08-02 — Banque de motifs complète + sélecteur en galerie (prototype `test/branches.html`)

Fait et vérifié sans navigateur : `node test/branch-proto-check.js` vert, JS de la page contrôlé à
la syntaxe, planche-contact des 42 cartes rendue depuis les axes de la banque
(`test/banque-planche.png` — c'est le tracé exact des vignettes du sélecteur).

À vérifier à l'œil, dans la page :

- [ ] Le bouton « Motif » du panneau Semis montre la vignette + le nom du motif courant.
- [ ] Un appui ouvre la galerie plein écran ; « Fermer », un clic hors grille ou Échap la referment.
- [ ] Les puces de famille (Feuilles / Fleurs / Vrilles / Champignons / Radicelles / Composants) et
      d'état (Organique / Hybride / Électronique) filtrent bien, et se cumulent avec la recherche.
- [ ] Les cartes sous la taille de semis courante sont grisées et affichent « ≥ N mm » en orange —
      elles restent sélectionnables (c'est un avertissement, pas un interdit).
- [ ] Le choix d'une carte referme la galerie et redessine ; le motif semé est bien celui montré.
- [ ] Au stylet sur iPad : la grille défile, les puces se touchent sans effort, la galerie ne
      bloque pas le tracé une fois refermée.

Points à trancher côté illustrations (rien à corriger dans le code) :

- [ ] `Champignon plat` hybride et organique se ressemblent trop sur la planche — la colonisation
      électronique ne se lit pas. Idem, à un moindre degré, pour `Champignon grappe` et `touffe`.
- [ ] `Vrille double hybride` était déjà en base sous ce nom : le fichier `92e90705-….png` du
      nouveau lot en est un doublon exact, il a été écarté.

## 2026-08-02 (soir) — Manières de poser les motifs

Défaut relevé sur `branches(11).svg` : les composants étaient semés **comme des feuilles**, en
oblique et décalés à côté de leur piste, sans y être raccordés ; plusieurs étaient posés très
sous leur taille lisible.

Chaque motif porte désormais une **manière de poser**, et le banc `node test/banc-poses.js`
(+ `python test/branch-proto-render.py`) la vérifie à l'image :

- [ ] `dans la ligne` — résistance, bobine, condensateur axial : la piste **traverse** la pièce,
      qui est centrée dessus et dans son sens. Ses pattes ne sont pas dessinées : la piste
      les remplace.
- [ ] `en nœud` — puce DIP/QFP : centrée sur la piste, qui aboutit dessus.
- [ ] `debout dessus` — condensateur céramique, tube, champignon : planté perpendiculairement.
- [ ] `au bout` — vrille, radicelle : au bout de l'axe, dans son prolongement, **une seule fois**
      même si on sème sur toute la longueur.
- [ ] `sur le côté` — feuille, fleur : inchangé, angle libre.
- [ ] Un motif trop petit pour rester lisible n'est plus posé du tout (le condensateur
      électrolytique, qui demande 46 mm, est écarté à 26 mm — c'est voulu).
- [ ] Dans le sélecteur, chaque carte annonce sa manière de poser sous son nom.

## 2026-08-02 — Personnages : prompts kodama + korok

20 prompts ajoutés à `reference/prompts-motifs.html` (5 postures de kodama et 5 masques de
korok, chacun en classique et en hybride électronique). Ils remplacent les bibliothèques
`exemple motif/Personnages` et `Symboles`, qui sortent du projet — **rien n'a été supprimé**,
c'est ta décision à prendre.

À vérifier au fil des générations :

- [ ] Aucun aplat noir sauf les trous d'yeux/bouche du kodama. Tes références de korok
      (Korok 4, 5, 9, 10, 11) sont pleines de noir et de hachures : ni pyrogravables à la main,
      ni exploitables par l'extraction d'axes. Les prompts l'interdisent explicitement.
- [ ] Intérieur clairsemé : posé à 4 cm, un personnage chargé devient un pâté. Contrôle avec
      la taille minimale annoncée par `tools/build-motif-bank.py` après extraction.
- [ ] Le personnage repose bien sur le BAS du dessin (il se pose debout sur la branche).
- [ ] Le trio de kodama compte comme un seul motif : il se pose d'un bloc.

Une fois les images générées : les déposer dans `reference/personnage/`, puis
`python tools/motif-axes.py "reference/personnage" -o "reference/personnage/axes"` et
`python tools/build-motif-bank.py`. Le pipeline les classe déjà en famille `personnage`,
pose « debout dessus », et accepte « classique » comme synonyme d'organique.

## 2026-08-02 (nuit) — Poses impossibles, recouvrement, chaînage

Trois défauts relevés sur `branches(12).svg`, plus deux demandes d'interaction.

**19 motifs sur 42 étaient impossibles à poser** à la taille par défaut : un plafond
d'agrandissement les refusait *en silence* — on cliquait, rien n'apparaissait. Une pose
demandée n'est plus jamais refusée : elle est agrandie jusqu'à rester lisible, et la ligne
d'état l'annonce. Seule la garniture automatique d'une liane garde ce plafond.

- [ ] Choisir n'importe quel motif du sélecteur et le poser : il apparaît toujours.
- [ ] Sous la taille minimale, l'état annonce « sera agrandi à N mm » avant la pose.
- [ ] Les motifs écartés faute de place sont comptés dans l'état (avant, ils disparaissaient
      sans rien dire).

**Les motifs étaient ancrés sur l'AXE de la branche**, donc à moitié avalés par le ruban —
d'autant plus que la branche est épaisse. Ils sortent maintenant jusqu'à l'écorce.

- [ ] Un champignon sur une gros tronc pousse de la surface, pas du cœur du bois.
- [ ] Les poignées d'édition tombent bien sur le motif dessiné (même calcul de pose).

**Le décor se voyait à travers les motifs** : la silhouette ne couvrait que les traits, pas
l'intérieur. Elle est maintenant pleine.

- [ ] Poser une grande feuille ou une puce à cheval sur une branche : le bois est masqué,
      l'écorce s'arrête au bord du motif.

**Chaînage.** Une pièce en ligne (résistance, bobine, condensateur axial) ou en nœud (puce)
offre une borne libre à chaque bout : un tracé qui y démarre s'y recale. Un motif qui se pose
sur un support (champignon, feuille, vrille, radicelle) n'en offre aucune — son pied est déjà
pris.

- [ ] Les bornes libres apparaissent en vert quand un outil de tracé est actif.
- [ ] Démarrer une piste sur une borne : elle s'y raccorde sans blanc entre la pièce et la ligne.
- [ ] Enchaîner branche → résistance → piste → radicelle se fait d'un trait.
- [ ] Un champignon n'affiche aucune borne.

Bancs : `node test/banc-motifs.js [taille]` balaie les 42 motifs (42/42 posables à 12, 18, 26
et 40 mm) ; `node test/banc-poses.js` couvre les 5 manières de poser et construit la chaîne.

## 2026-08-02 — Composants au bout des lignes, radicelles à l'envers

Deux défauts relevés sur `branches(13).svg`.

**Les pièces insérées dans une ligne flottaient au bout.** Une résistance ou une puce posée
près d'une extrémité y laissait la moitié de son corps dans le vide, sans rien à raccorder.
Elles sont maintenant reculées jusqu'à tenir entières sur leur support.

- [ ] Poser une puce ou une résistance tout au bout d'une piste : elle recule et la piste
      ressort des deux côtés.

**Les radicelles se posaient à l'envers.** Leurs images sources ont le moignon en HAUT, à
l'inverse de tous les autres motifs (tige en bas) : posées, elles rabattaient leurs racines
sur la branche. Les trois images ont été retournées (originaux conservés dans
`reference/radicelle/_original/`), les axes ré-extraits, et le prompt corrigé pour que les
prochaines générations sortent dans le bon sens.

- [ ] Une radicelle au bout d'une branche étale ses racines AU-DELÀ de la pointe, moignon
      soudé au bois.
- [ ] Si tu regénères des radicelles : moignon en bas, racines vers le haut.

## 2026-08-02 — Vérification pièce par pièce des composants

Question posée : chaque composant a-t-il été testé dans son emploi propre et son rendu vérifié ?
Réponse honnête : non — cinq manières de poser avaient été testées avec un représentant chacune,
pas les 16 pièces individuellement. `node test/banc-composants.js` le fait maintenant : chaque
pièce est posée dans son contexte (en ligne / en nœud / montée), rendue dans une case étiquetée,
et mesurée.

Corrigé dans le moteur :

- [ ] L'axe d'une pièce se déduisait de sa boîte englobante. Faux dès qu'elle est dessinée de
      biais, et la végétation d'un hybride gonfle la boîte. Le corps et son axe convergent
      maintenant l'un sur l'autre en deux passes : la bobine hybride et le condensateur
      électrolytique hybride se posent droit, ce qui n'était pas le cas.
- [ ] Un nœud reçoit bien plusieurs pistes : le banc en branche deux de plus sur les broches
      libres d'une puce, à vérifier à l'image.

**Quatre images à refaire** — c'est un défaut de dessin, aucun réglage du moteur n'y peut rien.
Le banc les nomme :

- [ ] `Bobine hybride` — dessinée 17° de biais.
- [ ] `Puce qfp hybride` — 25° de biais.
- [ ] `Resistance cms hybride` — 29° de biais ; c'est la plus visible, elle se pose en travers.
- [ ] `Condensateur electrolytique electronique` et `Condensateur ceramique electronique` —
      3 et 4 traits seulement : le corps se lit comme une capsule vide une fois posé.

Les prompts de la famille Composants ont été corrigés en conséquence : pièce dessinée droite
(corps exactement horizontal ou vertical), marques internes lisibles, et sur les hybrides la
végétation ne traverse plus le corps.

## 2026-08-02 — Pièces au bout des tiges, spires cassées par une piste

Deux défauts relevés sur `branches(14).svg`, tous deux reproduits puis verrouillés par un test.

**Une piste qui prolonge une liane cassait son enroulement.** La liane traitait cette piste
comme un obstacle à contourner : une spire parasite se posait au raccord (fenêtre 0,94–1,00
mesurée) et défaisait l'enroulement déjà en place. Une liane s'enroule autour du **bois** —
pas autour d'une piste de 3,5 mm, et surtout pas autour de celle qui la prolonge.

- [ ] Enrouler une liane sur un tronc, puis la prolonger par une piste : les spires ne bougent pas.
- [ ] La liane passe toujours derrière le bois une fois sur deux (l'exclusion des pistes ne
      doit pas avoir supprimé le masquage par le bois).

**Les pièces se posaient au bout des tiges au lieu de dessus.** Une résistance ou une bobine
a besoin de support visible de chaque côté, sinon elle a l'air accrochée dans le vide. On
réserve maintenant un quart de sa longueur de part et d'autre, en plus de son corps — et on
interdit la queue effilée d'une liane, qui n'est plus qu'un fil.

- [ ] Poser une résistance tout au bout d'une piste ou d'une liane : elle revient sur la tige.
      (Mesuré : demandée à t = 0,99, elle se pose à 0,88 sur une piste, 0,68 à 0,75 sur une liane.)

## 2026-08-02 — Personnages intégrés · composition à l'échelle de la table

**Kodama et korok en banque.** 20 images générées, extraites, mesurées : la banque passe à
72 motifs / 62 cartes. Taille minimale de pose **21 à 43 mm** — exactement l'échelle voulue sur
une table de 33 cm. Les kodama classiques sont les plus légers (21–28 mm), le korok
porte-feuille le plus lourd (43 mm, à cause de sa grande feuille).

**Défaut trouvé et corrigé : les visages de kodama disparaissaient.** Leurs yeux et leur bouche
sont des aplats noirs pleins ; l'extraction cherche des lignes médianes, et un disque plein n'en
a pas — il se réduisait à un point. `tools/motif-axes.py` détecte maintenant les aplats compacts
et les rend en CERCLE (ce qu'un pyrograveur remplit ensuite à la main). Correction générale :
elle vaut aussi pour les taches de chapeau de champignon et les marques de polarité.

- [ ] Vérifier sur `reference/personnage/axes/*_apercu.png` que chaque kodama a bien ses trois
      trous, et qu'aucun aplat parasite n'a été inventé ailleurs.
- [ ] `Kodama tete levee hybride` et `Kodama dos hybride` sortent un peu déformés du haut du
      crâne : à regénérer si tu les veux impeccables. Les 8 autres sont directement utilisables.

**Découpe au contour de la table.** Le moteur accepte `st.zone` : le décor est coupé au corps de
la guitare (défonces comprises) au moment du rendu, au lieu de brider le tracé. La végétation
peut donc venir mordre le bord comme sur la référence. Débordement mesuré : passé de 13 % à
moins de 1 % (résidu = quantification du masque à 4 px).

**Défaut trouvé et corrigé : un tap et un glissé n'étaient pas arbitrés pareil.** Un motif posé
d'un seul geste échappait à tout contrôle d'encombrement, et les motifs s'entassaient aux
fourches en composition complète. Deux niveaux désormais : `pose` (basculable, jamais écartée)
et `rythme` (écartable faute de place).

**Compositions complètes** (`node test/banc-compo.js [graine]`) : les interactions tiennent à
l'échelle — lianes enroulées, transition bois → piste, composants raccordés, personnages posés
debout. La RÉPARTITION, elle, n'est pas encore au niveau : le décor reste lourd à gauche et
laisse le lobe droit nu. C'est un problème de composition, pas de moteur.

## 2026-08-02 — Mode Générateur dans la palette d'édition (bascule Dessin/Générateur)

Ajoute au mode édition (`enterEdit`/`exitEdit`, `src/app.js`) un second mode « Générateur » qui
porte les outils Branche/Liane/Piste/Semer/Éditer + la galerie de motifs de `test/branches.html`
directement sur le motif en cours d'édition, dans `edit.draft` (mêmes coordonnées que le Dessin).
Nouveau fichier `src/generator-ui.js` (chargé après `app.js`), branché via un pont minimal
`window.EditHost` exposé en fin de `app.js` ; `window.GeneratorUI` est appelé en retour depuis
`enterEdit`/`exitEdit`/`editPointerDown|Move|Up`/`undoStroke`/`redoStroke`/`discardMotifDraft`,
toujours derrière `if (window.GeneratorUI)`.

**Auto-validation (sans navigateur) :**

- ✅ `node test/page-check.js` vert (prototype `test/branches.html`, non touché par cette tâche).
- ✅ Script ad hoc (non commité) : tous les `getElementById(...)` de `app.js`/`generator-ui.js`
  résolvent un `id` présent dans `index.html` (226 références, 192 ids, 0 orphelin).
- ✅ Simulation ad hoc (non commitée, avec les vraies libs ClipperLib/geometry.js/branch-engine.js) :
  scène → `BE.buildGeometry` → `BE.toContours` → fusion additive (`removed`/`added` contre le
  dernier merge) dans un brouillon `edit.draft` simulé. Vérifié : (1) les facteurs de conversion
  `k`/`invK` (app-px ↔ unité BE) sont bien inverses l'un de l'autre et donnent des dimensions mm
  plausibles (tracé de 200 px app = 50 mm → largeur de branche ≈ 57 mm, cohérent avec le tipLen/
  lissage) ; (2) une gomme manuelle simulée sur l'encre d'une 1ʳᵉ branche **survit** à la génération
  d'une 2ᵉ branche ailleurs dans la scène (le trou reste un trou, testé au sens *evenodd*, pas un
  `.some()` naïf qui aurait donné un faux positif) ; (3) supprimer une branche (outil Éditer) retire
  bien sa part d'encre du brouillon sans toucher au reste. `BE.toContours` a été livré par l'autre
  agent (branch-engine.js) **pendant** cette session — le repli explicite (`typeof BE.toContours
  !== "function"`) existe toujours dans `mergeSceneIntoDraft` mais n'est plus le chemin actif.
- ⚠️ Non vérifiable sans navigateur : rendu Konva réel (aperçu de tracé, poignées, occlusion
  « autocollant »), tactile/Pencil (priorité stylet, gestes 2/3 doigts avec la scène active),
  performance ressentie pendant un drag Éditer, look de la galerie/du sélecteur de motif dans le
  thème clair de l'app (portés depuis le thème sombre du prototype).

**Comment ça bascule (pour Thibault) :** deux gros boutons « ✏️ Dessin » / « 🌿 Générateur » en
tête de la palette d'édition. On peut alterner librement — la scène de branches (control points,
motifs posés) vit dans `generator-ui.js`, pas dans `edit.draft`, et survit à la bascule tant que
la session d'édition reste ouverte. Chaque geste terminé (fin de tracé, relâcher une poignée)
fusionne SEULEMENT ce qui a changé depuis la dernière fusion dans `edit.draft` (jamais toute la
scène d'un coup) : une retouche au pinceau faite entre deux passages au Générateur n'est donc pas
écrasée par la génération suivante, sauf si elle porte exactement sur la zone qu'une reprise
manuelle (Éditer : glisser une poignée, Supprimer) modifie ensuite. Annuler/Rétablir et Terminer
puis Entrer en édition à nouveau réinitialisent la scène de travail du Générateur (pas l'encre déjà
dans le motif) — cf. rapport pour le détail et le compromis assumé.

- [ ] Ouvrir `index.html`, entrer en édition sur un motif DECOR : la palette affiche en tête
      « ✏️ Dessin » (actif) / « 🌿 Générateur », gros boutons, un seul actif à la fois.
- [ ] Cliquer « 🌿 Générateur » : la barre d'outils bascule sur Branche/Liane/Piste/Semer/Éditer
      (icônes 🌳/🍃/⚡/🌱/🎯) ; Pinceau/Gomme/etc. et le popover de taille de trait disparaissent.
- [ ] Ouvrir le tiroir ⚙ en Générateur : outil Branche → un seul slider « Épaisseur de branche »
      (12,5 mm par défaut) ; Liane → « Calibre de liane » (3,3 mm) ; Piste → « Largeur de piste »
      (3,5 mm) ; Semer → « Taille de motif semé » (18 mm) + « Densité de garniture » (22 mm) et le
      sélecteur de motif (vignette + nom) ; Éditer → texte d'aide + Autre côté/Supprimer (grisés
      tant que rien n'est sélectionné). Aucun autre réglage visible (les ~15 curseurs du prototype
      restent à leur valeur par défaut, invisibles).
- [ ] Outil Branche : tracer un trait dans le cadre de la table (sur le motif édité) → une branche
      apparaît EXACTEMENT sous le tracé (même position/échelle que si on avait dessiné au pinceau
      au même endroit — pas de décalage ni de changement d'échelle).
- [ ] Tracer une 2ᵉ branche en partant du bord d'une branche existante → elle fusionne (aisselle),
      comme dans `test/branches.html`.
- [ ] Outil Liane puis Piste : même principe, calibre/largeur suivent le slider du tiroir.
- [ ] Outil Semer : ouvrir la galerie (bouton motif du tiroir) → recherche, puces famille/état,
      grille de vignettes fonctionnent (Échap ou tap hors carte referme) ; choisir un motif, taper
      sur une branche → il se pose ; glisser le long d'une branche → une file de motifs se sème.
- [ ] Outil Éditer : les poignées (petits ronds) des branches tracées et des motifs posés sont
      visibles ; glisser une poignée d'axe déforme la branche ; glisser la pointe d'un motif posé
      change sa taille/son angle, glisser son pied le fait coulisser le long de la branche ;
      « Autre côté » le fait basculer ; « Supprimer » le retire (ou retire la branche sélectionnée).
- [ ] Le décor généré est bien COUPÉ au bord de la silhouette du motif édité (une branche tracée
      pour déborder ne dépasse pas hors du motif, y compris une défonce/trou interne s'il y en a).
- [ ] Repasser en « ✏️ Dessin » : peindre/gommer par-dessus l'encre du Générateur avec le pinceau →
      fonctionne normalement. Revenir en « 🌿 Générateur » et ajouter une branche ailleurs → la
      retouche au pinceau précédente est toujours là (pas écrasée par la nouvelle génération).
- [ ] **Annuler**/**Rétablir** (bouton ou geste 2/3 doigts) : marche aussi bien sur un geste du
      Générateur que sur un trait au pinceau — la pile est commune, dans l'ordre chronologique réel.
- [ ] Terminer l'édition, revérifier le motif (hors édition) : l'encre du Générateur y est bien
      appliquée en couleur réelle (pas de résidu vert sauf si un essai reste en attente, comme pour
      le Dessin). Ré-entrer en édition sur le même motif : on repart en mode Dessin, sur une scène
      de Générateur neuve (les branches précédentes restent dans l'encre du motif, mais leurs
      poignées de retouche ne sont plus disponibles — limite assumée, cf. rapport §7).
- [ ] iPad/Pencil : un doigt navigue (pan), le stylet trace, comme en mode Dessin ; deux doigts
      zooment sans dessiner pendant un tracé Générateur en cours.
- [ ] Pas de gel perceptible en traçant une branche longue, ni en glissant une poignée Éditer sur
      une scène avec plusieurs branches déjà posées.

## 2026-08-02 — Porte d'entrée du Générateur (correctif)

**Défaut : sans décor, le mode Générateur était inatteignable.** Il vit dans l'édition d'un motif
de rôle DÉCOR ; sans décor importé, il n'y avait rien à sélectionner, donc aucun moyen d'y entrer.
C'est un manque du cahier des charges d'intégration, pas une faute du code livré.

Un bouton **« 🌿 Dessiner un décor (générateur) »** est ajouté au panneau Décor. Il fabrique un
décor vierge (aucune zone), le pose sur le plan de travail, déverrouille le décor si besoin,
sélectionne l'instance et ouvre l'édition directement côté Générateur.

- [ ] Projet neuf, aucun décor : le bouton ouvre l'édition en mode Générateur, prêt à tracer.
- [ ] Un décor existe déjà : le bouton le reprend au lieu d'en empiler un second.
- [ ] Décor verrouillé : le bouton le déverrouille (sinon l'édition refusait d'entrer sans rien dire).
- [ ] Le décor produit se découpe bien au contour de la table.

**Robustesse : l'édition ne dépend plus du Générateur.** Les crochets `setEditMode` et
`GeneratorUI.onEnterEdit/onExitEdit` sont sous garde. Sans elle, une erreur dans l'un d'eux
laissait `edit.active` à vrai *sans* que la palette s'ouvre : l'édition devenait inaccessible,
y compris pour un motif ordinaire, et le clic suivant sur « Éditer » appelait `exitEdit()`.

- [ ] Entrer en édition sur un personnage : la palette s'ouvre, mode Dessin actif.
- [ ] En cas d'erreur du générateur, la console la signale mais l'édition s'ouvre quand même.

## 2026-08-02 — Générateur remis en marche + ergonomie iPad (jugement à l'œil)

Le fonctionnel est vérifié au navigateur (cf. `STATUS.md`) : branche tracée, découpe au contour,
poignées, semis, Annuler. Ne restent ici que les points de **goût** et ceux qui demandent un vrai
Pencil :

- [ ] Poignées de l'outil Éditer : 22 px de diamètre constant à l'écran — attrapables au doigt sans
      viser, mais pas au point de masquer le dessin en dessous ? (à juger surtout au zoom fort).
- [ ] Bascule « ✏️ Dessin / 🌿 Générateur » compactée à gauche : encore assez visible, ou elle se
      perd maintenant à côté de la barre d'outils ?
- [ ] Galerie de motifs : le clavier ne monte plus tout seul. Reste-t-il facile de chercher au
      clavier quand on le veut (il faut taper dans le champ) ?
- [ ] Un décor tracé au Générateur puis retouché à la gomme en mode Dessin, puis repris au
      Générateur : le résultat reste-t-il celui qu'on attend, ou faut-il T-150 (gomme intégrée) ?
- [ ] Épaisseur de branche par défaut (12,5 mm) à l'échelle réelle de la table : juste, ou trop
      grosse une fois le décor complet ?
