"""Skyfire Squad character pipeline - step 3: turn sliced parts into rig-ready atlas frames.

Usage: python tools/character-pipeline/build_rig.py [outfit ...]

For every outfit (parts/<outfit>/*.png from slice.py) and the shared accessories it:
  * straightens each limb along its own axis (least-squares fit of the per-row centre line) and finds its joints
  * scales every bone to the rig lengths (packages/client/src/render/hero/rig.ts BONES) - 1 rig unit = 4 px in the
    game atlas (art/hero) and 6 px in the customiser preview atlas (art/herohi); cuts the footwear into a foot part
  * heads come from the v3 head set (parts/heads, one shared skull template) at ONE common scale
  * splits the outfit's signature colour into a separate greyscale TINT layer (<frame>_t) that the game multiplies by
    the player/team colour, and the jetpack glow into an ACCENT layer (<frame>_a)
  * makes 4 skin-tone variants of heads/bare arms by remapping skin pixels (<frame>_s0..s3)
  * writes SVG wrappers (embedded PNG + data-pivot) for tools/build-art.mjs, a preview contact sheet and
    packages/client/src/render/hero/heroData.ts (pivots, cloth specs, accessory anchors).
"""
import base64
import io
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
PARTS = os.path.join(HERE, 'parts')
ART = os.path.join(ROOT, 'packages', 'client', 'art')
OUT_LO = os.path.join(ART, 'hero')
OUT_HI = os.path.join(ART, 'herohi')
DATA_TS = os.path.join(ROOT, 'packages', 'client', 'src', 'render', 'hero', 'heroData.ts')
PREVIEW = os.path.join(HERE, 'preview')

LO = 4   # px per world unit (game atlas): above the ~2-3.5 device px per unit the game displays, so parts are
         # minified (crisp) rather than magnified (blurry), also when rotated
BUILD_PX = 2  # tools/build-art.mjs rasterises SVG world units at 2 px: frames are wrapped at this density
HI = 6   # px per world unit (customiser preview atlas)

BONES = {'uarm': 11.0, 'farm': 10.5, 'thigh': 13.0, 'shin': 13.5}   # shin = knee to SOLE (with the foot flat)
ANKLE_H = 2.8     # ankle joint above the sole: the footwear below it is a separate foot part (rig.ts BONES.ankle)
HEAD_H = 16.0     # (v2 outfit-sheet heads only) head incl. hair and neck stub
# v3 heads (parts/heads, one shared skull template): ONE scale for the whole set, so every outfit has the same skull.
# HEAD_SET_H = neck-cut to crown of the close-cropped heads (median of the set): crown-to-chin ~12.2 units, ~4.5 heads
# tall figure (soles 38 below the shoulder, crown ~17 above it).
HEAD_SET_H = 14.9
# Capped heads (under crown-covering hats) keep everything below this height above the neck pivot (units): just above
# the brow / ear tops, below every crown-covering hat's rim (HAT_AT in heroLook.ts).
CAP_CUT = 10.2
TORSO_H = 12.6    # neck cut to waist cut
# v3 armless torsos (parts/torsos): collar top to waist; collar placement relative to the shoulder joint, matching
# rig.ts BONES.neck (x 0.9): the neck stub tucks COLLAR_TOP - 1.0 = 1.3 units under the collar
TORSO_H_V3 = 13.6
NECK_X = 0.9
COLLAR_TOP = 2.3
# Straight neck (v3 heads): the painted neck stub tapers like a funnel (its back runs ~45 deg from the nape down to a thin
# stub), which read as a bent, disconnected neck. The builder widens it so its back drops straight down from the nape,
# then splits it off: a NECK part fixed to the torso (always straight on the body) and the head, cut just under the jaw,
# which pitches on top of it. All in units: column width; how far the column reaches above the nape inside the head
# (hidden, shows only as the head pitches) and below the head pivot under the collar (hidden by the torso); the head's
# cut fades out between CUT_LO and CUT_HI above the head pivot (rig.ts BONES.nod sits in the middle).
NECK_W = 5.0
NECK_TOP = 1.4
NECK_LOW = 2.2
CUT_LO, CUT_HI = 1.8, 2.1
PELVIS_H = 6.6
# Limb parts whose top end was painted as an OPEN tube (an oval cut face in skin / lining / the tint colour). Each lower
# segment is drawn over its parent, so the oval showed as a disc at the shoulder, elbow, hip or knee: cap_top() closes it.
CAP_TOP = {('tracksuit', 'uarm'), ('tracksuit', 'farm'), ('tracksuit', 'thigh'), ('tracksuit', 'shin'),
           ('hawaiian', 'uarm'), ('hawaiian', 'thigh'), ('hawaiian', 'shin')}
# Grey padded knees (owner reference) that came out tan and read as skin showing through torn trousers
GREY_KNEES = {('tracksuit', 'thigh'), ('tracksuit', 'shin')}
PACK_H = 14.0

OUTFITS = ['armour', 'suit', 'tracksuit', 'ninja', 'hawaiian']

# signature colour -> player tint (HSV ranges: h in degrees, s/v 0..1). Several ranges may be listed.
TINT = {
    'armour': [((55, 105), (0.18, 0.75), (0.12, 0.7))],            # olive armour
    'suit': [],                                                      # the tie piece is fully tinted instead
    'tracksuit': [((10, 38), (0.5, 1.0), (0.45, 1.0))],             # orange panels
    'ninja': [((12, 38), (0.55, 1.0), (0.5, 1.0))],                 # orange cords / accents
    'hawaiian': [((340, 360), (0.42, 1.0), (0.3, 1.0)), ((0, 12), (0.42, 1.0), (0.3, 1.0))],  # red shirt
}
FULL_TINT = {('suit', 'tie')}
# part-specific tint ranges (replace the outfit's TINT for that part): the suit's tie lies on the shirt under the near arm,
# hidden in most poses, so the white casing of its jetpack carries the player / team colour in every pose
PART_TINT = {('suit', 'pack'): [((0, 360), (0.0, 0.16), (0.62, 1.0))]}
# glow strips -> accent colour (cyan / blue / orange emissive panels on the jetpack)
GLOW = [((170, 215), (0.35, 1.0), (0.65, 1.0)), ((15, 45), (0.55, 1.0), (0.85, 1.0))]
# parts that show bare skin and get the 4 skin variants
SKIN_PARTS = {'head': True, 'farm': ('suit', 'hawaiian', 'tracksuit'), 'uarm': ('hawaiian',)}
# skin / hair are recoloured at run time: <frame>_k (skin) and <frame>_h (hair) are greyscale layers whose median is
# 0.5, drawn over the base with the OVERLAY tint mode, so the chosen colour lands exactly on the median tone and the
# painted shading is kept (any colour from the colour picker, no baked variants)
OVERLAY_LAYERS = ('_t', '_a', '_k', '_h')


def hsv(arr):
    rgb = arr[..., :3].astype(np.float32) / 255
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    d = mx - mn + 1e-6
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    s = np.where(mx > 0, (mx - mn) / (mx + 1e-6), 0)
    return h, s, mx


