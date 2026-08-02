/* COMPOSITION COMPLÈTE DE LA TABLE — node test/banc-compo.js [graine]

   Fabrique un décor entier dans la zone dessinable de la guitare, en suivant la langue de
   `reference/trame de base.png` : arbre en bas à gauche, racines étalées, densité végétale à
   gauche, dégradé vers des pistes orthogonales à droite, défonces contournées.

   Sert à voir le moteur à l'échelle du projet. Les défauts de composition — trous, entassements,
   transition organique/électronique ratée — n'apparaissent sur aucun banc unitaire.           */
global.window = {};
global.ClipperLib = require("../vendor/clipper.js");
require("../src/motif-bank.js");
require("./masque-corps.js");
require("../src/branch-engine.js");
const BE = global.window.BE, MM = 1 / 0.288;
BE.setBank(global.window.MOTIF_BANK);

const W = 1402, H = 1122;
const MQ = global.window.MASQUE_CORPS;
function dedans(p) {
  const j = Math.round(p[1] / MQ.pas), i = p[0] / MQ.pas;
  if (j < 0 || j >= MQ.lignes.length) return false;
  for (const [a, b] of MQ.lignes[j]) if (i >= a && i <= b) return true;
  return false;
}
// marge : un ruban a de l'épaisseur, son axe ne doit pas raser le bord
function dedansLarge(p, m) {
  if (!dedans(p)) return false;
  for (let k = 0; k < 8; k++) {                    // 8 directions : un bord oblique passait entre 4
    const a = (k * Math.PI) / 4;
    if (!dedans([p[0] + Math.cos(a) * m, p[1] + Math.sin(a) * m])) return false;
  }
  return true;
}

const graine = Number(process.argv[2] || 1);
let et = (graine * 2654435761 + 12345) >>> 0;
const rnd = () => ((et = (et * 1664525 + 1013904223) >>> 0) / 4294967296);
const entre = (a, b) => a + (b - a) * rnd();
const choix = (l) => l[Math.floor(rnd() * l.length)];

const st = { rootWidth: 19 * MM, taper: 1.15, tipFrac: 0.12, childRatio: 0.66,
  childRatioSide: 0.30, filletRatio: 0.7, emergeLead: 0.5, swellAmp: 0.1, junctionSwell: 0.35,
  wobbleAmp: 0.02, wobbleLen: 3.2, smoothPx: 2.5 * MM, tipLen: 8 * MM, barkPitch: 14,
  ink: 1 * MM, inkFine: 0.6 * MM, minRibbon: 3 * MM, snap: 26, tailTwig: false,
  knotDensity: 1, knotStep: 26 * MM, pcbWidth: 3.2 * MM, pcbTol: 18, pcbVias: true,
  pcbPad: true, lianeWidth: 3.3 * MM, lianeNodes: 0, lianeNodeStep: 12, lianeCollar: 0.55,
  lianeLeaf: 6, lianeEtat: "organique", sowSize: 20 * MM, sowStep: 42 * MM,
  sowAngle: (58 * Math.PI) / 180, autoLod: true, coilTurns: 1 };

/* Grille d'occupation : elle sert à faire pousser les branches VERS le vide. Sans elle, tout
   se rassemble au centre et les lobes restent nus — c'est ce que faisait la première version. */
const GP = 40, GW = Math.ceil(W / GP), GH = Math.ceil(H / GP);
const occ = new Float32Array(GW * GH);
const marquer = (p, poids) => {
  const i = Math.floor(p[0] / GP), j = Math.floor(p[1] / GP);
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const x = i + di, y = j + dj;
    if (x >= 0 && x < GW && y >= 0 && y < GH) occ[y * GW + x] += poids / (1 + Math.abs(di) + Math.abs(dj));
  }
};
const charge = (p) => {
  const i = Math.floor(p[0] / GP), j = Math.floor(p[1] / GP);
  return i >= 0 && i < GW && j >= 0 && j < GH ? occ[j * GW + i] : 99;
};

