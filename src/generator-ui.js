/* generator-ui.js — mode Générateur de la palette d'édition (D-006/D-007 étendus).
   Porte l'essentiel de test/branches.html (outils Branche/Liane/Piste/Semer/Éditer + galerie de
   motifs) SUR le motif en cours d'édition de l'app, dans les mêmes coordonnées que le Dessin.

   Ne dépend que de window.BE (src/branch-engine.js), window.MOTIF_BANK (src/motif-bank.js) et
   window.EditHost (pont minimal exposé en fin de src/app.js — edit.draft, l'historique d'édition,
   ML, etc.). Script « classic » autonome, comme le reste du dépôt : pas d'import, chargé après
   app.js dans index.html.

   ─── Coordonnées ───────────────────────────────────────────────────────────────────────────
   Le moteur BE travaille dans SA propre unité (1 unité = BE.MM_PER_PX mm, reprise telle quelle de
   test/branches.html pour que les réglages par défaut — épaisseurs, pas, etc. — gardent exactement
   leur sens). L'éditeur de l'app travaille en px de conception (PX_PER_MM px/mm). Les DEUX mondes
   ne se mélangent jamais : on convertit seulement aux deux frontières — le point du pointeur en
   entrée, les contours d'encre en sortie — jamais au milieu des calculs de BE (aucun risque qu'un
   écart d'échelle fausse une largeur, un lissage ou une distance d'accroche).

   ─── Fusion dans edit.draft ────────────────────────────────────────────────────────────────
   Chaque geste terminé (fin de tracé Branche/Liane/Piste, tap/glissé Semer, relâcher une poignée
   Éditer) reconstruit la géométrie COMPLÈTE de la scène (BE.buildGeometry a besoin de tout le
   contexte : renflements de fourche, enroulement des lianes autour du bois existant, arbitrage de
   place des motifs posés), la convertit en contours d'encre (BE.toContours), puis n'ajoute au
   brouillon QUE la différence avec ce qui avait été fusionné la fois précédente (`lastMerged`) —
   jamais toute la scène à nouveau. Sans ce diff, un aller-retour Dessin (gomme sur une branche déjà
   posée) puis Générateur (ajout d'une autre branche) effacerait la gomme au passage suivant. La
   fusion passe par le même pushEditEntry que les traits au pinceau (kind:"op") : Annuler/Rétablir
   partagent donc le même historique, geste par geste, dessin et génération confondus. */
