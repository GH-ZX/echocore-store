// Boot splash rendered inline in index.html (#echo-splash). React calls
// hideSplash() once the first data is ready; index.html also hides it at
// SPLASH_MAX_MS on its own so it can never hang.

export const SPLASH_MIN_MS = 500;
const FADE_MS = 320;

let hiding = false;

export function hideSplash() {
  if (hiding || typeof document === 'undefined') return;
  const el = document.getElementById('echo-splash');
  if (!el) return;
  hiding = true;

  const start = typeof window.__echoSplashStart === 'number' ? window.__echoSplashStart : 0;
  const elapsed = performance.now() - start;
  const wait = Math.max(0, SPLASH_MIN_MS - elapsed);

  window.setTimeout(() => {
    el.classList.add('is-hidden');
    window.setTimeout(() => el.remove(), FADE_MS + 50);
  }, wait);
}