def in_ranges(arr, ranges):
    h, s, v = hsv(arr)
    m = np.zeros(arr.shape[:2], bool)
    for (h0, h1), (s0, s1), (v0, v1) in ranges:
        m |= (h >= h0) & (h <= h1) & (s >= s0) & (s <= s1) & (v >= v0) & (v <= v1)
    return m & (arr[..., 3] > 20)


def axis_fit(al, y0f, y1f):
    """Fit x = m*y + c through the per-row centres of the alpha span between fractions y0f..y1f of the height."""
    ys, xs = np.nonzero(al > 60)
    top, bot = ys.min(), ys.max()
    h = bot - top
    pts = []
    for y in range(int(top + h * y0f), int(top + h * y1f)):
        row = np.nonzero(al[y] > 60)[0]
        if len(row) > 2:
            pts.append((y, (row.min() + row.max()) / 2))
    if len(pts) < 4:
        return 0.0, float(xs.mean())
    P = np.array(pts)
    m, c = np.polyfit(P[:, 0], P[:, 1], 1)
    return float(m), float(c)


def straighten(img, y0f=0.2, y1f=0.8):
    al = np.asarray(img)[..., 3]
    m, _ = axis_fit(al, y0f, y1f)
    ang = math.degrees(math.atan(m))
    if abs(ang) > 0.5:
        img = img.rotate(-ang, resample=Image.BICUBIC, expand=True)
    return trim(img)


def trim(img, pad=2):
    al = np.asarray(img)[..., 3]
    ys, xs = np.nonzero(al > 8)
    return img.crop((max(0, xs.min() - pad), max(0, ys.min() - pad), xs.max() + pad + 1, ys.max() + pad + 1))


def col_centre(al, y):
    row = np.nonzero(al[int(y)] > 60)[0]
    return (row.min() + row.max()) / 2 if len(row) else al.shape[1] / 2


def limb(img, kind):
    """Returns (img, top joint (x, y) px, bone length px) for a vertical limb part."""
    img = straighten(img, 0.18 if kind != 'shin' else 0.1, 0.8 if kind != 'shin' else 0.5)
    al = np.asarray(img)[..., 3]
    ys, _ = np.nonzero(al > 60)
    top, bot = ys.min(), ys.max()
    h = bot - top
    if kind == 'farm':
        jy = top + h * 0.09
        jx = col_centre(al, jy + h * 0.05)
        band = al[int(bot - h * 0.24):bot + 1]
        by, bx = np.nonzero(band > 60)
        gx, gy = bx.mean(), by.mean() + bot - h * 0.24
        L = math.hypot(gx - jx, gy - jy)
    elif kind == 'shin':
        jy = top + h * 0.09
        jx = col_centre(al, jy + h * 0.06)
        L = bot - jy
    else:
        jy = top + h * 0.11
        jx = col_centre(al, jy + h * 0.06)
        ky = bot - h * 0.11
        L = ky - jy
    return img, (jx, jy), L


def cap_top(img, f=0.135):
    """Close a limb's open top end: rows above top + f * length (the oval cut face ends by ~0.12) take the colours of the
    fabric mirrored from just below, so stripes and prints run on over a closed, rounded end (the silhouette is kept)."""
    a = np.asarray(img).copy()
    al = a[..., 3]
    ys = np.nonzero((al > 60).any(axis=1))[0]
    top, bot = ys.min(), ys.max()
    yf = int(top + f * (bot - top))
    for y in range(max(0, top - 3), yf):
        src = a[min(2 * yf - y, a.shape[0] - 1)]
        ok = src[:, 3] >= 128
        a[y, ok, :3] = src[ok, :3]
    return Image.fromarray(a, 'RGBA')


def grey_knees(img):
    """Tan knee patches -> the grey padded knees of the owner's reference (same shading)."""
    a = np.asarray(img).copy()
    h, sat, val = hsv(a)
    m = (h >= 12) & (h <= 48) & (sat >= 0.12) & (sat < 0.5) & (val > 0.25) & (a[..., 3] > 40)
    lum = a[..., :3].astype(np.float32) @ np.array([0.3, 0.59, 0.11], np.float32)
    g = np.stack([lum * 0.9, lum * 0.92, lum * 0.97], -1)
    a[..., :3] = np.where(m[..., None], np.clip(g, 0, 255), a[..., :3]).astype(np.uint8)
    return Image.fromarray(a, 'RGBA')


def head_set_px():
    """Median neck-cut-to-crown height (px) of the v3 head set: the shared head scale reference."""
    hs = []
    for f in sorted(os.listdir(os.path.join(PARTS, 'heads'))):
        if f.endswith('.png') and f != 'contact.png':
            al = np.asarray(Image.open(os.path.join(PARTS, 'heads', f)).convert('RGBA'))[..., 3]
            ys = np.nonzero((al > 60).any(axis=1))[0]
            hs.append(ys.max() - ys.min())
    return float(np.median(hs))


def min_area(mask, area):
    """Mask of the connected components of at least `area` pixels."""
    from collections import deque
    h, w = mask.shape
    seen = np.zeros((h, w), bool)
    out = np.zeros((h, w), bool)
    for y0, x0 in zip(*np.nonzero(mask)):
        if seen[y0, x0]:
            continue
        seen[y0, x0] = True
        q = deque([(y0, x0)])
        comp = []
        while q:
            y, x = q.popleft()
            comp.append((y, x))
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True
                    q.append((yy, xx))
        if len(comp) >= area:
            ys, xs = zip(*comp)
            out[list(ys), list(xs)] = True
    return out


def reach(mask, seed):
    """Pixels of `mask` connected (4-neighbour) to any pixel of `seed`."""
    from collections import deque
    h, w = mask.shape
    out = seed & mask
    q = deque(zip(*np.nonzero(out)))
    while q:
        y, x = q.popleft()
        for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not out[yy, xx]:
                out[yy, xx] = True
                q.append((yy, xx))
    return out


def main_parts(mask, keep=0.15):
    """Mask of the connected components (4-neighbour) at least `keep` times the size of the largest one."""
    from collections import deque
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    sizes = [0]
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]:
            continue
        n = len(sizes)
        lab[y0, x0] = n
        q = deque([(y0, x0)])
        c = 0
        while q:
            y, x = q.popleft()
            c += 1
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n
                    q.append((yy, xx))
        sizes.append(c)
    big = max(sizes)
    ok = np.array([False] + [c >= big * keep for c in sizes[1:]])
    return ok[lab]


