"""Convertit en SVG tous les fichiers image (non-SVG) d'un dossier de motifs.

Pipeline (repris de laser-tools) : image -> seuil N&B -> BMP 1-bit -> potrace -b svg.
Les fichiers qui ont deja un .svg de meme nom a cote sont ignores (deja vectorises a la main).
Ecrit aussi un manifest.json (correspondance source <-> svg) pour review_server.py.

Usage :
    python convert_to_svg.py
    python convert_to_svg.py --threshold 180 --src "." --out "Motifs SVG"
    python review_server.py   # ensuite, pour valider/retravailler chaque motif
"""
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageFilter

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".tif", ".tiff", ".webp"}
POTRACE_EXE = Path(__file__).resolve().parents[2] / "laser-tools" / "bin" / "potrace.exe"


def _color_mask(img: "Image.Image", threshold: int, fill_color: str):
    """Masque pour separer deux couleurs de meme luminance (ex: salopette bleue vs chemise rouge
    de Mario, indistinguables en niveaux de gris). Noir = contours sombres + la couleur demandee."""
    import numpy as np
    rgb = np.asarray(img.convert("RGB"), dtype=int)
    R, G, B = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    L = np.asarray(img.convert("L"), dtype=int)
    outline = L < threshold
    if fill_color == "blue":
        hue = (B - R > 25) & (B - G > 0) & (B > 80)
    elif fill_color == "red":
        hue = (R - B > 25) & (R - G > 25) & (R > 80)
    elif fill_color == "green":
        hue = (G - R > 20) & (G - B > 20) & (G > 60)
    else:
        raise ValueError(f"couleur inconnue : {fill_color} (attendu blue/red/green)")
    return outline | hue


def to_bmp_1bit(src: Path, dst: Path, threshold: int,
                 crop: tuple[float, float, float, float] | None = None,
                 band: tuple[int, int] | None = None, blur: int = 0,
                 fill_color: str | None = None) -> None:
    img = Image.open(src)
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        rgba = img.convert("RGBA")
        bg.paste(rgba, mask=rgba.split()[-1])
        img = bg
    if crop:
        w, h = img.size
        l, t, r, b = crop
        img = img.crop((int(w * l), int(h * t), int(w * r), int(h * b)))
    if fill_color:
        import numpy as np
        mask = _color_mask(img, threshold, fill_color)
        bw = Image.fromarray(np.where(mask, 0, 255).astype("uint8")).convert("1")
        bw.save(dst, format="BMP")
        return
    gray = img.convert("L")
    if blur and blur >= 3:
        # Lisse le grain des sources photo (peluche, rendu 3D) avant seuillage.
        gray = gray.filter(ImageFilter.MedianFilter(blur if blur % 2 else blur + 1))
    if band:
        lo, hi = band
        # Noir = tons moyens (ex: la feuille coloree) ; le plus sombre (yeux) et le plus clair
        # (fond/corps) restent blancs -> les yeux ressortent en trous dans la feuille.
        bw = gray.point(lambda v: 0 if lo <= v <= hi else 255, mode="1")
    else:
        bw = gray.point(lambda v: 0 if v < threshold else 255, mode="1")
    bw.save(dst, format="BMP")


def convert_one(src: Path, dst_svg: Path, threshold: int, turdsize: int,
                 crop: tuple[float, float, float, float] | None = None,
                 band: tuple[int, int] | None = None, blur: int = 0,
                 fill_color: str | None = None) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        bmp = Path(tmp) / (src.stem + ".bmp")
        to_bmp_1bit(src, bmp, threshold, crop, band, blur, fill_color)
        result = subprocess.run(
            [str(POTRACE_EXE), "-b", "svg", "--tight", "-t", str(turdsize),
             "-o", str(dst_svg), str(bmp)],
            capture_output=True, text=True,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or result.stdout.strip())


