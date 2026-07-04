/* print.js — rendu PDF A4 par feuille pour l'export impression.
   Tout en mm sens écran (aucun flip) : cf. DECISIONS.md §D-011.
   Expose ML.renderPrintPdf(scene, tiling, opts). */
(function () {
  const ML = (window.ML = window.ML || {});

  const DEFAULT_OPTS = {
    // style: "outline" (défaut) = fond très clair + contour couleur calque (double trait visible) ;
    //        "fill" = aplat opaque couleur calque par trait, sans contour (test décalque).
    style: "outline", strokeMm: 0.3, fillGray: 230,
    dashMm: [3, 2], boundaryGray: 136,
    crossArmMm: 4, crossStrokeMm: 0.15, crossGray: 153, labelGray: 120,
    coverStrokeMm: 0.2,
  };

  function subpathBbox(pts) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of pts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY };
  }

  function intersects(a, b) {
    return a.maxX >= b.minX && a.minX <= b.maxX && a.maxY >= b.minY && a.minY <= b.maxY;
  }

  // sous-chemins fermés -> ops jsPDF doc.path() : un seul "path" pour tous les sous-chemins passés
  function toPathOps(subpathsPts, tx, ty) {
    const ops = [];
    for (const pts of subpathsPts) {
      if (pts.length < 2) continue;
      ops.push({ op: "m", c: [tx(pts[0][0]), ty(pts[0][1])] });
      for (let i = 1; i < pts.length; i++) ops.push({ op: "l", c: [tx(pts[i][0]), ty(pts[i][1])] });
      ops.push({ op: "h" });
    }
    return ops;
  }

  // couleurs de calque = format natif <input type="color"> ("#rrggbb")
  function hexToRgb(hex) {
    const n = parseInt(hex.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function boundarySubpathsOf(scene) {
    const out = [];
    if (scene.boundary) out.push(scene.boundary);
    if (scene.holes) for (const h of scene.holes) out.push(h);
    return out;
  }

  // bbox global de la scène (motifs + contour) en mm, sens écran.
  function sceneBbox(scene) {
    const all = boundarySubpathsOf(scene);
    for (const color in scene.surfaces) for (const s of scene.surfaces[color]) all.push(s.pts);
    let b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const pts of all) {
      const pb = subpathBbox(pts);
      if (pb.minX < b.minX) b.minX = pb.minX;
      if (pb.minY < b.minY) b.minY = pb.minY;
      if (pb.maxX > b.maxX) b.maxX = pb.maxX;
      if (pb.maxY > b.maxY) b.maxY = pb.maxY;
    }
    return { x: b.minX, y: b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY };
  }

  function drawCross(doc, x, y, armMm, grayVal, strokeMm) {
    doc.setDrawColor(grayVal, grayVal, grayVal);
    doc.setLineWidth(strokeMm);
    doc.line(x - armMm / 2, y, x + armMm / 2, y);
    doc.line(x, y - armMm / 2, x, y + armMm / 2);
  }

  // croix de recalage : 4 coins de la fenêtre utile + croix "fantômes" à `overlap` vers
  // l'intérieur sur chaque bord partagé avec une feuille voisine (DECISIONS.md §D-011 pt.3).
  function drawRegistrationCrosses(doc, p, tiling, o) {
    const { margin, uw, uh, overlap, cols, rows } = tiling;
    const pts = [
      [margin, margin], [margin + uw, margin],
      [margin, margin + uh], [margin + uw, margin + uh],
    ];
    if (p.col > 0) pts.push([margin + overlap, margin], [margin + overlap, margin + uh]);
    if (p.col < cols - 1) pts.push([margin + uw - overlap, margin], [margin + uw - overlap, margin + uh]);
    if (p.row > 0) pts.push([margin, margin + overlap], [margin + uw, margin + overlap]);
    if (p.row < rows - 1) pts.push([margin, margin + uh - overlap], [margin + uw, margin + uh - overlap]);
    for (const [x, y] of pts) drawCross(doc, x, y, o.crossArmMm, o.crossGray, o.crossStrokeMm);
  }

  function drawSheetLabel(doc, p, idx, tiling, o, dateStr) {
    doc.setFont(undefined, "normal");
    doc.setFontSize(8);
    doc.setTextColor(o.labelGray, o.labelGray, o.labelGray);
    const txt = `${p.label} — feuille ${idx + 1}/${tiling.pages.length} — échelle 1:1 — imprimé ${dateStr}`;
    doc.text(txt, tiling.margin, tiling.margin - 3);
  }

  function drawControlRule(doc, tiling, o) {
    const { pageW, pageH, margin } = tiling;
    const y = pageH - margin + 4;
    const x0 = pageW / 2 - 50, x1 = pageW / 2 + 50;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.15);
    doc.line(x0, y, x1, y);
    for (let mm = 0; mm <= 100; mm += 10) doc.line(x0 + mm, y - 1, x0 + mm, y + 1);
    doc.setFont(undefined, "normal");
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
    doc.text("contrôle : 100 mm", x1 + 3, y, { baseline: "middle" });
  }

  // page de garde : titre + consignes + plan d'assemblage réduit (contours only, grille des
  // fenêtres utiles superposée avec le libellé de chaque feuille).
  function drawCoverPage(doc, scene, tiling, o) {
    const { pageW, pageH, margin, uw, uh } = tiling;
    const N = tiling.pages.length;
    const orientation = tiling.landscape ? "paysage" : "portrait";

    doc.setFont(undefined, "normal");
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.text(`Pattern guitare — impression 1:1 sur ${N} feuilles A4 (${orientation})`, margin, margin + 6);

    doc.setFontSize(11);
    const lines = [
      "Imprimer à 100 % (échelle réelle, AUCUN ajustement à la page)",
      "Vérifier la règle de 100 mm sur chaque feuille",
      "Assembler par recouvrement 10 mm en superposant les croix",
    ];
    lines.forEach((line, i) => doc.text(`• ${line}`, margin, margin + 18 + i * 6));

    const planTop = margin + 18 + lines.length * 6 + 10;
    const planRect = { x: margin, y: planTop, w: uw, h: pageH - margin - planTop };

    const bbox = sceneBbox(scene);
    const s = Math.min(planRect.w / bbox.w, planRect.h / bbox.h, 1);
    const drawW = bbox.w * s, drawH = bbox.h * s;
    const offX = planRect.x + (planRect.w - drawW) / 2;
    const offY = planRect.y + (planRect.h - drawH) / 2;
    const tx = (x) => (x - bbox.x) * s + offX;
    const ty = (y) => (y - bbox.y) * s + offY;

    doc.setFontSize(9);
    doc.setTextColor(o.labelGray, o.labelGray, o.labelGray);
    doc.text(`plan réduit ~1:${Math.round(1 / s)}`, margin, planTop - 3);

    for (const color in scene.surfaces) {
      const ptsList = scene.surfaces[color].map((sf) => sf.pts);
      if (!ptsList.length) continue;
      doc.path(toPathOps(ptsList, tx, ty));
      const [r, g, b] = hexToRgb(color);
      doc.setDrawColor(r, g, b);
      doc.setLineWidth(o.coverStrokeMm);
      doc.stroke();
    }

    const boundarySubpaths = boundarySubpathsOf(scene);
    if (boundarySubpaths.length) {
      doc.path(toPathOps(boundarySubpaths, tx, ty));
      doc.setLineDashPattern(o.dashMm.map((v) => v * s), 0);
      doc.setDrawColor(o.boundaryGray, o.boundaryGray, o.boundaryGray);
      doc.setLineWidth(0.15);
      doc.stroke();
      doc.setLineDashPattern([], 0);
    }

    doc.setDrawColor(o.crossGray, o.crossGray, o.crossGray);
    doc.setLineWidth(0.1);
    doc.setFontSize(7);
    doc.setTextColor(o.labelGray, o.labelGray, o.labelGray);
    tiling.pages.forEach((p) => {
      const rx = tx(p.x), ry = ty(p.y), rw = uw * s, rh = uh * s;
      doc.rect(rx, ry, rw, rh, "S");
      doc.text(p.label, rx + rw / 2, ry + rh / 2, { align: "center", baseline: "middle" });
    });
  }

  ML.renderPrintPdf = function (scene, tiling, opts) {
    const o = Object.assign({}, DEFAULT_OPTS, opts);
    const doc = new window.jspdf.jsPDF({
      unit: "mm",
      format: "a4",
      orientation: tiling.landscape ? "landscape" : "portrait",
    });
    const margin = tiling.margin, uw = tiling.uw, uh = tiling.uh;
    const dateStr = new Date().toISOString().slice(0, 10);

    const boundarySubpaths = boundarySubpathsOf(scene);

    tiling.pages.forEach((p, idx) => {
      if (idx > 0) doc.addPage();

      const tx = (x) => x - p.x + margin;
      const ty = (y) => y - p.y + margin;
      const win = {
        minX: p.x - o.strokeMm,
        minY: p.y - o.strokeMm,
        maxX: p.x + uw + o.strokeMm,
        maxY: p.y + uh + o.strokeMm,
      };

      doc.saveGraphicsState();
      doc.rect(margin, margin, uw, uh, null);
      doc.clip();
      doc.discardPath();

      for (const color in scene.surfaces) {
        const visible = scene.surfaces[color].filter((s) => intersects(subpathBbox(s.pts), win));
        if (!visible.length) continue;
        const ptsList = visible.map((s) => s.pts);

        if (o.style === "fill") {
          // aplat plein : remplissage opaque dans la couleur du calque, aucun contour.
          const [r, g, b] = hexToRgb(color);
          doc.path(toPathOps(ptsList, tx, ty));
          doc.setFillColor(r, g, b);
          doc.fillEvenOdd();
        } else {
          doc.path(toPathOps(ptsList, tx, ty));
          doc.setFillColor(o.fillGray, o.fillGray, o.fillGray);
          doc.fillEvenOdd();

          const [r, g, b] = hexToRgb(color);
          doc.path(toPathOps(ptsList, tx, ty));
          doc.setDrawColor(r, g, b);
          doc.setLineWidth(o.strokeMm);
          doc.stroke();
        }
      }

      const visibleBoundary = boundarySubpaths.filter((pts) => intersects(subpathBbox(pts), win));
      if (visibleBoundary.length) {
        doc.path(toPathOps(visibleBoundary, tx, ty));
        doc.setLineDashPattern(o.dashMm, 0);
        doc.setDrawColor(o.boundaryGray, o.boundaryGray, o.boundaryGray);
        doc.setLineWidth(0.2);
        doc.stroke();
        doc.setLineDashPattern([], 0);
      }

      doc.restoreGraphicsState();

      drawRegistrationCrosses(doc, p, tiling, o);
      drawSheetLabel(doc, p, idx, tiling, o, dateStr);
      drawControlRule(doc, tiling, o);
    });

    doc.insertPage(1);
    doc.setPage(1);
    drawCoverPage(doc, scene, tiling, o);

    return doc;
  };
})();
