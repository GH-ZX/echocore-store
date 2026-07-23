/**
 * Canonical production host: www.echocore412.com (VITE_SITE_DOMAIN).
 * Apex and other aliases should redirect to https://www.…
 */

/** @returns {string|null} hostname without port, e.g. www.echocore412.com */
export function getConfiguredSiteHost() {
  const explicit = import.meta.env.VITE_AUTH_SITE_URL?.trim();
  if (explicit) {
    try {
      return new URL(explicit.includes('://') ? explicit : `https://${explicit}`).hostname.toLowerCase();
    } catch {
      /* fall through */
    }
  }
  const domain = import.meta.env.VITE_SITE_DOMAIN?.trim();
  if (domain) {
    return domain.replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
  }
  return null;
}

/**
 * True when current host should redirect to the configured production host.
 * Skips localhost and when no domain env is set (local/dev).
 */
export function shouldRedirectToCanonicalHost(currentHostname, configuredHost = getConfiguredSiteHost()) {
  if (!configuredHost || !currentHostname) return false;
  const current = String(currentHostname).toLowerCase().replace(/\.$/, '');
  const want = String(configuredHost).toLowerCase().replace(/\.$/, '');
  if (!want || current === want) return false;
  if (current === 'localhost' || current === '127.0.0.1' || current.endsWith('.local')) return false;
  // Only redirect apex ↔ www style mismatches for our domain, not random preview hosts
  const wantBare = want.replace(/^www\./, '');
  const currentBare = current.replace(/^www\./, '');
  if (currentBare !== wantBare) return false;
  return true;
}

/**
 * Build https canonical URL for the same path/query/hash on the preferred host.
 */
export function buildCanonicalUrl({
  configuredHost = getConfiguredSiteHost(),
  pathname = '/',
  search = '',
  hash = '',
} = {}) {
  if (!configuredHost) return null;
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `https://${configuredHost}${path}${search || ''}${hash || ''}`;
}

/**
 * In production, hard-redirect apex (or wrong www/apex) → VITE_SITE_DOMAIN.
 * Call once at app boot. Returns true if a redirect was started.
 */
export function enforceCanonicalHost(locationLike = typeof window !== 'undefined' ? window.location : null) {
  if (!import.meta.env.PROD) return false;
  if (!locationLike?.hostname) return false;

  const configuredHost = getConfiguredSiteHost();
  if (!shouldRedirectToCanonicalHost(locationLike.hostname, configuredHost)) {
    return false;
  }

  const url = buildCanonicalUrl({
    configuredHost,
    pathname: locationLike.pathname || '/',
    search: locationLike.search || '',
    hash: locationLike.hash || '',
  });
  if (!url) return false;

  locationLike.replace(url);
  return true;
}
