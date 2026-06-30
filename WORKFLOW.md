# WORKFLOW.md — Répartition des modèles et tâches

Fichier de référence unique pour la répartition du travail entre Opus, Sonnet, Haiku et Codex. Les autres fichiers de contexte y renvoient au lieu de le paraphraser.

## 1. Principe directeur

**Opus pense, les autres font.**

Le coût des tokens est minimisé par une répartition claire :
- **Opus** (cher) : pense, design, cadre, écrit les plans.
- **Codex** (économique, hors budget Claude) : exécute les tâches  spécifiées selon le plan.md etabli par opus
- **Sonnet** (back up) : exécute les tâches cadré moyenne complexité, les taches sur lesquelles codex bloque, juge les choix de code.
- **Haiku** (rapide) : exécute les tâches cadré et mécanique.


Une fois le plan écrit par Opus, chaque exécutant lit **UNIQUEMENT** les fichiers listés dans sa tâche et ne reconçoit pas — le design est fixé.

## 2. Grille des 4 modèles : quand utiliser chacun ?

| Nature de la tâche | Modèle | Exemples |
|---|---|---|
| Design, bug non localisé, scope flou, transverse, arbitrages produit | **Opus** | Architecture globale, stratégie produit, cadrage d'un sujet neuf, plan multi-tâche |
| Cadré, jugement de code, localisé, moyenne complexité | **Sonnet** | Bug isolé, refactor limité, implémentation d'une feature moyenne, code review |
| Cadré, mécanique, peu de jugement, petit | **Haiku** | Suppression de fichiers, simplification pur, alléger la documentation, petit boilerplate |
| Cadré, mécanique, vérifiable, gros lot à décharger | **Codex** |Suivre un plan bien cadré, Convertir 50 fichiers, migrations syntaxe, scaffolding large, lots répétitifs |

## 3. Grille de décision : Sonnet vs Haiku vs Codex ?

Utilisée par Opus pour assigner chaque tâche. Elle détermine le modèle adéquat une fois que le périmètre est clair et cadré (la tâche est déjà dans le plan).

Bon candidat **Sonnet** si :
- jugement de code ou connaissance architecturale utile ;
- analyse transverse (plusieurs fichiers, plusieurs zones) ;
- risque produit ou technique (impacts à peser) ;
- complexité moyenne (refactor, feature, bug moyen).

Bon candidat **Haiku** si :
- tâche mécanique et simple (suppression, renommage, déplacement de sections) ;
- peu ou pas de jugement ;
- petit périmètre (un ou deux fichiers) ;
- résultat évident/peu de validation nécessaire.

Bon candidat **Codex** si :
- objectif net, critères de validation explicites ;
- fichiers concernés déjà identifiés ;
- peu ou pas de jugement produit/architecture ;
- résultat facilement vérifiable (tests, lint, diff lisible) ;
- **gros volume ou travail très répétitif** → économie de tokens prioritaire.

Par défaut, rester sur **Codex** si le résultat se vérifie par tests, lint ou diff lisible.

