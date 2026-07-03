// Test headless du cœur logique (flux SVG) : parse SVG -> zones -> motifFill -> occlusion (décor D-005) -> export SVG.
const fs = require("fs");
const path = require("path");

global.window = {};
global.ClipperLib = require("../vendor/clipper.js");
require("../src/geometry.js");
require("../src/svg.js");
const ML = global.window.ML;

const PX_PER_MM = 4;
const root = path.join(__dirname, "..");

function fail(msg) { throw new Error("ÉCHEC validation : " + msg); }
const transformed = ML.parseSVG('<svg><g transform="translate(10 20) scale(2)"><path transform="translate(1 2)" d="M0 0L1 0Z"/></g></svg>');
const transformedPts = transformed.subpaths[0].pts;
if (transformedPts[0][0] !== 12 || transformedPts[0][1] !== 24 || transformedPts[1][0] !== 14)
  fail("les transformations SVG imbriquées ne sont pas appliquées dans le bon ordre");

const SAMPLES = [
  { name: "noiraude", file: "exemple motif/Personnages/noiraudes.svg" },
  { name: "link", file: "exemple motif/Personnages/link.svg" },
  { name: "majora", file: "exemple motif/Symboles/majora mask.svg" },
];

function buildMotif(name, file) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  const parsed = ML.parseSVG(text);
  const zones = ML.buildZones(parsed.paths);
  const silhouette = ML.motifSilhouette(zones);
  return { name, zones, silhouette };
}

console.log("Motifs (parse SVG -> zones -> motifFill) :");
const motifs = SAMPLES.map((s) => buildMotif(s.name, s.file));
for (const m of motifs) {
  const fillGroups = ML.motifFill(m.zones);
  const nContours = Object.values(fillGroups).reduce((a, c) => a + c.length, 0);
  console.log(`  ${m.name.padEnd(10)} zones=${m.zones.length}  couleurs=${Object.keys(fillGroups).length}  contours=${nContours}`);
}

function translatePts(pts, dx, dy) { return pts.map(([x, y]) => [x + dx, y + dy]); }
// silhouette = liste de contours (multi-pièces, T1) -> traduit chaque pièce séparément.
function translateContours(contours, dx, dy) { return contours.map((c) => translatePts(c, dx, dy)); }
function translateGroups(fillGroups, dx, dy) {
  return Object.keys(fillGroups).map((color) => ({
    color,
    paths: fillGroups[color].map((r) => ({ pts: translatePts(r.pts, dx, dy), closed: true })),
  }));
}
// centre un motif (silhouette + fillGroups) sur `target`, via le centre de son bbox (toutes pièces
// confondues) — sert à garantir un chevauchement franc entre décor/perso dans le cas Lot 2
// (indépendant des coordonnées brutes du SVG).
function centroid(contours) {
  const pts = contours.flat();
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}
function centerAt(silhouette, fillGroups, target) {
  const c = centroid(silhouette);
  const dx = target[0] - c[0], dy = target[1] - c[1];
  const groups = translateGroups(fillGroups, dx, dy);
  return { silhouette: translateContours(silhouette, dx, dy), groups, fillPolys: groups.flatMap((g) => g.paths.map((p) => p.pts)) };
}

// ─── Lot 1 : grille serrée -> chevauchement, occlusion "autocollant" (motifs ordinaires, sans décor) ───
// instance hors-décor : occluder = silhouette (déjà une liste de pièces, T1) ; decorClear = silhouette
// (marge nulle, inutilisé ici).
function plainInstance(silhouette, groups) {
  return { role: "PERSONNAGE", groups, occluder: silhouette, decorClear: silhouette };
}
const lot1Insts = motifs.map((m, i) => {
  const dx = (i % 3) * 80, dy = Math.floor(i / 3) * 80; // pas < taille des motifs -> chevauchement
  const silhouette = translateContours(m.silhouette, dx, dy);
  const groups = translateGroups(ML.motifFill(m.zones), dx, dy);
  return plainInstance(silhouette, groups);
});

const countPts = (list) => list.reduce((s, inst) => s + inst.groups.reduce((a, g) => a + g.paths.reduce((b, p) => b + p.pts.length, 0), 0), 0);
const pointsBefore = countPts(lot1Insts);
const lot1Visible = ML.occludeSurfaces(lot1Insts, null, []);
const pointsAfter = Object.values(lot1Visible).reduce((s, paths) => s + paths.reduce((a, p) => a + p.pts.length, 0), 0);

console.log(`\nOcclusion Lot 1 (sans décor) : ${lot1Insts.length} instances`);
console.log(`  points avant=${pointsBefore}  après=${pointsAfter}  (réduction si chevauchement géré)`);
if (!(pointsAfter < pointsBefore)) fail("l'occlusion Lot 1 ne réduit pas la géométrie malgré le chevauchement attendu");

