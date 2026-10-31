"""Outfit variants of the soldier body art.  python tools/make-outfits.py  (then: node tools/build-art.mjs --only=soldier)

Each outfit recolours the classic armour frames (fabric / gloves / boots) and adds a few details, writing
<frame>_o<n>.svg next to the originals in packages/client/art/soldier. The *_tint frames stay white-ish because
the renderer tints them with the player's colour (the tie, the tracksuit jacket, the ninja sash, the shirt).
  1 Suit & tie   2 Tracksuit   3 Ninja   4 Hawaiian
"""
import os, re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ART = os.path.join(ROOT, 'packages', 'client', 'art', 'soldier')

FABRIC = ['#c2b78c', '#978d6f', '#e4dcb4', '#756d55']
GLOVE = ['#94714d', '#6c513a', '#c09a6d', '#5a4331']
BOOT = ['#4c3a33', '#33272a', '#7a645b']
SOLE = ['#d2c1a6', '#a8967e', '#efe3ca']

SKIN = ['#e0b088', '#bf8c62', '#f2cba4', '#bf8c62']

OUTFITS = {
    1: dict(fabric=['#353b5e', '#262b47', '#4f5887', '#1f2340'], glove=['#2f2a2e', '#1f1b1e', '#4a4448', '#eeeef4'],
            boot=['#1e1b22', '#121015', '#4a4450'], sole=['#1e1b22', '#121015', '#3a3640']),
    2: dict(fabric=['#2e3554', '#20263e', '#46507a', '#20263e'], glove=SKIN[:3] + ['#2e3554'],
            boot=['#f0f0f6', '#c8c8d4', '#ffffff'], sole=['#d84a4a', '#a83434', '#ff7a6a'], torso_fabric=['#e9e8f0', '#c4c2d0', '#ffffff', '#c4c2d0']),
    3: dict(fabric=['#2b2733', '#1d1a24', '#413c4c', '#16141c'], glove=['#2b2733', '#1d1a24', '#413c4c', '#1d1a24'],
            boot=['#22202a', '#16141c', '#3a3644'], sole=['#22202a', '#16141c', '#3a3644']),
    4: dict(fabric=SKIN, glove=SKIN[:3] + ['#e0b088'], boot=['#8a5a3a', '#6a4028', '#b07a52'], sole=['#8a5a3a', '#6a4028', '#b07a52'],
            thigh_fabric=['#cdbb8a', '#a8976a', '#e6d8ae', '#8a7b55'], torso_fabric=['#f2efe6', '#d6d2c8', '#ffffff', '#d6d2c8']),
}


def recolor(src, frm, to):
    for a, b in zip(frm, to):
        src = re.sub(re.escape(a), b, src, flags=re.I)
    return src


def insert_before_last_g(src, extra):
    i = src.rindex('</g>')
    return src[:i] + extra + '\n' + src[i:]


def strip_radio(src):
    src = re.sub(r'<rect x="4.3"[^>]*/>\s*', '', src)
    return re.sub(r'<path d="M5.3 -3.6[^>]*/>\s*', '', src)


def rename_ids(src, n):
    return re.sub(r'(id="|url\(#)(sd-[a-z-]+)', lambda m: f'{m.group(1)}{m.group(2)}-o{n}', src)


def read(name):
    # base frames carry armour-only details in <g data-armour="1"> (pouches, knee pads): outfits drop them
    with open(os.path.join(ART, name + '.svg'), encoding='utf-8') as f:
        return re.sub(r'<g data-armour="1">.*?</g>\s?', '', f.read(), flags=re.S)


