"""Serveur local de revue des SVG generes par convert_to_svg.py.

Affiche chaque motif (image source a gauche, SVG trace a droite) avec deux boutons :
  - Valider          -> deplace l'image source vers Convertis/, garde le SVG.
  - A retravailler    -> supprime le SVG genere, ne touche pas a l'image source.
Raccourcis clavier sur la carte en surbrillance : V = valider, R = a retravailler.

Usage :
    python review_server.py
    python review_server.py --out "Motifs SVG" --port 8765
"""
import argparse
import html
import json
import mimetypes
import shutil
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote, urlparse

SRC_DIR: Path
OUT_DIR: Path
CONVERTIS_DIR: Path

CSS = """
  body { font: 14px system-ui, sans-serif; background: #f4f4f6; margin: 24px; color: #222; }
  h1 { font-size: 18px; }
  #count { color: #555; margin-bottom: 12px; }
  p.hint { color: #555; }
  .grid { display: flex; flex-wrap: wrap; gap: 16px; }
  figure { margin: 0; background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 10px; width: 240px; }
  figure.current { outline: 3px solid #4a7; }
  figure.fading { opacity: .15; pointer-events: none; transition: opacity .2s; }
  .pair { display: flex; gap: 4px; }
  .pair img, .pair object { width: 114px; height: 114px; object-fit: contain; background:
    repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50% / 14px 14px; border: 1px solid #eee; }
  figcaption { margin-top: 6px; font-size: 12px; word-break: break-word; }
  .actions { margin-top: 8px; display: flex; gap: 6px; }
  button { flex: 1; padding: 6px 4px; border-radius: 5px; border: 1px solid #ccc; cursor: pointer; font-size: 12px; }
  button.ok { background: #e6f6ec; border-color: #8cd2a4; }
  button.ko { background: #fce8e8; border-color: #e3a0a0; }
"""

SCRIPT = """
function current() { return document.querySelector('#grid figure'); }
function highlight() {
  document.querySelectorAll('figure.current').forEach(f => f.classList.remove('current'));
  const f = current();
  if (f) f.classList.add('current');
}
function act(btn, action) {
  const fig = btn.closest('figure');
  const src = fig.dataset.src, svg = fig.dataset.svg;
  fig.classList.add('fading');
  fetch('/action', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({src, svg, action})
  }).then(r => r.json()).then(res => {
    if (!res.ok) { alert('Erreur : ' + res.error); fig.classList.remove('fading'); return; }
    fig.remove();
    const remaining = document.querySelectorAll('#grid figure').length;
    document.getElementById('count').textContent =
      remaining + ' restants sur ' + TOTAL + ' (' + (TOTAL - remaining) + ' traites)';
    highlight();
  }).catch(err => { alert('Erreur reseau : ' + err); fig.classList.remove('fading'); });
}
document.addEventListener('keydown', e => {
  if (!['v', 'V', 'r', 'R'].includes(e.key)) return;
  const fig = current();
  if (!fig) return;
  const btn = fig.querySelector(e.key.toLowerCase() === 'v' ? '.ok' : '.ko');
  if (btn) btn.click();
});
highlight();
"""


def load_manifest() -> list[dict]:
    manifest_path = OUT_DIR / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(
            f"manifest.json introuvable dans {OUT_DIR} -- lance d'abord convert_to_svg.py"
        )
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def pending_entries(manifest: list[dict]) -> list[dict]:
    return [
        e for e in manifest
        if (SRC_DIR / e["src"]).is_file() and (OUT_DIR / e["svg"]).is_file()
    ]


