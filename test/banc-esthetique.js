/* BANC ESTHÉTIQUE — node test/banc-esthetique.js && python test/branch-proto-render.py
 *
 * Des spécimens ISOLÉS et GRANDS de chaque élément, pour juger le trait lui-même : effilement,
 * respiration, écorce, nœuds, pointe, fourche pour la branche ; calibre constant, anneaux,
 * collet, queue en fil pour la liane ; tronçons à 45°/90°, vias et pastilles pour la piste.
 *
 * Les autres bancs vérifient que les choses se posent et se croisent correctement. Celui-ci ne
 * regarde qu'une chose : est-ce que ça se DESSINE bien.
 */
global.window = {};
global.ClipperLib = require("../vendor/clipper.js");
require("../src/motif-bank.js");
require("../src/branch-engine.js");
const BE = global.window.BE, MM = 1 / 0.288;
BE.setBank(global.window.MOTIF_BANK);

const st = { rootWidth: 14 * MM, taper: 1.15, tipFrac: 0.12, childRatio: 0.66,
  childRatioSide: 0.30, filletRatio: 0.7, emergeLead: 0.5, swellAmp: 0.1, junctionSwell: 0.35,
  wobbleAmp: 0.02, wobbleLen: 3.2, smoothPx: 2.5 * MM, tipLen: 8 * MM, barkPitch: 14,
  ink: 1 * MM, inkFine: 0.6 * MM, minRibbon: 3 * MM, snap: 26, tailTwig: false,
  knotDensity: 1, knotStep: 26 * MM, pcbWidth: 3.5 * MM, pcbTol: 18, pcbVias: true,
  pcbPad: true, lianeWidth: 3.3 * MM, lianeNodes: 0, lianeNodeStep: 12, lianeCollar: 0.55,
  lianeLeaf: 6, lianeEtat: "organique", sowSize: 20 * MM, sowStep: 42 * MM,
  sowAngle: (55 * Math.PI) / 180, autoLod: true, coilTurns: 1 };

const sc = BE.createScene();
const W = 1500, H = 1180;

// une courbe douce, échantillonnée finement : le moteur doit produire un trait tenu
function arc(x0, y0, x1, y1, courbure, n) {
  const out = [], mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
  const cx = mx - (dy / L) * courbure, cy = my + (dx / L) * courbure;
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]);
  }
  return out;
}

/* 1. BRANCHE — trois calibres, avec une fille sur chacune pour juger la fourche.
   Le calibre décide de tout : trop fin, le ruban tombe au plancher de 3 mm et devient un
   trait ; trop gros, il ne s'effile plus. */
[[26, 120], [17, 400], [10, 660]].forEach(([mm, y], k) => {
  const s2 = Object.assign({}, st, { rootWidth: mm * MM });
  const tronc = BE.addBranch(sc, arc(70, y, 560, y - 40, 40 + k * 20, 90), s2, null);
  if (!tronc) return;
  const p = tronc.axis[Math.round(0.45 * (tronc.axis.length - 1))];
  const anc = BE.hitAxis(sc, p, s2.snap, s2);
  BE.addBranch(sc, arc(p[0], p[1], p[0] + 150, p[1] - 150 - k * 15, 30, 40), s2, anc);
  const q = tronc.axis[Math.round(0.72 * (tronc.axis.length - 1))];
  const anc2 = BE.hitAxis(sc, q, s2.snap, s2);
  BE.addBranch(sc, arc(q[0], q[1], q[0] + 120, q[1] + 130, -25, 35), s2, anc2);
});

/* 2. LIANE — trois calibres. On juge le calibre constant (une liane ne s'effile pas comme une
   branche), le rythme des anneaux, le collet de départ et la queue qui finit en fil. */
[[5.0, 120], [3.3, 400], [2.2, 660]].forEach(([mm, y]) => {
  const s2 = Object.assign({}, st, { lianeWidth: mm * MM, lianeLeaf: 0 });
  BE.addBranch(sc, arc(660, y, 1010, y + 120, 90, 110), s2, null, "liane");
});
// une liane garnie, pour juger le rythme nœud–feuille
{
  const L = BE.addBranch(sc, arc(660, 900, 1010, 1020, 70, 110), st, null, "liane");
  if (L) BE.garnishLiane(sc, L, st);
}

/* 3. PISTE — trois largeurs. On juge les tronçons à 45°/90°, les vias aux coudes et la
   pastille de bout. Un tracé volontairement sinueux : c'est le routage qui doit le redresser. */
[[5.0, 120], [3.5, 400], [2.4, 660]].forEach(([mm, y]) => {
  const s2 = Object.assign({}, st, { pcbWidth: mm * MM });
  const pts = [];
  for (let i = 0; i <= 70; i++) pts.push([1080 + i * 5.4, y + Math.sin(i / 9) * 55 + i * 0.9]);
  BE.addBranch(sc, pts, s2, null, "piste");
});
// une piste qui repart d'une branche : c'est là que la transition se juge
{
  const b = BE.addBranch(sc, arc(1080, 900, 1230, 980, 30, 40), st, null);
  if (b) {
    const q = b.axis[b.axis.length - 1];
    const pts = [];
    for (let i = 0; i <= 40; i++) pts.push([q[0] + i * 5, q[1] + Math.sin(i / 7) * 30 + i * 1.2]);
    const r = BE.anchorStroke(sc, pts, st);
    BE.addBranch(sc, r.pts, st, r.anchor, "piste");
  }
}

const trees = BE.buildGeometry(sc, st);
require("fs").writeFileSync("branch-proto.json", JSON.stringify({ W, H, ink: st.ink,
  trees: trees.map((t) => ({ silhouette: t.silhouette, outline: t.outline, lines: t.lines })) }));

/* Mesures utiles à l'œil : largeur au départ et à la pointe (l'effilement), et longueur de
   trait interne par élément (la densité d'écorce). */
console.log("élément     calibre   largeur départ → pointe   traits internes");
for (const b of sc.branches) {
  const w0 = BE.widthAt(b, 0.02, st) * BE.MM_PER_PX;
  const w1 = BE.widthAt(b, 0.95, st) * BE.MM_PER_PX;
  const t = trees.find((x) => x.rootId === b.id);
  const lg = t ? t.lines.reduce((a, l) => {
    let s = 0;
    for (let i = 1; i < l.length; i++) s += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]);
    return a + s;
  }, 0) * BE.MM_PER_PX : 0;
  console.log(`${(b.forceKind || "branche").padEnd(10)} ${(b.w0 * BE.MM_PER_PX).toFixed(1).padStart(6)} mm` +
    `   ${w0.toFixed(1).padStart(5)} → ${w1.toFixed(1).padStart(5)} mm` +
    `   ${lg ? lg.toFixed(0) + " mm" : "—"}`);
}
console.log(`\n${sc.branches.length} spécimens · ${trees.length} arbres`);