/* Dégradé organique → électronique, sur l'axe horizontal comme sur la trame de référence.
   0 = tout végétal (lobe gauche) · 1 = tout circuit (corne droite). */
let xmin = W, xmax = 0;                       // étendue réelle, mesurée au fil du tracé
const elec = (x) => (xmax - xmin < 200 ? 0
  : Math.max(0, Math.min(1, ((x - xmin) / (xmax - xmin) - 0.42) / 0.36)));

// tracé lissé, coupé dès qu'il sort de la zone dessinable
function courbe(pts, n, marge) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const u = (i / n) * (pts.length - 1), k = Math.min(pts.length - 2, Math.floor(u)), v = u - k;
    const a = pts[Math.max(0, k - 1)], b = pts[k], c = pts[k + 1], d = pts[Math.min(pts.length - 1, k + 2)];
    const h = (p, q, r, s) => 0.5 * (2 * q + (-p + r) * v + (2 * p - 5 * q + 4 * r - s) * v * v + (-p + 3 * q - 3 * r + s) * v * v * v);
    const p = [h(a[0], b[0], c[0], d[0]), h(a[1], b[1], c[1], d[1])];
    if (!dedansLarge(p, marge)) break;
    out.push(p);
  }
  for (const p of out) { marquer(p, 1); xmin = Math.min(xmin, p[0]); xmax = Math.max(xmax, p[0]); }
  return out;
}

/* CROISSANCE PAS À PAS. Relier deux points par une courbe donnait des branches en forme de
   lames droites, et la portée s'arrêtait au premier obstacle. On avance donc par petits pas :
   à chaque pas on regarde devant, on vire vers le plus libre, et on garde de l'inertie. Le
   trait devient sinueux comme sur la trame, et la branche contourne les défonces au lieu de
   s'y arrêter. */
/* À quel point ce point est-il « au large » ? 1 = bien au cœur du corps, 0 = collé au bord.
   Sans cette mesure, la croissance vers le vide colle au contour. */
function alaise(p) {
  let n = 0;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    if (dedans([p[0] + Math.cos(a) * 90, p[1] + Math.sin(a) * 90])) n++;
  }
  return n / 8;
}

function pousser(depart, cap0, longueur, marge, sinuosite) {

  const PAS = 13;
  const pts = [depart.slice()];
  let p = depart, cap = cap0;
  for (let parcouru = 0; parcouru < longueur; parcouru += PAS) {
    let meilleur = null;
    for (const d of [-0.42, -0.24, -0.1, 0, 0.1, 0.24, 0.42]) {
      const a = cap + d;
      const loin = [p[0] + Math.cos(a) * PAS * 4, p[1] + Math.sin(a) * PAS * 4];
      const suiv = [p[0] + Math.cos(a) * PAS, p[1] + Math.sin(a) * PAS];
      if (!dedansLarge(suiv, marge)) continue;
      /* On préfère le vide, MAIS pas le vide du bord : chercher la case la plus libre menait
         les branches à longer le contour, et le décor se refermait en anneau creux autour
         d'un intérieur nu. On récompense donc les endroits bien à l'intérieur. */
      const sc = (dedansLarge(loin, marge) ? charge(loin) : 6)
        + Math.abs(d) * 1.4
        + (1 - alaise(loin)) * 3.2;
      if (!meilleur || sc < meilleur.sc) meilleur = { a, sc, suiv };
    }
    if (!meilleur) break;
    cap = meilleur.a + (rnd() - 0.5) * sinuosite;
    const q = [p[0] + Math.cos(cap) * PAS, p[1] + Math.sin(cap) * PAS];
    if (!dedansLarge(q, marge)) break;
    pts.push(q); marquer(q, 1);
    xmin = Math.min(xmin, q[0]); xmax = Math.max(xmax, q[0]);
    p = q;
  }
  return pts;
}

