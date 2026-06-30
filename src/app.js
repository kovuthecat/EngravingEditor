/* app.js — Motif Layout. Édition + packing + export SVG avec occlusion par surfaces.
   Dépend de: Konva (global), ClipperLib (global), ML.parseSVG (svg.js), ML.buildZones/motifFill/occludeSurfaces/writeSVG (geometry.js). */
(function () {
  const ML = window.ML;
  const PX_PER_MM = 4; // échelle d'affichage (lossless: reconverti à l'export)
  const EDIT_DRAFT_COLOR = "#22c55e"; // D-007 : couleur d'un essai en attente (non appliqué)

  // ─── état ────────────────────────────────────────────────────────────────
  const state = {
    motifs: [],      // {id, name, polylines:[{pts,closed}], silhouette:[[x,y]]}  (local px, centré)
    boundary: null,  // [[x,y]..] design px (corps), ou null
    holes: null,     // cavités/trous réservés (px) auto depuis SVG
    contourRef: null, // polylignes du contour (px) pour le fond de référence (inutilisé depuis le retrait du DXF)
    margin: { show: true, mm: 5 }, // marge de sécurité (offset intérieur du contour), guide visuel uniquement
    seq: 0,
  };

  // ─── Konva ───────────────────────────────────────────────────────────────
  const stageEl = document.getElementById("stage");
  const stage = new Konva.Stage({ container: "stage", width: stageEl.clientWidth, height: stageEl.clientHeight, draggable: true });
  const boundaryLayer = new Konva.Layer({ listening: false }); // fond blanc du corps + trous creusés + marge
  const mainLayer = new Konva.Layer();
  const zonesLayer = new Konva.Layer();   // zones interdites manuelles + masque hors-corps/cavités (isMask, en bas du calque, listening:false)
  const guideLayer = new Konva.Layer();   // cadre laser déplaçable/orientable (repère zone de gravure machine)
  const uiLayer = new Konva.Layer();
  stage.add(boundaryLayer, mainLayer, zonesLayer, guideLayer, uiLayer);
  const BG = "#1c1f27"; // couleur de fond (= hors zone à graver)

  // Safari iOS/iPadOS plafonne la taille d'un <canvas> (aire ≈ 16,7 M px ≈ 4096², et un côté max) ;
  // au-delà il renvoie SILENCIEUSEMENT un canvas vide. node.cache({pixelRatio:2}) sur un grand décor
  // dépassait cette limite -> bitmap vide -> fond invisible sur iPad (visible sur desktop, limite bien
  // plus haute, et visible en édition car le groupe y est décaché). On borne donc pixelRatio pour que
  // le canvas de cache (boundingBox locale × pixelRatio) reste sous les limites iOS. Correctness > netteté.
  const MAX_CACHE_DIM = 4096;          // côté max d'un canvas iOS
  const MAX_CACHE_AREA = 16777216;     // aire max d'un canvas iOS (4096²)
  function safeCache(node, desiredPR) {
    const r = node.getClientRect({ skipTransform: true, skipShadow: true, skipStroke: true });
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    let pr = Math.min(desiredPR || 1, MAX_CACHE_DIM / w, MAX_CACHE_DIM / h, Math.sqrt(MAX_CACHE_AREA / (w * h)));
    if (!isFinite(pr) || pr <= 0) pr = 1;
    node.cache({ pixelRatio: pr });
  }

  const tr = new Konva.Transformer({
    rotateEnabled: true, keepRatio: true,
    enabledAnchors: ["top-left", "top-right", "bottom-left", "bottom-right"],
    anchorSize: 16, borderStroke: "#3b82f6", anchorStroke: "#3b82f6",
  });
  uiLayer.add(tr);

  // ─── poignée de déplacement (pastille au centre de la sélection) ─────────────
  // Pratique surtout pour le décor see-through, souvent vide en son centre : on attrape
  // la pastille au lieu de chercher un trait. mousedown -> startDrag du nœud sélectionné
  // (Konva gère le suivi pointeur, donc pas de saut ni de maths d'échelle).
  const moveHandle = new Konva.Group({ visible: false, name: "moveHandle" });
  moveHandle.add(new Konva.Circle({ radius: 20, fill: "#3b82f6", stroke: "#fff", strokeWidth: 2 }));
  moveHandle.add(new Konva.Path({
    data: "M0,-8 L4,-4 L1.5,-4 L1.5,-1.5 L4,-1.5 L4,-4 L8,0 L4,4 L4,1.5 L1.5,1.5 L1.5,4 L4,4 L0,8 L-4,4 L-1.5,4 L-1.5,1.5 L-4,1.5 L-4,4 L-8,0 L-4,-4 L-4,-1.5 L-1.5,-1.5 L-1.5,-4 L-4,-4 Z",
    fill: "#fff",
  }));
  uiLayer.add(moveHandle);
  moveHandle.on("mouseenter", () => (stage.container().style.cursor = "move"));
  moveHandle.on("mouseleave", () => (stage.container().style.cursor = ""));
  moveHandle.on("mousedown touchstart", (e) => {
    e.cancelBubble = true; // ne pas désélectionner ni démarrer un pan du fond
    const n = selected();
    if (n) n.startDrag();
  });
  function positionMoveHandle() {
    const n = selected();
    if (!n) { moveHandle.visible(false); uiLayer.batchDraw(); return; }
    const box = n.getClientRect(); // px écran (transform stage inclus)
    moveHandle.absolutePosition({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    moveHandle.visible(true);
    moveHandle.moveToTop();
    uiLayer.batchDraw();
  }

  function selected() { return tr.nodes()[0] || null; }
  function select(node) {
    if (node && node.getAttr("isZone")) {
      tr.resizeEnabled(true);
      tr.keepRatio(false);
      tr.enabledAnchors(["top-left", "top-center", "top-right", "middle-left", "middle-right", "bottom-left", "bottom-center", "bottom-right"]);
    } else if (node && node.getAttr("isFrame")) {
      tr.resizeEnabled(false); // cadre laser : dimensions fixes (machine), seules position/rotation se règlent
    } else {
      tr.resizeEnabled(true);
      tr.keepRatio(true);
      tr.enabledAnchors(["top-left", "top-right", "bottom-left", "bottom-right"]);
    }
    tr.nodes(node ? [node] : []);
    uiLayer.batchDraw(); updateInspector(); positionMoveHandle();
  }

  // clic vide -> désélection (mais pas pendant un pan)
  let panMoved = false;
  stage.on("mousedown", () => (panMoved = false));
  stage.on("dragmove", () => { panMoved = true; positionMoveHandle(); }); // suit le nœud déplacé (et le pan)
  stage.on("dragend", positionMoveHandle);
  stage.on("click tap", (e) => { if (edit.active) return; if (e.target === stage && !panMoved) select(null); });
  tr.on("transform", positionMoveHandle); // suit échelle/rotation via les poignées
  tr.on("transformstart", recordHistory);
  let recacheTimer = null;
  tr.on("transformend", () => {
    markProjectChanged();
    // T3 : après un gros changement d'échelle, le bitmap caché (fillGroupContent) peut sortir
    // flou — recache une seule instance (la sélectionnée), pas pendant le drag (inutile/coûteux).
    // T4 : debounce 150ms pour éviter un recache synchrone coûteux à chaque fin de transform
    // (gros décor) quand l'utilisateur ajuste plusieurs fois d'affilée.
    clearTimeout(recacheTimer);
    recacheTimer = setTimeout(() => {
      const n = selected();
      if (n && n.getAttr("motifId") !== undefined) {
        n.clearCache(); safeCache(n, 2);
        n.getLayer() && n.getLayer().batchDraw();
      }
    }, 150);
  });

  // zoom molette centré sur le curseur
  stage.on("wheel", (e) => {
    e.evt.preventDefault();
    const old = stage.scaleX();
    const pointer = stage.getPointerPosition();
    const to = { x: (pointer.x - stage.x()) / old, y: (pointer.y - stage.y()) / old };
    const dir = e.evt.deltaY > 0 ? 1 / 1.1 : 1.1;
    const ns = Math.min(8, Math.max(0.1, old * dir));
    stage.scale({ x: ns, y: ns });
    stage.position({ x: pointer.x - to.x * ns, y: pointer.y - to.y * ns });
    stage.batchDraw();
    positionMoveHandle();
  });

  // pinch-zoom + pan deux doigts (tablette) : le pan un doigt reste le drag natif Konva du
  // stage ; on le désactive seulement pendant le geste deux doigts pour ne pas interférer.
  let pinchDist = null;
  function touchPoint(t) {
    const box = stageEl.getBoundingClientRect();
    return { x: t.clientX - box.left, y: t.clientY - box.top };
  }
  function pinchInfo(touches) {
    const a = touchPoint(touches[0]), b = touchPoint(touches[1]);
    return { dist: Math.hypot(b.x - a.x, b.y - a.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }
  stage.on("touchstart", (e) => {
    if (e.evt.touches.length === 2) {
      e.evt.preventDefault();
      stage.draggable(false);
      pinchDist = pinchInfo(e.evt.touches).dist;
    }
  });
  stage.on("touchmove", (e) => {
    if (e.evt.touches.length === 2 && pinchDist) {
      e.evt.preventDefault();
      const { dist, mid } = pinchInfo(e.evt.touches);
      const old = stage.scaleX();
      const ns = Math.min(8, Math.max(0.1, old * (dist / pinchDist)));
      const to = { x: (mid.x - stage.x()) / old, y: (mid.y - stage.y()) / old };
      stage.scale({ x: ns, y: ns });
      stage.position({ x: mid.x - to.x * ns, y: mid.y - to.y * ns });
      stage.batchDraw();
      positionMoveHandle();
      pinchDist = dist;
    }
  });
  function endPinch(e) {
    if (pinchDist != null && (!e.evt.touches || e.evt.touches.length < 2)) {
      pinchDist = null;
      stage.draggable(true);
    }
  }
  stage.on("touchend", endPinch);
  stage.on("touchcancel", endPinch);

  function syncStageSize() {
    stage.width(stageEl.clientWidth); stage.height(stageEl.clientHeight); stage.batchDraw();
  }
  window.addEventListener("resize", syncStageSize);

  // min/max sans spread : un SVG de décor peut porter des centaines de milliers de points,
  // et Math.min(...arr) dépasse la limite d'arguments de la pile sur un tableau aussi grand.
  function minMax(nums) {
    let lo = Infinity, hi = -Infinity;
    for (const n of nums) { if (n < lo) lo = n; if (n > hi) hi = n; }
    return [lo, hi];
  }

  // ─── motifs (import SVG -> local px centré + zones + silhouette) ────────────
  const ROLE_DEFAULTS = {
    PERSONNAGE: { color: "#000000", margin: 2 },
    SYMBOLE: { color: "#c62828", margin: 0 },
    DECOR: { color: "#1565c0", margin: 0 },
  };
  function buildMotifFromSVG(name, parsed, role) {
    // SVG y-bas = écran y-bas, pas de flip ; l'export reflippe via pxPathsToMm
    const toPx = ([x, y]) => [x * PX_PER_MM, y * PX_PER_MM];
    const pxPaths = parsed.paths.map((p) => ({
      color: p.color,
      subpaths: p.subpaths.map((s) => ({ pts: s.pts.map(toPx), closed: s.closed })),
    }));
    if (role === "DECOR") {
      for (const p of pxPaths) p.subpaths = ML.simplifySubpaths(p.subpaths, 0.1 * PX_PER_MM);
    }
    const all = pxPaths.flatMap((p) => p.subpaths.flatMap((s) => s.pts));
    const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
    const [minx, maxx] = minMax(xs), [miny, maxy] = minMax(ys);
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
    for (const p of pxPaths) for (const s of p.subpaths) s.pts = s.pts.map(([x, y]) => [x - cx, y - cy]);

    const zones = ML.buildZones(pxPaths);
    const silhouette = ML.motifSilhouette(zones);
    const r = role || "PERSONNAGE";
    const defaults = ROLE_DEFAULTS[r];
    return { id: "m" + ++state.seq, name, zones, silhouette, role: r, color: defaults.color, margin: defaults.margin };
  }

  const motifThumbs = {}; // motifId -> <canvas> de la bibliothèque (pour rafraîchir après édition de zones)
  function addMotifToLibrary(motif) {
    state.motifs.push(motif);
    const item = document.createElement("div");
    item.className = "lib-item";
    const cv = document.createElement("canvas");
    cv.width = 64; cv.height = 64;
    drawThumb(cv, motif);
    motifThumbs[motif.id] = cv;
    const label = document.createElement("span");
    label.textContent = motif.name;
    const del = document.createElement("button");
    del.className = "lib-del"; del.type = "button"; del.textContent = "×";
    del.title = "Supprimer ce motif de la bibliothèque";
    del.onclick = (e) => { e.stopPropagation(); if (deleteMotifFromLibrary(motif.id)) item.remove(); };
    item.append(cv, label, del);
    item.title = "Cliquer pour ajouter au plan";
    item.onclick = () => addInstance(motif);
    const gridId = motif.role === "SYMBOLE" ? "library-symbole"
                 : motif.role === "DECOR"   ? "library-decor"
                 :                            "library-perso";
    document.getElementById(gridId).appendChild(item);
    updateLibCounts();
  }
  function deleteMotifFromLibrary(motifId) {
    const motif = state.motifs.find((m) => m.id === motifId);
    if (!motif) return false;
    const insts = mainLayer.getChildren(
      (n) => n.getClassName() === "Group" && n.getAttr("motifId") === motifId);
    if (insts.length && !confirm(
        `« ${motif.name} » a ${insts.length} exemplaire(s) sur le plan. Supprimer le motif et ses exemplaires ?`))
      return false;
    recordHistory();
    if (edit.active && edit.motifId === motifId) exitEdit();
    const sel = selected();
    if (sel && sel.getAttr("motifId") === motifId) select(null);
    insts.forEach((n) => n.destroy());
    mainLayer.batchDraw();
    editDrafts.delete(motifId); refreshDraftCounter();
    delete motifThumbs[motifId];
    state.motifs = state.motifs.filter((m) => m.id !== motifId);
    markProjectChanged();
    updateLibCounts();
    return true;
  }

  function updateLibCounts() {
    document.getElementById("count-perso").textContent =
      document.getElementById("library-perso").childElementCount;
    document.getElementById("count-symbole").textContent =
      document.getElementById("library-symbole").childElementCount;
  }

  // surfaces REMPLI du motif, fusionnées sous sa couleur focale (rendu écran + export) ; sans
  // couleur focale, renvoie les groupes de couleurs natives du SVG telles que détectées par T2.
  // motif.surface (édition stylet, D-006) prime sur la surface dérivée des zones : point d'entrée
  // unique du chemin de rendu/export (drawThumb/fillGroupContent/instancesBottomToTop en héritent).
  function exportFill(motif) {
    if (motif.surface) return motif.surface;
    const fillGroups = ML.motifFill(motif.zones);
    if (!motif.color) return fillGroups;
    const merged = [];
    for (const color in fillGroups) merged.push(...fillGroups[color]);
    return { [motif.color]: merged };
  }

  // matière du brouillon absente du réel = ajout (T5) : seule cette portion s'affiche en vert,
  // le reste du brouillon se peint en couleur réelle (une gomme devient un vrai trou, sans surlignage).
  function addedRegions(realContours, draftContours) {
    return ML.surfaceDifference(draftContours, realContours || []);
  }

  // compat anciens projets (avant T1, D-007) : motif.silhouette pouvait être un polygone unique
  // [[x,y]..] au lieu d'une liste de contours [[ [x,y].. ], ...]. Détection : sil[0][0] est un
  // point (array) en multi-contours, un nombre en polygone unique.
  function asContours(sil) {
    if (!sil || !sil.length) return [];
    return Array.isArray(sil[0][0]) ? sil : [sil];
  }

  // silhouette du motif (occlusion "sticker" + fond blanc), en liste de contours (multi-pièces,
  // D-007/T1) : depuis motif.surface si présent (D-006), sinon la silhouette dérivée des zones
  // (motif.silhouette, normalisée via asContours pour les anciens projets). Lecture seule — ne
  // mute jamais motif.silhouette (T6 le recalcule lui-même à l'édition).
  function motifSilhouettePts(motif) {
    if (!motif.surface) return asContours(motif.silhouette);
    return ML.silhouetteFromSurface(Object.values(motif.surface).flat());
  }

  function drawThumb(cv, motif) {
    const ctx = cv.getContext("2d");
    const silhouette = motifSilhouettePts(motif); // liste de contours (multi-pièces)
    const allPts = silhouette.flat();
    const xs = allPts.map((p) => p[0]), ys = allPts.map((p) => p[1]);
    const [minx, maxx] = minMax(xs), [miny, maxy] = minMax(ys);
    const w = maxx - minx, h = maxy - miny;
    const s = Math.min(56 / (w || 1), 56 / (h || 1));
    ctx.save(); ctx.translate(32, 32); ctx.scale(s, s);
    if (motif.role !== "DECOR") {
      ctx.fillStyle = "#fff";
      ctx.beginPath(); for (const contour of silhouette) poly(ctx, contour, true); ctx.fill();
    }
    // D-007/T5 : un essai en attente (non appliqué) garde sa couleur réelle sur la vignette ;
    // seule la matière AJOUTÉE par l'essai (absente du réel) se surligne en vert. Une gomme
    // (matière retirée) redevient donc un trou normal, sans surlignage.
    const pendingDraft = editDrafts.get(motif.id);
    const fillGroups = pendingDraft ? pendingDraft.surfaceByColor : exportFill(motif);
    const realFill = pendingDraft ? exportFill(motif) : null;
    for (const color in fillGroups) {
      ctx.beginPath();
      for (const region of fillGroups[color]) poly(ctx, region.pts, true);
      ctx.fillStyle = color;
      ctx.fill("evenodd");
      if (pendingDraft) {
        const added = addedRegions(realFill[color], fillGroups[color]);
        if (added.length) {
          ctx.beginPath();
          for (const region of added) poly(ctx, region.pts, true);
          ctx.fillStyle = EDIT_DRAFT_COLOR;
          ctx.fill("evenodd");
        }
      }
    }
    ctx.restore();
  }
  function poly(ctx, pts, closed) {
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (closed) ctx.closePath();
  }

  // ─── instances ─────────────────────────────────────────────────────────────
  // (re)peuple un groupe avec le fond silhouette + une surface evenodd par couleur de zones REMPLI
  function fillGroupContent(g, motif) {
    g.destroyChildren();
    // fond opaque (silhouette) — masque ce qui est dessous ; le décor n'a pas de fond
    // (see-through : ses vides laissent voir ce qui est placé dessous, cf. D-005).
    // Multi-contours (T1) : une Konva.Line par pièce, pour que CHAQUE morceau du motif
    // masque ce qui est derrière lui (pas seulement le plus gros).
    const silhouette = motifSilhouettePts(motif); // liste de contours
    for (const contour of silhouette) {
      if (motif.role !== "DECOR") {
        g.add(new Konva.Line({ points: contour.flat(), closed: true, fill: "#ffffff", listening: true }));
      } else {
        // décor see-through : fill transparent (rgba alpha 0) — invisible à l'écran mais peint
        // sur le canvas de hit avec sa colorKey opaque, donc toute la silhouette reste
        // cliquable/déplaçable, et le groupe garde une bbox mesurable (pas de NaN Transformer).
        g.add(new Konva.Line({ points: contour.flat(), closed: true, listening: true, fill: "rgba(0,0,0,0)" }));
      }
    }
    // surfaces : une par couleur focale, trous VIDE laissent voir le fond blanc (evenodd, imite drawBoundary)
    // D-007/T5 : un essai en attente (editDrafts) se peint en couleur RÉELLE comme un motif normal
    // (une gomme redevient un vrai trou, sans surlignage) ; seule la matière AJOUTÉE par l'essai
    // (absente du réel, cf. addedRegions) reçoit une Shape de surcharge en vert, non interactive.
    // motif.surface/silhouette restent inchangés (display-only) ; le vert est baked dans le cache
    // du groupe ci-dessous (g.cache), donc 0 coût par frame.
    const pendingDraft = editDrafts.get(motif.id);
    const fillGroups = pendingDraft ? pendingDraft.surfaceByColor : exportFill(motif);
    const realFill = pendingDraft ? exportFill(motif) : null;
    for (const color in fillGroups) {
      const contours = fillGroups[color];
      const shape = new Konva.Shape({
        fill: color,
        fillRule: "evenodd", // trous VIDE laissent passer le clic (hitFunc ci-dessous)
        sceneFunc: (ctx, shape) => {
          const c = ctx._context;
          c.beginPath();
          for (const region of contours) tracePoly(c, region.pts);
          c.fillStyle = shape.fill();
          c.fill("evenodd");
        },
        // sceneFunc dessine sur ctx._context (canvas brut) : Konva ne connaît pas la bbox de ce
        // Shape par défaut (getSelfRect renverrait 0x0) -> Transformer/positionMoveHandle/cache
        // (T3) ne couvriraient pas la surface peinte. Bbox calculée sur les contours réels.
        getSelfRect: () => {
          const allPts = contours.flatMap((region) => region.pts);
          if (!allPts.length) return { x: 0, y: 0, width: 0, height: 0 };
          const xs = allPts.map((p) => p[0]), ys = allPts.map((p) => p[1]);
          const [minx, maxx] = minMax(xs), [miny, maxy] = minMax(ys);
          return { x: minx, y: miny, width: maxx - minx, height: maxy - miny };
        },
        // sceneFunc peint sur ctx._context (canvas brut) -> rien n'est inscrit sur le canvas de
        // hit Konva (T2) : sans ça, seul le fond blanc/transparent (Line) est cliquable, pas la
        // surface peinte elle-même. On retrace les mêmes contours via l'API Konva (ctx ici est le
        // Context Konva, pas le canvas brut) pour peindre la colorKey sur le hit ; fillRule
        // evenodd (ci-dessus) laisse passer le clic dans un trou VIDE (on attrape ce qui est dessous).
        hitFunc: (ctx, shape) => {
          ctx.beginPath();
          for (const region of contours) tracePoly(ctx, region.pts);
          ctx.fillStrokeShape(shape);
        },
      });
      g.add(shape);
      if (pendingDraft) {
        const added = addedRegions(realFill[color], contours);
        if (added.length) {
          g.add(new Konva.Shape({
            fill: EDIT_DRAFT_COLOR,
            fillRule: "evenodd",
            listening: false, // surcharge visuelle seule ; le clic reste géré par la Shape réelle ci-dessus
            sceneFunc: (ctx, shape) => {
              const c = ctx._context;
              c.beginPath();
              for (const region of added) tracePoly(c, region.pts);
              c.fillStyle = shape.fill();
              c.fill("evenodd");
            },
          }));
        }
      }
    }
    // T3 perf : rasterise le groupe (scène + hit) en bitmap pour que drag/zoom déplacent une
    // image au lieu de re-tracer le décor (potentiellement des milliers de contours) à chaque
    // frame. pixelRatio:2 = compromis net/mémoire vu la plage de zoom de l'app (molette 0.1-8x,
    // pinch) ; au-delà, le bitmap peut réapparaître flou (recache sur transformend, voir plus bas).
    // Exception : le groupe en cours d'édition stylet reste non caché — startStroke() ajoute l'aperçu
    // de trait comme enfant de ce groupe, et applyStroke() le re-rend ; un groupe caché afficherait
    // un bitmap figé et ignorerait ces changements. NB : ce garde-fou ne couvre QUE le re-render
    // pendant l'édition ; le décache initial à l'entrée se fait dans enterEdit() (g.clearCache()),
    // car à la création le groupe est caché alors que edit.active est encore false. exitEdit() recache.
    // `edit` est déclaré plus bas mais déjà initialisé au runtime (fillGroupContent n'est appelée qu'alors).
    if (!(edit.active && edit.node === g)) safeCache(g, 2);
  }
  // re-rend toutes les instances d'un motif + sa vignette (après édition de rôles de zones)
  function rerenderMotif(motif) {
    mainLayer.getChildren((n) => n.getClassName() === "Group" && n.getAttr("motifId") === motif.id)
      .forEach((g) => fillGroupContent(g, motif)); // recache déjà inclus (fillGroupContent)
    mainLayer.batchDraw();
    const cv = motifThumbs[motif.id];
    if (cv) drawThumb(cv, motif);
  }
  function makeGroup(motif, x, y, rotation, scale) {
    const g = new Konva.Group({ x, y, rotation: rotation || 0, scaleX: scale || 1, scaleY: scale || 1, draggable: true });
    g.setAttr("motifId", motif.id);
    fillGroupContent(g, motif); // peuple + cache (voir fillGroupContent)
    g.on("click tap", (e) => { e.cancelBubble = true; if (edit.active) return; select(g); });
    g.on("dragstart", () => { recordHistory(); select(g); });
    g.on("dragend", markProjectChanged);
    mainLayer.add(g);
    return g;
  }

  // échelle + position pour faire tenir un motif dans le contour (ou, à défaut, dans la vue),
  // à une fraction donnée de la cible. Sans ça un import s'installe à son échelle absolue SVG
  // et peut déborder largement (svg.js ignore <g transform>).
  function fitScale(motif, fraction) {
    const allPts = asContours(motif.silhouette).flat();
    const xs = allPts.map((p) => p[0]), ys = allPts.map((p) => p[1]);
    const [mnx, mxx] = minMax(xs), [mny, mxy] = minMax(ys);
    const mw = (mxx - mnx) || 1, mh = (mxy - mny) || 1, mcx = (mnx + mxx) / 2, mcy = (mny + mxy) / 2;
    let tcx, tcy, tw, th;
    if (state.boundary) {
      const bx = state.boundary.map((p) => p[0]), by = state.boundary.map((p) => p[1]);
      const [bnx, bxx] = minMax(bx), [bny, bxy] = minMax(by);
      tw = bxx - bnx; th = bxy - bny; tcx = (bnx + bxx) / 2; tcy = (bny + bxy) / 2;
    } else {
      const inv = mainLayer.getAbsoluteTransform().copy().invert();
      const a = inv.point({ x: 0, y: 0 }), b = inv.point({ x: stage.width(), y: stage.height() });
      tw = Math.abs(b.x - a.x); th = Math.abs(b.y - a.y); tcx = (a.x + b.x) / 2; tcy = (a.y + b.y) / 2;
    }
    const scale = Math.min(tw / mw, th / mh) * fraction;
    return { scale, x: tcx - mcx * scale, y: tcy - mcy * scale };
  }

  function addInstance(motif, opts) {
    opts = opts || {};
    if (opts.history !== false) recordHistory();
    const c = viewCenterDesign();
    const manual = opts.x == null && opts.scale == null;
    const fit = (motif.role === "DECOR" && manual) ? fitScale(motif, 0.92) : null;
    let scale = opts.scale ?? (fit ? fit.scale : 1);
    if (motif.role !== "DECOR" && manual) scale = Math.min(1, fitScale(motif, 0.1).scale);
    const g = makeGroup(
      motif,
      opts.x ?? (fit ? fit.x : c.x),
      opts.y ?? (fit ? fit.y : c.y),
      opts.rotation ?? 0,
      scale
    );
    mainLayer.batchDraw();
    if (!opts.silent) select(g);
    if (opts.history !== false) markProjectChanged();
    return g;
  }

  function viewCenterDesign() {
    const inv = mainLayer.getAbsoluteTransform().copy().invert();
    return inv.point({ x: stage.width() / 2, y: stage.height() / 2 });
  }

  // ─── zones interdites (cavités physiques) ───────────────────────────────────
  function makeZone(o) {
    const z = new Konva.Rect({
      x: o.x, y: o.y, width: o.width, height: o.height, rotation: o.rotation || 0,
      scaleX: o.scaleX || 1, scaleY: o.scaleY || 1,
      fill: "rgba(239,68,68,0.22)", stroke: "#ef4444", strokeWidth: 1.5, draggable: true,
    });
    z.setAttr("isZone", true);
    z.on("click tap", (e) => { e.cancelBubble = true; if (edit.active) return; select(z); });
    z.on("dragstart", () => { recordHistory(); select(z); });
    z.on("dragend", markProjectChanged);
    zonesLayer.add(z);
    return z;
  }
  function addZone() {
    recordHistory();
    const c = viewCenterDesign();
    const z = makeZone({ x: c.x - 70, y: c.y - 35, width: 140, height: 70 });
    zonesLayer.batchDraw();
    select(z);
    markProjectChanged();
  }
  // polygones (design px) des zones, pour soustraction export + évitement packing
  function getZonePolys() {
    return zonesLayer.getChildren((n) => n.getAttr("isZone")).map((z) => {
      const t = z.getAbsoluteTransform(zonesLayer);
      const w = z.width(), h = z.height();
      return [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => { const p = t.point({ x, y }); return [p.x, p.y]; });
    });
  }

  // ─── cadre laser (repère zone de gravure machine, guide visuel déplaçable/orientable) ───
  let frameNode = null;
  function frameDimsPx() {
    return {
      w: (parseFloat(document.getElementById("frame-w").value) || 400) * PX_PER_MM,
      h: (parseFloat(document.getElementById("frame-h").value) || 415) * PX_PER_MM,
    };
  }
  function makeFrame(o) {
    const { w, h } = frameDimsPx();
    const f = new Konva.Rect({
      x: o.x, y: o.y, width: w, height: h, offsetX: w / 2, offsetY: h / 2, rotation: o.rotation || 0,
      stroke: "#a855f7", strokeWidth: 2, dash: [10, 6], fill: "rgba(168,85,247,0.06)", draggable: true,
    });
    f.setAttr("isFrame", true);
    f.on("click tap", (e) => { e.cancelBubble = true; if (edit.active) return; select(f); });
    f.on("dragstart", () => { recordHistory(); select(f); });
    f.on("dragend", markProjectChanged);
    guideLayer.add(f);
    return f;
  }
  function setFrameVisible(show) {
    if (show) {
      if (!frameNode) frameNode = makeFrame({ x: viewCenterDesign().x, y: viewCenterDesign().y, rotation: 0 });
      frameNode.visible(true);
    } else if (frameNode) {
      if (selected() === frameNode) select(null);
      frameNode.visible(false);
    }
    guideLayer.batchDraw();
    markProjectChanged();
  }
  function resizeFrame() {
    if (!frameNode) return;
    const { w, h } = frameDimsPx();
    frameNode.width(w); frameNode.height(h); frameNode.offsetX(w / 2); frameNode.offsetY(h / 2);
    guideLayer.batchDraw();
    markProjectChanged();
  }

  // ─── contour ─────────────────────────────────────────────────────────────
  // contour depuis SVG (sous-chemins fermés) : corps + cavités auto, échelle mm réelle
  // dimLong/dimShort en mm ; mappés sur le grand/petit axe du bbox.
  function setBoundaryFromSVG(subpaths, dimLong, dimShort) {
    recordHistory();
    const withA = subpaths.map((s) => ({ pts: s.pts, area: ML.absArea(s.pts) })).sort((a, b) => b.area - a.area);
    const body = withA[0]; if (!body) return;
    const xs = body.pts.map((p) => p[0]), ys = body.pts.map((p) => p[1]);
    const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
    const bw = maxx - minx, bh = maxy - miny;
    const realX = bw >= bh ? dimLong : dimShort, realY = bw >= bh ? dimShort : dimLong;
    const sx = (realX / bw) * PX_PER_MM, sy = (realY / bh) * PX_PER_MM;
    const place = (pts) => pts.map(([x, y]) => [(x - minx) * sx + 60, (y - miny) * sy + 60]);
    state.boundary = ML.simplify(place(body.pts), 1);
    const thr = body.area * 0.00004; // garde cavités + trous notables, ignore le bruit/logo fin
    state.holes = withA.slice(1).filter((s) => s.area > thr).map((s) => ML.simplify(place(s.pts), 0.8));
    state.contourRef = null;
    drawBoundary();
    markProjectChanged();
  }

  function tracePoly(c, pts) {
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
  }
  function drawBoundary() {
    boundaryLayer.destroyChildren();
    zonesLayer.getChildren((n) => n.getAttr("isMask")).forEach((d) => d.destroy());
    if (!state.boundary) { boundaryLayer.batchDraw(); zonesLayer.batchDraw(); return; }
    const holes = state.holes || [];
    // fond : corps en BLANC, cavités creusées (evenodd)
    boundaryLayer.add(new Konva.Shape({
      listening: false,
      sceneFunc: (ctx) => {
        const c = ctx._context;
        c.beginPath(); tracePoly(c, state.boundary); for (const h of holes) tracePoly(c, h);
        c.fillStyle = "#ffffff"; c.fill("evenodd");
        c.lineWidth = 1.5; c.strokeStyle = "#3b82f6"; c.stroke();
        c.strokeStyle = "#ef4444"; c.lineWidth = 1; for (const h of holes) { c.beginPath(); tracePoly(c, h); c.stroke(); }
      },
    }));
    // référence grise (contour brut additionnel, inutilisé depuis le retrait du DXF — conservé pour compat projets sauvegardés)
    for (const p of (state.contourRef || []))
      boundaryLayer.add(new Konva.Line({ points: p.pts.flat(), closed: p.closed, stroke: "#9aa3b2", strokeWidth: 1 }));
    // marge de sécurité : offset intérieur du contour (zone à éviter près du bord, calage machine incertain)
    if (state.margin.show && state.margin.mm > 0) {
      for (const ring of ML.insetPolygon(state.boundary, state.margin.mm * PX_PER_MM)) {
        if (ring.length < 3) continue;
        boundaryLayer.add(new Konva.Line({ points: ring.flat(), closed: true, stroke: "#f59e0b", strokeWidth: 1.5, dash: [8, 5] }));
      }
      // T10 : même guide ambre autour des vides internes, mais vers l'EXTÉRIEUR du vide (= dans le
      // corps) -> offsetPolygon (positif, élargit) au lieu d'insetPolygon (rétrécit le contour).
      for (const hole of holes) {
        for (const ring of ML.offsetPolygon(hole, state.margin.mm * PX_PER_MM)) {
          if (ring.length < 3) continue;
          boundaryLayer.add(new Konva.Line({ points: ring.flat(), closed: true, stroke: "#f59e0b", strokeWidth: 1.5, dash: [8, 5] }));
        }
      }
    }
    // masque : tout hors corps + cavités, en couleur de fond (aperçu net)
    // vit dans zonesLayer (pas un calque dédié, cf. T4) : ajouté puis renvoyé au fond pour
    // rester sous les zones interdites, à la même hauteur visuelle qu'avant (au-dessus des motifs).
    const maskShape = new Konva.Shape({
      listening: false,
      sceneFunc: (ctx) => {
        const c = ctx._context, B = 1e5;
        c.beginPath(); c.rect(-B, -B, 2 * B, 2 * B);
        tracePoly(c, state.boundary); for (const h of holes) tracePoly(c, h);
        c.fillStyle = BG; c.fill("evenodd");
      },
    });
    maskShape.setAttr("isMask", true);
    zonesLayer.add(maskShape);
    maskShape.moveToBottom();
    boundaryLayer.batchDraw(); zonesLayer.batchDraw();
  }

  // polygones réservés = cavités auto (SVG) + zones manuelles
  function reservedPolys() { return (state.holes || []).concat(getZonePolys()); }

  // ─── inspecteur (instance sélectionnée) ─────────────────────────────────────
  function updateInspector() {
    const g = selected();
    const box = document.getElementById("inspector");
    const selPalette = document.getElementById("selection-palette");
    if (!g) { box.style.display = "none"; selPalette.hidden = true; hideZoneEditor(); hideMotifEditor(); hideStyletEditor(); return; }
    box.style.display = "block";
    selPalette.hidden = edit.active; // toute sélection -> palette flottante visible, sauf en édition (edit-palette prend le relais)
    document.getElementById("insp-rot").value = Math.round(g.rotation());
    document.getElementById("insp-scale").value = g.scaleX().toFixed(2);
    const motif = state.motifs.find((x) => x.id === g.getAttr("motifId"));
    if (motif) { populateZoneEditor(motif); populateMotifEditor(motif); populateStyletEditor(motif); } else { hideZoneEditor(); hideMotifEditor(); hideStyletEditor(); }
  }

  // ─── éditeur rôle/couleur/marge du motif sélectionné ────────────────────────
  function hideMotifEditor() {
    document.getElementById("motif-editor").style.display = "none";
    document.getElementById("btn-edit").style.display = "none";
    document.getElementById("selection-role-row").style.display = "none";
  }
  function populateMotifEditor(motif) {
    document.getElementById("insp-role").value = motif.role;
    document.getElementById("insp-color").value = motif.color;
    document.getElementById("insp-margin").value = motif.margin;
    document.getElementById("motif-editor").style.display = "block";
    document.getElementById("btn-edit").style.display = "";
    document.getElementById("selection-role-row").style.display = "flex";
  }
  function selectedMotif() {
    const g = selected();
    return g ? state.motifs.find((x) => x.id === g.getAttr("motifId")) : null;
  }
  document.getElementById("insp-role").onchange = (e) => {
    const motif = selectedMotif(); if (!motif) return;
    motif.role = e.target.value;
    const d = ROLE_DEFAULTS[motif.role];
    motif.color = d.color; motif.margin = d.margin;
    rerenderMotif(motif);
    populateMotifEditor(motif);
    markProjectChanged();
  };
  document.getElementById("insp-color").oninput = (e) => {
    const motif = selectedMotif(); if (!motif) return;
    motif.color = e.target.value;
    rerenderMotif(motif);
    scheduleLocalSave();
  };
  document.getElementById("insp-margin").oninput = (e) => {
    const motif = selectedMotif(); if (!motif) return;
    motif.margin = parseFloat(e.target.value) || 0;
    scheduleLocalSave();
  };

  // ─── éditeur de rôles de zones (REMPLI/VIDE) du motif sélectionné ───────────
  function hideZoneEditor() {
    document.getElementById("zone-editor").style.display = "none";
  }
  function populateZoneEditor(motif) {
    const list = document.getElementById("zone-list");
    list.innerHTML = "";
    if (motif.role === "DECOR" || motif.zones.length > 300) {
      const msg = document.createElement("div");
      msg.textContent = `${motif.zones.length} zones — édition par rôle de zone désactivée pour le décor ; le décor se rend par couleur focale.`;
      msg.style.padding = "8px"; msg.style.fontSize = "12px"; msg.style.color = "#666";
      list.appendChild(msg);
      document.getElementById("zone-editor").style.display = "block";
      return;
    }
    const ordered = motif.zones
      .map((z, i) => ({ z, i, area: ML.absArea(z.pts) }))
      .sort((a, b) => a.z.depth - b.z.depth || b.area - a.area);
    for (const { z, i, area } of ordered) {
      const row = document.createElement("div");
      row.className = "zone-row";
      const sw = document.createElement("span");
      sw.className = "zone-swatch";
      sw.style.background = z.color === "none" ? "transparent" : z.color;
      const label = document.createElement("span");
      label.className = "zone-label";
      label.textContent = `#${i} · ${Math.round(area)} px²`;
      const toggle = document.createElement("button");
      toggle.className = "zone-toggle" + (z.role === "REMPLI" ? " on" : "");
      toggle.textContent = z.role;
      toggle.onclick = () => {
        recordHistory();
        z.role = z.role === "REMPLI" ? "VIDE" : "REMPLI";
        rerenderMotif(motif);
        populateZoneEditor(motif);
        markProjectChanged();
      };
      row.append(sw, label, toggle);
      list.appendChild(row);
    }
    document.getElementById("zone-editor").style.display = "block";
  }
  document.getElementById("insp-rot").oninput = (e) => { const g = selected(); if (g) { g.rotation(parseFloat(e.target.value) || 0); mainLayer.batchDraw(); scheduleLocalSave(); } };
  document.getElementById("insp-scale").oninput = (e) => { const g = selected(); if (g) { const s = parseFloat(e.target.value) || 1; g.scale({ x: s, y: s }); mainLayer.batchDraw(); scheduleLocalSave(); } };

  // ─── édition au stylet (D-006/D-007) : calque d'essai non destructif ────────────────────────
  // edit.node = instance Konva sur laquelle le tracé est capté (mappage écran->local). Les traits
  // mutent edit.draft (brouillon LOCAL, pas motif.surface) -> aucun re-render des instances pendant
  // le dessin (gain perf majeur). Le brouillon n'est rangé dans editDrafts qu'à la sortie d'édition
  // s'il a été modifié (edit.dirty) ; Appliquer seul écrit motif.surface. Verrouillage : draggable
  // désactivé partout, clics/dragstart ignorés (cf. guards plus haut), tr+moveHandle masqués ; deux
  // doigts restent le pan (T2).
  const edit = { active: false, motifId: null, node: null, tool: "brush", op: "add", sizeMm: 3, strokeMode: "round", calliAngle: 45, drawing: false, pts: [], pressures: [], draft: [], dirty: false, shapeAnchor: null, shapeCurrent: null, shapeConstrain: false, lasso: null, lassoDragAnchor: null, sidebarWasCollapsed: false, history: [], reopenDetails: null };
  let editPreview = null;
  // surlignage (orange) de la sélection lasso en attente (T8) — séparé du brouillon, sur editLayer.
  let lassoHighlight = null;
  // brouillons en attente (D-007) : motifId -> { surfaceByColor }. Session uniquement, jamais
  // sérialisé dans le projet (cf. projectData) ; purgé par loadProject (nouveau projet = nouveaux ids).
  const editDrafts = new Map();
  // calque d'essai : groupe sur uiLayer (pas un Layer dédié, cf. T4/avertissement Konva >5 layers),
  // calé sur la transform de edit.node (relative à mainLayer, comme uiLayer) -> suit pan/zoom sans
  // resync (même parent stage). Affiche silhouette réelle (fond blanc) + brouillon en couleur focale
  // (édition = couleur réelle pendant le tracé ; le vert n'apparaît qu'au repos, via fillGroupContent).
  // (T3) scindé en deux sous-groupes : editStaticGroup (fond silhouette, construit + mis en cache UNE
  // FOIS par enterEdit/buildEditStatic) et editDraftGroup (brouillon, retracé par redrawEditLayer à
  // chaque trait) — évite de reconstruire des milliers de Konva.Line (décor) à chaque trait.
  const editLayer = new Konva.Group({ visible: false, listening: false });
  const editStaticGroup = new Konva.Group({ listening: false });
  const editDraftGroup = new Konva.Group({ listening: false });
  editLayer.add(editStaticGroup, editDraftGroup);
  uiLayer.add(editLayer);

  function deepCopyContours(contours) {
    return (contours || []).map((c) => ({ pts: c.pts.map((p) => p.slice()), closed: c.closed }));
  }
  // pile d'annulation par trait (T8) : un snapshot avant chaque mutation de edit.draft (trait,
  // forme, lasso), bornée pour ne pas grossir sans fin sur une longue session (décor). Session
  // uniquement (jamais sérialisée) ; réinitialisée par enterEdit/exitEdit — ne touche pas
  // l'historique global du projet (recordHistory/undo).
  function pushStrokeSnapshot() {
    edit.history.push(deepCopyContours(edit.draft));
    if (edit.history.length > 30) edit.history.shift();
  }
  function undoStroke() {
    if (!edit.active || !edit.history.length) return;
    edit.draft = edit.history.pop();
    edit.dirty = true;
    clearLassoSelection();
    redrawEditLayer(state.motifs.find((m) => m.id === edit.motifId));
  }
  // brouillon effectif d'un motif pour Appliquer/Jeter : la session live si elle l'édite, sinon
  // l'essai rangé dans editDrafts ; null si rien en attente. Lit la première (unique en pratique,
  // une seule couleur focale éditée) entrée de surfaceByColor par valeur, pas par clé motif.color :
  // motif.color peut avoir changé depuis le stash (éditeur rôle/couleur), la clé stockée serait alors périmée.
  function effectiveDraft(motif) {
    if (edit.active && edit.motifId === motif.id) return edit.draft;
    const stashed = editDrafts.get(motif.id);
    return stashed ? Object.values(stashed.surfaceByColor)[0] || [] : null;
  }
  function motifHasPendingWork(motif) {
    if (editDrafts.has(motif.id)) return true;
    return edit.active && edit.motifId === motif.id && edit.dirty;
  }

  function setCanvasLocked(locked) {
    mainLayer.getChildren((n) => n.getClassName() === "Group").forEach((g) => g.draggable(!locked));
    zonesLayer.getChildren((n) => n.getAttr("isZone")).forEach((z) => z.draggable(!locked));
    guideLayer.getChildren().forEach((f) => f.draggable(!locked));
  }

  function hideStyletEditor() {
    document.getElementById("stylet-editor").style.display = "none";
  }
  function populateStyletEditor(motif) {
    const inEdit = edit.active && edit.motifId === motif.id;
    document.getElementById("stylet-editor").style.display = "block";
    document.getElementById("btn-edit").textContent = inEdit ? "Sortir de l'édition" : "Entrer en édition";
    document.getElementById("selection-palette").hidden = inEdit;
    document.getElementById("edit-palette").hidden = !inEdit;
    document.getElementById("stylet-tools").style.display = inEdit ? "block" : "none";
    document.getElementById("stylet-draft-actions").style.display = motifHasPendingWork(motif) ? "grid" : "none";
  }

  // (T3) fond silhouette : construit UNE SEULE FOIS par enterEdit (après syncEditLayerTransform),
  // puis mis en cache (bitmap) — sur le décor (des milliers de sous-chemins), c'était le coût
  // dominant de redrawEditLayer répété à chaque trait. exitEdit purge editStaticGroup.
  function buildEditStatic(motif) {
    editStaticGroup.destroyChildren();
    for (const contour of motifSilhouettePts(motif)) {
      editStaticGroup.add(new Konva.Line({ points: contour.flat(), closed: true, fill: "#ffffff", listening: false }));
    }
    safeCache(editStaticGroup, 1);
  }
  // (ré)affiche le brouillon courant en couleur focale, + (T5) surcharge verte sur la seule matière
  // ajoutée par l'essai en cours (vs la surface réelle, exportFill(motif) — qui ignore le brouillon
  // en cours). Le fond silhouette (editStaticGroup) n'est plus retracé ici (T3, cf. buildEditStatic).
  function redrawEditLayer(motif) {
    editDraftGroup.destroyChildren();
    if (edit.draft.length) {
      const draft = edit.draft;
      editDraftGroup.add(new Konva.Shape({
        fill: motif.color, fillRule: "evenodd", listening: false,
        sceneFunc: (ctx, shape) => {
          const c = ctx._context;
          c.beginPath();
          for (const region of draft) tracePoly(c, region.pts);
          c.fillStyle = shape.fill();
          c.fill("evenodd");
        },
      }));
      const added = addedRegions(exportFill(motif)[motif.color], draft);
      if (added.length) {
        editDraftGroup.add(new Konva.Shape({
          fill: EDIT_DRAFT_COLOR, fillRule: "evenodd", listening: false,
          sceneFunc: (ctx, shape) => {
            const c = ctx._context;
            c.beginPath();
            for (const region of added) tracePoly(c, region.pts);
            c.fillStyle = shape.fill();
            c.fill("evenodd");
          },
        }));
      }
    }
    uiLayer.batchDraw();
  }
  // cale editLayer (uiLayer) sur la transform de edit.node (mainLayer) : tous deux enfants directs
  // du même stage sans transform propre -> relative à mainLayer suffit (même convention que
  // instancesBottomToTop). Appelé une fois à l'entrée : le nœud reste verrouillé (non draggable)
  // pendant toute l'édition, pas de resync nécessaire (pan/zoom du stage s'applique aux deux côtés).
  function syncEditLayerTransform() {
    const t = edit.node.getAbsoluteTransform(mainLayer).decompose();
    editLayer.position({ x: t.x, y: t.y });
    editLayer.rotation(t.rotation);
    editLayer.scale({ x: t.scaleX, y: t.scaleY });
  }

  function enterEdit() {
    const g = selected();
    const motif = selectedMotif();
    if (!g || !motif) return;
    edit.active = true; edit.motifId = motif.id; edit.node = g;
    // repli auto des sections sidebar à l'entrée (T9) : mémorise les <details> ouverts pour les
    // rouvrir tels quels à la sortie (un <details> resté fermé reste fermé).
    edit.reopenDetails = [...document.querySelectorAll("#sidebar details[open]")];
    edit.reopenDetails.forEach((d) => { d.open = false; });
    // palette flottante (T7) : la sidebar se replie à l'entrée, sauf si déjà repliée manuellement
    // (sidebarWasCollapsed mémorisé pour ne pas la rouvrir à tort à la sortie).
    edit.sidebarWasCollapsed = document.getElementById("app").classList.contains("collapsed");
    if (!edit.sidebarWasCollapsed) {
      document.getElementById("app").classList.add("collapsed");
      syncStageSize();
    }
    const stashed = editDrafts.get(motif.id);
    edit.draft = deepCopyContours(stashed ? Object.values(stashed.surfaceByColor)[0] : exportFill(motif)[motif.color]);
    edit.dirty = false;
    edit.history = [];
    clearLassoSelection(); // pas de sélection lasso résiduelle d'une session d'édition précédente
    // T3 : le groupe a été mis en cache (bitmap) à sa création. Un groupe caché affiche son bitmap
    // figé et ignore les enfants ajoutés ensuite ; on le décache (exitEdit recache), mais le calque
    // d'essai (editLayer, jamais caché) est désormais ce qui affiche réellement le tracé en direct.
    g.clearCache();
    stage.draggable(false);
    setCanvasLocked(true);
    tr.visible(false); moveHandle.visible(false);
    syncEditLayerTransform();
    buildEditStatic(motif);
    redrawEditLayer(motif);
    editLayer.visible(true);
    mainLayer.batchDraw();
    uiLayer.batchDraw();
    populateStyletEditor(motif);
  }
  function exitEdit() {
    if (!edit.active) return;
    const motif = state.motifs.find((m) => m.id === edit.motifId);
    const editedNode = edit.node;
    const wasDirty = edit.dirty;
    // D-007 : plus de confirm bloquant -- un brouillon modifié est simplement rangé (en attente),
    // restauré si on revient sur ce motif (enterEdit), visible en vert sur ses instances (T5 §5).
    if (motif && wasDirty) editDrafts.set(motif.id, { surfaceByColor: { [motif.color]: edit.draft } });
    edit.active = false; edit.drawing = false; edit.pts = []; edit.pressures = []; edit.draft = []; edit.dirty = false;
    edit.history = [];
    clearLassoSelection();
    if (editPreview) { editPreview.destroy(); editPreview = null; }
    editLayer.visible(false);
    editStaticGroup.clearCache();
    editStaticGroup.destroyChildren();
    editDraftGroup.destroyChildren();
    document.getElementById("edit-palette").hidden = true;
    setCanvasLocked(false);
    stage.draggable(true);
    tr.visible(true);
    if (!edit.sidebarWasCollapsed) {
      document.getElementById("app").classList.remove("collapsed");
      syncStageSize();
    }
    (edit.reopenDetails || []).forEach((d) => { d.open = true; });
    edit.reopenDetails = null;
    uiLayer.batchDraw();
    if (motif && wasDirty) rerenderMotif(motif); // une fois (recache inclus) : passe en vert si en attente
    else if (editedNode) safeCache(editedNode, 2); // rien changé : juste recache (décaché à l'entrée)
    positionMoveHandle();
    refreshDraftCounter();
    if (motif) populateStyletEditor(motif);
  }

  // applique au motif (réel) le brouillon effectif (live ou rangé) : recordHistory encadre
  // l'application elle-même, pas chaque trait du brouillon (cf. applyStroke ci-dessous).
  function applyMotifDraft(motif) {
    const draft = effectiveDraft(motif);
    if (draft == null) return;
    clearLassoSelection(); // une sélection lasso en attente porte sur edit.draft tel qu'avant l'Appliquer
    recordHistory();
    motif.surface = { [motif.color]: draft };
    motif.silhouette = ML.silhouetteFromSurface(Object.values(motif.surface).flat());
    editDrafts.delete(motif.id);
    if (edit.active && edit.motifId === motif.id) {
      edit.draft = deepCopyContours(draft);
      edit.dirty = false;
      redrawEditLayer(motif);
    }
    rerenderMotif(motif);
    markProjectChanged();
    refreshDraftCounter();
    populateStyletEditor(motif);
  }
  // jette le brouillon effectif (live ou rangé) : le motif retrouve sa surface réelle inchangée.
  function discardMotifDraft(motif) {
    if (effectiveDraft(motif) == null) return;
    clearLassoSelection();
    editDrafts.delete(motif.id);
    if (edit.active && edit.motifId === motif.id) {
      edit.draft = deepCopyContours(exportFill(motif)[motif.color]);
      edit.dirty = false;
      redrawEditLayer(motif);
    }
    rerenderMotif(motif); // repasse au réel (retire le vert s'il n'était pas en édition live)
    refreshDraftCounter();
    populateStyletEditor(motif);
  }
  // applique tous les essais en attente (editDrafts) d'un coup : un seul recordHistory. Visible
  // aussi pendant une édition live (cf. UI) : on range d'abord le brouillon en cours s'il est
  // modifié, sinon "Tout appliquer" perdrait silencieusement les traits non encore rangés.
  function applyAllDrafts() {
    clearLassoSelection();
    if (edit.active && edit.dirty) {
      const liveMotif = state.motifs.find((m) => m.id === edit.motifId);
      if (liveMotif) editDrafts.set(liveMotif.id, { surfaceByColor: { [liveMotif.color]: edit.draft } });
    }
    if (!editDrafts.size) return;
    recordHistory();
    for (const [motifId, entry] of editDrafts) {
      const motif = state.motifs.find((m) => m.id === motifId);
      if (!motif) continue;
      motif.surface = entry.surfaceByColor;
      motif.silhouette = ML.silhouetteFromSurface(Object.values(motif.surface).flat());
      rerenderMotif(motif);
    }
    editDrafts.clear();
    if (edit.active) {
      const motif = state.motifs.find((m) => m.id === edit.motifId);
      if (motif) {
        edit.draft = deepCopyContours(exportFill(motif)[motif.color]);
        edit.dirty = false;
        redrawEditLayer(motif);
      }
    }
    markProjectChanged();
    refreshDraftCounter();
    const sel = selectedMotif();
    if (sel) populateStyletEditor(sel);
  }
  // garde-fou export (SVG ici, PNG en T9) : prévient si des essais ne seraient pas reflétés
  // (l'export lit toujours motif.surface réel, jamais le brouillon vert display-only).
  function guardPendingDrafts() {
    if (!editDrafts.size) return true;
    const n = editDrafts.size;
    const applyNow = confirm(`${n} essai(s) non appliqué(s) — OK pour tout appliquer puis exporter, Annuler pour choisir.`);
    if (applyNow) { applyAllDrafts(); return true; }
    return confirm("Exporter quand même ? Les essais en attente n'apparaîtront pas dans l'export.");
  }
  function refreshDraftCounter() {
    const n = editDrafts.size;
    const box = document.getElementById("draft-summary");
    document.getElementById("draft-count-label").textContent = n === 1 ? "1 essai en attente" : `${n} essais en attente`;
    box.style.display = n > 0 ? "flex" : "none";
  }

  // applique un trait terminé (déjà en coords locales du motif) au BROUILLON (pas motif.surface) :
  // union (pinceau) ou différence (gomme) sous la couleur focale. Aucun rerenderMotif ici (gain
  // perf D-007) : seul editLayer est redessiné, instantanément, quelle que soit la taille du décor.
  function applyStroke(motif, localPts) {
    const radiusPx = (edit.sizeMm * PX_PER_MM) / 2;
    // pression (T11) / plume (T12) : largeur variable selon le mode ; la gomme reste uniforme.
    const poly = edit.strokeMode === "pressure" && edit.tool === "brush"
      ? ML.variableStroke(localPts, edit.pressures.map((p) => radiusPx * (0.25 + 0.75 * p)))
      : edit.strokeMode === "calli" && edit.tool === "brush"
      ? ML.calligraphicStroke(localPts, edit.sizeMm * PX_PER_MM, edit.calliAngle)
      : ML.strokeToPolygon(localPts, radiusPx, edit.strokeMode);
    pushStrokeSnapshot();
    edit.draft = edit.op === "add" ? ML.surfaceUnion(edit.draft, poly) : ML.surfaceDifference(edit.draft, poly);
    edit.dirty = true;
    redrawEditLayer(motif);
  }

  // outils ligne/rectangle/ellipse (T7) : pointerdown = ancrage, move = aperçu sur editLayer,
  // up = polygone final unioné/différencié dans edit.draft selon le mode actif (edit.op, fixé par
  // Pinceau/Gomme — cf. setEditTool). Maj (shiftKey) contraint rectangle en carré / ellipse en cercle.
  function rectPolygon(a, b, square) {
    let w = b[0] - a[0], h = b[1] - a[1];
    if (square) {
      const s = Math.max(Math.abs(w), Math.abs(h));
      w = (w < 0 ? -1 : 1) * s; h = (h < 0 ? -1 : 1) * s;
    }
    const x0 = a[0], y0 = a[1], x1 = a[0] + w, y1 = a[1] + h;
    return [{ pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]], closed: true }];
  }
  function ellipsePolygon(a, b, circle) {
    let rx = Math.abs(b[0] - a[0]), ry = Math.abs(b[1] - a[1]);
    if (circle) { const r = Math.max(rx, ry); rx = r; ry = r; }
    const n = 48, pts = [];
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI * 2;
      pts.push([a[0] + rx * Math.cos(t), a[1] + ry * Math.sin(t)]);
    }
    return [{ pts, closed: true }];
  }
  function shapePolygon(tool, a, b, constrain) {
    if (tool === "line") {
      const radiusPx = (edit.sizeMm * PX_PER_MM) / 2;
      return ML.strokeToPolygon([a, b], radiusPx, edit.strokeMode);
    }
    if (tool === "rect") return rectPolygon(a, b, constrain);
    return ellipsePolygon(a, b, constrain);
  }
  function makeShapePreview(tool, motif) {
    const stroke = edit.op === "add" ? motif.color : "#ff0000";
    const a = edit.shapeAnchor;
    if (tool === "line") {
      return new Konva.Line({
        points: a.concat(a), stroke, strokeWidth: edit.sizeMm * PX_PER_MM,
        lineCap: edit.strokeMode === "flat" ? "butt" : "round", opacity: 0.55, listening: false,
      });
    }
    if (tool === "rect") {
      return new Konva.Rect({ x: a[0], y: a[1], width: 0, height: 0, fill: stroke, opacity: 0.55, listening: false });
    }
    return new Konva.Ellipse({ x: a[0], y: a[1], radiusX: 0, radiusY: 0, fill: stroke, opacity: 0.55, listening: false });
  }
  function startShape(motif, e) {
    edit.drawing = true;
    edit.shapeAnchor = localPoint();
    edit.shapeCurrent = edit.shapeAnchor;
    edit.shapeConstrain = !!(e.evt && e.evt.shiftKey);
    editPreview = makeShapePreview(edit.tool, motif);
    editLayer.add(editPreview);
    uiLayer.batchDraw();
  }
  function moveShape(e) {
    const a = edit.shapeAnchor, p = localPoint();
    edit.shapeCurrent = p;
    edit.shapeConstrain = !!(e.evt && e.evt.shiftKey);
    if (edit.tool === "line") {
      editPreview.points(a.concat(p));
    } else if (edit.tool === "rect") {
      let w = p[0] - a[0], h = p[1] - a[1];
      if (edit.shapeConstrain) {
        const s = Math.max(Math.abs(w), Math.abs(h));
        w = (w < 0 ? -1 : 1) * s; h = (h < 0 ? -1 : 1) * s;
      }
      editPreview.x(Math.min(a[0], a[0] + w));
      editPreview.y(Math.min(a[1], a[1] + h));
      editPreview.width(Math.abs(w));
      editPreview.height(Math.abs(h));
    } else {
      let rx = Math.abs(p[0] - a[0]), ry = Math.abs(p[1] - a[1]);
      if (edit.shapeConstrain) { const r = Math.max(rx, ry); rx = r; ry = r; }
      editPreview.radiusX(rx);
      editPreview.radiusY(ry);
    }
    uiLayer.batchDraw();
  }
  function endShape() {
    edit.drawing = false;
    if (editPreview) { editPreview.destroy(); editPreview = null; }
    const motif = state.motifs.find((m) => m.id === edit.motifId);
    if (motif) {
      const poly = shapePolygon(edit.tool, edit.shapeAnchor, edit.shapeCurrent, edit.shapeConstrain);
      pushStrokeSnapshot();
      edit.draft = edit.op === "add" ? ML.surfaceUnion(edit.draft, poly) : ML.surfaceDifference(edit.draft, poly);
      edit.dirty = true;
      redrawEditLayer(motif);
    }
    edit.shapeAnchor = null; edit.shapeCurrent = null;
  }

  function localPoint() {
    const p = edit.node.getRelativePointerPosition();
    return [p.x, p.y];
  }
  // pression du stylet (T11) ; 0 (souris/tactile sans capteur) -> 0.5 (largeur "moyenne" par défaut).
  function pointerPressure(e) {
    const ev = e.evt;
    return (ev.pressure ?? ev.touches?.[0]?.force ?? 0.5) || 0.5;
  }
  function startStroke(motif, e) {
    edit.drawing = true;
    edit.pts = [localPoint()];
    edit.pressures = [pointerPressure(e)];
    editPreview = new Konva.Line({
      points: edit.pts.flat(), stroke: edit.op === "add" ? motif.color : "#ff0000",
      strokeWidth: edit.sizeMm * PX_PER_MM, lineCap: "round", lineJoin: "round", opacity: 0.55, listening: false,
    });
    editLayer.add(editPreview);
  }
  function moveStroke(e) {
    edit.pts.push(localPoint());
    edit.pressures.push(pointerPressure(e));
    editPreview.points(edit.pts.flat());
    uiLayer.batchDraw();
  }
  function endStroke() {
    edit.drawing = false;
    if (editPreview) { editPreview.destroy(); editPreview = null; }
    const motif = state.motifs.find((m) => m.id === edit.motifId);
    if (motif && edit.pts.length) applyStroke(motif, edit.pts);
    edit.pts = [];
    edit.pressures = [];
  }

  // outil lasso (T8) : entoure une portion existante du brouillon (polyligne fermée au up) pour
  // la sélectionner. edit.lasso = {inside, rest, offset} ne mute PAS edit.draft — c'est un aperçu
  // draggable (offset glissé à la main, cf. moveLassoDrag) tant que Déplacer/Dupliquer/Effacer
  // (#lasso-actions) ou Échap n'a pas tranché. inside/rest sont calculés une fois à la fermeture
  // du lasso ; seul `offset` change pendant le glissé (pas de recalcul Clipper par frame).
  function pointInContours(pt, contours) {
    let count = 0;
    for (const c of contours) if (ML.pointInPoly(pt, c.pts)) count++;
    return count % 2 === 1; // evenodd à travers tous les contours (trous compris)
  }
  function translateContours(contours, offset) {
    const [dx, dy] = offset;
    return (contours || []).map((c) => ({ pts: c.pts.map(([x, y]) => [x + dx, y + dy]), closed: c.closed }));
  }
  function renderLassoHighlight() {
    if (lassoHighlight) { lassoHighlight.destroy(); lassoHighlight = null; }
    if (edit.lasso) {
      const moved = translateContours(edit.lasso.inside, edit.lasso.offset);
      lassoHighlight = new Konva.Shape({
        listening: false, fill: "#fb923c", fillRule: "evenodd", opacity: 0.85,
        sceneFunc: (ctx, shape) => {
          const c = ctx._context;
          c.beginPath();
          for (const region of moved) tracePoly(c, region.pts);
          c.fillStyle = shape.fill();
          c.fill("evenodd");
        },
      });
      editLayer.add(lassoHighlight);
    }
    uiLayer.batchDraw();
  }
  function clearLassoSelection() {
    edit.lasso = null;
    edit.lassoDragAnchor = null;
    if (lassoHighlight) { lassoHighlight.destroy(); lassoHighlight = null; }
    document.getElementById("lasso-actions").style.display = "none";
    uiLayer.batchDraw();
  }
  function startLassoTrace() {
    edit.drawing = true;
    edit.pts = [localPoint()];
    editPreview = new Konva.Line({
      points: edit.pts.flat(), stroke: "#fbbf24", strokeWidth: 1.5, dash: [8, 6], listening: false,
    });
    editLayer.add(editPreview);
  }
  function moveLassoTrace() {
    edit.pts.push(localPoint());
    editPreview.points(edit.pts.flat());
    uiLayer.batchDraw();
  }
  function endLassoTrace() {
    edit.drawing = false;
    if (editPreview) { editPreview.destroy(); editPreview = null; }
    if (edit.pts.length > 2) applyLassoTrace(edit.pts);
    edit.pts = [];
  }
  // ferme la polyligne tracée et sépare le brouillon en inside (sous le lasso) / rest (hors lasso) ;
  // si rien n'est sous le lasso, pas de sélection (silencieux, comme un clic dans le vide).
  function applyLassoTrace(pts) {
    const lassoPoly = [{ pts: pts.concat([pts[0]]), closed: true }];
    const inside = ML.surfaceIntersect(edit.draft, lassoPoly);
    if (!inside.length) return;
    const rest = ML.surfaceDifference(edit.draft, lassoPoly);
    edit.lasso = { inside, rest, offset: [0, 0] };
    renderLassoHighlight();
    document.getElementById("lasso-actions").style.display = "flex";
  }
  // pointerdown en mode lasso : si une sélection existe déjà et que le clic tombe dedans (en
  // tenant compte de son offset courant), démarre un glissé manuel ; sinon la sélection en cours
  // est abandonnée (clic à côté = on retrace) et un nouveau lasso démarre.
  function startLassoPointer() {
    if (edit.lasso) {
      const moved = translateContours(edit.lasso.inside, edit.lasso.offset);
      if (pointInContours(localPoint(), moved)) { edit.lassoDragAnchor = localPoint(); return; }
      clearLassoSelection();
    }
    startLassoTrace();
  }
  function moveLassoDrag() {
    const p = localPoint();
    const dx = p[0] - edit.lassoDragAnchor[0], dy = p[1] - edit.lassoDragAnchor[1];
    edit.lasso.offset = [edit.lasso.offset[0] + dx, edit.lasso.offset[1] + dy];
    edit.lassoDragAnchor = p;
    renderLassoHighlight();
  }
  // boutons contextuels (#lasso-actions) : tranchent le sort de la sélection avec son offset
  // courant (translation manuelle si l'utilisateur a glissé, [0,0] sinon).
  function finalizeLassoMove() {
    if (!edit.lasso) return;
    const motif = state.motifs.find((m) => m.id === edit.motifId);
    const moved = translateContours(edit.lasso.inside, edit.lasso.offset);
    pushStrokeSnapshot();
    edit.draft = ML.surfaceUnion(edit.lasso.rest, moved);
    edit.dirty = true;
    clearLassoSelection();
    if (motif) redrawEditLayer(motif);
  }
  function finalizeLassoDuplicate() {
    if (!edit.lasso) return;
    const motif = state.motifs.find((m) => m.id === edit.motifId);
    const moved = translateContours(edit.lasso.inside, edit.lasso.offset);
    pushStrokeSnapshot();
    edit.draft = ML.surfaceUnion(edit.draft, moved);
    edit.dirty = true;
    clearLassoSelection();
    if (motif) redrawEditLayer(motif);
  }
  function finalizeLassoErase() {
    if (!edit.lasso) return;
    const motif = state.motifs.find((m) => m.id === edit.motifId);
    pushStrokeSnapshot();
    edit.draft = edit.lasso.rest;
    edit.dirty = true;
    clearLassoSelection();
    if (motif) redrawEditLayer(motif);
  }

  const isFreehandTool = (tool) => tool === "brush" || tool === "eraser";
  // capté au niveau du stage (pas du groupe) : la portée est le motif verrouillé, pas ce qui
  // est sous le pointeur. Deux doigts = pan (T2) a priorité, donc ignoré ici. brush/eraser = tracé
  // libre (startStroke/moveStroke/endStroke) ; line/rect/ellipse = ancrage+aperçu (T7, startShape/
  // moveShape/endShape) ; lasso (T8) = trace une sélection OU glisse celle déjà sélectionnée
  // (edit.lassoDragAnchor, hors du flag edit.drawing — sinon il faudrait re-brancher tous les
  // autres outils) — même dispatch stage, le tool actif décide de la branche.
  stage.on("mousedown touchstart", (e) => {
    if (!edit.active) return;
    if (e.evt.touches && e.evt.touches.length !== 1) return;
    e.evt.preventDefault();
    const motif = state.motifs.find((m) => m.id === edit.motifId);
    if (!motif) return;
    if (edit.tool === "lasso") { startLassoPointer(); return; }
    if (isFreehandTool(edit.tool)) startStroke(motif, e); else startShape(motif, e);
  });
  stage.on("mousemove touchmove", (e) => {
    if (!edit.active) return;
    if (e.evt.touches && e.evt.touches.length !== 1) return;
    if (edit.lassoDragAnchor) { e.evt.preventDefault(); moveLassoDrag(); return; }
    if (!edit.drawing) return;
    e.evt.preventDefault();
    if (isFreehandTool(edit.tool)) moveStroke(e); else if (edit.tool === "lasso") moveLassoTrace(); else moveShape(e);
  });
  stage.on("mouseup touchend touchcancel", () => {
    if (!edit.active) return;
    if (edit.lassoDragAnchor) { edit.lassoDragAnchor = null; return; }
    if (!edit.drawing) return;
    if (isFreehandTool(edit.tool)) endStroke(); else if (edit.tool === "lasso") endLassoTrace(); else endShape();
  });

  function setEditTool(tool) {
    if (edit.tool === "lasso" && tool !== "lasso") clearLassoSelection();
    edit.tool = tool;
    if (tool === "brush") edit.op = "add";
    else if (tool === "eraser") edit.op = "sub";
    ["tool-brush", "tool-eraser", "tool-line", "tool-rect", "tool-ellipse", "tool-lasso"].forEach((id) => {
      document.getElementById(id).classList.toggle("on", id === "tool-" + tool);
    });
  }
  function setStrokeMode(mode) {
    edit.strokeMode = mode;
    document.getElementById("mode-round").classList.toggle("on", mode === "round");
    document.getElementById("mode-pressure").classList.toggle("on", mode === "pressure");
    document.getElementById("mode-calli").classList.toggle("on", mode === "calli");
    document.getElementById("calli-angle-row").hidden = mode !== "calli";
  }
  document.getElementById("btn-edit").onclick = () => { if (edit.active) exitEdit(); else enterEdit(); };
  document.getElementById("tool-brush").onclick = () => setEditTool("brush");
  document.getElementById("tool-eraser").onclick = () => setEditTool("eraser");
  document.getElementById("tool-line").onclick = () => setEditTool("line");
  document.getElementById("tool-rect").onclick = () => setEditTool("rect");
  document.getElementById("tool-ellipse").onclick = () => setEditTool("ellipse");
  document.getElementById("tool-lasso").onclick = () => setEditTool("lasso");
  document.getElementById("btn-lasso-move").onclick = finalizeLassoMove;
  document.getElementById("btn-lasso-duplicate").onclick = finalizeLassoDuplicate;
  document.getElementById("btn-lasso-erase").onclick = finalizeLassoErase;
  document.getElementById("brush-size").oninput = (e) => {
    edit.sizeMm = parseFloat(e.target.value) || 3;
    document.getElementById("brush-size-val").textContent = edit.sizeMm + " mm";
    document.querySelectorAll(".size-btn").forEach((b) => b.classList.toggle("on", parseFloat(b.dataset.sizeMm) === edit.sizeMm));
  };
  document.querySelectorAll(".size-btn").forEach((b) => {
    b.onclick = () => {
      edit.sizeMm = parseFloat(b.dataset.sizeMm);
      document.getElementById("brush-size").value = edit.sizeMm;
      document.getElementById("brush-size-val").textContent = edit.sizeMm + " mm";
      document.querySelectorAll(".size-btn").forEach((s) => s.classList.toggle("on", s === b));
    };
  });
  document.getElementById("mode-round").onclick = () => setStrokeMode("round");
  document.getElementById("mode-pressure").onclick = () => setStrokeMode("pressure");
  document.getElementById("mode-calli").onclick = () => setStrokeMode("calli");
  document.getElementById("calli-angle").oninput = (e) => { edit.calliAngle = +e.target.value || 0; };
  document.getElementById("btn-draft-apply").onclick = () => { const m = selectedMotif(); if (m) applyMotifDraft(m); };
  document.getElementById("btn-draft-discard").onclick = () => { const m = selectedMotif(); if (m) discardMotifDraft(m); };
  document.getElementById("btn-edit-undo").onclick = () => undoStroke();
  document.getElementById("btn-edit-exit").onclick = () => exitEdit();
  document.getElementById("btn-draft-apply-all").onclick = applyAllDrafts;

  // ─── actions clavier / boutons ──────────────────────────────────────────────
  function duplicateSel() {
    if (edit.active) return;
    const g = selected(); if (!g || g.getAttr("isFrame")) return;
    if (g.getAttr("isZone")) {
      recordHistory();
      const z = makeZone({ x: g.x() + 20, y: g.y() + 20, width: g.width(), height: g.height(), rotation: g.rotation(), scaleX: g.scaleX(), scaleY: g.scaleY() });
      zonesLayer.batchDraw(); select(z); markProjectChanged(); return;
    }
    const m = state.motifs.find((x) => x.id === g.getAttr("motifId"));
    addInstance(m, { x: g.x() + 20, y: g.y() + 20, rotation: g.rotation(), scale: g.scaleX() });
  }
  function deleteSel() {
    if (edit.active) return;
    const g = selected(); if (!g) return;
    recordHistory();
    if (g.getAttr("isFrame")) { document.getElementById("chk-frame").checked = false; frameNode = null; }
    const l = g.getLayer(); select(null); g.destroy(); l && l.batchDraw();
    markProjectChanged();
  }
  function zorder(d) {
    const g = selected(); if (!g || g.getAttr("isZone") || g.getAttr("isFrame")) return;
    recordHistory();
    if (d === "front") g.moveToTop(); else if (d === "back") g.moveToBottom();
    else if (d === "up") g.moveUp(); else g.moveDown();
    uiLayer.getChildren().forEach((n) => n.moveToTop()); // garde le transformer au-dessus
    mainLayer.batchDraw();
    markProjectChanged();
  }
  window.addEventListener("keydown", (e) => {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
    if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) { e.preventDefault(); if (edit.active) undoStroke(); else undo(); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSel(); }
    else if (e.key === "d" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); duplicateSel(); }
    else if (e.key === "]") zorder("up"); else if (e.key === "[") zorder("down");
    else if (e.key === "Escape" && edit.lasso) { e.preventDefault(); clearLassoSelection(); }
  });

  // ─── packing assisté (Phase 1 : dispersion dans le contour) ──────────────────
  function pointInPoly(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function packing(count, sMin, sMax) {
    if (!state.boundary) { alert("Charge d'abord un contour."); return; }
    if (!state.motifs.length) { alert("Importe d'abord des motifs."); return; }
    recordHistory();
    const xs = state.boundary.map((p) => p[0]), ys = state.boundary.map((p) => p[1]);
    const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
    const zones = reservedPolys();
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 40) {
      tries++;
      const x = minx + Math.random() * (maxx - minx), y = miny + Math.random() * (maxy - miny);
      if (!pointInPoly([x, y], state.boundary)) continue;
      if (zones.some((h) => pointInPoly([x, y], h))) continue;
      const m = state.motifs[Math.floor(Math.random() * state.motifs.length)];
      const scale = sMin + Math.random() * (sMax - sMin);
      const rot = (Math.random() - 0.5) * 50;
      addInstance(m, { x, y, rotation: rot, scale, silent: true, history: false });
      placed++;
    }
    mainLayer.batchDraw();
    if (placed) markProjectChanged();
  }

  // ─── export SVG (occlusion par surfaces, règle décor D-005) ─────────────────
  // occluder = ce qui masque ce qui est dessous (silhouette pour un motif, surface réelle
  // avec ses vides pour le décor) ; decorClear = silhouette élargie de la marge (mm->px),
  // sert uniquement à dégager le décor (halo posé-sur / à-fleur gravé-dans, cf. D-005).
  function instancesBottomToTop() {
    return mainLayer.getChildren((n) => n.getClassName() === "Group").map((g) => {
      const m = state.motifs.find((x) => x.id === g.getAttr("motifId"));
      const t = g.getAbsoluteTransform(mainLayer);
      const mapPts = (pts) => pts.map(([x, y]) => { const p = t.point({ x, y }); return [p.x, p.y]; });
      const fillGroups = exportFill(m);
      const groups = Object.keys(fillGroups).map((color) => ({
        color,
        paths: fillGroups[color].map((r) => ({ pts: mapPts(r.pts), closed: true })),
      }));
      // multi-pièces (T1) : silPieces = toutes les pièces de la silhouette, transformées. Pour un
      // motif normal, occluder = silPieces (chaque morceau occulte) au lieu de [silhouette] (un seul
      // bloc avant T1). Le décor garde son occlusion par surface réelle (fillPolys, D-005 inchangé).
      const silPieces = asContours(motifSilhouettePts(m)).map(mapPts);
      const fillPolys = groups.flatMap((gr) => gr.paths.map((p) => p.pts));
      const marginPx = (m.margin || 0) * PX_PER_MM;
      return {
        role: m.role,
        groups,
        occluder: m.role === "DECOR" ? fillPolys : silPieces,
        decorClear: silPieces.flatMap((p) => ML.offsetPolygon(p, marginPx)),
      };
    });
  }
  function exportSVG() {
    if (!guardPendingDrafts()) return; // D-007/T5 : avertit si des essais en attente ne seraient pas reflétés
    const insts = instancesBottomToTop();
    if (!insts.length) { alert("Rien à exporter."); return; }
    const visible = ML.occludeSurfaces(insts, state.boundary, reservedPolys());
    const colors = Object.keys(visible);
    const flat = []; // {pts,closed,color} à plat, pour une conversion mm partagée (même origine pour toutes les couleurs)
    for (const color of colors) for (const p of visible[color]) flat.push({ pts: p.pts, closed: true, color });
    if (!flat.length) { alert("Rien de visible à exporter."); return; }
    const mm = ML.pxPathsToMm(flat, PX_PER_MM);
    const groupsMm = {};
    mm.forEach((p, i) => { (groupsMm[flat[i].color] = groupsMm[flat[i].color] || []).push({ pts: p.pts, closed: true }); });
    const allPts = mm.flatMap((p) => p.pts);
    const [, w] = minMax(allPts.map((p) => p[0])), [, h] = minMax(allPts.map((p) => p[1]));
    download("pattern.svg", ML.writeSVG(groupsMm, { w, h }), "image/svg+xml");
  }

  // ─── export PNG/JPEG haute déf, sens écran (T9) ─────────────────────────────
  // Réutilise la même géométrie visible que exportSVG (instancesBottomToTop + occludeSurfaces) mais
  // SANS passer par pxPathsToMm : le PNG reste en repère écran (pas de -y), divergence volontaire
  // d'orientation avec le SVG, qui lui garde son miroir vertical (décision Thibault, cf. plan T9).
  const RASTER_MAX_PX = 40e6; // garde anti-mémoire (~40 Mpx)
  function exportPNG(format) {
    if (!guardPendingDrafts()) return;
    const insts = instancesBottomToTop();
    if (!insts.length) { alert("Rien à exporter."); return; }
    const visible = ML.occludeSurfaces(insts, state.boundary, reservedPolys());
    const colors = Object.keys(visible);
    const allPts = colors.flatMap((color) => visible[color].flatMap((p) => p.pts));
    // le corps blanc (dessiné ci-dessous) peut déborder de l'union des motifs -> la zone d'export
    // englobe aussi le contour pour ne pas le rogner (à l'écran, c'est drawBoundary qui le dessine).
    if (state.boundary) allPts.push(...state.boundary);
    if (!allPts.length) { alert("Rien de visible à exporter."); return; }
    const [minx, maxx] = minMax(allPts.map((p) => p[0]));
    const [miny, maxy] = minMax(allPts.map((p) => p[1]));
    let dpi = parseFloat(document.getElementById("export-dpi").value) || 300;
    let pxToOut = (dpi / 25.4) / PX_PER_MM;
    let outW = (maxx - minx) * pxToOut, outH = (maxy - miny) * pxToOut;
    if (outW * outH > RASTER_MAX_PX) {
      dpi = Math.max(50, Math.floor(dpi * Math.sqrt(RASTER_MAX_PX / (outW * outH))));
      pxToOut = (dpi / 25.4) / PX_PER_MM;
      outW = (maxx - minx) * pxToOut; outH = (maxy - miny) * pxToOut;
      alert(`Export plafonné à ${dpi} dpi pour rester sous ~40 Mpx (taille demandée trop grande).`);
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(outW));
    canvas.height = Math.max(1, Math.round(outH));
    const ctx = canvas.getContext("2d");
    // JPEG n'a pas de canal alpha -> fond blanc plein (les trous sortiraient noirs sinon).
    // PNG : on laisse le canvas transparent et on peint le corps blanc ci-dessous.
    if (format === "jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.translate(-minx * pxToOut, -miny * pxToOut);
    ctx.scale(pxToOut, pxToOut);
    // PNG : corps de la guitare en blanc, trous réservés (boutons, cordes…) creusés via evenodd ->
    // ils restent transparents. Même rendu que drawBoundary à l'écran. (JPEG : déjà tout blanc.)
    if (format !== "jpeg" && state.boundary) {
      ctx.beginPath();
      tracePoly(ctx, state.boundary);
      for (const h of (state.holes || [])) tracePoly(ctx, h);
      ctx.fillStyle = "#ffffff";
      ctx.fill("evenodd");
    }
    for (const color of colors) {
      ctx.beginPath();
      for (const p of visible[color]) tracePoly(ctx, p.pts);
      ctx.fillStyle = color;
      ctx.fill("evenodd");
    }
    const mime = format === "jpeg" ? "image/jpeg" : "image/png";
    const ext = format === "jpeg" ? "jpg" : "png";
    canvas.toBlob((blob) => {
      if (!blob) { alert("Export impossible (toBlob indisponible sur ce navigateur)."); return; }
      downloadBlob(`pattern.${ext}`, blob);
    }, mime, format === "jpeg" ? 0.92 : undefined);
  }

  // ─── projet (save/load JSON) ────────────────────────────────────────────────
  function projectData() {
    return {
      version: 1, pxPerMm: PX_PER_MM,
      motifs: state.motifs,
      boundary: state.boundary,
      holes: state.holes,
      contourRef: state.contourRef,
      margin: state.margin,
      frame: frameNode ? {
        x: frameNode.x(), y: frameNode.y(), rotation: frameNode.rotation(),
        w: frameNode.width(), h: frameNode.height(), visible: frameNode.visible(),
      } : null,
      zones: zonesLayer.getChildren((n) => n.getAttr("isZone")).map((z) => ({
        x: z.x(), y: z.y(), width: z.width(), height: z.height(), rotation: z.rotation(), scaleX: z.scaleX(), scaleY: z.scaleY(),
      })),
      instances: mainLayer.getChildren((n) => n.getClassName() === "Group").map((g) => ({
        motifId: g.getAttr("motifId"), x: g.x(), y: g.y(), rotation: g.rotation(), scale: g.scaleX(),
      })),
    };
  }
  function saveProject() {
    download("projet.mlayout.json", JSON.stringify(projectData()), "application/json");
  }
  function loadProject(data) {
    exitEdit();
    select(null);
    mainLayer.destroyChildren(); boundaryLayer.destroyChildren(); zonesLayer.destroyChildren(); guideLayer.destroyChildren();
    ["library-perso", "library-symbole", "library-decor"].forEach(
      (id) => { document.getElementById(id).innerHTML = ""; });
    for (const k in motifThumbs) delete motifThumbs[k];
    state.motifs = []; state.boundary = data.boundary || null; state.holes = data.holes || null; state.contourRef = data.contourRef || null; state.seq = 0;
    editDrafts.clear(); refreshDraftCounter(); // D-007 : essais en attente non sérialisés, purgés au chargement (ids périmés)
    state.margin = data.margin || { show: true, mm: 5 };
    document.getElementById("chk-margin").checked = state.margin.show;
    document.getElementById("margin-mm").value = state.margin.mm;
    frameNode = null;
    for (const m of data.motifs) {
      if (!m.zones) { console.warn(`Motif "${m.name}" ignoré au chargement : ancien format (polylines, sans zones), pas de migration automatique.`); continue; }
      if (!m.silhouette || !m.silhouette.length) {
        m.silhouette = m.surface ? ML.silhouetteFromSurface(Object.values(m.surface).flat()) : ML.motifSilhouette(m.zones);
      }
      addMotifToLibrary(m); state.seq = Math.max(state.seq, parseInt(m.id.slice(1)) || 0);
    }
    updateLibCounts();
    drawBoundary();
    for (const z of (data.zones || [])) makeZone(z);
    zonesLayer.batchDraw();
    if (data.frame) {
      document.getElementById("frame-w").value = data.frame.w / PX_PER_MM;
      document.getElementById("frame-h").value = data.frame.h / PX_PER_MM;
      frameNode = makeFrame({ x: data.frame.x, y: data.frame.y, rotation: data.frame.rotation });
      frameNode.visible(data.frame.visible !== false);
    }
    document.getElementById("chk-frame").checked = !!(frameNode && frameNode.visible());
    guideLayer.batchDraw();
    for (const it of (data.instances || [])) {
      const m = state.motifs.find((x) => x.id === it.motifId);
      if (m) addInstance(m, { x: it.x, y: it.y, rotation: it.rotation, scale: it.scale, silent: true, history: false });
    }
    mainLayer.batchDraw();
  }

  // Historique par instantanés : robuste pour les mutations Konva et les géométries imbriquées.
  const undoStack = [];
  const HISTORY_LIMIT = 20;
  function projectSnapshot() { return JSON.stringify(projectData()); }
  function pushHistorySnapshot(snapshot) {
    if (undoStack[undoStack.length - 1] === snapshot) return;
    undoStack.push(snapshot);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    document.getElementById("btn-undo").disabled = false;
  }
  function recordHistory() { pushHistorySnapshot(projectSnapshot()); }
  function undo() {
    if (!undoStack.length) return;
    const snapshot = undoStack.pop();
    loadProject(JSON.parse(snapshot));
    document.getElementById("btn-undo").disabled = undoStack.length === 0;
    markProjectChanged();
  }

  // IndexedDB évite la limite étroite de localStorage pour les gros contours et motifs.
  const LOCAL_DB = "motif-layout";
  const LOCAL_STORE = "projects";
  const LOCAL_KEY = "current";
  let localSaveTimer = null;
  function setLocalStatus(text, error) {
    const el = document.getElementById("local-save-status");
    el.textContent = text;
    el.classList.toggle("error", !!error);
  }
  function openLocalDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(LOCAL_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(LOCAL_STORE, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function saveLocalProject() {
    try {
      setLocalStatus("Sauvegarde...");
      const db = await openLocalDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(LOCAL_STORE, "readwrite");
        tx.objectStore(LOCAL_STORE).put({ id: LOCAL_KEY, data: projectData(), savedAt: Date.now() });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
      setLocalStatus("Sauvegardé localement");
    } catch (err) {
      console.error("Sauvegarde locale impossible", err);
      setLocalStatus("Sauvegarde locale impossible", true);
    }
  }
  function scheduleLocalSave() {
    clearTimeout(localSaveTimer);
    localSaveTimer = setTimeout(() => {
      localSaveTimer = null;
      saveLocalProject();
    }, 300);
  }
  function markProjectChanged() { scheduleLocalSave(); }
  function flushLocalSave() {
    if (!localSaveTimer) return;
    clearTimeout(localSaveTimer);
    localSaveTimer = null;
    saveLocalProject();
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushLocalSave();
  });
  window.addEventListener("pagehide", flushLocalSave);
  async function restoreLocalProject() {
    try {
      const db = await openLocalDb();
      const saved = await new Promise((resolve, reject) => {
        const tx = db.transaction(LOCAL_STORE, "readonly");
        const req = tx.objectStore(LOCAL_STORE).get(LOCAL_KEY);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      db.close();
      if (saved && saved.data) {
        loadProject(saved.data);
        setLocalStatus("Projet local restauré");
      } else {
        setLocalStatus("Nouveau projet local");
      }
    } catch (err) {
      console.error("Restauration locale impossible", err);
      setLocalStatus("Stockage local indisponible", true);
    }
  }

  // Pour les champs continus, mémorise l'état avant focus puis crée une seule étape à la validation.
  const inputSnapshots = new WeakMap();
  [
    "chk-margin", "margin-mm", "chk-frame", "frame-w", "frame-h",
    "insp-rot", "insp-scale", "insp-role", "insp-color", "insp-margin",
  ].forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener("focus", () => inputSnapshots.set(el, projectSnapshot()));
    el.addEventListener("change", () => {
      const before = inputSnapshots.get(el);
      if (before && before !== projectSnapshot()) pushHistorySnapshot(before);
      inputSnapshots.delete(el);
      markProjectChanged();
    });
  });

  // ─── util fichiers ──────────────────────────────────────────────────────────
  function download(name, text, mime) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
  }
  function downloadBlob(name, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
  }
  function readFiles(files, cb) {
    [...files].forEach((f) => { const r = new FileReader(); r.onload = () => cb(f.name, r.result); r.readAsText(f); });
  }
  function runWithBusy(fn) {
    const o = document.getElementById("busy-overlay");
    o.hidden = false;
    requestAnimationFrame(() => setTimeout(() => { try { fn(); } finally { o.hidden = true; } }, 0));
  }

  // ─── câblage UI ──────────────────────────────────────────────────────────────
  document.getElementById("import-perso").onchange = (e) =>
    readFiles(e.target.files, (name, text) => {
      runWithBusy(() => {
        recordHistory();
        const base = name.replace(/\.[^.]+$/, "");
        addMotifToLibrary(buildMotifFromSVG(base, ML.parseSVG(text), "PERSONNAGE"));
        markProjectChanged();
      });
      e.target.value = "";
    });
  document.getElementById("import-symbole").onchange = (e) =>
    readFiles(e.target.files, (name, text) => {
      runWithBusy(() => {
        recordHistory();
        const base = name.replace(/\.[^.]+$/, "");
        addMotifToLibrary(buildMotifFromSVG(base, ML.parseSVG(text), "SYMBOLE"));
        markProjectChanged();
      });
      e.target.value = "";
    });
  document.getElementById("import-decor").onchange = (e) =>
    readFiles(e.target.files, (name, text) => {
      runWithBusy(() => {
        recordHistory();
        const base = name.replace(/\.[^.]+$/, "");
        addMotifToLibrary(buildMotifFromSVG(base, ML.parseSVG(text), "DECOR"));
        markProjectChanged();
      });
      e.target.value = "";
    });
  document.getElementById("import-svg").onchange = (e) =>
    readFiles(e.target.files, (_n, text) => {
      const long = parseFloat(document.getElementById("dim-long").value) || 440;
      const short = parseFloat(document.getElementById("dim-short").value) || 325;
      setBoundaryFromSVG(ML.parseSVG(text).subpaths, long, short);
      e.target.value = "";
    });
  document.getElementById("btn-zone").onclick = addZone;
  document.getElementById("chk-margin").onchange = (e) => { state.margin.show = e.target.checked; drawBoundary(); };
  document.getElementById("margin-mm").oninput = (e) => { state.margin.mm = parseFloat(e.target.value) || 0; drawBoundary(); };
  document.getElementById("chk-frame").onchange = (e) => setFrameVisible(e.target.checked);
  document.getElementById("frame-w").oninput = resizeFrame;
  document.getElementById("frame-h").oninput = resizeFrame;
  document.getElementById("btn-export").onclick = exportSVG;
  document.getElementById("btn-export-png").onclick = () => exportPNG("png");
  document.getElementById("btn-export-jpeg").onclick = () => exportPNG("jpeg");
  document.getElementById("btn-pack").onclick = () =>
    packing(parseInt(document.getElementById("pack-count").value) || 30,
      parseFloat(document.getElementById("pack-smin").value) || 0.6,
      parseFloat(document.getElementById("pack-smax").value) || 1.2);
  document.getElementById("btn-dup").onclick = duplicateSel;
  document.getElementById("btn-del").onclick = deleteSel;
  document.getElementById("btn-up").onclick = () => zorder("up");
  document.getElementById("btn-down").onclick = () => zorder("down");
  document.getElementById("btn-front").onclick = () => zorder("front");
  document.getElementById("btn-back").onclick = () => zorder("back");
  document.getElementById("btn-clear").onclick = () => {
    if (confirm("Tout effacer le plan ?")) {
      recordHistory(); exitEdit(); select(null); mainLayer.destroyChildren(); mainLayer.batchDraw(); markProjectChanged();
    }
  };
  document.getElementById("btn-save").onclick = saveProject;
  document.getElementById("btn-undo").onclick = undo;
  document.getElementById("btn-sidebar-toggle").onclick = () => {
    document.getElementById("app").classList.toggle("collapsed");
    syncStageSize();
  };
  document.getElementById("sidebar").addEventListener("transitionend", syncStageSize);
  document.getElementById("load-project").onchange = (e) =>
    readFiles(e.target.files, (_n, text) => {
      recordHistory(); loadProject(JSON.parse(text)); markProjectChanged(); e.target.value = "";
    });

  updateInspector();
  refreshDraftCounter();
  restoreLocalProject();
})();
