import { describe, expect, it } from 'vitest';
import { isDynamicImportError } from './lazyRetry';

describe('isDynamicImportError', () => {
  it('detects JS dynamic import failures', () => {
    expect(isDynamicImportError(new Error('Failed to fetch dynamically imported module: /assets/x.js'))).toBe(true);
    expect(isDynamicImportError(new Error('Loading chunk 123 failed'))).toBe(true);
    expect(isDynamicImportError(new Error('Importing a module script failed'))).toBe(true);
  });

  it('detects CSS preload failures', () => {
    expect(isDynamicImportError(new Error('Unable to preload CSS for /assets/Aurora-BUiUCx3R.css'))).toBe(true);
    expect(isDynamicImportError(new Error('stylesheet preload failed'))).toBe(true);
  });

  it('does not flag unrelated errors', () => {
    expect(isDynamicImportError(new Error('TypeError: Cannot read properties of undefined'))).toBe(false);
    expect(isDynamicImportError(new Error('NetworkError when attempting to fetch resource.'))).toBe(false);
  });
});
