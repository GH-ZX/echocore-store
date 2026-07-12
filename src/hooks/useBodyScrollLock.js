import { useEffect } from 'react';

let lockCount = 0;
let savedScrollY = 0;

export function useBodyScrollLock(locked) {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return undefined;

    if (lockCount === 0) {
      savedScrollY = window.scrollY;
      document.body.classList.add('modal-open');
      document.body.style.setProperty('--scroll-lock-top', `-${savedScrollY}px`);
      document.documentElement.classList.add('modal-open');
    }
    lockCount += 1;

    return () => {
      lockCount -= 1;
      if (lockCount <= 0) {
        lockCount = 0;
        document.body.classList.remove('modal-open');
        document.body.style.removeProperty('--scroll-lock-top');
        document.documentElement.classList.remove('modal-open');
        window.scrollTo(0, savedScrollY);
      }
    };
  }, [locked]);
}