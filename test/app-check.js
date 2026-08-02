/* Contrôle de l'app déployée — node test/app-check.js
 *
 * L'app part en production sur Vercel. Une erreur au chargement y est invisible jusqu'à ce
 * qu'un utilisateur ouvre la page — c'est exactement ce qui est arrivé au prototype avec une
 * constante utilisée avant sa déclaration, que `node --check` laissait passer.
 *
 * `src/app.js` ne peut pas tourner ici : il tient à Konva, au canvas et à un DOM complet. On
 * vérifie donc ce qui casse le plus souvent une intégration et se voit sans lui :
 *   1. chaque script chargé par index.html existe et se parse ;
 *   2. tout identifiant DOM cherché par le JS existe dans le HTML ;
 *   3. `src/generator-ui.js` s'EXÉCUTE contre un DOM factice — c'est le code neuf, donc le
 *      plus exposé, et il ne fait qu'accrocher des gestionnaires au chargement.
 *
 * Le rendu, lui, reste à vérifier à l'œil (cf. VALIDATION.md).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const racine = path.join(__dirname, "..");
function fail(msg) { throw new Error("ÉCHEC : " + msg); }

const html = fs.readFileSync(path.join(racine, "index.html"), "utf8");

// ── 1. les scripts chargés existent et se parsent ──
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
if (!scripts.length) fail("index.html ne charge aucun script");
const notres = scripts.filter((s) => s.startsWith("src/"));
if (!notres.length) fail("aucun script du projet chargé");
for (const s of scripts)
  if (!fs.existsSync(path.join(racine, s))) fail(`index.html charge ${s}, absent du disque`);
for (const s of notres) {
  try {
    execFileSync(process.execPath, ["--check", path.join(racine, s)], { stdio: "pipe" });
  } catch (e) {
    fail(s + " ne se parse pas");
  }
}

// ── 2. tout identifiant cherché par le JS existe dans le HTML ──
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
const manquants = [];
for (const s of notres) {
  const js = fs.readFileSync(path.join(racine, s), "utf8");
  for (const m of js.matchAll(/getElementById\(\s*["'`]([^"'`]+)["'`]\s*\)/g))
    if (!ids.has(m[1])) manquants.push(m[1] + " (" + s + ")");
}
if (manquants.length)
  fail("identifiants cherchés mais absents du HTML : " + manquants.join(", "));

// ── 3. le code neuf s'exécute-t-il ? ──
function noeud(id) {
  const n = {
    id: id || "", style: {}, dataset: {}, children: [], ecoute: {}, classes: new Set(),
    value: "", textContent: "", _html: "", hidden: false, checked: false, type: "",
    width: 1402, height: 1122, clientWidth: 900, clientHeight: 700,
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; this.children = []; },
    get className() { return [...this.classes].join(" "); },
    set className(v) { this.classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
    classList: {
      add: (...c) => c.forEach((x) => n.classes.add(x)),
      remove: (...c) => c.forEach((x) => n.classes.delete(x)),
      toggle: (c, f) => (f ? n.classes.add(c) : n.classes.delete(c)),
      contains: (c) => n.classes.has(c),
    },
    addEventListener(t, f) { (this.ecoute[t] = this.ecoute[t] || []).push(f); },
    removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    insertBefore(c) { this.children.push(c); return c; },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    focus() {}, blur() {}, remove() {}, closest: () => null,
    querySelector: () => noeud(""), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 700 }),
    getContext: () => new Proxy({}, { get: () => () => ({ addColorStop() {} }) }),
    declencher(t, ev) {
      for (const f of this.ecoute[t] || [])
        f(Object.assign({ target: n, preventDefault() {}, stopPropagation() {} }, ev));
    },
  };
  return n;
}

const noeuds = new Map();
for (const id of ids) noeuds.set(id, noeud(id));
global.document = {
  getElementById: (i) => noeuds.get(i) || null,
  createElement: () => noeud(""), createElementNS: () => noeud(""),
  querySelector: () => noeud(""), querySelectorAll: () => [],
  addEventListener() {}, body: noeud("body"), documentElement: noeud("html"),
};
global.window = { addEventListener() {}, devicePixelRatio: 2,
                  matchMedia: () => ({ matches: false, addListener() {} }) };
global.navigator = { userAgent: "node", maxTouchPoints: 0 };
global.requestAnimationFrame = () => 0;

// Konva n'est sollicité qu'au tracé, pas au chargement : un mannequin suffit ici
const konva = new Proxy(function () {}, {
  get: () => konva, construct: () => new Proxy({}, { get: () => () => konva }), apply: () => konva,
});
global.Konva = konva;
global.ClipperLib = require("../vendor/clipper.js");
require("../src/motif-bank.js");
require("../src/branch-engine.js");
// en navigateur, `window.X = …` crée le global X : on le reproduit
for (const k of Object.keys(global.window)) if (!(k in global)) global[k] = global.window[k];

/* src/geometry.js et src/app.js ne sont pas chargés ici (Konva, canvas, DOM complet) : on
   simule les deux points de contact du générateur, `window.ML` et `window.EditHost`. */
global.ML = {
  unionPolys: (p) => p, offsetPolygon: (p) => [p], silhouetteFromSurface: () => [],
  surfaceDifference: () => [], surfaceDifferenceLocal: (a) => a, absArea: () => 0,
};
global.EditHost = {
  edit: { draft: [], realFill: [], active: false },
  mode: () => "dessin", push() {}, redraw() {}, settings: () => ({}),
};
global.window.ML = global.ML;
global.window.EditHost = global.EditHost;

try {
  vm.runInThisContext(fs.readFileSync(path.join(racine, "src/generator-ui.js"), "utf8"),
                      { filename: "src/generator-ui.js" });
} catch (e) {
  const trace = String(e.stack || "").split("\n")[1] || "";
  fail("src/generator-ui.js plante au chargement — " + e.message + " · " + trace.trim());
}

console.log("OK — " + scripts.length + " scripts chargés (" + notres.length + " du projet), " +
  ids.size + " identifiants HTML, aucun orphelin, générateur exécuté sans erreur");
