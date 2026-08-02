# Rendu de contrôle du prototype de branches (sans navigateur).
# Lit test/branch-proto.json (produit par node test/branch-proto-check.js) et écrit un PNG.
# Suréchantillonne x3 puis réduit, faute d'anticrénelage dans PIL.
import json, sys, os
from PIL import Image, ImageDraw

here = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(here, "branch-proto.json")))
K = 3
W, H = data["W"] * K, data["H"] * K
ink = max(1, round(data["ink"] * K))

im = Image.new("L", (W, H), 255)
dr = ImageDraw.Draw(im)

def scale(pts):
    return [(p[0] * K, p[1] * K) for p in pts]

for t in data["trees"]:
    for poly in t["silhouette"]:                           # occlusion « autocollant »
        if len(poly) >= 3:
            dr.polygon(scale(poly), fill=255)
    for poly in t["outline"]:                              # rubans : le contour EST l'encre
        if len(poly) >= 3:
            dr.line(scale(poly) + [scale(poly)[0]], fill=0, width=ink, joint="curve")
    for line in t["lines"]:                                # écorce + brindilles (trait simple)
        if len(line) >= 2:
            dr.line(scale(line), fill=0, width=ink, joint="curve")

out = os.path.join(here, "branch-proto.png")
im.resize((data["W"], data["H"]), Image.LANCZOS).save(out)
print("écrit", out)
