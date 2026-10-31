"""Preview every outfit head with every headwear / face accessory, using the same placement maths as
packages/client/src/render/hero/heroLook.ts (accessoryPos) so fits can be tuned without running the game.

Usage: python tools/character-pipeline/fit_accessories.py   -> tools/character-pipeline/preview/accessories.png
Fit fractions are read from heroLook.ts (HAT_FIT / FACE_FIT) and sizes from build_rig.ACC_H.
"""
import os
import re
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
import build_rig as B  # noqa: E402

PPU = 12
LOOK_TS = os.path.join(B.ROOT, 'packages', 'client', 'src', 'render', 'hero', 'heroLook.ts')


def read_fits():
    src = open(LOOK_TS, encoding='utf-8').read()
    fits = {}
    for block in ('HAT_AT', 'FACE_AT'):
        body = src[src.index(block):]
        body = body[:body.index('};')]
        for m in re.finditer(r"(\w+): \{ x: (-?[\d.]+), y: (-?[\d.]+) \}", body):
            fits[m.group(1)] = (float(m.group(2)), float(m.group(3)))
    return fits


def scaled(name):
    img, s, piv = B.FRAMES[name]
    k = s * PPU
    im = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
    return im, (piv[0] * k, piv[1] * k)


def main():
    for o in B.OUTFITS:
        B.build_outfit(o)
    B.build_accessories()
    fits = read_fits()
    hats = ['helmet', 'beret', 'bandana', 'cap', 'headset', 'beanie', 'boonie', None]
    capped = {'helmet', 'cap', 'beanie', 'boonie'}
    faces = ['goggles', 'visor', 'shades', 'mask', None]
    cell = 34 * PPU // 2
    combos = [(h, None) for h in hats] + [(None, f) for f in faces[:-1]]
    sheet = Image.new('RGBA', (cell * len(combos), cell * len(B.OUTFITS)), (64, 60, 78, 255))
    dr = ImageDraw.Draw(sheet)
    for r, o in enumerate(B.OUTFITS):
        head = B.META['outfits'][o]['head']
        for c, (hat, face) in enumerate(combos):
            hb = f'{o}_headc' if hat in capped and f'{o}_headc_s1' in B.FRAMES else f'{o}_head'
            hname = f'{hb}_s1' if f'{hb}_s1' in B.FRAMES else hb
            him, hp = scaled(hname)
            ox, oy = c * cell + cell * 0.45, r * cell + cell * 0.95  # neck pivot position in the cell
            sheet.alpha_composite(him, (round(ox - hp[0]), round(oy - hp[1])))
            for slot, item in (('hat', hat), ('face', face)):
                if not item:
                    continue
                hx, hy = fits[item]
                hy = -hy
                aim, ap = scaled(f'acc_{item}')
                sheet.alpha_composite(aim, (round(ox + hx * PPU - ap[0]), round(oy + hy * PPU - ap[1])))
            dr.text((c * cell + 4, r * cell + 4), f'{o} {hat or face or "-"}', fill=(255, 240, 200, 255))
    out = os.path.join(B.PREVIEW, 'accessories.png')
    os.makedirs(B.PREVIEW, exist_ok=True)
    sheet.save(out)
    print(out, sheet.size)


if __name__ == '__main__':
    main()
