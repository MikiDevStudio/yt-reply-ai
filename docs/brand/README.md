# The mark

One shape, three inks. The shape lives in the alpha channel, so an ink is a
fill and not a redraw — `logo-orange.png` is generated from the white master by
`make-icons.py` and is byte-for-byte the same geometry.

| File | Ink | For |
|---|---|---|
| `logo-orange.png` | `#E2670F` `--accent-mark` | **everything we ship.** The site, every icon, the store |
| `logo-white.png` | `#FFFFFF` | a ground we control and know is dark — a slide, a press sheet |
| `logo-black.png` | `#08090B` `--surface` | a ground we control and know is light — print |

Neither monochrome master is pure black or pure white: the dark one is the
`--surface` token, so the mark never sits blacker than the brand's own ground.

## Why the shipped mark is orange

An app icon is one file that lands on grounds we do not control: the Web
Store's white card, a light Chrome toolbar, a dark Chrome toolbar, a tab strip
in either theme. A monochrome mark loses one of those every time — white
vanishes on the store card, black vanishes on a dark toolbar.

`--accent` cannot cover it either, because it is already two values for exactly
this reason: `#FF8A3D` is 2.35:1 on white and `#B0590C` is 2.92:1 on Chrome's
dark toolbar. Each fails the ground the other was not written for.

`#E2670F` sits between them and clears 3:1 everywhere:

| | white / store | light toolbar | dark toolbar | YouTube dark | `--bg` |
|---|---|---|---|---|---|
| `#E2670F` | 3.40 | 3.05 | 4.22 | 5.64 | 6.00 |

So the icon needs no tile of its own. It reads as a shape in the toolbar rather
than as a dark square, and it agrees with the spark already burning in the
accent inside YouTube's own control row.

## Derived files — do not hand-edit, `make-icons.py` overwrites them

    landing/public/logo-orange.png       the masthead
    landing/public/favicon.png           128, transparent
    landing/public/apple-touch-icon.png  180, on --bg
    extension/public/icon/{16,32,48,96,128}.png

`apple-touch-icon.png` is the one file that keeps a ground. iOS does not
composite a home-screen icon over anything — it fills transparent pixels with
black — so a transparent master would arrive as a mark floating in a black
square nobody designed.

## The floor is 16px

The margin shrinks as the canvas does (`INSET`): 16px runs full-bleed, 128
keeps the ~0.75 the Web Store asks for. Below 32px the two thin counters —
the notch inside the fork, the eye of the arrow — merge, and no margin or
colour fixes that; it is the shape's own limit. Reading it needs a simplified
small-size drawing, which does not exist yet.