def split_foot(img, sole_y, s):
    """Cut the footwear off a straightened shin at the ankle (ANKLE_H above the sole) so the foot can stay flat on the
    ground while the shin swings. Both pieces keep a disc around the ankle pivot, so the joint is covered at any angle
    (classic cut-out puppet joint). Returns (shin, foot, ankle pivot (x, y) in the foot image)."""
    arr = np.asarray(img).copy()
    al = arr[..., 3]
    ay = int(round(sole_y - ANKLE_H / s))
    # the shin SHAFT is measured at mid-shin: tall footwear (combat boots) already juts forward well above the ankle
    shaft_y = int(round(sole_y - 6.5 / s))
    row = np.nonzero(al[shaft_y] > 60)[0]
    ax = (row.min() + row.max()) / 2
    r = min((row.max() - row.min()) / 2, (ANKLE_H - 0.6) / s)
    yy, xx = np.mgrid[0:al.shape[0], 0:al.shape[1]]
    disc = (xx - ax) ** 2 + (yy - ay) ** 2 <= r * r
    # joint disc as wide as the shaft (capped so it ends above the sole). Below mid-shin, SOLID footwear that juts out
    # of the shaft's column (toe cap, instep, heel) belongs to the foot; an opening leaves thin slivers (trouser edges)
    # on the shin
    band = (xx >= row.min() - 1) & (xx <= row.max() + 1)
    lower = yy > shaft_y
    jut = lower & ~band & (al > 60)
    k = max(3, int(0.6 / s) | 1)
    jut = np.asarray(Image.fromarray((jut * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(k)).filter(ImageFilter.MaxFilter(k))) > 127
    jut &= yy < ay + 2
    shin = arr.copy()
    shin[..., 3] = np.where(((yy <= ay) & ~jut) | disc, al, 0)
    foot = arr.copy()
    foot[..., 3] = np.where((yy >= ay) | disc | jut, al, 0)
    foot[..., 3] = np.where(main_parts(foot[..., 3] > 30), foot[..., 3], 0)  # drop stray flecks (trouser hem edges)
    shin[..., 3] = np.where(main_parts(shin[..., 3] > 30), shin[..., 3], 0)
    fy = np.nonzero(foot[..., 3].max(axis=1) > 0)[0]
    top = max(0, int(fy.min()) - 2)
    foot_img = Image.fromarray(foot[top:], 'RGBA')
    shin_img = Image.fromarray(shin[:int(ay + r + 2)], 'RGBA')
    return shin_img, foot_img, (ax, ay - top)


def luminance(arr):
    return (0.3 * arr[..., 0] + 0.59 * arr[..., 1] + 0.11 * arr[..., 2]) / 255


def split_layer(img, mask, target_mean=0.78):
    """Base keeps the region as neutral grey; layer = region luminance (normalised) for multiply tinting."""
    arr = np.asarray(img).astype(np.float32)
    if mask.sum() < 12:
        return img, None
    soft = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32) / 255
    L = luminance(arr)
    mean = L[mask].mean() if mask.any() else 0.5
    Ln = np.clip(L * (target_mean / max(0.05, mean)), 0, 1)
    grey = np.dstack([Ln * 255] * 3)
    base = arr.copy()
    base[..., :3] = arr[..., :3] * (1 - soft[..., None]) + grey * soft[..., None]
    layer = np.zeros_like(arr)
    layer[..., :3] = grey
    layer[..., 3] = arr[..., 3] * soft
    return Image.fromarray(base.astype(np.uint8), 'RGBA'), Image.fromarray(layer.astype(np.uint8), 'RGBA')


def skin_mask(arr, head=False, below=0.0):
    h, s, v = hsv(arr)
    m = (h >= 4) & (h <= 36) & (s >= 0.16) & (s <= 0.62) & (v >= 0.5) & (arr[..., 3] > 40)
    # also take the warm, saturated shadow tones (hair / beard / leather are darker than v 0.38)
    m |= (h >= 0) & (h <= 34) & (s >= 0.12) & (s <= 0.88) & (v >= 0.38) & (arr[..., 3] > 40)
    if below > 0:
        # e.g. the Hawaiian upper arm: skin only shows below the (flower-printed) sleeve
        ys, _ = np.nonzero(arr[..., 3] > 60)
        rows = np.arange(arr.shape[0])[:, None]
        m &= rows > ys.min() + (ys.max() - ys.min()) * below
    if head:
        # hair highlights / beard share the skin's hue: keep only the face-and-neck region - the main connected
        # component after an opening that breaks thin links - grown back inside the colour mask (no fixed hairline
        # cut: that left an unrecoloured band across the forehead of close-cropped heads)
        k = max(5, (min(arr.shape[:2]) // 40) | 1)
        op = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(k)).filter(ImageFilter.MaxFilter(k))) > 127
        # (the face and the neck may both be large when a beard splits them: keep every large region, not just the biggest)
        main = main_parts(op, 0.4)
        # plus pieces a beard splits off (cheek, ear): sizeable and starting below the upper 40 % of the head, where
        # the hair is
        ys = np.nonzero((arr[..., 3] > 60).any(axis=1))[0]
        line = ys.min() + 0.4 * (ys.max() - ys.min())
        rest = min_area(op & ~main, (k * 3) ** 2)
        rows = np.arange(arr.shape[0])[:, None]
        hair_zone = rest & (rows < line)
        # drop any split-off piece that reaches into the hair zone
        pieces = rest & ~reach(rest, hair_zone)
        face = main | pieces
        grow = lambda f: np.asarray(Image.fromarray((f * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(k + 2))) > 127
        face = grow(face) & m
        face |= grow(face) & m & (rows >= line)  # thin edges below the hairline (ear rims)
        m = face
    # close small holes / specks so tones recolour as smooth areas, never as blotches
    img = Image.fromarray((m * 255).astype(np.uint8))
    img = img.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    return (np.asarray(img) > 127) & (arr[..., 3] > 40)


def check_skin_coverage(name, arr, mask, limit=0.002):
    """Regression guard: skin the mask missed keeps the source tone in every skin variant (the v3 hairline band).
    Fails the build if more than `limit` of the skin area is un-masked pixels with the head's own skin colour."""
    med = np.median(arr[mask][:, :3].astype(int), axis=0)
    near = (arr[..., 3] > 200) & ~mask & (np.abs(arr[..., :3].astype(int) - med).sum(-1) < 45)
    frac = near.sum() / max(1, mask.sum())
    if frac > limit:
        raise SystemExit(f'{name}: {frac:.4f} of the skin is outside the skin mask (unrecoloured band) - fix skin_mask()')


def overlay_layer(img, mask, compress=False):
    """Greyscale overlay layer: grey = luminance / the region's median * 0.5 (the overlay tint maps the median to the chosen
    colour exactly), alpha = the soft region mask. compress: soften the extremes (dark hair has bright streaks that a
    plain ratio pushes to white)."""
    arr = np.asarray(img).astype(np.float32)
    if mask.sum() < 20:
        return None
    L = luminance(arr)
    r = L / max(0.02, float(np.median(L[mask])))
    g = 0.5 * r / (0.6 + 0.4 * r) if compress else 0.5 * r
    soft = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))).astype(np.float32) / 255
    out = np.zeros_like(arr)
    out[..., :3] = np.clip(g, 0, 1)[..., None] * 255
    out[..., 3] = arr[..., 3] * soft
    return Image.fromarray(out.astype(np.uint8), 'RGBA')


def components(mask):
    """Connected components (4-neighbour) as lists of (y, x)."""
    from collections import deque
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    out = []
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]:
            continue
        lab[y0, x0] = len(out) + 1
        q = deque([(y0, x0)])
        pts = []
        while q:
            y, x = q.popleft()
            pts.append((y, x))
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = len(out) + 1
                    q.append((yy, xx))
        out.append(pts)
    return out


