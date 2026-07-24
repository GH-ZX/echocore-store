import { useEffect } from 'react';

/**
 * Embla autoplay that does not "catch up" after the tab was backgrounded.
 *
 * Browsers throttle/freeze timers in hidden tabs. Naive setInterval/setTimeout
 * chains can fire many scrollNext() calls at once when the user returns —
 * the carousel appears to flip slides very fast. This hook:
 * - pauses while document.hidden
 * - always waits a full interval after resume (no backlog catch-up)
 * - reschedules on every slide change (manual or auto)
 */
export function useEmblaAutoplay(emblaApi, {
  intervalMs = 6000,
  paused = false,
  enabled = true,
} = {}) {
  const waitMs = Math.max(1000, Number(intervalMs) || 6000);

  useEffect(() => {
    if (!emblaApi || !enabled || paused) return undefined;

    let timerId = null;
    let cancelled = false;

    const clear = () => {
      if (timerId != null) {
        window.clearTimeout(timerId);
        timerId = null;
      }
    };

    const blocked = () => cancelled || paused || (typeof document !== 'undefined' && document.hidden);

    const schedule = () => {
      clear();
      if (blocked()) return;
      timerId = window.setTimeout(() => {
        timerId = null;
        if (blocked()) return;
        try {
          emblaApi.scrollNext();
        } catch {
          /* embla destroyed mid-timer */
        }
        // If 'select' did not fire (no movement), keep the chain alive.
        if (!blocked() && timerId == null) {
          schedule();
        }
      }, waitMs);
    };

    const onSelect = () => {
      // Full fresh delay after any advance (auto or user) — never catch-up backlog
      schedule();
    };

    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        clear();
      } else {
        // Returning to the tab: wait a full interval before the next flip
        schedule();
      }
    };

    // Avoid stacking with Embla's own settle events while dragging
    const onPointerDown = () => clear();
    const onPointerUp = () => schedule();

    schedule();
    emblaApi.on('select', onSelect);
    emblaApi.on('pointerDown', onPointerDown);
    emblaApi.on('pointerUp', onPointerUp);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clear();
      emblaApi.off('select', onSelect);
      emblaApi.off('pointerDown', onPointerDown);
      emblaApi.off('pointerUp', onPointerUp);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [emblaApi, paused, enabled, waitMs]);
}
