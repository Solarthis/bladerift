/**
 * Manual "Check for updates" support. The service worker (registered in main.ts) already checks on launch and
 * every 30 minutes; this lets the player force a check right now from the title screen or Settings.
 */

type ApplyFn = (reload?: boolean) => Promise<void>;

let apply: ApplyFn | null = null;
let ready = false;

/** Called by main.ts with vite-plugin-pwa's update function. */
export function setUpdater(fn: ApplyFn) {
  apply = fn;
}

/** Called by main.ts when a new version has been downloaded and is waiting. */
export function markUpdateReady() {
  ready = true;
  window.dispatchEvent(new Event('bladerift:update-ready'));
}

export function updateReady() {
  return ready;
}

export const CURRENT_RELEASE = String(import.meta.env.VITE_RELEASE ?? 'dev');

export type UpdateResult = 'reloading' | 'latest' | 'offline';

/** Release id currently deployed on the site (RELEASE.txt next to the app), or null if unknown (LAN host, offline). */
async function liveRelease(): Promise<string | null> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}RELEASE.txt?v=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const t = (await r.text()).trim();
    return /^[\w.-]{6,80}$/.test(t) ? t : null;
  } catch {
    return null;
  }
}

/**
 * Check for a newer version now. If one is found it is installed and the page reloads ('reloading');
 * otherwise reports 'latest' (or 'offline' when the site could not be reached).
 */
export async function checkForUpdate(): Promise<UpdateResult> {
  const live = await liveRelease();
  if (!navigator.onLine && live === null) return 'offline';
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  if (reg) {
    await reg.update().catch(() => {});
    // give a freshly found worker a moment to install
    for (let i = 0; i < 40 && reg.installing; i++) await new Promise((r) => setTimeout(r, 150));
    if (reg.waiting || ready) {
      if (apply) await apply(true);
      else {
        reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
        setTimeout(() => location.reload(), 300);
      }
      return 'reloading';
    }
  }
  // The site has a newer release but no worker update was picked up (no service worker, or a stale one):
  // drop cached copies and reload from the network.
  if (live && CURRENT_RELEASE !== 'dev' && live !== CURRENT_RELEASE) {
    try {
      for (const k of (await caches?.keys()) ?? []) await caches.delete(k);
      await reg?.unregister();
    } catch {
      /* ignore */
    }
    location.reload();
    return 'reloading';
  }
  return live === null && !navigator.onLine ? 'offline' : 'latest';
}
