// Regénère src/builtin-contour.js à partir du fichier source dans
// "exemple motif/countour et decor/". Même convention que
// tools/build-builtin-motifs.js : données embarquées en JS classic-script,
// pas de fetch() (doit marcher en file://).
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "exemple motif", "countour et decor", "Guitare sur fond blanc creusée.svg");
const OUT = path.join(ROOT, "src", "builtin-contour.js");

const svg = fs.readFileSync(SRC, "utf8");
const data = { svg, dimLong: 440, dimShort: 325 };

const out = "// Généré par tools/build-builtin-contour.js — NE PAS ÉDITER À LA MAIN.\n"
  + "window.ML_BUILTIN_CONTOUR = " + JSON.stringify(data) + ";\n";
fs.writeFileSync(OUT, out, "utf8");
console.log(`Contour par défaut -> ${OUT} (${(out.length / 1024).toFixed(0)} Ko)`);
