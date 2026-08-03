import { useCallback, useEffect, useRef, useState } from 'react';

export function useToastState() {
  const [notification, setNotification] = useState(null);
  const toastTimerRef = useRef(null);

  const showToast = useCallback((message, type = 'success', options = {}) => {
    const title = options.title || null;
    const body = options.body || null;
    const onClick = typeof options.onClick === 'function' ? options.onClick : null;
    const text = message || body || title;
    if (!text) return;
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    const duration = Number.isFinite(options.duration)
      ? options.duration
      : (type === 'error' ? 4500 : 3200);
    setNotification({
      message: text,
      title,
      body: body || (title ? message : null),
      type,
      onClick,
      hint: onClick ? (options.hint || null) : null,
    });
    toastTimerRef.current = setTimeout(() => {
      setNotification(null);
      toastTimerRef.current = null;
    }, duration);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setNotification(null);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  return { notification, showToast, dismissToast };
}
