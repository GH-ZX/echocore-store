import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

const SIZE_MAX = {
  sm: '24rem',
  md: '28rem',
  lg: '32rem',
  xl: '48rem',
  '2xl': '64rem',
};

export default function Modal({
  open = false,
  onClose,
  children,
  zIndex = 200,
  size = 'md',
  closeOnBackdrop = true,
  closeOnEscape = true,
  role = 'dialog',
  ariaLabelledBy,
  ariaDescribedBy,
  panelClassName = '',
  scrollable = true,
}) {
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open || !closeOnEscape || !onClose) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeOnEscape, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const panelClasses = [
    'modal-panel',
    scrollable ? 'modal-panel--scrollable' : '',
    panelClassName,
  ].filter(Boolean).join(' ');

  return createPortal(
    <div
      className="modal-root"
      style={{
        '--modal-z': zIndex,
        '--modal-max-width': SIZE_MAX[size] || SIZE_MAX.md,
      }}
      role="presentation"
    >
      <div
        className="modal-backdrop"
        aria-hidden="true"
        onClick={closeOnBackdrop && onClose ? onClose : undefined}
      />
      <div className="modal-scrim">
        <div
          role={role}
          aria-modal="true"
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          className={panelClasses}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}