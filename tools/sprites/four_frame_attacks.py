"""Convert a character's attack sheets (atk-a, atk-b, atk-c) from three drawings per move to four (a 4x2 grid):
wind-up, strike, follow-through, recovery. The hero's own choreography is kept; a follow-through drawing is added after
every strike, written from that strike. A character without its own attack sheets gets the standard ones first.
Run before regenerating the sheets: python tools/sprites/four_frame_attacks.py h09-gorvax [more ids...]
The old sheet specs are kept in character.json under sheetsThreeFrame."""
import json
import os
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
STD = json.load(open(os.path.join(ROOT, 'art', 'sprite-standard.json'), encoding='utf-8'))

FOLLOW = ('follow-through: the same blow carried on past full extension, the weapon at the very end of its path and '
          'the body still committed to it, the trail thinning out behind it (kept inside this cell)')


def label(desc):
    """The move's name from a frame description ('combo strike 1, strike: ...' -> 'combo strike 1')."""
    return desc.split(',')[0].strip() if ',' in desc else desc.split(':')[0].strip()


def convert(cid):
    path = os.path.join(ROOT, 'art', 'characters', cid, 'character.json')
    ch = json.load(open(path, encoding='utf-8'))
    sheets = ch.setdefault('sheets', {})
    old = {}
    for sh in ('atk-a', 'atk-b', 'atk-c'):
        spec = sheets.get(sh) or json.loads(json.dumps(STD['sheets'][sh]))
        fr = spec.get('frames', [])
        if (spec.get('grid') or [3])[0] == 4 or len(fr) != 6:
            continue
        old[sh] = json.loads(json.dumps(spec))
        out = []
        for m in range(2):
            a, s, r = fr[m * 3:m * 3 + 3]
            out += [a, s.replace('kept inside this cell', 'a motion smear of the swing kept inside this cell'), f'{label(s)}, {FOLLOW}', r]
        spec['frames'] = out
        spec['grid'] = [4, 2]
        spec['title'] = spec.get('title', sh).replace('(3 frames each)', '(4 frames each)')
        if '(4 frames each)' not in spec['title']:
            spec['title'] += ' (4 frames each)'
        sheets[sh] = spec
    if old:
        ch.setdefault('sheetsThreeFrame', {}).update(old)
        json.dump(ch, open(path, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
        open(path, 'a', encoding='utf-8').write('\n')
    print(cid, 'converted' if old else 'already four-frame', ' '.join(old))


for cid in sys.argv[1:]:
    convert(cid)
