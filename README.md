# Motif Layout

Mise en page de motifs DXF (gravure laser) avec packing assisté + édition manuelle et occlusion « autocollant ».

## Lancer
**Double-clique `index.html`** (ou `Lancer.bat`). Aucune installation : tout est vendored.
> Si jamais le navigateur bloque le chargement local, sers le dossier : `python -m http.server` puis ouvre `http://localhost:8000`.

## Utilisation
1. **Importer DXF…** : ajoute tes motifs vectorisés à la bibliothèque (gauche). Clique une vignette pour la poser.
2. **Charger contour DXF…** : la forme de la table. Le corps sert de zone de travail + clip ; le plan complet (cavités, trous) s'affiche en **fond de référence gris**.
3. **+ Zone interdite** : pose des rectangles sur les cavités/boutons (micros, électronique). Rien n'y sera gravé et le packing les évite. (Les cavités ne sont pas auto-détectées : leur tracé DXF est fragmenté.)
4. **Packing assisté** : disperse des motifs dans le contour pour démarrer.
5. **Édition** : clic = sélection (motif ou zone) ; poignées = rotation/échelle ; glisser = déplacer.
   - `Suppr` supprime · `Ctrl+D` duplique · `[` / `]` change l'ordre (z) · molette = zoom · glisser le fond = déplacer la vue.
6. **Exporter DXF** : génère le pattern final (seuls les traits visibles, en mm).

> **Échelle** : l'export reprend l'échelle du DXF d'entrée. Si ton contour n'est pas aux dimensions réelles de la table, mets le DXF final à l'échelle dans ton logiciel laser.

## Raccourcis
| Action | Touche |
|---|---|
| Supprimer | `Suppr` |
| Dupliquer | `Ctrl+D` |
| Ordre +/- | `]` / `[` |
| Zoom | molette |
| Déplacer la vue | glisser le fond |

Voir `SPEC.md` pour les détails techniques.
