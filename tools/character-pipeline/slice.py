"""Skyfire Squad character pipeline - step 2: slice generated part sheets into clean cut-out parts.

Usage: python tools/character-pipeline/slice.py <sheet>[,<sheet>...] [--version=v2]

For each source sheet (tools/character-pipeline/source/<sheet>-<version>.png):
  1. clean the alpha: drop faint halos / soft shadows (low alpha, or dark and semi-transparent), keep crisp edges
  2. label connected parts on a downsampled mask (parts are laid out apart on a transparent background)
  3. merge small detached bits (a mic boom, a strand of hair) into the nearest large part
  4. assign parts to the expected grid cells and save each as a trimmed RGBA PNG under parts/<sheet>/<part>.png
  5. validate: every expected part present, not touching the sheet edge, plausible aspect ratio
  6. write parts/<sheet>/contact.png (labelled preview) and parts/<sheet>/report.json
"""
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'source')
OUT = os.path.join(HERE, 'parts')

BODY = {
    (0, 0): 'head', (0, 1): 'torso', (0, 2): 'pelvis', (0, 3): 'pack',
    (1, 0): 'uarm', (1, 1): 'farm', (1, 2): 'thigh', (1, 3): 'shin',
}
LAYOUT = {
    'armour': (3, 4, BODY),
    'tracksuit': (3, 4, BODY),
    'suit': (3, 4, {**BODY, (2, 0): 'tie', (2, 1): 'tail'}),
    'ninja': (3, 4, {**BODY, (2, 0): 'scarf', (2, 1): 'scarf2', (2, 2): 'sash'}),
    'hawaiian': (3, 4, {**BODY, (2, 0): 'flap', (2, 1): 'hem'}),
    'weapons': (2, 3, {(0, 0): 'pistol', (0, 1): 'smg', (0, 2): 'rifle', (1, 0): 'shotgun', (1, 1): 'sniper', (1, 2): 'rocket'}),
    'backs': (1, 2, {(0, 0): 'pennant', (0, 1): 'radio'}),
    # v3 head set (one shared skull template): replaces the heads of the outfit sheets in build_rig.py
    # v3 armless side-view torsos (replace the outfit sheets' torsos in build_rig.py)
    'torsos': (1, 5, {(0, 0): 'armour', (0, 1): 'suit', (0, 2): 'tracksuit', (0, 3): 'ninja', (0, 4): 'hawaiian'}),
    'weapons2': (2, 2, {(0, 0): 'burst', (0, 1): 'lmg', (1, 0): 'railgun', (1, 1): 'launcher'}),
    'headwear': (2, 4, {(0, 0): 'helmet', (0, 1): 'beret', (0, 2): 'bandana', (0, 3): 'cap', (1, 0): 'headset', (1, 1): 'beanie', (1, 2): 'boonie'}),
    'heads': (1, 5, {(0, 0): 'armour', (0, 1): 'suit', (0, 2): 'tracksuit', (0, 3): 'ninja', (0, 4): 'hawaiian'}),
    'accessories': (2, 5, {
        (0, 0): 'helmet', (0, 1): 'beret', (0, 2): 'bandana', (0, 3): 'cap', (0, 4): 'headset',
        (1, 0): 'goggles', (1, 1): 'visor', (1, 2): 'shades', (1, 3): 'mask',
    }),
}
# expected aspect (h / w) ranges for sanity checks
ASPECT = {'uarm': (1.3, 6), 'farm': (1.3, 6), 'thigh': (1.2, 6), 'shin': (1.1, 6), 'tie': (1.5, 12), 'tail': (1.0, 8), 'sash': (1.2, 12),
          'scarf': (0.05, 0.8), 'scarf2': (0.05, 0.9)}

DS = 4  # labelling downsample factor


def clean_alpha(img):
    a = np.asarray(img).astype(np.float32)
    rgb, al = a[..., :3], a[..., 3]
    lum = rgb.max(axis=2)
    halo = (al < 70) | ((al < 215) & (lum < 80))
    al = np.where(halo, 0, al)
    # firm up the remaining edge: anything above 70 becomes opaque-ish with a short ramp (crisp cut-outs)
    al = np.clip((al - 70) * (255 / 120), 0, 255)
    out = np.dstack([rgb, al]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def label(mask):
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    n = 0
    for y in range(h):
        row = mask[y]
        for x in range(w):
            if not row[x] or lab[y, x]:
                continue
            n += 1
            q = deque([(y, x)])
            lab[y, x] = n
            while q:
                cy, cx = q.popleft()
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1), (cy - 1, cx - 1), (cy + 1, cx + 1), (cy - 1, cx + 1), (cy + 1, cx - 1)):
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = n
                        q.append((ny, nx))
    return lab, n


