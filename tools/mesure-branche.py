#!/usr/bin/env python3
"""mesure-branche.py — extrait les paramètres de style d'une branche de référence.

Remplace le réglage à l'œil : sur un dessin de branche isolée, on mesure la loi
d'effilement réelle, l'irrégularité du contour, et, sur une fourche, le rapport de
largeur mère/fille et le rayon du congé d'aisselle.

Principe : le trait dessine un contour fermé ; en bouchant les trous on récupère le
CORPS de la branche, dont la carte de distance donne la demi-largeur en tout point.
Le squelette du corps sert d'axe, et l'abscisse curviligne le long de cet axe donne
le profil de largeur.

    python tools/mesure-branche.py "reference/branche/Branche ref troncon.png"
    python tools/mesure-branche.py "reference/branche"        # tout le dossier

Dépendances : numpy, scipy, Pillow.
"""
import argparse
import glob
import os

import numpy as np
from scipy import ndimage

import importlib.util

_spec = importlib.util.spec_from_file_location(
    "motif_axes", os.path.join(os.path.dirname(os.path.abspath(__file__)), "motif-axes.py"))
_ma = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ma)


def body(ink):
    """Corps plein de la branche : le contour dessiné, trous bouchés."""
    return ndimage.binary_fill_holes(ink)


def main_path(skel):
    """Le plus long chemin du squelette, du pied vers la pointe."""
    paths = _ma.trace_paths(skel)
    if not paths:
        return []
    def length(p):
        return sum(((p[i][0] - p[i - 1][0]) ** 2 + (p[i][1] - p[i - 1][1]) ** 2) ** 0.5
                   for i in range(1, len(p)))
    return max(paths, key=length)


def profile(path, solid):
    """Le long de l'axe : abscisse curviligne, et les DEUX demi-largeurs séparément.

    Lues par lancer de rayon depuis l'axe jusqu'à sortir du corps, et non par carte de
    distance : celle-ci renvoie le cercle inscrit, donc la même valeur des deux côtés,
    et son bruit de quantification (±0,5 px) noie l'irrégularité qu'on cherche à mesurer.
    Le moteur, lui, modélise un bord gauche et un bord droit indépendants — on mesure
    donc la même chose que ce qu'il fabrique.
    """
    h, w_ = solid.shape
    s, L, R, acc = [], [], [], 0.0
    n = len(path)
    for i, (y, x) in enumerate(path):
        if i:
            acc += ((y - path[i - 1][0]) ** 2 + (x - path[i - 1][1]) ** 2) ** 0.5
        a = path[max(0, i - 4)]
        b = path[min(n - 1, i + 4)]
        dy, dx = b[0] - a[0], b[1] - a[1]
        norm = (dy * dy + dx * dx) ** 0.5 or 1.0
        ny, nx = -dx / norm, dy / norm            # normale à l'axe
        out = []
        for sgn in (1, -1):
            d = 0.0
            while d < 600:
                yy, xx = int(round(y + sgn * ny * d)), int(round(x + sgn * nx * d))
                if not (0 <= yy < h and 0 <= xx < w_) or not solid[yy, xx]:
                    break
                d += 0.5
            out.append(d)
        s.append(acc)
        L.append(out[0])
        R.append(out[1])
    return np.array(s), np.array(L), np.array(R)


def smooth_over(v, s, span_px):
    """Lissage à fenêtre exprimée en PIXELS (le pas d'échantillonnage varie)."""
    out = np.empty_like(v)
    for i in range(len(v)):
        m = np.abs(s - s[i]) <= span_px / 2
        out[i] = v[m].mean()
    return out


