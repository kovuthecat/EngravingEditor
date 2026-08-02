/* BANC DES COMPOSANTS — node test/banc-composants.js && python test/branch-proto-render.py

   Chaque pièce électronique est posée DANS SON CONTEXTE, une par case, avec le support qui
   lui convient, puis rendue pour être jugée à l'œil. Le banc précédent ne vérifiait qu'une
   pièce par manière de poser : il ne pouvait pas voir qu'une pièce donnée se raccorde mal.

   Trois contextes, parce que les pièces ne s'emploient pas de la même façon :
     · en ligne  — la piste arrive sur une patte et repart de l'autre (résistance, bobine…)
     · en nœud   — plusieurs pistes aboutissent dessus (puces)
     · monté     — planté sur une structure, la piste passe dessous (tube, condensateur disque)   */
global.window = {};
global.ClipperLib = require("../vendor/clipper.js");
require("../src/motif-bank.js");
require("../src/branch-engine.js");
const BE = global.window.BE, MM = 1 / 0.288;
BE.setBank(global.window.MOTIF_BANK);

const st = { rootWidth: 30, taper: 1.15, tipFrac: 0.12, childRatio: 0.66, childRatioSide: 0.30,
  filletRatio: 0.7, emergeLead: 0.5, swellAmp: 0.1, junctionSwell: 0.35, wobbleAmp: 0.02,
  wobbleLen: 3.2, smoothPx: 2.5 * MM, tipLen: 8 * MM, barkPitch: 14, ink: 1 * MM,
  inkFine: 0.6 * MM, minRibbon: 3 * MM, snap: 26, tailTwig: false, knotDensity: 1,
  knotStep: 26 * MM, pcbWidth: 3.5 * MM, pcbTol: 18, pcbVias: true, pcbPad: true,
  lianeWidth: 3.3 * MM, lianeNodes: 0, lianeNodeStep: 12, lianeCollar: 0.55, lianeLeaf: 6,
  lianeEtat: "organique", sowSize: 26 * MM, sowStep: 46 * MM, sowAngle: (55 * Math.PI) / 180,
  autoLod: true, coilTurns: 1 };

const pieces = BE.bank.filter((m) => m.famille === "composant")
  .sort((a, b) => (a.forme + a.etat).localeCompare(b.forme + b.etat));

const COL = 4, LARG = 340, HAUT = 250;
const sc = BE.createScene();
const bilan = [];

pieces.forEach((m, i) => {
  const ox = 40 + (i % COL) * LARG, oy = 90 + Math.floor(i / COL) * HAUT;
  const pose = m.pose;

  // support horizontal, assez long pour que la pièce tienne au milieu avec de la marge
  const sup = [];
  for (let k = 0; k <= 30; k++) sup.push([ox, oy]);
  for (let k = 0; k <= 30; k++) sup[k] = [ox + k * 8, oy];
  const l = BE.addBranch(sc, sup, st, null, "piste");
  const s = BE.addStampAuto(sc, m.id, { branchId: l.id, t: 0.5 }, st);
  if (!s) { bilan.push({ m, err: "non posé" }); return; }

  /* Un nœud, ce sont PLUSIEURS pistes qui aboutissent dessus : on en branche deux de plus,
     par le dessus et par le dessous, pour voir si les broches se raccordent vraiment. */
  if (pose === "noeud") {
    BE.buildGeometry(sc, st);
    for (const b of BE.stampPorts(sc, s, st).filter((p) => !p.prise).slice(0, 2)) {
      const pts = [];
      for (let k = 0; k <= 16; k++)
        pts.push([b.p[0] + b.dir[0] * (6 + k * 5), b.p[1] + b.dir[1] * (6 + k * 5)]);
      const r = BE.anchorStroke(sc, pts, st);
      BE.addBranch(sc, r.pts, st, r.anchor, "piste");
    }
  }
  bilan.push({ m, s });
});

const trees = BE.buildGeometry(sc, st);
require("fs").writeFileSync("branch-proto.json", JSON.stringify({
  W: 40 + COL * LARG, H: 120 + Math.ceil(pieces.length / COL) * HAUT, ink: st.ink,
  trees: trees.map((t) => ({ silhouette: t.silhouette, outline: t.outline, lines: t.lines })) }));

/* Mesures objectives, pour ne pas dépendre que de l'œil :
   · la pièce déborde-t-elle de son support ?
   · une pièce EN LIGNE doit être traversée : du support de chaque côté d'elle.
   · une pièce MONTÉE doit être hors du support, pas dedans.                            */
const large = Math.max(...pieces.map((m) => m.nom.length));
let ko = 0;
for (const b of bilan) {
  if (b.err) { ko++; console.log(`→ ${b.m.nom.padEnd(large)}  ${b.err}`); continue; }
  const g = BE.stampFootprint(sc, b.s, st, b.s._side);
  const sup = sc.branches.find((x) => x.id === b.s.branchId);
  const P = sup.axis[Math.round(b.s.t * (sup.axis.length - 1))];
  const ecart = Math.hypot(g.c[0] - P[0], g.c[1] - P[1]);
  const dedans = b.m.pose === "enligne" || b.m.pose === "noeud";
  const anomalies = [];
  /* L'axe du corps doit tomber sur un quart de tour : les pièces sont censées être dessinées
     droites, de face ou de dessus. Dessinée de biais — et d'autant plus si la végétation d'une
     version hybride noie son corps — la pièce se pose en travers de sa piste, et aucun réglage
     du moteur n'y peut rien : c'est l'image qu'il faut refaire. On le dit ici plutôt que de
     le découvrir à l'œil sur un export. */
  const axe = BE.motif(b.m.id)._axe;
  if (axe) {
    let d = (axe.theta * 180) / Math.PI;
    d = Math.abs(d - 90 * Math.round(d / 90));
    if (d > 10) anomalies.push(`dessiné de biais (${d.toFixed(0)}° hors d'un quart de tour) — image à refaire droite`);
  }
  // un corps qui ne garde presque aucun trait interne se lira comme une capsule vide
  const mm = BE.motif(b.m.id);
  const nTraits = (mm._corps ? mm._corps.paths : mm.paths).length;
  if (nTraits <= 4 && b.m.etat === "electronique")
    anomalies.push(`${nTraits} traits seulement — se lira comme une forme vide`);
  if (dedans && ecart > g.r * 0.35) anomalies.push(`décentré de ${ecart.toFixed(0)}px`);
  if (!dedans && ecart < g.r * 0.4) anomalies.push("planté dans le support au lieu de dessus");
  if (b.s.t * sup.len + b.s.sizePx / 2 > sup.len + 1) anomalies.push("déborde du support");
  if (anomalies.length) ko++;
  console.log(`${anomalies.length ? "→ " : "  "}${b.m.nom.padEnd(large)} ${b.m.pose.padEnd(9)}` +
    ` ${(b.s.sizePx * BE.MM_PER_PX).toFixed(0)} mm  ${anomalies.join(" · ")}`);
}
console.log(`\n${pieces.length - ko}/${pieces.length} composants sans anomalie mesurée` +
  ` — le raccordement, lui, se juge à l'image (test/branch-proto.png)`);
