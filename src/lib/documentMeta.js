/**
 * Client-side document title / description / Open Graph for SPA routes.
 * Canonical origin: VITE_SITE_DOMAIN (www.echocore412.com).
 */

import { getConfiguredSiteHost } from './siteDomain';

const DEFAULT_SITE_NAME = 'ECHOCORE Store';

export function getSiteOrigin() {
  const host = getConfiguredSiteHost();
  if (host) return `https://${host}`;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'https://www.echocore412.com';
}

/**
 * Map pathname → meta keys resolved from `t` (translations).
 * Returns { title, description } strings ready to set.
 */
export function resolveRouteMeta(pathname, t = {}, lang = 'ar') {
  const path = (pathname || '/').replace(/\/+$/, '') || '/';
  const site = t.seoSiteName || DEFAULT_SITE_NAME;

  const map = {
    '/': {
      title: t.seoHomeTitle || site,
      description: t.seoHomeDescription || t.seoDefaultDescription,
    },
    '/games': {
      title: t.seoGamesTitle || site,
      description: t.seoGamesDescription || t.seoDefaultDescription,
    },
    '/gift-cards': {
      title: t.seoGiftCardsTitle || site,
      description: t.seoGiftCardsDescription || t.seoDefaultDescription,
    },
    '/accounts': {
      title: t.seoGiftCardsTitle || site,
      description: t.seoGiftCardsDescription || t.seoDefaultDescription,
    },
    '/sale': {
      title: t.seoSaleTitle || site,
      description: t.seoSaleDescription || t.seoDefaultDescription,
    },
    '/search': {
      title: t.seoSearchTitle || site,
      description: t.seoDefaultDescription,
    },
    '/suggested': {
      title: t.seoSuggestedTitle || site,
      description: t.seoSuggestedDescription || t.seoDefaultDescription,
    },
    '/faq': {
      title: t.seoFaqTitle || site,
      description: t.seoFaqDescription || t.seoDefaultDescription,
    },
    '/how': {
      title: t.seoHowTitle || site,
      description: t.seoHowDescription || t.seoDefaultDescription,
    },
    '/contact': {
      title: t.seoContactTitle || site,
      description: t.seoContactDescription || t.seoDefaultDescription,
    },
    '/support': {
      title: t.seoSupportTitle || site,
      description: t.seoSupportDescription || t.seoDefaultDescription,
    },
    '/privacy': {
      title: t.seoPrivacyTitle || site,
      description: t.seoDefaultDescription,
    },
    '/terms': {
      title: t.seoTermsTitle || site,
      description: t.seoDefaultDescription,
    },
    '/login': {
      title: t.seoLoginTitle || site,
      description: t.seoDefaultDescription,
    },
    '/recharge': {
      title: t.seoRechargeTitle || site,
      description: t.seoDefaultDescription,
    },
    '/cart': {
      title: t.seoCartTitle || site,
      description: t.seoDefaultDescription,
    },
    '/checkout': {
      title: t.seoCheckoutTitle || site,
      description: t.seoDefaultDescription,
    },
    '/links': {
      title: t.seoLinksTitle || site,
      description: t.seoDefaultDescription,
    },
    '/profile': {
      title: t.seoProfileTitle || site,
      description: t.seoDefaultDescription,
    },
    '/notifications': {
      title: t.seoNotificationsTitle || site,
      description: t.seoDefaultDescription,
    },
  };

  let meta = map[path];

  if (!meta && path.startsWith('/game/')) {
    meta = {
      title: t.seoGameTitle || site,
      description: t.seoGamesDescription || t.seoDefaultDescription,
    };
  } else if (!meta && path.startsWith('/dashboard')) {
    meta = {
      title: t.seoAdminTitle || site,
      description: t.seoDefaultDescription,
    };
  } else if (!meta) {
    meta = {
      title: t.seoDefaultTitle || site,
      description: t.seoDefaultDescription || '',
    };
  }

  const title = meta.title.includes(site) || meta.title === site
    ? meta.title
    : `${meta.title} · ${site}`;

  return {
    title,
    description: meta.description || t.seoDefaultDescription || '',
    lang: lang === 'en' ? 'en' : 'ar',
    path,
  };
}

function upsertMeta(attr, key, content) {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content || '');
}

function upsertLink(rel, href) {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * Apply title, description, OG, Twitter, canonical for current route.
 */
export function applyDocumentMeta({
  title,
  description,
  lang = 'ar',
  path = '/',
  imageUrl = null,
} = {}) {
  if (typeof document === 'undefined') return;

  const origin = getSiteOrigin();
  const url = `${origin}${path === '/' ? '/' : path}`;
  const image = imageUrl || `${origin}/echo-core-logo.png`;
  const site = DEFAULT_SITE_NAME;

  document.title = title || site;
  if (document.documentElement) {
    document.documentElement.lang = lang === 'en' ? 'en' : 'ar';
  }

  upsertMeta('name', 'description', description);
  upsertMeta('property', 'og:type', 'website');
  upsertMeta('property', 'og:site_name', site);
  upsertMeta('property', 'og:title', title || site);
  upsertMeta('property', 'og:description', description);
  upsertMeta('property', 'og:url', url);
  upsertMeta('property', 'og:image', image);
  upsertMeta('property', 'og:locale', lang === 'en' ? 'en_US' : 'ar_SY');
  upsertMeta('name', 'twitter:card', 'summary');
  upsertMeta('name', 'twitter:title', title || site);
  upsertMeta('name', 'twitter:description', description);
  upsertMeta('name', 'twitter:image', image);
  upsertLink('canonical', url);
}
