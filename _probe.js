/* Sonde jetable : exécute la chaîne complète de scripts de l'app contre le DOM factice de
   test/app-check.js, pour trouver ce qui plante au chargement. */
const fs = require("fs"), path = require("path"), vm = require("vm");
process.env.SONDE = "1";
require("./test/app-check.js");   // installe document/window/Konva/ClipperLib et vérifie le reste
