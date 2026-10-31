"""Skyfire Squad character pipeline - shared head template (anatomy guide for the head sheet).

Draws references/head-template.png: five identical right-facing profile head silhouettes (cranium, face, jaw, ear, neck)
in a 1 x 5 grid, 1536x1024. gen-sheets.mjs attaches it to the `heads` sheet so all five heads are painted on ONE skull
construction (same skull size, eye line, ear, jaw and neck), and only hair / facial hair / features differ.

The same numbers (SKULL) are used by build_rig.py to check the generated heads against the template.
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
W, H, COLS = 1536, 1024, 5
CELL = W // COLS
# template head in cell-local px (facing right), crown at y0
# Template head, cell-local px, facing right. Crown-to-chin HEAD px; everything else is in head units (u = HEAD px).
HEAD = 290
TOP = 320           # crown y
SKULL = {'crown': TOP, 'eye': TOP + 0.50 * HEAD, 'chin': TOP + HEAD, 'neck_bottom': TOP + 1.22 * HEAD, 'depth': 0.80 * HEAD}

# right-facing profile outline in head units: x from the back of the skull, y from the crown
PROFILE = [
    (0.42, 0.00), (0.58, 0.02), (0.70, 0.09), (0.77, 0.22), (0.78, 0.36),   # crown -> forehead
    (0.76, 0.42), (0.79, 0.47),                                            # brow ridge
    (0.80, 0.55), (0.86, 0.66), (0.80, 0.69),                               # nose
    (0.81, 0.76), (0.78, 0.80), (0.80, 0.85),                               # lips
    (0.77, 0.94), (0.70, 1.00), (0.60, 1.00),                               # chin
    (0.48, 0.93), (0.56, 1.04), (0.60, 1.22),                               # jaw -> throat -> neck front
    (0.22, 1.22), (0.20, 1.02), (0.12, 0.86),                               # neck back -> nape
    (0.03, 0.70), (0.00, 0.50), (0.03, 0.30), (0.12, 0.13), (0.25, 0.03),   # back of the skull
]


def head(d, cx):
    x0 = cx - 0.42 * HEAD
    P = lambda u, v: (x0 + u * HEAD, TOP + v * HEAD)
    d.polygon([P(u, v) for u, v in PROFILE], fill=(190, 190, 196, 255))
    # ear (darker so the model keeps its position) and eye marker
    d.ellipse((*P(0.36, 0.46), *P(0.47, 0.66)), fill=(150, 150, 158, 255))
    d.ellipse((*P(0.66, 0.48), *P(0.71, 0.53)), fill=(90, 90, 100, 255))


def main():
    im = Image.new('RGBA', (W, H), (255, 255, 255, 255))
    d = ImageDraw.Draw(im)
    for i in range(COLS):
        head(d, i * CELL + CELL // 2)
    out = os.path.join(HERE, 'references', 'head-template.png')
    im.save(out)
    print('wrote', out)


if __name__ == '__main__':
    main()