def fit_taper(s, w):
    """Ajuste w(u) = wmin + (w0 - wmin)·(1-u)^k et renvoie (k, w0, wmin, erreur %)."""
    if len(s) < 8:
        return None
    u = s / s[-1]
    # bouts écartés : la pointe et la coupe du pied faussent les extrêmes
    m = (u > 0.04) & (u < 0.96)
    u, wm = u[m], w[m]
    if len(u) < 8:
        return None
    w0, wmin = float(np.percentile(wm, 98)), float(np.percentile(wm, 2))
    best = None
    for k in np.arange(0.15, 3.01, 0.05):
        pred = wmin + (w0 - wmin) * np.power(np.clip(1 - u, 0, 1), k)
        err = float(np.mean(np.abs(pred - wm)) / max(1e-6, np.mean(wm)))
        if best is None or err < best[1]:
            best = (float(k), err)
    return best[0], w0, wmin, best[1] * 100


def wobble(s, half, width):
    """Irrégularité d'UN bord : écart au bord lissé, rapporté à la largeur locale.

    La fenêtre de lissage suit la largeur de la branche : c'est à cette échelle que le
    dessinateur ondule, pas à une longueur fixe.
    """
    if len(half) < 30:
        return None
    span = max(20.0, 2.5 * float(np.median(width)))
    base = smooth_over(half, s, span)
    m = (s > s[0] + span) & (s < s[-1] - span)      # bords écartés : le lissage y triche
    d, wl = (half - base)[m], width[m]
    if len(d) < 20 or wl.mean() <= 0:
        return None
    amp = float(np.mean(np.abs(d)) / wl.mean())
    sign = np.sign(d)
    cross = np.where(np.diff(sign) != 0)[0]
    per = float(2 * np.mean(np.diff(s[m][cross]))) if len(cross) > 3 else float("nan")
    return amp, per, float(wl.mean())


def bark(ink, solid, width_med):
    """Les marques intérieures : combien, quelle longueur, à quelle distance du bord.

    L'encre moins le contour du corps donne exactement ce qui est dessiné DEDANS.
    """
    edge = solid & ~ndimage.binary_erosion(solid, np.ones((3, 3)), iterations=3)
    inside = ink & ~ndimage.binary_dilation(edge, np.ones((3, 3)), iterations=2)
    lab, n = ndimage.label(inside, structure=np.ones((3, 3)))
    if not n:
        return None
    bg = ndimage.distance_transform_edt(~(solid & ~ndimage.binary_erosion(solid, np.ones((3, 3)))))
    marks = []
    for i in range(1, n + 1):
        pts = np.argwhere(lab == i)
        if len(pts) < 12:
            continue
        span = float(np.hypot(*(pts.max(0) - pts.min(0))))
        gap = float(np.median([bg[y, x] for y, x in pts]))   # distance au bord du corps
        marks.append((span, gap, len(pts)))
    if not marks:
        return None
    spans = np.array([m[0] for m in marks])
    gaps = np.array([m[1] for m in marks])
    return len(marks), float(np.median(spans)), float(np.median(gaps)), width_med


def fork(skel, solid, dist):
    """Sur une fourche : rapport fille/mère et rayon du congé d'aisselle."""
    A = _ma.crossings(skel)
    junc = np.argwhere(skel & (A >= 3))
    if not len(junc):
        return None
    # la vraie fourche est la jonction la plus épaisse (les autres sont des artefacts)
    jy, jx = max(junc, key=lambda p: dist[p[0], p[1]])
    wj = 2.0 * dist[jy, jx]

    # largeurs de part et d'autre, à une largeur de distance de la jonction
    ys, xs = np.where(skel)
    d2 = (ys - jy) ** 2 + (xs - jx) ** 2
    ring = (d2 > (wj * 0.9) ** 2) & (d2 < (wj * 1.5) ** 2)
    pts = list(zip(ys[ring], xs[ring]))
    if len(pts) < 3:
        return None
    lab = np.zeros(skel.shape, bool)
    for y, x in pts:
        lab[y, x] = True
    cc, n = ndimage.label(lab, structure=np.ones((3, 3)))
    widths = sorted((2.0 * dist[cc == i].max() for i in range(1, n + 1)), reverse=True)
    if len(widths) < 3:
        return None
    mere, f1, f2 = widths[0], widths[1], widths[2]

    # congé : plus grand cercle vide logé dans le creux, côté aisselle
    bg = ndimage.distance_transform_edt(~solid)
    h, w_ = solid.shape
    y0, y1 = max(0, jy - int(wj * 2)), min(h, jy + int(wj * 2))
    x0, x1 = max(0, jx - int(wj * 2)), min(w_, jx + int(wj * 2))
    win = bg[y0:y1, x0:x1]
    inner = win[win > 0]
    congé = float(inner.min()) if inner.size else float("nan")
    # le creux d'aisselle est le point de fond le plus proche de la jonction
    by, bx = np.argwhere(~solid[y0:y1, x0:x1])[
        np.argmin([(a - (jy - y0)) ** 2 + (b - (jx - x0)) ** 2
                   for a, b in np.argwhere(~solid[y0:y1, x0:x1])])]
    congé = float(bg[y0 + by, x0 + bx])
    return mere, f1, f2, congé, wj


