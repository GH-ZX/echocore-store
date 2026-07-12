import { Gamepad2, Ticket } from 'lucide-react';
import { CATALOG_SEGMENTS, getGameCatalogSegment } from './catalogSegments';
import { getGameDisplayName } from './offerDisplay';

/** G2Bulk-aligned storefront lanes: instant top-ups + gift cards/vouchers */
export const CATALOG_NAV_ITEMS = [
  {
    path: '/games',
    icon: Gamepad2,
    labelKey: 'g2bulkTopupsNav',
    descKey: 'g2bulkTopupsDesc',
    fallbackEn: 'Instant Game Top-Ups',
    fallbackAr: 'شحن الألعاب الفوري',
    accent: 'games',
    g2bulkLane: 'topup',
  },
  {
    path: '/gift-cards',
    icon: Ticket,
    labelKey: 'g2bulkVouchersNav',
    descKey: 'g2bulkVouchersDesc',
    fallbackEn: 'Gift Cards & Vouchers',
    fallbackAr: 'بطاقات الهدايا والقسائم',
    accent: 'gift',
    g2bulkLane: 'voucher',
  },
];

export const CATALOG_MENU_PATHS = CATALOG_NAV_ITEMS.map((item) => item.path);

export const VOUCHER_FILTER_ALL = 'all';
export const VOUCHER_FILTER_PLATFORM = 'platform';
export const VOUCHER_FILTER_GAME = 'game';

export function getCatalogNavLabel(t, lang, item) {
  if (t?.[item.labelKey]) return t[item.labelKey];
  return lang === 'ar' ? item.fallbackAr : item.fallbackEn;
}

export function getCatalogNavDesc(t, lang, item) {
  if (t?.[item.descKey]) return t[item.descKey];
  return '';
}

export function getCatalogNavItemForSegment(segment) {
  if (segment === CATALOG_SEGMENTS.topup) {
    return CATALOG_NAV_ITEMS.find((item) => item.path === '/games');
  }
  return CATALOG_NAV_ITEMS.find((item) => item.path === '/gift-cards');
}

export function getCatalogNavItemForGame(game) {
  return getCatalogNavItemForSegment(getGameCatalogSegment(game));
}

export function getCatalogContextForGame(game, t, lang) {
  const navItem = getCatalogNavItemForGame(game);
  return {
    navItem,
    segment: getGameCatalogSegment(game),
    label: getCatalogNavLabel(t, lang, navItem),
    path: navItem.path,
  };
}

export function buildGameBreadcrumb(game, t, lang, navigate, { offerName = null } = {}) {
  const { label, path } = getCatalogContextForGame(game, t, lang);
  const gameName = getGameDisplayName(game, lang);
  const gamePath = `/game/${game.slug || game.id}`;

  const breadcrumb = [
    { label, onClick: () => navigate(path) },
    {
      label: gameName,
      onClick: offerName ? () => navigate(gamePath) : undefined,
    },
  ];

  if (offerName) {
    breadcrumb.push({ label: offerName });
  }

  return {
    breadcrumb,
    backLabel: label,
    backPath: path,
  };
}