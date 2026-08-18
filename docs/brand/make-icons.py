"""Derive every icon in the repo from the masters beside this file.

    python docs/brand/make-icons.py

The three masters are one shape in three inks. The shape lives in the alpha
channel, so a new ink is a fill, not a re-export -- `logo-orange.png` is made
here from the white master's alpha and nothing else.

Why orange is the one that ships: see README.md next door.
"""
from pathlib import Path

from PIL import Image

BRAND = Path(__file__).resolve().parent
ROOT = BRAND.parent.parent

MARK = "#E2670F"  # --accent-mark, brand.md §1
GROUND = (5, 5, 5, 255)  # --bg

# Optical sizing. The gap between the fork and the arrow is the first thing to
# close up, so the margin shrinks with the canvas and disappears entirely at
# 16px, where every pixel of mark counts. 128 keeps the ~0.75 the Web Store
# asks for (a 96px mark inside a 128px canvas).
INSET = {16: 1.00, 32: 0.92, 48: 0.86, 96: 0.80, 128: 0.78, 180: 0.76}


def ink(alpha: Image.Image, hex_colour: str) -> Image.Image:
    """The shape, filled flat. Geometry comes from the alpha and is never touched."""
    h = hex_colour.lstrip("#")
    out = Image.new("RGBA", alpha.size, tuple(int(h[i : i + 2], 16) for i in (0, 2, 4)) + (255,))
    out.putalpha(alpha)
    return out


def icon(src: Image.Image, size: int, ground: tuple[int, int, int, int] | None = None) -> Image.Image:
    """The mark on a square canvas, with the margin that size wants."""
    box = round(size * INSET[size])
    w, h = src.size
    scale = box / max(w, h)
    mark = src.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), ground or (0, 0, 0, 0))
    out.paste(mark, ((size - mark.width) // 2, (size - mark.height) // 2), mark)
    return out


def write(img: Image.Image, rel: str) -> None:
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG", optimize=True)
    print(f"{rel}  {img.width}x{img.height}  {path.stat().st_size}B")


white = Image.open(BRAND / "logo-white.png").convert("RGBA")
orange = ink(white.getchannel("A"), MARK)
write(orange, "docs/brand/logo-orange.png")

# The site.
write(orange, "landing/public/logo-orange.png")
write(icon(orange, 128), "landing/public/favicon.png")

# iOS is the one place a transparent icon is wrong: it does not composite the
# home-screen icon over anything, it fills the transparent pixels with black.
# So this one -- and only this one -- keeps the brand ground.
write(icon(orange, 180, GROUND), "landing/public/apple-touch-icon.png")

# WXT reads public/icon/<size>.png and writes the manifest's `icons` from it.
for size in (16, 32, 48, 96, 128):
    write(icon(orange, size), f"extension/public/icon/{size}.png")
