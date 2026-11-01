/**
 * The one place hero sprite atlases are downloaded (assets/characters/<id>/atlas.json + atlas.png, made by
 * tools/sprites/process.py). The title face-off, the hero select preview and the match all share each download.
 *
 * The URLs carry the atlas's content revision (atlasRevs.json, written by tools/sprites/revs.py), not the release, so a new
 * release leaves every unchanged hero cached: only changed art downloads again. A failed download is retried, and a hero
 * whose download keeps failing is tried again later instead of being written off for the session.
 */
import type { SpriteAtlasMeta } from './spriteAnim';
import REVS from './atlasRevs.json';

/** Atlas folder per hero id (the same names as the art sources in art/characters/). */
export const SPRITE_IDS = [
  'h00-leon', 'h01-kharon', 'h02-aurelion', 'h03-nyx', 'h04-verdan', 'h05-lumi', 'h06-quill',
  'h07-hollowmask', 'h08-sable', 'h09-gorvax', 'h10-gray', 'h11-ignis', 'h12-thornmaw', 'h13-aegis',
];

export type HeroAtlas = { meta: SpriteAtlasMeta; img: HTMLImageElement };

const revs = REVS as Record<string, string>;
const done = new Map<number, HeroAtlas>();
const busy = new Map<number, Promise<HeroAtlas | null>>();
/** When a hero's last attempt failed (a later ask tries again after a pause). */
const failedAt = new Map<number, number>();
const RETRY_AFTER_MS = 6000;

const url = (id: string, file: string) => `assets/characters/${id}/${file}?r=${revs[id] ?? String(import.meta.env.VITE_RELEASE ?? 'dev')}`;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchOnce(id: string): Promise<HeroAtlas> {
  const r = await fetch(url(id, 'atlas.json'));
  if (!r.ok || !r.headers.get('content-type')?.includes('json')) throw new Error(`atlas.json ${r.status}`);
  const meta = (await r.json()) as SpriteAtlasMeta;
  const img = new Image();
  img.decoding = 'async';
  img.src = url(id, 'atlas.png');
  await img.decode();
  if (!img.naturalWidth) throw new Error('atlas.png empty');
  return { meta, img };
}

/** The hero's atlas, already decoded (null: the hero has no sprites, or its download failed just now). */
export function heroAtlas(hero: number): Promise<HeroAtlas | null> {
  const ready = done.get(hero);
  if (ready) return Promise.resolve(ready);
  const running = busy.get(hero);
  if (running) return running;
  const id = SPRITE_IDS[hero];
  if (!id || !revs[id]) return Promise.resolve(null);
  if (performance.now() - (failedAt.get(hero) ?? -1e9) < RETRY_AFTER_MS) return Promise.resolve(null);
  const p = (async () => {
    // a phone on a weak connection drops a request now and then: try a few times before giving up for a while
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const a = await fetchOnce(id);
        done.set(hero, a);
        failedAt.delete(hero);
        // only the most recent few stay decoded here (each is ~12 MB of pixels; the match's own textures keep theirs)
        while (done.size > 6) done.delete(done.keys().next().value!);
        return a;
      } catch {
        await wait(500 * 2 ** attempt);
      }
    }
    failedAt.set(hero, performance.now());
    return null;
  })();
  busy.set(hero, p);
  void p.finally(() => busy.delete(hero));
  return p;
}

/** The hero has sprites at all (its atlas may still be downloading). */
export const hasAtlas = (hero: number) => !!revs[SPRITE_IDS[hero] ?? ''];

/** Already downloaded and decoded (sync). */
export const atlasReady = (hero: number) => done.get(hero) ?? null;

/** Still downloading. */
export const atlasLoading = (hero: number) => busy.has(hero);

/**
 * Download every hero's atlas into the browser's cache in the background, one at a time, starting with `first` (the title
 * screen calls this once it is idle, so hero select and the match find them on the device). Only the bytes: decoding all
 * fourteen would hold ~150 MB of pixels on a phone. Skipped on data-saver connections.
 */
export async function warmAllAtlases(first: number[] = []) {
  const conn = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return;
  const order = [...new Set([...first, ...SPRITE_IDS.map((_, i) => i)])];
  for (const h of order) {
    const id = SPRITE_IDS[h];
    if (done.has(h) || !revs[id]) continue;
    for (const f of ['atlas.json', 'atlas.png']) {
      try {
        const r = await fetch(url(id, f), { priority: 'low' } as RequestInit);
        await r.arrayBuffer();
      } catch {
        // (a hero that fails here simply downloads when it is played)
      }
    }
  }
}
