/* print.js — rendu PDF A4 par feuille pour l'export impression.
   Tout en mm sens écran (aucun flip) : cf. DECISIONS.md §D-011.
   Expose ML.renderPrintPdf(scene, tiling, opts). */
(function () {
  const ML = (window.ML = window.ML || {});

  const DEFAULT_OPTS = { strokeMm: 0.3, fillGray: 230, dashMm: [3, 2], boundaryGray: 136 };

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

  ML.renderPrintPdf = function (scene, tiling, opts) {
    const o = Object.assign({}, DEFAULT_OPTS, opts);
    const doc = new window.jspdf.jsPDF({
      unit: "mm",
      format: "a4",
      orientation: tiling.landscape ? "landscape" : "portrait",
    });
    const margin = tiling.margin, uw = tiling.uw, uh = tiling.uh;

    const boundarySubpaths = [];
    if (scene.boundary) boundarySubpaths.push(scene.boundary);
    if (scene.holes) for (const h of scene.holes) boundarySubpaths.push(h);

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

        doc.path(toPathOps(ptsList, tx, ty));
        doc.setFillColor(o.fillGray, o.fillGray, o.fillGray);
        doc.fillEvenOdd();

        const [r, g, b] = hexToRgb(color);
        doc.path(toPathOps(ptsList, tx, ty));
        doc.setDrawColor(r, g, b);
        doc.setLineWidth(o.strokeMm);
        doc.stroke();
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
    });

    return doc;
  };
})();
