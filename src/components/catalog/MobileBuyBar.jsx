import { createPortal } from 'react-dom';

/** Viewport-fixed buy CTA — portaled to body so ancestor transforms do not break position:fixed. */
export default function MobileBuyBar({ children }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}