def write_manifest(out_dir: Path, pairs: list[tuple[Path, Path]]) -> Path:
    """Fusionne avec le manifest existant (une conversion --only ne doit pas effacer les autres entrees)."""
    manifest_path = out_dir / "manifest.json"
    existing = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else []
    by_src = {e["src"]: e for e in existing}
    for src, dst_svg in pairs:
        by_src[src.name] = {"src": src.name, "svg": dst_svg.name}
    manifest_path.write_text(json.dumps(list(by_src.values()), ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest_path


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--src", default=".", help="Dossier source (defaut : dossier courant)")
    ap.add_argument("--out", default="Motifs SVG", help="Dossier de sortie (defaut : 'Motifs SVG')")
    ap.add_argument("--threshold", type=int, default=200, help="Seuil N&B 0-255 (defaut 200)")
    ap.add_argument("--turdsize", type=int, default=2, help="Suppression des speckles potrace (defaut 2)")
    ap.add_argument("--only", default=None,
                    help="Ne convertir que les fichiers dont le nom contient cette sous-chaine (insensible a la casse)")
    ap.add_argument("--crop", default=None,
                    help="Rognage avant seuillage, fractions 0-1 'gauche,haut,droite,bas' (ex: 0.13,0,1,1)")
    ap.add_argument("--band", default=None,
                    help="Seuil 'band-pass' 'lo,hi' : noir = tons moyens (utile pour illustrations "
                         "couleur dont la feuille/visage est fonce mais pas noir). Ex: 95,175")
    ap.add_argument("--blur", type=int, default=0,
                    help="Flou median (taille >=3) avant seuillage, lisse le grain des sources photo")
    ap.add_argument("--fill-color", choices=["blue", "red", "green"], default=None,
                    help="Separer deux couleurs de meme luminance : noir = contours sombres (< threshold) "
                         "+ la couleur choisie. Ex Mario : --fill-color blue --threshold 55")
    args = ap.parse_args()

    crop = tuple(float(x) for x in args.crop.split(",")) if args.crop else None
    band = tuple(int(x) for x in args.band.split(",")) if args.band else None

    if not POTRACE_EXE.exists():
        print(f"ERREUR : potrace.exe introuvable : {POTRACE_EXE}")
        sys.exit(1)

    src_dir = Path(args.src).resolve()
    out_dir = src_dir / args.out
    out_dir.mkdir(exist_ok=True)

    converted, skipped, failed, pairs = [], [], [], []

    only = args.only.lower() if args.only else None

    candidates = []
    for f in sorted(src_dir.iterdir()):
        if not f.is_file() or f.suffix.lower() not in IMAGE_EXTS:
            continue
        if only and only not in f.name.lower():
            continue
        if f.with_suffix(".svg").exists():
            skipped.append(f.name)
            continue
        candidates.append(f)

    stem_counts: dict[str, int] = {}
    for f in candidates:
        key = f.stem.lower()
        stem_counts[key] = stem_counts.get(key, 0) + 1

    for f in candidates:
        # Eviter qu'un .jpg et un .png de meme nom s'ecrasent l'un l'autre.
        if stem_counts[f.stem.lower()] > 1:
            dst_svg = out_dir / f"{f.stem} ({f.suffix.lstrip('.').lower()}).svg"
        else:
            dst_svg = out_dir / (f.stem + ".svg")
        try:
            convert_one(f, dst_svg, args.threshold, args.turdsize, crop, band, args.blur, args.fill_color)
            converted.append(f.name)
            pairs.append((f, dst_svg))
        except Exception as e:
            failed.append((f.name, str(e)))

    print(f"\n{len(converted)} fichier(s) convertis dans '{out_dir}' :")
    for name in converted:
        print(f"  - {name}")

    if skipped:
        print(f"\n{len(skipped)} ignore(s) (un .svg du meme nom existe deja a cote) :")
        for name in skipped:
            print(f"  - {name}")

    if failed:
        print(f"\n{len(failed)} echec(s) :")
        for name, err in failed:
            print(f"  - {name} : {err}")

    print(
        "\nRappel : la conversion fait un seuil N&B simple (pas de gestion couleur/transparence "
        "fine). Les motifs en couleur ou avec un fond complexe a retirer ressortiront degrades "
        "(taches, fond non nettoye) et demanderont une retouche manuelle (Inkscape ou repassage "
        "du contour)."
    )

    if pairs:
        manifest_path = write_manifest(out_dir, pairs)
        print(f"\nManifest ecrit : {manifest_path}")
        print("Lance maintenant : python review_server.py")


if __name__ == "__main__":
    main()
