import { Gamepad2, Ticket, UserCircle } from 'lucide-react';

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