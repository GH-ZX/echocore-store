import { useCallback } from 'react';

/**
 * Wraps `onNotify` (AppToast) with typed, memoized convenience helpers.
 * `notifyError(m)` → toast level 'error', `notifySuccess(m)` → 'success',
 * `notify(m)` → default level. Safe when `onNotify` is undefined.
 */
export function useNotify(onNotify) {
  const notify = useCallback((message, level) => onNotify?.(message, level), [onNotify]);
  const notifyError = useCallback((message) => notify(message, 'error'), [notify]);
  const notifySuccess = useCallback((message) => notify(message, 'success'), [notify]);
  return { notify, notifyError, notifySuccess };
}
