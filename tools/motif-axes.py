#!/usr/bin/env python3
"""motif-axes.py — extrait les AXES (lignes médianes) d'un motif dessiné au trait.

Pourquoi : un motif stocké en contours emporte son épaisseur de trait quand on le
met à l'échelle ; posé petit, il devient impyrogravable. Stocké en axes, l'épaisseur
devient un réglage de l'outil, en millimètres, le même pour les branches, les pistes
et les motifs posés — comme à la main.

Entrée  : PNG au trait, noir sur blanc, épaisseur uniforme, sans aplat.
Sortie  : <nom>.svg      polylignes d'axe (viewBox = boîte du motif, data-anchor)
          <nom>_apercu.png  contrôle visuel (motif en gris, axes en rouge, ancre en bleu)

Usage :
    python tools/motif-axes.py "chemin/vers/motif.png"
    python tools/motif-axes.py "chemin/vers/dossier" -o "dossier/sortie"

Dépendances : numpy, scipy, Pillow (pas de scikit-image).
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

# ─────────────────────────────── binarisation ───────────────────────────────


def load_ink(path, threshold=128):
    """PNG -> masque booléen de l'encre (True = trait), débarrassé des poussières."""
    im = Image.open(path).convert("L")
    ink = np.array(im) < threshold
    if not ink.any():
        raise ValueError("aucune encre détectée (image vide ou fond noir ?)")
    # les rendus IA laissent des points isolés : on jette les composantes minuscules
    lab, n = ndimage.label(ink, structure=np.ones((3, 3)))
    if n > 1:
        sizes = ndimage.sum(ink, lab, range(1, n + 1))
        keep = np.isin(lab, 1 + np.flatnonzero(sizes >= max(20, 0.0002 * ink.sum())))
        ink = keep
    return ink


def collapse_thin(ink, max_gap):
    """Réduit à UN trait ce que le dessin trace en deux.

    Une tige, un pétiole, un fil sont dessinés par leurs deux bords ; à la taille où le
    motif sera posé, ces deux bords se touchent et le détail devient un pâté. On comble
    donc les vides plus étroits que `max_gap` avant d'amincir : le squelette rend alors un
    trait unique, comme le moteur le fait déjà pour une branche trop fine. Les vides larges
    — l'intérieur d'un limbe, d'un chapeau — sont évidemment conservés.
    """
    # 1. vides FERMÉS étroits : l'intérieur d'une tige close, d'un fil
    holes = ndimage.binary_fill_holes(ink) & ~ink
    lab, n = ndimage.label(holes, structure=np.ones((3, 3)))
    fill = np.zeros_like(ink)
    closed = 0
    if n:
        dist = ndimage.distance_transform_edt(holes)
        for i in range(1, n + 1):
            m = lab == i
            if 2.0 * dist[m].max() < max_gap:
                fill |= m
                closed += 1
    out = ink | fill

    # 2. canaux OUVERTS étroits : une tige dessinée par deux lignes qui ne se rejoignent pas
    #    en bas ne délimite aucun vide fermé — le comblement ci-dessus ne la voyait pas. Une
    #    fermeture morphologique, elle, réunit tout ce qui est séparé de moins de max_gap.
    r = max(1, int(round(max_gap / 2)))
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1]
    disc = (yy * yy + xx * xx) <= r * r
    grown = ndimage.binary_closing(out, structure=disc)
    if grown.sum() > out.sum():
        closed += 1
    return grown, closed


def stroke_width(ink):
    """Épaisseur médiane du trait, mesurée sur les séries horizontales d'encre."""
    runs = []
    for y in range(0, ink.shape[0], 3):
        row = ink[y]
        x = 0
        while x < row.size:
            if row[x]:
                s = x
                while x < row.size and row[x]:
                    x += 1
                if 1 <= x - s <= 80:
                    runs.append(x - s)
            else:
                x += 1
    return float(np.median(runs)) if runs else 3.0


