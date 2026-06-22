# PROJECT_BRIEF.md

## Objectif du projet

Outil de **mise en page de motifs SVG** sur une surface (d'abord la table d'une guitare électrique), en vue d'une **gravure laser**. Il combine un **packing assisté** (remplir une forme) et une **édition manuelle** fine (déplacer / tourner / redimensionner / ordre / rôles de zones), avec un modèle d'occlusion **« autocollant »** par surfaces : un motif au-dessus masque ce qui est dessous (pas de transparence). Sortie = un SVG couleur en mm (`fill-rule="evenodd"`), ne contenant que les surfaces réellement visibles. Le DXF (entrée et sortie) a été retiré le 2026-06-22 (`DECISIONS.md §D-004`).

Contexte créatif : pattern dense de doodles geek N&B, sans répétition, épousant la forme de la table. Voir le projet parent (assets + banque de motifs) dans `#Archives/Laser project/Gravure guitare/` (`MOTIFS.md`).

## Usage prévu

- Usage personnel : oui
- Usage local : oui (navigateur, aucune install)
- Déploiement prévu : non
- Utilisateurs autres que moi : non

## Fonctionnalités MVP

1. Importer des motifs SVG → bibliothèque (zones REMPLI/VIDE détectées automatiquement) ; charger un contour SVG (zone de travail + clip).
2. Édition manuelle : sélection, rotation/échelle (poignées), déplacement, duplication, suppression, z-order, rôles de zones (REMPLI↔VIDE).
3. Packing assisté : dispersion de N motifs dans le contour (point de départ).
4. Export SVG en mm avec **occlusion par surfaces** (seules les surfaces visibles, couleur + `evenodd`).
5. Enregistrer / charger un projet (JSON).

## Hors périmètre v1

- Vraie tuile répétable (seamless tileable) : inutile pour une pièce unique.
- Génération IA de motifs (décision : abandonnée, voir DECISIONS).
- Vectorisation intégrée (Thibault vectorise lui-même, en SVG depuis le 2026-06-22).
- Compensation de kerf, multi-feuilles : c'est le rôle de [[laser-tools]].

## Stack technique

- Frontend : **app web pure, sans build** — HTML + JS « classic script » + CSS.
- Canevas : **Konva.js** (vendored).
- Booléen géométrique : **Clipper** / `ClipperLib` (vendored).
- Backend : aucun. Base de données : aucune. Auth : aucune. Hébergement : aucun (file:// ou http local).
- Autres : Node pour les tests headless (`test/run.js`, flux SVG).

## Contraintes produit et techniques

- Simplicité prioritaire, faible coût, maintenabilité.
- **Doit tourner en `file://`** → pas d'ES modules, pas de framework, pas de bundler.
- Pas de dépendance lourde sans justification.
- Export SVG **correct en mm** (`viewBox`/`width`/`height` en mm, `fill-rule="evenodd"`) : critère non négociable (sécurité matière).

## Contraintes IA

Tâches courtes et ciblées ; 4 fichiers source seulement (`svg`, `geometry`, `app`, `style`). Workflow et répartition des modèles : voir `WORKFLOW.md`.

## Priorités

1. Fonctionnel  2. Simple  3. Maintenable  4. Documenté  5. Extensible si nécessaire

## Risques connus

- `src/svg.js` ne gère pas `<g transform="…">` : un SVG dont les `<path>` dépendent d'un tel wrapper (ex. exports `potrace` typiques) s'importe à une échelle absolue fausse (voir `STATUS.md`).
- Performance avec beaucoup d'instances (occlusion O(N) unions Clipper) — à surveiller au-delà de ~quelques centaines.
- Silhouette mal détectée si un motif n'a pas de contour extérieur fermé (fallback enveloppe convexe).

---

## Roadmap / jalons

### Vision

Un éditeur léger et réutilisable pour composer des patterns de gravure laser à partir de motifs SVG, au-delà du seul cas guitare.

### MVP

- [x] Import DXF motifs + contour, bibliothèque *(superseded 2026-06-22 par l'import SVG + zones, `DECISIONS.md §D-004`)*
- [x] Édition manuelle (déplacer/tourner/redim/z-order, dup/suppr)
- [x] Packing assisté (dispersion)
- [x] Export DXF mm avec occlusion *(superseded 2026-06-22 par l'export SVG couleur avec occlusion par surfaces, `DECISIONS.md §D-004`)*
- [x] Save/load projet

### Version 1

- [ ] Packing **cohérent** tenant compte des éléments physiques de la table (boutons/micros/sélecteur/jack) : zones interdites + points d'ancrage.
- [ ] Magnétisme / alignement, marge blanche « sticker » optionnelle.

### Version 2 / idées futures

- [x] Détection trous (outer/holes) pour silhouette plus fine *(fait 2026-06-22 : zones parent/depth/role, `DECISIONS.md §D-004`)*.
- [ ] Export par couches (trait vs remplissage) — décision : c'est Falcon qui choisit le mode par calque, pas l'outil (`DECISIONS.md §D-004`).

### Critères avant ajout de feature

Voir `CONVENTIONS.md` §Garde-fous. Une feature n'est ajoutée que si sa complexité reste proportionnée, se découpe en tâches ciblées, et se documente dans `PROJECT_MAP.md` / `SPEC.md`.

### À éviter pour l'instant

- Migration vers un framework / bundler (casserait le « sans build »).
- Génération IA.