def hair_mask(arr, skin):
    """Hair (and beard) of a v3 head: non-skin, non-outline pieces that reach the silhouette edge (the scalp hair, the
    beard), plus the pieces next to them that outline strokes split off (fringe strands). Eyes and brows stay out."""
    al = arr[..., 3]
    _, _, v = hsv(arr)
    grow = lambda m, k: np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(k))) > 127
    cand = (al > 100) & ~grow(skin, 3) & (v > 0.10)
    edge = grow(al < 30, 13)
    keep = np.zeros(cand.shape, bool)
    parts = components(cand)
    for pts in parts:
        ys, xs = zip(*pts)
        if len(pts) > 200 and edge[ys, xs].any():
            keep[ys, xs] = True
    near = grow(keep, 9)
    for pts in parts:
        ys, xs = zip(*pts)
        if len(pts) > 30 and near[ys, xs].any():
            keep[ys, xs] = True
    # eyebrows follow the hair colour: small, horizontally elongated dark pieces in the brow band of the face (front
    # half, 25-50 % down the head), separate from the eye below (which carries the light eye white)
    oy, ox = np.nonzero(al > 60)
    top, H = oy.min(), oy.max() - oy.min()
    left, W = ox.min(), ox.max() - ox.min()
    for pts in components(cand & ~keep):
        if not 60 <= len(pts) <= 3000:
            continue
        ys, xs = np.array([p[0] for p in pts]), np.array([p[1] for p in pts])
        cy, cx = (ys.mean() - top) / H, (xs.mean() - left) / W
        h, w = ys.max() - ys.min() + 1, xs.max() - xs.min() + 1
        if 0.25 < cy < 0.5 and cx > 0.55 and w >= 1.8 * h and (v[ys, xs] > 0.75).mean() < 0.15:
            keep[ys, xs] = True
    return keep

