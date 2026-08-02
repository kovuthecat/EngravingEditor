/* Contrôle headless de BE.toContours (src/branch-engine.js) : aplatissement des arbres
   (silhouette/outline/lines, triés z-order) en la liste de contours d'encre que travaille
   l'éditeur, avec occlusion CUITE (la silhouette de ce qui est devant efface l'encre de ce qui
   est dessous, l'ordre z n'existant plus une fois aplati). Modèle : test/banc-poses.js (mêmes
   require, même style). */
global.window = {};
global.ClipperLib = require("../vendor/clipper.js");
require("../src/motif-bank.js");
require("../src/branch-engine.js");
const BE = global.window.BE, MM = 1 / 0.288;
BE.setBank(global.window.MOTIF_BANK);

function fail(msg) { throw new Error("ÉCHEC : " + msg); }

const st = { rootWidth: 46, taper: 1.15, tipFrac: 0.12, childRatio: 0.66, childRatioSide: 0.30,
  filletRatio: 0.7, emergeLead: 0.5, swellAmp: 0.1, junctionSwell: 0.35, wobbleAmp: 0.02,
  wobbleLen: 3.2, smoothPx: 2.5 * MM, tipLen: 8 * MM, barkPitch: 14, ink: 1 * MM,
  inkFine: 0.6 * MM, minRibbon: 3 * MM, snap: 26, tailTwig: false, knotDensity: 1,
  knotStep: 26 * MM, pcbWidth: 3.5 * MM, pcbTol: 18, pcbVias: true, pcbPad: true,
  lianeWidth: 3.3 * MM, lianeNodes: 0, lianeNodeStep: 12, lianeCollar: 0.55, lianeLeaf: 6,
  lianeEtat: "organique", sowSize: 26 * MM, sowStep: 46 * MM, sowAngle: (55 * Math.PI) / 180,
  autoLod: true, coilTurns: 1 };

// aire signée (Shoelace), cumulée sur tout un jeu de contours : un trou (nonzero, sorti de
// Clipper avec une orientation opposée à son contour porteur) se soustrait de lui-même dans la
// somme -- pas besoin de le détecter, juste de ne pas prendre la valeur absolue AVANT de sommer.
function ringArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}
function area(contours) {
  return Math.abs(contours.reduce((s, c) => s + ringArea(c.pts || c), 0));
}
function allFinite(contours) {
  return contours.every((c) => (c.pts || c).every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])));
}

// ── 1+2. une branche seule : contours rendus, coordonnées finies, encre = un liseré ──────────
{
  const sc = BE.createScene();
  const pts = [];
  for (let i = 0; i <= 80; i++) pts.push([100 + i * 12, 300 + Math.sin(i / 15) * 40]);
  BE.addBranch(sc, pts, st, null);
  const trees = BE.buildGeometry(sc, st);
  const contours = BE.toContours(trees, st);

  if (!contours.length) fail("une branche seule ne rend aucun contour");
  if (!contours.every((c) => c.closed === true)) fail("un contour rendu n'est pas marqué fermé");
  if (!allFinite(contours)) fail("coordonnée non finie (NaN/Infinity) dans les contours rendus");

  const aireEncre = area(contours);
  const aireSilhouette = area(trees.flatMap((t) => t.silhouette));
  if (!(aireEncre > 0)) fail(`aire d'encre non strictement positive (${aireEncre})`);
  if (!(aireEncre < aireSilhouette))
    fail(`encre (${aireEncre.toFixed(0)} px²) pas < silhouette (${aireSilhouette.toFixed(0)} px²) : ` +
         "ce devrait être un liseré, pas un aplat plein");
  console.log(`1+2. branche seule : ${contours.length} contour(s), encre ${aireEncre.toFixed(0)} px²` +
              ` < silhouette ${aireSilhouette.toFixed(0)} px² — OK`);
}

// ── 3. occlusion cuite : branche + motif qui la chevauche -> moins d'encre que la somme ───────
{
  const sc = BE.createScene();
  const pts = [];
  for (let i = 0; i <= 60; i++) pts.push([100 + i * 12, 600]);
  const b = BE.addBranch(sc, pts, st, null);
  /* Pose "enligne" (centre=true) : le motif s'installe SUR L'AXE, à cheval sur toute la largeur
     du ruban -- un vrai chevauchement franc, pas un simple frôlement de pied comme le donnerait
     une pose latérale (qui pousse en surface, vers l'extérieur). */
  const s = BE.addStamp(sc, "resistance-axiale-hybride", { branchId: b.id, t: 0.5 },
    { side: 1, sizePx: st.rootWidth * 1.4, angle: 0 });
  if (!s) fail("le motif de test ne s'est pas posé (banque de motifs absente, ou id introuvable)");

  const trees = BE.buildGeometry(sc, st);
  const treeBranche = trees.filter((t) => t.rootId === b.id);
  const treeMotif = trees.filter((t) => t.rootId === s.id);
  if (!treeBranche.length) fail("aucun arbre pour la branche");
  if (!treeMotif.length) fail("aucun arbre pour le motif posé (écarté par l'arbitrage d'encombrement ?)");

  // "pris séparément" = chaque arbre aplati SEUL (aucune occlusion croisée : la différence contre
  // le propre accumulateur, vide au départ, ne retire rien -- cf. commentaire de BE.toContours).
  const aireSeule = area(BE.toContours(treeBranche, st));
  const aireMotifSeul = area(BE.toContours(treeMotif, st));
  const aireCombinee = area(BE.toContours(trees, st));

  if (!(aireCombinee < aireSeule + aireMotifSeul))
    fail(`occlusion non cuite : combinée ${aireCombinee.toFixed(0)} px² >= séparées ` +
         `${(aireSeule + aireMotifSeul).toFixed(0)} px² (branche ${aireSeule.toFixed(0)} + motif ${aireMotifSeul.toFixed(0)})`);
  console.log(`3. occlusion cuite : combinée ${aireCombinee.toFixed(0)} px² < ` +
              `branche seule ${aireSeule.toFixed(0)} + motif seul ${aireMotifSeul.toFixed(0)} px² — OK`);
}

// ── 4. déterminisme : deux appels sur la même scène rendent EXACTEMENT le même résultat ───────
{
  const sc = BE.createScene();
  const pts = [];
  for (let i = 0; i <= 50; i++) pts.push([80 + i * 10, 900 + Math.cos(i / 10) * 30]);
  BE.addBranch(sc, pts, st, null);
  const trees = BE.buildGeometry(sc, st);
  const a = JSON.stringify(BE.toContours(trees, st));
  const b = JSON.stringify(BE.toContours(trees, st));
  if (a !== b) fail("deux appels successifs sur la même scène ne rendent pas le même résultat");
  console.log("4. déterminisme : deux appels identiques — OK");
}

console.log("\nOK — toutes les validations sont passées.");
