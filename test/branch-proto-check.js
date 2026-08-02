// Contrôle headless du prototype de moteur de branches (test/branch-engine.js).
// Vérifie la fusion mère/fille, l'absence de NaN, et exporte la géométrie en JSON pour un
// rendu de contrôle (test/branch-proto-render.py). N'appartient pas au flux `node test/run.js`.
const fs = require("fs");
const path = require("path");

global.window = {};
global.ClipperLib = require("../vendor/clipper.js");
require("../src/branch-engine.js");
const BE = global.window.BE;

function fail(msg) { throw new Error("ÉCHEC : " + msg); }
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

// Contrainte pyrogravure : trait ≥ 1 mm, et un ruban porte 2 traits + 1 mm de blanc → ≥ 3 mm.
const MM = 1 / 0.288; // px par mm
const st = { rootWidth: 44, taper: 1.15, tipFrac: 0.12, childRatio: 0.66, childRatioSide: 0.30,
             filletRatio: 0.70, emergeLead: 0.5, swellAmp: 0.10, junctionSwell: 0.35,
             wobbleAmp: 0.02, wobbleLen: 3.2, smoothPx: 2.5 * MM, tipLen: 8 * MM, barkPitch: 14,
             ink: 1.0 * MM, inkFine: 0.6 * MM, minRibbon: 3.0 * MM, snap: 26, tailTwig: false,
             pcbWidth: 3.5 * MM, pcbTol: 18, pcbVias: true, pcbPad: true,
             knotDensity: 1.0, knotStep: 26 * MM,
             lianeWidth: 3.3 * MM, lianeNodes: 0, lianeNodeStep: 12, lianeCollar: 0.55, lianeLeaf: 6, lianeEtat: "organique",
             sowSize: 18 * MM, sowStep: 22 * MM, sowAngle: (55 * Math.PI) / 180, coilTurns: 1 };

try { require("../src/motif-bank.js"); } catch (e) { /* bibliothèque absente : test de semis sauté */ }
BE.setBank(global.window.MOTIF_BANK || []);

// courbe d'axe lisible : quadratique par points de contrôle
function curve(p0, p1, p2, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
              u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
  return out;
}

const scene = BE.createScene();

// tronc
const trunk = BE.addBranch(scene, curve([300, 1000], [330, 760], [430, 520], 60), st, null);
if (!trunk) fail("tronc non créé");

// deux filles accrochées sur le tronc + une petite-fille
function attachAt(parent, u, tip) {
  const p = parent.axis[Math.round(u * (parent.axis.length - 1))];
  const anchor = BE.hitAxis(scene, p, st.snap, st);
  if (!anchor) fail("accroche introuvable sur la mère");
  const mid = [(p[0] + tip[0]) / 2 + 30, (p[1] + tip[1]) / 2];
  return BE.addBranch(scene, curve(p, mid, tip, 40), st, anchor);
}
// ramification dense, plus proche de la référence qu'un simple Y
const b1 = attachAt(trunk, 0.34, [700, 700]);
const b2 = attachAt(trunk, 0.55, [170, 500]);
const b3 = attachAt(trunk, 0.78, [560, 330]);
if (!b1 || !b2 || !b3) fail("branches filles non créées");
const b11 = attachAt(b1, 0.45, [640, 470]);
const b12 = attachAt(b1, 0.75, [880, 560]);
const b21 = attachAt(b2, 0.5, [230, 300]);
if (!b11 || !b12 || !b21) fail("petites-filles non créées");
attachAt(b11, 0.55, [520, 300]);
attachAt(b12, 0.5, [900, 380]);

// arbre séparé (pour vérifier l'occlusion inter-arbres)
BE.addBranch(scene, curve([760, 1000], [900, 860], [1120, 820], 40), st, null);

let trees = BE.buildGeometry(scene, st);

// ── assertions ──
if (trees.length !== 2) fail(`2 arbres attendus (1 connexe + 1 isolé), obtenu ${trees.length}`);
const main = trees[0];
if (!main.silhouette.length) fail("silhouette vide");
if (!main.lines.length) fail("aucune ligne interne générée (écorce + brindilles)");

const allPts = main.silhouette.flat().concat(main.lines.flat());
if (allPts.some((p) => !isFinite(p[0]) || !isFinite(p[1]))) fail("NaN/Infinity dans la géométrie");

const area = (pts) => {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
    a += (pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]);
  return a / 2;
};

/* Fusion : un arbre est connexe, donc sa silhouette doit avoir exactement UN contour extérieur.
   Les contours d'orientation inverse sont des trous (deux branches qui enferment du blanc) et
   sont parfaitement légitimes — ne pas les compter comme un échec de fusion. */