def svg_wrap(img, px_per_unit, pivot_px):
    buf = io.BytesIO()
    img.save(buf, 'PNG', optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode()
    w, h = img.size
    W, Hh = w / px_per_unit, h / px_per_unit
    pvx, pvy = pivot_px[0] / px_per_unit, pivot_px[1] / px_per_unit
    return (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{W:.3f}" height="{Hh:.3f}" '
            f'viewBox="0 0 {W:.3f} {Hh:.3f}" data-pivot="{pvx:.3f} {pvy:.3f}">'
            f'<image width="{W:.3f}" height="{Hh:.3f}" href="data:image/png;base64,{b64}"/></svg>\n')


FRAMES = {}   # name -> (img at source res, scale src px -> world unit, pivot src px)
NO_RING = {}  # name -> source-px row from which no contour is baked (the head's cut: skin over the neck, no seam line)
CUT = {}      # name -> pivot y (source px): the head's neck is faded out after the resize (cut_alpha)

INK = (27, 20, 32)
RING = 2  # baked contour width in output px (0.5 unit in the game atlas, 0.33 in the preview atlas)


def finish_px(img, name, ring, no_ring_row=None):
    """At output resolution: sharpen (downscaled painted linework goes soft) and bake a crisp dark contour so the
    silhouette reads at gameplay size. Tint / accent layers (_t/_a) get neither - they sit exactly on their base.
    no_ring_row: output row from which no contour is baked (a cut edge that lies over a matching part)."""
    if name.endswith(OVERLAY_LAYERS):
        return img
    pad = ring + 1
    W, H = img.size
    canvas = Image.new('RGBA', (W + pad * 2, H + pad * 2), (0, 0, 0, 0))
    canvas.alpha_composite(img, (pad, pad))
    rgb = canvas.convert('RGB')  # no sharpening: the atlas density and clean source linework keep it crisp
    al = canvas.getchannel('A')
    grown = al.filter(ImageFilter.MaxFilter(ring * 2 + 1))
    if no_ring_row is not None:
        g = np.asarray(grown).copy()
        g[max(0, pad + no_ring_row):] = 0
        grown = Image.fromarray(g)
    ink = Image.new('RGBA', canvas.size, INK + (0,))
    ink.putalpha(grown.point(lambda v: int(min(255, v * 0.92))))
    body = rgb.convert('RGBA')
    body.putalpha(al)
    ink.alpha_composite(body)
    # crop back to the original frame size (the contour may extend a pixel beyond - keep it, pivot shifts by pad)
    return ink.crop((pad - ring, pad - ring, pad + W + ring, pad + H + ring))


def emit(name, img, scale, pivot):
    """scale: world units per source px."""
    FRAMES[name] = (img, scale, pivot)


def write_frames():
    for d in (OUT_LO, OUT_HI):
        os.makedirs(d, exist_ok=True)
        for f in os.listdir(d):
            if f.endswith('.svg'):
                os.remove(os.path.join(d, f))
    for name, (img, scale, pivot) in FRAMES.items():
        for d, ppu in ((OUT_LO, LO), (OUT_HI, HI)):
            k = scale * ppu  # source px -> output px
            w, h = max(1, round(img.width * k)), max(1, round(img.height * k))
            nr = round(NO_RING[name] * k) if name in NO_RING else None
            small = img.resize((w, h), Image.LANCZOS)
            if name in CUT:
                small = cut_alpha(small, CUT[name] * k, ppu)
            small = finish_px(small, name, RING, nr)
            # build-art rasterises SVG world units at BUILD_PX: wrapping at BUILD_PX keeps every frame 1:1, so the frames
            # really hold LO / HI px per unit (their nominal size is ppu/BUILD_PX larger; renderers scale by HERO_PPU)
            ring = 0 if name.endswith(OVERLAY_LAYERS) else RING
            # base frames grew by the contour ring on every side; tint/accent layers grow the same so they stay aligned
            if name.endswith(OVERLAY_LAYERS):
                r = RING
                pad_img = Image.new('RGBA', (small.width + r * 2, small.height + r * 2), (0, 0, 0, 0))
                pad_img.alpha_composite(small, (r, r))
                small, ring = pad_img, r
            with open(os.path.join(d, name + '.svg'), 'w') as f:
                f.write(svg_wrap(small, BUILD_PX, (pivot[0] * k + ring, pivot[1] * k + ring)))


def _sample_row(row, xs):
    """Row of RGBA (premultiplied interpolation) at fractional source columns xs."""
    x0 = np.clip(np.floor(xs).astype(int), 0, row.shape[0] - 1)
    x1 = np.clip(x0 + 1, 0, row.shape[0] - 1)
    t = (xs - np.floor(xs))[:, None]
    r = row.astype(np.float32)
    pm = np.concatenate([r[:, :3] * r[:, 3:4] / 255, r[:, 3:4]], 1)
    v = pm[x0] * (1 - t) + pm[x1] * t
    a = v[:, 3:4]
    rgb = np.where(a > 0, v[:, :3] * 255 / np.maximum(a, 1e-3), 0)
    return np.clip(np.concatenate([rgb, a], 1), 0, 255).astype(np.uint8)


def straight_neck(img, s):
    """v3 head art: widen the funnel-shaped neck stub so its back drops straight down from the nape. Every row below the
    point where the nape crosses the new back edge (throat front - NECK_W) is stretched back to that edge; the dark
    contour along the old 45-degree nape is squeezed to the art's normal edge-ink width (no thick line).
    Returns (img, info) - info locates the straight neck for neck_column()."""
    a = np.asarray(img).copy()
    al = a[..., 3]
    ys = np.nonzero((al > 60).any(axis=1))[0]
    bot = ys.max()
    L = lambda y: np.nonzero(al[y] > 60)[0].min()
    R = lambda y: np.nonzero(al[y] > 60)[0].max()
    stub = range(int(bot - 2.2 / s), int(bot - 0.7 / s))
    xf = float(np.median([R(y) for y in stub]))
    xb = int(round(xf - NECK_W / s))
    nape = next(y for y in range(bot, ys.min(), -1) if L(y) <= xb)
    jaw = next(y for y in range(bot, ys.min(), -1) if R(y) > xf + 0.8 / s)
    val = a[..., :3].max(-1) / 255.0
    dark = lambda y, x0: next((n for n in range(0, 40) if not (al[y, x0 + n] > 60 and val[y, x0 + n] < 0.3)), 40)
    ink = max(2, int(np.median([dark(y, L(y)) for y in stub])))
    # the art's own edge ink (median colour of the stub's back-edge run)
    edge_ink = np.median(np.array([a[y, L(y) + 1] for y in stub]), axis=0).astype(np.uint8)
    edge_ink[3] = 255
    for y in range(nape + 1, bot + 1):
        l, r = L(y), R(y)
        if l <= xb:
            continue
        n = max(1, dark(y, l))
        xs_ = np.arange(xb, r + 1, dtype=np.float32)
        src = np.where(xs_ < xb + ink, l + (xs_ - xb) * n / ink,
                       (l + n) + (xs_ - xb - ink) * (r - l - n) / max(1.0, r - xb - ink))
        a[y, xb:r + 1] = _sample_row(a[y], src)
        a[y, xb:xb + ink] = edge_ink
    info = {'xb': xb, 'xf': xf, 'nape': nape, 'top': max(nape, jaw) + 3, 'low': int(bot - 0.7 / s), 'bot': bot}
    return Image.fromarray(a, 'RGBA'), info


def neck_column(fim, info, pivot, s):
    """The straight neck part from a finished (recoloured) head frame: the widened neck rows, extended up behind the
    head (NECK_TOP above the nape) and down under the collar (NECK_LOW below the pivot). Same pixel frame and pivot
    as the head, so the two line up exactly at rest."""
    a = np.asarray(fim)
    H = max(a.shape[0], int(math.ceil(pivot[1] + NECK_LOW / s)) + 2)
    out = np.zeros((H, a.shape[1], 4), np.uint8)
    y0 = int(info['nape'] - NECK_TOP / s)
    xb = info['xb']
    # the profile: the clean mid-neck rows (0.8 - 1.3 above the pivot: under the throat notch, above the flared, inked
    # bottom of the art), each stretched edge to edge onto [xb, xf], then their median
    xf = int(round(info['xf']))
    rows = []
    for y in range(int(pivot[1] - 1.3 / s), int(pivot[1] - 0.8 / s)):
        op = np.nonzero(a[y, :, 3] > 60)[0]
        rows.append(_sample_row(a[y], np.linspace(op.min(), op.max(), xf - xb + 1, dtype=np.float32)))
    prof = np.median(np.array(rows, np.float32), axis=0).astype(np.uint8)
    for y in range(y0, int(pivot[1] + NECK_LOW / s) + 1):
        out[y, xb:xf + 1] = prof
    return Image.fromarray(out, 'RGBA')


def cut_alpha(img, pivot_y, ppu):
    """The head without its neck, at output resolution: alpha fades out between CUT_HI and CUT_LO above the pivot (the
    neck part continues the skin underneath; no contour is baked along the cut - see NO_RING). Done after the resize, so
    the resampling never sees the cut edge (cutting first overshot a light line along it)."""
    a = np.asarray(img).copy()
    yy = np.arange(a.shape[0], dtype=np.float32)[:, None]
    up = (pivot_y - yy) / ppu
    f = np.clip((up - CUT_LO) / (CUT_HI - CUT_LO), 0, 1)
    a[..., 3] = (a[..., 3] * f).astype(np.uint8)
    return Image.fromarray(a, 'RGBA')


META = {'outfits': {}, 'acc': {}}


def build_outfit(o):
    d = os.path.join(PARTS, o)
    P = lambda n: Image.open(os.path.join(d, n + '.png')).convert('RGBA')
    has = lambda n: os.path.exists(os.path.join(d, n + '.png'))
    meta = {'cloth': []}
    tint_ranges = TINT[o]

    def finish(name, img, scale, pivot, part):
        """Split tint / glow / skin layers and emit the frames."""
        arr = np.asarray(img)
        glow = in_ranges(arr, GLOW) if part == 'pack' else np.zeros(arr.shape[:2], bool)
        if (o, part) in FULL_TINT:
            base, tl = split_layer(img, arr[..., 3] > 20, 0.85)
            emit(name, base, scale, pivot)
            emit(name + '_t', tl, scale, pivot)
            return
        rng = PART_TINT.get((o, part), tint_ranges)
        tmask = in_ranges(arr, rng) & ~glow if rng else np.zeros(arr.shape[:2], bool)
        if o == 'armour' and tmask.any():
            # keep the player colour on the armour plates only: camo blotches (small separate blobs) stay olive
            tmask = tmask & min_area(tmask, (min(arr.shape[:2]) * 0.05) ** 2)
        if part == 'head':
            # v3 heads (shared skull set) are bare - no clothing to tint; v2 heads tint only saturated clothing (collars)
            _, sat, _ = hsv(arr)
            tmask &= (sat >= 0.78) & (not os.path.exists(os.path.join(PARTS, 'heads', o + '.png')))
        base, tl = split_layer(img, tmask)
        if tl is not None:
            emit(name + '_t', tl, scale, pivot)
        if glow.any():
            base, gl = split_layer(base, glow, 0.95)
            if gl is not None:
                emit(name + '_a', gl, scale, pivot)
        skin_ok = SKIN_PARTS.get(part)
        if skin_ok is True or (isinstance(skin_ok, tuple) and o in skin_ok):
            sm = skin_mask(np.asarray(base), part == 'head', 0.5 if (o, part) == ('hawaiian', 'uarm') else 0.0)
            if part == 'head':
                check_skin_coverage(name, np.asarray(base), sm)
            k = overlay_layer(base, sm)
            if k is not None:
                emit(name + '_k', k, scale, pivot)
                meta.setdefault('skin', []).append(part)
            if part == 'head' and os.path.exists(os.path.join(PARTS, 'heads', o + '.png')):
                hl = overlay_layer(base, hair_mask(np.asarray(base), sm), compress=True)
                if hl is not None:
                    emit(name + '_h', hl, scale, pivot)
        emit(name, base, scale, pivot)

    # limbs
    for part in ('uarm', 'farm', 'thigh', 'shin'):
        img, (jx, jy), L = limb(P(part), part)
        if (o, part) in CAP_TOP:
            img = cap_top(img)
        if (o, part) in GREY_KNEES:
            img = grey_knees(img)
        s = BONES[part] / L
        if part == 'shin':
            shin, foot, ankle = split_foot(img, jy + L, s)
            finish(f'{o}_shin', shin, s, (jx, jy), part)
            finish(f'{o}_foot', foot, s, ankle, part)
            meta['foot'] = {'w': round(foot.width * s, 2), 'h': round(foot.height * s, 2)}
        else:
            finish(f'{o}_{part}', img, s, (jx, jy), part)
        meta[part] = {'w': round(img.width * s, 2), 'h': round(img.height * s, 2)}
    # head: pivot at the bottom-centre of the neck stub
    v3 = os.path.join(PARTS, 'heads', o + '.png')
    img = trim(Image.open(v3).convert('RGBA') if os.path.exists(v3) else P('head'))
    al = np.asarray(img)[..., 3]
    ys, xs = np.nonzero(al > 60)
    bot = ys.max()
    neck = np.nonzero(al[bot - 3] > 60)[0]
    nx = (neck.min() + neck.max()) / 2
    s = HEAD_SET_H / head_set_px() if os.path.exists(v3) else HEAD_H / img.height
    nk = None
    if os.path.exists(v3):
        img, nk = straight_neck(img, s)
    finish(f'{o}_head', img, s, (nx, bot - 2), 'head')
    if nk:
        # the straight neck becomes its own part (fixed to the torso, so it is always straight on the body), cut from each
        # finished skin variant so its tones match the head exactly; the head is cut just under the jaw and pitches on it
        for name in [n for n in list(FRAMES) if n == f'{o}_head' or n.startswith(f'{o}_head_')]:
            fim, fs, fpiv = FRAMES[name]
            if not name.endswith('_h'):  # (no hair on the neck)
                emit(name.replace('_head', '_neck', 1), neck_column(fim, nk, fpiv, fs), fs, fpiv)
            CUT[name] = fpiv[1]
            NO_RING[name] = int(fpiv[1] - CUT_HI / fs)
    if os.path.exists(v3):
        # capped variant for crown-covering hats (helmet, cap, beanie, boonie): hair above the hat line is trimmed so
        # buns / curls never poke out through the hat (the hat covers everything above CAP_CUT)
        # derived from the finished (already recoloured) head frames, so every skin variant matches exactly
        # the trim line curves down toward the nape (no flat-topped block of hair sticking out behind the hat)
        for name in [n for n in list(FRAMES) if n == f'{o}_head' or n.startswith(f'{o}_head_')]:
            fim, fs, fpiv = FRAMES[name]
            arr = np.asarray(fim).copy()
            yy, xx = np.mgrid[0:arr.shape[0], 0:arr.shape[1]]
            xl = (xx - fpiv[0]) * fs            # head-local x (forward +)
            yu = (fpiv[1] - yy) * fs            # height above the neck pivot
            line = CAP_CUT - 0.6 * np.maximum(0, -xl - 3.0) ** 1.25
            arr[..., 3] = np.where(yu > line, 0, arr[..., 3])
            emit(name.replace('_head', '_headc', 1), Image.fromarray(arr, 'RGBA'), fs, fpiv)
            if name in NO_RING:
                NO_RING[name.replace('_head', '_headc', 1)] = NO_RING[name]
            if name in CUT:
                CUT[name.replace('_head', '_headc', 1)] = CUT[name]
    top = ys.min()
    # anchors for accessories in head-local units (pivot = neck)
    front = xs.max()
    rows = [y for y in range(top, bot) if (al[y] > 60).any()]
    meta['head'] = {
        'top': round((top - (bot - 2)) * s, 2),
        'front': round((front - nx) * s, 2),
        'back': round((xs.min() - nx) * s, 2),
        'h': round(img.height * s, 2),
    }
    # torso: pivot at the shoulder joint; waist at the bottom centre
    tv3 = os.path.join(PARTS, 'torsos', o + '.png')
    tie_at = None
    if os.path.exists(tv3):
        # v3 armless torso: placed so its collar sits exactly on the neck joint (rig.ts BONES.neck): the collar's centre
        # is NECK_X ahead of the shoulder and its top COLLAR_TOP above it, so every outfit's neck rises out of its collar
        img = trim(Image.open(tv3).convert('RGBA'))
        al = np.asarray(img)[..., 3]
        ys, xs = np.nonzero(al > 60)
        s = TORSO_H_V3 / img.height
        top = ys.min()
        band = al[top + int(round(0.7 / s))] > 60
        cols = np.nonzero(band)[0]
        cx = (cols.min() + cols.max()) / 2
        col_top = np.nonzero(al[:, int(round(cx))] > 60)[0].min()
        shx = cx - NECK_X / s
        shy = col_top + COLLAR_TOP / s
        # the tie lies ON the shirt: find the white shirt V in the art and run the tie down its centre line (it used to hang
        # straight down from the collar and ended up painted on the jacket sleeve, reading as an armband)
        _, sat, val = hsv(np.asarray(img))
        shirt = (al > 200) & (val > 0.78) & (sat < 0.18)
        # the collar and the open V below it are one connected white region (stray highlights on buckles and buttons are
        # not): the knot sits at the front of the collar where it ends, the tie runs down the V to just above its tip
        grown = np.asarray(Image.fromarray((shirt * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))) > 127
        main = main_parts(grown, 1.0) & shirt
        rows = [y for y in range(al.shape[0]) if main[y].sum() >= 3]
        if rows:
            span = lambda y: np.nonzero(main[y])[0]
            collar = [y for y in rows if y - rows[0] < 3.0 / s and span(y).max() - span(y).min() > 1.6 / s]
            yc = collar[-1] if collar else rows[0]
            tip = rows[-1]
            y0, c0 = yc + 0.2 / s, span(yc).max() - 0.5 / s
            y1, c1 = tip - 0.5 / s, span(tip).mean() - 0.3 / s
            lean = math.atan2(c1 - c0, y1 - y0)  # forward lean of the shirt V (rad)
            tie_at = (round((c0 - shx) * s, 2), round((y0 - shy) * s, 2), round(-lean, 3), round(math.hypot(c1 - c0, y1 - y0) * s, 2))
    else:
        img = trim(P('torso'))
        al = np.asarray(img)[..., 3]
        ys, xs = np.nonzero(al > 60)
        s = TORSO_H / img.height
        shx = (xs.min() + xs.max()) / 2 + (xs.max() - xs.min()) * 0.02
        shy = ys.min() + img.height * 0.16
    finish(f'{o}_torso', img, s, (shx, shy), 'torso')
    meta['torso'] = {'w': round(img.width * s, 2), 'back': round((xs.min() - shx) * s, 2), 'front': round((xs.max() - shx) * s, 2),
                     'waist': round((ys.max() - shy) * s, 2)}
    # pelvis: pivot at the waist (top centre)
    img = trim(P('pelvis'))
    al = np.asarray(img)[..., 3]
    ys, xs = np.nonzero(al > 60)
    s = PELVIS_H / img.height
    finish(f'{o}_pelvis', img, s, ((xs.min() + xs.max()) / 2, ys.min() + 1), 'pelvis')
    # jetpack: pivot at its front (right) edge, upper third
    img = trim(P('pack'))
    al = np.asarray(img)[..., 3]
    ys, xs = np.nonzero(al > 60)
    s = PACK_H / img.height
    finish(f'{o}_pack', img, s, (xs.max() - 2, ys.min() + img.height * 0.3), 'pack')
    meta['pack'] = {'w': round(img.width * s, 2), 'h': round(img.height * s, 2)}
    # cloth pieces
    cloth_defs = {
        'tie': dict(slot='clothT', x=6.0, y=-0.2, rest=-0.12, flow=0.3, lift=0.6, min=-0.6, max=1.4, k=55, c=6.5, h=8.0),
        'tail': dict(slot='clothB0', x=-4.4, y=9.0, rest=0.08, flow=0.26, lift=0.35, min=-0.2, max=1.3, k=50, c=6, h=6.5),
        'flap': dict(slot='clothF', x=4.0, y=5.0, rest=0.0, flow=0.2, lift=0.4, min=-0.4, max=1.2, k=55, c=6, h=7.5),
        'hem': dict(slot='clothB0', x=-4.2, y=8.6, rest=0.08, flow=0.24, lift=0.3, min=-0.2, max=1.2, k=50, c=6, h=5.5),
        'sash': dict(slot='clothB0', x=-4.5, y=9.4, rest=0.12, flow=0.3, lift=0.4, min=-0.2, max=1.4, k=40, c=5, h=8.5),
        'scarf': dict(slot='clothB1', x=-3.0, y=-1.2, rest=0.55, flow=0.28, lift=0.45, min=-0.1, max=1.6, k=30, c=4, w=13, horizontal=True),
        'scarf2': dict(slot='clothB2', x=-2.6, y=-0.6, rest=0.75, flow=0.24, lift=0.4, min=0.0, max=1.7, k=36, c=4.5, w=9, horizontal=True),
    }
    if tie_at:
        # a tie lies on the shirt: anchored at the top of the shirt V, leaning forward along it, as long as the V, with
        # only a little sway (it used to hang off the chest like a flag and swing out in front of the body)
        r = tie_at[2]
        cloth_defs['tie'] = dict(cloth_defs['tie'], x=tie_at[0], y=tie_at[1], rest=r, flow=0.06, lift=0.12, min=r - 0.08, max=r + 0.08, k=90, c=11, h=tie_at[3])
    for nm, cd in cloth_defs.items():
        if not has(nm):
            continue
        img = trim(P(nm))
        al = np.asarray(img)[..., 3]
        ys, xs = np.nonzero(al > 60)
        if cd.get('horizontal'):
            # long horizontal strip: pivot at its right (front) end, scaled by length
            s = cd['w'] / img.width
            rows = np.nonzero(al[:, xs.max() - 3] > 60)[0]
            piv = (xs.max() - 2, (rows.min() + rows.max()) / 2 if len(rows) else img.height / 2)
        else:
            s = cd['h'] / img.height
            cols = np.nonzero(al[ys.min() + 2] > 60)[0]
            piv = ((cols.min() + cols.max()) / 2 if len(cols) else img.width / 2, ys.min() + 1)
        finish(f'{o}_{nm}', img, s, piv, nm)
        frame = f'{o}_{nm}'
        meta['cloth'].append({k: v for k, v in cd.items() if k not in ('h', 'w')} | {'frame': frame, 'tint': os.path.exists(os.path.join(OUT_LO, frame + '_t.svg')) or (o, nm) in FULL_TINT})
    META['outfits'][o] = meta


ACC_H = {'helmet': 11.5, 'beret': 6.4, 'bandana': 5.6, 'cap': 7.6, 'headset': 8.6, 'goggles': 3.8, 'visor': 3.6, 'shades': 2.7, 'mask': 6.2}
# v3 headwear (parts/headwear, drawn for the shared-skull heads): scaled by WIDTH (chin straps / brims make heights
# meaningless), pivot on the rim (the lowest row of the hat body, ignoring thin straps). Placed by HAT_AT in heroLook.ts.
HAT_W = {'helmet': 12.4, 'beret': 11.6, 'bandana': 12.6, 'cap': 14.6, 'headset': 8.6, 'beanie': 11.4, 'boonie': 17.0}
ACC_TINT = {'helmet': [((55, 105), (0.15, 0.8), (0.12, 0.75))], 'beret': 'full', 'bandana': 'full', 'cap': 'full', 'visor': 'full-accent', 'goggles': 'lens',
            'beanie': 'full', 'boonie': 'full'}


def hat_rim(al):
    """Rim pivot of a hat cut-out: the lowest row whose opaque span is at least 55% of the widest row (chin straps and
    tails are thin), centred on that row's span."""
    rows = [(y, np.nonzero(al[y] > 60)[0]) for y in range(al.shape[0])]
    widths = [(r.max() - r.min()) if len(r) else 0 for _, r in rows]
    wmax = max(widths)
    y = max(i for i, w in enumerate(widths) if w >= 0.55 * wmax)
    r = rows[y][1]
    return ((r.min() + r.max()) / 2, y)


def build_accessories():
    d = os.path.join(PARTS, 'accessories')
    hw = os.path.join(PARTS, 'headwear')
    if not os.path.isdir(d):
        return
    items = dict(ACC_H)
    for nm in HAT_W:
        items.setdefault(nm, 0)
    for nm, hh in items.items():
        v3 = nm in HAT_W and os.path.exists(os.path.join(hw, nm + '.png'))
        f = os.path.join(hw if v3 else d, nm + '.png')
        if not os.path.exists(f):
            continue
        img = trim(Image.open(f).convert('RGBA'))
        al = np.asarray(img)[..., 3]
        ys, xs = np.nonzero(al > 60)
        s = HAT_W[nm] / img.width if v3 else hh / img.height
        # pivot: rim for v3 headwear, bottom-centre for old headwear, front-centre (right edge, middle) for face items
        if nm in ('goggles', 'visor', 'shades', 'mask'):
            piv = (xs.max() - 1, (ys.min() + ys.max()) / 2)
        elif v3:
            piv = hat_rim(al)
        else:
            piv = ((xs.min() + xs.max()) / 2, ys.max() - 1)
        arr = np.asarray(img)
        rule = ACC_TINT.get(nm)
        name = f'acc_{nm}'
        if rule == 'full':
            base, tl = split_layer(img, arr[..., 3] > 20, 0.85)
            emit(name, base, s, piv)
            emit(name + '_t', tl, s, piv)
        elif rule == 'full-accent':
            base, al2 = split_layer(img, arr[..., 3] > 20, 0.9)
            emit(name, base, s, piv)
            emit(name + '_a', al2, s, piv)
        elif rule == 'lens':
            h, sat, v = hsv(arr)
            lens = (sat < 0.25) & (v > 0.55) & (arr[..., 3] > 30)
            base, al2 = split_layer(img, lens, 0.9)
            emit(name, base, s, piv)
            if al2 is not None:
                emit(name + '_a', al2, s, piv)
        elif isinstance(rule, list):
            base, tl = split_layer(img, in_ranges(arr, rule))
            emit(name, base, s, piv)
            if tl is not None:
                emit(name + '_t', tl, s, piv)
        else:
            emit(name, img, s, piv)
        META['acc'][nm] = {'w': round(img.width * s, 2), 'h': round(img.height * s, 2)}


# weapon fitting: grip (front hand), fore (back hand) and muzzle as fractions of the cut-out; hand = shoulder->grip
# distance along the aim (world units); muzzle = gameplay muzzle distance from packages/shared/src/weapons.ts
WEAPON_FIT = {
    # len = drawn length (world units); hand = shoulder -> pistol grip along the aim. Support grips sit on the handguard /
    # pump / front grip within arm reach of the far shoulder (rig BONES uarm + farm = 21.5). The gameplay muzzle distance
    # is DERIVED (hand + grip->muzzle) and mirrored in packages/shared/src/weapons.ts (checked by a test).
    'pistol': dict(id=1, grip=(0.22, 0.56), fore=(0.30, 0.72), hand=14.0, len=15.0),
    'smg': dict(id=2, grip=(0.33, 0.62), fore=(0.58, 0.45), hand=9.0, len=27.0),
    'rifle': dict(id=3, grip=(0.28, 0.62), fore=(0.58, 0.47), hand=7.0, len=36.0),
    'shotgun': dict(id=4, grip=(0.24, 0.62), fore=(0.60, 0.43), hand=6.0, len=34.0),
    'sniper': dict(id=5, grip=(0.24, 0.67), fore=(0.50, 0.50), hand=6.0, len=44.0),
    'rocket': dict(id=6, grip=(0.37, 0.75), fore=(0.64, 0.76), hand=6.0, len=46.0),
    # weapons2 sheet (v3): burst rifle, LMG, railgun, grenade launcher
    'burst': dict(id=8, grip=(0.34, 0.72), fore=(0.62, 0.50), hand=7.0, len=33.0, sheet='weapons2'),
    'lmg': dict(id=9, grip=(0.28, 0.70), fore=(0.55, 0.43), hand=6.0, len=46.0, sheet='weapons2'),
    'railgun': dict(id=10, grip=(0.25, 0.72), fore=(0.49, 0.56), hand=6.0, len=50.0, sheet='weapons2'),
    'launcher': dict(id=11, grip=(0.35, 0.63), fore=(0.72, 0.62), hand=7.0, len=32.0, sheet='weapons2'),
}


def build_weapons():
    d = os.path.join(PARTS, 'weapons')
    if not os.path.isdir(d):
        return
    META['weapons'] = {}
    for nm, f in WEAPON_FIT.items():
        src = os.path.join(PARTS, f.get('sheet', 'weapons'), nm + '.png')
        if not os.path.exists(src):
            continue
        img = trim(Image.open(src).convert('RGBA'))
        al = np.asarray(img)[..., 3]
        w, h = img.size
        cols = np.nonzero((al > 60).any(axis=0))[0]
        mx = cols.max()
        ys = np.nonzero(al[:, max(0, mx - 3)] > 60)[0]
        my = ys.mean()
        gx, gy = f['grip'][0] * w, f['grip'][1] * h
        s = f['len'] / w
        muzzle = f['hand'] + (mx - gx) * s
        piv = (gx, my)          # on the barrel line, above the grip
        emit(f'w_{nm}', img, s, piv)
        META['weapons'][f['id']] = {
            'frame': f'w_{nm}', 'hand': f['hand'],
            'gripY': round((gy - my) * s, 2),
            'foreX': round((f['fore'][0] * w - gx) * s, 2), 'foreY': round((f['fore'][1] * h - my) * s, 2),
            'len': round(w * s, 2), 'muzzle': round(muzzle, 1),
        }


BACK_H = {'pennant': 21.0, 'radio': 20.0}


def build_backs():
    """Back-mounted trinkets: light-grey fabric / indicator panels become accent-tinted layers; pivot = bottom centre."""
    d = os.path.join(PARTS, 'backs')
    if not os.path.isdir(d):
        return
    for nm, hh in BACK_H.items():
        f = os.path.join(d, nm + '.png')
        if not os.path.exists(f):
            continue
        img = trim(Image.open(f).convert('RGBA'))
        s = hh / img.height
        al = np.asarray(img)[..., 3]
        ys, xs = np.nonzero(al > 60)
        bot = ys.max()
        row = np.nonzero(al[bot - 2] > 60)[0]
        piv = ((row.min() + row.max()) / 2, bot - 1)
        arr = np.asarray(img)
        _, sat, v = hsv(arr)
        light = (sat < 0.18) & (v > 0.62) & (arr[..., 3] > 30)
        base, layer = split_layer(img, light, 0.92)
        emit(f'back_{nm}', base, s, piv)
        if layer is not None:
            emit(f'back_{nm}_a', layer, s, piv)


def write_data():
    names = sorted(FRAMES)
    js = json.dumps(META, indent=2)
    with open(DATA_TS, 'w', newline='\n') as f:
        f.write('// Generated by tools/character-pipeline/build_rig.py - do not edit by hand.\n')
        f.write('/* eslint-disable */\n')
        f.write(f'export const HERO_DATA = {js} as const;\n')
        f.write('/** Pixels per rig unit in the game atlas (hero) and the customiser preview atlas (herohi). */\n')
        f.write(f'export const HERO_PPU = {{ game: {LO}, preview: {HI} }} as const;\n')
        f.write(f'export const HERO_FRAMES: readonly string[] = {json.dumps(names)};\n')


def preview():
    """Contact sheet of every frame at the game scale (x4 nearest for inspection)."""
    os.makedirs(PREVIEW, exist_ok=True)
    tiles = []
    for name in sorted(FRAMES):
        img, scale, pivot = FRAMES[name]
        k = scale * HI
        tiles.append((name, img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)))
    cols = 10
    cw, ch = 120, 130
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * cw, rows * ch), (60, 56, 72, 255))
    from PIL import ImageDraw
    dr = ImageDraw.Draw(sheet)
    for i, (nm, t) in enumerate(tiles):
        x, y = (i % cols) * cw, (i // cols) * ch
        t.thumbnail((cw - 8, ch - 22))
        sheet.alpha_composite(t, (x + (cw - t.width) // 2, y + 4))
        dr.text((x + 3, y + ch - 14), nm[:20], fill=(255, 240, 210, 255))
    sheet.save(os.path.join(PREVIEW, 'frames.png'))


if __name__ == '__main__':
    outfits = [a for a in sys.argv[1:] if a in OUTFITS] or [o for o in OUTFITS if os.path.isdir(os.path.join(PARTS, o))]
    for o in outfits:
        build_outfit(o)
        print(f'{o}: ok')
    build_accessories()
    build_weapons()
    build_backs()
    write_frames()
    write_data()
    preview()
    print(f'{len(FRAMES)} frames -> art/hero, art/herohi; heroData.ts written')
