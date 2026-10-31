"""Install a regenerated hero-select portrait the way h-02 was done.

Usage: python install_portrait.py <character-id> <hero-number>
  e.g. python install_portrait.py h10-gray 10
Reads   art/characters/<id>/references/portrait-v2.png (1024x1536 card from `node tools/sprites/gen.mjs <id> portrait`)
Backs up the old references/portrait.jpg to references/old/portrait-v1.jpg (once),
centre-crops to 3:4, resizes to 240x320 and writes references/portrait.jpg and
packages/client/public/assets/art/h-NN.jpg (JPEG quality 86).
"""
import os
import shutil
import sys

import cv2

ROOT = r'C:\Users\vascu\Projects\bladerift'
cid, num = sys.argv[1], int(sys.argv[2])
ref = os.path.join(ROOT, 'art', 'characters', cid, 'references')
src = os.path.join(ref, 'portrait-v2.png')
img = cv2.imread(src, cv2.IMREAD_COLOR)
if img is None:
    sys.exit(f'missing {src}')
h, w = img.shape[:2]
ch = w * 4 // 3
if ch <= h:
    off = (h - ch) // 2
    img = img[off:off + ch]
else:
    cw = h * 3 // 4
    off = (w - cw) // 2
    img = img[:, off:off + cw]
card = cv2.resize(img, (240, 320), interpolation=cv2.INTER_AREA)
old = os.path.join(ref, 'old')
os.makedirs(old, exist_ok=True)
cur = os.path.join(ref, 'portrait.jpg')
if os.path.exists(cur) and not os.path.exists(os.path.join(old, 'portrait-v1.jpg')):
    shutil.copy2(cur, os.path.join(old, 'portrait-v1.jpg'))
cv2.imwrite(cur, card, [cv2.IMWRITE_JPEG_QUALITY, 86])
dst = os.path.join(ROOT, 'packages', 'client', 'public', 'assets', 'art', 'h-%02d.jpg' % num)
cv2.imwrite(dst, card, [cv2.IMWRITE_JPEG_QUALITY, 86])
print('installed', dst, 'and', cur)
