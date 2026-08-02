#!/usr/bin/env python3
"""build-motif-bank.py — empaquette les axes de motifs dans un fichier JS embarqué.

La page tourne en file:// : elle ne peut pas lire des fichiers du disque. Même schéma
que tools/build-builtin-motifs.js pour la bibliothèque de base — on inline.

    python tools/build-motif-bank.py            # reference/**/axes/*.svg -> test/motif-bank.js

Le nom du fichier porte le classement : "Feuille ovale organique.svg" -> famille feuille,
forme ovale, état organique. Les états reconnus sont organique / hybride / electronique.
"""
import glob
import json
import os
import re
import sys
import unicodedata

ETATS = ("organique", "hybride", "electronique")
# « classique » se dit mieux que « organique » pour un personnage — mais l'axe reste le même
# (non électronique), et ouvrir un quatrième vocabulaire pour une seule famille brouillerait
# les filtres du sélecteur. Simple synonyme, donc.
SYNONYMES = {"classique": "organique", "nature": "organique", "pcb": "electronique"}
# Niveau de détail : un même motif existe en version détaillée et en version nue. À petite
# taille, la version détaillée devient un pâté ; l'outil choisit celle qui tient.
DETAILS = ("nue", "simple")
# Les pièces électroniques forment UNE famille : sans ça le sélecteur affiche cinq familles
# d'un ou deux motifs (bobine, condensateur, puce…) au lieu d'un onglet « composant ».
PIECES = ("resistance", "condensateur", "puce", "tube", "bobine", "diode", "quartz", "led")

# MANIÈRE DE POSER. Un motif ne se pose pas n'importe comment : une résistance a une patte
# à chaque bout et s'insère DANS la ligne, une puce est un nœud où la ligne aboutit, une
# vrille termine une course. Les semer tous en oblique comme des feuilles, c'est ce qui
# rendait le décor incohérent (relevé sur branches(11).svg).
#   laterale — au bord de l'axe, angle libre : ce qui pousse sur le côté
#   montee   — au bord de l'axe, DEBOUT dessus : ce qui est planté sur la ligne
#   enligne  — centré sur l'axe, dans son sens : ce qui a une patte à chaque bout
#   noeud    — centré sur l'axe : ce sur quoi la ligne aboutit
#   terminale— au BOUT de l'axe, dans son prolongement
POSES = {"feuille": "laterale", "fleur": "laterale",
         "champignon": "montee", "vrille": "terminale", "radicelle": "terminale",
         # les personnages se tiennent DEBOUT sur le bois, jamais couchés le long
         "kodama": "montee", "korok": "montee"}
# Kodama et korok sont deux peuples du même décor : une seule famille au sélecteur, le
# peuple devient la forme. Ce sont les seuls personnages du projet.
PERSONNAGES = ("kodama", "korok")
POSES_PIECE = {"resistance": "enligne", "bobine": "enligne", "puce": "noeud",
               "condensateur electrolytique": "enligne", "condensateur ceramique": "montee",
               "tube": "montee"}


def pose_de(famille, forme):
    if famille == "personnage":
        return "montee"
    if famille != "composant":
        return POSES.get(famille, "laterale")
    for cle, p in POSES_PIECE.items():
        if forme.startswith(cle):
            return p
    return "enligne"
