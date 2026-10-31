/**
 * The visible app area in CSS px. iOS (Safari and home-screen apps) can keep a stale layout viewport after the app
 * returns from the background, rotation or address-bar changes: `innerHeight` and `position: fixed; inset: 0` boxes
 * then extend past the visible screen and the bottom of the game is cut off. App measures the visual viewport, stores
 * it here and in the --app-w / --app-h CSS variables (used by every full-screen layer), and every layout reads it here.
 */
let w = typeof innerWidth === 'number' ? innerWidth : 0;
let h = typeof innerHeight === 'number' ? innerHeight : 0;

export const viewW = () => w || innerWidth;
export const viewH = () => h || innerHeight;

// (iPhone only: an iPad app can share the screen in Split View / Stage Manager, so the screen size is not its size)
const isIPhone = () => /iPhone|iPod/.test(navigator.userAgent);
const isStandalone = () =>
  (navigator as { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches;
/** A text field has focus, so the on-screen keyboard may be up and the visible area really is smaller. */
const typing = () => {
  const a = document.activeElement as HTMLElement | null;
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
};

/**
 * Measure the visible area: the visual viewport (what is actually on screen; zoom is disabled, so it only differs from
 * the layout viewport when the layout is stale or the keyboard is up), falling back to the window. Never measures a box
 * that setViewport() sizes, so the result can grow back after shrinking (keyboard closed, rotation, app resumed).
 *
 * The iPhone home-screen app always fills the whole screen, but iOS can leave BOTH viewports stale after the keyboard
 * closes or the app resumes: too short (a dark band under the title screen) or too tall (the bottom cut off). There,
 * while nobody is typing, the screen's own size is the answer.
 */
export function measureViewport() {
  const vv = window.visualViewport;
  let vw = vv && vv.width > 0 ? vv.width : innerWidth || document.documentElement.clientWidth;
  let vh = vv && vv.height > 0 ? vv.height : innerHeight || document.documentElement.clientHeight;
  let top = Math.round(vv?.offsetTop ?? 0);
  if (isIPhone() && !isStandalone() && !typing()) {
    // iOS 26 Safari can leave the visual viewport stuck SHORTER than the window (after the keyboard closed or the toolbar
    // moved, with no event): the bottom of the screen then shows a dark band under the game. While nobody is typing, the
    // larger of the visual viewport and the window is what is really on screen.
    const win = Math.max(innerHeight || 0, document.documentElement.clientHeight || 0);
    if (win > vh) {
      vh = win;
      top = 0;
    }
  }
  if (isIPhone() && isStandalone() && !typing() && screen.width > 0 && screen.height > 0) {
    // (iOS reports screen in portrait terms whatever the orientation; the viewport's shape says which way round)
    const long = Math.max(screen.width, screen.height);
    const short = Math.min(screen.width, screen.height);
    const landscape = vw > vh;
    vw = landscape ? long : short;
    vh = landscape ? short : long;
    top = 0;
  }
  return { w: Math.round(vw), h: Math.round(vh), top };
}

/** Publish a measured size (App's fit): layouts read viewW()/viewH(), CSS layers read --app-w/--app-h. */
export function setViewport(nw: number, nh: number, top = 0) {
  w = nw;
  h = nh;
  const s = document.documentElement.style;
  s.setProperty('--app-w', nw + 'px');
  s.setProperty('--app-h', nh + 'px');
  s.setProperty('--app-top', top + 'px');
}
