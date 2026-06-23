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
