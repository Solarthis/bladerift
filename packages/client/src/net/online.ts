// Online play: the Bladerift online server (packages/server/src/online.ts) runs many rooms, each joined with a
// short code. The address comes from the build (VITE_ONLINE_URL) and can be overridden for testing with
// ?online=https://host (for this tab only, so a shared link cannot redirect a device for good; ?online=default
// drops it).
const OVERRIDE = 'bladerift.onlineUrl';
const HOSTED = 'bladerift.hostedMatch';
const session = {
  get: (k: string) => {
    try {
      return sessionStorage.getItem(k) ?? '';
    } catch {
      return '';
    }
  },
  set: (k: string, v: string) => {
    try {
      if (v) sessionStorage.setItem(k, v);
      else sessionStorage.removeItem(k);
    } catch {
      /* private mode */
    }
  },
};

const BUILT_IN = String(import.meta.env.VITE_ONLINE_URL ?? '').replace(/\/+$/, '');

export function onlineBase(): string {
  try {
    const q = new URL(location.href).searchParams.get('online');
    if (q === 'default') session.set(OVERRIDE, '');
    else if (q && /^https?:\/\/[^\s/]+$/.test(q.replace(/\/+$/, ''))) session.set(OVERRIDE, q.replace(/\/+$/, ''));
  } catch {
    /* no URL */
  }
  return session.get(OVERRIDE) || BUILT_IN;
}

export const onlineAvailable = () => !!onlineBase();

/**
 * A typed or pasted code, cleaned up: upper case letters and digits, 4 of them (codes never use 0, O, 1, I or L).
 * A pasted invite link gives its ?room= code.
 */
export function normalizeCode(s: string) {
  const fromLink = /[?&]room=([A-Za-z0-9]+)/.exec(s);
  return (fromLink ? fromLink[1] : s).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

export const wsUrlFor = (code: string) => `${onlineBase().replace(/^http/, 'ws')}/ws?room=${encodeURIComponent(code)}`;

/** The link friends open to join (the game site with ?room=). */
export const inviteLink = (code: string) => `${location.origin}${location.pathname}?room=${encodeURIComponent(code)}`;

/**
 * The match this device created, with its host key, so the host gets their powers back after the phone reloads the
 * tab (iOS does that to backgrounded games) or after stepping out of the lobby. Kept for 6 hours.
 */
export function hostedMatch(): { code: string; hostKey: string } | null {
  try {
    const v = JSON.parse(localStorage.getItem(HOSTED) ?? 'null') as { code: string; hostKey: string; at: number } | null;
    return v && Date.now() - v.at < 6 * 3600_000 ? { code: v.code, hostKey: v.hostKey } : null;
  } catch {
    return null;
  }
}

export function rememberHostedMatch(code: string, hostKey: string | null) {
  try {
    if (hostKey) localStorage.setItem(HOSTED, JSON.stringify({ code, hostKey, at: Date.now() }));
    else localStorage.removeItem(HOSTED);
  } catch {
    /* private mode */
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(onlineBase() + path, { cache: 'no-store', ...init });
  } catch {
    throw new Error('Can’t reach the online server. Check your internet connection.');
  }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error((body as { error?: string }).error || `The online server answered ${r.status}.`), { status: r.status });
  return body as T;
}

export const createOnlineRoom = () => call<{ code: string; hostKey: string; v: number }>('/api/rooms', { method: 'POST' });
export const checkOnlineRoom = (code: string) => call<{ code: string; players: number; max: number; phase: string; v: number }>(`/api/rooms/${encodeURIComponent(code)}`);

/** Does the match still exist? false only when the server says it is gone (null: the server cannot be reached). */
export const onlineRoomExists = (code: string) =>
  checkOnlineRoom(code).then(
    () => true,
    (e: { status?: number }) => (e.status === 404 ? false : null),
  );