def write(name, src):
    with open(os.path.join(ART, name + '.svg'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(src)


TINT_BODY = re.compile(r'(<g transform="translate\(10 23\)"[^>]*>)(.*)(</g>\s*</svg>)', re.S)


def tint_with(body):
    t = read('torso_tint')
    return TINT_BODY.sub(lambda m: m.group(1) + '\n' + body + '\n' + m.group(3), t)


for n, o in OUTFITS.items():
    fab, glove, boot, sole = o['fabric'], o['glove'], o['boot'], o['sole']
    # ---- torso
    t = recolor(read('torso'), FABRIC, o.get('torso_fabric', fab))
    t = recolor(t, BOOT, boot)  # belt
    t = strip_radio(t)
    if n == 1:
        # a tall white shirt front from the collar down to the waist (shows above AND below the aiming arm),
        # light lapels framing it, and a crisp collar poking above the jacket
        # (shifted toward the visible side of the chest: the aiming arm crosses the right half)
        t = insert_before_last_g(t, '<g transform="translate(-6.6 0)">'
                                    '<path d="M1.4 -20.4 L8.8 -20.4 L10.4 -3.4 L-0.4 -3.4 Z" fill="#f6f4fa" stroke="#1b1420" stroke-width="1"/>'
                                    '<path d="M1.4 -20.4 L3.4 -12 L1.6 -11.6 L-0.4 -19.6 Z M8.8 -20.4 L7.4 -12 L9.2 -11.6 L10 -19 Z" fill="#6f78aa" stroke="#1b1420" stroke-width="1"/>'
                                    '<path d="M1.2 -20.2 L3.8 -23 L5.2 -20.4 L6.6 -23 L9.2 -20.2 L5.2 -18.4 Z" fill="#ffffff" stroke="#1b1420" stroke-width="1.1"/>'
                                    '</g>')
    if n == 3:
        t = insert_before_last_g(t, '<path d="M-6.4 -19.6 L6.6 -9.4 M-7.6 -13 L1 -6.6" fill="none" stroke="#16141c" stroke-width="1.1"/>')
    write(f'torso_o{n}', rename_ids(t, n))
    # ---- tint layer (player colour)
    if n == 1:
        # the tie (player colour): knot at the collar, long blade down to the belt
        tt = tint_with('<g transform="translate(-6.6 0)">'
                       '<path d="M4.2 -21 L6.2 -21 L6 -18.8 L4.4 -18.8 Z" fill="#f8f6fb" stroke="#1b1420" stroke-width="1"/>'
                       '<path d="M4.3 -19 L6.1 -19 L6.6 -7 L5.2 -4.6 L3.8 -7 Z" fill="#f8f6fb" stroke="#1b1420" stroke-width="1.1"/>'
                       '<path d="M4.6 -15 L6.2 -13.6 M4.4 -11 L6.4 -9.4" fill="none" stroke="#c6c0d4" stroke-width="0.9"/>'
                       '</g>')
    elif n == 2:
        tt = read('torso_tint')
        tt = insert_before_last_g(tt, '<path d="M5.6 -19.4 V-3.8" fill="none" stroke="#3a3550" stroke-width="1.2"/>'
                                      '<path d="M-7.4 -15.2 L9.6 -15.2" fill="none" stroke="#ffffff" stroke-width="1.6"/>')
    elif n == 3:
        tt = tint_with('<path d="M-8 -6.6 Q1 -5.2 9.8 -6.8 L9.8 -2.8 Q1 -1.2 -8 -2.8 Z" fill="#f8f6fb" stroke="#1b1420" stroke-width="1.6"/>'
                       '<path d="M-7.4 -4.8 L-9.8 -0.4 L-8 0.2 L-6.2 -3.8 Z" fill="#c6c0d4" stroke="#1b1420" stroke-width="1.2"/>')
    else:
        tt = recolor(read('torso_tint'), ['#f8f6fb', '#c6c0d4'], ['#e2dcea', '#bdb4cc'])
        flowers = ''
        for (x, y) in [(-4.6, -16), (3, -17.4), (7, -9.6), (-2.4, -8.4), (8, -15.4), (0.8, -12.4), (-6, -11)]:
            flowers += f'<circle cx="{x}" cy="{y}" r="1.7" fill="#ffffff"/><circle cx="{x}" cy="{y}" r="0.6" fill="#8a809c"/>'
        tt = insert_before_last_g(tt, flowers + '<path d="M-1.6 -19.8 L0.4 -16.6 L2.6 -19.8" fill="#ffffff" stroke="#1b1420" stroke-width="1"/>')
    write(f'torso_tint_o{n}', rename_ids(tt, n))
    # ---- arms
    for arm in ('arm_front', 'arm_back'):
        a = recolor(read(arm), FABRIC, fab)
        a = recolor(a, GLOVE, glove)
        if n == 2:
            a = insert_before_last_g(a, '<path d="M-1 0.4 L9.6 2" fill="none" stroke="#f4f4fa" stroke-width="1.2"/>' if arm == 'arm_front'
                                     else '<path d="M-24 0 L-4 0" fill="none" stroke="#f4f4fa" stroke-width="1.2"/>')
        if n == 1:
            # white shirt cuff at the wrist
            a = recolor(a, ['#5a4331'], ['#eeeef4'])
        write(f'{arm}_o{n}', rename_ids(a, n))
    # ---- legs (thigh / shin for the game, single 'leg' for menu previews)
    for leg in ('leg', 'leg_thigh', 'leg_shin'):
        l = read(leg)
        lf = o.get('thigh_fabric', fab) if leg in ('leg_thigh',) else fab
        if leg == 'leg' and 'thigh_fabric' in o:
            lf = o['thigh_fabric']
        l = recolor(l, FABRIC, lf)
        l = recolor(l, BOOT, boot)
        l = recolor(l, SOLE, sole)
        if n == 2 and leg != 'leg_shin':
            l = insert_before_last_g(l, '<path d="M-2.6 -1.4 L-2.4 6" fill="none" stroke="#f4f4fa" stroke-width="1.2"/>')
        write(f'{leg}_o{n}', rename_ids(l, n))
print('outfits written:', ', '.join(f'o{n}' for n in OUTFITS))
