"""Post-process the super cut-in busts: tools/art-gen/source/cut-NN.png -> packages/client/public/assets/art/cut-NN.png.

Usage: python tools/art-gen/cutin.py [NN ...] [--preview=<dir>]
  no NN = every cut-NN.png found in tools/art-gen/source.

Steps: key the flat #FF00FF magenta backdrop out to alpha (soft edge, colour despill) unless the source already has real
transparency; crop to the alpha bounds; scale to 640 px tall; save an RGBA PNG (quantised to a 256-colour palette with
alpha kept only when the full-colour file would be over 350 KB).
"""
import os
import sys
import numpy as np
import cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(HERE, 'source')
OUT = os.path.join(ROOT, 'packages', 'client', 'public', 'assets', 'art')
TARGET_H = 640
MAX_BYTES = 350 * 1024
KEY = np.array([255.0, 0.0, 255.0])
HARD = 60.0   # distance from the key colour under which a pixel is background
SOFT = 120.0  # distance above which a pixel is fully foreground


def key_alpha(rgb):
    """Alpha from the distance to the magenta key (0 = backdrop, 1 = figure) and the matching colour despill."""
    d = np.linalg.norm(rgb - KEY, axis=2)
    a = np.clip((d - HARD) / (SOFT - HARD), 0.0, 1.0)
    a[a < 0.04] = 0.0
    # un-mix the key colour from partially covered edge pixels: P = a*F + (1-a)*K  ->  F = (P - (1-a)*K) / a
    edge = (a > 0) & (a < 1)
    ae = np.maximum(a[edge], 0.25)[:, None]
    f = (rgb[edge] - (1.0 - a[edge])[:, None] * KEY) / ae
    rgb = rgb.copy()
    rgb[edge] = np.clip(f, 0, 255)
    return rgb, a


def process(name):
    src = os.path.join(SRC, f'{name}.png')
    im = Image.open(src).convert('RGBA')
    arr = np.asarray(im).astype(np.float64)
    rgb, a = arr[..., :3], arr[..., 3] / 255.0
    transparent_share = float((a < 0.5).mean())
    if transparent_share < 0.02:  # opaque: key the magenta backdrop out
        rgb, a = key_alpha(rgb)
    # alpha-bounded crop
    ys, xs = np.where(a > 0.05)
    if len(xs) == 0:
        raise SystemExit(f'{name}: nothing left after keying')
    pad = 6
    x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad + 1, a.shape[1])
    y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad + 1, a.shape[0])
    rgb, a = rgb[y0:y1, x0:x1], a[y0:y1, x0:x1]
    # scale to TARGET_H on premultiplied colour (no dark or pink fringes)
    h, w = a.shape
    nw = max(1, round(w * TARGET_H / h))
    pm = np.dstack([rgb * a[..., None], a[..., None]]).astype(np.float32)
    pm = cv2.resize(pm, (nw, TARGET_H), interpolation=cv2.INTER_AREA)
    alpha = np.clip(pm[..., 3], 0, 1)
    col = np.where(alpha[..., None] > 1e-4, pm[..., :3] / np.maximum(alpha[..., None], 1e-4), 0)
    out = np.dstack([np.clip(col, 0, 255), alpha * 255]).round().astype(np.uint8)
    img = Image.fromarray(out, 'RGBA')
    os.makedirs(OUT, exist_ok=True)
    dst = os.path.join(OUT, f'{name}.png')
    img.save(dst, optimize=True)
    if os.path.getsize(dst) > MAX_BYTES:
        q = img.quantize(colors=256, method=Image.Quantize.FASTOCTREE)
        q.save(dst, optimize=True)
    size = os.path.getsize(dst)
    info = Image.open(dst)
    print(f'{name}: src {Image.open(src).size} -> {info.size} mode {info.mode}, {size // 1024} KB, '
          f'transparent {transparent_share:.0%} of source ({"keyed" if transparent_share < 0.02 else "native alpha"})')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    names = [f'cut-{a.zfill(2)}' for a in args] if args else sorted(
        os.path.splitext(f)[0] for f in os.listdir(SRC) if f.startswith('cut-') and f.endswith('.png'))
    for n in names:
        process(n)
