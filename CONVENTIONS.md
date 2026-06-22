# CONVENTIONS.md

## Architecture

### Priorités

1. Simplicité
2. Lisibilité
3. Maintenabilité
4. Testabilité
5. Extensibilité seulement si nécessaire

### Compatibilité IA

L'architecture doit favoriser :

- compréhension rapide du projet ;
- faible couplage ;
- isolation des features ;
- fichiers courts ;
- composants autonomes ;
- debug localisé ;
- modifications ciblées ;
- faible besoin de contexte global.

Une architecture légèrement moins "parfaite" mais plus facile à manipuler par les modèles est préférable.

### Organisation feature-first

Quand le projet grossit, privilégier une organisation par domaine fonctionnel :

```text
src/
  features/
    feature-a/
    feature-b/
    feature-c/
```

Chaque feature doit idéalement contenir : ses composants, ses hooks, ses types, ses utilitaires locaux, sa logique métier spécifique. Les dossiers globaux restent limités aux éléments réellement partagés.

### Règles

- Ne pas créer d'abstraction avant besoin réel.
- Préférer des fichiers courts.
- Nommer explicitement les fonctions.
- Éviter les dépendances lourdes.
- Documenter les décisions importantes.
- Distinguer clairement MVP et améliorations futures.
- Éviter les architectures nécessitant une compréhension globale permanente.
- Maintenir `PROJECT_MAP.md` quand l'organisation du projet évolue.

### Garde-fous

Avant d'ajouter une abstraction, vérifier :

1. Le besoin est-il réel maintenant ?
2. La duplication actuelle est-elle réellement problématique ?
3. L'abstraction réduit-elle la complexité ou la déplace-t-elle ?
4. Les modèles pourront-ils modifier cette zone sans charger beaucoup de contexte ?

---

## Git

### Règles

- Un commit = une intention claire.
- Relire le diff (`git diff`) avant de committer.
- Stager les fichiers concernés explicitement, pas `git add .` à l'aveugle.
- Utiliser des branches pour les expérimentations.
- Ne jamais committer de secret (`.env`, clés, tokens) — vérifier le diff.
- Pousser après chaque session validée.

### Format des messages

Verbe à l'impératif en anglais, court, une intention par commit.

```bash
git commit -m "Add recipe tag filtering"
git commit -m "Fix iPad PWA standalone display"
git commit -m "Refactor local storage service"
git commit -m "Update project context templates"
```

Préfixe optionnel de type si tu veux trier l'historique : `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`.

### Avant une session risquée

Partir d'un état propre pour pouvoir revenir en arrière facilement.

```bash
git status
git diff                       # relire ce qui n'est pas encore committé
git add <fichiers>             # ou git add -p pour stager par morceaux
git commit -m "Stable state before AI changes"
```

### Après une session validée

```bash
git status
git diff                       # relire avant de stager
git add <fichiers concernés>
git commit -m "Describe completed change"
git push
```

### Annuler / revenir en arrière

```bash
git restore <fichier>          # annule les modifs non stagées d'un fichier
git restore .                  # annule TOUTES les modifs non stagées (non récupérable)
git reset --hard HEAD          # ⚠ détruit tout le travail non committé, sans retour
```

> `git restore .` et `git reset --hard` sont destructifs : vérifier `git status`
> avant, et préférer un commit « stable state » plutôt que de tout jeter.

### Co-auteur Claude Code

Claude Code ajoute automatiquement une ligne `Co-Authored-By` à ses commits. Rien à faire manuellement.
