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


def square_icons(name, names, size=160, rows=4):
    """A 4xN sheet of framed square icons: exact cells, no trimming (the frame is part of the icon)."""
    img = cv2.imread(os.path.join(SRC, name + '.png'), cv2.IMREAD_COLOR)
    h, w = img.shape[:2]
    for i, n in enumerate(names):
        r, c = divmod(i, 4)
        cell = img[r * h // rows:(r + 1) * h // rows, c * w // 4:(c + 1) * w // 4]
        cell = cv2.resize(cell, (size, size), interpolation=cv2.INTER_AREA)
        cv2.imwrite(os.path.join(OUT, n + '.jpg'), cell, [cv2.IMWRITE_JPEG_QUALITY, 88])
    print(name, len(names), 'icons')


square_icons('icons-abilities', ['i-jump', 'i-roll', 'i-heal', 'i-art', 'a-cleave', 'a-hail', 'a-fang', 'a-thunder',
                                 'a-flash', 'a-frenzy', 'a-bulwark', 'k-bomb', 'k-frost', 'k-trap', 'k-blink', 'i-attack'])
square_icons('icons-gear', ['g-sword', 'g-scythe', 'g-lance', 'g-daggers', 'g-hammer', 'g-bow', 'g-shield', 'g-staff',
                            'c-saber', 'c-archer', 'c-lancer', 'c-caster', 'c-assassin', 'c-berserker', 'c-shielder', 'c-blank'])
square_icons('icons-arts2', ['a-vault', 'a-chains', 'a-fate', 'a-hand', 'a-fog', 'a-stampede', 'a-hunt', 'a-spare'], rows=2)
# per-hero specials (k-NN, skill id = hero id) and dodges (d-NN, hero id); the sheets' last cells are spare
square_icons('icons-specials', ['k-%02d' % i for i in range(14)])
square_icons('icons-dodges', ['d-%02d' % i for i in range(14)])


def portraits(name, first, count, w=240, h=320):
    """A 2x4 sheet of framed portrait cards: exact cells (hero portraits h-00.jpg ...)."""
    img = cv2.imread(os.path.join(SRC, name + '.png'), cv2.IMREAD_COLOR)
    H, W = img.shape[:2]
    for i in range(count):
        r, c = divmod(i, 4)
        cell = img[r * H // 2:(r + 1) * H // 2, c * W // 4:(c + 1) * W // 4]
        cell = cv2.resize(cell, (w, h), interpolation=cv2.INTER_AREA)
        cv2.imwrite(os.path.join(OUT, 'h-%02d.jpg' % (first + i)), cell, [cv2.IMWRITE_JPEG_QUALITY, 86])
    print(name, count, 'portraits')


portraits('portraits-1', 0, 8)
portraits('portraits-2', 8, 6)

# The lore pass (2026-10-31, docs/lore/kit-changes.md): AFTER the older sheets, so its icons replace the old ones.
# (Portraits regenerated per hero by tools/sprites/install_portrait.py are newer than portraits-1/2: re-install them
# after running this script.)
square_icons('icons-lore', ['g-gate', 'g-chains', 'g-claws', 'g-knives', 'g-kopis', 'k-11', 'a-frenzy', 'a-fog', 'a-hunt',
                            'a-fang', 'a-hail', 'k-01', 'k-03', 'd-09', 'a-bulwark'])
grid('relics', 2, 4, ['r-gold-sword', 'r-silver-sword', 'r-gold-spear', 'r-silver-axe', 'r-gold-halberd',
                      'r-silver-greatsword', 'r-gold-shortsword', 'r-silver-glaive'])
