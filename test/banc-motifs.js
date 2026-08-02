/* BANC DE POSE EXHAUSTIF — node test/banc-motifs.js [taille_mm]

   Passe TOUS les motifs de la banque, un par un, sur le support qui leur convient, et dit
   pour chacun s'il se pose, à quelle taille, et sinon pourquoi. Le banc précédent ne testait
   qu'une poignée de motifs choisis à la main : il ne pouvait pas voir qu'une grande partie de
   la bibliothèque était devenue impossible à poser.

   Sort aussi test/branch-proto.json (une planche de tous les motifs posés) pour le rendu
   de contrôle : python test/branch-proto-render.py                                        */
global.window = {};
global.ClipperLib = require("../vendor/clipper.js");
require("../src/motif-bank.js");
require("../src/branch-engine.js");
const BE = global.window.BE, MM = 1 / 0.288;
BE.setBank(global.window.MOTIF_BANK);

const tailleMm = Number(process.argv[2]) || 18;   // taille de semis par défaut de la page

const st = { rootWidth: 46, taper: 1.15, tipFrac: 0.12, childRatio: 0.66, childRatioSide: 0.30,
  filletRatio: 0.7, emergeLead: 0.5, swellAmp: 0.1, junctionSwell: 0.35, wobbleAmp: 0.02,
  wobbleLen: 3.2, smoothPx: 2.5 * MM, tipLen: 8 * MM, barkPitch: 14, ink: 1 * MM,
  inkFine: 0.6 * MM, minRibbon: 3 * MM, snap: 26, tailTwig: false, knotDensity: 1,
  knotStep: 26 * MM, pcbWidth: 3.5 * MM, pcbTol: 18, pcbVias: true, pcbPad: true,
  lianeWidth: 3.3 * MM, lianeNodes: 0, lianeNodeStep: 12, lianeCollar: 0.55, lianeLeaf: 6,
  lianeEtat: "organique", sowSize: tailleMm * MM, sowStep: 46 * MM,
  sowAngle: (55 * Math.PI) / 180, autoLod: true, coilTurns: 1 };

/* Une carte = un motif ; les variantes de détail sont choisies par l'outil, les tester
   séparément ne dirait rien de plus. */
const cartes = [];
for (const m of BE.bank) {
  const cle = `${m.famille}|${m.forme}|${m.etat}`;
  let c = cartes.find((x) => x.cle === cle);
  if (!c) cartes.push((c = { cle, m, variantes: [] }));
  c.variantes.push(m);
}

// Chaque motif est posé isolément : une scène par motif, donc aucun voisin pour le gêner.
// Si un motif ne passe pas ICI, il ne passera jamais.
const COL = 7, PAS_X = 190, PAS_Y = 240;
const trees = [], bilan = [];
cartes.forEach((c, i) => {
  const ox = 70 + (i % COL) * PAS_X, oy = 90 + Math.floor(i / COL) * PAS_Y;
  const sc = BE.createScene();
  const pose = c.m.pose || "laterale";
  const surPiste = c.m.famille === "composant";
  const support = [];
  for (let k = 0; k <= 40; k++) support.push([ox - 80 + k * 4, oy + 70]);
  const b = BE.addBranch(sc, support, st, null, surPiste ? "piste" : undefined);
  if (!b) { bilan.push({ c, etat: "支", note: "support non créé" }); return; }

  const avant = sc.stamps.length;
  const s = BE.addStampAuto(sc, c.m.id, { branchId: b.id, t: 0.5 }, st);
  const rendus = BE.buildGeometry(sc, st);
  const couches = rendus.filter((t) => !t.outline.length && t.silhouette.length);

  let etat, note = "";
  if (!s) {
    etat = "REFUSÉ";
    const mini = Math.min(...c.variantes.map((v) => BE.minStampSize(v, st)));
    note = `demande ${(mini * BE.MM_PER_PX).toFixed(0)} mm, posé à ${tailleMm}`;
  } else if (!couches.length) {
    etat = "INVISIBLE";
    note = "posé mais rien de dessiné";
  } else {
    etat = "ok";
    const mm = s.sizePx * BE.MM_PER_PX;
    if (mm > tailleMm * 1.05) note = `agrandi à ${mm.toFixed(0)} mm`;
    for (const t of rendus) trees.push(t);
  }
  bilan.push({ c, etat, note, pose, s });
});

// ── rapport ──
const large = Math.max(...bilan.map((b) => b.c.m.nom.length));
let ok = 0, ko = 0;
for (const b of bilan) {
  if (b.etat === "ok") ok++; else ko++;
  const marque = b.etat === "ok" ? "  " : "→ ";
  console.log(`${marque}${b.etat.padEnd(9)} ${(b.pose || "").padEnd(10)} ` +
    `${b.c.m.nom.padEnd(large)} ${b.note}`);
}
console.log(`\n${ok}/${bilan.length} motifs posables à ${tailleMm} mm · ${ko} en échec`);

require("fs").writeFileSync("branch-proto.json", JSON.stringify({
  W: 70 + COL * PAS_X, H: 120 + Math.ceil(cartes.length / COL) * PAS_Y, ink: st.ink,
  trees: trees.map((t) => ({ silhouette: t.silhouette, outline: t.outline, lines: t.lines })) }));

process.exitCode = ko ? 1 : 0;
