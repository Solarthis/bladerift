import '@fontsource/lilita-one/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/800.css';
import './styles.css';
import './ui/roster.css';
import './ui/hud.css';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/App';
import { checkForUpdate, CURRENT_RELEASE, markUpdateReady, setUpdater } from './update';

// Dev bench for animations (?lab): every weapon move and state side by side, no game UI.
// Sprite bench (?sprites&hero=N): every state of a sprite fighter at game speed.
const SPRITES = new URL(location.href).searchParams.has('sprites');
const LAB = SPRITES || new URL(location.href).searchParams.has('lab');
if (SPRITES) void import('./dev/SpriteLab').then((m) => m.startSpriteLab());
else if (LAB) void import('./dev/PoseLab').then((m) => m.startPoseLab());
const app = LAB ? null : new App();
app?.start();
(window as unknown as { bladerift: App | null }).bladerift = app;

// Service worker updates: apply a waiting update when not in a duel, never mid-fight.
let pendingUpdate: ((reload?: boolean) => Promise<void>) | null = null;
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    pendingUpdate = updateSW;
    markUpdateReady();
    applyWhenIdle();
  },
  onRegisteredSW(_url, reg) {
    if (reg) setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
  },
});
setUpdater(updateSW);
function applyWhenIdle() {
  if (!pendingUpdate) return;
  if (document.body.dataset.screen === 'game') {
    setTimeout(applyWhenIdle, 2000);
    return;
  }
  void pendingUpdate(true);
}

// A home-screen app resumed from the background never relaunches, so it would keep an old build for hours: whenever the
// app comes back to the foreground (and every few minutes), compare the deployed release and update outside a duel.
let lastCheck = 0;
async function checkWhenIdle() {
  if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 60_000) return;
  lastCheck = Date.now();
  if (document.body.dataset.screen === 'game') return;
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}RELEASE.txt?v=${Date.now()}`, { cache: 'no-store' });
    const live = r.ok ? (await r.text()).trim() : '';
    if (live && CURRENT_RELEASE !== 'dev' && live !== CURRENT_RELEASE && document.body.dataset.screen !== 'game') await checkForUpdate();
  } catch {
    /* offline: try again next time */
  }
}
document.addEventListener('visibilitychange', () => void checkWhenIdle());
window.addEventListener('focus', () => void checkWhenIdle());
setInterval(() => void checkWhenIdle(), 5 * 60 * 1000);

window.addEventListener('bladerift:version-mismatch', async () => {
  try {
    if (sessionStorage.getItem('bladerift.updateReload')) return;
    sessionStorage.setItem('bladerift.updateReload', '1');
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch {
    /* ignore */
  }
  location.reload();
});
window.addEventListener('load', () => setTimeout(() => sessionStorage.removeItem('bladerift.updateReload'), 15000));