// ─── Lot 2 : décor (D-005) — 1 décor + 1 perso posé au-dessus (margin>0, halo) + 1 perso caché en dessous ───
// décor = noiraude (1 silhouette + 2 vides "yeux" nets, idéal pour prouver l'effet des vides) ;
// les 3 instances sont centrées au même point pour garantir un chevauchement franc (indépendant
// des coordonnées brutes de chaque SVG, qui ne se recouvrent pas forcément par défaut).
const decorColor = "#1565c0";
const decorSrc = motifs[0]; // noiraude
const persoAbove = motifs[1]; // link — posé sur le décor (margin>0 -> halo)
const persoBelow = motifs[2]; // majora — caché derrière le décor (doit profiter des vides)
const marginPx = 6; // marge de dégagement dans les unités SVG transformées (pas de conversion mm ici)
const target = [6000, 0]; // zone dédiée, loin de la grille Lot 1

// surface REMPLI du décor fusionnée sous sa couleur focale (imite ML.motifFill + fusion d'`exportFill`)
const decorFillNative = ML.motifFill(decorSrc.zones);
const decorFillMerged = [];
for (const c in decorFillNative) decorFillMerged.push(...decorFillNative[c]);
const decorC = centerAt(decorSrc.silhouette, { [decorColor]: decorFillMerged }, target);
// occluder du décor = sa surface réelle (avec ses vides), PAS sa silhouette (cf. D-005 — sinon plus rien dessous ne serait visible)
const decorInst = { role: "DECOR", groups: decorC.groups, occluder: decorC.fillPolys, decorClear: decorC.silhouette };

const aboveC = centerAt(persoAbove.silhouette, ML.motifFill(persoAbove.zones), target);
const aboveInst = { role: "PERSONNAGE", groups: aboveC.groups, occluder: aboveC.silhouette, decorClear: aboveC.silhouette.flatMap((p) => ML.offsetPolygon(p, marginPx)) };

const belowC = centerAt(persoBelow.silhouette, ML.motifFill(persoBelow.zones), target);
const belowInst = { role: "PERSONNAGE", groups: belowC.groups, occluder: belowC.silhouette, decorClear: belowC.silhouette };

// ordre bas -> haut : perso caché, décor, perso posé
const decorInsts = [belowInst, decorInst, aboveInst];
const decorVisible = ML.occludeSurfaces(decorInsts, null, []);

const decorAreaBefore = decorC.fillPolys.reduce((a, p) => a + ML.signedArea(p), 0);
const decorAreaAfter = (decorVisible[decorColor] || []).reduce((a, p) => a + ML.signedArea(p.pts), 0);
console.log(`\nOcclusion Lot 2 (décor D-005) : surface décor avant=${decorAreaBefore.toFixed(0)}  après=${decorAreaAfter.toFixed(0)}`);
if (!(decorAreaAfter < decorAreaBefore)) fail("la surface du décor n'est pas réduite par le perso posé au-dessus (margin>0)");

// preuve du HALO : la marge doit creuser PLUS que la silhouette seule du perso du dessus
const decorVisibleNoMargin = ML.occludeSurfaces([belowInst, decorInst, { ...aboveInst, decorClear: aboveC.silhouette }], null, []);
const decorAreaNoMargin = (decorVisibleNoMargin[decorColor] || []).reduce((a, p) => a + ML.signedArea(p.pts), 0);
console.log(`  surface décor si marge=0 (silhouette seule du perso du dessus) = ${decorAreaNoMargin.toFixed(0)} (doit être > avec halo)`);
if (!(decorAreaNoMargin > decorAreaAfter)) fail("la marge (halo) ne creuse pas davantage le décor que la silhouette seule du perso du dessus");

// preuve du "caché derrière" : le perso du dessous doit rester PARTIELLEMENT visible (vides du décor),
// contrairement à un décor occultant opaque (silhouette, modèle "sticker" explicitement rejeté en D-005)
const belowOnlyReal = ML.occludeSurfaces([belowInst, decorInst], null, []);
const belowOnlySticker = ML.occludeSurfaces([belowInst, { ...decorInst, occluder: decorC.silhouette }], null, []);
const belowAreaReal = (belowOnlyReal["#000000"] || []).reduce((a, p) => a + ML.signedArea(p.pts), 0);
const belowAreaSticker = (belowOnlySticker["#000000"] || []).reduce((a, p) => a + ML.signedArea(p.pts), 0);
console.log(`  surface perso caché visible : occluder=surface réelle (vides) -> ${belowAreaReal.toFixed(0)}  vs  occluder=silhouette (sticker) -> ${belowAreaSticker.toFixed(0)}`);
if (!(belowAreaReal > belowAreaSticker)) fail("le perso caché ne profite pas des vides du décor (occlusion par surface réelle vs silhouette opaque)");

