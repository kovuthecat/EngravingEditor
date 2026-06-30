// Scanne exemple motif/Personnages et exemple motif/Symboles, écrit src/builtin-motifs.js.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const SOURCES = [
  { dir: "exemple motif/Personnages", role: "PERSONNAGE", prefix: "Personnages" },
  { dir: "exemple motif/Symboles", role: "SYMBOLE", prefix: "Symboles" },
];

const entries = [];
const counts = {};

for (const src of SOURCES) {
  const dirPath = path.join(root, src.dir);
  const files = fs
    .readdirSync(dirPath)
    .filter((f) => /\.svg$/i.test(f))
    .sort((a, b) => a.localeCompare(b));
  counts[src.role] = (counts[src.role] || 0) + files.length;
  for (const file of files) {
    const base = file.replace(/\.svg$/i, "");
    const svg = fs.readFileSync(path.join(dirPath, file), "utf8");
    entries.push({ id: "b:" + src.prefix + "/" + base, name: base, role: src.role, svg });
  }
}

const outPath = path.join(root, "src", "builtin-motifs.js");
const content =
  "// Généré par tools/build-builtin-motifs.js — NE PAS ÉDITER À LA MAIN.\nwindow.ML_BUILTIN_MOTIFS = " +
  JSON.stringify(entries) +
  ";\n";
fs.writeFileSync(outPath, content, "utf8");

const sizeMo = (Buffer.byteLength(content, "utf8") / (1024 * 1024)).toFixed(2);
const summary = Object.entries(counts)
  .map(([role, n]) => `${n} ${role}`)
  .join(", ");
console.log(`${summary} — ${entries.length} entrées — ${outPath} (${sizeMo} Mo)`);
