"""Install the arena art from art/arenas/ into the client and find each wall's light sources.

  python tools/arena/install.py

Writes packages/client/public/assets/art/wall-<theme>.jpg (back wall) and floor-<theme>.jpg (seamless floor), and
packages/client/src/render/arenaLights.json: per theme, the lamps painted on the wall (normalised position, size, colour),
found as the bright, saturated blobs of the picture. The game turns each into a light (render/lighting.ts).
"""
import json
import os
import sys

from PIL import Image, ImageFilter
import numpy as np

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SRC = os.path.join(ROOT, 'art', 'arenas')
OUT = os.path.join(ROOT, 'packages', 'client', 'public', 'assets', 'art')
LIGHTS = os.path.join(ROOT, 'packages', 'client', 'src', 'render', 'arenaLights.json')
THEMES = ['hall', 'bridge', 'embers', 'crypt', 'grove']


def blobs(img: Image.Image):
    """Bright light sources: pixels well above the picture's brightness, grouped into blobs (flood fill on a small copy)."""
    small = img.convert('RGB').resize((384, 256), Image.BILINEAR)
    a = np.asarray(small).astype(np.float32) / 255.0
    lum = a.max(axis=2)
    sat = lum - a.min(axis=2)
    thr = max(0.72, float(np.percentile(lum, 99.2)))
    mask = (lum >= thr) & ((sat > 0.18) | (lum > 0.92))
    h, w = mask.shape
    seen = np.zeros_like(mask)
    out = []
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or seen[y, x]:
                continue
            stack = [(y, x)]
            seen[y, x] = True
            px = []
            while stack:
                cy, cx = stack.pop()
                px.append((cy, cx))
                for dy in (-2, -1, 0, 1, 2):
                    for dx in (-2, -1, 0, 1, 2):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            stack.append((ny, nx))
            if len(px) < 3:
                continue
            ys = np.array([p[0] for p in px])
            xs = np.array([p[1] for p in px])
            col = a[ys, xs].mean(axis=0)
            # the light's hue, pushed toward full brightness
            col = col / max(1e-3, col.max())
            size = float(np.sqrt(len(px)))
            out.append({
                'u': round(float(xs.mean()) / w, 4),
                'v': round(float(ys.mean()) / h, 4),
                'size': round(size / w, 4),
                'c': '#%02x%02x%02x' % tuple(int(round(c * 255)) for c in col),
            })
    # the strongest first, at most 18 per wall
    out.sort(key=lambda b: -b['size'])
    return out[:18]


def main():
    lights = {}
    for t in THEMES:
        w = os.path.join(SRC, f'wall-{t}.png')
        f = os.path.join(SRC, f'floor-{t}.png')
        if not (os.path.exists(w) and os.path.exists(f)):
            print('missing', t)
            continue
        wall = Image.open(w).convert('RGB')
        wall.save(os.path.join(OUT, f'wall-{t}.jpg'), quality=86, optimize=True, progressive=True)
        floor = Image.open(f).convert('RGB')
        # resized on a 3x3 tiling and cut from the middle, so the edges still meet seamlessly
        n = floor.width
        big = Image.new('RGB', (n * 3, n * 3))
        for i in range(3):
            for j in range(3):
                big.paste(floor, (i * n, j * n))
        big = big.resize((1024 * 3, 1024 * 3), Image.LANCZOS)
        big.crop((1024, 1024, 2048, 2048)).save(os.path.join(OUT, f'floor-{t}.jpg'), quality=84, optimize=True, progressive=True)
        lights[t] = blobs(wall)
        print(t, len(lights[t]), 'lights')
    # props: a theme's platform ledge strip (p-<theme>.png, 1024 wide, tiled) and its pillar (pillar-<theme>.png)
    for t in THEMES:
        for kind, out_name, width in (('ledge', f'p-{t}.png', 1024), ('pillar', f'pillar-{t}.png', 256)):
            src = os.path.join(SRC, f'{kind}-{t}.png')
            if not os.path.exists(src):
                continue
            im = Image.open(src).convert('RGBA')
            # cropped to the solid pixels (faint alpha noise round the object is dropped)
            al = im.split()[-1].point(lambda v: 255 if v > 24 else 0)
            im = im.crop(al.getbbox())
            im = im.resize((width, max(1, round(im.height * width / im.width))), Image.LANCZOS)
            im.save(os.path.join(OUT, out_name), optimize=True)
            print(out_name, im.size)
    with open(LIGHTS, 'w', encoding='utf-8') as fh:
        json.dump(lights, fh, indent=1)
        fh.write('\n')


if __name__ == '__main__':
    sys.exit(main())