def measure(path, mm_per_px=None):
    name = os.path.splitext(os.path.basename(path))[0]
    ink = _ma.load_ink(path)
    solid = body(ink)
    if solid.sum() < ink.sum() * 1.2:
        print(f"{name}: contour non fermé, le corps n'a pas pu être rempli — mesure impossible")
        return
    dist = ndimage.distance_transform_edt(solid)  # sert encore à la fourche
    skel = _ma.prune(_ma.skeletonize(solid), 12)

    # échelle : le corps de guitare fait 330 mm pour la largeur de la trame ; ici on
    # rapporte tout à la largeur maximale de la branche, ce qui est sans unité.
    p = main_path(skel)
    if len(p) < 8:
        print(f"{name}: axe trop court")
        return
    s, L, R = profile(p, solid)
    w = L + R
    if w[0] < w[-1]:                       # l'axe doit courir du pied vers la pointe
        s, L, R, w = s[-1] - s[::-1], L[::-1], R[::-1], w[::-1]

    print(f"\n{name}")
    print(f"  longueur d'axe {s[-1]:6.0f} px · largeur {w.max():5.1f} -> {np.percentile(w, 3):4.1f} px"
          f" · élancement {s[-1] / w.max():.1f}")

    t = fit_taper(s, smooth_over(w, s, 40))
    if t:
        k, w0, wmin, err = t
        print(f"  effilement    k = {k:.2f}  (w = {wmin:.0f} + {w0 - wmin:.0f}·(1-u)^k, erreur {err:.1f} %)")
        print(f"                largeur de pointe = {100 * wmin / w0:.0f} % de la base")
    for nom, bord in (("gauche", L), ("droit ", R)):
        wb = wobble(s, bord, w)
        if wb:
            amp, per, mw = wb
            per_txt = f" · période {per / mw:.1f} × la largeur" if per == per else ""
            print(f"  bord {nom}   ondulation {amp:.3f} de la largeur locale{per_txt}")

    bk = bark(ink, solid, float(np.median(w)))
    if bk:
        n, span, gap, wmed = bk
        print(f"  écorce        {n} marques · longueur médiane {span / wmed:.2f} × la largeur"
              f" · à {gap / wmed:.2f} × la largeur du bord")

    f = fork(skel, solid, dist)
    if f:
        mere, f1, f2, cong, wj = f
        print(f"  fourche       mère {mere:.0f} px -> filles {f1:.0f} et {f2:.0f} px")
        print(f"                ratio {f1 / mere:.2f} et {f2 / mere:.2f}"
              f" · somme des carrés {(f1**2 + f2**2) / mere**2:.2f} (Leonardo = 1.00)")
        print(f"  aisselle      rayon de congé {cong:.0f} px = {cong / f2:.2f} × la largeur de la fille fine")


def main():
    ap = argparse.ArgumentParser(description="Mesure les paramètres de style d'une branche de référence.")
    ap.add_argument("source", help="PNG ou dossier")
    a = ap.parse_args()
    files = (sorted(glob.glob(os.path.join(a.source, "*.png")))
             if os.path.isdir(a.source) else [a.source])
    for f in files:
        try:
            measure(f)
        except Exception as e:
            print(f"\n{os.path.basename(f)}: ÉCHEC — {e}")


if __name__ == "__main__":
    main()
