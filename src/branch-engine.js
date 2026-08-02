/* branch-engine.js — PROTOTYPE JETABLE (test de faisabilité, pas du code de production).
   Moteur de branches paramétriques : un axe tracé au stylet -> une branche dessinée.
   Ne dépend que de ClipperLib (vendor/clipper.js). Coordonnées = px de l'image de référence
   (1402x1122 ; ~0,29 mm/px, mesuré sur `reference/trame de base.png`).
   Expose window.BE. */
(function () {
  const BE = (window.BE = {});
  const S = 1000; // facteur entier Clipper (même convention que src/geometry.js)
  const toInt = (pts) => pts.map((p) => ({ X: Math.round(p[0] * S), Y: Math.round(p[1] * S) }));
  const fromInt = (path) => path.map((p) => [p.X / S, p.Y / S]);

  BE.MM_PER_PX = 0.288; // 330 mm de corps mesurés sur 1144 px d'encre

  // ───────────────────────── Clipper : opérations sur des JEUX de contours ─────────────────────────

  function cleanup(polys) {
    if (!polys.length) return [];
    // SimplifyPolygons(nonZero) : supprime les auto-intersections du ruban dans les virages serrés
    const sol = ClipperLib.Clipper.SimplifyPolygons(polys.map(toInt), ClipperLib.PolyFillType.pftNonZero);
    return sol.filter((p) => p.length >= 3).map(fromInt);
  }

  function boolOp(a, b, type) {
    const c = new ClipperLib.Clipper();
    if (a.length) c.AddPaths(a.map(toInt), ClipperLib.PolyType.ptSubject, true);
    if (b.length) c.AddPaths(b.map(toInt), ClipperLib.PolyType.ptClip, true);
    const sol = new ClipperLib.Paths();
    c.Execute(type, sol, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
    return sol.filter((p) => p.length >= 3).map(fromInt);
  }
  const unionSet = (a, b) => boolOp(a, b, ClipperLib.ClipType.ctUnion);
  const interSet = (a, b) => boolOp(a, b, ClipperLib.ClipType.ctIntersection);

  function offsetSet(polys, d) {
    if (!polys.length || d === 0) return polys;
    const co = new ClipperLib.ClipperOffset();
    co.AddPaths(polys.map(toInt), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
    const sol = new ClipperLib.Paths();
    co.Execute(sol, d * S);
    return sol.filter((p) => p.length >= 3).map(fromInt);
  }

  // découpe de polylignes OUVERTES par un jeu de contours (ctDifference / ctIntersection)
  function clipLines(lines, clip, type) {
    if (!lines.length) return [];
    if (!clip.length) return lines;
    const c = new ClipperLib.Clipper();
    c.AddPaths(lines.map(toInt), ClipperLib.PolyType.ptSubject, false);
    c.AddPaths(clip.map(toInt), ClipperLib.PolyType.ptClip, true);
    const tree = new ClipperLib.PolyTree();
    c.Execute(type, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
    return ClipperLib.Clipper.OpenPathsFromPolyTree(tree).filter((p) => p.length >= 2).map(fromInt);
  }

  function circle(c, r, n) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
    }
    return pts;
  }

  // Fermeture morphologique LOCALE : arrondit le creux de l'aisselle à une jonction, sans
  // souder au passage deux branches voisines simplement proches ailleurs dans l'arbre.
  function filletAt(U, center, radius, r) {
    if (!U.length || r <= 0) return U;
    const disc = [circle(center, radius, 40)];
    const local = interSet(U, disc);
    if (!local.length) return U;
    let closed = offsetSet(local, r); // dilate : comble le creux
    closed = offsetSet(closed, -r); //  érode  : restaure les bords
    closed = interSet(closed, disc); //  reste local
    return closed.length ? unionSet(U, closed) : U;
  }

  // ───────────────────────── bruit déterministe (style « tracé main ») ─────────────────────────

  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // bruit de valeur 1D lissé, t exprimé en longueurs d'onde
  function makeNoise(seed) {
    const r = rng(seed);
    const N = 128;
    const tab = new Array(N);
    for (let i = 0; i < N; i++) tab[i] = r() * 2 - 1;
    const at = (t) => {
      const i = Math.floor(t);
      const f = t - i;
      const a = tab[((i % N) + N) % N];
      const b = tab[(((i + 1) % N) + N) % N];
      return a + (b - a) * (f * f * (3 - 2 * f));
    };
    // 2 octaves : la grande ondulation du bord + le petit tremblé du trait
    return (t) => at(t) * 0.72 + at(t * 2.37 + 13.1) * 0.28;
  }

  // ───────────────────────── polylignes ─────────────────────────

  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

  function polyLength(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
    return L;
  }

  // rééchantillonnage à pas constant le long de l'abscisse curviligne
  function resample(pts, step) {
    if (pts.length < 2) return pts.map((p) => p.slice());
    const out = [pts[0].slice()];
    let acc = 0; // longueur accumulée depuis le dernier point émis
    for (let i = 1; i < pts.length; i++) {
      let a = pts[i - 1];
      const b = pts[i];
      let d = dist(a, b);
      if (d < 1e-9) continue;
      while (acc + d >= step) {
        const t = (step - acc) / d;
        const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        out.push(p);
        a = p;
        d = dist(a, b);
        acc = 0;
      }
      acc += d;
    }
    const last = pts[pts.length - 1];
    if (dist(out[out.length - 1], last) > step * 0.4) out.push(last.slice());
    return out;
  }

  /* Lissage exprimé en LONGUEUR, pas en nombre de passes. Le noyau 1-2-1 appliqué K fois
     équivaut à une gaussienne de variance K·pas²/2 : à 2,5 px de pas, 3 passes ne lissaient
     qu'un rayon de ~2 px, donc rien du tout — le tremblé de la main passait intégralement.
     Pour effacer un tremblé de rayon σ il faut K = 2·(σ/pas)² passes. */
  function smoothOver(pts, sigmaPx, step) {
    const K = Math.min(400, Math.round(2 * Math.pow(sigmaPx / step, 2)));
    return K > 0 ? smooth(pts, K) : pts;
  }

  function smooth(pts, passes) {
    let cur = pts.map((p) => p.slice());
    for (let k = 0; k < passes; k++) {
      const next = cur.map((p) => p.slice());
      for (let i = 1; i < cur.length - 1; i++) {
        next[i][0] = (cur[i - 1][0] + 2 * cur[i][0] + cur[i + 1][0]) / 4;
        next[i][1] = (cur[i - 1][1] + 2 * cur[i][1] + cur[i + 1][1]) / 4;
      }
      cur = next;
    }
    return cur;
  }

  function normalAt(axis, i) {
    const a = axis[Math.max(0, i - 1)];
    const b = axis[Math.min(axis.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1;
    return [-dy / L, dx / L];
  }

  const smoothstep = (e0, e1, x) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };

  // ───────────────────────── axes éditables (points de contrôle) ─────────────────────────

  /* Un axe dense (un point tous les 2,5 px) ne se retouche pas à la main. On en tire une
     poignée de points de contrôle — les inflexions réelles du geste — et l'axe redevient
     une courbe passant par eux. Déplacer un point suffit alors à corriger une branche,
     au lieu de l'annuler et de la refaire. */
  function fitControl(axis, tol, maxSpacing) {
    if (axis.length < 3) return axis.map((p) => p.slice());
    /* Les inflexions du geste donnent les poignées utiles, mais une longue courbe lisse n'en
       produit presque aucune — elle serait alors ininfluençable. On complète donc par un
       jalon tous les `maxSpacing` px : il faut toujours de quoi attraper la branche. */
    const knots = new Set([0, axis.length - 1]);
    for (const p of simplifyDP(axis, tol)) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < axis.length; i++) {
        const d = dist(axis[i], p);
        if (d < bd) { bd = d; bi = i; }
      }
      knots.add(bi);
    }
    const sorted = [...knots].sort((a, b) => a - b);
    const out = [];
    for (let k = 0; k < sorted.length; k++) {
      out.push(sorted[k]);
      if (k === sorted.length - 1) break;
      const span = polyLength(axis.slice(sorted[k], sorted[k + 1] + 1));
      const n = Math.floor(span / maxSpacing);
      for (let j = 1; j <= n; j++) {
        out.push(Math.round(sorted[k] + ((sorted[k + 1] - sorted[k]) * j) / (n + 1)));
      }
    }
    const idx = [...new Set(out)].sort((a, b) => a - b).slice(0, 40);
    return idx.map((i) => axis[i].slice());
  }

  // Catmull-Rom : la courbe PASSE par les points de contrôle, ce qui rend le déplacement
  // d'une poignée immédiatement lisible — une Bézier, elle, ne passe pas par ses tangentes.
  function catmullRom(ctrl, step) {
    if (ctrl.length < 3) return densify(ctrl, step);
    const pts = [];
    const at = (i) => ctrl[Math.max(0, Math.min(ctrl.length - 1, i))];
    for (let i = 0; i < ctrl.length - 1; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      const seg = Math.max(2, Math.ceil(dist(p1, p2) / step));
      for (let k = 0; k < seg; k++) {
        const t = k / seg, t2 = t * t, t3 = t2 * t;
        pts.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
            + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
            + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        ]);
      }
    }
    pts.push(ctrl[ctrl.length - 1].slice());
    return pts;
  }

  function axisFromCtrl(b, st) {
    const pts = b.forceKind === "piste"
      ? densify(b.ctrl, 2.5)                     // une piste garde ses angles vifs
      : catmullRom(b.ctrl, 2.5);
    b.axis = pts;
    b.len = polyLength(pts);
  }
  BE.axisFromCtrl = axisFromCtrl;

  /* Le point d'accroche d'une fille est recalculé depuis l'axe COURANT de sa mère : c'est
     lui qui rend l'arbre solidaire quand on déforme une branche. */
  BE.anchorPointOf = function (scene, b) {
    const par = scene.branches.find((x) => x.id === b.parentId);
    if (!par || b.t == null) return b.anchorPoint;
    return par.axis[Math.round(b.t * (par.axis.length - 1))].slice();
  };

  BE.nearestOnAxis = function (b, pt) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < b.axis.length; i++) {
      const d = dist(b.axis[i], pt);
      if (d < bd) { bd = d; bi = i; }
    }
    return { t: bi / Math.max(1, b.axis.length - 1), d: bd };
  };

  /* Que touche-t-on ? Les motifs posés d'abord (plus petits, donc plus difficiles à viser),
     les poignées d'axe ensuite. */
  BE.editHit = function (scene, pt, st, radius) {
    let best = null;
    for (const s of scene.stamps) {
      const g = s._geom;
      if (!g) continue;
      for (const l of g.lines) {
        for (const q of l) {
          const d = dist(q, pt);
          if (d < (best ? best.d : radius)) best = { kind: "stamp", id: s.id, d };
        }
      }
    }
    if (best) return best;
    for (const b of scene.branches) {
      if (!b.ctrl) continue;
      for (let i = 0; i < b.ctrl.length; i++) {
        const d = dist(b.ctrl[i], pt);
        if (d < (best ? best.d : radius)) best = { kind: "ctrl", id: b.id, index: i, d };
      }
    }
    return best;
  };

  /* Poignées d'un motif posé. Deux suffisent : le PIED, qui le fait coulisser le long de sa
     branche, et la POINTE, dont la distance donne la taille et la direction l'angle de sortie.
     Une seule poignée pour deux réglages, comme une poignée d'échelle-rotation classique. */
  BE.stampHandles = function (scene, s, st) {
    /* `st` est indispensable : le pied de la poignée est sur l'ÉCORCE, dont la position
       dépend de la largeur locale de la branche. `_side` = côté réellement rendu, qui peut
       différer si l'arbitrage a retourné le motif — la poignée désigne ce qu'on voit. */
    const g = poseCalc(scene, s, st || BE.reglagesCourants || {}, s._side === undefined ? s.side : s._side);
    if (!g) return null;
    return { pied: g.P.slice(),
             pointe: [g.P[0] + g.dir[0] * s.sizePx, g.P[1] + g.dir[1] * s.sizePx],
             tan: g.tan };
  };

  /* Tirer la pointe règle d'un seul geste la taille, l'angle ET le côté : passer de l'autre
     bord de la branche fait basculer le motif, ce qui est le geste qu'on attend. */
  BE.dragStampTip = function (scene, s, pt, st) {
    const h = BE.stampHandles(scene, s, st);
    if (!h) return;
    const vx = pt[0] - h.pied[0], vy = pt[1] - h.pied[1];
    const L = Math.hypot(vx, vy);
    if (L < 2) return;
    s.sizePx = Math.max(3 / BE.MM_PER_PX, Math.min(80 / BE.MM_PER_PX, L));
    const [tx, ty] = h.tan;
    const ang = Math.atan2(tx * vy - ty * vx, tx * vx + ty * vy);   // signé, / tangente
    s.side = ang >= 0 ? 1 : -1;
    s.angle = Math.min(Math.PI / 2, Math.abs(ang));
    if (st && st.autoLod !== false) s.motifId = BE.pickVariant(s.motifId, s.sizePx, st);
    // repris en main : on ne l'arbitre plus, l'utilisateur l'a mis là exprès
    s.auto = false; s._side = s.side; s._geom = null;
  };

  BE.moveStamp = function (scene, s, pt) {
    const b = scene.branches.find((x) => x.id === s.branchId);
    if (!b) return;
    s.t = BE.nearestOnAxis(b, pt).t;              // le motif coulisse LE LONG de sa branche
    s.auto = false; s._side = s.side; s._geom = null;
  };

  /* Déplacer une poignée : on refait l'axe, puis on translate ce qui pousse dessus du même
     écart. Sans ça, une fille resterait plantée dans le vide à l'ancienne position. */
  BE.moveCtrl = function (scene, b, i, pt, st) {
    if (!b.ctrl || i < 0 || i >= b.ctrl.length) return;
    const before = scene.branches
      .filter((c) => c.parentId === b.id && c.t != null)
      .map((c) => ({ c, p: BE.anchorPointOf(scene, c) }));
    b.ctrl[i] = [pt[0], pt[1]];
    b.edited = true;                              // le tracé brut n'est plus la vérité
    axisFromCtrl(b, st);
    for (const { c, p } of before) {
      const q = BE.anchorPointOf(scene, c);
      const dx = q[0] - p[0], dy = q[1] - p[1];
      if (!dx && !dy) continue;
      for (const arr of [c.ctrl, c.raw]) {
        if (arr) for (const v of arr) { v[0] += dx; v[1] += dy; }
      }
      c.anchorPoint = q;
      axisFromCtrl(c, st);
    }
    for (const s of scene.stamps) if (s.branchId === b.id) s._geom = null;
  };

  // ───────────────────────── pistes PCB ─────────────────────────

  // Douglas-Peucker : ne garde que les inflexions réelles du tracé
  function simplifyDP(pts, tol) {
    if (pts.length < 3) return pts.slice();
    const keep = new Array(pts.length).fill(false);
    keep[0] = keep[pts.length - 1] = true;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [i0, i1] = stack.pop();
      const [ax, ay] = pts[i0], [bx, by] = pts[i1];
      const dx = bx - ax, dy = by - ay;
      const L = Math.hypot(dx, dy) || 1;
      let far = -1, fd = tol;
      for (let i = i0 + 1; i < i1; i++) {
        const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L;
        if (d > fd) { fd = d; far = i; }
      }
      if (far > 0) { keep[far] = true; stack.push([i0, far], [far, i1]); }
    }
    return pts.filter((_, i) => keep[i]);
  }

  const segDist = (p, pts) => pts.reduce((m, q) => Math.min(m, dist(p, q)), Infinity);

  /* Routage « circuit imprimé » : chaque segment devient au plus deux tronçons, l'un axial,
     l'autre à 45°. Des deux ordres possibles (droit puis biais, ou biais puis droit) on garde
     celui dont le coude tombe le plus près du tracé d'origine — la piste suit le geste. */
  function route45(anchors, original) {
    const out = [anchors[0].slice()];
    for (let i = 1; i < anchors.length; i++) {
      const a = out[out.length - 1], b = anchors[i];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const adx = Math.abs(dx), ady = Math.abs(dy);
      if (adx < 0.5 || ady < 0.5 || Math.abs(adx - ady) < 0.5) { out.push(b.slice()); continue; }
      const sx = Math.sign(dx), sy = Math.sign(dy), m = Math.min(adx, ady);
      const straightFirst = adx > ady ? [a[0] + sx * (adx - ady), a[1]] : [a[0], a[1] + sy * (ady - adx)];
      const diagFirst = [a[0] + sx * m, a[1] + sy * m];
      out.push(segDist(straightFirst, original) <= segDist(diagFirst, original) ? straightFirst : diagFirst);
      out.push(b.slice());
    }
    return out;
  }

  // ré-échantillonne en conservant EXACTEMENT les sommets (les angles ne doivent pas fondre)
  function densify(pts, step) {
    const out = [pts[0].slice()];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const n = Math.max(1, Math.ceil(dist(a, b) / step));
      for (let k = 1; k <= n; k++)
        out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
    return out;
  }

  BE.routePcb = function (rawPts, st) {
    const anchors = simplifyDP(rawPts, st.pcbTol);
    if (anchors.length < 2) return rawPts;
    return densify(route45(anchors, rawPts), 2.5);
  };

  // ruban à largeur constante, coins vifs (jtMiter) : l'inverse du tracé organique
  function pcbRibbon(b, st) {
    const co = new ClipperLib.ClipperOffset();
    co.AddPath(toInt(b.axis), ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etOpenButt);
    const sol = new ClipperLib.Paths();
    co.Execute(sol, (b.w0 / 2) * S);
    return sol.filter((p) => p.length >= 3).map(fromInt);
  }

  /* Vias aux coudes marqués et pastille en bout : disque extérieur fondu dans la piste
     (il devient un renflement du contour) + cercle intérieur tracé à part, d'où l'anneau. */
  function pcbExtras(b, st) {
    const discs = [], rings = [];
    const gap = Math.max(fine(st) * 1.3, 0.8 / BE.MM_PER_PX); // ≥ 1 mm entre les deux cercles
    const addRing = (c, Ro) => {
      discs.push(circle(c, Ro, 36));
      const Ri = Ro - gap;
      if (Ri > gap * 0.5) rings.push(circle(c, Ri, 36).concat([circle(c, Ri, 36)[0]]));
    };
    if (st.pcbVias) {
      // on relève les coudes (45° compris — le seuil précédent ne voyait que les angles droits),
      // puis on n'en équipe qu'un sur deux : la référence en pose peu, pas un à chaque angle.
      const corners = [];
      const n = b.axis.length;
      for (let i = 6; i < n - 6; i++) {
        const a = b.axis[i - 5], c = b.axis[i], d = b.axis[i + 5];
        let turn = Math.abs(Math.atan2(d[1] - c[1], d[0] - c[0]) - Math.atan2(c[1] - a[1], c[0] - a[0]));
        if (turn > Math.PI) turn = 2 * Math.PI - turn;
        if (turn > 0.6) { corners.push(c); i += 14; }
      }
      corners.forEach((c, k) => { if (k % 2 === 0) addRing(c, b.w0 * 0.85); });
    }
    if (st.pcbPad) addRing(b.axis[b.axis.length - 1], b.w0 * 0.95);
    return { discs, rings };
  }

  // ───────────────────────── motifs posés ─────────────────────────

  let BANK = {};
  BE.bank = [];

  /* Bibliothèque de motifs, en AXES (générée par tools/build-motif-bank.py).
     Chaque motif : { id, famille, forme, etat, w, h, anchor:[x,y], paths:[[[x,y],…],…] }.
     L'épaisseur n'est pas dans le motif — elle est appliquée ici, en mm, comme pour le reste. */
  BE.setBank = function (list) {
    BE.bank = list || [];
    BANK = {};
    for (const m of BE.bank) BANK[m.id] = m;
    return BE.bank.length;
  };
  BE.motif = (id) => BANK[id] || null;

  /* Taille minimale à laquelle un motif reste pyrogravable : sous cette hauteur, ses traits
     internes se rejoignent et il devient un pâté. Même règle que le plancher des rubans,
     appliquée au contenu du motif (`gap` = densité mesurée par tools/build-motif-bank.py). */
  /* Niveau de détail choisi par la TAILLE de pose. Un motif détaillé posé petit devient un
     pâté ; sa version nue tient. On prend donc, parmi les variantes du même motif, la plus
     riche qui reste lisible — c'est la mesure d'écart qui tranche, pas une étiquette. */
  BE.pickVariant = function (id, sizePx, st) {
    const m = BANK[id];
    if (!m) return id;
    const soeurs = BE.bank.filter(
      (x) => x.famille === m.famille && x.forme === m.forme && x.etat === m.etat);
    if (soeurs.length < 2) return id;
    const tiennent = soeurs.filter((x) => BE.minStampSize(x, st) <= sizePx);
    // la plus riche qui tienne ; si aucune ne tient, la plus sobre du lot
    const choisi = tiennent.length
      ? tiennent.reduce((a, b) => (a.gap <= b.gap ? a : b))
      : soeurs.reduce((a, b) => (a.gap >= b.gap ? a : b));
    return choisi.id;
  };

  BE.minStampSize = function (m, st) {
    if (!m || !m.gap) return 0;
    return (m.h * fine(st) * 2) / m.gap;
  };

  /* MANIÈRE DE POSER. Un motif ne se pose pas n'importe comment. Une résistance a une patte
     à chaque bout : elle s'insère DANS la ligne, dans son sens, centrée dessus. Une puce est
     un nœud où la ligne aboutit. Une vrille termine une course. Les semer tous en oblique
     comme des feuilles donnait un décor incohérent — composants flottant à côté de leur
     piste, sans y être raccordés (relevé sur branches(11).svg).

     Les règles s'appliquent à la POSE, pas au dessin : le motif reste stocké tel quel. */
  const POSE = {
    laterale:  { centre: false, angle: null, bout: false },  // pousse sur le côté, angle libre
    montee:    { centre: false, angle: Math.PI / 2, bout: false }, // planté debout sur la ligne
    enligne:   { centre: true,  angle: 0, bout: false },     // une patte à chaque bout
    noeud:     { centre: true,  angle: 0, bout: false },     // la ligne aboutit dessus
    terminale: { centre: false, angle: 0, bout: true },      // au bout, dans le prolongement
  };
  BE.poseRule = (m) => POSE[(m && m.pose) || "laterale"] || POSE.laterale;

  /* Pose un motif sur une branche. L'ancrage est PARAMÉTRIQUE (branche + t) : retoucher la
     branche déplace ce qui est posé dessus, on ne fige pas des coordonnées. */
  BE.addStamp = function (scene, motifId, hit, o) {
    const m = BANK[motifId];
    if (!m || !hit) return null;
    const r = BE.poseRule(m);
    /* Une pièce INSÉRÉE dans la ligne a besoin de ligne des deux côtés : posée près d'un
       bout, la moitié dépassait dans le vide et rien ne s'y raccordait — c'est ce qui
       donnait des puces et des résistances flottant au bout des branches. On la recule donc
       jusqu'à ce qu'elle tienne entière sur son support. */
    let t = r.bout ? 0.995 : hit.t;
    if (r.centre) {
      /* Une pièce en ligne TERMINE la tige : la branche arrive sur une patte, la piste repart
         de l'autre. C'est le chaînage branche → résistance → piste. Posée en plein milieu,
         elle a l'air enfilée sur le bois comme une perle.

         On l'aimante donc au bout le plus proche dès qu'elle est demandée dans le dernier
         quart. Au milieu, on la laisse où elle est : insérer une pièce en cours de piste est
         légitime, c'est le cas d'un composant sur un circuit. */
      if (t > 0.75) t = 1;
      else if (t < 0.25) t = 0;
    }
    const s = {
      id: scene.seq++, motifId, branchId: hit.branchId, t,
      side: o.side >= 0 ? 1 : -1,
      sizePx: o.sizePx,
      angle: r.angle === null ? o.angle : r.angle,
      mirror: !!o.mirror, auto: o.auto || false, agrandi: !!o.agrandi,
    };
    scene.stamps.push(s);
    return s;
  };

  /* Pose UNITAIRE, avec les mêmes égards que le semis en file : côté alterné par rapport à ce
     qui est déjà sur cette branche, et un peu de désordre. Sans ça, poser motif par motif les
     alignait tous du même côté, à l'identique. */
  /* Sous sa taille minimale, un motif se remplit d'encre : ses traits internes se rejoignent
     et il ne reste qu'une tache. On l'agrandit donc jusqu'à ce qu'il tienne.

     Ce qu'on ne fait PLUS : refuser. Un plafond d'agrandissement rendait 19 motifs sur 42
     impossibles à poser à la taille par défaut, sans le moindre message — on cliquait, rien
     n'apparaissait. Quand l'utilisateur désigne un motif et un endroit, on pose ; c'est à
     lui de juger si le motif est trop gros, pas à l'outil de décider en silence.

     Seule la GARNITURE automatique (`auto: true`) garde un plafond : là, personne n'a rien
     demandé, et mieux vaut une liane sobre qu'une feuille démesurée. */
  BE.PLAFOND_AUTO = 1.6;
  BE.poseLisible = function (scene, motifId, hit, o, st, strict) {
    const id = st.autoLod === false ? motifId : BE.pickVariant(motifId, o.sizePx, st);
    const mini = BE.minStampSize(BANK[id], st);
    if (mini > o.sizePx) {
      if (strict && mini > o.sizePx * BE.PLAFOND_AUTO) return null;
      o.sizePx = mini;
      o.agrandi = true;                 // relu par la page, pour le dire à l'utilisateur
    }
    return BE.addStamp(scene, id, hit, o);
  };

  BE.addStampAuto = function (scene, motifId, hit, st) {
    if (!hit) return null;
    const already = scene.stamps.filter((s) => s.branchId === hit.branchId).length;
    const forced = st.sowSide === 1 || st.sowSide === -1;
    const r = rng((hit.branchId * 2654435761 + already * 40503) >>> 0);
    const taille = st.sowSize * (0.82 + 0.36 * r());
    return BE.poseLisible(scene, motifId, hit, {
      side: forced ? st.sowSide : already % 2 === 0 ? 1 : -1,
      sizePx: taille,
      angle: st.sowAngle + (r() - 0.5) * 0.45,
      mirror: r() > 0.5,
      auto: "pose",              // l'endroit est choisi : basculable, jamais écarté
    }, st);
  };

  /* FENÊTRES D'ENROULEMENT, en abscisse normalisée. Le tour occupe déjà toute la place autour
     du bois : une feuille posée là s'empile sur le contour de la branche et le croisement
     devient illisible. On les repère par proximité aux axes de bois, sans passer par la
     géométrie construite — la garniture se pose dès le tracé, avant tout rendu. */
  BE.coilSpans = function (scene, b, st) {
    if (!b || b.forceKind !== "liane" || !b.axis || b.axis.length < 3) return [];
    const sAbs = [0];
    for (let i = 1; i < b.axis.length; i++) sAbs.push(sAbs[i - 1] + dist(b.axis[i - 1], b.axis[i]));
    const L = sAbs[sAbs.length - 1];
    if (!(L > 0)) return [];

    // boîtes englobantes : sans ce filtre le balayage est quadratique sur toute la scène,
    // et il tourne à chaque redessin
    const bois = [];
    for (const o of scene.branches) {
      // ni les autres lianes, ni les pistes : on ne s'enroule qu'autour du bois
      if (o.forceKind === "liane" || o.forceKind === "piste" ||
          o.id === b.id || !o.axis || o.axis.length < 3) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, wmax = 0;
      for (let j = 0; j < o.axis.length; j++) {
        x0 = Math.min(x0, o.axis[j][0]); x1 = Math.max(x1, o.axis[j][0]);
        y0 = Math.min(y0, o.axis[j][1]); y1 = Math.max(y1, o.axis[j][1]);
      }
      for (let k = 0; k <= 8; k++) wmax = Math.max(wmax, widthAt(o, k / 8, st));
      bois.push({ o, x0: x0 - wmax, y0: y0 - wmax, x1: x1 + wmax, y1: y1 + wmax });
    }
    if (!bois.length) return [];

    const dans = [];                       // passages DANS l'épaisseur du bois
    let cur = null;
    for (let i = 0; i < b.axis.length; i++) {
      const p = b.axis[i];
      let W = 0, d = Infinity;
      for (const bb of bois) {
        if (p[0] < bb.x0 || p[0] > bb.x1 || p[1] < bb.y0 || p[1] > bb.y1) continue;
        const o = bb.o;
        for (let j = 1; j < o.axis.length - 1; j++) {
          const e = dist(o.axis[j], p);
          if (e < d) { d = e; W = widthAt(o, j / (o.axis.length - 1), st); }
        }
      }
      if (W > 2 && d < W / 2) {
        if (!cur) cur = { i0: i, i1: i, W };
        else { cur.i1 = i; cur.W = Math.max(cur.W, W); }
      } else if (cur) { dans.push(cur); cur = null; }
    }
    if (cur) dans.push(cur);

    // même fenêtre que le tour lui-même (cf. helixThrough) : portée × 1,35 de part et d'autre
    const tours = Math.max(1, Math.round(st.coilTurns || 1));
    return dans.map((p) => {
      const sc = (sAbs[p.i0] + sAbs[p.i1]) / 2;
      const demi = p.W * 2.0 * tours * 1.35;
      return {
        t0: Math.max(0, (sc - demi) / L), t1: Math.min(1, (sc + demi) / L),
        bois0: sAbs[p.i0] / L, bois1: sAbs[p.i1] / L,
      };
    });
  };

  const dansSpan = (t, spans, k0, k1) => spans.some((z) => t >= z[k0] && t <= z[k1]);

  /* GARNITURE D'UNE LIANE. Sur la référence, ce qui fait vivre une liane n'est pas son trait :
     c'est le rythme nœud–feuille–nœud–feuille, et la vrille au bout. Une tige nue, si bien
     tracée soit-elle, reste un tuyau. On la garnit donc à la création, aux mêmes abscisses que
     les anneaux, en alternant les côtés — l'utilisateur trace une seule fois. */
  BE.garnishLiane = function (scene, b, st) {
    if (!b || b.forceKind !== "liane" || !BE.bank.length) return 0;
    const etat = st.lianeEtat || "organique";
    const feuilles = BE.bank.filter((m) => m.famille === "feuille" && m.etat === etat);
    const vrilles = BE.bank.filter((m) => m.famille === "vrille" && m.etat === etat);
    if (!feuilles.length) return 0;

    const pas = Math.max(3, st.lianeNodeStep) * b.w0;
    const taille = st.lianeLeaf * b.w0;          // la feuille se dimensionne sur le calibre
    const r = rng((b.id * 2246822519) >>> 0);
    const spires = BE.coilSpans(scene, b, st);

    /* Pose d'un motif de garniture, à la taille demandée mais jamais sous son seuil de
       lisibilité : en dessous, les traits internes se rejoignent et le motif devient une
       tache d'encre. On l'agrandit un peu ; s'il ne tient toujours pas, on ne le pose pas. */
    const poser = (mid, t, o) => {
      o.auto = "rythme";                // personne ne l'a demandé : plafonné, et écartable
      return BE.poseLisible(scene, mid, { branchId: b.id, t }, o, st, true) ? 1 : 0;
    };

    let pose = 0;
    for (let k = 1; k * pas < b.len * 0.84; k++) {
      // la portion enroulée reste nue : c'est le tour qui se lit là, pas une feuille
      if (dansSpan((k * pas) / b.len, spires, "t0", "t1")) continue;
      const m = feuilles[Math.floor(r() * feuilles.length)];
      pose += poser(m.id, (k * pas) / b.len, {
        side: k % 2 === 0 ? 1 : -1,
        sizePx: taille * (0.85 + 0.3 * r()),
        angle: st.sowAngle + (r() - 0.5) * 0.4,
        mirror: r() > 0.5,
      });
    }
    if (vrilles.length) {                         // et la vrille qui termine la course
      // à ce calibre les vrilles trop serrées se bouchent : on tire parmi celles qui tiennent
      const tiennent = vrilles.filter((m) => BE.minStampSize(m, st) <= taille * 1.36);
      const lot = tiennent.length ? tiennent : vrilles;
      const v = lot[Math.floor(r() * lot.length)];
      pose += poser(v.id, 0.985,
        { side: r() > 0.5 ? 1 : -1, sizePx: taille * 0.85, angle: 0.25, mirror: r() > 0.5 });
    }
    return pose;
  };

  /* Semis le long d'une branche, entre deux abscisses. Alternance gauche/droite, et un peu
     de désordre sur la taille et l'angle — sans quoi la répétition saute aux yeux. */
  BE.sowAlong = function (scene, branchId, t0, t1, motifId, st) {
    const b = scene.branches.find((x) => x.id === branchId);
    if (!b || !BANK[motifId]) return 0;
    const a = Math.min(t0, t1), c = Math.max(t0, t1);
    const spanPx = (c - a) * b.len;
    /* Un motif TERMINAL ne se sème pas : il n'y a qu'un bout de branche. En semer une file
       donnait une brochette de vrilles ou de radicelles le long du tronc. */
    const regle = BE.poseRule(BANK[motifId]);
    const n = regle.bout || spanPx < st.sowStep / 2
      ? 0 : Math.max(1, Math.round(spanPx / Math.max(4, st.sowStep)));
    const r = rng((b.id * 7919 + scene.seq * 104729) >>> 0);
    let k = 0;
    const forced = st.sowSide === 1 || st.sowSide === -1;
    for (let i = 0; i <= n; i++) {
      const t = n === 0 ? a : a + ((c - a) * i) / n;
      const taille = st.sowSize * (0.82 + 0.36 * r());
      if (BE.poseLisible(scene, motifId, { branchId, t }, {
        side: forced ? st.sowSide : i % 2 === 0 ? 1 : -1,
        sizePx: taille,
        angle: st.sowAngle + (r() - 0.5) * 0.45,
        mirror: r() > 0.5,
        auto: "rythme",                // semé en file : la place n'est pas garantie
      }, st)) k++;
    }
    return k;
  };

  // contour d'encre d'un jeu de polylignes : sert de silhouette d'occlusion au motif posé
  function inkOutline(lines, st) {
    const co = new ClipperLib.ClipperOffset();
    let any = false;
    for (const l of lines) {
      if (l.length >= 2) { co.AddPath(toInt(l), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etOpenRound); any = true; }
    }
    if (!any) return [];
    const sol = new ClipperLib.Paths();
    co.Execute(sol, (fine(st) / 2) * S);
    // les rubans se recouvrent : sans fusion, le remplissage evenodd creuserait des trous
    return cleanup(sol.filter((p) => p.length >= 3).map(fromInt));
  }

  /* Un motif posé est un AUTOCOLLANT : il cache ce qu'il recouvre. Or le contour d'encre ne
     couvre que les traits — le décor se voyait donc à travers l'intérieur d'une feuille ou
     d'un corps de composant. On ne garde que les contours EXTÉRIEURS : les trous se
     rebouchent, et la silhouette devient opaque. */
  function boucherTrous(polys) {
    if (polys.length < 2) return polys;
    const c = new ClipperLib.Clipper();
    c.AddPaths(polys.map(toInt), ClipperLib.PolyType.ptSubject, true);
    const arbre = new ClipperLib.PolyTree();
    c.Execute(ClipperLib.ClipType.ctUnion, arbre,
              ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
    const out = [];
    for (let n = arbre.GetFirst(); n; n = n.GetNext())
      if (!n.IsHole() && n.Contour().length >= 3) out.push(fromInt(n.Contour()));
    return out.length ? out : polys;
  }

  // boîte du motif dans son repère, calculée une fois : sert d'ancre centrale et de gabarit
  function bbox(m) {
    if (!m._bb) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of m.paths) for (const q of p) {
        x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]);
        y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
      }
      m._bb = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0,
                r: Math.max(x1 - x0, y1 - y0) / 2 };
    }
    return m._bb;
  }

  /* CORPS ET AXE D'UNE PIÈCE EN LIGNE — calculés ensemble, parce qu'ils se déterminent
     l'un l'autre.

     Le corps : une résistance dessinée isolée porte ses deux pattes, souvent les trois quarts
     de sa longueur. Insérée dans une piste, ces pattes se dessinent PAR-DESSUS la piste et le
     corps, réduit au quart de la taille demandée, devient un pâté. Or la piste est déjà la
     patte : on coupe.

     L'axe : la direction dans laquelle le corps s'allonge, pour le coucher sur la ligne. La
     boîte englobante ne suffit pas — la résistance CMS hybride est dessinée inclinée de 33°
     et sa végétation gonfle la boîte. L'axe principal de l'encre non plus, seul : sur un
     hybride, racines et feuilles le font pencher. Mais une fois les pattes ET la végétation
     périphérique coupées, il ne reste que le corps, dont l'axe est net. D'où deux passes. */
  function pca(traits) {
    const pts = [];
    for (const p of traits) for (let i = 1; i < p.length; i++) {
      const L = dist(p[i - 1], p[i]), n = Math.max(1, Math.round(L / 4));
      for (let j = 0; j < n; j++) {        // pas régulier : sinon les zones denses pèsent trop
        const u = j / n;
        pts.push([p[i - 1][0] + (p[i][0] - p[i - 1][0]) * u,
                  p[i - 1][1] + (p[i][1] - p[i - 1][1]) * u]);
      }
    }
    if (pts.length < 8) return null;
    let cx = 0, cy = 0;
    for (const q of pts) { cx += q[0]; cy += q[1]; }
    cx /= pts.length; cy /= pts.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const q of pts) {
      const a = q[0] - cx, b = q[1] - cy;
      sxx += a * a; syy += b * b; sxy += a * b;
    }
    sxx /= pts.length; syy /= pts.length; sxy /= pts.length;
    const tr = sxx + syy, rac = Math.sqrt(Math.max(0, (tr * tr) / 4 - (sxx * syy - sxy * sxy)));
    const l2 = tr / 2 - rac;
    return { theta: 0.5 * Math.atan2(2 * sxy, sxx - syy),
             elong: Math.sqrt((tr / 2 + rac) / Math.max(l2, 1e-9)) };
  }

  // coupe les extrémités le long de `theta` : ne reste que la partie épaisse, le corps
  function tailler(traits, theta) {
    const c = Math.cos(theta), sn = Math.sin(theta);
    const le = (q) => q[0] * c + q[1] * sn, tv = (q) => -q[0] * sn + q[1] * c;
    let a0 = Infinity, a1 = -Infinity, t0 = Infinity, t1 = -Infinity;
    for (const p of traits) for (const q of p) {
      a0 = Math.min(a0, le(q)); a1 = Math.max(a1, le(q));
      t0 = Math.min(t0, tv(q)); t1 = Math.max(t1, tv(q));
    }
    const L = a1 - a0, T = t1 - t0, cv = (t0 + t1) / 2;
    if (!(L > 0)) return null;
    const N = 80, ep = new Array(N).fill(0);
    for (const p of traits) for (const q of p) {
      const k = Math.min(N - 1, Math.max(0, Math.floor(((le(q) - a0) / L) * N)));
      ep[k] = Math.max(ep[k], Math.abs(tv(q) - cv) * 2);
    }
    /* Premier et dernier seau « épais », pas le plus long segment continu : les axes sont des
       polylignes simplifiées, elles laissent des seaux vides au milieu du corps. */
    let i0 = -1, i1 = -1;
    for (let i = 0; i < N; i++) if (ep[i] > T * 0.34) { if (i0 < 0) i0 = i; i1 = i + 1; }
    const part = i0 < 0 ? 1 : (i1 - i0) / N;
    if (part > 0.92 || part < 0.12) return null;          // rien à couper, ou mesure douteuse
    const d0 = a0 + (i0 / N) * L, d1 = a0 + (i1 / N) * L;
    const coupe = [];
    for (const p of traits) {
      let cur = [];
      for (const q of p) {
        if (le(q) >= d0 && le(q) <= d1) cur.push(q);
        else if (cur.length) { if (cur.length >= 2) coupe.push(cur); cur = []; }
      }
      if (cur.length >= 2) coupe.push(cur);
    }
    return coupe.length ? coupe : null;
  }

  function corpsEnLigne(m) {
    if (m._corps !== undefined) return m._corps;
    let traits = m.paths, ax = pca(traits), coupe = null;
    for (let passe = 0; passe < 2 && ax; passe++) {
      const t = tailler(traits, ax.theta);
      if (!t) break;
      coupe = traits = t;
      ax = pca(traits) || ax;
    }
    if (!coupe) { m._axe = ax && ax.elong > 1.3 ? ax : null; return (m._corps = null); }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of coupe) for (const q of p) {
      x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]);
      y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
    }
    m._axe = ax && ax.elong > 1.3 ? ax : null;
    return (m._corps = { paths: coupe,
      bb: { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0,
            r: Math.max(x1 - x0, y1 - y0) / 2 } });
  }

  // axe retenu pour coucher le motif sur la ligne (null = on garde « le haut sort »)
  function axeMotif(m, traits) {
    if (m._axe === undefined) { corpsEnLigne(m); }
    if (m._axe === undefined) {
      const a = pca(traits);
      m._axe = a && a.elong > 1.3 ? a : null;
    }
    return m._axe;
  }

  /* PLACEMENT D'UN MOTIF POSÉ — un seul calcul, partagé par le dessin, l'encombrement et
     les poignées. Il était écrit trois fois : les trois copies ont divergé plus d'une fois. */
  function poseCalc(scene, s, st, side) {
    const m = BANK[s.motifId];
    const b = scene.branches.find((x) => x.id === s.branchId);
    if (!m || !b || b.axis.length < 2) return null;
    const rgl = BE.poseRule(m);

    const i = Math.round(s.t * (b.axis.length - 1));
    const p0 = b.axis[Math.max(0, i - 3)], p1 = b.axis[Math.min(b.axis.length - 1, i + 3)];
    const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
    const tx = (p1[0] - p0[0]) / L, ty = (p1[1] - p0[1]) / L;

    // direction de sortie = tangente de la branche pivotée du côté choisi
    const ang = (side === undefined ? s.side : side) * s.angle;
    const dx = tx * Math.cos(ang) - ty * Math.sin(ang);
    const dy = tx * Math.sin(ang) + ty * Math.cos(ang);

    /* Un champignon pousse sur l'ÉCORCE, pas dans le cœur du bois. Ancré sur l'axe, la moitié
       du motif était avalée par le ruban — d'autant plus que la branche est épaisse. On sort
       donc jusqu'à la surface. Une pièce insérée dans la ligne, elle, reste sur l'axe. */
    let sortie = 0;
    if (!rgl.centre) { const w = widthAt(b, s.t, st); sortie = isFinite(w) ? w / 2 : 0; }
    const P = [b.axis[i][0] + dx * sortie, b.axis[i][1] + dy * sortie];

    // une pièce en ligne ne montre que son CORPS : la piste fait les pattes
    const corps = rgl.centre && m.pose === "enligne" ? corpsEnLigne(m) : null;
    const bb = corps ? corps.bb : bbox(m);
    const traits = corps ? corps.paths : m.paths;

    /* On veut que l'axe propre du motif se couche sur la ligne. La rotation de base envoie le
       « haut » du motif sur la direction de sortie ; il reste à défaire l'inclinaison propre
       du dessin. Le résultat est ramené dans un demi-tour : un axe n'a pas de sens, et sans
       ça la pièce se retournerait bout pour bout sans raison. */
    let corr = 0;
    const ax = rgl.centre ? axeMotif(m, traits) : null;
    if (ax) {
      corr = -(ax.theta + Math.PI / 2);
      corr -= Math.PI * Math.round(corr / Math.PI);
    }
    const phi = Math.atan2(dx, -dy) + corr;
    const k = s.sizePx / Math.max(1, rgl.centre ? Math.max(bb.w, bb.h) : m.h);
    // tenue par le milieu si elle s'insère dans la ligne, par le pied si elle pousse
    const A = rgl.centre ? bb : { cx: m.anchor[0], cy: m.anchor[1] };
    const cos = Math.cos(phi), sin = Math.sin(phi), mx = s.mirror ? -1 : 1;
    const map = (q) => {
      const lx = (q[0] - A.cx) * k * mx, ly = (q[1] - A.cy) * k;
      return [P[0] + lx * cos - ly * sin, P[1] + lx * sin + ly * cos];
    };
    return { m, b, rgl, P, dir: [dx, dy], tan: [tx, ty], bb, traits, k, map };
  }

  function stampGeom(scene, s, st) {
    const b = scene.branches.find((x) => x.id === s.branchId);
    const key = [s.sizePx, s.angle, s.side, s.mirror, fine(st), b && b.len, s.t].map((v) => +v).join("|");
    if (s._key === key && s._geom) return s._geom;
    const g = poseCalc(scene, s, st);
    if (!g) return null;
    const lines = g.traits.map((p) => p.map(g.map));
    // silhouette pleine : le motif masque le décor qu'il recouvre, trous compris
    const geom = { order: s.id, lines, silhouette: boucherTrous(inkOutline(lines, st)) };
    s._key = key;
    s._geom = geom;
    return geom;
  }

  /* Encombrement approché d'un motif posé : le disque qui enferme sa boîte, placé comme il
     le sera. Sert à empêcher les empilements (feuille sur feuille, feuille traversée par une
     autre liane, feuille à moitié enfoncée dans le bois) sans construire la géométrie. */
  function stampFootprint(scene, s, st, side) {
    const g = poseCalc(scene, s, st, side);
    if (!g) return null;
    // le disque qui enferme la boîte du motif, placé exactement comme il sera dessiné
    const c = g.map([g.bb.cx, g.bb.cy]);
    return { c, r: g.bb.r * g.k * 0.9, P: g.P };
  }

  /* Le motif tient-il là sans percuter ce qui est déjà posé ? On tolère le contact avec sa
     PROPRE tige au point d'attache — un pétiole doit bien toucher sa liane — mais pas avec le
     reste : les autres rubans, et les motifs déjà acceptés. */
  function stampFits(scene, s, st, fp, pris) {
    for (const o of scene.branches) {
      let d = Infinity, W = 0;
      for (let j = 0; j < o.axis.length; j++) {
        if (o.id === s.branchId && dist(o.axis[j], fp.P) < fp.r * 2.2) continue; // son attache
        const e = dist(o.axis[j], fp.c);
        if (e < d) { d = e; W = widthAt(o, j / Math.max(1, o.axis.length - 1), st); }
      }
      // on ne refuse pas un simple frôlement : seulement une intrusion FRANCHE dans le motif
      if (d < W / 2 + fp.r * 0.4) return false;
    }
    for (const q of pris) if (dist(q.c, fp.c) < (q.r + fp.r) * 0.7) return false;
    return true;
  }

  BE.stampFootprint = (scene, s, st, side) => stampFootprint(scene, s, st, side);

  // ───────────────────────── modèle ─────────────────────────

  BE.createScene = () => ({ branches: [], stamps: [], seq: 1 });

  /* Largeur locale d'une branche à l'abscisse relative u ∈ [0,1] (hors pointe finale).
     Trois termes, tous lisibles sur `reference/trame de base.png` :
       1. effilement de fond   — décroissance douce, la branche reste épaisse longtemps
       2. respiration          — modulation lente : le trait enfle et se resserre
       3. renflement de fourche— la mère gonfle là où une fille démarre                */
  function widthAt(branch, u, st) {
    if (branch.forceKind === "piste") return branch.w0; // une piste ne s'effile pas
    if (branch.forceKind === "liane") {
      // Une liane garde son calibre sur toute sa course : elle ne nourrit rien, elle grimpe.
      let w = branch.w0;
      if (st.swellAmp > 0) {
        if (branch._nwSeed !== branch.seed) {
          branch._nw = makeNoise(branch.seed ^ 0x51ed);
          branch._nwSeed = branch.seed;
        }
        w *= 1 + st.swellAmp * 0.5 * branch._nw((u * branch.len) / Math.max(20, branch.w0 * 6));
      }
      /* Collier de départ : là où la liane quitte le bois, la référence montre un léger
         épaississement ligneux. Sans lui, la tige a l'air posée à côté de la branche. */
      if (branch.startsOn && st.lianeCollar > 0) {
        const uc = Math.min(0.4, (2.2 * branch.w0) / Math.max(1, branch.len));
        if (u < uc) w *= 1 + st.lianeCollar * Math.pow(1 - u / uc, 1.6);
      }
      /* Fin de course : sur la référence, la liane s'achève en trait unique avant sa vrille.
         On effile donc la dernière portion pour que le ruban cède la place au fil. */
      const queue = 0.09;
      if (u > 1 - queue) w *= Math.max(0, (1 - u) / queue);
      return w;
    }
    const t = Math.pow(Math.max(0, 1 - u), st.taper);
    /* Deux lois d'effilement au choix :
         - défaut     : la branche s'effile JUSQU'AU plancher et pas en dessous — elle reste un
                        ruban de bout en bout, ce qui est prévisible et toujours traçable ;
         - queue fine : la largeur idéale croise le plancher, et la fin se prolonge en brindille
                        (trait simple). À demander explicitement, jamais subi.                  */
    /* Le profil s'appuie non pas sur le plancher mais un cran au-dessus : sinon une branche
       fine reste plaquée sur le plancher, la respiration se fait raboter par l'écrêtage et le
       trait devient un fil de fer parfaitement constant. */
    const floorEff = st.minRibbon * (1 + st.swellAmp);
    let w = st.tailTwig
      ? branch.w0 * ((1 - st.tipFrac) * t + st.tipFrac)
      : floorEff + Math.max(0, branch.w0 - floorEff) * t;

    if (st.swellAmp > 0) {
      if (branch._nwSeed !== branch.seed) {
        branch._nw = makeNoise(branch.seed ^ 0x51ed);
        branch._nwSeed = branch.seed;
      }
      w *= 1 + st.swellAmp * branch._nw((u * branch.len) / Math.max(20, branch.w0 * 5));
    }

    if (branch.bumps) {
      for (const b of branch.bumps) {
        const d = (u - b.u) / b.sigma;
        w += b.amp * Math.exp(-d * d);
      }
    }
    return w;
  }

  /* Largeur effectivement dessinée. PLANCHER DE TRAÇABILITÉ (contrainte pyrogravure) : un ruban
     plus étroit que `minRibbon` a ses deux traits de contour qui se touchent — impossible à
     brûler à la main. On ne descend donc jamais en dessous ; une branche plus fine que ça doit
     être tracée en brindille (trait simple), pas en ruban. */
  function drawWidthAt(branch, u, st) {
    let w = Math.max(st.minRibbon, widthAt(branch, u, st));
    /* Pointe terminale. Le plancher de 1 mm vise deux traits PARALLÈLES qu'il faut brûler
       séparément ; une pointe où les deux contours convergent est un V, qui se pyrogravé
       sans problème. Sans elle, chaque branche finissait en saucisse arrondie. */
    const tipU = st.tipLen / Math.max(1, branch.len);
    if (tipU > 0 && u > 1 - tipU) {
      const k = Math.max(0, (1 - u) / tipU); // 1 au départ de la pointe -> 0 au bout
      w = Math.min(w, w * k + fine(st) * 0.5);
    }
    return w;
  }

  // Deux calibres : le trait FORT dessine la structure (contours de ruban, pistes), le
  // trait FIN tout ce qui est détail (écorce, nœuds, aisselles, brindilles, motifs posés).
  // C'est ce que fait la référence, dont l'encre mesure 0,58 mm là où la structure fait 1 mm.
  const fine = (st) => st.inkFine || st.ink;

  // ruban à largeur constante autour d'une polyligne (brindille : un seul trait)
  function twigOutline(axis, st) {
    const co = new ClipperLib.ClipperOffset();
    co.AddPath(toInt(axis), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etOpenRound);
    const sol = new ClipperLib.Paths();
    co.Execute(sol, (fine(st) / 2) * S);
    return sol.filter((p) => p.length >= 3).map(fromInt);
  }

  BE.widthAt = widthAt;

  // Une liane réglée sous le plancher n'est plus un ruban : c'est un fil, et c'est légitime.
  function isTwig(b, st) {
    return b.forceKind === "liane" && b.w0 < st.minRibbon;
  }
  BE.isTwig = isTwig;

  /* Accroche : cherche le point le plus proche sur l'axe d'une branche existante.
     Renvoie { branchId, t, width, point } ou null. */
  BE.hitAxis = function (scene, pt, maxDist, st) {
    let best = null;
    for (const b of scene.branches) {
      for (let i = 0; i < b.axis.length; i++) {
        const d = dist(pt, b.axis[i]);
        if (best && d >= best.d) continue;
        const u = i / Math.max(1, b.axis.length - 1);
        const w = widthAt(b, u, st);
        /* Tolérance élargie au corps de la mère : poser le départ N'IMPORTE OÙ sur la branche
           doit accrocher. Une tolérance mesurée depuis l'axe seul ratait tous les départs pris
           sur le bord d'un tronc épais — d'où les branches qui ne fusionnaient pas. */
        if (d > Math.max(maxDist, w / 2 + maxDist * 0.6)) continue;
        best = { d, branchId: b.id, t: u, width: w, point: b.axis[i].slice() };
      }
    }
    return best;
  };

  /* Accroche d'un tracé : on teste ses DEUX extrémités. Dessiner de la pointe vers le tronc est
     aussi naturel que l'inverse ; si c'est la fin qui touche la mère, on retourne le tracé.
     Renvoie { anchor, pts } (pts éventuellement inversé), anchor pouvant être null. */
  /* BORNES D'UN MOTIF POSÉ — les points où une ligne peut repartir.

     Certains motifs sont des CONNECTEURS : une résistance a une patte à chaque bout, une
     puce a des broches sur ses quatre côtés. On doit pouvoir enchaîner branche → résistance
     → piste, ou branche → piste → radicelle. D'autres n'ont qu'un pied, déjà occupé par leur
     support : un champignon, une feuille, une vrille se posent SUR une ligne, ils ne la
     prolongent pas. Ce sont donc les poses `enligne` et `noeud` qui ouvrent des bornes.

     Une borne est « prise » dès qu'un tracé y démarre ou s'y termine : on ne branche pas
     deux pistes sur la même patte. */
  BE.stampPorts = function (scene, s, st) {
    const g = poseCalc(scene, s, st, s._side === undefined ? s.side : s._side);
    if (!g || !g.rgl.centre) return [];
    const bb = g.bb;
    // en repère motif : les deux bouts de la grande dimension, plus les côtés pour un nœud
    const longX = bb.w > bb.h;
    const dl = (longX ? bb.w : bb.h) / 2, dt = (longX ? bb.h : bb.w) / 2;
    const locales = [
      longX ? [bb.cx - dl, bb.cy] : [bb.cx, bb.cy - dl],
      longX ? [bb.cx + dl, bb.cy] : [bb.cx, bb.cy + dl],
    ];
    if (g.m.pose === "noeud") locales.push(
      longX ? [bb.cx, bb.cy - dt] : [bb.cx - dt, bb.cy],
      longX ? [bb.cx, bb.cy + dt] : [bb.cx + dt, bb.cy]);

    const centre = g.map([bb.cx, bb.cy]);
    const occupe = (p) => scene.branches.some((b) => b.axis && b.axis.length &&
      (dist(b.axis[0], p) < s.sizePx * 0.28 ||
       dist(b.axis[b.axis.length - 1], p) < s.sizePx * 0.28));
    return locales.map((l) => {
      const p = g.map(l);
      const dx = p[0] - centre[0], dy = p[1] - centre[1];
      const n = Math.hypot(dx, dy) || 1;
      return { p, dir: [dx / n, dy / n], stampId: s.id, prise: occupe(p) };
    });
  };

  // toutes les bornes libres de la scène, pour l'accroche et pour l'affichage
  BE.freePorts = function (scene, st) {
    const out = [];
    for (const s of scene.stamps || []) for (const b of BE.stampPorts(scene, s, st))
      if (!b.prise) out.push(b);
    return out;
  };

  BE.hitPort = function (scene, pt, tol, st) {
    let best = null;
    for (const b of BE.freePorts(scene, st)) {
      const d = dist(b.p, pt);
      if (d <= tol && (!best || d < best.d)) best = Object.assign({ d }, b);
    }
    return best;
  };

  BE.anchorStroke = function (scene, rawPts, st) {
    if (rawPts.length < 2) return { anchor: null, pts: rawPts };

    /* Une BORNE de motif l'emporte sur un axe : si le trait part de la patte libre d'une
       résistance, c'est qu'on veut enchaîner, pas se greffer sur la branche d'à côté. Le
       point de départ est recalé exactement sur la borne, et un peu à l'intérieur du corps,
       pour qu'aucun blanc ne s'ouvre entre la pièce et la ligne. */
    const bh = BE.hitPort(scene, rawPts[0], st.snap, st);
    const bt = BE.hitPort(scene, rawPts[rawPts.length - 1], st.snap, st);
    const borne = bt && (!bh || bt.d < bh.d) ? bt : bh;
    if (borne) {
      const pts = borne === bt ? rawPts.slice().reverse() : rawPts.slice();
      const rec = st.ink * 1.2;
      pts[0] = [borne.p[0] - borne.dir[0] * rec, borne.p[1] - borne.dir[1] * rec];
      return { anchor: null, pts, port: borne };
    }

    const head = BE.hitAxis(scene, rawPts[0], st.snap, st);
    const tail = BE.hitAxis(scene, rawPts[rawPts.length - 1], st.snap, st);
    if (tail && (!head || tail.d < head.d)) return { anchor: tail, pts: rawPts.slice().reverse() };
    return { anchor: head, pts: rawPts };
  };

  /* Largeur de base qu'aura la prochaine branche. Exposée pour que l'interface puisse la
     montrer AVANT le tracé : sans ce retour, on dessine tout à la même grosseur sans le voir. */
  /* Le ratio dépend de l'ANGLE de départ, mesuré sur `Branche ref fourche` : la fille qui
     prolonge la mère garde 0,66 de sa largeur, celle qui part de côté seulement 0,29. Un
     ratio unique faisait des branches latérales bien trop grosses, d'où l'absence de
     hiérarchie lisible. `divergence` en radians ; absent, on suppose une latérale. */
  BE.childWidth = function (anchor, st, divergence) {
    const floor = st.minRibbon * 1.15;
    if (!anchor) return Math.max(floor, st.rootWidth);
    const a = divergence == null ? Math.PI / 4 : Math.min(Math.abs(divergence), Math.PI / 2);
    const t = smoothstep(0.15, 1.05, a); // 9° -> prolongement, 60° -> latérale franche
    const ratio = st.childRatio * (1 - t) + st.childRatioSide * t;
    return Math.max(floor, anchor.width * ratio);
  };

  /* Ajoute une branche à partir d'un tracé brut.
     anchor = résultat de hitAxis (ou null pour une branche racine). */
  BE.addBranch = function (scene, rawPts, st, anchor, kind) {
    let pts = rawPts.filter((p, i) => i === 0 || dist(p, rawPts[i - 1]) > 0.5);
    if (pts.length < 2) return null;
    const pcb = kind === "piste";
    if (pcb) pts = BE.routePcb(pts, st); // routage AVANT le raccord : la liaison à la mère reste libre
    /* Une liane s'ENROULE autour d'une branche et en descend : elle la croise, elle ne s'y
       greffe pas. On garde l'accroche pour la placer, mais sans lien de parenté — sinon son
       ruban fusionne avec le bois et fait une excroissance. */
    const wraps = kind === "liane";
    let divergence = null;
    if (anchor && !wraps) {
      /* Émergence tangentielle : la fille démarre EN AMONT dans le cœur de la mère et alignée
         sur elle, puis s'infléchit vers le tracé — c'est ce qui donne l'aisselle coulée de la
         référence (et l'union avec la mère est garantie, le départ est à l'intérieur). */
      const par = scene.branches.find((b) => b.id === anchor.branchId);
      let back = anchor.point.slice();
      if (par) {
        // angle entre la mère et le départ de la fille : il commande le ratio de largeur
        const i0 = Math.round(anchor.t * (par.axis.length - 1));
        const pa = par.axis[Math.max(0, i0 - 3)], pb = par.axis[Math.min(par.axis.length - 1, i0 + 3)];
        const ca = pts[0], cb = pts[Math.min(pts.length - 1, 8)];
        const ang = Math.atan2(cb[1] - ca[1], cb[0] - ca[0]) - Math.atan2(pb[1] - pa[1], pb[0] - pa[0]);
        divergence = Math.atan2(Math.sin(ang), Math.cos(ang));
      }
      if (par) {
        const i = Math.round(anchor.t * (par.axis.length - 1));
        const a = par.axis[Math.max(0, i - 2)];
        const b = par.axis[Math.min(par.axis.length - 1, i + 2)];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const step = anchor.width * st.emergeLead;
        back = [anchor.point[0] - ((b[0] - a[0]) / L) * step, anchor.point[1] - ((b[1] - a[1]) / L) * step];
      }
      pts = [back, anchor.point.slice()].concat(pts);
    }
    if (pts.length < 2) return null;
    let axis;
    if (pcb) {
      axis = densify(pts, 2.5); // surtout pas de lissage : les angles vifs FONT la piste
    } else {
      axis = resample(pts, 2.5);
      if (axis.length < 2) return null;
      axis = smoothOver(axis, st.smoothPx, 2.5);
    }
    /* Plancher sur la largeur de base : une fille accrochée près de la pointe de sa mère y
       héritait d'une largeur ridicule et se dessinait en trait nu — l'utilisateur croyait que
       sa branche n'avait pas été tracée. Toute branche démarre au moins en ruban traçable. */
    const w0 = pcb ? st.pcbWidth : wraps ? st.lianeWidth : BE.childWidth(anchor, st, divergence);
    const b = {
      id: scene.seq++,
      parentId: anchor && !wraps ? anchor.branchId : null,
      t: anchor && !wraps ? anchor.t : null,        // position paramétrique sur la mère
      startsOn: anchor && wraps ? { branchId: anchor.branchId, t: anchor.t } : null,
      anchorPoint: anchor && !wraps ? anchor.point.slice() : null,
      anchorWidth: anchor && !wraps ? anchor.width : 0,
      forceKind: kind || null,
      raw: pts.map((p) => p.slice()), // conservé : le lissage reste réglable après coup
      // Points de contrôle : la vérité de l'axe une fois qu'on peut les déplacer.
      ctrl: fitControl(axis, pcb ? 0.5 : Math.max(5, polyLength(axis) * 0.012), pcb ? 1e9 : 70),
      axis,
      len: polyLength(axis),
      w0,
      seed: (scene.seq * 2654435761) >>> 0,
    };
    axisFromCtrl(b, st);                            // l'axe dessiné vient des poignées
    scene.branches.push(b);
    return b;
  };

  /* Recalcule les axes depuis les tracés bruts : le lissage est un réglage, pas une décision
     prise à l'instant du trait. Les points d'accroche des filles bougent de quelques px au
     plus, ils restent dans le corps de leur mère. */
  BE.rebuildAxes = function (scene, st) {
    for (const b of scene.branches) {
      // une branche retouchée à la poignée ne revient pas au tracé brut : ce serait
      // effacer la correction en bougeant un curseur de style
      if (b.forceKind === "piste" || !b.raw || b.edited) continue;
      const axis = resample(b.raw, 2.5);
      if (axis.length < 2) continue;
      b.ctrl = fitControl(smoothOver(axis, st.smoothPx, 2.5), Math.max(5, polyLength(axis) * 0.012), 70);
      axisFromCtrl(b, st);
    }
    for (const s of scene.stamps) s._geom = null;
  };

  BE.removeLast = function (scene) {
    // on retire la dernière chose posée, motif ou branche confondus
    const lastStamp = scene.stamps.length ? scene.stamps[scene.stamps.length - 1] : null;
    const lastBranch = scene.branches.length ? scene.branches[scene.branches.length - 1] : null;
    if (lastStamp && (!lastBranch || lastStamp.id > lastBranch.id)) { scene.stamps.pop(); return; }
    const b = scene.branches.pop();
    if (!b) return;
    scene.stamps = scene.stamps.filter((s) => s.branchId !== b.id); // rien ne flotte sans support
    // orpheline les filles (le prototype ne casse pas l'arbre : elles deviennent racines)
    for (const c of scene.branches) if (c.parentId === b.id) { c.parentId = null; c.anchorPoint = null; }
  };

  // ───────────────────────── géométrie ─────────────────────────

  /* Géométrie d'une branche : un ruban tant que la largeur tient le plancher de traçabilité,
     puis une BRINDILLE (trait simple) pour la fin — c'est la lecture de la référence : une
     branche épaisse qui se prolonge en trait fin, jamais une aiguille à deux contours. */
  function branchGeom(b, st) {
    if (b.forceKind === "piste") {
      const ex = pcbExtras(b, st);
      return { polys: pcbRibbon(b, st).concat(ex.discs), twig: null, rings: ex.rings };
    }
    const n = b.axis.length;
    if (isTwig(b, st)) return { polys: [], twig: b.axis, rings: [] };

    let iStar = n - 1;
    if (st.tailTwig || b.forceKind === "liane") {
      for (let i = 0; i < n; i++) {
        if (widthAt(b, i / (n - 1), st) < st.minRibbon) { iStar = i; break; }
      }
    }
    if (iStar < 3) return { polys: [], twig: b.axis, rings: [] };

    const twig = iStar < n - 3 ? b.axis.slice(iStar) : null;
    return { polys: [branchOutline(b, st, iStar)], twig, rings: [] };
  }

  function branchOutline(b, st, iEnd) {
    const nL = makeNoise(b.seed ^ 0x9e37);
    const nR = makeNoise(b.seed ^ 0x85eb);
    const left = [];
    const right = [];
    const lam = Math.max(8, st.wobbleLen * b.w0); // longueur d'onde ∝ largeur de base
    for (let i = 0; i <= iEnd; i++) {
      const u = i / (b.axis.length - 1);
      let w = drawWidthAt(b, u, st);
      /* Base amincie sur la portion enterrée dans la mère. Sans ça, une fille aussi large que
         sa mère débordait de son flanc au point d'émergence et laissait une épine. */
      if (b.parentId && b.anchorWidth) {
        const rampU = Math.min(0.3, (b.anchorWidth * 0.9) / Math.max(1, b.len));
        w *= 0.78 + 0.22 * smoothstep(0, rampU, u); // juste assez pour rester dans le flanc
      }
      const half = w / 2;
      const [nx, ny] = normalAt(b.axis, i);
      const s = u * b.len;
      // l'ondulation s'éteint aux deux bouts (base propre, pointe nette) ; une liane a un
      // contour beaucoup plus égal qu'une branche — c'est une tige, pas du bois
      const fade = smoothstep(0, 0.06, u) * smoothstep(0, 0.1, 1 - u);
      const amp = st.wobbleAmp * w * fade * (b.forceKind === "liane" ? 0.3 : 1);
      const dl = amp * nL(s / lam);
      const dr = amp * nR(s / lam);
      left.push([b.axis[i][0] + nx * (half + dl), b.axis[i][1] + ny * (half + dl)]);
      right.push([b.axis[i][0] - nx * (half + dr), b.axis[i][1] - ny * (half + dr)]);
    }
    // calotte arrondie en bout de ruban : la brindille en sortira, une coupe franche se verrait
    const cap = (i, forward) => {
      const c = b.axis[i];
      const half = drawWidthAt(b, i / (b.axis.length - 1), st) / 2;
      const [nx, ny] = normalAt(b.axis, i);
      const tx = ny, ty = -nx; // tangente = normale tournée de -90°
      const s = forward ? 1 : -1;
      const out = [];
      for (let k = 1; k < 12; k++) {
        const a = (Math.PI * k) / 12;
        out.push([c[0] + half * (s * nx * Math.cos(a) + s * tx * Math.sin(a)),
                  c[1] + half * (s * ny * Math.cos(a) + s * ty * Math.sin(a))]);
      }
      return out;
    };

    // left(0→iEnd) + calotte avant + right(iEnd→0) + calotte arrière (racine seulement)
    const poly = left.concat(cap(iEnd, true), right.reverse());
    if (!b.parentId) poly.push(...cap(0, false));
    return poly;
  }

  // lignes d'écorce : segments internes ouverts, parallèles à l'axe, interrompus et asymétriques
  /* Marques d'écorce. Deux corrections mesurées sur `Branche ref troncon` :
       - elles courent au MILIEU du bois, à 0,39 largeur du bord (donc à ±0,11 largeur de
         l'axe), et non plaquées contre les bords comme je les posais ;
       - elles sont courtes : 1,3 fois la largeur locale, là où j'en tirais sur la moitié de
         la branche. Ce sont des marques, pas des rainures d'un bout à l'autre.
     Leur nombre suit donc la LONGUEUR, pas la largeur. */
  function barkLines(b, st) {
    /* Seuil relevé : depuis que le trait de détail est passé à 0,6 mm, l'écorce se posait
       sur des branches de 4 mm et y faisait des pointillés. La référence ne marque que les
       membres vraiment épais — le tronc et la première génération. */
    const gap = fine(st) * 1.8;
    if (b.w0 < gap * 6) return [];
    const wRef = Math.max(4, widthAt(b, 0.35, st));
    const n = Math.min(14, Math.round(b.len / Math.max(st.barkPitch, wRef * 2.2)));
    if (n < 1) return [];
    const r = rng(b.seed ^ 0x27d4);
    const out = [];
    for (let k = 0; k < n; k++) {
      const off = (r() * 0.5 - 0.25) * 0.9;      // ±0,11 de la largeur, autour de l'axe
      const centre = (k + 0.35 + r() * 0.3) / n;
      const wLocal = Math.max(4, widthAt(b, centre, st));
      const half = (1.3 * wLocal) / 2 / Math.max(1, b.len);
      const u0 = Math.max(0.03, centre - half);
      const u1 = Math.min(0.95, centre + half);
      const nz = makeNoise((b.seed ^ (k * 7919)) >>> 0);
      const line = [];
      const i0 = Math.round(u0 * (b.axis.length - 1));
      const i1 = Math.round(u1 * (b.axis.length - 1));
      if (i1 - i0 < 3) continue;
      for (let i = i0; i <= i1; i++) {
        const u = i / (b.axis.length - 1);
        const w = drawWidthAt(b, u, st);
        const room = w / 2 - gap; // marge disponible entre l'axe et le bord
        if (room <= 0.5) { if (line.length > 3) break; else { line.length = 0; break; } }
        const [nx, ny] = normalAt(b.axis, i);
        const fade = smoothstep(0, 0.12, (u - u0) / (u1 - u0)) * smoothstep(0, 0.12, (u1 - u) / (u1 - u0));
        let d = off * (w / 2) * (0.55 + 0.45 * fade) + nz((u * b.len) / Math.max(10, b.w0 * 1.6)) * w * 0.05;
        d = Math.max(-room, Math.min(room, d));
        line.push([b.axis[i][0] + nx * d, b.axis[i][1] + ny * d]);
      }
      if (line.length > 3) out.push(line);
    }
    return out;
  }

  /* Nœuds : petites amandes fermées posées sur le bois, avec un arc intérieur. C'est le
     détail qui manque le plus au trait nu — la référence en pose sur tous les gros membres. */
  function knots(b, st) {
    if (b.forceKind === "liane" || b.forceKind === "piste") return [];
    const room = fine(st) * 5;
    if (b.w0 < room || st.knotDensity <= 0) return [];
    const r = rng(b.seed ^ 0x4d2f);
    const span = b.len * 0.75;
    const n = Math.min(6, Math.floor((span / Math.max(20, st.knotStep)) * st.knotDensity));
    const out = [];
    for (let i = 0; i < n; i++) {
      const u = 0.08 + r() * 0.72;
      const w = drawWidthAt(b, u, st);
      if (w < room) continue;
      const idx = Math.round(u * (b.axis.length - 1));
      const c = b.axis[idx];
      const [nx, ny] = normalAt(b.axis, idx);
      const tx = ny, ty = -nx;
      const off = (r() * 0.9 - 0.45) * (w / 2 - fine(st) * 1.5);
      const cx = c[0] + nx * off, cy = c[1] + ny * off;
      const half = Math.min(w * 0.32, fine(st) * 3.2) * (0.75 + r() * 0.5); // demi-longueur
      const bulge = half * (0.42 + r() * 0.22);
      for (const k of [1, 0.5]) {                       // amande + arc intérieur
        if (half * k < fine(st) * 0.9) continue;
        const lens = [];
        for (let j = 0; j <= 14; j++) {
          const p = -1 + (2 * j) / 14;
          const e = (1 - p * p) * bulge * k;
          lens.push([cx + tx * half * k * p + nx * e, cy + ty * half * k * p + ny * e]);
        }
        for (let j = 14; j >= 0; j--) {
          const p = -1 + (2 * j) / 14;
          const e = -(1 - p * p) * bulge * k;
          lens.push([cx + tx * half * k * p + nx * e, cy + ty * half * k * p + ny * e]);
        }
        lens.push(lens[0]);
        out.push(lens);
        if (k === 0.5) break;
      }
    }
    return out;
  }

  /* Marque d'aisselle : le court trait couché dans la fourche, du côté de l'angle aigu.
     Systématique dans la référence, et absent du trait nu — la fourche y paraissait vide. */
  function axilMark(child, parent, st) {
    if (!child.anchorPoint || child.forceKind === "piste" || child.axis.length < 12) return [];
    const i0 = Math.round(0.05 * (child.axis.length - 1));
    const i1 = Math.round(0.26 * (child.axis.length - 1));
    if (i1 - i0 < 3) return [];

    // côté aigu = celui vers lequel pointe la mère (sa direction d'avancée)
    let j = 0, bd = Infinity;
    for (let k = 0; k < parent.axis.length; k++) {
      const d = dist(parent.axis[k], child.anchorPoint);
      if (d < bd) { bd = d; j = k; }
    }
    const a = parent.axis[Math.max(0, j - 3)], b2 = parent.axis[Math.min(parent.axis.length - 1, j + 3)];
    const L = Math.hypot(b2[0] - a[0], b2[1] - a[1]) || 1;
    const fx = (b2[0] - a[0]) / L, fy = (b2[1] - a[1]) / L;
    const [n0x, n0y] = normalAt(child.axis, i1);
    const side = fx * n0x + fy * n0y >= 0 ? 1 : -1;

    const line = [];
    for (let i = i0; i <= i1; i++) {
      const u = i / (child.axis.length - 1);
      const w = drawWidthAt(child, u, st);
      const room = w / 2 - fine(st) * 1.6;
      if (room <= 0.4) continue;
      const [nx, ny] = normalAt(child.axis, i);
      const f = smoothstep(0, 0.35, (i - i0) / (i1 - i0)) * smoothstep(0, 0.5, (i1 - i) / (i1 - i0));
      const d = side * Math.min(room, w * 0.42) * (0.35 + 0.65 * f);
      line.push([child.axis[i][0] + nx * d, child.axis[i][1] + ny * d]);
    }
    return line.length > 3 ? [line] : [];
  }

  // ruban de calibre constant autour de plusieurs polylignes, en une seule passe
  function twigOutlineSet(lines, w) {
    const co = new ClipperLib.ClipperOffset();
    let any = false;
    for (const l of lines) {
      if (l.length >= 2) { co.AddPath(toInt(l), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etOpenButt); any = true; }
    }
    if (!any) return [];
    const sol = new ClipperLib.Paths();
    co.Execute(sol, (w / 2) * S);
    return cleanup(sol.filter((p) => p.length >= 3).map(fromInt));
  }

  /* SPIRE, deuxième version. La première posait des brins SÉPARÉS en travers de la branche :
     des barres parallèles, régulières, détachées du reste — ça se lisait comme du ruban
     adhésif, et c'était juste, puisque rien ne les reliait à la liane.

     Ici on ne substitue plus des barres : on DÉTOURNE l'axe de la liane lui-même en hélice
     autour de la branche. Le ruban reste donc une seule courbe continue, qui arrive, tourne,
     et repart — et l'on efface simplement les demi-tours qui passent derrière. C'est ce
     raccordement qui manquait : l'œil complète la moitié cachée parce qu'il voit la même
     tige entrer et ressortir. */
  function helixThrough(scene, b, bois, st) {
    const dedans = clipLines([b.axis], bois, ClipperLib.ClipType.ctIntersection);
    if (!dedans.length) return null;

    const idxOf = (p) => {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < b.axis.length; i++) {
        const d = dist(b.axis[i], p);
        if (d < bd) { bd = d; bi = i; }
      }
      return bi;
    };
    const sAbs = [0];
    for (let i = 1; i < b.axis.length; i++) sAbs.push(sAbs[i - 1] + dist(b.axis[i - 1], b.axis[i]));

    const axis = b.axis.map((p) => p.slice());
    let touche = false;

    for (const piece of dedans) {
      const i0 = idxOf(piece[0]), i1 = idxOf(piece[piece.length - 1]);
      const ia = Math.min(i0, i1), ib = Math.max(i0, i1);
      if (ib - ia < 2) continue;
      const ic = Math.round((ia + ib) / 2);

      /* Repère de la BRANCHE traversée, pas de la liane : c'est autour d'elle qu'on tourne.
         En prenant la normale de la liane, une traversée de biais faisait osciller la tige
         LE LONG de la branche — elle s'enroulait à côté, dans le vide. */
      let C = null, tx = 0, ty = 0, W = 0, bd = Infinity;
      for (const o of scene.branches) {
        if (o.forceKind === "liane" || o.forceKind === "piste") continue;
        for (let i = 1; i < o.axis.length - 1; i++) {
          const d = dist(o.axis[i], b.axis[ic]);
          if (d < bd) {
            bd = d;
            C = o.axis[i];
            const p0 = o.axis[i - 1], p1 = o.axis[i + 1];
            const L2 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
            tx = (p1[0] - p0[0]) / L2; ty = (p1[1] - p0[1]) / L2;
            W = widthAt(o, i / Math.max(1, o.axis.length - 1), st);
          }
        }
      }
      if (!C || !(W > 2)) continue;
      const nx = -ty, ny = tx;                        // en travers de la branche

      // la liane doit LONGER la branche le temps de faire son tour
      const tours = Math.max(1, Math.round(st.coilTurns || 1));
      const pas = W * 2.0;
      const portee = pas * tours;                     // demi-longueur du détour
      // la boucle doit dégager franchement le bois des deux côtés, sinon elle se lit
      // comme une simple ondulation posée dessus
      const rayon = W / 2 + Math.max((st.lianeWidth || 12) * 1.1, W * 0.28);
      // sens de parcours : celui dans lequel la liane franchit la branche
      const sens = (b.axis[ib][0] - b.axis[ia][0]) * tx + (b.axis[ib][1] - b.axis[ia][1]) * ty >= 0 ? 1 : -1;

      for (let i = 0; i < b.axis.length; i++) {
        const u = (sAbs[i] - sAbs[ic]) / (portee * 1.35);
        if (u <= -1 || u >= 1) continue;
        /* Mélange progressif entre le tracé d'origine et l'hélice. Le poids s'annule aux deux
           bouts avec une pente nulle : la liane part et repart exactement dans la direction
           tracée, sans jointure — c'est ce qui manquait à la version précédente. */
        const w = Math.pow(Math.cos((Math.PI * u) / 2), 2);
        const le = sens * portee * u;                                   // avance le long du bois
        const ph = Math.PI * (2 * tours + 1) * ((u + 1) / 2);           // demi-tours
        const hx = C[0] + tx * le - nx * rayon * Math.cos(ph);
        const hy = C[1] + ty * le - ny * rayon * Math.cos(ph);
        axis[i] = [axis[i][0] * (1 - w) + hx * w, axis[i][1] * (1 - w) + hy * w];
        touche = true;
      }
    }
    if (!touche) return null;

    // un passage sur deux dans le bois se dessine derrière
    const morceaux = clipLines([axis], bois, ClipperLib.ClipType.ctIntersection);
    const rang = (m) => {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < axis.length; i++) {
        const d = dist(axis[i], m[0]);
        if (d < bd) { bd = d; bi = i; }
      }
      return bi;
    };
    morceaux.sort((x, y) => rang(x) - rang(y));
    return { axis, brins: morceaux.filter((_, i) => i % 2 === 1) };
  }

  function coilStrokes(scene, piece, st) {
    const E = piece[0], X = piece[piece.length - 1];
    const trav = [X[0] - E[0], X[1] - E[1]];
    const L = Math.hypot(trav[0], trav[1]);
    if (L < 3) return [];

    // direction de la branche traversée, lue sur son axe le plus proche
    const mid = [(E[0] + X[0]) / 2, (E[1] + X[1]) / 2];
    let dirX = -trav[1] / L, dirY = trav[0] / L, bd = Infinity;
    for (const b of scene.branches) {
      if (b.forceKind === "liane") continue;
      for (let i = 1; i < b.axis.length - 1; i++) {
        const d = dist(b.axis[i], mid);
        if (d < bd) {
          bd = d;
          const a = b.axis[i - 1], c = b.axis[i + 1];
          const l2 = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
          dirX = (c[0] - a[0]) / l2; dirY = (c[1] - a[1]) / l2;
        }
      }
    }

    const n = Math.max(1, Math.round(st.coilTurns || 3));
    // l'avancée le long de la branche est celle du tracé : la spire tient entre entrée et sortie
    const avance = (X[0] - E[0]) * dirX + (X[1] - E[1]) * dirY;
    let pas = avance / (n - 0.5 || 1);
    /* Traversée perpendiculaire : l'avancée est nulle et les brins se superposeraient. Une
       spire a de toute façon un pas propre, de l'ordre de la largeur de la branche — c'est
       elle qui commande, pas l'inclinaison du geste. */
    const mini = L * 0.72;
    if (Math.abs(pas) < mini) pas = (pas < 0 ? -1 : 1) * mini;
    const cx = -trav[1] / L, cy = trav[0] / L;   // pas utilisé, garde la base orthonormée
    const out = [];
    for (let k = 0; k < n; k++) {
      const brin = [];
      for (let j = 0; j <= 14; j++) {
        const t = j / 14;
        /* traversée en cosinus : rapide au milieu, tangente au bord — c'est ainsi qu'un tour
           d'hélice se projette, et c'est ce qui donne l'impression d'enroulement */
        const trv = (1 - Math.cos(Math.PI * t)) / 2;
        const along = pas * (k + t / 2);
        brin.push([
          E[0] + trav[0] * trv + dirX * along,
          E[1] + trav[1] * trv + dirY * along,
        ]);
      }
      out.push(brin);
    }
    return out;
  }

  /* ANNEAUX DE NŒUD. La référence ne renfle pas la tige aux nœuds : elle y pose un petit
     anneau qui l'enserre — 1,5 fois le calibre, tous les 12 calibres environ. C'est ce détail
     qui fait lire une liane plutôt qu'un tuyau. Le disque est fondu dans le ruban : le
     contour en fait donc le tour, exactement comme sur le dessin. */
  function lianeNodes(b, st) {
    if (b.forceKind !== "liane" || st.lianeNodes <= 0) return { discs: [], anneaux: [] };
    const pas = Math.max(3, st.lianeNodeStep) * b.w0;
    const n = Math.floor(b.len / pas);
    const discs = [], anneaux = [];
    for (let k = 1; k <= n; k++) {
      const u = (k * pas) / b.len;
      if (u > 0.82) break;                       // pas d'anneau sur la queue effilée
      const c = b.axis[Math.round(u * (b.axis.length - 1))];
      const r = (b.w0 * st.lianeNodes) / 2;
      discs.push(circle(c, r, 28));              // occulte ce qui passe dessous
      const a = circle(c, r, 28);                // et se dessine en CERCLE entier
      anneaux.push(a.concat([a[0]]));
    }
    return { discs, anneaux };
  }

  /* Découpe la scène en arbres (composantes connexes) et calcule pour chacun :
     - silhouette : jeu de contours fermés (union des rubans + congés d'aisselle)
     - bark       : polylignes internes (à clipper par la silhouette au rendu)          */
  BE.buildGeometry = function (scene, st) {
    const byId = new Map(scene.branches.map((b) => [b.id, b]));
    const rootOf = new Map();
    const findRoot = (b) => {
      if (rootOf.has(b.id)) return rootOf.get(b.id);
      const r = b.parentId && byId.has(b.parentId) ? findRoot(byId.get(b.parentId)) : b.id;
      rootOf.set(b.id, r);
      return r;
    };
    const groups = new Map();
    for (const b of scene.branches) {
      const r = findRoot(b);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(b);
    }

    /* Renflements : chaque fille fait gonfler sa mère à son point de départ. Recalculé à chaque
       build (les réglages et les accroches peuvent avoir changé). */
    for (const b of scene.branches) b.bumps = [];
    for (const c of scene.branches) {
      if (!c.parentId || !c.anchorPoint || !byId.has(c.parentId)) continue;
      const p = byId.get(c.parentId);
      let best = 0, bd = Infinity;
      for (let i = 0; i < p.axis.length; i++) {
        const d = dist(p.axis[i], c.anchorPoint);
        if (d < bd) { bd = d; best = i; }
      }
      const u = best / Math.max(1, p.axis.length - 1);
      const sigma = Math.min(0.35, Math.max(0.03, (c.w0 * 1.4) / Math.max(1, p.len)));
      p.bumps.push({ u, sigma, amp: st.junctionSwell * c.w0 });
    }

    const trees = [];
    for (const [rootId, branches] of groups) {
      /* Deux registres distincts :
           - rubans   -> leur contour EST l'encre (double trait), et ils fusionnent entre eux
           - brindilles -> un seul trait : leur axe est l'encre, leur ruban ne sert qu'à occulter
         Une branche trop fine pour tenir deux traits distincts bascule en brindille (le
         classement est refait à chaque build : bouger le plancher reclasse en direct).       */
      let ribbons = [];
      let twigs = [];
      let bark = [];
      let rings = [];
      const twigAxes = [];
      for (const b of branches) {
        const g = branchGeom(b, st);
        if (g.polys.length) {
          const nds = lianeNodes(b, st);
          ribbons = unionSet(ribbons, cleanup(g.polys));
          if (nds.discs.length) {
            twigs = unionSet(twigs, cleanup(nds.discs));   // occultation seule
            bark = bark.concat(nds.anneaux);               // le cercle, tracé par-dessus
          }
          if (b.forceKind !== "piste" && b.forceKind !== "liane") {
            bark = bark.concat(barkLines(b, st), knots(b, st));
            if (b.parentId && byId.has(b.parentId)) bark = bark.concat(axilMark(b, byId.get(b.parentId), st));
          }
        }
        if (g.rings.length) rings = rings.concat(g.rings);
        if (g.twig && g.twig.length >= 2) {
          twigs = unionSet(twigs, twigOutline(g.twig, st));
          twigAxes.push(g.twig);
        }
      }
      for (const b of branches) {
        // pas de congé sur une piste : un circuit imprimé a des angles vifs, c'est le propos
        if (!b.anchorPoint || isTwig(b, st) || b.forceKind === "piste") continue;
        const r = st.filletRatio * b.w0;
        ribbons = filletAt(ribbons, b.anchorPoint, Math.max(r * 3, b.w0 * 2.2), r);
      }
      // une brindille ne se dessine pas à l'intérieur d'un ruban (elle en sort, elle ne le traverse pas)
      const lines = clipLines(twigAxes, ribbons, ClipperLib.ClipType.ctDifference)
        .concat(bark)
        .concat(rings); // anneaux de vias/pastilles : déjà à l'intérieur, ne pas les découper
      const laLiane = branches.length === 1 && branches[0].forceKind === "liane";
      trees.push({
        rootId, order: rootId, outline: ribbons, silhouette: unionSet(ribbons, twigs), lines,
        liane: laLiane,
        axis: laLiane ? branches[0].axis : null,
        w0: laLiane ? branches[0].w0 : 0,
      });
    }

    /* ENROULEMENT DES LIANES. Une liane ne passe pas bêtement par-dessus tout ce qu'elle
       croise : elle s'enroule, donc elle passe devant, puis derrière, puis devant. C'est ce
       va-et-vient qui la fait lire comme une liane plutôt que comme un fil posé dessus.

       On découpe donc son axe par le bois, on numérote les traversées, et on efface son encre
       sur une traversée sur deux. La découpe suit exactement le contour de la branche, si bien
       que la coupe tombe sur le trait de la branche et ne se voit pas. */
    /* Une liane s'enroule autour du BOIS. Pas autour d'une piste : elle ne fait que 3,5 mm,
       et surtout une piste qui PROLONGE la liane était vue comme un obstacle à contourner —
       une spire parasite se posait au raccord et cassait l'enroulement déjà en place. */
    const pistes = new Set(scene.branches.filter((b) => b.forceKind === "piste").map((b) => b.id));
    const bois = trees.filter((t) => !t.liane && !pistes.has(t.rootId))
                      .reduce((acc, t) => unionSet(acc, t.outline), []);
    for (const b of scene.branches) if (b.forceKind === "liane") b.coilZones = null;
    if (bois.length) {
      for (const t of trees) {
        if (!t.liane || !t.axis) continue;
        const b = scene.branches.find((x) => x.id === t.rootId);
        if (!b) continue;
        const h = helixThrough(scene, b, bois, st);
        b.coilAxis = h ? h.axis : null;   // relu par les tests : trajet réel du tour
        /* Fenêtres du tour, sur l'axe TRACÉ : c'est celui-là qui porte les motifs posés.
           Une branche dessinée après coup crée une spire sous des feuilles déjà en place —
           elles doivent alors s'effacer, sinon le croisement redevient illisible. */
        b.coilZones = h ? BE.coilSpans(scene, b, st) : null;
        if (!h) continue;

        // on refabrique la liane sur son axe détourné : un seul ruban, continu
        const axeVrai = b.axis, lenVrai = b.len;
        b.axis = h.axis;
        b.len = polyLength(h.axis);
        const g = branchGeom(b, st);
        const nds = lianeNodes(b, st);
        let rub = g.polys.length ? cleanup(g.polys) : [];
        let fil = [];
        const axesFil = [];
        if (g.twig && g.twig.length >= 2) { fil = twigOutline(g.twig, st); axesFil.push(g.twig); }
        if (nds.discs.length) fil = unionSet(fil, cleanup(nds.discs));
        b.axis = axeVrai;
        b.len = lenVrai;

        // puis on efface les demi-tours qui passent derrière le bois
        let masque = [];
        for (const brin of h.brins) {
          const co = new ClipperLib.ClipperOffset();
          co.AddPath(toInt(brin), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etOpenRound);
          const sol = new ClipperLib.Paths();
          co.Execute(sol, (b.w0 / 2 + st.ink * 0.9) * S);
          masque = unionSet(masque, sol.filter((p) => p.length >= 3).map(fromInt));
        }
        masque = interSet(masque, bois);      // on n'efface QUE là où le bois est réellement
        if (masque.length) {
          rub = boolOp(rub, masque, ClipperLib.ClipType.ctDifference);
          fil = boolOp(fil, masque, ClipperLib.ClipType.ctDifference);
        }
        t.outline = rub;
        t.silhouette = unionSet(rub, fil);
        t.lines = clipLines(axesFil, rub, ClipperLib.ClipType.ctDifference).concat(nds.anneaux);
        if (masque.length) t.lines = clipLines(t.lines, masque, ClipperLib.ClipType.ctDifference);
      }
    }

    // Motifs posés : chacun est sa propre couche, ordonnée par date de pose comme les arbres,
    // donc l'occlusion « autocollant » joue entre motifs et branches sans code en plus.
    /* ENCOMBREMENT. L'outil choisit lui-même le côté, la taille et l'angle : rien ne garantit
       que la place soit libre, et une liane tracée après coup peut venir traverser une feuille
       déjà posée. On repasse donc derrière, en distinguant deux cas :

         "pose"   — un motif posé d'un geste, à un endroit désigné. On peut le basculer de
                    l'autre côté, jamais l'écarter : l'utilisateur a montré cet endroit-là.
         "rythme" — semé en file ou garniture automatique, personne n'a choisi l'endroit.
                    Faute de place, on ne pose pas plutôt que d'empiler.

       Un tap et un glissé passaient auparavant par des chemins différents — le tap échappait
       à tout arbitrage — et les motifs s'entassaient aux fourches en composition complète. */
    const pris = [];
    BE._retournes = 0; BE._ecartes = 0; BE._serres = 0;
    for (const s of scene.stamps || []) {
      const sup = byId.get(s.branchId);
      if (sup && sup.coilZones && dansSpan(s.t, sup.coilZones, "t0", "t1")) continue;
      let cote;
      if (s.auto) {
        const fp = stampFootprint(scene, s, st, s.side);
        if (!fp) continue;
        if (stampFits(scene, s, st, fp, pris)) { cote = s.side; pris.push(fp); }
        else {
          const alt = stampFootprint(scene, s, st, -s.side);
          if (alt && stampFits(scene, s, st, alt, pris)) { cote = -s.side; pris.push(alt); BE._retournes++; }
          else if (s.auto === "pose") { cote = s.side; pris.push(fp); BE._serres++; }
          else { BE._ecartes++; continue; }
        }
      }
      s._side = cote === undefined ? s.side : cote;   // côté réellement rendu (lu par les tests)
      const g = stampGeom(scene, cote !== undefined && cote !== s.side
        ? Object.assign({}, s, { side: cote, _key: null, _geom: null }) : s, st);
      if (g && g.silhouette.length) {
        /* Un motif qui POUSSE de son support doit le toucher : une feuille naît de sa tige,
           un champignon de son écorce. La marge d'interruption les en détacherait par un blanc.
           Une pièce insérée dans la ligne, elle, doit bien l'interrompre : c'est son rôle. */
        const pousse = !BE.poseRule(BANK[s.motifId]).centre;
        trees.push({ rootId: g.order, order: g.order, outline: [], pousse,
                     silhouette: g.silhouette, lines: g.lines });
      }
    }
    /* ZONE DESSINABLE. Le décor va sur une table de guitare : ce qui déborde du corps ou
       tombe dans une défonce ne sera jamais pyrogravé. Plutôt que de brider le tracé — ce qui
       empêche la végétation de venir mordre le bord, comme elle le fait sur la référence — on
       laisse dessiner librement et on coupe à la fin. `st.zone` = jeu de polygones. */
    if (st.zone && st.zone.length) {
      const gardes = [];
      for (const t of trees) {
        const sil = interSet(t.silhouette, st.zone);
        if (!sil.length) continue;
        t.silhouette = sil;
        t.outline = t.outline.length ? interSet(t.outline, st.zone) : t.outline;
        t.lines = clipLines(t.lines, st.zone, ClipperLib.ClipType.ctIntersection);
        gardes.push(t);
      }
      trees.length = 0;
      for (const t of gardes) trees.push(t);
    }

    /* MARGE D'INTERRUPTION. Ce qui passe devant doit masquer un peu PLUS que sa propre largeur,
       sinon le croisement ne se lit pas : deux lianes de 3,3 mm qui se coupent n'effacent
       qu'une largeur de ruban, et l'œil ne peut pas dire laquelle passe devant — elles
       fusionnent en X. C'est la convention du dessin technique : la ligne du dessous s'arrête
       avant celle du dessus.

       On élargit donc la silhouette d'occultation, pas le dessin : le contour et les traits
       de l'élément se dessinent ensuite à leur place exacte, par-dessus ce blanc. Sur fond
       blanc la marge ne se voit pas ; elle ne se révèle qu'aux croisements. */
    const halo = st.halo === undefined ? st.ink : st.halo;
    if (halo > 0) {
      for (const t of trees) {
        if (!t.silhouette.length || t.pousse) continue;
        const co = new ClipperLib.ClipperOffset();
        for (const p of t.silhouette)
          if (p.length >= 3) co.AddPath(toInt(p), ClipperLib.JoinType.jtRound,
                                        ClipperLib.EndType.etClosedPolygon);
        const sol = new ClipperLib.Paths();
        co.Execute(sol, halo * S);
        const gros = sol.filter((p) => p.length >= 3).map(fromInt);
        if (gros.length) t.silhouette = cleanup(gros);
      }
    }

    trees.sort((a, b) => a.order - b.order); // z-order = ordre de création
    return trees;
  };

  // ───────────────────────── aplatissement : arbres → contours d'encre (pont vers l'éditeur) ─────────────────────────

  /* Contour d'encre d'un OUTLINE fermé (le tour du ruban) : on épaissit la BOUCLE elle-même,
     pas son intérieur. `etClosedLine` trace l'anneau en un seul offset (delta de chaque côté de
     la boucle, dans le même appel). La variante à deux offsets pleins (+d puis -d, puis
     différence) donne le même anneau tant que le ruban est plus large que l'encre, mais se
     retourne (trou qui mange tout le contour) dès qu'un tronçon est plus étroit que l'encre —
     l'offset intérieur -d y traverse alors l'axe et repart de l'autre côté. `etClosedLine` n'a
     pas ce cas dégénéré : chaque côté de la boucle est décalé de d, point, sans jamais
     recroiser son propre centre. */
  function outlineInk(outline, w) {
    if (!outline.length) return [];
    const co = new ClipperLib.ClipperOffset();
    co.AddPaths(outline.map(toInt), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedLine);
    const sol = new ClipperLib.Paths();
    co.Execute(sol, (w / 2) * S);
    return cleanup(sol.filter((p) => p.length >= 3).map(fromInt));
  }

  // contour d'encre d'un jeu de polylignes OUVERTES, à la largeur `w` — même modèle que
  // `inkOutline`, dont la largeur était figée à `fine(st)` : ici l'appelant choisit, parce
  // qu'un arbre sans ruban (motif posé) et un arbre avec ruban (écorce/nœuds sur une branche)
  // n'ont pas le même poids de trait une fois aplatis (cf. BE.toContours).
  function linesInk(lines, w) {
    const co = new ClipperLib.ClipperOffset();
    let any = false;
    for (const l of lines) {
      if (l.length >= 2) { co.AddPath(toInt(l), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etOpenRound); any = true; }
    }
    if (!any) return [];
    const sol = new ClipperLib.Paths();
    co.Execute(sol, (w / 2) * S);
    return cleanup(sol.filter((p) => p.length >= 3).map(fromInt));
  }

  /* Aplatit les arbres triés par z-order (sortie de BE.buildGeometry) en la liste de contours
     d'encre que travaille l'éditeur (`edit.draft` dans src/app.js ; ML.unionPolys/offsetPolygon
     dans src/geometry.js). L'ordre z n'existe plus une fois aplati : il faut donc le CUIRE ici,
     arbre par arbre — silhouette d'abord (efface l'encre de ce qui est dessous, effet
     « autocollant »), encre de l'arbre ensuite — exactement ce que fait le rendu de contrôle
     (test/branch-proto-render.py : silhouette blanche, puis outline et lines à l'encre).

     Poids de trait des `lines` : `st.ink` si l'arbre a un `outline` (une branche peut porter de
     l'écorce, des nœuds, un fil de brindille — du DÉTAIL sur un ruban déjà structurant), sinon
     `st.inkFine` (un motif posé n'a que ses `lines` : elles sont sa seule encre). Note : le banc
     interactif (test/branches.html) trace, lui, TOUJOURS les `lines` à `inkFine`, quel que soit
     l'arbre — ce pont applique la règle demandée pour l'éditeur, distincte de cet aperçu écran. */
  BE.toContours = function (trees, st) {
    let acc = [];
    for (const t of trees) {
      if (t.silhouette && t.silhouette.length) acc = boolOp(acc, t.silhouette, ClipperLib.ClipType.ctDifference);
      const bord = t.outline && t.outline.length ? outlineInk(t.outline, st.ink) : [];
      const poids = t.outline && t.outline.length ? st.ink : fine(st);
      const trait = t.lines && t.lines.length ? linesInk(t.lines, poids) : [];
      const encre = unionSet(bord, trait);
      if (encre.length) acc = unionSet(acc, encre);
    }
    return acc.map((pts) => ({ pts, closed: true }));
  };

  BE.stats = function (scene) {
    let L = 0;
    for (const b of scene.branches) L += b.len;
    return { branches: scene.branches.length, lengthMm: L * BE.MM_PER_PX };
  };

  // ───────────────────────── export SVG ─────────────────────────

  const fmt = (v) => Math.round(v * 100) / 100;
  const toD = (pts, closed) =>
    "M" + pts.map((p) => `${fmt(p[0])},${fmt(p[1])}`).join("L") + (closed ? "Z" : "");

  BE.toSVG = function (trees, w, h, st) {
    const mm = BE.MM_PER_PX;
    const parts = [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(w)} ${fmt(h)}" ` +
        `width="${fmt(w * mm)}mm" height="${fmt(h * mm)}mm">`,
      `<g fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round">`,
    ];
    trees.forEach((t, i) => {
      if (!t.silhouette.length) return;
      const sil = t.silhouette.map((p) => toD(p, true)).join("");
      parts.push(`<clipPath id="c${i}"><path d="${sil}" clip-rule="evenodd"/></clipPath>`);
      parts.push(`<path d="${sil}" fill="#fff" stroke="none"/>`); // occlusion « autocollant »
      if (t.outline.length) {
        parts.push(`<path d="${t.outline.map((p) => toD(p, true)).join("")}" stroke-width="${fmt(st.ink)}"/>`);
      }
      if (t.lines.length) {
        parts.push(`<g clip-path="url(#c${i})" stroke-width="${fmt(fine(st))}">`);
        for (const line of t.lines) parts.push(`<path d="${toD(line, false)}"/>`);
        parts.push(`</g>`);
      }
    });
    parts.push("</g></svg>");
    return parts.join("\n");
  };
})();
