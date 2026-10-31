import '@fontsource/lilita-one/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/800.css';
import './styles.css';
import './ui/roster.css';
import './ui/hud.css';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/App';
import { markUpdateReady, setUpdater } from './update';

// Dev bench for animations (?lab): every weapon move and state side by side, no game UI.
const LAB = new URL(location.href).searchParams.has('lab');
if (LAB) void import('./dev/PoseLab').then((m) => m.startPoseLab());
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