Rester sur **Sonnet** (ou escalader vers Opus) si :
- la cause d'un bug n'est pas encore localisée ;
- la tâche touche à plusieurs zones ou demande une vue d'ensemble ;
- il reste des choix produit ou des options ouvertes ;
- le périmètre est flou ou risque de s'élargir ;
- la validation nécessite une vérification visuelle/navigateur (pas d'agent dédié pour ça) ;
- la décision requiert du jugement et de l'expertise.

## 4. Format canonique de PLAN.md

Un plan produit par Opus répond à ce template. Exécutants : référer-vous à cette structure.

```md
# PLAN_<objectif>.md — Plan d'exécution (rédigé par Opus)

> Exécutants (Sonnet / Haiku / Codex) : faites UNIQUEMENT votre tâche.
> Suivez les Étapes dans l'ordre. Lisez UNIQUEMENT les fichiers sous « Lire ».
> Ne créez AUCUN fichier ni dépendance hors « Modifier ». Le design est fixé par Opus.
> Doute ou blocage → STOP, signalez, rendez la main. N'improvisez pas.

- Date : YYYY-MM-DD · Rédigé par : Opus · Branche : <si applicable / —>
- Plan parent / lié : <PLAN_xxx.md ou —>

## Objectif global

<1–3 lignes : le but de ce lot de travail>

## Contexte / décision clé

<Ce que l'exécutant doit savoir sans relire le repo ; pointer la section précise,
ex. « DECISIONS.md §Auth »>

## Tâches

### T1 — <titre> · Modèle : Sonnet
- **Pourquoi ce modèle :** <optionnel>
- **But :** <verbe à l'infinitif : quoi>
- **Lire :** <fichiers + portée précise (section / fonction / lignes) — RIEN d'autre>
- **Imiter :** <optionnel — fichier/fonction patron de style>
- **Modifier :** <fichiers à modifier / créer — exhaustif>
- **Hors périmètre :** <ce qui ne doit PAS être touché / fait>
- **Étapes :** <marche à suivre ordonnée et concrète — le COMMENT>
- **Validation :** auto `<commande>` → <résultat> · visuel <ce qu'on doit voir / —>
- **Si bloqué :** <condition d'arrêt SPÉCIFIQUE → STOP + quoi signaler>
- **Commit :** `<type(scope): message>`
- **Statut :** [ ] à faire · exécuté par : — · le : — · commit : —

### T2 — <titre> · Modèle : Haiku
<mêmes champs du noyau — ne pas alléger pour Haiku ; étapes encore plus fines>

## Dépendances / ordre

<Graphe ASCII ou texte : T1 → T2 ; T3 et T4 indépendantes ; T5 après T1–T4>

## Après le lot — mise à jour du contexte (obligatoire)

- PLAN : tâches faites → [x], renseigner exécuté par / le / commit ; rien « en cours »
- STATUS.md : refléter l'état réel
- Autres fichiers de contexte SI leur contenu a changé (citer lesquels)
- Vérifier qu'aucun fichier de contexte n'est devenu faux
- Commits atomiques par tâche ; push en fin de session
```

Principes du format :
- Chaque tâche porte un modèle explicite : **« · Modèle : Sonnet »**
- **Noyau obligatoire pour chaque tâche** (même Haiku) : But · Lire · Modifier · Hors périmètre · Étapes · Validation · Si bloqué · Commit · Statut. Optionnels : Pourquoi ce modèle · Imiter.
- La section « Lire » est **restrictive et portée** : QUE ces fichiers, à la section/fonction près
- **« Étapes »** = la marche à suivre ordonnée (le *comment*). Plus le modèle est faible, plus les étapes sont fines. Si une tâche demande trop de jugement pour le modèle visé → la **découper**, ne pas la laisser vague
- « Hors périmètre » est explicite partout (anti scope-creep)
- « Validation » = critères vérifiables (commande + résultat, ou visuel), **jamais « ça marche »**
- **« Si bloqué »** = condition d'arrêt *spécifique* à la tâche (pas le générique du bandeau)
- Les dépendances entre tâches sont claires et visuelles
- « Après le lot » impose la mise à jour des fichiers de contexte (anti fichiers out-of-date)

## 5. Checklist d'investigation Opus (avant de rédiger un plan)

Quand Opus identifie un sujet à cadrer ou à enquêter, suivre cette checklist **avant** d'écrire le plan (ou la tâche de Claude Code) :

1. **Identifier le flux.** Quel est le chemin complet du problème/feature ? Où commence-t-il, où se termine-t-il ?
2. **Lister les fichiers probablement impliqués.** Sans tout ouvrir : READMEs, `PROJECT_MAP.md`, `DECISIONS.md` d'abord.
3. **Expliquer le rôle de chaque fichier clé.** Pourquoi est-il pertinent ? Qu'y fait-on ?
4. **Identifier les dépendances directes utiles.** Quels fichiers dépendent de quoi ?
5. **Formuler 1–2 hypothèses racines.** Si c'est un bug : qu'est-ce qui pourrait mal se passer ? Si c'est une feature : quels choix architecturaux sont critiques ?
6. **Choisir le modèle d'exécutant.** Opus → Sonnet → Haiku → Codex selon la grille ci-dessus.
7. **Dire explicitement** : est-ce que le plan peut être écrit maintenant, ou y a-t-il encore de l'ambiguïté qui demande un retour vers l'utilisateur avant de continuer ?

Cette checklist s'applique même si on délègue à Claude Code pour l'investigation : Opus pense toujours d'abord.

## 6. Anatomie d'un bon prompt

Pour que l'exécutant (Sonnet, Haiku ou Codex) fasse correctement sa tâche, elle doit citer ces éléments :

1. **Objectif précis.** Le *quoi*. Verbe à l'infinitif : créer, corriger, fusionner, retirer.
2. **Contexte / why.** Pourquoi cette tâche existe. Quel problème elle résout.
3. **Périmètre et fichiers.** Quels fichiers toucher, quels ne PAS toucher (« hors périmètre »).
4. **Étapes.** Le *comment* : la marche à suivre ordonnée. Plus le modèle est faible, plus elles sont fines ; si la tâche demande trop de jugement pour le modèle visé, la **découper**.
5. **Critères de validation.** Comment vérifier que c'est correct. Concis, objectif : commande + résultat, ou visuel — jamais « ça marche ».
6. **Dépendances.** Si la tâche dépend d'une autre, qui l'a déjà exécutée (ou doit l'être d'abord) ?
7. **Hors périmètre explicite.** Ce qui ne doit PAS être modifié, ce qu'on NE doit PAS faire.
8. **Règle anti-invention.** Ne créer aucun fichier ni dépendance hors « Modifier ».
9. **Condition d'arrêt (STOP) spécifique.** À quel signe concret l'exécutant doit s'arrêter et rendre la main plutôt qu'improviser (ex. « si la fonction X n'existe pas dans Y, STOP »).
10. **Consigne de fin.** Mise à jour contexte files (STATUS, DECISIONS, etc.), commit/push si applicable.

Pour **Codex**, ces points doivent être **encore plus serrés** : il n'investigue pas et n'arbitre pas, donc un prompt flou produit un mauvais résultat. Il lit sa tâche du `PLAN.md` et la fait, point.

## 6bis. Workflow bibliothèque de base de motifs

Pour ajouter/retirer un motif de base : déposer/supprimer le `.svg` dans `exemple motif/Personnages`
ou `exemple motif/Symboles`, puis `git commit` (le hook pre-commit régénère
`src/builtin-motifs.js` automatiquement) et `git push`. Installer le hook une fois :
`sh tools/install-hook.sh` (ou `tools\install-hook.bat`).

## 7. Anti-patterns à éviter

- Lancer Opus sur une tâche bien cadrée (gaspillage de tokens) ; le lui signaler à la place.
- Envoyer à Sonnet/Haiku/Codex une tâche floue ou un scope trop large → aller trop loin.
- Envoyer à Haiku ou Codex une tâche dont le périmètre n'est pas encore établi → allers-retours.
- Demander un refactor global sans gain clair et sans plan.
- Modifier de nombreux fichiers sans nécessité (recopier du texte au lieu de pointer vers).
- Faire explorer le repo sans objectif précis.
- Déléguer à Opus un sujet bien cadrée que Sonnet pouvait traiter seul (allers-retours inutiles, coût augmenté).
- Duplication : toujours pointer vers ce qui existe au lieu de paraphraser (WORKFLOW.md, DECISIONS.md, etc.).