// ─── T12 (D-010 volet 2) : union/différence localisées par îlots (groupIslands + *Local) ───
// comparaison systématique au résultat des fonctions PLEINES (oracle), cf. plans/P7/T12.md §3a-e.
function sq(x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }
function netArea(contours) { return contours.reduce((s, c) => s + ML.signedArea(c.pts), 0); }
function contoursEqual(a, b, eps) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].pts.length !== b[i].pts.length) return false;
    for (let j = 0; j < a[i].pts.length; j++) {
      if (Math.abs(a[i].pts[j][0] - b[i].pts[j][0]) > eps || Math.abs(a[i].pts[j][1] - b[i].pts[j][1]) > eps) return false;
    }
  }
  return true;
}

console.log("\nT12 (D-010) — union/différence localisées par îlots :");

// îlot 1 : carré 0..100 avec un trou 30..70 (passe Clipper réelle -> orientation garantie) ;
// îlot 2 : carré 200..300, disjoint, sans trou.
const island1 = ML.surfaceDifference(ML.surfaceUnion([], [{ pts: sq(0, 0, 100, 100), closed: true }]), [{ pts: sq(30, 30, 70, 70), closed: true }]);
const island1Hole = island1.reduce((a, c) => (ML.absArea(c.pts) < ML.absArea(a.pts) ? c : a));
const island2 = ML.surfaceUnion([], [{ pts: sq(200, 0, 300, 100), closed: true }]);
const t12Surface = island1.concat(island2);

// a. trait sur l'îlot 1 (bbox x:-20..10, hors bbox de l'îlot 2) -> aire nette = oracle, îlot 2 inchangé
const addA = [{ pts: sq(-20, 40, 10, 60), closed: true }];
const oracleA = ML.surfaceUnion(t12Surface, addA);
const localA = ML.surfaceUnionLocal(t12Surface, addA);
console.log(`  a. aire nette : local=${netArea(localA).toFixed(3)}  oracle=${netArea(oracleA).toFixed(3)}`);
if (Math.abs(netArea(localA) - netArea(oracleA)) > 0.1) fail("T12a : aire nette du résultat local ≠ oracle (trait sur l'îlot 1)");
const island2InLocalA = localA.filter((c) => c.pts.every(([x]) => x >= 150));
if (!contoursEqual(island2InLocalA, island2, 1e-9)) fail("T12a : les contours de l'îlot 2 (non participant) ne sont pas strictement inchangés");

// b. gomme traversant l'îlot 1 sans toucher son trou (bande x:80..90) -> le trou survit
const cutB = [{ pts: sq(80, -10, 90, 110), closed: true }];
const oracleB = ML.surfaceDifference(t12Surface, cutB);
const localB = ML.surfaceDifferenceLocal(t12Surface, cutB);
console.log(`  b. contours : local=${localB.length}  oracle=${oracleB.length} (le trou doit survivre)`);
if (localB.length !== oracleB.length) fail("T12b : nombre de contours du résultat local ≠ oracle");
if (Math.abs(netArea(localB) - netArea(oracleB)) > 0.1) fail("T12b : aire nette du résultat local ≠ oracle (gomme sans toucher le trou)");
const near1B = ML.groupIslands(localB).find((g) => g.bbox.minX < 150);
if (!near1B || near1B.contours.length < 2) fail("T12b : le trou de l'îlot 1 a disparu (îlot réduit à un seul contour)");
const holeInB = near1B.contours.reduce((a, c) => (ML.absArea(c.pts) < ML.absArea(a.pts) ? c : a));
if (Math.abs(ML.absArea(holeInB.pts) - ML.absArea(island1Hole.pts)) > 0.1 || !ML.pointInPoly([50, 50], holeInB.pts))
  fail("T12b : le trou de l'îlot 1 n'a pas survécu intact");

// c. gomme coupant l'îlot 2 en deux (bande x:240..260) -> même aire nette que l'oracle
const cutC = [{ pts: sq(240, -10, 260, 110), closed: true }];
const oracleC = ML.surfaceDifference(t12Surface, cutC);
const localC = ML.surfaceDifferenceLocal(t12Surface, cutC);
console.log(`  c. aire nette : local=${netArea(localC).toFixed(3)}  oracle=${netArea(oracleC).toFixed(3)}`);
if (Math.abs(netArea(localC) - netArea(oracleC)) > 0.1) fail("T12c : aire nette du résultat local ≠ oracle (gomme coupant un îlot en deux)");