def solid_blobs(ink, sw):
    """Aplats pleins -> cercles, et masque nettoyé.

    L'amincissement cherche des lignes MÉDIANES : un disque plein n'en a pas, il se réduit à
    un point et disparaît. Or les yeux et la bouche d'un kodama sont des aplats — sans eux,
    le personnage n'a plus de visage. On repère donc les zones nettement plus épaisses que le
    trait, on les rend comme un CERCLE (ce qu'un pyrograveur remplit ensuite à la main), et on
    les retire avant l'amincissement.

    Rend (liste de contours de cercles, encre sans les aplats)."""
    dist = ndimage.distance_transform_edt(ink)
    gros = dist > sw * 1.35                       # nettement plus épais qu'un trait
    if not gros.any():
        return [], ink
    lab, n = ndimage.label(gros)
    cercles, aplats = [], np.zeros_like(ink)
    for i in range(1, n + 1):
        z = lab == i
        r = float(dist[z].max())
        if r < sw * 1.5 or int(z.sum()) < 6:
            continue
        ys, xs = np.nonzero(z)
        cy, cx = float(ys.mean()), float(xs.mean())
        # la tache complète, pas seulement son cœur épais : on la reprend par croissance
        plein = ndimage.binary_dilation(z, np.ones((3, 3)), iterations=int(r) + 1) & ink
        pl = ndimage.label(plein)[0]
        plein = pl == pl[int(round(cy)), int(round(cx))]
        aire = int(plein.sum())
        pys, pxs = np.nonzero(plein)
        h, w = pys.max() - pys.min() + 1, pxs.max() - pxs.min() + 1
        # une tache est COMPACTE : sinon c'est une jonction de traits, pas un aplat
        if aire / (h * w) < 0.55 or max(h, w) / max(1, min(h, w)) > 2.2:
            continue
        aplats |= plein
        rr = (aire / np.pi) ** 0.5
        cercles.append([(cx + rr * np.cos(a), cy + rr * np.sin(a))
                        for a in np.linspace(0, 2 * np.pi, 20)])
    return cercles, ink & ~aplats


# ─────────────────────────────── amincissement ───────────────────────────────


def _neighbours(p):
    """Les 8 voisins, dans l'ordre horaire P2(N) … P9(NO), pour un tableau padé."""
    return (p[0:-2, 1:-1], p[0:-2, 2:], p[1:-1, 2:], p[2:, 2:],
            p[2:, 1:-1], p[2:, 0:-2], p[1:-1, 0:-2], p[0:-2, 0:-2])


def skeletonize(ink, max_iter=200):
    """Amincissement Zhang-Suen, vectorisé numpy (scikit-image n'est pas installé)."""
    img = ink.astype(np.uint8)
    for _ in range(max_iter):
        changed = False
        for step in (0, 1):
            p = np.pad(img, 1)
            P2, P3, P4, P5, P6, P7, P8, P9 = _neighbours(p)
            B = P2 + P3 + P4 + P5 + P6 + P7 + P8 + P9
            seq = [P2, P3, P4, P5, P6, P7, P8, P9, P2]
            A = sum(((seq[i] == 0) & (seq[i + 1] == 1)).astype(np.uint8) for i in range(8))
            if step == 0:
                c = (P2 * P4 * P6 == 0) & (P4 * P6 * P8 == 0)
            else:
                c = (P2 * P4 * P8 == 0) & (P2 * P6 * P8 == 0)
            kill = (img == 1) & (B >= 2) & (B <= 6) & (A == 1) & c
            if kill.any():
                img[kill] = 0
                changed = True
        if not changed:
            break
    return img.astype(bool)


def degrees(skel):
    """Nombre de voisins de chaque pixel du squelette (8-connexité)."""
    k = np.ones((3, 3), dtype=np.uint8)
    k[1, 1] = 0
    return ndimage.convolve(skel.astype(np.uint8), k, mode="constant") * skel


def crossings(skel):
    """Nombre de croisements : 1 = extrémité, 2 = simple passage, >=3 = fourche.

    Le simple comptage de voisins ne convient pas : sur une diagonale en escalier un
    pixel a 3 ou 4 voisins tout en restant un passage. Le nombre de transitions 0->1
    autour du voisinage, lui, ne compte que les brins réellement distincts.
    """
    p = np.pad(skel.astype(np.uint8), 1)
    P = _neighbours(p)
    seq = list(P) + [P[0]]
    A = sum(((seq[i] == 0) & (seq[i + 1] == 1)).astype(np.uint8) for i in range(8))
    return A * skel