def render_page(entries: list[dict], total: int) -> str:
    cards = []
    for e in entries:
        src_attr = html.escape(e["src"], quote=True)
        svg_attr = html.escape(e["svg"], quote=True)
        cards.append(f"""  <figure data-src="{src_attr}" data-svg="{svg_attr}">
    <div class="pair">
      <img src="/original/{quote(e['src'])}" alt="original">
      <object data="/svg/{quote(e['svg'])}" type="image/svg+xml"></object>
    </div>
    <figcaption>{html.escape(e['src'])}</figcaption>
    <div class="actions">
      <button class="ok" onclick="act(this,'validate')">Valider</button>
      <button class="ko" onclick="act(this,'reject')">A retravailler</button>
    </div>
  </figure>""")
    remaining = len(entries)
    done = total - remaining
    return f"""<!doctype html>
<meta charset="utf-8">
<title>Revue des motifs SVG</title>
<style>{CSS}</style>
<h1>Revue des motifs SVG</h1>
<div id="count">{remaining} restants sur {total} ({done} traites)</div>
<p class="hint">Valider = deplace l'image source vers <code>Convertis/</code>, garde le SVG.
   A retravailler = supprime le SVG genere, garde l'image source.
   Raccourcis sur la carte en surbrillance : <b>V</b> = valider, <b>R</b> = a retravailler.</p>
<div class="grid" id="grid">
{chr(10).join(cards)}
</div>
<script>const TOTAL = {total};</script>
<script>{SCRIPT}</script>
"""


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, content_type: str, body: bytes) -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_json(self, code: int, obj: dict) -> None:
        self._send(code, "application/json; charset=utf-8", json.dumps(obj).encode("utf-8"))

    def _serve_file(self, directory: Path, raw_name: str) -> None:
        name = unquote(raw_name)
        if "/" in name or "\\" in name or name in ("..", "."):
            self._send(404, "text/plain", b"not found")
            return
        path = directory / name
        try:
            if not path.is_file() or path.resolve().parent != directory.resolve():
                self._send(404, "text/plain", b"not found")
                return
        except OSError:
            self._send(404, "text/plain", b"not found")
            return
        ctype = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        self._send(200, ctype, path.read_bytes())

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/":
            manifest = load_manifest()
            body = render_page(pending_entries(manifest), len(manifest)).encode("utf-8")
            self._send(200, "text/html; charset=utf-8", body)
        elif path.startswith("/original/"):
            self._serve_file(SRC_DIR, path[len("/original/"):])
        elif path.startswith("/svg/"):
            self._serve_file(OUT_DIR, path[len("/svg/"):])
        else:
            self._send(404, "text/plain", b"not found")

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/action":
            self._send(404, "text/plain", b"not found")
            return
        length = int(self.headers.get("Content-Length", 0))
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            src_name, svg_name, action = payload["src"], payload["svg"], payload["action"]
        except Exception:
            self._send_json(400, {"ok": False, "error": "requete invalide"})
            return
        if any(c in src_name or c in svg_name for c in ("/", "\\")):
            self._send_json(400, {"ok": False, "error": "nom de fichier invalide"})
            return
        try:
            if action == "validate":
                src_path = SRC_DIR / src_name
                if not src_path.is_file():
                    raise FileNotFoundError(src_name)
                CONVERTIS_DIR.mkdir(exist_ok=True)
                shutil.move(str(src_path), str(CONVERTIS_DIR / src_name))
            elif action == "reject":
                svg_path = OUT_DIR / svg_name
                if svg_path.is_file():
                    svg_path.unlink()
            else:
                raise ValueError(f"action inconnue : {action}")
        except Exception as e:
            self._send_json(500, {"ok": False, "error": str(e)})
            return
        self._send_json(200, {"ok": True})

    def log_message(self, fmt: str, *args) -> None:
        pass


def main() -> None:
    global SRC_DIR, OUT_DIR, CONVERTIS_DIR
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--src", default=".", help="Dossier source (defaut : dossier courant)")
    ap.add_argument("--out", default="Motifs SVG", help="Dossier des SVG generes")
    ap.add_argument("--port", type=int, default=8765)
    args = ap.parse_args()

    SRC_DIR = Path(args.src).resolve()
    OUT_DIR = SRC_DIR / args.out
    CONVERTIS_DIR = SRC_DIR / "Convertis"

    load_manifest()  # echoue tot si convert_to_svg.py n'a pas tourne

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    url = f"http://127.0.0.1:{args.port}/"
    print(f"Serveur de revue lance : {url}\nCtrl+C pour arreter.")
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