const sizable = main.silhouette.filter((p) => Math.abs(area(p)) > 200);
const biggest = sizable.reduce((m, p) => (Math.abs(area(p)) > Math.abs(area(m)) ? p : m), sizable[0]);
const sign = Math.sign(area(biggest));
const outers = sizable.filter((p) => Math.sign(area(p)) === sign);
if (outers.length !== 1)
  fail(`fusion ratée : ${outers.length} contours extérieurs au lieu d'1 (les filles ne se soudent pas au tronc)`);

const A = Math.abs(area(outers[0]));
if (A < 5000 || A > 400000) fail(`aire suspecte : ${Math.round(A)} px²`);

// contrainte pyrogravure : aucun ruban ne descend sous le plancher de traçabilité
for (const b of scene.branches) {
  if (BE.isTwig(b, st)) continue;
  for (let i = 0; i <= 20; i++) {
    const w = BE.widthAt(b, i / 20, st);
    if (Math.max(w, st.minRibbon) < st.minRibbon - 1e-9)
      fail(`ruban sous le plancher de 1 mm sur la branche ${b.id}`);
  }
}

/* ── Régressions issues du 1ᵉʳ essai réel (2026-08-02) ───────────────────────────────────────
   Trois symptômes rapportés : fusion aléatoire, branche « pas tracée », trait simple subi. */

// (a) départ pris sur le BORD du tronc (pas sur son axe) : doit accrocher quand même
{
  const i = Math.round(0.3 * (trunk.axis.length - 1));
  const w = BE.widthAt(trunk, 0.3, st);
  const a = trunk.axis[Math.max(0, i - 2)], b = trunk.axis[Math.min(trunk.axis.length - 1, i + 2)];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;      // normale
  const edge = [trunk.axis[i][0] + nx * (w / 2 - 1), trunk.axis[i][1] + ny * (w / 2 - 1)];
  if (!BE.hitAxis(scene, edge, st.snap, st)) fail("départ sur le bord du tronc : accroche ratée");
}

// (b) tracé dessiné de la POINTE vers le tronc : doit accrocher et être retourné
{
  const p = trunk.axis[Math.round(0.5 * (trunk.axis.length - 1))];
  const away = curve([900, 200], [700, 300], p, 30);          // finit sur la mère
  const r = BE.anchorStroke(scene, away, st);
  if (!r.anchor) fail("tracé pointe→tronc : accroche ratée");
  if (r.pts[0][0] !== p[0] || r.pts[0][1] !== p[1]) fail("tracé pointe→tronc : non retourné");
}

// (c) fille accrochée tout près de la POINTE de sa mère : reste un ruban, pas un trait nu
{
  const tip = b3.axis[b3.axis.length - 2];
  const a = BE.hitAxis(scene, tip, st.snap, st);
  if (!a) fail("accroche en pointe de branche ratée");
  const child = BE.addBranch(scene, curve(tip, [tip[0] + 60, tip[1] - 80], [tip[0] + 40, tip[1] - 170], 25), st, a);
  if (BE.isTwig(child, st)) fail("fille en pointe dégradée en trait simple (doit rester un ruban)");
  if (child.w0 < st.minRibbon) fail(`fille en pointe trop fine : ${child.w0.toFixed(1)}px`);
}

// (d) pistes PCB : routage 45°/90°, largeur constante, et greffe sur une branche organique
{
  const wiggly = [];
  for (let i = 0; i <= 60; i++) wiggly.push([820 + i * 7, 640 + Math.sin(i / 5) * 22 - i * 3]);
  const piste = BE.addBranch(scene, wiggly, st, null, "piste");
  if (!piste) fail("piste non créée");

  /* Tous les tronçons doivent être à un multiple de 45°. `densify` n'émet que des points
     ALIGNÉS sur leurs segments (les sommets sont conservés tels quels), donc chaque paire
     consécutive de l'axe est exactement un morceau de tronçon : le test est exact. */
  let bad = 0, tested = 0;
  for (let i = 1; i < piste.axis.length; i++) {
    const dx = piste.axis[i][0] - piste.axis[i - 1][0], dy = piste.axis[i][1] - piste.axis[i - 1][1];
    if (Math.hypot(dx, dy) < 0.5) continue;
    const a = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 45;
    tested++;
    if (Math.min(a, 45 - a) > 1) bad++;
  }
  if (bad > 0) fail(`routage PCB : ${bad}/${tested} tronçons hors 45°/90°`);

  const g = BE.buildGeometry(scene, st).find((t) => t.rootId === piste.id);
  if (!g || !g.outline.length) fail("piste : aucun ruban généré");
  if (!g.lines.length) fail("piste : ni via ni pastille générés");

  // une piste greffée sur une branche organique doit fusionner (c'est la transition à venir)
  const p2 = trunk.axis[Math.round(0.6 * (trunk.axis.length - 1))];
  const a2 = BE.hitAxis(scene, p2, st.snap, st);
  const branchPiste = BE.addBranch(scene, [p2, [p2[0] + 200, p2[1] - 60], [p2[0] + 320, p2[1] - 180]], st, a2, "piste");
  if (!branchPiste || branchPiste.parentId !== trunk.id) fail("piste greffée sur branche : accroche ratée");
}