def prune(skel, min_len):
    """Supprime les barbules — les brins courts qui partent d'une fourche et meurent
    aussitôt. L'amincissement en fabrique à chaque angle. Un brin court qui ne touche
    aucune fourche est un vrai motif (une nervure isolée) : on le garde."""
    for _ in range(4):
        A = crossings(skel)
        removed = False
        for e in [tuple(p) for p in np.argwhere((degrees(skel) == 1) & skel)]:
            if not skel[e]:
                continue
            path, prev, cur, hit = [e], None, e, False
            for _ in range(int(min_len) + 1):
                nb = [q for q in neighbours_of(skel, *cur) if q != prev]
                if prev is not None:
                    nb = [q for q in nb if not _adjacent(q, prev)] or nb
                if not nb:
                    break
                prev, cur = cur, nb[0]
                if A[cur] >= 3:
                    hit = True
                    break
                path.append(cur)
            if hit and len(path) <= min_len:
                for p in path:
                    skel[p] = False
                removed = True
        if not removed:
            break
    return skel


# ─────────────────────────────── vectorisation ───────────────────────────────


def neighbours_of(skel, y, x):
    out = []
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if (dy or dx) and 0 <= y + dy < skel.shape[0] and 0 <= x + dx < skel.shape[1] \
                    and skel[y + dy, x + dx]:
                out.append((y + dy, x + dx))
    return out


def _adjacent(a, b):
    return abs(a[0] - b[0]) <= 1 and abs(a[1] - b[1]) <= 1


