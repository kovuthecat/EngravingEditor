/* build-personnages-svg.js — les personnages de la banque -> SVG pleins pour la bibliothèque.
 *
 *   node tools/build-personnages-svg.js
 *
 * La banque stocke les motifs en AXES (lignes médianes) : l'épaisseur du trait est un réglage
 * de l'outil, pas une donnée du motif — c'est ce qui permet de poser le même dessin à toutes
 * les tailles sans qu'il s'empâte. La bibliothèque de l'app, elle, travaille sur des formes
 * PLEINES (sortie potrace). On épaissit donc les axes à 1 mm, l'encre réelle du pyrograveur,
 * pour la taille de pose de chaque personnage.
 *
 * Cette taille de pose n'est pas arbitraire : c'est la taille minimale mesurée à laquelle le
 * motif reste lisible (tools/build-motif-bank.py), avec un quart de marge. Déposé dans l'app,
 * un personnage arrive donc déjà à une échelle pyrogravable.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
global.window = {};
global.ClipperLib = require(path.join(root, "vendor/clipper.js"));
require(path.join(root, "src/motif-bank.js"));
require(path.join(root, "src/branch-engine.js"));
const BE = global.window.BE;
BE.setBank(global.window.MOTIF_BANK);

const MM_PAR_PX = BE.MM_PER_PX;         // échelle de la table, mesurée sur la trame
const ENCRE_MM = 1.0;                   // plancher de traçabilité à la main
const S = 1000;                         // Clipper travaille en entiers

const sortie = path.join(root, "exemple motif/Personnages");
fs.mkdirSync(sortie, { recursive: true });

function epaissir(paths, demiEpaisseur) {
  /* Tolérance d'arc généreuse : les arrondis de bout de trait n'ont pas besoin d'être lisses
     au centième — ils font 0,5 mm de rayon sur la table. Sans ce réglage, chaque bout de trait
     coûtait des dizaines de points et la bibliothèque pesait 1,75 Mo pour vingt personnages. */
  const co = new ClipperLib.ClipperOffset();
  co.ArcTolerance = Math.max(1, demiEpaisseur * 0.12) * S;
  for (const p of paths) {
    if (p.length < 2) continue;
    co.AddPath(p.map((q) => ({ X: Math.round(q[0] * S), Y: Math.round(q[1] * S) })),
      ClipperLib.JoinType.jtRound, ClipperLib.EndType.etOpenRound);
  }
  const sol = new ClipperLib.Paths();
  co.Execute(sol, demiEpaisseur * S);
  // fusion : sans elle, les recouvrements de traits creusent des trous en evenodd
  const c = new ClipperLib.Clipper();
  c.AddPaths(sol, ClipperLib.PolyType.ptSubject, true);
  const out = new ClipperLib.Paths();
  c.Execute(ClipperLib.ClipType.ctUnion, out,
    ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  // et on retire les points qui ne disent rien : à 0,05 mm près, personne ne verra la différence
  ClipperLib.Clipper.CleanPolygons(out, 0.05 / MM_PAR_PX * S);
  return out.filter((p) => p.length >= 3).map((p) => p.map((q) => [q.X / S, q.Y / S]));
}

const st = { ink: ENCRE_MM / MM_PAR_PX, inkFine: 0.6 / MM_PAR_PX };
let n = 0;
for (const m of BE.bank.filter((x) => x.famille === "personnage")) {
  // taille de pose : le seuil de lisibilité mesuré, plus un quart de marge
  const miniMm = BE.minStampSize(m, st) * MM_PAR_PX;
  const poseMm = Math.max(24, Math.round(miniMm * 1.25));
  // 1 mm d'encre RAMENÉ dans le repère du motif, pour cette taille de pose
  const encreVb = (m.h * ENCRE_MM) / poseMm;

  const polys = epaissir(m.paths, encreVb / 2);
  if (!polys.length) { console.log("  ignoré (rien à épaissir) :", m.nom); continue; }

  const d = polys.map((p) =>
    "M" + p.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join("L") + "Z").join("");
  const largeurMm = (poseMm * m.w) / m.h;
  const svg =
    `<?xml version="1.0" standalone="no"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.0" ` +
    `width="${largeurMm.toFixed(3)}mm" height="${poseMm.toFixed(3)}mm" ` +
    `viewBox="0 0 ${m.w.toFixed(2)} ${m.h.toFixed(2)}" preserveAspectRatio="xMidYMid meet">\n` +
    `<!-- Généré par tools/build-personnages-svg.js depuis les axes de ${m.nom}.\n` +
    `     Trait épaissi à ${ENCRE_MM} mm pour une pose de ${poseMm} mm ` +
    `(seuil de lisibilité mesuré : ${miniMm.toFixed(0)} mm). -->\n` +
    `<g fill="#000000" fill-rule="evenodd" stroke="none">\n<path d="${d}"/>\n</g>\n</svg>\n`;
  fs.writeFileSync(path.join(sortie, m.nom + ".svg"), svg, "utf8");
  console.log(`  ${m.nom.padEnd(30)} pose ${String(poseMm).padStart(3)} mm · ` +
    `lisible dès ${miniMm.toFixed(0)} mm · ${polys.length} contour(s)`);
  n++;
}
console.log(`${n} personnages -> ${path.relative(root, sortie)}`);
