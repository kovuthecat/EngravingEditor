# Motif Layout

Mise en page de motifs SVG (gravure laser) avec packing assisté, édition manuelle (zones REMPLI/VIDE, déplacement, rotation, échelle), **édition au stylet** (pinceau/gomme) et occlusion « autocollant » par surfaces.

## Lancer

**Double-clique `index.html`** (ou `Lancer.bat`). Aucune installation : tout est vendored.

> Si jamais le navigateur bloque le chargement local, sers le dossier : `python -m http.server` puis ouvre `http://localhost:8000`.

## Utilisation rapide

1. **Importer motifs SVG…** : charge tes motifs vectorisés à la bibliothèque (gauche, par rôle : personnages / symboles / décor). Clique une vignette pour en poser une instance.
2. **Charger contour SVG…** : la forme de la table. Le corps sert de zone de travail + clip ; les cavités/trous sont auto-détectés et réservés (affichés en fond gris).
3. **+ Zone interdite** : pose des rectangles sur les cavités/boutons (micros, électronique, etc). Rien n'y sera gravé et le packing les évite.
4. **Packing assisté** : disperse des motifs dans le contour pour démarrer.
5. **Édition manuelle** : clic = sélection (motif ou zone) ; poignées = rotation/échelle ; glisser = déplacer.
   - `Suppr` supprime · `Ctrl+D` duplique · `[` / `]` change l'ordre (z) · molette = zoom · glisser le fond = déplacer la vue.
6. **Édition au stylet** (optionnel) : sélectionner un motif → bouton « Entrer » (mode verrouillé) → pinceau/gomme pour retoucher la surface → bouton « Sortir » pour restaurer l'édition normale.
7. **Exporter SVG** : génère le pattern final (surfaces visibles uniquement, après occlusion, en mm, multi-couleur).

> **Échelle** : l'export inclut les dimensions réelles en mm (calibration). Si tu dois ajuster, fais-le dans ton logiciel laser.

## Utiliser sur tablette

L'outil fonctionne **sans build** et sans serveur. Déploie le dossier `motif-layout/` n'importe où et accède-le via une URL (local ou en ligne).

### Options de déploiement

1. **Locale (navigateur local)** :
   - Double-clic `index.html` (ou navigateur → `file://…`).
   - Ou servir le dossier : `python -m http.server` → `http://localhost:8000`.

2. **Hébergement statique (accès réseau / tablette)** :
   - Déployer sur **Netlify** : glisser-poser le dossier (« Netlify Drop »).
   - Ou **Vercel** : `vercel deploy`.
   - Ou **GitHub Pages** : pousser sur une branche, activer Pages.
   - Accéder depuis n'importe quel appareil via l'URL publique (pas d'installation, tout client-side).

### Interactions tactiles

- **Pinch-to-zoom** : deux doigts → zoom centré.
- **Pan deux doigts** : deux doigts simultanés → déplacer la vue.
- **Un doigt / stylet** : tracer, sélectionner, déplacer motif (pinceau/gomme en mode édition).
- **Molette / glisser-fond (desktop)** : inchangés, pas dégradation.

### Layout responsive

- **Desktop** : sidebar (gauche) + canevas (droite, full flex).
- **Tablette portrait** (< 900px) : bouton **☰** dans le header → repli/dépli de la sidebar.

## Raccourcis

| Action | Touche |
| --- | --- |
| Supprimer | `Suppr` |
| Dupliquer | `Ctrl+D` |
| Ordre +/- | `]` / `[` |
| Zoom | molette |
| Déplacer la vue | glisser le fond (1 doigt) ou 2 doigts (tactile) |

## Modèles de rôles

Chaque motif porte un rôle (détermine sa couleur de rendu / export) :

- **Personnage** (noir, `#000000`) : silhouette opaque avec fond blanc.
- **Symbole** (rouge, `#FF0000`) : détails rouges avec fond blanc.
- **Décor** (bleu, `#0000FF`) : arrière-plan avec vides « see-through » (pas de fond blanc) — les motifs au-dessus s'y détachent.

Voir `SPEC.md` (§Flux) pour les détails techniques complets.

## Bibliothèque de base

L'app embarque une bibliothèque de motifs de base (personnages/symboles) inlinée dans
`src/builtin-motifs.js`, générée depuis les dossiers `exemple motif/Personnages` et
`exemple motif/Symboles`. Pour ajouter/retirer un motif de base : déposer/supprimer le `.svg`
dans le dossier concerné, puis `git commit` (le hook régénère `src/builtin-motifs.js`
automatiquement) et `git push`. Installer le hook une fois : `sh tools/install-hook.sh`
(ou `tools\install-hook.bat` sous Windows).
