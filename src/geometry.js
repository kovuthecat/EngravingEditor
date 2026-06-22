/* geometry.js — occlusion "autocollant" via ClipperLib.
   Tout en coordonnées écran (px). La conversion px->mm se fait à l'export.
   Expose ML.occludeSurfaces(...), ML.writeSVG(...) et helpers. */
(function () {
  const ML = (window.ML = window.ML || {});
  const S = 1000; // facteur entier Clipper

  const toInt = (pts) => pts.map((p) => ({ X: Math.round(p[0] * S), Y: Math.round(p[1] * S) }));
  const fromInt = (path) => path.map((p) => [p.X / S, p.Y / S]);

  function area(pts) {
    let a = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
      a += x1 * y2 - x2 * y1;
    }
    return a / 2;
  }
  ML.absArea = (pts) => Math.abs(area(pts));
  // aire signée (convention Clipper : contours extérieurs positifs, trous négatifs) — pour sommer
  // l'aire nette d'un groupe de contours evenodd (trous inclus) sans compter les trous en positif.
  ML.signedArea = area;

  // enveloppe convexe (fallback silhouette)
  ML.convexHull = function (pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (p.length < 3) return p;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
    const upper = [];
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
    lower.pop(); upper.pop();
    return lower.concat(upper);
  };

  // union d'un ensemble de polygones (chacun = [[x,y]..]) -> Paths int Clipper
  function unionInt(accInt, polys) {
    const c = new ClipperLib.Clipper();
    if (accInt && accInt.length) c.AddPaths(accInt, ClipperLib.PolyType.ptSubject, true);
    for (const poly of polys) c.AddPath(toInt(poly), ClipperLib.PolyType.ptSubject, true);
    const sol = new ClipperLib.Paths();
    c.Execute(ClipperLib.ClipType.ctUnion, sol, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
    return sol;
  }

  // découpe de paths (closed ou open) par un clip int donné. Les paths du sujet sont soumis
  // EN UNE SEULE FOIS (AddPaths) au même Execute : un découpage par path indépendant casserait
  // la relation d'orientation extérieur/trou entre contours sœurs (un trou ressortirait avec un
  // signe d'aire inversé, donc "rempli" au lieu de "soustrait" dès qu'il traverse cette fonction).
  function clipBy(paths, closed, clipInt, clipType) {
    if (!paths.length) return [];
    if (!clipInt || !clipInt.length) return paths.map((p) => ({ pts: p.pts.slice(), closed: p.closed }));
    const c = new ClipperLib.Clipper();
    c.AddPaths(paths.map((p) => toInt(p.pts)), ClipperLib.PolyType.ptSubject, closed);
    c.AddPaths(clipInt, ClipperLib.PolyType.ptClip, true);
    const out = [];
    if (closed) {
      const sol = new ClipperLib.Paths();
      c.Execute(clipType, sol, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
      for (const path of sol) out.push({ pts: fromInt(path), closed: true });
    } else {
      const tree = new ClipperLib.PolyTree();
      c.Execute(clipType, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
      const open = ClipperLib.Clipper.OpenPathsFromPolyTree(tree);
      for (const path of open) out.push({ pts: fromInt(path), closed: false });
    }
    return out;
  }

  // point dans polygone (ray casting) ; point intérieur robuste (centroïde, sinon milieu d'arête nudgé)
  ML.pointInPoly = function (pt, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  ML.interiorPoint = function (pts) {
    const c = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
    if (ML.pointInPoly(c, pts)) return c;
    for (let i = 0; i < pts.length - 1; i++) {
      const m = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
      const q = [(m[0] + c[0]) / 2, (m[1] + c[1]) / 2];
      if (ML.pointInPoly(q, pts)) return q;
    }
    return c;
  };

  // découpe paths.subpaths (parseSVG) en zones {id,pts,closed,color,parent,depth,role} (ordre document).
  // parent = index du plus petit sous-chemin de MÊME couleur contenant le point intérieur. role : depth pair -> REMPLI.
  ML.buildZones = function (paths) {
    const flat = [];
    for (const p of paths) for (const s of p.subpaths) flat.push({ pts: s.pts, closed: s.closed, color: p.color });
    const A = flat.map((z) => ML.absArea(z.pts));
    const IP = flat.map((z) => ML.interiorPoint(z.pts));
    // Préfiltre bbox pour éviter les appels coûteux pointInPoly sur des paires sans relation parent/enfant
    const bbox = flat.map((z) => {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [x, y] of z.pts) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      return { minX, maxX, minY, maxY };
    });
    const parent = flat.map((z, i) => {
      let best = -1, bestA = Infinity;
      for (let j = 0; j < flat.length; j++) {
        if (i === j || flat[j].color !== z.color) continue;
        if (A[j] > A[i] && A[j] < bestA) {
          const p = IP[i];
          const b = bbox[j];
          if (p[0] < b.minX || p[0] > b.maxX || p[1] < b.minY || p[1] > b.maxY) continue;
          if (ML.pointInPoly(IP[i], flat[j].pts)) { bestA = A[j]; best = j; }
        }
      }
      return best;
    });
    const depth = flat.map((_, i) => { let d = 0, k = i; while (parent[k] !== -1) { d++; k = parent[k]; } return d; });
    return flat.map((z, i) => ({
      id: "z" + i,
      pts: z.pts,
      closed: z.closed,
      color: z.color,
      parent: parent[i],
      depth: depth[i],
      role: depth[i] % 2 === 0 ? "REMPLI" : "VIDE",
    }));
  };

  // union simple d'un ensemble de polygones -> [[x,y]..][] (coords réelles)
  ML.unionPolys = function (polys) {
    return unionInt(new ClipperLib.Paths(), polys).map(fromInt);
  };

  // offset (rond) d'un polygone fermé par une distance signée `deltaInt` (unités entières Clipper).
  // ClipperOffset corrige l'orientation lui-même (FixOrientations).
  // un contour non convexe peut se scinder en plusieurs anneaux -> tableau de contours.
  function offsetPolygonInt(pts, deltaInt) {
    const co = new ClipperLib.ClipperOffset();
    co.AddPath(toInt(pts), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
    const sol = new ClipperLib.Paths();
    co.Execute(sol, deltaInt);
    return sol.map(fromInt);
  }

  // offset intérieur (rétrécit) d'un polygone fermé par une distance `d` (mêmes unités que pts).
  ML.insetPolygon = function (pts, d) {
    if (!pts || pts.length < 3 || d <= 0) return [pts];
    return offsetPolygonInt(pts, -d * S);
  };

  // offset extérieur (élargit) d'un polygone fermé par une distance `d` (mêmes unités que pts) —
  // sert à `decorClear` (D-005) : la marge de dégagement d'un motif posé sur le décor.
  ML.offsetPolygon = function (pts, d) {
    if (!pts || pts.length < 3 || d <= 0) return [pts];
    return offsetPolygonInt(pts, d * S);
  };

  // région d'une zone = son contour - union de ses enfants directs (Clipper ctDifference) -> [{pts,closed}]
  ML.regionOf = function (zone, children) {
    const childInt = children && children.length ? unionInt(new ClipperLib.Paths(), children.map((c) => c.pts)) : [];
    return clipBy([{ pts: zone.pts, closed: true }], true, childInt, ClipperLib.ClipType.ctDifference);
  };

  // surface gravée d'un motif = union des régions REMPLI, regroupées par couleur -> { [color]: [{pts,closed}] }
  ML.motifFill = function (zones) {
    const byColor = {};
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (z.role !== "REMPLI") continue;
      const children = zones.filter((c) => c.parent === i);
      const region = ML.regionOf(z, children);
      (byColor[z.color] = byColor[z.color] || []).push(...region);
    }
    const out = {};
    for (const color in byColor) {
      out[color] = ML.unionPolys(byColor[color].map((r) => r.pts)).map((pts) => ({ pts, closed: true }));
    }
    return out;
  };

  // silhouette (occlusion "sticker") = union des contours les plus extérieurs (depth 0, toutes couleurs)
  ML.motifSilhouette = function (zones) {
    const outer = zones.filter((z) => z.depth === 0).map((z) => z.pts);
    if (!outer.length) return [];
    const pieces = ML.unionPolys(outer);
    if (!pieces.length) return [];
    let best = pieces[0], bestA = ML.absArea(pieces[0]);
    for (let i = 1; i < pieces.length; i++) {
      const a = ML.absArea(pieces[i]);
      if (a > bestA) { bestA = a; best = pieces[i]; }
    }
    const pts = best.slice();
    if (pts.length && (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1])) pts.push(pts[0]);
    return pts;
  };

  // édition au stylet (D-006 chantier 3) : tracé -> polygone épais, union/différence de surface,
  // silhouette depuis une surface (plutôt que des zones SVG).

  // offset open-round (bouts/joints arrondis) d'une polyligne `pts` par `radiusPx` -> polygone(s)
  // fermé(s) représentant l'épaisseur du trait. Même mécanique entière que `offsetPolygonInt`.
  // Un seul point (clic sans déplacement) -> micro-segment pour obtenir un cercle (bouts ronds).
  ML.strokeToPolygon = function (pts, radiusPx) {
    if (!pts || !pts.length || radiusPx <= 0) return [];
    const line = pts.length === 1 ? [pts[0], [pts[0][0] + 1e-3, pts[0][1]]] : pts;
    const co = new ClipperLib.ClipperOffset();
    co.AddPath(toInt(line), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etOpenRound);
    const sol = new ClipperLib.Paths();
    co.Execute(sol, radiusPx * S);
    return sol.map((path) => ({ pts: fromInt(path), closed: true }));
  };

  // union (pinceau) de deux jeux de contours fermés {pts,closed} -> [{pts,closed:true}].
  // Conserve les trous (orientation) comme `motifFill`.
  ML.surfaceUnion = function (contours, addContours) {
    const polys = (contours || []).map((c) => c.pts).concat((addContours || []).map((c) => c.pts));
    return unionInt(new ClipperLib.Paths(), polys).map((path) => ({ pts: fromInt(path), closed: true }));
  };

  // différence (gomme) : retire `cutContours` de `contours` -> [{pts,closed:true}].
  ML.surfaceDifference = function (contours, cutContours) {
    const cutInt = unionInt(new ClipperLib.Paths(), (cutContours || []).map((c) => c.pts));
    return clipBy(contours || [], true, cutInt, ClipperLib.ClipType.ctDifference);
  };

  // silhouette (contour extérieur) d'un jeu de contours fermés {pts,closed} — délègue à
  // `motifSilhouette` en adaptant l'entrée « contours » en pseudo-zones de depth 0.
  ML.silhouetteFromSurface = function (contours) {
    return ML.motifSilhouette((contours || []).map((c) => ({ pts: c.pts, depth: 0 })));
  };

  /* Calcule la géométrie visible (surfaces fermées, par couleur). Règle D-005 (décor + marge).
     instances: tableau ordonné du BAS vers le HAUT, chacun:
        { role, groups:[{color, paths:[{pts,closed:true}]}],
          occluder:[[x,y]..][], decorClear:[[x,y]..][] }  (en px monde)
     visible_i = fill_i − union(maskFor(j,i)) pour chaque j au-dessus de i, avec
     maskFor(j,i) = (i est DECOR) ? decorClear_j : occluder_j.
     boundary: [[x,y]..] (px) ou null  -> intersection finale
     holes: zones interdites (px) -> soustraction finale
     -> { [color]: [{pts,closed:true}] } visibles (px), par couleur. */
  ML.occludeSurfaces = function (instances, boundary, holes) {
    const visible = {}; // color -> [{pts,closed}]
    let aboveOccluder = new ClipperLib.Paths(); // union des occluders au-dessus (int)
    let aboveDecorClear = new ClipperLib.Paths(); // union des decorClear au-dessus (int)
    for (let i = instances.length - 1; i >= 0; i--) {
      const inst = instances[i];
      const above = inst.role === "DECOR" ? aboveDecorClear : aboveOccluder;
      for (const g of inst.groups) {
        const clipped = above.length
          ? clipBy(g.paths, true, above, ClipperLib.ClipType.ctDifference)
          : g.paths.map((p) => ({ pts: p.pts.slice(), closed: true }));
        (visible[g.color] = visible[g.color] || []).push(...clipped);
      }
      aboveOccluder = unionInt(aboveOccluder, inst.occluder);
      aboveDecorClear = unionInt(aboveDecorClear, inst.decorClear);
    }
    const bInt = boundary && boundary.length >= 3 ? unionInt(new ClipperLib.Paths(), [boundary]) : null;
    const hInt = holes && holes.length ? unionInt(new ClipperLib.Paths(), holes) : null;
    const out = {};
    for (const color in visible) {
      let paths = visible[color];
      if (bInt) paths = clipBy(paths, true, bInt, ClipperLib.ClipType.ctIntersection);
      if (hInt) paths = clipBy(paths, true, hInt, ClipperLib.ClipType.ctDifference);
      out[color] = paths;
    }
    return out;
  };

  // simplification Douglas-Peucker (réduit le nombre de points)
  ML.simplify = function (pts, tol) {
    if (pts.length < 3) return pts.slice();
    const keep = new Array(pts.length).fill(false);
    keep[0] = keep[pts.length - 1] = true;
    const stack = [[0, pts.length - 1]];
    const tol2 = tol * tol;
    while (stack.length) {
      const [a, b] = stack.pop();
      const [ax, ay] = pts[a], [bx, by] = pts[b];
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
      let idx = -1, max = 0;
      for (let i = a + 1; i < b; i++) {
        const [px, py] = pts[i];
        const t = ((px - ax) * dx + (py - ay) * dy) / len2;
        const cx = ax + t * dx, cy = ay + t * dy;
        const d2 = (px - cx) ** 2 + (py - cy) ** 2;
        if (d2 > max) { max = d2; idx = i; }
      }
      if (max > tol2 && idx !== -1) { keep[idx] = true; stack.push([a, idx], [idx, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  };

  // chaîne des polylignes ouvertes en boucles par proximité d'extrémités
  ML.chainOpen = function (segs, tol) {
    const tol2 = tol * tol;
    const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
    const rem = segs.map((s) => s.slice());
    const out = [];
    while (rem.length) {
      let chain = rem.shift();
      let changed = true;
      while (changed) {
        changed = false;
        for (let k = 0; k < rem.length; k++) {
          const s = rem[k];
          if (d2(chain[chain.length - 1], s[0]) < tol2) chain = chain.concat(s.slice(1));
          else if (d2(chain[chain.length - 1], s[s.length - 1]) < tol2) chain = chain.concat(s.slice(0, -1).reverse());
          else if (d2(chain[0], s[s.length - 1]) < tol2) chain = s.slice(0, -1).concat(chain);
          else if (d2(chain[0], s[0]) < tol2) chain = s.slice().reverse().slice(0, -1).concat(chain);
          else continue;
          rem.splice(k, 1); changed = true; break;
        }
      }
      out.push({ pts: chain, closed: chain.length >= 3 && d2(chain[0], chain[chain.length - 1]) < tol2 });
    }
    return out;
  };

  // silhouette « autocollant » : reconstruit le contour extérieur (chaîne les fragments
  // ouverts), prend la boucle de plus grande aire, et la ferme. Fallback : enveloppe convexe.
  ML.buildSilhouette = function (polylines, tol) {
    const closed = polylines.filter((p) => p.closed).map((p) => ({ pts: p.pts, closed: true }));
    const openSegs = polylines.filter((p) => !p.closed).map((p) => p.pts);
    const cand = closed.concat(ML.chainOpen(openSegs, tol));
    let best = null, ba = -1;
    for (const c of cand) { const a = ML.absArea(c.pts); if (a > ba) { ba = a; best = c; } }
    if (!best || ba < 1) return ML.convexHull(polylines.flatMap((p) => p.pts));
    const pts = best.pts.slice();
    if (pts.length && (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1])) pts.push(pts[0]); // force fermé
    return pts;
  };

  // px -> mm avec flip Y, normalisé en coords positives
  ML.pxPathsToMm = function (paths, pxPerMm) {
    let maxY = -Infinity, minX = Infinity, minY = Infinity;
    for (const p of paths) for (const [x, y] of p.pts) { maxY = Math.max(maxY, -y); minY = Math.min(minY, -y); minX = Math.min(minX, x); }
    if (!isFinite(minX)) return [];
    return paths.map((p) => ({
      closed: p.closed,
      pts: p.pts.map(([x, y]) => [(x - minX) / pxPerMm, (-y - minY) / pxPerMm]),
    }));
  };

  // SVG couleur (export) : un <path fill=couleur fill-rule="evenodd"> par groupe, en mm.
  // groupsMm: { [color]: [{pts,closed:true}] } déjà en mm (via pxPathsToMm) ; viewBoxMm: { w, h }.
  ML.writeSVG = function (groupsMm, viewBoxMm) {
    const { w, h } = viewBoxMm;
    const parts = [];
    for (const color in groupsMm) {
      const contours = groupsMm[color].filter((p) => p.pts.length >= 2);
      if (!contours.length) continue;
      const d = contours.map((p) => "M " + p.pts.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(" L ") + " Z").join(" ");
      parts.push(`  <path fill="${color}" fill-rule="evenodd" d="${d}"/>`);
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm">\n${parts.join("\n")}\n</svg>\n`;
  };
})();
