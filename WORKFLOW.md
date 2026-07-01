# WORKFLOW.md — Répartition modèles/effort et format des plans

Source unique pour la répartition du travail entre Opus, Sonnet, Haiku et Codex, et pour le
format des plans. Les autres fichiers y renvoient au lieu de le paraphraser.

## 1. Principe directeur

**Opus pense, les autres font.**

- **Opus** (cher) : design, cadrage, écrit les plans.
- **Sonnet** : exécute les tâches cadrées de complexité moyenne, juge le code, reprend là où Codex bloque.
- **Haiku** (rapide) : exécute les tâches cadrées et mécaniques.
- **Codex** (hors budget Claude) : exécute les gros lots cadrés et vérifiables.

Une fois le plan écrit, chaque exécutant lit **UNIQUEMENT** les fichiers listés dans sa tâche et ne reconçoit pas — le design est fixé.

## 2. Choix du modèle

| Nature de la tâche | Modèle | Exemples |
| --- | --- | --- |
| Design, bug non localisé, scope flou, transverse, arbitrage produit | **Opus** | Architecture, stratégie, cadrage neuf, plan multi-tâche |
| Cadré, jugement de code, localisé, complexité moyenne | **Sonnet** | Bug isolé, refactor limité, feature moyenne, code review |
| Cadré, mécanique, peu de jugement, petit | **Haiku** | Suppression/renommage, simplification, alléger la doc, petit boilerplate |
| Cadré, mécanique, vérifiable, gros lot à décharger | **Codex** | Suivre un plan cadré, convertir 50 fichiers, migrations, scaffolding large |

**Départage une fois le périmètre clair :**

- **Sonnet** si jugement de code, analyse transverse, risque à peser, ou complexité moyenne.
- **Haiku** si mécanique/simple, petit périmètre (1-2 fichiers), résultat évident.
- **Codex** si objectif net, critères explicites, fichiers déjà identifiés, vérifiable (tests/lint/diff), **surtout gros volume répétitif**.
- **Escalade vers Opus** si la cause d'un bug n'est pas localisée, le scope est flou/large, il reste des choix produit, ou la validation exige le visuel.

## 3. Effort

Chaque tâche de `TASKS.md` porte une suggestion **`effort: X`** (échelle `minimal · low · medium · high · max`),
à **vérifier manuellement avant de lancer la session** — aucun routing automatique.

Repère : `minimal`/`low` = mécanique, résultat quasi certain · `medium` = implémentation courante ·
`high`/`max` = raisonnement dense, arbitrages, bug non localisé. Un effort élevé consomme plus de
tokens : ne le réserver qu'aux tâches qui le justifient.

## 4. Format d'un plan (une tâche = un fichier)

Le backlog vit dans `TASKS.md` (index). Quand une tâche démarre, Opus crée `plans/PLAN_<id>.md`
d'après ce squelette — **une seule tâche par fichier, scope ~30 min**. Contenu = décision finale +
chemins de fichiers + étapes ; **pas** les alternatives ni la justification longue (celles-ci vont dans `DECISIONS.md`).

```md
# PLAN_<id> — <titre>   (rédigé par Opus)

> Exécutant : fais UNIQUEMENT cette tâche, dans l'ordre des étapes. Lis UNIQUEMENT les fichiers
> sous « Lire ». Ne crée aucun fichier/dépendance hors « Modifier ». Design fixé — ne reconçois pas.
> Doute ou blocage → STOP, signale, rends la main.

- Date : YYYY-MM-DD · Modèle : <Sonnet/Haiku/Codex> · effort : <…> · Branche : <ou —>

## Objectif
<1-2 lignes : le quoi>

## Décision clé
<ce qu'il faut savoir sans relire le repo ; pointer une section précise, ex. « DECISIONS.md §D-00X »>

## Lire
<fichiers + portée précise (section / fonction / lignes) — RIEN d'autre>

## Modifier
<fichiers à modifier / créer — liste exhaustive>

## Hors périmètre
<ce qu'il ne faut PAS toucher / faire>

## Étapes
1. …
2. …

## Validation
- Auto (bloque le commit) : `node test/run.js` → vert (+ autre commande si utile)
- Humain (visuel/UX, non bloquant) : <checklist ou —> → reporter dans `VALIDATION.md`

## Si bloqué
<condition d'arrêt SPÉCIFIQUE → STOP + quoi signaler>

## Commit
`<type(scope): message>`

## Statut
[ ] à faire · exécuté par : — · le : — · commit : —
```

Principes :

- **« Lire » est restrictif et porté** : que ces fichiers, à la section/fonction près.
- **« Étapes » = le comment**, ordonné. Plus le modèle est faible, plus elles sont fines ; si une tâche demande trop de jugement pour le modèle visé → la **découper**.
- **« Validation » = critères vérifiables** (commande + résultat, ou visuel), jamais « ça marche ».
- **« Si bloqué » = condition spécifique** à la tâche, pas le générique du bandeau.
- **Fin de tâche** : passer le statut à `[x]` (plan **et** `TASKS.md`), mettre à jour `STATUS.md`, et les autres fichiers de contexte **seulement si leur contenu a changé**. Commit atomique ; push en fin de session.

## 5. Checklist d'investigation Opus (avant d'écrire un plan)

1. **Flux** : chemin complet du problème/feature.
2. **Fichiers probables** sans tout ouvrir : `PROJECT_MAP.md`, `DECISIONS.md`, `SPEC.md` d'abord.
3. **Rôle** de chaque fichier clé.
4. **Dépendances directes** utiles.
5. **1-2 hypothèses racines**.
6. **Modèle + effort** de l'exécutant (§2-3).
7. **Verdict** : plan rédigeable maintenant, ou ambiguïté à lever d'abord ?

## 6. Anti-patterns

- Lancer Opus sur une tâche déjà cadrée.
- Envoyer à Sonnet/Haiku/Codex un scope flou ou trop large.
- Refactor global sans gain clair ni plan.
- Recopier du texte au lieu de pointer vers la source.
- Faire explorer le repo sans objectif précis.

## 7. Workflow bibliothèque de base de motifs

Pour ajouter/retirer un motif de base : déposer/supprimer le `.svg` dans `exemple motif/Personnages`
ou `exemple motif/Symboles`, puis `git commit` (le hook pre-commit régénère `src/builtin-motifs.js`
automatiquement) et `git push`. Installer le hook une fois : `sh tools/install-hook.sh` (ou `tools\install-hook.bat`).
