"""Slice the generated art (tools/art-gen/source) into game assets (packages/client/public/assets/art).

Item sheets are grids: each cell is cropped, cleaned (near-transparent alpha dropped) and trimmed to its content.
Backdrops are resized and saved as JPEG. Platform strips are cut by rows and trimmed.
Usage: python tools/art-gen/slice.py
"""
import os
import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'source')
OUT = os.path.join(HERE, '..', '..', 'packages', 'client', 'public', 'assets', 'art')
os.makedirs(OUT, exist_ok=True)


def trim(img, pad=4):
    a = img[:, :, 3]
    a[a < 24] = 0
    ys, xs = np.nonzero(a)
    if not len(xs):
        return None
    y0, y1, x0, x1 = max(0, ys.min() - pad), min(img.shape[0], ys.max() + pad + 1), max(0, xs.min() - pad), min(img.shape[1], xs.max() + pad + 1)
    return img[y0:y1, x0:x1]


def largest_component(cell):
    """Keep the biggest opaque blob (drops stray specks bleeding in from neighbouring cells)."""
    a = (cell[:, :, 3] > 24).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(a, 8)
    if n <= 1:
        return cell
    keep = np.zeros(n, bool)
    big = stats[1:, cv2.CC_STAT_AREA].max()
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= big * 0.2:
            keep[i] = True
    mask = keep[lab]
    out = cell.copy()
    out[~mask] = 0
    return out


def grid(name, rows, cols, names, max_side=256):
    img = cv2.imread(os.path.join(SRC, name + '.png'), cv2.IMREAD_UNCHANGED)
    h, w = img.shape[:2]
    for r in range(rows):
        for c in range(cols):
            n = names[r * cols + c]
            if not n:
                continue
            cell = img[r * h // rows:(r + 1) * h // rows, c * w // cols:(c + 1) * w // cols].copy()
            t = trim(largest_component(cell))
            if t is None:
                print('empty cell', name, r, c)
                continue
            s = max_side / max(t.shape[:2])
            if s < 1:
                t = cv2.resize(t, (round(t.shape[1] * s), round(t.shape[0] * s)), interpolation=cv2.INTER_AREA)
            cv2.imwrite(os.path.join(OUT, n + '.png'), t)
            print(n, t.shape[1], 'x', t.shape[0])


def strips(name, names, width=1024):
    img = cv2.imread(os.path.join(SRC, name + '.png'), cv2.IMREAD_UNCHANGED)
    a = img[:, :, 3] > 24
    rows = a.any(axis=1)
    # runs of opaque rows = strips
    runs, start = [], None
    for y, v in enumerate(rows):
        if v and start is None:
            start = y
        if not v and start is not None:
            if y - start > 40:
                runs.append((start, y))
            start = None
    for (y0, y1), n in zip(runs, names):
        t = trim(img[y0:y1].copy(), pad=0)
        # cut the ragged ends off so it tiles: the middle 90 %
        x0, x1 = int(t.shape[1] * 0.04), int(t.shape[1] * 0.96)
        t = t[:, x0:x1]
        s = width / t.shape[1]
        t = cv2.resize(t, (width, round(t.shape[0] * s)), interpolation=cv2.INTER_AREA)
        cv2.imwrite(os.path.join(OUT, n + '.png'), t)
        print(n, t.shape[1], 'x', t.shape[0])


def backdrop(name, w=1536):
    img = cv2.imread(os.path.join(SRC, name + '.png'), cv2.IMREAD_COLOR)
    s = w / img.shape[1]
    img = cv2.resize(img, (w, round(img.shape[0] * s)), interpolation=cv2.INTER_AREA)
    cv2.imwrite(os.path.join(OUT, 'bg-' + name + '.jpg'), img, [cv2.IMWRITE_JPEG_QUALITY, 82])
    print('bg-' + name, img.shape[1], 'x', img.shape[0])


grid('weapons', 2, 4, ['w-scythe', 'w-lance', 'w-sword', 'w-hammer', 'w-dagger', 'w-bow', 'w-shield', 'w-arrow'])
grid('skills', 2, 4, ['s-bomb', 's-frost', 's-trap', 's-blink', 'i-flask', 'i-ember', 's-trap-shut', 'i-ice'])
strips('platforms', ['p-bridge', 'p-embers', 'p-crypt', 'p-grove'])
for b in ['bridge', 'embers', 'crypt', 'grove']:
    backdrop(b)
