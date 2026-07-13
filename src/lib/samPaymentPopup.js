const POPUP_NAME = 'echocore_sam_payment';

export function openSamPaymentWindow(url) {
  if (!url || typeof window === 'undefined') return null;

  const width = 480;
  const height = 760;
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
  const features = [
    'popup=yes',
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    'noopener',
    'noreferrer',
  ].join(',');

  const popup = window.open(url, POPUP_NAME, features);
  return popup;
}

export function closeSamPaymentWindow(popup) {
  try {
    if (popup && !popup.closed) popup.close();
  } catch {
    /* popup may be cross-origin */
  }
}