import { describe, expect, it } from 'vitest';
import {
  buildCanonicalUrl,
  shouldRedirectToCanonicalHost,
} from './siteDomain';

describe('shouldRedirectToCanonicalHost', () => {
  it('does not redirect when already on www', () => {
    expect(shouldRedirectToCanonicalHost('www.echocore412.com', 'www.echocore412.com')).toBe(false);
  });

  it('redirects apex to www', () => {
    expect(shouldRedirectToCanonicalHost('echocore412.com', 'www.echocore412.com')).toBe(true);
  });

  it('skips localhost', () => {
    expect(shouldRedirectToCanonicalHost('localhost', 'www.echocore412.com')).toBe(false);
  });

  it('skips unrelated hosts (e.g. github.io preview)', () => {
    expect(shouldRedirectToCanonicalHost('gh-zx.github.io', 'www.echocore412.com')).toBe(false);
  });
});

describe('buildCanonicalUrl', () => {
  it('keeps path and query on https www', () => {
    expect(buildCanonicalUrl({
      configuredHost: 'www.echocore412.com',
      pathname: '/games',
      search: '?q=1',
      hash: '#x',
    })).toBe('https://www.echocore412.com/games?q=1#x');
  });
});
