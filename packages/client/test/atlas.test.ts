import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import REVS from '../src/render/atlasRevs.json';

const CHARS = join(__dirname, '..', 'public', 'assets', 'characters');

describe('sprite atlases', () => {
  // the client fetches atlas.*?r=<rev>: a stale table would serve a cached old atlas with new code (or the reverse)
  it('the revision table matches the installed atlases (run tools/sprites/revs.py)', () => {
    for (const id of readdirSync(CHARS)) {
      const h = createHash('sha1');
      for (const f of ['atlas.json', 'atlas.png']) h.update(readFileSync(join(CHARS, id, f)));
      expect((REVS as Record<string, string>)[id], id).toBe(h.digest('hex').slice(0, 10));
    }
  });

  it('every atlas has the full move set and fits a phone GPU', () => {
    for (const id of readdirSync(CHARS)) {
      const m = JSON.parse(readFileSync(join(CHARS, id, 'atlas.json'), 'utf8'));
      expect(m.missing, id).toEqual([]);
      expect(m.size[0], id).toBeLessThanOrEqual(4096);
      expect(m.size[1], id).toBeLessThanOrEqual(4096);
    }
  });
});
