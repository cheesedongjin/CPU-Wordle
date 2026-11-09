"""Stage the static game at the Pages root, including dictionary attribution."""
from pathlib import Path
from shutil import copy2, copytree
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "build" / "pages"


def build():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name in ("index.html", "styles.css", "app.js", "engine.js", "words.js", "icon.svg"):
        copy2(ROOT / "web" / name, OUTPUT / name)
    copytree(ROOT / "data", OUTPUT / "data", dirs_exist_ok=True)
    index = OUTPUT / "index.html"
    index.write_text(
        index.read_text(encoding="utf-8").replace('href="../data/', 'href="./data/'),
        encoding="utf-8",
    )
    (OUTPUT / ".nojekyll").write_text("", encoding="utf-8")

    class CheckLinks(HTMLParser):
        def handle_starttag(self, tag, attrs):
            for key, value in attrs:
                if key not in ("src", "href") or not value:
                    continue
                url = urlsplit(value)
                if url.scheme or url.netloc or not url.path:
                    continue
                target = (OUTPUT / unquote(url.path)).resolve()
                if not target.is_relative_to(OUTPUT.resolve()) or not target.exists():
                    raise ValueError(f"Broken deployment link: {value}")

    CheckLinks().feed(index.read_text(encoding="utf-8"))
    print(f"Pages artifact ready: {OUTPUT}")


if __name__ == "__main__":
    build()