// d. trait à cheval sur les deux îlots (bbox x:90..210) -> tous participants, résultat = oracle
const addD = [{ pts: sq(90, 40, 210, 60), closed: true }];
const oracleD = ML.surfaceUnion(t12Surface, addD);
const localD = ML.surfaceUnionLocal(t12Surface, addD);
console.log(`  d. contours : local=${localD.length}  oracle=${oracleD.length}  aire nette local=${netArea(localD).toFixed(3)}  oracle=${netArea(oracleD).toFixed(3)}`);
if (!contoursEqual(localD, oracleD, 1e-6)) fail("T12d : trait à cheval sur les deux îlots -> résultat local ≠ oracle");

// e. cas limites : surface vide + trait -> délègue (= trait) ; argument vide -> surface inchangée
const emptyPlusTrait = ML.surfaceUnionLocal([], addA);
if (!contoursEqual(emptyPlusTrait, ML.surfaceUnion([], addA), 1e-9)) fail("T12e : surface vide + trait -> doit déléguer à la fonction pleine");
if (!contoursEqual(ML.surfaceUnionLocal(t12Surface, []), t12Surface, 1e-9)) fail("T12e : argument vide (union) -> la surface doit rester inchangée");
if (!contoursEqual(ML.surfaceDifferenceLocal(t12Surface, []), t12Surface, 1e-9)) fail("T12e : argument vide (différence) -> la surface doit rester inchangée");
console.log("  e. cas limites OK (surface vide déléguée à l'oracle, argument vide -> surface inchangée)");

// ─── P8 T1 : computeTiling (tuilage A4, orientation min, recouvrement) ───────
{
  const t1 = ML.computeTiling({ x: 0, y: 0, w: 100, h: 100 });
  if (t1.landscape !== false || t1.cols !== 1 || t1.rows !== 1) fail("T1a : bbox 100×100 doit tenir en 1×1 portrait");
  const expX = 0 - (190 - 100) / 2;
  if (Math.abs(t1.pages[0].x - expX) > 1e-9) fail("T1a : page unique doit être centrée sur le bbox");

  const t1b = ML.computeTiling({ x: 0, y: 0, w: 500, h: 380 });
  if (t1b.landscape !== false || t1b.cols !== 3 || t1b.rows !== 2) fail("T1b : bbox 500×380 -> égalité 6 pages -> portrait 3×2 attendu");

  const t1c = ML.computeTiling({ x: 0, y: 0, w: 400, h: 260 });
  if (t1c.landscape !== false || t1c.cols !== 3 || t1c.rows !== 1) fail("T1c : bbox 400×260 -> portrait 3×1 (3) doit battre paysage 2×2 (4)");

  const first = t1b.pages[0], last = t1b.pages[t1b.pages.length - 1];
  if (first.label !== "L1·C1") fail("T1d : première page doit être L1·C1");
  if (last.label !== `L${t1b.rows}·C${t1b.cols}`) fail("T1d : dernière page doit être L{rows}·C{cols}");

  const neighborX = t1b.pages.find((p) => p.row === 0 && p.col === 1);
  if (Math.abs(first.x + t1b.uw - neighborX.x - t1b.overlap) > 1e-9) fail("T1e : recouvrement en X entre pages voisines incorrect");

  console.log("computeTiling OK (100×100 -> 1×1, 500×380 -> 3×2 portrait, 400×260 -> 3×1, labels + recouvrement)");
}

// ─── export SVG final (mm, evenodd, multi-couleur — Lot 1 + décor) ───────────
const merged = {};
for (const color in lot1Visible) (merged[color] = merged[color] || []).push(...lot1Visible[color]);
for (const color in decorVisible) (merged[color] = merged[color] || []).push(...decorVisible[color]);

const flat = [];
for (const color in merged) for (const p of merged[color]) flat.push({ pts: p.pts, closed: true, color });
const mm = ML.pxPathsToMm(flat, PX_PER_MM);
const groupsMm = {};
mm.forEach((p, i) => { (groupsMm[flat[i].color] = groupsMm[flat[i].color] || []).push({ pts: p.pts, closed: true }); });
const allPts = mm.flatMap((p) => p.pts);
const w = Math.max(...allPts.map((p) => p[0])), h = Math.max(...allPts.map((p) => p[1]));
const svg = ML.writeSVG(groupsMm, { w, h });

const outPath = path.join(__dirname, "out_occluded.svg");
fs.writeFileSync(outPath, svg);
console.log(`\nSVG écrit: ${outPath} (${svg.length} octets)`);
console.log("  en-tête viewBox:", /viewBox="0 0 [\d.]+ [\d.]+"/.test(svg) ? "présent" : "MANQUANT");
console.log("  couleurs (<path>):", (svg.match(/<path/g) || []).length);
const colors = Object.keys(groupsMm);
console.log("  couleurs distinctes:", colors.length, colors);
if (colors.length < 2) fail("l'export ne contient pas la couleur du décor en plus des couleurs existantes");

console.log("\nOK — toutes les validations sont passées.");
