import { useState, useEffect, useCallback } from 'react';

/**
 * Fixed positioning for header dropdown panels portaled to document.body.
 * @param {'start' | 'end'} align — end = align panel trailing edge to trigger (profile, notif)
 */
export function useHeaderDropdownPosition(
  triggerRef,
  open,
  { align = 'end', gap = 8, width = 280 } = {},
) {
  const [coords, setCoords] = useState({ top: 0, left: 0, width });

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return;

    const rect = triggerRef.current.getBoundingClientRect();
    const panelWidth = Math.min(width, window.innerWidth - 24);
    const rtl = document.documentElement.dir === 'rtl';

    let left;
    if (align === 'end') {
      left = rtl
        ? Math.max(12, rect.left)
        : Math.max(12, rect.right - panelWidth);
    } else {
      left = rtl
        ? Math.max(12, rect.right - panelWidth)
        : Math.max(12, rect.left);
    }

    left = Math.min(left, window.innerWidth - panelWidth - 12);

    setCoords({
      top: rect.bottom + gap,
      left,
      width: panelWidth,
    });
  }, [triggerRef, align, gap, width]);

  useEffect(() => {
    if (!open) return undefined;
    updatePosition();
    const onReposition = () => updatePosition();
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [open, updatePosition]);

  return { coords, updatePosition };
}