/* La zone dessinable en polygones, pour que le moteur y coupe le décor : un rectangle par
   plage de ligne, fusionnés. On laisse donc les branches pousser jusqu'au bord — c'est ce
   qui donne la densité de la référence — et c'est la découpe qui fait le cadre. */
(function () {
  const C = ClipperLib, S = 1000, rects = [];
  for (let j = 0; j < MQ.lignes.length; j++) {
    const y0 = j * MQ.pas, y1 = y0 + MQ.pas;
    for (const [a, b] of MQ.lignes[j]) {
      const x0 = a * MQ.pas, x1 = (b + 1) * MQ.pas;
      rects.push([[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map((p) => ({ X: p[0] * S, Y: p[1] * S })));
    }
  }
  const c = new C.Clipper();
  c.AddPaths(rects, C.PolyType.ptSubject, true);
  const sol = new C.Paths();
  c.Execute(C.ClipType.ctUnion, sol, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  st.zone = sol.map((p) => p.map((q) => [q.X / S, q.Y / S]));
})();

const sc = BE.createScene();
const bilan = { branches: 0, pistes: 0, lianes: 0 };

// ── point de départ : le pied de l'arbre, en bas à gauche de la zone ──
let pied = null;
for (let j = MQ.lignes.length - 1; j >= 0 && !pied; j--) {
  const l = MQ.lignes[j];
  if (!l.length) continue;
  const y = j * MQ.pas;
  if (y < H * 0.62) break;
  const x = (l[0][0] + (l[0][1] - l[0][0]) * entre(0.34, 0.5)) * MQ.pas;
  if (dedansLarge([x, y - 20], 40)) pied = [x, y - 24];
}
if (!pied) pied = [W * 0.24, H * 0.78];

// ── tronc : il monte du pied vers le cœur du corps ──
const tronc = BE.addBranch(sc, pousser(pied, -Math.PI / 2 + entre(-0.25, 0.35),
  entre(430, 570), 34, 0.11), st, null);
bilan.branches++;

// ── racines : elles s'étalent au pied, en éventail vers le bas ──
const racines = [];
for (let k = 0; k < 4; k++) {
  const t = entre(0.02, 0.14);
  const p = tronc.axis[Math.round(t * (tronc.axis.length - 1))];
  const anc = BE.hitAxis(sc, p, st.snap, st);
  const cap = Math.PI * (0.52 + (k / 3) * 0.8);            // vers le bas, en éventail
  const b = BE.addBranch(sc, pousser(p, cap, entre(150, 250), 22, 0.22), st, anc);
  if (b && b.axis.length > 8) { racines.push(b); bilan.branches++; }
}

// ── charpente : deux niveaux de branches qui vont chercher le vide ──
const niv1 = [];
for (let k = 0; k < 5; k++) {
  const t = 0.25 + (k / 5) * 0.7 + entre(-0.05, 0.05);
  const p = tronc.axis[Math.round(Math.min(0.98, t) * (tronc.axis.length - 1))];
  const anc = BE.hitAxis(sc, p, st.snap, st);
  const cap = -Math.PI * 0.5 + (k - 2) * 0.5 + entre(-0.18, 0.18);
  const b = BE.addBranch(sc, pousser(p, cap, entre(340, 540), 26, 0.17), st, anc);
  if (b && b.axis.length > 14) { niv1.push(b); bilan.branches++; }
}
const niv2 = [];
for (const par of niv1) {
  for (let k = 0; k < 2; k++) {
    const t = entre(0.35, 0.85);
    const p = par.axis[Math.round(t * (par.axis.length - 1))];
    const anc = BE.hitAxis(sc, p, st.snap, st);
    const i = Math.round(t * (par.axis.length - 1));
    const av = par.axis[Math.max(0, i - 4)];
    const cap0 = Math.atan2(p[1] - av[1], p[0] - av[0]);
    const b = BE.addBranch(sc, pousser(p, cap0 + (k ? 0.7 : -0.7), entre(200, 350), 19, 0.2), st, anc);
    if (b && b.axis.length > 10) { niv2.push(b); bilan.branches++; }
  }
}

/* ── transition : au-delà du seuil, la branche ne repousse pas en bois mais en PISTE.
   C'est la lecture de la trame : le végétal devient circuit en allant vers la corne droite. */
const pistes = [];
const bouts = niv1.concat(niv2).filter((b) => b.axis.length > 8)
  .sort((a, b) => b.axis[b.axis.length - 1][0] - a.axis[a.axis.length - 1][0]);
for (const b of bouts.slice(0, 4)) {              // les 4 plus avancées vers la droite
  const q = b.axis[b.axis.length - 1];
  const av = b.axis[Math.max(0, b.axis.length - 7)];
  const cap0 = Math.atan2(q[1] - av[1], q[0] - av[0]);
  const pts = pousser(q, cap0, entre(220, 380), 12, 0.10);
  if (pts.length < 12) continue;
  const r = BE.anchorStroke(sc, pts, st);
  const P = BE.addBranch(sc, r.pts, st, r.anchor, "piste");
  if (P) { pistes.push(P); bilan.pistes++; }
}
// une ou deux pistes de plus, franchement dans la corne droite
for (let k = 0; k < 3 && pistes.length; k++) {
  const src = choix(pistes);
  const t = entre(0.3, 0.7);
  const p = src.axis[Math.round(t * (src.axis.length - 1))];
  const anc = BE.hitAxis(sc, p, st.snap, st);
  const cap = k === 0 ? entre(-0.5, 0.5) : entre(0.5, 1.3);   // l'une file, l'autre plonge
  const P = BE.addBranch(sc, pousser(p, cap, entre(220, 400), 14, 0.10), st, anc, "piste");
  if (P && P.axis.length > 8) { pistes.push(P); bilan.pistes++; }
}

// ── lianes : elles tombent des branches hautes et s'enroulent sur ce qu'elles croisent ──
for (let k = 0; k < 4; k++) {
  const cible = niv1.length ? choix(niv1) : tronc;
  const p = cible.axis[Math.round(entre(0.3, 0.8) * (cible.axis.length - 1))];
  if (elec(p[0]) > 0.5) continue;                      // les lianes restent côté végétal
  let depart = null;
  for (let essai = 0; essai < 8 && !depart; essai++) {
    const q = [p[0] + entre(-60, 60), p[1] - entre(110, 230)];
    if (dedansLarge(q, 26)) depart = q;
  }
  if (!depart) continue;
  const pts = pousser(depart, Math.PI / 2 + entre(-0.4, 0.4), entre(420, 620), 12, 0.30);
  if (pts.length < 30) continue;
  const L = BE.addBranch(sc, pts, st, null, "liane");
  if (L) { BE.garnishLiane(sc, L, st); bilan.lianes++; }
}

// ── motifs : chacun dans sa zone, selon sa manière de poser ──
const par = (f, p, e) => BE.bank.filter((m) =>
  (!f || m.famille === f) && (!p || m.pose === p) && (!e || m.etat === e));
const poser = (b, t, m) => m && BE.addStampAuto(sc, m.id, { branchId: b.id, t }, st);
const etatVers = (x) => (elec(x) > 0.55 ? "hybride" : "organique");

for (const r of racines) {                       // au pied : champignons et radicelles
  poser(r, entre(0.3, 0.6), choix(par("champignon", "montee", "organique")));
  poser(r, 0.99, choix(par("radicelle", "terminale", "organique")));
}
for (const b of niv1) {                          // sur la charpente : feuillage et fleurs
  const q = b.axis[b.axis.length - 1];
  const e = etatVers(q[0]);
  BE.sowAlong(sc, b.id, entre(0.25, 0.4), entre(0.6, 0.85),
    choix(par("feuille", "laterale", e)).id, st);
  if (rnd() < 0.55) poser(b, entre(0.45, 0.7), choix(par("fleur", "laterale", e)));
  if (elec(q[0]) < 0.3 && rnd() < 0.5) poser(b, 0.99, choix(par("vrille", "terminale", "organique")));
}
for (const b of niv2) {
  const q = b.axis[b.axis.length - 1];
  if (rnd() < 0.6) poser(b, entre(0.4, 0.75), choix(par("feuille", "laterale", etatVers(q[0]))));
  if (elec(q[0]) < 0.35 && rnd() < 0.4) poser(b, 0.99, choix(par("vrille", "terminale", "organique")));
}
BE.sowAlong(sc, tronc.id, 0.35, 0.85, choix(par("champignon", "montee", "organique")).id, st);

/* Personnages : ce sont les seules figures du décor. On les pose comme la trame place ses
   champignons — quelques-uns, bien répartis, jamais en file. Les koroks sont plus grands que
   les kodama, on leur laisse de la place. */
const perso = par("personnage");
if (perso.length) {
  const supports = [tronc].concat(niv1, racines).filter((b) => b.axis.length > 14);
  const dejaVus = [];
  for (let k = 0; k < 3 && supports.length; k++) {
    const b = supports[Math.floor(rnd() * supports.length)];
    const t = entre(0.25, 0.8);
    const p = b.axis[Math.round(t * (b.axis.length - 1))];
    if (dejaVus.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 220)) continue;
    const e = etatVers(p[0]);
    const lot = perso.filter((m) => m.etat === e);
    const m = choix(lot.length ? lot : perso);
    const gros = Object.assign({}, st, { sowSize: entre(30, 42) * MM });
    if (BE.addStampAuto(sc, m.id, { branchId: b.id, t }, gros)) dejaVus.push(p);
  }
}

for (const P of pistes) {                        // sur les pistes : les pièces
  const e = elec(P.axis[Math.round(P.axis.length / 2)][0]) > 0.7 ? "electronique" : "hybride";
  poser(P, entre(0.3, 0.5), choix(par("composant", "enligne", e)));
  if (rnd() < 0.6) poser(P, entre(0.62, 0.8), choix(par("composant", "noeud", e)));
  if (rnd() < 0.4) poser(P, entre(0.5, 0.7), choix(par("composant", "montee", e)));
}

// ── rendu et mesures ──
const trees = BE.buildGeometry(sc, st);
require("fs").writeFileSync("branch-proto.json", JSON.stringify({ W, H, ink: st.ink,
  trees: trees.map((t) => ({ silhouette: t.silhouette, outline: t.outline, lines: t.lines })) }));

let hors = 0, tot = 0;
for (const t of trees) for (const p of t.silhouette) for (const q of p) { tot++; if (!dedans(q)) hors++; }
// couverture : part des cases de la zone dessinable qui portent quelque chose
let cases = 0, prises = 0;
for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
  const p = [i * GP + GP / 2, j * GP + GP / 2];
  if (!dedans(p)) continue;
  cases++;
  if (occ[j * GW + i] > 0.5) prises++;
}
const s = BE.stats(sc);
const fam = {};
for (const st2 of sc.stamps) { const m = BE.motif(st2.motifId); fam[m.famille] = (fam[m.famille] || 0) + 1; }
console.log(`graine ${graine} — ${bilan.branches} branches · ${bilan.pistes} pistes · ` +
  `${bilan.lianes} lianes · ${sc.stamps.length} motifs`);
console.log(`  couverture ${((prises / cases) * 100).toFixed(0)}% · budget ${(s.lengthMm / 1000).toFixed(2)} m · ` +
  `hors zone ${hors}/${tot} · retournés ${BE._retournes} · serrés ${BE._serres} · écartés ${BE._ecartes}`);
console.log(`  familles : ${Object.entries(fam).map(([k, v]) => k + " " + v).join(" · ")}`);
