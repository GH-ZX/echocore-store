/** Center the active chip inside a horizontal admin nav — never scrolls the page. */
export function centerActiveMobileTab(navEl) {
  if (!navEl || typeof window === 'undefined') return;

  const activeChip = navEl.querySelector('.admin-mobile-tab--active');
  if (!activeChip) return;

  const maxScroll = Math.max(0, navEl.scrollWidth - navEl.clientWidth);
  if (maxScroll <= 0) {
    navEl.scrollLeft = 0;
    return;
  }

  const chipStart = activeChip.offsetLeft;
  const chipWidth = activeChip.offsetWidth;
  const target = chipStart - (navEl.clientWidth - chipWidth) / 2;

  navEl.scrollTo({
    left: Math.max(0, Math.min(target, maxScroll)),
    behavior: 'smooth',
  });
}

/** Undo accidental horizontal page drift on mobile admin. */
export function resetPageHorizontalScroll() {
  if (typeof window === 'undefined') return;
  if (window.scrollX === 0) return;
  window.scrollTo(0, window.scrollY);
}