def process(sheet, version):
    path = os.path.join(SRC, f'{sheet}-{version}.png')
    rows, cols, cells = LAYOUT[sheet]
    img = clean_alpha(Image.open(path).convert('RGBA'))
    W, H = img.size
    al = np.asarray(img)[..., 3]
    small = al.reshape(H // DS, DS, W // DS, DS).max(axis=(1, 3)) > 0
    lab, n = label(small)
    comps = []
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        comps.append({'id': i, 'area': len(ys), 'x0': xs.min(), 'x1': xs.max(), 'y0': ys.min(), 'y1': ys.max(), 'cx': xs.mean(), 'cy': ys.mean()})
    total = small.size
    big = [c for c in comps if c['area'] > total * 0.002]
    tiny = [c for c in comps if c['area'] <= total * 0.002]
    # merge small detached bits into the nearest big part (within ~40 px at full scale)
    owner = {c['id']: c['id'] for c in big}
    for t in tiny:
        best, bd = None, 1e9
        for c in big:
            dx = max(c['x0'] - t['cx'], 0, t['cx'] - c['x1'])
            dy = max(c['y0'] - t['cy'], 0, t['cy'] - c['y1'])
            d = (dx * dx + dy * dy) ** 0.5
            if d < bd:
                best, bd = c, d
        if best is not None and bd * DS < 40:
            owner[t['id']] = best['id']
    # group big parts by grid cell; when a row holds exactly as many parts as it expects, assign them left to right
    # (the generator does not always respect column widths for small cloth strips)
    groups = {}
    byrow = {}
    for c in big:
        r = min(rows - 1, int(c['cy'] * DS / (H / rows)))
        byrow.setdefault(r, []).append(c)
    for r, cs in byrow.items():
        want = sorted(k for (rr, k) in cells if rr == r)
        cs = sorted(cs, key=lambda c: c['cx'])
        if len(cs) == len(want):
            for c, k in zip(cs, want):
                groups[(r, k)] = [c['id']]
        else:
            for c in cs:
                k = min(cols - 1, int(c['cx'] * DS / (W / cols)))
                groups.setdefault((r, k), []).append(c['id'])
    os.makedirs(os.path.join(OUT, sheet), exist_ok=True)
    report = {'sheet': sheet, 'version': version, 'size': [W, H], 'parts': {}, 'problems': []}
    arr = np.asarray(img)
    for cell, name in cells.items():
        ids = groups.get(cell)
        if not ids:
            report['problems'].append(f'missing {name} in cell {cell}')
            continue
        keep = set(i for i, o in owner.items() if o in ids)
        m_small = np.isin(lab, list(keep))
        # grow the downsampled mask by one cell so anti-aliased edges survive, then upsample
        g = m_small.copy()
        g[1:] |= m_small[:-1]; g[:-1] |= m_small[1:]; g[:, 1:] |= m_small[:, :-1]; g[:, :-1] |= m_small[:, 1:]
        m = np.repeat(np.repeat(g, DS, axis=0), DS, axis=1)
        part = arr.copy()
        part[..., 3] = np.where(m, part[..., 3], 0)
        ys, xs = np.nonzero(part[..., 3] > 8)
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        pad = 2
        crop = Image.fromarray(part[max(0, y0 - pad):y1 + pad + 1, max(0, x0 - pad):x1 + pad + 1], 'RGBA')
        crop.save(os.path.join(OUT, sheet, f'{name}.png'))
        w, h = crop.size
        info = {'w': w, 'h': h, 'bbox': [int(x0), int(y0), int(x1), int(y1)], 'pieces': len(keep)}
        if x0 <= 1 or y0 <= 1 or x1 >= W - 2 or y1 >= H - 2:
            report['problems'].append(f'{name} touches the sheet edge (clipped?)')
        lo, hi = ASPECT.get(name, (0.05, 20))
        if not (lo <= h / w <= hi):
            report['problems'].append(f'{name} aspect {h / w:.2f} outside [{lo}, {hi}]')
        report['parts'][name] = info
    extra = [cell for cell in groups if cell not in cells]
    if extra:
        report['problems'].append(f'unexpected parts in cells {extra}')
    # contact sheet
    names = list(report['parts'])
    th = 220
    tiles = []
    for nm in names:
        p = Image.open(os.path.join(OUT, sheet, f'{nm}.png'))
        s = th / max(p.size)
        tiles.append((nm, p.resize((max(1, int(p.width * s)), max(1, int(p.height * s))), Image.LANCZOS)))
    cw = 240
    sheet_img = Image.new('RGBA', (cw * max(1, len(tiles)), th + 40), (58, 54, 70, 255))
    d = ImageDraw.Draw(sheet_img)
    for i, (nm, t) in enumerate(tiles):
        sheet_img.alpha_composite(t, (i * cw + (cw - t.width) // 2, 10 + (th - t.height) // 2))
        d.text((i * cw + 8, th + 18), nm, fill=(255, 240, 210, 255))
    sheet_img.save(os.path.join(OUT, sheet, 'contact.png'))
    with open(os.path.join(OUT, sheet, 'report.json'), 'w') as f:
        json.dump(report, f, indent=2)
    print(f"{sheet}: {len(report['parts'])}/{len(cells)} parts" + (f"  PROBLEMS: {report['problems']}" if report['problems'] else '  ok'))
    return report


if __name__ == '__main__':
    version = next((a.split('=')[1] for a in sys.argv[1:] if a.startswith('--version=')), 'v2')
    sheets = [s for a in sys.argv[1:] if not a.startswith('--') for s in a.split(',')] or list(LAYOUT)
    for s in sheets:
        if os.path.exists(os.path.join(SRC, f'{s}-{version}.png')):
            process(s, version)
        else:
            print(f'{s}: no source sheet')
