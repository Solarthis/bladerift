"""Bladerift fighter sprites: turn generated animation sheets into a runtime atlas.

Usage: python tools/sprites/process.py <character-id> [--native=176] [--no-quantize] [--previews]

Reads   art/characters/<id>/sheets/*.png (from tools/sprites/gen.mjs), art/sprite-standard.json, art/animations.json
Writes  packages/client/public/assets/characters/<id>/atlas.png + atlas.json (frames, anchors, animations)
        art/characters/<id>/frames/<sheet>-<n>.png (cleaned full-res frames, for review)
        art/characters/<id>/previews/<anim>.gif + contact.png (animation previews at game speed) with --previews
        art/characters/<id>/qa.json (per-frame measurements: scale, anchor drift, cell spill)

Steps per sheet: key out a fake/opaque background if the sheet has no real alpha; split the sheet into connected opaque
blobs and give each blob to the grid cell holding its centre (so a sword tip that crosses a cell edge stays with its frame);
register every frame on an anchor = (torso centre x, ground line y) - grounded frames snap their lowest body pixels to the
ground line, airborne frames keep the cell's ground line; scale every sheet to the character's native height measured on
the idle stance; downscale with area filtering, harden the alpha edge and map colours to one shared palette so the result
reads as crisp pixel art at native size.
"""
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
args = [a for a in sys.argv[1:] if not a.startswith('--')]
flags = dict((a[2:].split('=') + ['1'])[:2] for a in sys.argv[1:] if a.startswith('--'))
if not args:
    sys.exit(__doc__)
CID = args[0]
CDIR = os.path.join(ROOT, 'art', 'characters', CID)
STD = json.load(open(os.path.join(ROOT, 'art', 'sprite-standard.json'), encoding='utf-8'))
ANIMS = json.load(open(os.path.join(ROOT, 'art', 'animations.json'), encoding='utf-8'))['anims']
CH = json.load(open(os.path.join(CDIR, 'character.json'), encoding='utf-8'))
NATIVE = int(flags.get('native', CH.get('nativeHeight', STD['nativeHeight'])))
OUT = os.path.join(ROOT, 'packages', 'client', 'public', 'assets', 'characters', CID)
FRAMES = os.path.join(CDIR, 'frames')
PREV = os.path.join(CDIR, 'previews')
for d in (OUT, FRAMES, PREV):
    os.makedirs(d, exist_ok=True)


def load_rgba(path):
    im = np.array(Image.open(path).convert('RGBA'))
    a = im[:, :, 3]
    if (a < 250).mean() < 0.05:
        im = key_background(im)
    return im