// (e) liane : calibre constant, pas d'effilement, et son propre style
{
  const pts = [];
  for (let i = 0; i <= 50; i++) pts.push([980 + Math.sin(i / 7) * 70, 900 - i * 12]);
  const liane = BE.addBranch(scene, pts, st, null, "liane");
  if (!liane) fail("liane non créée");
  const w0 = BE.widthAt(liane, 0.05, st);
  // une liane S'ENROULE autour d'une branche : elle la croise, elle ne s'y greffe pas
  const surTronc = BE.hitAxis(scene, trunk.axis[30], st.snap, st);
  const grimpante = BE.addBranch(scene, [trunk.axis[30], [520, 700], [640, 880]], st, surTronc, "liane");
  if (!grimpante) fail("liane sur branche non créée");
  if (grimpante.parentId !== null) fail("la liane s'est greffée sur la branche au lieu de la croiser");

  /* Enroulement : une liane qui traverse plusieurs fois le bois doit disparaître derrière
     lui une fois sur deux. On la fait donc passer et repasser sur le tronc. */
  const va = [];
  for (let i = 0; i <= 60; i++) {
    const y = 990 - i * 8;
    va.push([330 + Math.sin(i / 4.5) * 130, y]);   // serpente en travers du tronc
  }
  const enroulee = BE.addBranch(scene, va, st, null, "liane");
  const avant = BE.buildGeometry(scene, st).find((t) => t.rootId === enroulee.id);
  const aireAvant = avant ? avant.silhouette.reduce((a, p) => a + Math.abs(area(p)), 0) : 0;
  if (!aireAvant) fail("liane enroulée sans géométrie");
  // sans le bois, la même liane doit être PLUS étendue : c'est la preuve que l'on efface
  const seule = BE.createScene();
  BE.addBranch(seule, va, st, null, "liane");
  const nue = BE.buildGeometry(seule, st)[0];
  const aireNue = nue.silhouette.reduce((a, p) => a + Math.abs(area(p)), 0);
  if (Math.abs(aireAvant - aireNue) < 50)
    fail("la liane traverse le bois sans rien changer : aucune spire posée");
  /* La spire remplace une traversée par deux brins plus longs : l'aire AUGMENTE, c'est
     normal. On borne seulement pour attraper une spire qui partirait en vrille. */
  if (aireAvant < aireNue * 0.5 || aireAvant > aireNue * 2.2)
    fail(`spire aberrante : ${Math.round(100 * aireAvant / aireNue)} % de l'aire nue`);
  /* Le tour doit se faire AUTOUR du bois, donc dans le repère de la BRANCHE : la liane
     longe le tronc le temps de faire sa boucle et repasse de l'autre côté. Traversée en
     biais exprès — c'est le cas où un tour posé dans le repère de la liane part à côté. */
  const obl = BE.createScene();
  const tr = [];
  for (let i = 0; i <= 60; i++) tr.push([120 + i * 12, 600]);       // tronc horizontal
  const troncH = BE.addBranch(obl, tr, st, null);
  const biais = [];
  for (let i = 0; i <= 80; i++) biais.push([480 + (i - 40) * 4.9, 600 + (i - 40) * 7.0]);  // ~55°
  const enBiais = BE.addBranch(obl, biais, st, null, "liane");
  BE.buildGeometry(obl, st);
  const ca = enBiais.coilAxis;
  if (!ca) fail("traversée en biais : aucun tour posé");
  const Y = 600, demi = BE.widthAt(troncH, 0.5, st) / 2;
  /* Longueur passée DANS l'épaisseur du bois : un vrai tour oblige la liane à le longer,
     une simple ondulation posée dessus le traverse tout droit. */
  const dedans = (ax) => {
    let l = 0;
    for (let i = 1; i < ax.length; i++)
      if (Math.abs(ax[i][1] - Y) < demi && Math.abs(ax[i - 1][1] - Y) < demi)
        l += Math.hypot(ax[i][0] - ax[i - 1][0], ax[i][1] - ax[i - 1][1]);
    return l;
  };
  const marche = dedans(ca), marcheNue = dedans(enBiais.axis);
  if (marche < marcheNue * 1.8)
    fail(`la liane ne longe pas la branche pendant son tour : ${Math.round(marche)}px dans le bois contre ${Math.round(marcheNue)}px sans tour — elle s'enroule à côté`);
  // et elle doit ressortir des deux côtés du tronc, sinon elle ondule dessus sans en faire le tour
  let dessus = 0, dessous = 0;
  for (const p of ca) {
    if (Math.abs(p[0] - 480) > demi * 8) continue;
    if (p[1] < Y - demi) dessus++;
    if (p[1] > Y + demi) dessous++;
  }
  if (!dessus || !dessous) fail("le tour ne ressort pas des deux côtés du bois");

  /* La portion enroulée reste NUE : une feuille posée dans la spire s'empile sur le contour
     de la branche et le croisement devient illisible (relevé sur branches(9).svg). */
  {
    const g = BE.createScene();
    const t2 = [];
    for (let i = 0; i <= 60; i++) t2.push([120 + i * 12, 600]);
    BE.addBranch(g, t2, st, null);
    const v = [];
    for (let i = 0; i <= 90; i++) v.push([480 + Math.sin(i / 15) * 40, 300 + i * 7]);
    const lg = BE.addBranch(g, v, st, null, "liane");
    if (!BE.garnishLiane(g, lg, st)) fail("liane non garnie");
    const zones = BE.coilSpans(g, lg, st);
    if (!zones.length) fail("aucune fenêtre d'enroulement détectée sur une traversée franche");
    for (const s of g.stamps)
      if (zones.some((z) => s.t >= z.t0 && s.t <= z.t1))
        fail(`motif posé dans la spire (t=${s.t.toFixed(2)}) : le croisement devient illisible`);
    // et un tour dessiné APRÈS coup doit dégager ce qui s'y trouvait déjà
    const g2 = BE.createScene();
    const lg2 = BE.addBranch(g2, v, st, null, "liane");
    BE.garnishLiane(g2, lg2, st);
    const posesAvant = BE.buildGeometry(g2, st).length;
    BE.addBranch(g2, t2, st, null);                       // la branche arrive ensuite
    const apres = BE.buildGeometry(g2, st);
    if (!lg2.coilZones || !lg2.coilZones.length) fail("tour non détecté après ajout de la branche");
    const caches = g2.stamps.filter((s) => lg2.coilZones.some((z) => s.t >= z.t0 && s.t <= z.t1));
    if (!caches.length) fail("aucun motif n'était sous la nouvelle spire : cas non couvert");
    if (apres.length >= posesAvant + caches.length)
      fail("les motifs pris sous la spire n'ont pas été retirés");
  }

  /* ENCOMBREMENT. Les motifs de garniture sont posés à un rythme, pas à un endroit choisi :
     rien ne garantit que la place soit libre, et une liane tracée ensuite peut venir traverser
     une feuille déjà posée (relevé sur branches(10).svg). On arbitre donc au rendu : côté
     opposé si ça dégage, sinon on ne pose pas. */
  {
    const droit = (dx) => {
      const a = [];
      for (let i = 0; i <= 110; i++) a.push([500 + dx, 150 + i * 7]);
      return a;
    };
    // support DÉGAGÉ : tout doit être rendu
    const libre = BE.createScene();
    const seul = BE.addBranch(libre, droit(0), st, null, "liane");
    const nSeul = BE.garnishLiane(libre, seul, st);
    const rendus = (sc) => BE.buildGeometry(sc, st).filter((t) => !t.outline.length && t.silhouette.length).length;
    if (rendus(libre) !== nSeul) fail(`liane dégagée : ${rendus(libre)} motifs rendus sur ${nSeul} posés`);

    // liane prise en sandwich : les deux côtés sont bouchés, il FAUT en écarter
    const serre = BE.createScene();
    BE.addBranch(serre, droit(-34), st, null, "liane");
    BE.addBranch(serre, droit(34), st, null, "liane");
    const mil = BE.addBranch(serre, droit(0), st, null, "liane");
    const nMil = BE.garnishLiane(serre, mil, st);
    const gardes = BE.buildGeometry(serre, st).filter((t) => !t.outline.length && t.silhouette.length);
    if (gardes.length >= nMil) fail("liane coincée entre deux autres : aucun motif écarté, ils s'empilent");

    // et ce qui reste ne se chevauche pas
    const keep = new Set(gardes.map((t) => t.order));
    const fps = serre.stamps.filter((s) => keep.has(s.id))
      .map((s) => BE.stampFootprint(serre, s, st, s._side));
    for (let i = 0; i < fps.length; i++)
      for (let j = i + 1; j < fps.length; j++) {
        const d = Math.hypot(fps[i].c[0] - fps[j].c[0], fps[i].c[1] - fps[j].c[1]);
        if (d < (fps[i].r + fps[j].r) * 0.7) fail("deux motifs rendus se superposent encore");
      }
  }

  // Le CORPS garde son calibre — une liane ne s'effile pas comme une branche…
  const wm = BE.widthAt(liane, 0.6, st);
  if (Math.abs(wm - w0) / w0 > 0.15) fail(`corps de liane effilé : ${w0.toFixed(1)} -> ${wm.toFixed(1)}px`);
  // … mais sa fin cède la place à un fil, comme sur la référence
  if (BE.widthAt(liane, 0.99, st) > w0 * 0.3) fail("la liane ne s'achève pas en trait simple");
}

