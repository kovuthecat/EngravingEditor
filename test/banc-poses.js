/* Banc d'essai des MANIÈRES DE POSER — node test/banc-poses.js && python test/branch-proto-render.py
   Sème un motif de chaque pose sur une piste PCB et sur une branche organique, puis
   exporte la géométrie pour le rendu de contrôle. Sert à juger le résultat à l'image :
   une pièce en ligne doit être traversée par sa piste, un nœud doit être centré dessus,
   un motif terminal doit être au bout, un motif monté doit être debout. */
global.window = {};
global.ClipperLib = require("../vendor/clipper.js");
require("../src/motif-bank.js");
require("../src/branch-engine.js");
const BE = global.window.BE, MM = 1 / 0.288;
BE.setBank(global.window.MOTIF_BANK);

const st = { rootWidth: 46, taper: 1.15, tipFrac: 0.12, childRatio: 0.66, childRatioSide: 0.30,
  filletRatio: 0.7, emergeLead: 0.5, swellAmp: 0.1, junctionSwell: 0.35, wobbleAmp: 0.02,
  wobbleLen: 3.2, smoothPx: 2.5 * MM, tipLen: 8 * MM, barkPitch: 14, ink: 1 * MM,
  inkFine: 0.6 * MM, minRibbon: 3 * MM, snap: 26, tailTwig: false, knotDensity: 1,
  knotStep: 26 * MM, pcbWidth: 3.5 * MM, pcbTol: 18, pcbVias: true, pcbPad: true,
  lianeWidth: 3.3 * MM, lianeNodes: 0, lianeNodeStep: 12, lianeCollar: 0.55, lianeLeaf: 6,
  lianeEtat: "organique", sowSize: 26 * MM, sowStep: 46 * MM, sowAngle: (55 * Math.PI) / 180,
  autoLod: true, coilTurns: 1 };

const sc = BE.createScene();
const pose = (id) => (BE.motif(id) || {}).pose;

// ── piste PCB : ce qui s'insère dans la ligne ────────────────────────────────
const pc = [];
for (let i = 0; i <= 78; i++) pc.push([110 + i * 16, 210]);
const P = BE.addBranch(sc, pc, st, null, "piste");
[["resistance-axiale-electronique", 0.09], ["bobine-electronique", 0.28],
 ["condensateur-electrolytique-electronique", 0.45], ["puce-qfp-electronique", 0.63],
 ["condensateur-ceramique-electronique", 0.80], ["tube-rond-electronique", 0.93]]
  .forEach(([id, t]) => BE.sowAlong(sc, P.id, t, t, id, st));

// ── piste colonisée : les mêmes pièces en version hybride ────────────────────
const pc2 = [];
for (let i = 0; i <= 78; i++) pc2.push([110 + i * 16, 470]);
const P2 = BE.addBranch(sc, pc2, st, null, "piste");
[["resistance-cms-hybride", 0.10], ["bobine-hybride", 0.30], ["puce-dip-hybride", 0.52],
 ["condensateur-ceramique-hybride", 0.74], ["tube-rond-hybride", 0.92]]
  .forEach(([id, t]) => BE.sowAlong(sc, P2.id, t, t, id, st));

// ── branche organique : ce qui pousse dessus, et ce qui la termine ───────────
const br = [];
for (let i = 0; i <= 96; i++) br.push([110 + i * 13, 760 + Math.sin(i / 20) * 24]);
const B = BE.addBranch(sc, br, st, null);
BE.sowAlong(sc, B.id, 0.12, 0.30, "champignon-touffe-organique", st);
BE.sowAlong(sc, B.id, 0.45, 0.66, "feuille-dentelee-organique", st);
BE.sowAlong(sc, B.id, 0.80, 0.86, "fleur-ouverte-organique", st);
BE.sowAlong(sc, B.id, 0.5, 0.5, "radicelle-organique", st);       // doit filer au bout

// ── liane : sa garniture et sa vrille terminale ──────────────────────────────
const li = [];
for (let i = 0; i <= 90; i++) li.push([1180 + Math.sin(i / 14) * 40, 620 + i * 5]);
BE.garnishLiane(sc, BE.addBranch(sc, li, st, null, "liane"), st);

/* ── CHAÎNAGE : branche → résistance → piste → radicelle ─────────────────────
   Une pièce en ligne offre une borne libre à chaque bout : un tracé qui y démarre s'y
   recale, et la chaîne se lit d'un trait. C'est ce qui manquait — les composants se
   posaient à côté de leur piste sans jamais la relier à quoi que ce soit. */
function relier(depuis, vers, kind) {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const u = i / 24;
    pts.push([depuis[0] + (vers[0] - depuis[0]) * u, depuis[1] + (vers[1] - depuis[1]) * u]);
  }
  const r = BE.anchorStroke(sc, pts, st);
  return BE.addBranch(sc, r.pts, st, r.anchor, kind);
}

const ch = [];
for (let i = 0; i <= 34; i++) ch.push([110 + i * 11, 990 - i * 1.5]);
const tronc = BE.addBranch(sc, ch, st, null);                       // 1. la branche
const bout = tronc.axis[tronc.axis.length - 1];
const res = BE.addStampAuto(sc, "resistance-axiale-hybride", { branchId: tronc.id, t: 0.97 }, st);
BE.buildGeometry(sc, st);                                           // fige la pose des bornes
const libres = res ? BE.stampPorts(sc, res, st).filter((b) => !b.prise) : [];
if (libres.length) {                                                // 2. la piste repart de la patte
  const b = libres[libres.length - 1];
  const piste = relier([b.p[0] + b.dir[0] * 8, b.p[1] + b.dir[1] * 8],
                       [b.p[0] + b.dir[0] * 230, b.p[1] + b.dir[1] * 230 - 60], "piste");
  if (piste) {                                                      // 3. la radicelle termine
    BE.addStampAuto(sc, "radicelle-hybride", { branchId: piste.id, t: 0.97 }, st);
    const p2 = BE.addStampAuto(sc, "puce-qfp-hybride", { branchId: piste.id, t: 0.45 }, st);
    if (p2) console.log("chaîne : branche → résistance → piste → puce → radicelle");
  }
}
// et un champignon en milieu de support : il se pose, il n'enchaîne rien
BE.addStampAuto(sc, "champignon-plat-organique", { branchId: tronc.id, t: 0.45 }, st);

const trees = BE.buildGeometry(sc, st);
require("fs").writeFileSync("branch-proto.json", JSON.stringify({ W: 1402, H: 1122, ink: st.ink,
  trees: trees.map((t) => ({ silhouette: t.silhouette, outline: t.outline, lines: t.lines })) }));

const garde = new Set(trees.filter((t) => !t.outline.length && t.silhouette.length).map((t) => t.order));
console.log(`${sc.stamps.length} motifs · ${garde.size} rendus · ${BE._retournes} retournés · ${BE._ecartes} écartés`);
for (const s of sc.stamps) {
  const m = BE.motif(s.motifId);
  console.log(`  ${garde.has(s.id) ? "·" : "×"} ${m.pose.padEnd(10)} ${m.nom.padEnd(36)}` +
    ` t=${s.t.toFixed(2)}  ${((s.angle * 180) / Math.PI).toFixed(0).padStart(3)}°` +
    `  ${(s.sizePx * BE.MM_PER_PX).toFixed(0)} mm`);
}
