/* svg.js — import des chemins SVG (<path d="...">) en sous-chemins fermés.
   Aplatit les Bézier (C/S/Q/T) et gère M/L/H/V/Z (absolu + relatif).
   Coordonnées SVG (y vers le bas, comme l'espace écran).
   Expose ML.parseSVG(text) -> { paths:[{color, subpaths:[{pts,closed}]}], subpaths:[{pts,closed}..] } */
(function () {
  const ML = (window.ML = window.ML || {});
  const STEPS = 18; // segments par courbe de Bézier

  function tokenize(d) {
    const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
    const toks = []; let m;
    while ((m = re.exec(d))) toks.push(m[1] || parseFloat(m[2]));
    return toks;
  }

  function cubic(p0, p1, p2, p3, out) {
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS, u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, e = t * t * t;
      out.push([a * p0[0] + b * p1[0] + c * p2[0] + e * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + e * p3[1]]);
    }
  }
  function quad(p0, p1, p2, out) {
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS, u = 1 - t;
      out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
    }
  }

  function parsePath(d) {
    const t = tokenize(d);
    const subs = [];
    let cur = null, cx = 0, cy = 0, sx = 0, sy = 0, i = 0;
    let cmd = "", prevCtrlC = null, prevCtrlQ = null;
    const num = () => t[i++];
    while (i < t.length) {
      if (typeof t[i] === "string") cmd = t[i++];
      const rel = cmd === cmd.toLowerCase();
      const C = cmd.toUpperCase();
      const ox = rel ? cx : 0, oy = rel ? cy : 0;

      if (C === "M") {
        cx = ox + num(); cy = oy + num();
        if (cur && cur.pts.length) subs.push(cur);
        cur = { pts: [[cx, cy]], closed: false }; sx = cx; sy = cy;
        cmd = rel ? "l" : "L"; // M suivi de coords = lineto implicite
        prevCtrlC = prevCtrlQ = null; continue;
      }
      if (C === "Z") { if (cur) { cur.closed = true; cur.pts.push([sx, sy]); subs.push(cur); cur = null; } cx = sx; cy = sy; prevCtrlC = prevCtrlQ = null; continue; }
      if (C === "L") { cx = ox + num(); cy = oy + num(); cur.pts.push([cx, cy]); prevCtrlC = prevCtrlQ = null; continue; }
      if (C === "H") { cx = ox + num(); cur.pts.push([cx, cy]); prevCtrlC = prevCtrlQ = null; continue; }
      if (C === "V") { cy = oy + num(); cur.pts.push([cx, cy]); prevCtrlC = prevCtrlQ = null; continue; }
      if (C === "C") {
        const p1 = [ox + num(), oy + num()], p2 = [ox + num(), oy + num()], p3 = [ox + num(), oy + num()];
        cubic([cx, cy], p1, p2, p3, cur.pts); cx = p3[0]; cy = p3[1]; prevCtrlC = p2; prevCtrlQ = null; continue;
      }
      if (C === "S") {
        const p1 = prevCtrlC ? [2 * cx - prevCtrlC[0], 2 * cy - prevCtrlC[1]] : [cx, cy];
        const p2 = [ox + num(), oy + num()], p3 = [ox + num(), oy + num()];
        cubic([cx, cy], p1, p2, p3, cur.pts); cx = p3[0]; cy = p3[1]; prevCtrlC = p2; prevCtrlQ = null; continue;
      }
      if (C === "Q") {
        const p1 = [ox + num(), oy + num()], p2 = [ox + num(), oy + num()];
        quad([cx, cy], p1, p2, cur.pts); cx = p2[0]; cy = p2[1]; prevCtrlQ = p1; prevCtrlC = null; continue;
      }
      if (C === "T") {
        const p1 = prevCtrlQ ? [2 * cx - prevCtrlQ[0], 2 * cy - prevCtrlQ[1]] : [cx, cy];
        const p2 = [ox + num(), oy + num()];
        quad([cx, cy], p1, p2, cur.pts); cx = p2[0]; cy = p2[1]; prevCtrlQ = p1; prevCtrlC = null; continue;
      }
      if (C === "A") { // arc : approx par une ligne vers le point final (rare ici)
        num(); num(); num(); num(); num(); cx = ox + num(); cy = oy + num();
        cur.pts.push([cx, cy]); prevCtrlC = prevCtrlQ = null; continue;
      }
      i++; // commande inconnue -> skip
    }
    if (cur && cur.pts.length) subs.push(cur);
    return subs;
  }

  function fillColor(attrs) {
    const styleM = /\bstyle="([^"]*)"/.exec(attrs);
    if (styleM) {
      const fillM = /fill:\s*(#[0-9a-fA-F]{3,6}|none)/.exec(styleM[1]);
      if (fillM) return fillM[1];
    }
    const fillM2 = /\bfill="([^"]+)"/.exec(attrs);
    if (fillM2) return fillM2[1].trim();
    return "#000000";
  }
  // Matrice affine SVG [a b c d e f] :
  // x' = ax + cy + e, y' = bx + dy + f.
  function multiply(m, n) {
    return [
      m[0] * n[0] + m[2] * n[1],
      m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3],
      m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4],
      m[1] * n[4] + m[3] * n[5] + m[5],
    ];
  }

  function parseTransform(value) {
    let result = [1, 0, 0, 1, 0, 0];
    const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
    let m;
    while ((m = re.exec(value || ""))) {
      const values = m[2].match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g);
      const v = values ? values.map(Number) : [];
      const name = m[1].toLowerCase();
      let op = [1, 0, 0, 1, 0, 0];
      if (name === "matrix" && v.length >= 6) op = v.slice(0, 6);
      else if (name === "translate") op = [1, 0, 0, 1, v[0] || 0, v[1] || 0];
      else if (name === "scale") {
        const sx = v.length ? v[0] : 1, sy = v.length > 1 ? v[1] : sx;
        op = [sx, 0, 0, sy, 0, 0];
      } else if (name === "rotate") {
        const angle = (v[0] || 0) * Math.PI / 180;
        const c = Math.cos(angle), s = Math.sin(angle);
        op = [c, s, -s, c, 0, 0];
        if (v.length >= 3) {
          const to = [1, 0, 0, 1, v[1], v[2]];
          const from = [1, 0, 0, 1, -v[1], -v[2]];
          op = multiply(multiply(to, op), from);
        }
      } else if (name === "skewx") op = [1, 0, Math.tan((v[0] || 0) * Math.PI / 180), 1, 0, 0];
      else if (name === "skewy") op = [1, Math.tan((v[0] || 0) * Math.PI / 180), 0, 1, 0, 0];
      result = multiply(result, op);
    }
    return result;
  }

  function transformAttr(attrs) {
    const m = /\btransform\s*=\s*["']([^"']*)["']/.exec(attrs);
    return parseTransform(m ? m[1] : "");
  }

  function applyMatrix(subs, matrix) {
    for (const sub of subs) for (const p of sub.pts) {
      const x = p[0], y = p[1];
      p[0] = matrix[0] * x + matrix[2] * y + matrix[4];
      p[1] = matrix[1] * x + matrix[3] * y + matrix[5];
    }
  }

  ML.parseSVG = function (text) {
    // Conserve les transformations imbriquées des groupes et des chemins.
    const re = /<\/?[a-zA-Z][^>]*>/gs;
    const stack = [{ tag: "", matrix: [1, 0, 0, 1, 0, 0] }];
    let m; const paths = []; const subpaths = [];
    while ((m = re.exec(text))) {
      const tag = m[0];
      const closing = /^<\//.test(tag);
      const nameMatch = /^<\/?\s*([\w:-]+)/.exec(tag);
      if (!nameMatch) continue;
      const name = nameMatch[1].toLowerCase();

      if (closing) {
        for (let i = stack.length - 1; i > 0; i--) {
          if (stack[i].tag === name) { stack.length = i; break; }
        }
        continue;
      }

      const attrs = tag.slice(nameMatch[0].length, tag.length - (tag.endsWith("/>") ? 2 : 1));
      const matrix = multiply(stack[stack.length - 1].matrix, transformAttr(attrs));
      if (name !== "path") {
        if (!tag.endsWith("/>")) stack.push({ tag: name, matrix });
        continue;
      }

      const dm = /\bd="([^"]+)"/.exec(attrs);
      if (!dm) continue;
      const subs = parsePath(dm[1]).filter((s) => s.pts.length >= 2);
      if (!subs.length) continue;
      applyMatrix(subs, matrix);
      paths.push({ color: fillColor(attrs), subpaths: subs });
      for (const s of subs) subpaths.push(s);
    }
    return { paths, subpaths };
  };
})();