/* (e bis) MANIÈRE DE POSER. Une résistance a une patte à chaque bout : elle s'insère dans la
   ligne, centrée dessus et dans son sens. Une puce est un nœud. Une vrille termine la course.
   Les semer tous en oblique comme des feuilles donnait des composants flottant à côté de leur
   piste, sans y être raccordés (relevé sur branches(11).svg). */
if (BE.bank.length) {
  const poses = new Set(BE.bank.map((m) => m.pose));
  for (const p of ["laterale", "montee", "enligne", "noeud", "terminale"])
    if (!poses.has(p)) fail(`aucun motif en pose « ${p} » : le classement de la banque est incomplet`);

  const sc = BE.createScene();
  const droite = [];
  for (let i = 0; i <= 60; i++) droite.push([200 + i * 14, 600]);   // piste horizontale
  const ligne = BE.addBranch(sc, droite, st, null, "piste");
  const gros = Object.assign({}, st, { sowSize: 34 * MM, sowStep: 60 * MM });

  const unDe = (pose) => BE.bank.find((m) => m.pose === pose);
  // en ligne : centré sur l'axe et dans son sens — pas décalé sur le côté, pas en biais
  {
    const m = unDe("enligne");
    const s = BE.addStamp(sc, m.id, { branchId: ligne.id, t: 0.4 }, { side: 1, sizePx: gros.sowSize, angle: 1.2 });
    if (Math.abs(s.angle) > 1e-9) fail(`« ${m.nom} » posé en biais (${(s.angle * 180 / Math.PI).toFixed(0)}°) : une pièce en ligne suit la ligne`);
    const fp = BE.stampFootprint(sc, s, gros, s.side);
    const P = ligne.axis[Math.round(s.t * (ligne.axis.length - 1))];
    if (Math.hypot(fp.c[0] - P[0], fp.c[1] - P[1]) > fp.r * 0.35)
      fail(`« ${m.nom} » posé à côté de la ligne au lieu d'être dessus`);
  }
  // monté : debout sur la ligne, donc perpendiculaire
  {
    const m = unDe("montee");
    const s = BE.addStamp(sc, m.id, { branchId: ligne.id, t: 0.6 }, { side: 1, sizePx: gros.sowSize, angle: 0.4 });
    if (Math.abs(s.angle - Math.PI / 2) > 1e-9) fail(`« ${m.nom} » n'est pas planté debout sur la ligne`);
  }
  // terminal : au bout, et UNE seule fois même si on sème sur toute la longueur
  {
    const m = unDe("terminale");
    const avant = sc.stamps.length;
    BE.sowAlong(sc, ligne.id, 0.1, 0.9, m.id, gros);
    const nouveaux = sc.stamps.slice(avant);
    if (nouveaux.length !== 1) fail(`« ${m.nom} » semé en file (${nouveaux.length}) : un motif terminal ne se sème pas`);
    if (nouveaux[0].t < 0.98) fail(`« ${m.nom} » posé à t=${nouveaux[0].t.toFixed(2)} au lieu du bout`);
  }
  /* Une pose DEMANDÉE n'est jamais refusée : elle est agrandie jusqu'à rester lisible. Un
     plafond rendait 19 motifs sur 42 impossibles à poser à la taille par défaut, sans le
     moindre message. Seule la garniture automatique garde ce plafond. */
  {
    const dense = BE.bank.reduce((a, b) => (BE.minStampSize(a, st) >= BE.minStampSize(b, st) ? a : b));
    const mini = BE.minStampSize(dense, st);
    const minus = Object.assign({}, st, { autoLod: false });
    const pose = BE.poseLisible(sc, dense.id, { branchId: ligne.id, t: 0.5 },
                                { side: 1, sizePx: 5 * MM, angle: 0 }, minus);
    if (!pose) fail(`« ${dense.nom} » refusé alors qu'on le demandait : rien ne se pose plus`);
    if (pose.sizePx < mini - 1e-6)
      fail(`« ${dense.nom} » posé à ${(pose.sizePx * BE.MM_PER_PX).toFixed(0)} mm sans être agrandi à ${(mini * BE.MM_PER_PX).toFixed(0)}`);
    if (!pose.agrandi) fail("l'agrandissement n'est pas signalé : la page ne peut pas le dire");
    // la garniture, elle, a le droit de renoncer — personne ne lui a rien demandé
    if (BE.poseLisible(sc, dense.id, { branchId: ligne.id, t: 0.6 },
                       { side: 1, sizePx: 5 * MM, angle: 0 }, minus, true))
      fail("la garniture automatique pose un motif très au-delà de son plafond");
  }

  /* Une pièce INSÉRÉE dans la ligne doit tenir ENTIÈRE sur son support : posée près d'un
     bout, la moitié dépassait dans le vide et rien ne s'y raccordait (puces et résistances
     flottant au bout des branches, relevé sur branches(13).svg). */
  {
    const bo = BE.createScene();
    const tr = [];
    for (let i = 0; i <= 44; i++) tr.push([200 + i * 20, 500]);
    const l = BE.addBranch(bo, tr, st, null, "piste");
    /* Au BOUT, la pièce doit dépasser : c'est ce débord qui porte sa patte libre, et c'est
       elle qu'une piste vient prendre pour continuer. Ce qu'on vérifie, c'est qu'elle reste
       RACCORDÉE — sa moitié intérieure doit mordre le support. */
    for (const pose of ["enligne", "noeud"]) {
      const m = BE.bank.find((x) => x.pose === pose);
      const sp = BE.addStamp(bo, m.id, { branchId: l.id, t: 0.99 },
                             { side: 1, sizePx: 30 * MM, angle: 0 });
      if (sp.t !== 1) fail(`« ${m.nom} » demandé au bout : posé à t=${sp.t.toFixed(2)}`);
      const fp = BE.stampFootprint(bo, sp, st, sp.side);
      const bout = l.axis[l.axis.length - 1];
      if (Math.hypot(fp.c[0] - bout[0], fp.c[1] - bout[1]) > fp.r * 0.4)
        fail(`« ${m.nom} » posé au bout mais décentré de la pointe : le raccord ne se fera pas`);
    }
  }

  /* Une pièce en ligne TERMINE la tige : la branche arrive sur une patte, la piste repart de
     l'autre. Demandée près d'un bout, elle s'y aimante — posée en plein milieu, elle avait
     l'air enfilée sur le bois comme une perle. */
  {
    const bo2 = BE.createScene();
    const tr = [];
    for (let i = 0; i <= 60; i++) tr.push([160 + i * 16, 300]);
    const m = BE.bank.find((x) => x.pose === "enligne");
    for (const kind of ["piste", "liane"]) {
      const l = BE.addBranch(bo2, tr, st, null, kind);
      const bout = BE.addStamp(bo2, m.id, { branchId: l.id, t: 0.92 },
                               { side: 1, sizePx: 30 * MM, angle: 0 });
      if (bout.t !== 1) fail(`« ${m.nom} » demandé près du bout d'une ${kind} : posé à t=${bout.t.toFixed(2)} au lieu du bout`);
      const debut = BE.addStamp(bo2, m.id, { branchId: l.id, t: 0.08 },
                                { side: 1, sizePx: 30 * MM, angle: 0 });
      if (debut.t !== 0) fail(`« ${m.nom} » demandé près du départ : posé à t=${debut.t.toFixed(2)}`);
      // au milieu, elle reste où on l'a mise : un composant en cours de circuit est légitime
      const mid = BE.addStamp(bo2, m.id, { branchId: l.id, t: 0.5 },
                              { side: 1, sizePx: 30 * MM, angle: 0 });
      if (Math.abs(mid.t - 0.5) > 1e-9) fail(`« ${m.nom} » déplacé alors qu'il était posé en plein milieu`);
    }
    // et une pièce au bout offre bien une borne libre pour continuer en piste
    const l2 = BE.addBranch(bo2, tr.map((p) => [p[0], p[1] + 200]), st, null);
    const sp = BE.addStamp(bo2, m.id, { branchId: l2.id, t: 0.95 }, { side: 1, sizePx: 30 * MM, angle: 0 });
    BE.buildGeometry(bo2, st);
    if (!BE.stampPorts(bo2, sp, st).some((b) => !b.prise))
      fail("une pièce posée au bout n'offre aucune borne libre : impossible d'enchaîner une piste");
  }

  /* Une liane s'enroule autour du BOIS. Une piste qui la PROLONGE était vue comme un obstacle
     à contourner : une spire parasite se posait au raccord et cassait l'enroulement en place. */
  {
    const spires = (avecPiste) => {
      const sc2 = BE.createScene();
      const br = [];
      for (let i = 0; i <= 70; i++) br.push([120 + i * 14, 420]);
      BE.addBranch(sc2, br, st, null);
      const li = [];
      for (let i = 0; i <= 90; i++) li.push([420 + i * 2, 180 + i * 6]);
      const L = BE.addBranch(sc2, li, st, null, "liane");
      if (avecPiste) {
        const q = L.axis[L.axis.length - 1], pc = [];
        for (let i = 0; i <= 40; i++) pc.push([q[0] + i * 9, q[1] + i * 3]);
        BE.addBranch(sc2, pc, st, null, "piste");
      }
      BE.buildGeometry(sc2, st);
      return BE.coilSpans(sc2, L, st).map((z) => `${z.t0.toFixed(2)}-${z.t1.toFixed(2)}`).join(" ");
    };
    const seule = spires(false), avec = spires(true);
    if (!seule) fail("la liane ne s'enroule pas sur le tronc : cas de test invalide");
    if (seule !== avec)
      fail(`une piste qui prolonge la liane change son enroulement : « ${seule} » devient « ${avec} »`);
  }

  /* Un motif TERMINAL prolonge la ligne vers l'extérieur. Les radicelles étaient dessinées
     moignon en HAUT, à l'envers de toute la banque : posées, elles rabattaient leurs racines
     sur la branche au lieu de les étaler au-delà de la pointe. */
  {
    const te = BE.createScene();
    const tr = [];
    for (let i = 0; i <= 44; i++) tr.push([200 + i * 20, 700]);
    const l = BE.addBranch(te, tr, st, null);
    const bout = l.axis[l.axis.length - 1][0];
    for (const m of BE.bank.filter((x) => x.pose === "terminale")) {
      const sp = BE.addStamp(te, m.id, { branchId: l.id, t: 0.99 },
                             { side: 1, sizePx: 34 * MM, angle: 0 });
      const g = BE.buildGeometry(te, st).find((t) => t.order === sp.id);
      if (!g || !g.lines.length) fail(`« ${m.nom} » sans géométrie`);
      const xs = g.lines.flat().map((q) => q[0]);
      const masse = xs.reduce((a, b) => a + b, 0) / xs.length;
      if (masse < bout)
        fail(`« ${m.nom} » retombe sur la branche (masse à ${masse.toFixed(0)}, pointe à ${bout.toFixed(0)}) : posé à l'envers`);
      te.stamps.length = 0;
    }
  }

  /* CHAÎNAGE. Une pièce en ligne ou en nœud offre des bornes libres : on doit pouvoir
     enchaîner branche → résistance → piste. Un motif qui ne fait que se poser sur un
     support (champignon, feuille, vrille) n'en offre aucune. */
  {
    const ch = BE.createScene();
    const tr = [];
    for (let i = 0; i <= 40; i++) tr.push([200 + i * 12, 400]);
    const l0 = BE.addBranch(ch, tr, st, null, "piste");
    const gros = Object.assign({}, st, { sowSize: 34 * MM });
    const res = BE.bank.find((m) => m.pose === "enligne");
    const s1 = BE.addStamp(ch, res.id, { branchId: l0.id, t: 0.8 }, { side: 1, sizePx: gros.sowSize, angle: 0 });
    const bornes = BE.stampPorts(ch, s1, gros);
    if (bornes.length < 2) fail(`« ${res.nom} » n'offre que ${bornes.length} borne(s) : on ne peut rien y enchaîner`);
    const libres = bornes.filter((b) => !b.prise);
    if (!libres.length) fail("aucune borne libre sur une pièce en ligne");

    // un trait qui démarre près d'une borne libre s'y recale, au lieu de se greffer ailleurs
    const b0 = libres[0];
    const trace = [[b0.p[0] + b0.dir[0] * 6, b0.p[1] + b0.dir[1] * 6]];
    for (let i = 1; i <= 20; i++) trace.push([b0.p[0] + b0.dir[0] * (6 + i * 9), b0.p[1] + b0.dir[1] * (6 + i * 9) - i * 2]);
    const r = BE.anchorStroke(ch, trace, gros);
    if (!r.port) fail("un trait parti d'une borne libre ne s'y accroche pas");
    if (dist2(r.pts[0], b0.p) > (st.ink * 2) ** 2)
      fail("le départ n'est pas recalé sur la borne : un blanc s'ouvrira entre la pièce et la ligne");

    // un motif qui se pose seulement sur un support n'ouvre aucune borne
    const champ = BE.bank.find((m) => m.pose === "montee" || m.pose === "laterale");
    const s2 = BE.addStamp(ch, champ.id, { branchId: l0.id, t: 0.3 }, { side: 1, sizePx: gros.sowSize, angle: 1 });
    if (BE.stampPorts(ch, s2, gros).length)
      fail(`« ${champ.nom} » offre des bornes alors qu'il ne fait que se poser sur un support`);
  }
}

