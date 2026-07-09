import { Gamepad2, Ticket, UserCircle } from 'lucide-react';
import { CATALOG_SEGMENTS, getGameCatalogSegment } from './catalogSegments';
import { getGameDisplayName } from './offerDisplay';

export const CATALOG_NAV_ITEMS = [
  {
    path: '/games',
    icon: Gamepad2,
    labelKey: 'allGames',
    descKey: 'categoryGamesDesc',
    fallbackEn: 'Games',
    fallbackAr: 'الألعاب',
    accent: 'games',
  },
  {
    path: '/gift-cards',
    icon: Ticket,
    labelKey: 'giftCards',
    descKey: 'categoryGiftCardsDesc',
    fallbackEn: 'Gift cards',
    fallbackAr: 'بطاقات الهدايا',
    accent: 'gift',
  },
  {
    path: '/accounts',
    icon: UserCircle,
    labelKey: 'gamingAccounts',
    descKey: 'categoryAccountsDesc',
    fallbackEn: 'Accounts',
    fallbackAr: 'حسابات الألعاب',
    accent: 'account',
  },
];

export const CATALOG_MENU_PATHS = CATALOG_NAV_ITEMS.map((item) => item.path);

export function getCatalogNavLabel(t, lang, item) {
  if (t?.[item.labelKey]) return t[item.labelKey];
  return lang === 'ar' ? item.fallbackAr : item.fallbackEn;
}

export function getCatalogNavDesc(t, lang, item) {
  if (t?.[item.descKey]) return t[item.descKey];
  return '';
}

export function getCatalogNavItemForSegment(segment) {
  if (segment === CATALOG_SEGMENTS.gamingAccount) {
    return CATALOG_NAV_ITEMS.find((item) => item.path === '/accounts');
  }
  if (segment === CATALOG_SEGMENTS.giftCard) {
    return CATALOG_NAV_ITEMS.find((item) => item.path === '/gift-cards');
  }
  return CATALOG_NAV_ITEMS.find((item) => item.path === '/games');
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