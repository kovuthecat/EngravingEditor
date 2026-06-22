# PLAN_<objectif>.md — Plan d'exécution   (rédigé par Opus)

> **Exécutants (Sonnet / Haiku / Codex)** : faites UNIQUEMENT votre tâche.
> Suivez les **Étapes dans l'ordre**. Lisez UNIQUEMENT les fichiers sous « Lire ».
> Ne créez AUCUN fichier ni dépendance hors « Modifier ». Le design est fixé par Opus —
> ne reconcevez pas. Doute ou blocage → **STOP**, signalez, rendez la main. N'improvisez pas.
> Format de référence : WORKFLOW.md §4.

- **Date :** YYYY-MM-DD · **Rédigé par :** Opus · **Branche :** <si applicable / —>
- **Plan parent / lié :** <PLAN_xxx.md ou —>

## Objectif global

<1-3 lignes : le but de ce lot de travail>

## Contexte / décision clé

<ce que l'exécutant doit savoir sans relire le repo ; pointer la section précise,
ex. « DECISIONS.md §Auth », « PROJECT_MAP.md §Front »>

## Tâches

> Noyau obligatoire pour CHAQUE tâche (même Haiku) : But · Lire · Modifier ·
> Hors périmètre · Étapes · Validation · Si bloqué · Commit · Statut.
> Optionnels (ajouter si utile) : Pourquoi ce modèle · Imiter.

### T1 — <titre> · Modèle : Sonnet
- **Pourquoi ce modèle :** <optionnel — jugement requis / mécanique / validation navigateur…>
- **But :** <verbe à l'infinitif : quoi>
- **Lire :** <fichiers + portée précise (section / fonction / lignes) — RIEN d'autre>
- **Imiter :** <optionnel — fichier/fonction existant servant de patron de style>
- **Modifier :** <fichiers à modifier/créer — liste exhaustive>
- **Hors périmètre :** <ce qu'il ne faut PAS toucher / faire>
- **Étapes :** <la marche à suivre, ordonnée et concrète — le COMMENT>
  1. …
  2. …
- **Validation :**
  - auto : `<commande exacte>` → <résultat attendu>
  - visuel : <ce qu'on doit voir / « — »>
- **Si bloqué :** <condition d'arrêt SPÉCIFIQUE à cette tâche → STOP + quoi signaler
  (ex. « si la fonction X n'existe pas dans Y, STOP, ne la crée pas »)>
- **Commit :** `<type(scope): message>`
- **Statut :** [ ] à faire   ·   exécuté par : —   ·   le : —   ·   commit : —

### T2 — <titre> · Modèle : Haiku
<mêmes champs du noyau — ne pas alléger pour Haiku ; étapes encore plus fines>

## Dépendances / ordre

<texte ou graphe ASCII : T1 → T2 ; T3 et T4 indépendantes ; T5 après T1–T4>

## Après le lot — mise à jour du contexte (obligatoire)

- [ ] **PLAN** : passer chaque tâche faite à `[x]`, renseigner exécuté par / le / commit ;
  aucune tâche ne reste « en cours ».
- [ ] **STATUS.md** : refléter l'état réel (ce qui marche / casse, backlog).
- [ ] **Autres fichiers de contexte, SEULEMENT si leur contenu a changé** — citer lesquels :
  DECISIONS.md · PROJECT_MAP.md · ROADMAP.md · TASKS.md · PROJECT_BRIEF.md.
- [ ] **Vérifier qu'aucun fichier de contexte n'est devenu faux** (un fichier faux est pire qu'absent).
- [ ] Commits atomiques par tâche (messages ci-dessus) ; push en fin de session.