// (f) semis : motifs posés, ancrés à la branche, et occultants
if (BE.bank.length) {
  // un motif qui TIENT à la taille de semis : sous son seuil, le moteur refuse désormais de
  // le poser, et c'est voulu — une tache d'encre n'est pas un motif
  // même tolérance que le moteur : il agrandit jusqu'à 1,6× pour rendre un motif lisible
  const mm = BE.bank.find((x) => x.pose === "laterale" && BE.minStampSize(x, st) <= st.sowSize * 1.6);
  if (!mm) fail("aucun motif latéral posable à la taille de semis");
  const m = mm.id;
  /* Support DÉGAGÉ : à ce stade la scène est saturée (liane serpentant sur le tronc, piste
     PCB), et l'arbitrage d'encombrement écarterait alors des motifs à juste titre. */
  const libre = BE.addBranch(scene, curve([1250, 300], [1330, 180], [1380, 40], 40), st, null);
  const n = BE.sowAlong(scene, libre.id, 0.25, 0.75, m, st);
  if (n < 3) fail(`semis trop clairsemé : ${n} motifs`);
  const posed = scene.stamps.filter((s) => s.branchId === libre.id);
  if (posed.some((s) => s.t < 0.24 || s.t > 0.76)) fail("semis hors de la plage demandée");
  if (new Set(posed.map((s) => s.side)).size !== 2) fail("semis sans alternance gauche/droite");

  const all = BE.buildGeometry(scene, st);
  const layers = all.filter((t) => !t.outline.length && t.silhouette.length);
  if (layers.length < n) fail(`motifs posés sans géométrie : ${layers.length} couches pour ${n} motifs`);
  const pts = layers.flatMap((t) => t.lines.flat());
  if (pts.some((p) => !isFinite(p[0]) || !isFinite(p[1]))) fail("NaN dans un motif posé");
  // l'ordre de pose doit passer APRÈS les branches : un motif posé masque le bois
  const maxBranch = Math.max(...scene.branches.map((b) => b.id));
  if (layers.some((t) => t.order <= maxBranch)) fail("motif posé rendu sous les branches");
}

