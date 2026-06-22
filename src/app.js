/* app.js — Motif Layout. Édition + packing + export SVG avec occlusion par surfaces.
   Dépend de: Konva (global), ClipperLib (global), ML.parseSVG (svg.js), ML.buildZones/motifFill/occludeSurfaces/writeSVG (geometry.js). */
(function () {
  const ML = window.ML;
  const PX_PER_MM = 4; // échelle d'affichage (lossless: reconverti à l'export)

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
  const maskLayer = new Konva.Layer({ listening: false });     // masque hors-corps + cavités (aperçu propre)
  const zonesLayer = new Konva.Layer();   // zones interdites manuelles
  const guideLayer = new Konva.Layer();   // cadre laser déplaçable/orientable (repère zone de gravure machine)
  const uiLayer = new Konva.Layer();
  stage.add(boundaryLayer, mainLayer, maskLayer, zonesLayer, guideLayer, uiLayer);
  const BG = "#1c1f27"; // couleur de fond (= hors zone à graver)

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
  tr.on("transformend", markProjectChanged);

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
    item.append(cv, label);
    item.title = "Cliquer pour ajouter au plan";
    item.onclick = () => addInstance(motif);
    document.getElementById("library").appendChild(item);
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

  // silhouette du motif (occlusion "sticker" + fond blanc) : depuis motif.surface si présent
  // (D-006), sinon la silhouette dérivée des zones (motif.silhouette). Lecture seule — ne mute
  // jamais motif.silhouette (T6 le recalcule lui-même à l'édition).
  function motifSilhouettePts(motif) {
    if (!motif.surface) return motif.silhouette;
    return ML.silhouetteFromSurface(Object.values(motif.surface).flat());
  }

  function drawThumb(cv, motif) {
    const ctx = cv.getContext("2d");
    const silhouette = motifSilhouettePts(motif);
    const xs = silhouette.map((p) => p[0]), ys = silhouette.map((p) => p[1]);
    const [minx, maxx] = minMax(xs), [miny, maxy] = minMax(ys);
    const w = maxx - minx, h = maxy - miny;
    const s = Math.min(56 / (w || 1), 56 / (h || 1));
    ctx.save(); ctx.translate(32, 32); ctx.scale(s, s);
    if (motif.role !== "DECOR") {
      ctx.fillStyle = "#fff";
      ctx.beginPath(); poly(ctx, silhouette, true); ctx.fill();
    }
    const fillGroups = exportFill(motif);
    for (const color in fillGroups) {
      ctx.beginPath();
      for (const region of fillGroups[color]) poly(ctx, region.pts, true);
      ctx.fillStyle = color;
      ctx.fill("evenodd");
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
    // (see-through : ses vides laissent voir ce qui est placé dessous, cf. D-005)
    const silhouette = motifSilhouettePts(motif);
    if (motif.role !== "DECOR") {
      g.add(new Konva.Line({ points: silhouette.flat(), closed: true, fill: "#ffffff", listening: true }));
    } else {
      // décor see-through : fill transparent (rgba alpha 0) — invisible à l'écran mais peint
      // sur le canvas de hit avec sa colorKey opaque, donc toute la silhouette reste
      // cliquable/déplaçable, et le groupe garde une bbox mesurable (pas de NaN Transformer).
      g.add(new Konva.Line({ points: silhouette.flat(), closed: true, listening: true, fill: "rgba(0,0,0,0)" }));
    }
    // surfaces : une par couleur focale, trous VIDE laissent voir le fond blanc (evenodd, imite drawBoundary)
    const fillGroups = exportFill(motif);
    for (const color in fillGroups) {
      const contours = fillGroups[color];
      const shape = new Konva.Shape({
        fill: color,
        sceneFunc: (ctx, shape) => {
          const c = ctx._context;
          c.beginPath();
          for (const region of contours) tracePoly(c, region.pts);
          c.fillStyle = shape.fill();
          c.fill("evenodd");
        },
      });
      g.add(shape);
    }
  }
  // re-rend toutes les instances d'un motif + sa vignette (après édition de rôles de zones)
  function rerenderMotif(motif) {
    mainLayer.getChildren((n) => n.getClassName() === "Group" && n.getAttr("motifId") === motif.id)
      .forEach((g) => fillGroupContent(g, motif));
    mainLayer.batchDraw();
    const cv = motifThumbs[motif.id];
    if (cv) drawThumb(cv, motif);
  }
  function makeGroup(motif, x, y, rotation, scale) {
    const g = new Konva.Group({ x, y, rotation: rotation || 0, scaleX: scale || 1, scaleY: scale || 1, draggable: true });
    g.setAttr("motifId", motif.id);
    fillGroupContent(g, motif);
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
    const xs = motif.silhouette.map((p) => p[0]), ys = motif.silhouette.map((p) => p[1]);
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
    boundaryLayer.destroyChildren(); maskLayer.destroyChildren();
    if (!state.boundary) { boundaryLayer.batchDraw(); maskLayer.batchDraw(); return; }
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
    }
    // masque : tout hors corps + cavités, en couleur de fond (aperçu net)
    maskLayer.add(new Konva.Shape({
      listening: false,
      sceneFunc: (ctx) => {
        const c = ctx._context, B = 1e5;
        c.beginPath(); c.rect(-B, -B, 2 * B, 2 * B);
        tracePoly(c, state.boundary); for (const h of holes) tracePoly(c, h);
        c.fillStyle = BG; c.fill("evenodd");
      },
    }));
    boundaryLayer.batchDraw(); maskLayer.batchDraw();
  }

  // polygones réservés = cavités auto (SVG) + zones manuelles
  function reservedPolys() { return (state.holes || []).concat(getZonePolys()); }

  // ─── inspecteur (instance sélectionnée) ─────────────────────────────────────
  function updateInspector() {
    const g = selected();
    const box = document.getElementById("inspector");
    if (!g) { box.style.display = "none"; hideZoneEditor(); hideMotifEditor(); hideStyletEditor(); return; }
    box.style.display = "block";
    document.getElementById("insp-rot").value = Math.round(g.rotation());
    document.getElementById("insp-scale").value = g.scaleX().toFixed(2);
    const motif = state.motifs.find((x) => x.id === g.getAttr("motifId"));
    if (motif) { populateZoneEditor(motif); populateMotifEditor(motif); populateStyletEditor(motif); } else { hideZoneEditor(); hideMotifEditor(); hideStyletEditor(); }
  }

  // ─── éditeur rôle/couleur/marge du motif sélectionné ────────────────────────
  function hideMotifEditor() {
    document.getElementById("motif-editor").style.display = "none";
  }
  function populateMotifEditor(motif) {
    document.getElementById("insp-role").value = motif.role;
    document.getElementById("insp-color").value = motif.color;
    document.getElementById("insp-margin").value = motif.margin;
    document.getElementById("motif-editor").style.display = "block";
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

  // ─── édition au stylet (D-006 chantier 3) : pinceau/gomme verrouillés sur le motif ──────────
  // edit.node = instance Konva sur laquelle le tracé est capté (mappage écran->local) ; la
  // mutation (motif.surface) s'applique au motif de bibliothèque -> rerenderMotif propage à
  // toutes ses copies. Verrouillage : draggable désactivé partout, clics/dragstart ignorés
  // (cf. guards plus haut), tr+moveHandle masqués ; deux doigts restent le pan (T2).
  const edit = { active: false, motifId: null, node: null, tool: "brush", sizeMm: 3, drawing: false, pts: [] };
  let editPreview = null;

  function setCanvasLocked(locked) {
    mainLayer.getChildren((n) => n.getClassName() === "Group").forEach((g) => g.draggable(!locked));
    zonesLayer.getChildren().forEach((z) => z.draggable(!locked));
    guideLayer.getChildren().forEach((f) => f.draggable(!locked));
  }

  function hideStyletEditor() {
    document.getElementById("stylet-editor").style.display = "none";
  }
  function populateStyletEditor(motif) {
    const inEdit = edit.active && edit.motifId === motif.id;
    document.getElementById("stylet-editor").style.display = "block";
    document.getElementById("btn-edit").textContent = inEdit ? "Sortir de l'édition" : "Entrer en édition";
    document.getElementById("stylet-tools").style.display = inEdit ? "block" : "none";
  }

  function enterEdit() {
    const g = selected();
    const motif = selectedMotif();
    if (!g || !motif) return;
    edit.active = true; edit.motifId = motif.id; edit.node = g;
    stage.draggable(false);
    setCanvasLocked(true);
    tr.visible(false); moveHandle.visible(false);
    uiLayer.batchDraw();
    populateStyletEditor(motif);
  }
  function exitEdit() {
    if (!edit.active) return;
    const motif = state.motifs.find((m) => m.id === edit.motifId);
    edit.active = false; edit.drawing = false; edit.pts = [];
    if (editPreview) { editPreview.destroy(); editPreview = null; }
    setCanvasLocked(false);
    stage.draggable(true);
    tr.visible(true);
    positionMoveHandle();
    uiLayer.batchDraw();
    if (motif) populateStyletEditor(motif);
  }

  // applique un trait terminé (déjà en coords locales du motif) : union (pinceau) ou
  // différence (gomme) sous la couleur focale, puis recalcule la silhouette et re-rend.
  function applyStroke(motif, localPts) {
    recordHistory();
    if (!motif.surface) motif.surface = exportFill(motif); // init paresseuse (D-006)
    const radiusPx = (edit.sizeMm * PX_PER_MM) / 2;
    const poly = ML.strokeToPolygon(localPts, radiusPx);
    const key = motif.color;
    const current = motif.surface[key] || [];
    motif.surface[key] = edit.tool === "brush" ? ML.surfaceUnion(current, poly) : ML.surfaceDifference(current, poly);
    motif.silhouette = ML.silhouetteFromSurface(Object.values(motif.surface).flat());
    rerenderMotif(motif);
    markProjectChanged();
  }

  function localPoint() {
    const p = edit.node.getRelativePointerPosition();
    return [p.x, p.y];
  }
  function startStroke(motif) {
    edit.drawing = true;
    edit.pts = [localPoint()];
    editPreview = new Konva.Line({
      points: edit.pts.flat(), stroke: edit.tool === "brush" ? motif.color : "#ff0000",
      strokeWidth: edit.sizeMm * PX_PER_MM, lineCap: "round", lineJoin: "round", opacity: 0.55, listening: false,
    });
    edit.node.add(editPreview);
  }
  function moveStroke() {
    edit.pts.push(localPoint());
    editPreview.points(edit.pts.flat());
    mainLayer.batchDraw();
  }
  function endStroke() {
    edit.drawing = false;
    if (editPreview) { editPreview.destroy(); editPreview = null; }
    const motif = state.motifs.find((m) => m.id === edit.motifId);
    if (motif && edit.pts.length) applyStroke(motif, edit.pts);
    edit.pts = [];
  }
  // capté au niveau du stage (pas du groupe) : la portée est le motif verrouillé, pas ce qui
  // est sous le pointeur. Deux doigts = pan (T2) a priorité, donc ignoré ici.
  stage.on("mousedown touchstart", (e) => {
    if (!edit.active) return;
    if (e.evt.touches && e.evt.touches.length !== 1) return;
    e.evt.preventDefault();
    const motif = state.motifs.find((m) => m.id === edit.motifId);
    if (motif) startStroke(motif);
  });
  stage.on("mousemove touchmove", (e) => {
    if (!edit.active || !edit.drawing) return;
    if (e.evt.touches && e.evt.touches.length !== 1) return;
    e.evt.preventDefault();
    moveStroke();
  });
  stage.on("mouseup touchend touchcancel", () => { if (edit.active && edit.drawing) endStroke(); });

  function setEditTool(tool) {
    edit.tool = tool;
    document.getElementById("tool-brush").classList.toggle("on", tool === "brush");
    document.getElementById("tool-eraser").classList.toggle("on", tool === "eraser");
  }
  document.getElementById("btn-edit").onclick = () => { if (edit.active) exitEdit(); else enterEdit(); };
  document.getElementById("tool-brush").onclick = () => setEditTool("brush");
  document.getElementById("tool-eraser").onclick = () => setEditTool("eraser");
  document.getElementById("brush-size").oninput = (e) => { edit.sizeMm = parseFloat(e.target.value) || 3; };

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
    if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSel(); }
    else if (e.key === "d" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); duplicateSel(); }
    else if (e.key === "]") zorder("up"); else if (e.key === "[") zorder("down");
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
      const silhouette = mapPts(motifSilhouettePts(m));
      const fillPolys = groups.flatMap((gr) => gr.paths.map((p) => p.pts));
      const marginPx = (m.margin || 0) * PX_PER_MM;
      return {
        role: m.role,
        groups,
        occluder: m.role === "DECOR" ? fillPolys : [silhouette],
        decorClear: ML.offsetPolygon(silhouette, marginPx),
      };
    });
  }
  function exportSVG() {
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
    document.getElementById("library").innerHTML = "";
    for (const k in motifThumbs) delete motifThumbs[k];
    state.motifs = []; state.boundary = data.boundary || null; state.holes = data.holes || null; state.contourRef = data.contourRef || null; state.seq = 0;
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
  function readFiles(files, cb) {
    [...files].forEach((f) => { const r = new FileReader(); r.onload = () => cb(f.name, r.result); r.readAsText(f); });
  }

  // ─── câblage UI ──────────────────────────────────────────────────────────────
  document.getElementById("import-perso").onchange = (e) =>
    readFiles(e.target.files, (name, text) => {
      recordHistory();
      const base = name.replace(/\.[^.]+$/, "");
      addMotifToLibrary(buildMotifFromSVG(base, ML.parseSVG(text), "PERSONNAGE"));
      markProjectChanged();
      e.target.value = "";
    });
  document.getElementById("import-symbole").onchange = (e) =>
    readFiles(e.target.files, (name, text) => {
      recordHistory();
      const base = name.replace(/\.[^.]+$/, "");
      addMotifToLibrary(buildMotifFromSVG(base, ML.parseSVG(text), "SYMBOLE"));
      markProjectChanged();
      e.target.value = "";
    });
  document.getElementById("import-decor").onchange = (e) =>
    readFiles(e.target.files, (name, text) => {
      recordHistory();
      const base = name.replace(/\.[^.]+$/, "");
      addMotifToLibrary(buildMotifFromSVG(base, ML.parseSVG(text), "DECOR"));
      markProjectChanged();
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
  restoreLocalProject();
})();
