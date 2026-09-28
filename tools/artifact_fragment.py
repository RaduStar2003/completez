"""Generează varianta pentru Claude (artifact) din index.html.

Artifactele Claude primesc doar conținutul paginii: fără <!doctype>, <html>, <head>, <body>,
iar manifestul și iconițele nu sunt necesare acolo.

Folosire: python tools/artifact_fragment.py <fișier-ieșire>
"""
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
html = (root / "index.html").read_text(encoding="utf-8")

drop = re.compile(r'(rel="manifest"|rel="icon"|rel="apple-touch-icon"|name="theme-color"|name="description")')
lines = [line for line in html.splitlines() if not drop.search(line)]
html = "\n".join(lines)
html = re.sub(r"(?is)<!doctype[^>]*>|</?html[^>]*>|</?head>|</?body>", "", html)
html = re.sub(r"\n{3,}", "\n\n", html).strip() + "\n"

out = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "artifact.html"
out.write_text(html, encoding="utf-8")
print(f"scris: {out}")