// (g) édition : poignées d'axe et motifs posés
{
  const b = trunk;
  if (!b.ctrl || b.ctrl.length < 4) fail(`pas de points de contrôle sur le tronc (${b.ctrl && b.ctrl.length})`);
  if (b.ctrl.length > 40) fail("trop de poignées pour être manipulables");

  // une poignée déplacée doit déplacer l'axe, et emmener ce qui pousse dessus
  const fille = scene.branches.find((x) => x.parentId === b.id);
  if (!fille) fail("aucune fille sur le tronc");
  const avant = fille.axis[0].slice();
  const i = Math.round(b.ctrl.length / 2);
  const cible = [b.ctrl[i][0] + 90, b.ctrl[i][1] - 40];
  BE.moveCtrl(scene, b, i, cible, st);
  if (Math.hypot(b.axis[Math.round(b.axis.length / 2)][0] - cible[0],
                 b.axis[Math.round(b.axis.length / 2)][1] - cible[1]) > 120)
    fail("l'axe n'a pas suivi la poignée");
  if (Math.hypot(fille.axis[0][0] - avant[0], fille.axis[0][1] - avant[1]) < 1)
    fail("la fille est restée en place alors que sa mère a bougé");
  if (!b.edited) fail("la branche retouchée n'est pas marquée comme telle");

  // un curseur de style ne doit pas effacer la retouche
  const apres = b.ctrl[i].slice();
  BE.rebuildAxes(scene, st);
  if (Math.hypot(b.ctrl[i][0] - apres[0], b.ctrl[i][1] - apres[1]) > 0.01)
    fail("le relissage a écrasé la retouche manuelle");

  // un motif posé coulisse le long de sa branche
  if (BE.bank.length) {
    const s0 = scene.stamps.find((x) => x.branchId === trunk.id);
    if (s0) {
      const t0 = s0.t;
      BE.moveStamp(scene, s0, trunk.axis[Math.round(trunk.axis.length * 0.9)]);
      if (Math.abs(s0.t - t0) < 0.05) fail("le motif posé n'a pas coulissé");
      if (s0.t < 0 || s0.t > 1) fail("abscisse de motif hors de la branche");
    }
  }
}

trees = BE.buildGeometry(scene, st); // la scène a bougé pendant les régressions
const stats = BE.stats(scene);

// ── sortie pour le rendu de contrôle ──
const dump = { W: 1402, H: 1122, ink: st.ink,
               trees: trees.map((t) => ({ silhouette: t.silhouette, outline: t.outline, lines: t.lines })) };
fs.writeFileSync(path.join(__dirname, "branch-proto.json"), JSON.stringify(dump));
fs.writeFileSync(path.join(__dirname, "branch-proto.svg"), BE.toSVG(trees, 1402, 1122, st));

const twigs = scene.branches.filter((b) => BE.isTwig(b, st)).length;
console.log(`OK — ${stats.branches} branches (dont ${twigs} brindilles), ${trees.length} arbres, ` +
            `1 contour extérieur (fusion OK), ${main.lines.length} lignes internes, ` +
            `aire ${Math.round(A)} px², encre ${(st.ink * 0.288).toFixed(2)} mm, ` +
            `budget ${(stats.lengthMm / 1000).toFixed(2)} m`);
