"""Content revisions of the installed sprite atlases (packages/client/src/render/atlasRevs.json).

The client asks for assets/characters/<id>/atlas.{json,png}?r=<rev>, so an atlas only downloads again when it changed (a new
release leaves the browser's and the service worker's cached copies of every unchanged hero in place). process.py runs this
after it installs an atlas; tests check the table matches the files.
"""
import hashlib, json, os

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
CHARS = os.path.join(ROOT, 'packages', 'client', 'public', 'assets', 'characters')
OUT = os.path.join(ROOT, 'packages', 'client', 'src', 'render', 'atlasRevs.json')


def rev(folder):
    h = hashlib.sha1()
    for f in ('atlas.json', 'atlas.png'):
        h.update(open(os.path.join(folder, f), 'rb').read())
    return h.hexdigest()[:10]


def main():
    revs = {d: rev(os.path.join(CHARS, d)) for d in sorted(os.listdir(CHARS)) if os.path.isfile(os.path.join(CHARS, d, 'atlas.png'))}
    open(OUT, 'w', encoding='utf-8').write(json.dumps(revs, indent=2) + '\n')
    print('atlas revs:', len(revs))


if __name__ == '__main__':
    main()