PITCH_MM = 1.2  # trait de détail 0,6 mm + 0,6 mm de blanc
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def sans_accent(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def classify(stem):
    """'Feuille ovale organique nue' -> (feuille, ovale, organique, nue).

    Tolère les fautes d'accent, les états manquants (classé 'hybride' par défaut) et
    l'absence de niveau de détail (classé 'detaille')."""
    mots = [m for m in re.split(r"[\s_-]+", sans_accent(stem).lower()) if m]
    detail = next((m for m in reversed(mots) if m in DETAILS), None)
    if detail:
        mots.remove(detail)
    etat = next((m for m in reversed(mots) if m in ETATS or m in SYNONYMES), None)
    if etat:
        mots.remove(etat)
        etat = SYNONYMES.get(etat, etat)
    famille = mots[0] if mots else "divers"
    forme = " ".join(mots[1:]) or "base"
    if famille in PIECES:
        famille, forme = "composant", " ".join(mots) if len(mots) > 1 else mots[0]
    elif famille in PERSONNAGES:
        famille, forme = "personnage", " ".join(mots) if len(mots) > 1 else mots[0]
    return famille, forme, etat or "hybride", detail or "detaille"


def parse_svg(path):
    s = open(path, encoding="utf-8").read()
    vb = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', s)
    an = re.search(r'data-anchor="([-\d.]+),([-\d.]+)"', s)
    if not vb:
        raise ValueError("viewBox absent")
    w, h = float(vb.group(1)), float(vb.group(2))
    anchor = [float(an.group(1)), float(an.group(2))] if an else [w / 2, h]
    paths = []
    for d in re.findall(r'<path d="([^"]+)"', s):
        pts = []
        for p in d.lstrip("M").split("L"):
            x, _, y = p.partition(",")
            if y:
                pts.append([round(float(x), 1), round(float(y), 1)])
        if len(pts) >= 2:
            paths.append(pts)
    return w, h, anchor, paths


def tightest_gap(paths, trim):
    """Plus petit écart entre deux traits du motif qui courent côte à côte, en px source.

    Détermine la taille minimale à laquelle le motif reste pyrogravable : en dessous, ses
    traits internes se rejoignent et il vire au pâté noir.

    Deux précautions, sans quoi la mesure vaut zéro partout : les chemins se REJOIGNENT aux
    fourches (distance nulle par construction), donc on rogne les abords des extrémités ; et
    deux points voisins d'un même trait ne sont pas deux traits, donc on saute le long de la
    courbe avant de comparer.
    """
    # Densification préalable : après simplification un trait ne compte parfois qu'une
    # poignée de points, et le centile ci-dessous dégénère alors en simple minimum — donc
    # en pointe de feuille, qui n'est pas un défaut.
    dense = []
    for p in paths:
        d = [p[0]]
        for k in range(1, len(p)):
            a, b = p[k - 1], p[k]
            L = ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5
            for j in range(1, max(1, int(L / 2.0)) + 1):
                t = j / max(1, int(L / 2.0))
                d.append([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
        dense.append(d)
    paths = dense

    kept = []
    for i, p in enumerate(paths):
        # abscisse curviligne, pour rogner `trim` px à chaque bout
        s, acc = [0.0], 0.0
        for k in range(1, len(p)):
            acc += ((p[k][0] - p[k - 1][0]) ** 2 + (p[k][1] - p[k - 1][1]) ** 2) ** 0.5
            s.append(acc)
        total = acc
        if total < 2.5 * trim:
            continue
        for k, q in enumerate(p):
            if trim <= s[k] <= total - trim:
                a = p[max(0, k - 3)]
                b = p[min(len(p) - 1, k + 3)]
                d = ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5 or 1.0
                kept.append((q[0], q[1], i, s[k], (b[0] - a[0]) / d, (b[1] - a[1]) / d))
    if len(kept) < 2:
        return None
    # Distance de chaque point au trait voisin le plus proche, puis 5ᵉ centile — et non le
    # minimum : une pointe de feuille fait converger deux traits en un V, ce qui se pyrogravé
    # très bien. Le minimum brut ne mesurerait que ça. Le centile décrit la densité réelle.
    near = []
    for a in range(len(kept)):
        xa, ya, pa, sa, ua, va = kept[a]
        best = float("inf")
        for b in range(len(kept)):
            if a == b:
                continue
            xb, yb, pb, sb, ub, vb = kept[b]
            if pa == pb and abs(sa - sb) < 3 * trim:
                continue
            # Deux traits qui CONVERGENT forment un V, et un V se pyrogravé : seuls deux
            # traits qui courent côte à côte se soudent. On écarte donc les paires dont les
            # directions divergent de plus de 25 degrés — pointe de feuille, fourche, croisement.
            if abs(ua * vb - va * ub) > 0.42:
                continue
            d = (xa - xb) ** 2 + (ya - yb) ** 2
            if d < best:
                best = d
        if best < float("inf"):
            near.append(best ** 0.5)
    if not near:
        return None
    near.sort()
    return round(near[max(0, int(0.05 * len(near)))], 2)


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "reference")
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "src", "motif-bank.js")

    files = sorted(glob.glob(os.path.join(src, "**", "axes", "*.svg"), recursive=True))
    if not files:
        sys.exit(f"aucun SVG d'axes sous {src} (attendu : <dossier>/axes/*.svg)")

    bank = []
    for f in files:
        stem = os.path.splitext(os.path.basename(f))[0]
        try:
            w, h, anchor, paths = parse_svg(f)
        except Exception as e:
            print(f"  ignoré : {stem} ({e})")
            continue
        famille, forme, etat, detail = classify(stem)
        gap = tightest_gap(paths, max(6.0, 0.02 * max(w, h)))
        bank.append({
            "id": sans_accent(stem).lower().replace(" ", "-"),
            "nom": stem, "famille": famille, "forme": forme, "etat": etat, "detail": detail,
            "pose": pose_de(famille, forme),
            "w": round(w, 1), "h": round(h, 1), "gap": gap,
            "anchor": [round(anchor[0], 1), round(anchor[1], 1)],
            "paths": paths,
        })
        # Taille minimale de pose : il faut PITCH mm entre deux traits voisins, soit le
        # trait de détail plus autant de blanc. À 0,6 mm de pointe fine, PITCH = 1,2 mm.
        mini = f"{PITCH_MM * h / gap:5.0f} mm mini" if gap else "  écart inconnu"
        print(f"  {famille:10s} {forme:22s} {etat:13s} {pose_de(famille, forme):9s} · écart {gap or 0:5.1f}px · {mini}")

    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write("/* Généré par tools/build-motif-bank.py — ne pas éditer à la main. */\n")
        fh.write("window.MOTIF_BANK = ")
        json.dump(bank, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")
    print(f"{len(bank)} motifs -> {os.path.relpath(out, ROOT)} ({os.path.getsize(out) // 1024} Ko)")


if __name__ == "__main__":
    main()
