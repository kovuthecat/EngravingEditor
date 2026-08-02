/* Contrôle headless de test/branches.html — node test/page-check.js

   `node --check` ne voit que la syntaxe : il laissait passer une constante utilisée avant sa
   déclaration, et la page plantait au chargement sans rien dire. On exécute donc réellement le
   script de la page contre un DOM factice, puis on actionne le sélecteur de motifs.

   Ce n'est PAS un navigateur : rien n'est rendu, rien n'est mesuré à l'écran. Le rendu visuel
   reste à vérifier à l'œil (cf. VALIDATION.md). */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function fail(msg) { throw new Error("ÉCHEC : " + msg); }

const html = fs.readFileSync(path.join(__dirname, "branches.html"), "utf8");

// ── DOM factice : juste assez pour que la page se construise et réagisse ──
function faire(tag, id) {
  const n = {
    tagName: (tag || "div").toUpperCase(), id: id || "", type: "",
    style: {}, dataset: {}, children: [], ecoute: {},
    value: "", textContent: "", _html: "", hidden: false, checked: false,
    width: 1402, height: 1122, clientWidth: 900, clientHeight: 700,
    classes: new Set(),
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; this.children = []; },
    get className() { return [...this.classes].join(" "); },
    set className(v) { this.classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
    classList: {
      add(...c) { c.forEach((x) => n.classes.add(x)); },
      remove(...c) { c.forEach((x) => n.classes.delete(x)); },
      toggle(c, f) { (f === undefined ? n.classes.has(c) : !f) ? n.classes.delete(c) : n.classes.add(c); },
      contains: (c) => n.classes.has(c),
    },
    addEventListener(t, f) { (this.ecoute[t] = this.ecoute[t] || []).push(f); },
    removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { if (k === "id") this.id = v; },
    getAttribute: () => null,
    removeAttribute() {},
    focus() {}, blur() {}, remove() {},
    querySelector: (sel) => faire(sel.replace(/[^a-z]/g, "") || "div"),
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 700 }),
    getContext: () => new Proxy({}, { get: () => () => ({ addColorStop() {} }) }),
    toDataURL: () => "data:,",
    // déclenche les gestionnaires posés par la page
    declencher(t, ev) { for (const f of this.ecoute[t] || []) f(Object.assign({ target: n, preventDefault() {}, stopPropagation() {} }, ev)); },
  };
  return n;
}

const noeuds = new Map();
for (const m of html.matchAll(/id="([^"]+)"/g)) noeuds.set(m[1], faire("div", m[1]));
const parTag = [];
global.document = {
  getElementById: (id) => noeuds.get(id) || null,
  createElement: (t) => { const n = faire(t); parTag.push(n); return n; },
  querySelector: () => faire("div"),
  querySelectorAll: (sel) => (sel.includes("data-for") ? [] : []),
  addEventListener() {}, body: faire("body"), documentElement: faire("html"),
};
global.window = { addEventListener() {}, devicePixelRatio: 2, matchMedia: () => ({ matches: false, addListener() {} }) };
global.navigator = { userAgent: "node", maxTouchPoints: 0 };
global.requestAnimationFrame = () => 0;
global.ClipperLib = require("../vendor/clipper.js");
require("../src/motif-bank.js");
require("../src/branch-engine.js");
// en navigateur, `window.X = …` crée le global X : on le reproduit
for (const k of Object.keys(global.window)) if (!(k in global)) global[k] = global.window[k];

const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
try {
  vm.runInThisContext(js, { filename: "branches.html#script" });
} catch (e) {
  fail(`la page plante au chargement — ${e.message}`);
}

// ── le sélecteur de motifs doit réellement fonctionner ──
const BE = global.BE;
if (!BE || !BE.bank.length) fail("bibliothèque de motifs absente");

const pastille = noeuds.get("pick-nom");
if (!pastille.textContent || pastille.textContent === "—")
  fail("aucun motif courant affiché sur le bouton du sélecteur");

const galerie = noeuds.get("galerie");
noeuds.get("sow-pick").declencher("click");
if (!galerie.classes.has("on")) fail("la galerie ne s'ouvre pas");

const grille = noeuds.get("gal-grille");
const cartes = grille.children.length;
if (cartes < 20) fail(`galerie quasi vide : ${cartes} cartes pour ${BE.bank.length} motifs`);

// une carte = un motif, pas une variante de détail
const groupes = new Set(BE.bank.map((m) => `${m.famille}|${m.forme}|${m.etat}`)).size;
if (cartes !== groupes) fail(`${cartes} cartes pour ${groupes} motifs distincts : les variantes de détail ne sont pas regroupées`);

// chaque carte annonce sa manière de poser — c'est elle qui décide du rendu
const sansPose = grille.children.filter((c) => !/class="pose"/.test(c.innerHTML)).length;
if (sansPose) fail(`${sansPose} cartes n'annoncent pas leur manière de poser`);

// filtre par famille
const fams = noeuds.get("gal-fam").children;
if (fams.length < 4) fail("puces de famille absentes");
fams[1].declencher("click");
const apres = grille.children.length;
if (!apres || apres >= cartes) fail(`le filtre de famille ne filtre pas (${apres} sur ${cartes})`);

// recherche
const q = noeuds.get("gal-q");
fams[0].declencher("click");                       // « Tout »
q.value = "zzzz-introuvable";
q.declencher("input");
// la page écrit alors un message direct dans la grille, sans passer par appendChild
if (grille.children.length || !/gal-vide/.test(grille.innerHTML))
  fail("une recherche sans résultat n'affiche pas de message");
q.value = "";
q.declencher("input");

// choisir une carte referme la galerie et change le motif courant
const avant = pastille.textContent;
let autre = grille.children.find((c) => !c.classes.has("on"));
if (!autre) fail("aucune carte sélectionnable");
autre.declencher("click");
if (galerie.classes.has("on")) fail("choisir une carte ne referme pas la galerie");
if (pastille.textContent === avant) fail("choisir une carte ne change pas le motif courant");

console.log(`OK — page chargée, ${cartes} cartes pour ${BE.bank.length} motifs, ` +
  `filtres et recherche opérants, sélection prise en compte`);