def key_background(im):
    """The sheet came back opaque (a flat colour or a painted checkerboard): flood the background from the borders."""
    rgb = im[:, :, :3].astype(np.int16)
    h, w = rgb.shape[:2]
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    # one or two dominant border colours (a checkerboard has two)
    cols = np.unique((border // 8) * 8, axis=0, return_counts=True)
    keys = cols[0][np.argsort(-cols[1])][:2] + 4
    bg = np.zeros((h, w), bool)
    for k in keys:
        bg |= (np.abs(rgb - k).max(axis=2) <= 18)
    # keep only background connected to the border
    lab = cv2.connectedComponents(bg.astype(np.uint8), connectivity=4)[1]
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    edge.discard(0)
    mask = np.isin(lab, list(edge))
    out = im.copy()
    out[:, :, 3] = np.where(mask, 0, 255).astype(np.uint8)
    return out


def best_cut(profile, at, reach):
    """The emptiest line near an expected grid boundary (frames that touch are cut where they overlap least)."""
    lo, hi = max(1, at - reach), min(len(profile) - 1, at + reach)
    seg = profile[lo:hi].astype(np.float64)
    # prefer the expected line when several are equally empty
    seg = seg + np.abs(np.arange(lo, hi) - at) * 1e-3
    return int(lo + np.argmin(seg))


def split_cells(im, cols, rows):
    """Give every opaque blob of the sheet to its frame. Cell borders are the emptiest rows/columns near the grid lines; a
    blob lying mostly (80 %+) in one cell goes to it whole (a sword tip or trail that crosses the border stays with its
    frame), and only blobs that merge two frames are split along the border."""
    H, W = im.shape[:2]
    cw, chh = W // cols, H // rows
    pad = 96
    solid = im[:, :, 3] > 24
    a = solid.astype(np.int32)
    ycuts = [0] + [best_cut(a.sum(axis=1), r * chh, chh // 4) for r in range(1, rows)] + [H]
    owner = np.full((H, W), -1, np.int32)   # cell index of every pixel by the border cut
    for r in range(rows):
        y0, y1 = ycuts[r], ycuts[r + 1]
        xcuts = [0] + [best_cut(a[y0:y1].sum(axis=0), c * cw, cw // 3) for c in range(1, cols)] + [W]
        for c in range(cols):
            owner[y0:y1, xcuts[c]:xcuts[c + 1]] = r * cols + c
    n, lab, st, _ = cv2.connectedComponentsWithStats(solid.astype(np.uint8), connectivity=8)
    assign = owner.copy()
    for i in range(1, n):
        x, y, w, h, area = st[i]
        if area < 60:
            assign[y:y + h, x:x + w][lab[y:y + h, x:x + w] == i] = -1
            continue
        sub = lab[y:y + h, x:x + w] == i
        cells_hit = owner[y:y + h, x:x + w][sub]
        counts = np.bincount(cells_hit, minlength=cols * rows)
        best = int(counts.argmax())
        if counts[best] >= 0.8 * area:
            assign[y:y + h, x:x + w][sub] = best
        else:
            # two frames touch: split the merged blob at its narrowest neck (watershed from each frame's core, the part
            # of the blob well inside that frame's cell), not along a straight line through one of the figures
            roi_owner = owner[y:y + h, x:x + w]
            dist = cv2.distanceTransform(sub.astype(np.uint8), cv2.DIST_L2, 5)
            markers = np.zeros(sub.shape, np.int32)
            core = dist > max(2.0, float(dist.max()) * 0.25)
            for cidx in np.unique(roi_owner[sub]):
                seed = sub & core & (roi_owner == cidx)
                # stay away from the cut band so a seed never starts inside the other figure
                band = cv2.erode((roi_owner == cidx).astype(np.uint8), np.ones((1, 61), np.uint8)) > 0
                seed &= band
                if seed.any():
                    markers[seed] = int(cidx) + 1
            if len(np.unique(markers)) > 2:
                elev = (255 - np.clip(dist / max(1e-3, dist.max()) * 255, 0, 255)).astype(np.uint8)
                ws = cv2.watershed(cv2.cvtColor(elev, cv2.COLOR_GRAY2BGR), markers.copy())
                lab_ws = np.where(ws > 0, ws - 1, roi_owner)
                assign[y:y + h, x:x + w][sub] = lab_ws[sub]
    cells, spill = [], []
    kernel = np.ones((5, 5), np.uint8)
    for k in range(cols * rows):
        r, c = divmod(k, cols)
        ox, oy = c * cw - pad, r * chh - pad
        can = np.zeros((chh + 2 * pad, cw + 2 * pad, 4), np.uint8)
        mine = (assign == k) & solid
        # small pieces that were cut off a NEIGHBOUR's frame touch that neighbour's pixels across the cut: drop them
        # (the frame's own detached sparks never touch another frame)
        others = cv2.dilate((solid & (assign != k) & (assign >= 0)).astype(np.uint8), kernel) > 0
        n2, lab2, st2, _ = cv2.connectedComponentsWithStats(mine.astype(np.uint8), connectivity=8)
        if n2 > 2:
            main = 1 + int(np.argmax(st2[1:, 4]))
            for j in range(1, n2):
                if j == main or st2[j, 4] >= 0.4 * st2[main, 4]:
                    continue
                x2, y2, w2, h2, _a = st2[j]
                sub = lab2[y2:y2 + h2, x2:x2 + w2] == j
                if (others[y2:y2 + h2, x2:x2 + w2] & sub).any():
                    assign[y2:y2 + h2, x2:x2 + w2][sub] = -1
        ys, xs = np.nonzero((assign == k) & solid | ((assign == k) & (im[:, :, 3] > 0)))
        ok = (xs - ox >= 0) & (xs - ox < cw + 2 * pad) & (ys - oy >= 0) & (ys - oy < chh + 2 * pad)
        can[ys[ok] - oy, xs[ok] - ox] = im[ys[ok], xs[ok]]
        lost = int((~ok).sum())
        outside = int(((xs < c * cw) | (xs >= (c + 1) * cw)).sum())
        cells.append(can)
        spill.append(outside + lost * 10)
    return cells, pad, cw, chh, spill


def measure(frame, pad, cw, chh):
    """Body measurements of one frame canvas: bounding box, feet row, the feet's centre (grounded anchor) and a body centre."""
    a = frame[:, :, 3] > 64
    if not a.any():
        return None
    ys, xs = np.nonzero(a)
    top, bot = ys.min(), ys.max()
    h = bot - top + 1
    mid = int(np.median(xs[(ys > top + h * 0.2) & (ys < top + h * 0.6)])) if ((ys > top + h * 0.2) & (ys < top + h * 0.6)).any() else int(np.median(xs))
    # feet: the lowest rows near the body (a sword tip far out front does not count)
    near = np.zeros_like(a)
    lo_x, hi_x = max(0, mid - int(h * 0.5)), mid + int(h * 0.5)
    near[:, lo_x:hi_x] = a[:, lo_x:hi_x]
    rows_any = np.nonzero(near.any(axis=1))[0]
    feet = int(rows_any.max()) if len(rows_any) else int(bot)
    foot_band = near[max(0, feet - max(4, int(h * 0.06))): feet + 1]
    fx = np.nonzero(foot_band.any(axis=0))[0]
    feet_cx = int((fx.min() + fx.max()) / 2) if len(fx) else mid
    return {'top': int(top), 'bot': int(bot), 'h': int(h), 'x0': int(xs.min()), 'x1': int(xs.max()), 'mid': mid, 'feet': feet, 'feetCx': feet_cx}


# ------------------------------------------------------------------ load every sheet the animations need
needed = sorted({f.split(':')[0] for a in ANIMS.values() for f in a['frames']})
frames = {}   # "sheet:i" -> canvas
meas = {}
spills = {}
geom = None
missing = []
for sh in needed:
    p = os.path.join(CDIR, 'sheets', sh + '.png')
    if not os.path.exists(p):
        missing.append(sh)
        continue
    im = load_rgba(p)
    spec = (CH.get('sheets') or {}).get(sh) or STD['sheets'][sh]
    cols, rows = spec.get('grid', STD['grid'])
    cells, pad, cw, chh, spill = split_cells(im, cols, rows)
    geom = (pad, cw, chh)
    for i, c in enumerate(cells):
        key = f'{sh}:{i}'
        frames[key] = c
        meas[key] = measure(c, pad, cw, chh)
        spills[key] = spill[i]
        Image.fromarray(c).save(os.path.join(FRAMES, f'{sh}-{i}.png'))
if missing:
    print('missing sheets (their animations are skipped):', ' '.join(missing))
if not frames:
    sys.exit('no sheets to process')
pad, cw, chh = geom
ground = pad + int(round(chh * (1 - STD['groundFrac'])))

# ------------------------------------------------------------------ scale: the idle stance's height -> NATIVE px
stance = [meas[f'idle:{i}'] for i in range(4) if meas.get(f'idle:{i}')]
if not stance:
    sys.exit('the idle sheet is required (it sets the scale)')
stand_h = float(np.median([m['feet'] - m['top'] for m in stance]))
scale = NATIVE / stand_h
# sheets drawn smaller (standFrac): the model misses the asked height by the same factor as on the idle sheet
idle_spec = (CH.get('sheets') or {}).get('idle') or STD['sheets']['idle']
idle_ask = (STD['height'] / idle_spec.get('grid', STD['grid'])[1]) * idle_spec.get('standFrac', STD['standFrac'])
miss = stand_h / idle_ask


def sheet_scale(sheet):
    spec = (CH.get('sheets') or {}).get(sheet) or STD['sheets'][sheet]
    ask = (STD['height'] / spec.get('grid', STD['grid'])[1]) * spec.get('standFrac', STD['standFrac'])
    return NATIVE / (ask * miss)
print(f'stance height {stand_h:.0f} px -> native {NATIVE} px (scale {scale:.3f})')

air_frames = set()
sheet_ground = {}
for a in ANIMS.values():
    for j, f in enumerate(a['frames']):
        if a.get('air') or j in a.get('airFrames', []):
            air_frames.add(f)

# each sheet's own ground line: where its grounded frames' feet actually are (the model does not hit the asked line exactly)
used_all = {f for an in ANIMS.values() for f in an['frames']}
for key, m in meas.items():
    if m and key not in air_frames and key in used_all:
        sh, i = key.split(':')
        spec = (CH.get('sheets') or {}).get(sh) or STD['sheets'][sh]
        sheet_ground.setdefault((sh, int(i) // spec.get('grid', STD['grid'])[0]), []).append(m['feet'] + 1)
sheet_ground = {k: int(np.median(v)) for k, v in sheet_ground.items()}

# ------------------------------------------------------------------ register, downscale, palette
used = sorted({f for a in ANIMS.values() for f in a['frames'] if f in frames})
small = {}
qa = {}
for key in used:
    c = frames[key]
    m = meas[key]
    if m is None:
        continue
    sheet, idx = key.split(':')
    spec = (CH.get('sheets') or {}).get(sheet) or STD['sheets'][sheet]
    row = (sheet, int(idx) // spec.get('grid', STD['grid'])[0])
    if key in air_frames:
        # the row's own ground line (or the nearest row's when every frame in it is airborne)
        g = sheet_ground.get(row) or next((v for (s2, _), v in sheet_ground.items() if s2 == sheet), ground)
        ax, ay = m['mid'], g
    else:
        ax, ay = m['feetCx'], m['feet'] + 1
    s = sheet_scale(sheet)
    h, w = c.shape[:2]
    nw, nh = max(1, int(round(w * s))), max(1, int(round(h * s)))
    # premultiplied area downscale (no dark fringes), then a hard alpha edge
    f = c.astype(np.float32) / 255.0
    f[:, :, :3] *= f[:, :, 3:4]
    d = cv2.resize(f, (nw, nh), interpolation=cv2.INTER_AREA)
    al = d[:, :, 3:4]
    rgb = np.where(al > 1e-4, d[:, :, :3] / np.maximum(al, 1e-4), 0)
    alpha = (al[:, :, 0] >= 0.5).astype(np.float32)
    out = np.dstack([np.clip(rgb, 0, 1), alpha])
    small[key] = ((out * 255).round().astype(np.uint8), ax * s, ay * s)
    qa[key] = {'h': m['h'], 'feetDrift': (m['feet'] + 1 - sheet_ground.get(row, ground)) if key not in air_frames else None,
               'spill': spills[key], 'anchorX': int(ax) - pad}

if 'no-quantize' not in flags:
    # one shared palette for the whole character (frames never shimmer between colour sets)
    px = np.concatenate([v[0][v[0][:, :, 3] > 0][:, :3] for v in small.values()])
    rng = np.random.default_rng(1)
    sample = px[rng.choice(len(px), min(len(px), 60000), replace=False)].astype(np.float32)
    k = int(CH.get('colors', 96))
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5)
    _, _, centers = cv2.kmeans(sample, k, None, crit, 2, cv2.KMEANS_PP_CENTERS)
    centers = centers.astype(np.float32)
    for key, (im, ax, ay) in small.items():
        m = im[:, :, 3] > 0
        cols = im[m][:, :3].astype(np.float32)
        dist = ((cols[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2)
        im[m, :3] = centers[dist.argmin(axis=1)].round().astype(np.uint8)

# ------------------------------------------------------------------ trim + pack (shelf packing, power-of-two width)
items = []
for key, (im, ax, ay) in small.items():
    ys, xs = np.nonzero(im[:, :, 3])
    if not len(ys):
        continue
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    items.append((key, im[y0:y1, x0:x1], ax - x0, ay - y0))
items.sort(key=lambda t: -t[1].shape[0])
W = 2048
x = y = rowh = 0
place = {}
for key, im, ax, ay in items:
    h, w = im.shape[:2]
    if x + w + 1 > W:
        x, y, rowh = 0, y + rowh + 1, 0
    place[key] = (x, y)
    x += w + 1
    rowh = max(rowh, h)
H = y + rowh
H2 = 1 << (int(H - 1).bit_length())
atlas = np.zeros((H2, W, 4), np.uint8)
meta_frames = {}
for key, im, ax, ay in items:
    px_, py_ = place[key]
    h, w = im.shape[:2]
    atlas[py_:py_ + h, px_:px_ + w] = im
    meta_frames[key] = {'x': int(px_), 'y': int(py_), 'w': int(w), 'h': int(h), 'ax': round(float(ax), 1), 'ay': round(float(ay), 1)}
# an indexed PNG: the frames already share one palette, so 8 bits lose nothing and the file is ~5x smaller
Image.fromarray(atlas).quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(os.path.join(OUT, 'atlas.png'), optimize=True)

anims_out = {}
for name, a in ANIMS.items():
    fr = [f for f in a['frames'] if f in meta_frames]
    if len(fr) == len(a['frames']):
        anims_out[name] = {k: v for k, v in a.items() if k != 'frames'} | {'frames': fr}
meta = {'id': CID, 'hero': CH['hero'], 'native': NATIVE, 'base': STD['nativeHeight'], 'size': [W, H2], 'frames': meta_frames, 'anims': anims_out,
        'missing': sorted(set(ANIMS) - set(anims_out))}
json.dump(meta, open(os.path.join(OUT, 'atlas.json'), 'w'), separators=(',', ':'))
json.dump({'scale': scale, 'standHeight': stand_h, 'frames': qa}, open(os.path.join(CDIR, 'qa.json'), 'w'), indent=1)
print(f'atlas {W}x{H2}, {len(meta_frames)} frames, {len(anims_out)}/{len(ANIMS)} animations'
      + (f'; missing: {", ".join(meta["missing"])}' if meta['missing'] else ''))
bad = [k for k, v in qa.items() if v['spill'] > 400 or (v['feetDrift'] is not None and abs(v['feetDrift']) > 40)]
if bad:
    print('QA: check frames (cell spill or feet far from the ground line):', ' '.join(bad))

# ------------------------------------------------------------------ previews: GIF per animation at game speed, contact sheet
if 'previews' in flags:
    Z = 3
    box_h = int(NATIVE * 1.55)
    box_w = int(NATIVE * 1.9)
    for name, a in anims_out.items():
        imgs = []
        for f in a['frames']:
            fm = meta_frames[f]
            can = Image.new('RGBA', (box_w, box_h), (40, 34, 52, 255))
            spr = Image.fromarray(atlas[fm['y']:fm['y'] + fm['h'], fm['x']:fm['x'] + fm['w']])
            ox = int(box_w * 0.4 - fm['ax'])
            oy = int(box_h * 0.9 - fm['ay'])
            can.alpha_composite(spr, (max(0, ox), max(0, oy)))
            for xx in range(box_w):
                can.putpixel((xx, int(box_h * 0.9)), (90, 80, 110, 255))
            imgs.append(can.resize((box_w * Z, box_h * Z), Image.NEAREST).convert('P', palette=Image.ADAPTIVE))
        fps = a.get('fps', 10)
        imgs[0].save(os.path.join(PREV, f'{name}.gif'), save_all=True, append_images=imgs[1:], duration=int(1000 / fps), loop=0, disposal=2)
    # contact sheet: every animation as a row
    rows = list(anims_out.items())
    maxn = max(len(a['frames']) for _, a in rows)
    cs = Image.new('RGBA', (maxn * box_w, len(rows) * box_h), (30, 26, 40, 255))
    for r, (name, a) in enumerate(rows):
        for j, f in enumerate(a['frames']):
            fm = meta_frames[f]
            spr = Image.fromarray(atlas[fm['y']:fm['y'] + fm['h'], fm['x']:fm['x'] + fm['w']])
            ox = int(j * box_w + box_w * 0.4 - fm['ax'])
            oy = int(r * box_h + box_h * 0.9 - fm['ay'])
            cs.alpha_composite(spr, (max(0, ox), max(0, oy)))
    cs.save(os.path.join(PREV, 'contact.png'))
    print('previews in', PREV)