def _walk_chain(comp, start):
    """Parcourt une composante en chaîne. En escalier, un pixel voit aussi les voisins
    du précédent : on écarte ceux-là, sinon le parcours fait demi-tour sur lui-même."""
    chain = [start]
    visited = {start}
    prev = None
    cur = start
    while True:
        nb = [q for q in ((cur[0] + dy, cur[1] + dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx)
              if q in comp and q not in visited]
        if prev is not None:
            fwd = [q for q in nb if not _adjacent(q, prev)]
            nb = fwd or nb
        if not nb:
            break
        nb.sort(key=lambda q: abs(q[0] - cur[0]) + abs(q[1] - cur[1]))  # orthogonal d'abord
        prev, cur = cur, nb[0]
        visited.add(cur)
        chain.append(cur)
    return chain


def trace_paths(skel):
    """Squelette -> polylignes, coupées aux fourches.

    Les fourches forment de petits amas de pixels, pas un point unique : on les retire
    du squelette, on suit les chaînes restantes, puis on raccroche chaque bout au
    barycentre de l'amas voisin — les polylignes se rejoignent ainsi vraiment.
    """
    A = crossings(skel)
    junc = skel & (A >= 3)
    lab, n = ndimage.label(junc, structure=np.ones((3, 3)))
    reps = {}
    if n:
        for i, (cy, cx) in enumerate(ndimage.center_of_mass(junc, lab, range(1, n + 1)), start=1):
            reps[i] = (float(cy), float(cx))

    chains = skel & ~junc
    clab, cn = ndimage.label(chains, structure=np.ones((3, 3)))
    paths = []
    for i in range(1, cn + 1):
        remaining = set(map(tuple, np.argwhere(clab == i)))
        # On vide la composante par parcours successifs. Une seule passe supposerait qu'elle
        # est une chaîne simple ; dès qu'une fourche échappe à la détection, tout ce qui suit
        # serait perdu sans un mot (c'est ainsi qu'une spirale entière avait disparu).
        while len(remaining) >= 2:
            ends = [p for p in remaining
                    if sum(1 for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                           if (dy or dx) and (p[0] + dy, p[1] + dx) in remaining) <= 1]
            chain = _walk_chain(remaining, min(ends) if ends else min(remaining))
            remaining -= set(chain)
            if len(chain) < 2:
                continue
            pts = [(float(y), float(x)) for y, x in chain]

            # Boucle = le parcours revient TOUCHER son point de départ. Déduire la boucle de
            # l'absence d'extrémité était faux : en escalier, un vrai bout de ligne a deux
            # voisins, la chaîne passait pour fermée et se refermait par un trait d'un bout
            # à l'autre du motif.
            loop = len(chain) > 3 and _adjacent(chain[0], chain[-1])
            if loop:
                pts.append(pts[0])
            else:
                # raccord aux amas de fourche voisins, à chaque extrémité
                for idx, end in ((0, chain[0]), (-1, chain[-1])):
                    touching = {lab[end[0] + dy, end[1] + dx]
                                for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                                if 0 <= end[0] + dy < skel.shape[0] and 0 <= end[1] + dx < skel.shape[1]
                                and lab[end[0] + dy, end[1] + dx] > 0}
                    if touching:
                        r = reps[sorted(touching)[0]]
                        if idx == 0:
                            pts.insert(0, r)
                        else:
                            pts.append(r)
            paths.append(pts)
    return paths


def simplify(pts, tol):
    """Douglas-Peucker, avec le cas des polylignes FERMÉES.

    Sur une boucle, premier et dernier point sont confondus : le segment de référence
    de l'algorithme est nul, toutes les distances valent zéro et le contour entier se
    réduit à deux points. On coupe donc la boucle en deux arcs au point le plus
    éloigné du départ avant de simplifier.
    """
    if len(pts) > 3 and abs(pts[0][0] - pts[-1][0]) < 1e-9 and abs(pts[0][1] - pts[-1][1]) < 1e-9:
        base = pts[:-1]
        far = max(range(len(base)),
                  key=lambda k: (base[k][0] - base[0][0]) ** 2 + (base[k][1] - base[0][1]) ** 2)
        if far < 1:
            return pts
        a = _dp(base[:far + 1], tol)
        b = _dp(base[far:] + [base[0]], tol)
        return a[:-1] + b
    return _dp(pts, tol)


def _dp(pts, tol):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i0, i1 = stack.pop()
        ax, ay = pts[i0]
        bx, by = pts[i1]
        dx, dy = bx - ax, by - ay
        L = (dx * dx + dy * dy) ** 0.5 or 1.0
        far, fd = -1, tol
        for i in range(i0 + 1, i1):
            d = abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L
            if d > fd:
                far, fd = i, d
        if far > 0:
            keep[far] = True
            stack.append((i0, far))
            stack.append((far, i1))
    return [p for p, k in zip(pts, keep) if k]


# ─────────────────────────────── sortie ───────────────────────────────


def find_anchor(skel, sw, side, offset):
    """Point d'attache du motif : le bord par lequel il se greffe sur une branche.

    Ces dessins sont faits de contours FERMÉS — la tige n'a pas d'extrémité libre, donc
    chercher un bout de ligne renvoyait n'importe où (le cœur d'une spirale, une fois).
    On prend le milieu de la matière présente sur le bord choisi. `bottom` convient à ce
    qui pousse vers le haut (feuille, fleur, vrille), `top` à ce qui descend (racines).
    """
    x0, y0 = offset
    sy, sx = np.where(skel)
    band = max(2.0, sw * 0.5)
    if side == "top":
        m = sy.min()
        return (float(np.median(sx[sy <= m + band]) - x0), float(m - y0))
    if side == "left":
        m = sx.min()
        return (float(m - x0), float(np.median(sy[sx <= m + band]) - y0))
    if side == "right":
        m = sx.max()
        return (float(m - x0), float(np.median(sy[sx >= m - band]) - y0))
    m = sy.max()
    return (float(np.median(sx[sy >= m - band]) - x0), float(m - y0))


def write_svg(path, polylines, size, anchor, source):
    w, h = size
    d = []
    for pts in polylines:
        d.append("M" + "L".join(f"{x:.2f},{y:.2f}" for x, y in pts))
    body = "\n    ".join(f'<path d="{p}"/>' for p in d)
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.2f} {h:.2f}"\n'
        f'     data-anchor="{anchor[0]:.2f},{anchor[1]:.2f}" data-source="{source}">\n'
        f'  <!-- Axes du motif. L\'epaisseur est appliquee par l\'outil, en mm : le\n'
        f'       stroke-width ci-dessous n\'est qu\'un rendu de controle. -->\n'
        f'  <g fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\n'
        f"    {body}\n  </g>\n</svg>\n"
    )
    open(path, "w", encoding="utf-8").write(svg)