(function () {
  const BE = window.BE;

  let host = null;   // window.EditHost, injecté à l'exécution de ce script (après app.js)
  let ML = null;
  let k = 1, invK = 1; // conversions app-px <-> unité BE (cf. entête)
  let MM = 1;          // px BE par mm (repris de test/branches.html : MM = 1 / BE.MM_PER_PX)

  // ─── réglages (repris de test/branches.html) ───────────────────────────────────────────────
  // Seuls CINQ curseurs sont exposés dans le tiroir (cf. rapport) : épaisseur de branche, calibre
  // de liane, largeur de piste, taille de motif semé, densité de garniture (le « Pas » du semis).
  // Tout le reste garde la valeur par défaut du prototype — jamais inventée, copiée depuis son
  // objet `st` initial. Contrairement à la scène (cf. plus bas), ces réglages PERSISTENT d'une
  // édition à l'autre (même logique que la taille de pinceau côté Dessin, qui ne se réinitialise
  // pas non plus à chaque entrée en édition).
  let st = null;
  function defaultSt() {
    return {
      rootWidth: 12.5 * MM, taper: 1.15, tipFrac: 0.12, childRatio: 0.66, childRatioSide: 0.30,
      junctionSwell: 0.35, filletRatio: 0.70, emergeLead: 0.5, swellAmp: 0.10,
      wobbleAmp: 0.02, wobbleLen: 3.2, smoothPx: 2.5 * MM, tipLen: 8 * MM,
      barkPitch: 4 * MM, ink: 1.0 * MM, inkFine: 0.6 * MM, minRibbon: 3.0 * MM, snap: 26, tailTwig: false,
      pcbWidth: 3.5 * MM, pcbTol: 18, pcbVias: true, pcbPad: true,
      knotDensity: 1.0, knotStep: 26 * MM,
      lianeWidth: 3.3 * MM, lianeNodes: 1.5, lianeNodeStep: 12, lianeCollar: 0.55, lianeLeaf: 6, lianeEtat: "organique",
      sowSize: 18 * MM, sowStep: 22 * MM, sowAngle: (55 * Math.PI) / 180, autoLod: true, coilTurns: 1,
      sowSide: "auto",
      zone: [], // recalculé à chaque construction depuis la silhouette réelle du motif édité (cf. currentZoneBE)
    };
  }

  const FAMILLES = { feuille: "Feuilles", fleur: "Fleurs", vrille: "Vrilles",
                     champignon: "Champignons", radicelle: "Radicelles", composant: "Composants" };
  const ETATS = { organique: "Organique", hybride: "Hybride", electronique: "Électronique" };
  const POSES = { laterale: "sur le côté", montee: "debout dessus", enligne: "dans la ligne",
                  noeud: "en nœud", terminale: "au bout" };

  // ─── état de session (réinitialisé par onEnterEdit / onHistoryJump — jamais sérialisé, §7) ──
  let scene = null;               // BE.createScene() — donnée de travail, pas persistée
  let genTool = "branche";        // "branche"|"liane"|"piste"|"semer"|"editer"
  let lastMerged = [];            // dernier BE.toContours (en px app) déjà reflété dans edit.draft
  let warnedNoToContours = false; // n'avertit qu'une fois par session tant que BE.toContours manque
  let motifCourant = "";          // id du motif choisi pour l'outil Semer
  let filtreFam = "", filtreEtat = "";
  let cartes = [];                // galerie : une carte par (famille, forme, état) — cf. buildCartes

  // geste en cours (miroir des variables module-level de test/branches.html)
  let raw = [], anchor = null, headAnchor = null, portVise = null;
  let sel = null;      // { kind:"stamp"|"ctrl", id, index } — sélection de l'outil Éditer
  let dragging = null;

  // calques Konva (aperçu léger, cf. §rendu plus bas) — créés une fois, réutilisés
  let previewGroup = null;  // rendu approximatif de la scène (aperçu de geste, ou repli sans toContours)
  let traceLine = null;     // tracé brut en cours (Branche/Liane/Piste/Semer)
  let anchorDot = null;     // pastille d'accroche — diamètre = ce qui sera créé
  let handlesGroup = null;  // poignées de l'outil Éditer + bornes libres

  // ─── petites géométries locales ─────────────────────────────────────────────────────────────
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function scalePts(pts, f) { return pts.map(([x, y]) => [x * f, y * f]); }
  function scalePolys(polys, f) { return (polys || []).map((p) => scalePts(p, f)); }
  function scaleContours(contours, f) { return (contours || []).map((c) => ({ pts: scalePts(c.pts, f), closed: c.closed })); }
  function toBE(p) { return [p[0] * k, p[1] * k]; }
  function localBE() { return toBE(host.localPoint()); }
  function tracePoly(c, pts) {
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
  }

  /* « Zone de la table » du générateur (BE.buildGeometry, `st.zone`) : le CORPS DE LA GUITARE,
     défonces comprises, servi par host.getZoneLocal() en px locaux du motif édité puis converti en
     unité BE. Ce fut d'abord la silhouette de l'encre déjà posée (edit.realFill) — un contresens :
     un décor vierge n'en a AUCUNE (plus rien ne bornait la pousse) et celle d'un décor importé est
     le trait lui-même (tout ce qui ne recouvrait pas un trait existant était coupé). Mémoïsé pour
     la session : ni le contour ni la transformation de l'exemplaire ne bougent pendant l'édition
     (le nœud est verrouillé), alors que rebuild() est appelé à chaque frame d'un glissé. */
  let zoneBE = null;
  function currentZoneBE() {
    if (!zoneBE) zoneBE = scalePolys(host.getZoneLocal().map((c) => c.pts), k);
    return zoneBE;
  }

  function rebuild() {
    st.zone = currentZoneBE();
    return BE.buildGeometry(scene, st);
  }

  // taille ÉCRAN constante pour l'aperçu (poignées, bornes, tracé) : `editLayer` suit le zoom du
  // stage et l'échelle de l'exemplaire, donc un rayon fixe en unités locales fond à 2-3 px au zoom
  // d'ensemble — injouable au doigt. Même compensation que les ancres du Transformer (T-127).
  function ecran(px) { return px / host.editScale(); }
  // idem pour les tolérances de saisie, exprimées côté moteur en unité BE.
  function tolBE(pxEcran) { return ecran(pxEcran) * k; }

  function isGesturing() { return raw.length > 0 || !!dragging; }

  // ─── fusion dans edit.draft (cf. entête) ───────────────────────────────────────────────────
  function mergeSceneIntoDraft() {
    const motif = host.getEditedMotif();
    if (!motif || !scene) { renderOverlay(); return; }
    const trees = rebuild();
    if (typeof BE.toContours !== "function") {
      // Repli explicite tant que l'autre chantier (branch-engine.js) n'a pas encore livré
      // BE.toContours : la scène reste utilisable et visible (aperçu approximatif, cf. renderOverlay),
      // mais rien n'est encore appliqué au brouillon réel — impossible de fabriquer les contours
      // d'encre sans cette fonction. Averti une seule fois par session pour ne pas spammer.
      if (!warnedNoToContours) {
        host.showToast("Générateur : BE.toContours n'existe pas encore — scène conservée, rien appliqué au dessin pour l'instant.");
        warnedNoToContours = true;
      }
      renderOverlay();
      return;
    }
    const newContours = scaleContours(BE.toContours(trees, st), invK);
    const removed = ML.surfaceDifference(lastMerged, newContours); // présent avant, absent maintenant
    const added = ML.surfaceDifference(newContours, lastMerged);   // absent avant, présent maintenant
    if (!removed.length && !added.length) { renderOverlay(); return; }
    const edit = host.edit;
    // UN geste = UNE entrée d'historique, même quand il retire ET rajoute de la matière (glissé de
    // poignée, semis qui bouscule un voisin) : sinon Annuler s'arrêtait à mi-chemin, sur un état
    // que l'utilisateur n'a jamais vu. `ops` est rejoué dans l'ordre par rebuildDraftFrom (app.js).
    const ops = [];
    if (removed.length) {
      edit.draft = ML.surfaceDifferenceLocal(edit.draft, removed);
      edit.added = ML.surfaceDifferenceLocal(edit.added, removed);
      ops.push({ op: "sub", poly: removed });
    }
    if (added.length) {
      edit.draft = ML.surfaceUnionLocal(edit.draft, added);
      edit.added = ML.surfaceUnionLocal(edit.added, ML.surfaceDifference(added, edit.realFill));
      ops.push({ op: "add", poly: added });
    }
    host.pushEditEntry(ops.length === 1 ? { kind: "op", ...ops[0] } : { kind: "op", ops });
    lastMerged = newContours;
    edit.dirty = true;
    host.redrawEditLayer(motif);
    renderOverlay();
  }

  // ─── aperçu Konva (léger, cf. entête) ───────────────────────────────────────────────────────
  function ensureOverlay() {
    if (previewGroup) return;
    previewGroup = new Konva.Group({ listening: false });
    handlesGroup = new Konva.Group({ listening: false });
    host.editLayer.add(previewGroup, handlesGroup);
  }
  function clearOverlay() {
    if (previewGroup) { previewGroup.destroyChildren(); previewGroup.visible(false); }
    if (handlesGroup) handlesGroup.destroyChildren();
    traceLine = null; anchorDot = null;
    if (host.editLayer) host.redrawOverlay();
  }
  function hideOverlay() {
    if (previewGroup) previewGroup.visible(false);
    if (handlesGroup) handlesGroup.destroyChildren();
    if (host.editLayer) host.redrawOverlay();
  }

  // rendu approximatif d'une scène BE (silhouette blanche « autocollant » + contour encré + détail
  // fin), même principe que draw() dans test/branches.html mais sur Konva. Affiché SEULEMENT
  // pendant un geste actif, ou en repli tant que BE.toContours n'existe pas (cf. mergeSceneIntoDraft)
  // — une fois fusionné, c'est edit.draft/redrawEditLayer qui montre le résultat réel (avec le vert
  // « essai en attente »), ce calque redeviendrait un doublon inutile.
  function paintPreview(trees) {
    let shape = previewGroup.findOne(".gen-ink");
    if (shape) shape.destroy();
    if (!trees.length) return;
    const motif = host.getEditedMotif();
    const color = motif ? motif.color : "#000";
    shape = new Konva.Shape({
      name: "gen-ink", listening: false, opacity: 0.9,
      sceneFunc: (ctx) => {
        const c = ctx._context;
        for (const t of trees) {
          if (!t.silhouette.length) continue;
          c.beginPath();
          for (const poly of scalePolys(t.silhouette, invK)) tracePoly(c, poly);
          c.fillStyle = "#fff"; c.fill("evenodd");
          c.strokeStyle = color; c.lineWidth = Math.max(0.5, st.ink * invK);
          if (t.outline.length) { c.beginPath(); for (const poly of scalePolys(t.outline, invK)) tracePoly(c, poly); c.stroke(); }
          c.lineWidth = Math.max(0.5, st.inkFine * invK);
          if (t.lines.length) {
            c.save();
            c.beginPath(); for (const poly of scalePolys(t.silhouette, invK)) tracePoly(c, poly); c.clip("evenodd");
            c.beginPath();
            for (const l of t.lines) {
              const pl = scalePts(l, invK);
              c.moveTo(pl[0][0], pl[0][1]);
              for (let i = 1; i < pl.length; i++) c.lineTo(pl[i][0], pl[i][1]);
            }
            c.stroke();
            c.restore();
          }
        }
      },
    });
    previewGroup.add(shape);
  }

  function drawHandles(trees) {
    handlesGroup.destroyChildren();
    if (genTool !== "editer") {
      // bornes libres (patte d'un composant où enchaîner une ligne) : utile pour Branche/Liane/Piste,
      // pas pour Semer (aucun raccord de ligne) ni Éditer (poignées propres, cf. plus bas).
      if (genTool !== "semer") {
        for (const b of BE.freePorts(scene, st)) {
          const p = scalePts([b.p], invK)[0];
          handlesGroup.add(new Konva.Circle({ x: p[0], y: p[1], radius: ecran(7), stroke: "#4caf7d", strokeWidth: ecran(2), listening: false }));
        }
      }
      host.redrawOverlay();
      return;
    }
    for (const b of scene.branches) {
      if (!b.ctrl) continue;
      b.ctrl.forEach((cp, i) => {
        const p = scalePts([cp], invK)[0];
        const on = sel && sel.kind === "ctrl" && sel.id === b.id && sel.index === i;
        handlesGroup.add(new Konva.Circle({
          x: p[0], y: p[1], radius: ecran(on ? 14 : 11),
          fill: on ? "#e0433f" : "#fff", stroke: "#e0433f", strokeWidth: ecran(2), listening: false,
        }));
      });
    }
    const s0 = sel && sel.kind === "stamp" ? scene.stamps.find((x) => x.id === sel.id) : null;
    if (s0) {
      const h = BE.stampHandles(scene, s0, st);
      if (h) {
        const pied = scalePts([h.pied], invK)[0], pointe = scalePts([h.pointe], invK)[0];
        handlesGroup.add(new Konva.Line({ points: [pied[0], pied[1], pointe[0], pointe[1]], stroke: "#e0433f", strokeWidth: ecran(1.5), listening: false }));
        handlesGroup.add(new Konva.Circle({ x: pied[0], y: pied[1], radius: ecran(16), fill: "#fff", stroke: "#e0433f", strokeWidth: ecran(2.5), listening: false }));
        handlesGroup.add(new Konva.Circle({ x: pointe[0], y: pointe[1], radius: ecran(16), fill: "#e0433f", stroke: "#e0433f", strokeWidth: ecran(2.5), listening: false }));
      }
    }
    host.redrawOverlay();
  }

  function renderOverlay() {
    if (!host.edit.active || host.edit.mode !== "generate" || !scene) { hideOverlay(); return; }
    ensureOverlay();
    const trees = rebuild();
    const showInk = isGesturing() || typeof BE.toContours !== "function";
    if (showInk) paintPreview(trees); else { const s = previewGroup.findOne(".gen-ink"); if (s) s.destroy(); }
    drawHandles(trees);
    previewGroup.visible(true);
    host.redrawOverlay();
  }

  function drawTracePreview() {
    ensureOverlay();
    if (!traceLine) { traceLine = new Konva.Line({ stroke: "#4caf7d", listening: false }); previewGroup.add(traceLine); }
    traceLine.strokeWidth(ecran(2.5));
    traceLine.points(scalePts(raw, invK).flat());
    traceLine.visible(raw.length > 1);
    drawAnchorDot();
    previewGroup.visible(true);
    host.redrawOverlay();
  }
  function drawAnchorDot() {
    if (!anchorDot) { anchorDot = new Konva.Circle({ stroke: "#e0a33f", listening: false }); previewGroup.add(anchorDot); }
    anchorDot.strokeWidth(ecran(2));
    const active = portVise || anchor;
    if (!active) { anchorDot.visible(false); return; }
    const centerBE = portVise ? portVise.p : anchor.point;
    const p = scalePts([centerBE], invK)[0];
    const wBE = genTool === "semer" ? st.sowSize
      : genTool === "piste" ? st.pcbWidth
      : genTool === "liane" ? st.lianeWidth
      : anchor ? BE.childWidth(anchor, st) : st.rootWidth;
    anchorDot.position({ x: p[0], y: p[1] });
    // rayon = la vraie demi-largeur de ce qui sera créé (repère de taille), avec un plancher à
    // l'écran pour rester visible quand on est dézoomé sur toute la table.
    anchorDot.radius(Math.max(ecran(6), (wBE * invK) / 2));
    anchorDot.stroke(portVise ? "#4caf7d" : "#e0a33f");
    anchorDot.visible(true);
  }
  function clearTracePreview() {
    if (traceLine) traceLine.visible(false);
    if (anchorDot) anchorDot.visible(false);
    if (previewGroup) host.redrawOverlay();
  }

  // ─── pointeur (miroir de test/branches.html, adapté aux coordonnées/évènements de l'app) ────
  // `motif` (2e argument, passé par app.js) n'intervient pas ici : la scène BE ne connaît que ses
  // propres unités, le motif édité n'entre en jeu qu'à la fusion (mergeSceneIntoDraft).
  function pointerDown(e) {
    host.edit.drawing = true; host.edit.drawingPointerType = e.pointerType;
    const p = localBE();
    if (genTool === "editer") {
      const cur = sel && sel.kind === "stamp" ? scene.stamps.find((x) => x.id === sel.id) : null;
      const h = cur && BE.stampHandles(scene, cur, st);
      // tolérances de saisie : jamais plus serrées qu'avant, mais élargies quand on est dézoomé,
      // pour rester attrapables au doigt (la cible visée à l'écran suit `ecran()`, cf. drawHandles).
      const tPoignee = Math.max(22, tolBE(26)), tAxe = Math.max(30, tolBE(30));
      if (h && dist(p, h.pointe) < tPoignee) dragging = { kind: "tip", id: cur.id };
      else if (h && dist(p, h.pied) < tPoignee) dragging = { kind: "stamp", id: cur.id };
      else { sel = BE.editHit(scene, p, st, tAxe); dragging = sel; }
      updateSelInfo();
      renderOverlay();
      return;
    }
    headAnchor = anchor = BE.hitAxis(scene, p, genTool === "semer" ? st.snap * 2.5 : st.snap, st);
    portVise = genTool === "semer" ? null : BE.hitPort(scene, p, st.snap, st);
    raw = [p];
    drawTracePreview();
  }
  function pointerMove(e) {
    if (genTool === "editer") {
      if (!dragging) return;
      const p = localBE();
      if (dragging.kind === "tip") { const s0 = scene.stamps.find((x) => x.id === dragging.id); if (s0) BE.dragStampTip(scene, s0, p, st); }
      else if (dragging.kind === "stamp") { const s0 = scene.stamps.find((x) => x.id === dragging.id); if (s0) BE.moveStamp(scene, s0, p); }
      else if (dragging.kind === "ctrl") { const b = scene.branches.find((x) => x.id === dragging.id); if (b) BE.moveCtrl(scene, b, dragging.index, p, st); }
      renderOverlay();
      return;
    }
    // `raw` n'est peuplé qu'au pointerDown (cf. plus haut) : hors geste (simple survol souris, qui
    // — contrairement au tactile/stylet — déclenche pointermove même bouton relâché), on ignore.
    if (!raw.length) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs) { host.stage.setPointersPositions(ev); raw.push(localBE()); }
    const tail = BE.hitAxis(scene, raw[raw.length - 1], genTool === "semer" ? st.snap * 2.5 : st.snap, st);
    anchor = tail && (!headAnchor || tail.d < headAnchor.d) ? tail : headAnchor;
    drawTracePreview();
  }
  function pointerUp() {
    host.edit.drawing = false; host.edit.drawingPointerType = null;
    if (genTool === "editer") {
      dragging = null;
      mergeSceneIntoDraft();
      return;
    }
    portVise = null;
    clearTracePreview();
    if (genTool === "semer") {
      const to = raw.length ? BE.hitAxis(scene, raw[raw.length - 1], st.snap * 2.5, st) : null;
      if (headAnchor && motifCourant) {
        if (to && to.branchId === headAnchor.branchId && Math.abs(to.t - headAnchor.t) > 0.01) {
          BE.sowAlong(scene, headAnchor.branchId, headAnchor.t, to.t, motifCourant, st);
        } else {
          BE.addStampAuto(scene, motifCourant, headAnchor, st);
        }
      }
    } else if (raw.length > 2) {
      const a = BE.anchorStroke(scene, raw, st);
      const kind = genTool === "branche" ? null : genTool; // null = branche par défaut (cf. BE.addBranch)
      const nouvelle = BE.addBranch(scene, a.pts, st, a.anchor, kind);
      if (kind === "liane" && nouvelle) BE.garnishLiane(scene, nouvelle, st);
    }
    raw = []; anchor = headAnchor = null;
    mergeSceneIntoDraft();
  }
  function cancelGesture() {
    if (!scene) return; // hors mode Générateur / hors édition : no-op (appelé inconditionnellement par app.js)
    dragging = null; raw = []; anchor = headAnchor = null; portVise = null;
    clearTracePreview();
    renderOverlay();
  }

  // ─── outil Éditer : sélection + actions contextuelles (tiroir, data-genfor="editer") ────────
  function updateSelInfo() {
    if (genTool !== "editer") return;
    const info = document.getElementById("gen-sel-info");
    const sideBtn = document.getElementById("gen-sel-side");
    const delBtn = document.getElementById("gen-sel-del");
    const s0 = sel && sel.kind === "stamp" ? scene.stamps.find((x) => x.id === sel.id) : null;
    sideBtn.disabled = !s0;
    delBtn.disabled = !sel;
    if (s0) {
      const m = BE.motif(s0.motifId);
      info.textContent = `« ${m ? m.nom : "motif"} » sélectionné — glisse sa pointe (taille/angle) ou son pied (position le long de la branche).`;
    } else if (sel) {
      info.textContent = "Poignée d'axe sélectionnée — glisse-la pour corriger la forme de la branche.";
    } else {
      info.textContent = "Touche une branche ou un motif posé pour le retoucher.";
    }
  }
  function flipSelSide() {
    const s0 = sel && sel.kind === "stamp" ? scene.stamps.find((x) => x.id === sel.id) : null;
    if (!s0) return;
    s0.side = -s0.side; s0.mirror = !s0.mirror; s0._geom = null;
    mergeSceneIntoDraft();
  }
  function deleteSelection() {
    if (!sel) return;
    if (sel.kind === "stamp") scene.stamps = scene.stamps.filter((x) => x.id !== sel.id);
    else {
      scene.branches = scene.branches.filter((x) => x.id !== sel.id);
      scene.stamps = scene.stamps.filter((x) => x.branchId !== sel.id);
      for (const c of scene.branches) if (c.parentId === sel.id) { c.parentId = null; c.t = null; }
    }
    sel = null;
    updateSelInfo();
    mergeSceneIntoDraft();
  }

  // ─── outil Semer : galerie de motifs (portée telle quelle de test/branches.html) ────────────
  function buildCartes() {
    cartes = [];
    for (const m of BE.bank) {
      const cle = `${m.famille}|${m.forme}|${m.etat}`;
      let c = cartes.find((x) => x.cle === cle);
      if (!c) cartes.push((c = { cle, famille: m.famille, forme: m.forme, etat: m.etat, variantes: [] }));
      c.variantes.push(m);
    }
    for (const c of cartes) {
      // vignette : la variante la plus riche ; pose : l'outil tranchera
      c.vue = c.variantes.reduce((a, b) => ((a.gap || 0) <= (b.gap || 0) ? a : b));
      c.id = c.vue.id;
      c.mini = Math.min(...c.variantes.map((m) => BE.minStampSize(m, st) || Infinity));
      c.pose = c.vue.pose || "laterale";
      c.texte = `${c.famille} ${c.forme} ${c.etat} ${POSES[c.pose] || ""}`.toLowerCase();
    }
  }
  // vignette tracée depuis les axes du motif : rien à charger, et c'est exactement ce que l'outil posera.
  function vignette(svg, m) {
    const pad = Math.max(m.w, m.h) * 0.04;
    svg.setAttribute("viewBox", `${-pad} ${-pad} ${m.w + 2 * pad} ${m.h + 2 * pad}`);
    svg.innerHTML = m.paths.map((p) => `<path d="M${p.map((q) => q.join(",")).join("L")}"/>`).join("");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "#111");
    svg.setAttribute("stroke-width", Math.max(m.w, m.h) / 34);
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
  }
  function updatePickerPreview() {
    const c = cartes.find((x) => x.id === motifCourant);
    document.getElementById("gen-pick-nom").textContent = c ? `${FAMILLES[c.famille] || c.famille} · ${c.forme}` : "(bibliothèque vide)";
    document.getElementById("gen-pick-sous").textContent = c ? `${ETATS[c.etat] || c.etat} · ${POSES[c.pose] || c.pose}` : "";
    if (c) vignette(document.getElementById("gen-pick-vue"), c.vue);
  }
  function puces(hostEl, valeurs, courant, choisir) {
    hostEl.innerHTML = "";
    for (const [v, lib] of valeurs) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "gen-puce" + (v === courant() ? " on" : "");
      b.textContent = lib;
      b.addEventListener("click", () => { choisir(v); renderGallery(); });
      hostEl.appendChild(b);
    }
  }
  function renderGallery() {
    const fams = [...new Set(cartes.map((c) => c.famille))];
    const etats = [...new Set(cartes.map((c) => c.etat))];
    puces(document.getElementById("gen-gal-fam"),
      [["", `Tout (${cartes.length})`]].concat(fams.map((f) => [f, FAMILLES[f] || f])),
      () => filtreFam, (v) => (filtreFam = v));
    puces(document.getElementById("gen-gal-etat"),
      [["", "Tous états"]].concat(etats.map((e) => [e, ETATS[e] || e])),
      () => filtreEtat, (v) => (filtreEtat = v));

    const q = document.getElementById("gen-gal-q").value.trim().toLowerCase();
    const vus = cartes.filter((c) =>
      (!filtreFam || c.famille === filtreFam) &&
      (!filtreEtat || c.etat === filtreEtat) &&
      (!q || c.texte.includes(q)));

    const grille = document.getElementById("gen-gal-grid");
    grille.innerHTML = "";
    if (!vus.length) { grille.innerHTML = '<p id="gen-gal-vide">Aucun motif ne correspond.</p>'; return; }
    for (const c of vus) {
      const miniMm = c.mini === Infinity ? 0 : c.mini * BE.MM_PER_PX;
      const sowSizeMm = st.sowSize * BE.MM_PER_PX;
      const trop = miniMm > sowSizeMm + 0.01;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "gen-carte" + (c.id === motifCourant ? " on" : "") + (trop ? " petit" : "");
      el.innerHTML = `<svg></svg><span class="nom">${c.forme}</span>` +
        `<span class="meta"><span>${ETATS[c.etat] || c.etat}</span>` +
        `<span>${miniMm ? "≥ " + miniMm.toFixed(0) + " mm" : ""}</span></span>` +
        `<span class="pose">${POSES[c.pose] || c.pose}</span>`;
      vignette(el.querySelector("svg"), c.vue);
      el.addEventListener("click", () => { motifCourant = c.id; closeGallery(); });
      grille.appendChild(el);
    }
  }
  function openGallery() {
    document.getElementById("gen-gallery").hidden = false;
    // pas de .focus() sur le champ de recherche : sur iPad il fait monter le clavier logiciel par
    // -dessus la grille, alors qu'on vient d'ouvrir un choix VISUEL. On tape dans le champ si on
    // en a besoin. Le bandeau « Édition des zones » (z-index 60) est masqué le temps de la galerie.
    document.body.classList.add("gen-gallery-open");
    renderGallery();
  }
  function closeGallery() {
    document.getElementById("gen-gallery").hidden = true;
    document.body.classList.remove("gen-gallery-open");
    updatePickerPreview();
  }

  // ─── outils : sélection + tiroir de réglages contextuel (data-genfor, même principe que
  // data-for dans test/branches.html) ─────────────────────────────────────────────────────────
  function setGenTool(tool) {
    if (genTool === tool) return;
    cancelGesture();
    sel = null; dragging = null;
    genTool = tool;
    ["branche", "liane", "piste", "semer", "editer"].forEach((t) => {
      document.getElementById("gen-tool-" + t).classList.toggle("on", t === tool);
    });
    refreshDrawer();
    updateSelInfo();
    renderOverlay();
  }
  function refreshDrawer() {
    document.querySelectorAll("#generator-tools [data-genfor]").forEach((el) => {
      el.style.display = el.dataset.genfor.split(" ").includes(genTool) ? "" : "none";
    });
    afficheConsigne();
  }

  // Consigne permanente dans le bandeau de mode : rien à l'écran ne disait qu'il fallait TRACER,
  // l'information n'existait que dans le « ? ». Un testeur découvrant l'outil a tapé sans rien
  // obtenir et sans le moindre message.
  const CONSIGNES = {
    branche: "trace un trait pour faire pousser une branche · pars du bord d'une branche existante pour la prolonger",
    liane: "trace un trait pour poser une liane · elle s'enroule autour du bois qu'elle croise",
    piste: "trace un trait pour tirer une piste · démarre sur une borne verte pour l'y raccorder",
    semer: "touche une branche pour y poser le motif choisi · glisse le long pour en semer plusieurs",
    editer: "touche une branche ou un motif posé, puis glisse ses poignées",
  };
  function afficheConsigne() {
    if (!host.setModeHint || !host.edit.active || host.edit.mode !== "generate") return;
    host.setModeHint(CONSIGNES[genTool] || "");
  }

  function bindSlider(id, key, factor) {
    const el = document.getElementById(id), lbl = document.getElementById(id + "-val");
    el.value = (st[key] / factor).toFixed(1).replace(/\.0$/, "");
    lbl.textContent = el.value + " mm";
    el.addEventListener("input", () => {
      const v = parseFloat(el.value) || 0;
      st[key] = v * factor;
      lbl.textContent = v + " mm";
    });
  }

  /* Réglages sans unité (ratios, coefficients) : même mécanique que bindSlider, sans le
     "mm" ni la conversion d'échelle — repris tel quel de test/branches.html. */
  function bindSliderRaw(id, key, decimals) {
    const el = document.getElementById(id), lbl = document.getElementById(id + "-val");
    const fmt = (v) => v.toFixed(decimals == null ? 2 : decimals);
    el.value = fmt(st[key]);
    lbl.textContent = fmt(st[key]);
    el.addEventListener("input", () => {
      const v = parseFloat(el.value) || 0;
      st[key] = v;
      lbl.textContent = fmt(v);
    });
  }

  // ─── hooks appelés par src/app.js (cf. window.EditHost) ────────────────────────────────────
  function onEnterEdit() {
    scene = BE.createScene();
    lastMerged = [];
    zoneBE = null;   // le cadre dépend de l'exemplaire édité : recalculé à la 1re construction
    warnedNoToContours = false;
    sel = null; dragging = null; raw = []; anchor = headAnchor = null; portVise = null;
    clearOverlay();
  }
  function onExitEdit() {
    clearOverlay();
    scene = null;
    zoneBE = null;
  }
  // Annuler/Rétablir (edit.history) et Jeter (discardMotifDraft) ne rejouent QUE edit.draft — la
  // scène BE (branches/stamps éditables) ne les suit pas. Après un tel saut, `lastMerged` ne
  // correspondrait plus au brouillon réel (une branche resterait « fantôme » dans la scène, encore
  // capable d'influencer un renflement ou un enroulement de liane sans être visible). On repart
  // donc d'une scène neuve plutôt que de risquer ce décalage silencieux — seules les poignées de
  // retouche du Générateur repartent à zéro, l'encre déjà dans edit.draft suit normalement
  // l'historique partagé.
  function onHistoryJump() {
    if (!scene) return;
    scene = BE.createScene();
    lastMerged = [];
    sel = null; dragging = null; raw = []; anchor = headAnchor = null; portVise = null;
    clearTracePreview();
    renderOverlay();
  }
  function onModeEnter() { afficheConsigne(); renderOverlay(); }
  function onModeLeave() { cancelGesture(); clearOverlay(); }

  function init(hostObj) {
    host = hostObj;
    ML = host.ML;
    MM = 1 / BE.MM_PER_PX;
    k = 1 / (host.PX_PER_MM * BE.MM_PER_PX);
    invK = host.PX_PER_MM * BE.MM_PER_PX;
    st = defaultSt();

    BE.setBank(window.MOTIF_BANK || []);
    buildCartes();
    motifCourant = cartes.length ? cartes[0].id : "";
    updatePickerPreview();

    ["branche", "liane", "piste", "semer", "editer"].forEach((t) => {
      document.getElementById("gen-tool-" + t).onclick = () => setGenTool(t);
    });
    bindSlider("gen-root", "rootWidth", MM);
    bindSliderRaw("gen-taper", "taper", 2);
    bindSliderRaw("gen-child", "childRatio", 2);
    bindSliderRaw("gen-jsw", "junctionSwell", 2);
    bindSliderRaw("gen-fillet", "filletRatio", 2);
    bindSliderRaw("gen-lead", "emergeLead", 1);
    bindSlider("gen-lianew", "lianeWidth", MM);
    bindSlider("gen-pcbw", "pcbWidth", MM);
    bindSlider("gen-sowsize", "sowSize", MM);
    bindSlider("gen-sowstep", "sowStep", MM);
    document.getElementById("gen-sow-pick").onclick = openGallery;
    document.getElementById("gen-gal-close").onclick = closeGallery;
    const galleryEl = document.getElementById("gen-gallery");
    galleryEl.addEventListener("click", (e) => { if (e.target === galleryEl) closeGallery(); }); // tap sur le scrim = fermer
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !galleryEl.hidden) closeGallery(); });
    document.getElementById("gen-gal-q").addEventListener("input", renderGallery);
    document.getElementById("gen-sel-side").onclick = flipSelSide;
    document.getElementById("gen-sel-del").onclick = deleteSelection;

    refreshDrawer();
    updateSelInfo();
  }

  /* app.js s'exécute avant ce script (ordre des <script> dans index.html) et expose déjà
     window.EditHost à la fin de son IIFE -> DOM déjà prêt, init() peut tourner tout de suite.
     `window.GeneratorUI` n'est publié qu'APRÈS un init réussi : app.js n'appelle ses hooks que
     derrière `if (window.GeneratorUI)`, donc un générateur qui n'a pas pu se brancher se désactive
     proprement au lieu de faire échouer chaque geste d'édition (y compris en mode Dessin). */
  try {
    init(window.EditHost);
    window.GeneratorUI = {
      pointerDown, pointerMove, pointerUp, cancelGesture,
      onEnterEdit, onExitEdit, onHistoryJump, onModeEnter, onModeLeave,
      refreshDrawer,
    };
  } catch (e) {
    console.error("Générateur de décor désactivé (init) :", e);
  }
})();
