/* BANC DES CROISEMENTS — node test/banc-croisements.js && python test/branch-proto-render.py
 *
 * Chaque paire d'éléments qui peut se croiser dans un décor, une par case, pour juger le
 * rendu de l'intersection : qui passe devant, la coupe est-elle nette, reste-t-il des traits
 * qui traversent ce qui devrait les cacher.
 *
 * Les bancs précédents posaient chaque élément dans son coin. Or c'est aux croisements que le
 * décor se lit ou se brouille, et aucun test unitaire ne les regardait.
 */
global.window = {};
global.ClipperLib = require("../vendor/clipper.js");
require("../src/motif-bank.js");
require("../src/branch-engine.js");
const BE = global.window.BE, MM = 1 / 0.288;
BE.setBank(global.window.MOTIF_BANK);

const st = { rootWidth: 34, taper: 1.15, tipFrac: 0.12, childRatio: 0.66, childRatioSide: 0.30,
  filletRatio: 0.7, emergeLead: 0.5, swellAmp: 0.1, junctionSwell: 0.35, wobbleAmp: 0.02,
  wobbleLen: 3.2, smoothPx: 2.5 * MM, tipLen: 8 * MM, barkPitch: 14, ink: 1 * MM,
  inkFine: 0.6 * MM, minRibbon: 3 * MM, snap: 26, tailTwig: false, knotDensity: 1,
  knotStep: 26 * MM, pcbWidth: 3.5 * MM, pcbTol: 18, pcbVias: true, pcbPad: true,
  lianeWidth: 3.3 * MM, lianeNodes: 0, lianeNodeStep: 12, lianeCollar: 0.55, lianeLeaf: 0,
  lianeEtat: "organique", sowSize: 26 * MM, sowStep: 46 * MM, sowAngle: (55 * Math.PI) / 180,
  autoLod: true, coilTurns: 1 };

const COL = 3, LARG = 420, HAUT = 330;
const sc = BE.createScene();
const cas = [];

// un trait horizontal et un trait oblique qui le traverse, dans la case (ox, oy)
function paire(ox, oy, kindA, kindB, angleB) {
  const a = [];
  for (let i = 0; i <= 44; i++) a.push([ox - 150 + i * 7, oy]);
  const A = BE.addBranch(sc, a, st, null, kindA || undefined);
  const b = [], r = (angleB * Math.PI) / 180;
  for (let i = -22; i <= 22; i++) b.push([ox + Math.cos(r) * i * 7, oy + Math.sin(r) * i * 7]);
  const B = BE.addBranch(sc, b, st, null, kindB || undefined);
  return { A, B };
}

function pose(branche, t, id, taille) {
  const s = Object.assign({}, st, { sowSize: (taille || 26) * MM });
  return BE.addStampAuto(sc, id, { branchId: branche.id, t }, s);
}

const feuille = BE.bank.find((m) => m.famille === "feuille" && m.etat === "organique");
const champ = BE.bank.find((m) => m.famille === "champignon" && m.etat === "organique");
const puce = BE.bank.find((m) => m.forme && m.forme.startsWith("puce qfp") && m.etat === "electronique");
const perso = BE.bank.find((m) => m.famille === "personnage" && m.nom.includes("debout"));

const grille = [
  ["branche × branche", (o) => paire(o[0], o[1], null, null, 62)],
  ["branche × liane", (o) => paire(o[0], o[1], null, "liane", 70)],
  ["branche × piste", (o) => paire(o[0], o[1], null, "piste", 55)],
  ["piste × piste", (o) => paire(o[0], o[1], "piste", "piste", 62)],
  ["liane × liane", (o) => paire(o[0], o[1], "liane", "liane", 58)],
  ["liane × piste", (o) => paire(o[0], o[1], "liane", "piste", 62)],
  ["motif × branche", (o) => { const p = paire(o[0], o[1], null, null, 90); pose(p.B, 0.5, feuille.id, 30); }],
  ["motif × motif", (o) => { const p = paire(o[0], o[1], null, null, 90);
                             pose(p.A, 0.46, feuille.id, 30); pose(p.A, 0.54, champ.id, 30); }],
  ["personnage × branche", (o) => { const p = paire(o[0], o[1], null, null, 78); pose(p.A, 0.5, perso.id, 40); }],
  ["puce × branche", (o) => { const p = paire(o[0], o[1], null, "piste", 70); pose(p.B, 0.5, puce.id, 30); }],
  ["motif × liane", (o) => { const p = paire(o[0], o[1], "liane", null, 84); pose(p.B, 0.5, feuille.id, 30); }],
  ["motif × piste", (o) => { const p = paire(o[0], o[1], "piste", null, 84); pose(p.B, 0.5, champ.id, 30); }],
];

grille.forEach(([nom, faire], i) => {
  const ox = 210 + (i % COL) * LARG, oy = 160 + Math.floor(i / COL) * HAUT;
  faire([ox, oy]);
  cas.push(nom);
});

const trees = BE.buildGeometry(sc, st);
require("fs").writeFileSync("branch-proto.json", JSON.stringify({
  W: COL * LARG + 40, H: Math.ceil(grille.length / COL) * HAUT + 60, ink: st.ink,
  trees: trees.map((t) => ({ silhouette: t.silhouette, outline: t.outline, lines: t.lines })) }));

/* Mesure du croisement. On ne compte PAS les traits qui tombent sous une silhouette
   postérieure : c'est justement l'occultation qui fonctionne, ils seront effacés au rendu.
   Ce qu'on vérifie, c'est que la MARGE D'INTERRUPTION existe — sans elle, deux lianes de
   3,3 mm qui se croisent n'effacent qu'une largeur de ruban et fusionnent en X illisible.
   On mesure donc, pour chaque arbre, de combien sa silhouette d'occultation déborde de son
   propre dessin. */
const dedans = (p, poly) => {
  let f = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) &&
        p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) f = !f;
  }
  return f;
};
const aire = (p) => {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  return Math.abs(a / 2);
};
let sansMarge = 0, avecMarge = 0, pousses = 0;
for (const t of trees) {
  if (!t.silhouette.length) continue;
  if (t.pousse) { pousses++; continue; }        // un motif qui pousse doit toucher son support
  // la silhouette doit être plus grande que l'encre visible du même arbre
  const sil = t.silhouette.reduce((a, p) => a + aire(p), 0);
  const dessin = (t.outline.length ? t.outline : t.silhouette).reduce((a, p) => a + aire(p), 0);
  if (t.outline.length && sil <= dessin * 1.01) sansMarge++; else avecMarge++;
}
console.log(`${grille.length} croisements · ${cas.join(" · ")}`);
console.log(`marge d'interruption : ${avecMarge} arbre(s) en ont une, ${sansMarge} n'en ont pas · ` +
  `${pousses} motif(s) collés à leur support (voulu)`);
if (sansMarge) {
  console.log("ÉCHEC : sans marge, un croisement se lit comme une fusion");
  process.exitCode = 1;
}