def write_preview(path, ink, polylines, offset, anchor, scale=1.0):
    ox, oy = offset
    h, w = ink.shape
    im = Image.new("RGB", (w, h), "white")
    grey = Image.fromarray(np.where(ink, 205, 255).astype(np.uint8)).convert("RGB")
    im.paste(grey)
    dr = ImageDraw.Draw(im)
    for pts in polylines:
        if len(pts) >= 2:
            dr.line([(x + ox, y + oy) for x, y in pts], fill=(220, 30, 30), width=2)
    for pts in polylines:
        for x, y in (pts[0], pts[-1]):
            dr.ellipse([x + ox - 4, y + oy - 4, x + ox + 4, y + oy + 4], outline=(220, 30, 30))
    ax, ay = anchor[0] + ox, anchor[1] + oy
    dr.ellipse([ax - 11, ay - 11, ax + 11, ay + 11], outline=(30, 90, 220), width=3)
    im.save(path)


# ─────────────────────────────── pipeline ───────────────────────────────


def process(src, outdir, tol_frac=0.004, side="bottom", collapse=0.04, verbose=True):
    name = os.path.splitext(os.path.basename(src))[0]
    ink = load_ink(src)

    ys, xs = np.where(ink)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    # ORDRE IMPORTANT. Les aplats se cherchent sur l'encre D'ORIGINE, avant `collapse_thin` :
    # celui-ci fusionne les traits voisins, ce qui fabrique de fausses taches massives sur un
    # dessin dense — le masque cornu hybride d'un korok y perdait tout son visage, converti en
    # douze cercles. Une vraie tache est pleine dès le dessin. 
    cercles, ink = solid_blobs(ink, stroke_width(ink))

    ink, merged = collapse_thin(ink, collapse * max(y1 - y0, x1 - x0))
    sw = stroke_width(ink)

    skel = skeletonize(ink)
    skel = prune(skel, max(4, sw * 1.6))

    paths = trace_paths(skel)
    tol = max(0.6, tol_frac * max(y1 - y0, x1 - x0))
    polys = []
    for p in paths:
        pts = [(float(x), float(y)) for y, x in p]          # (ligne,colonne) -> (x,y)
        pts = simplify(pts, tol)
        if len(pts) >= 2:
            polys.append([(x - x0, y - y0) for x, y in pts])  # recalé sur la boîte du motif

    for c in cercles:
        polys.append([(x - x0, y - y0) for x, y in c])

    anchor = find_anchor(skel, sw, side, (x0, y0))

    size = (float(x1 - x0), float(y1 - y0))
    os.makedirs(outdir, exist_ok=True)
    svg = os.path.join(outdir, name + ".svg")
    prev = os.path.join(outdir, name + "_apercu.png")
    write_svg(svg, polys, size, anchor, os.path.basename(src))
    write_preview(prev, ink, polys, (x0, y0), anchor)

    if verbose:
        npts = sum(len(p) for p in polys)
        print(f"{name:28s} trait {sw:4.1f}px · {len(polys):3d} axes · {npts:5d} points · "
              f"{merged} double(s) fondu(s) · {len(cercles)} aplat(s) en cercle · "
              f"ancre ({anchor[0]:.0f},{anchor[1]:.0f})")
    return svg


def main():
    ap = argparse.ArgumentParser(description="Extrait les axes d'un motif dessiné au trait.")
    ap.add_argument("source", help="fichier PNG ou dossier de PNG")
    ap.add_argument("-o", "--out", help="dossier de sortie (défaut : à côté de la source)")
    ap.add_argument("--tol", type=float, default=0.004,
                    help="tolérance de simplification, en fraction de la taille du motif (défaut 0.004)")
    ap.add_argument("--anchor", choices=("bottom", "top", "left", "right"), default="bottom",
                    help="bord par lequel le motif se greffe (défaut bottom ; top pour des racines)")
    ap.add_argument("--collapse", type=float, default=0.04,
                    help="fond en UN trait les traits doubles plus étroits que cette fraction du motif")
    a = ap.parse_args()

    if os.path.isdir(a.source):
        files = sorted(f for f in os.listdir(a.source) if f.lower().endswith((".png", ".jpg", ".jpeg")))
        if not files:
            sys.exit("aucune image dans ce dossier")
        outdir = a.out or os.path.join(a.source, "axes")
        for f in files:
            try:
                process(os.path.join(a.source, f), outdir, a.tol, a.anchor, a.collapse)
            except Exception as e:
                print(f"{f:28s} ÉCHEC : {e}")
    else:
        outdir = a.out or os.path.join(os.path.dirname(os.path.abspath(a.source)), "axes")
        process(a.source, outdir, a.tol, a.anchor, a.collapse)


if __name__ == "__main__":
    main()
