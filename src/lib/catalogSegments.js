const GAMING_ACCOUNT_KEYWORDS = [
  'xbox', 'playstation', 'psn', 'ps4', 'ps5', 'ps plus', 'psplus',
  'nintendo', 'eshop', 'e-shop', 'switch online',
  'game pass', 'gamepass', 'live gold', 'ultimate',
  'steam wallet', 'steam card', 'steam account', 'steam gift',
  'netflix', 'spotify', 'disney', 'hulu', 'prime video', 'amazon gift', 'amazon card',
  'apple', 'itunes', 'app store', 'apple gift', 'apple card',
  'google play', 'google gift',
  'razer', 'razer gold', 'zgold', 'z gold', 'gold pin',
  'paysafe', 'paysafecard', 'pay safe',
  'blizzard', 'battle.net', 'battlenet', 'battle net',
  'epic games', 'epic gift',
  'origin', 'ea play', 'ea gift',
  'office', 'windows', 'chatgpt', 'openai', 'discord nitro', 'vpn',
  'subscription', 'membership', 'account', 'wallet code', 'store credit',
];

const GIFT_CARD_KEYWORDS = [
  'pubg', 'mobile legends', 'mlbb', 'free fire', 'cod ', 'call of duty',
  'valorant', 'robux', 'roblox', 'fortnite', 'genshin', 'honkai',
  'diamond', 'crystal', 'uc ', ' vp', ' rp', 'gems', 'coins', 'top up',
  'top-up', 'topup', 'voucher', 'gift card', 'giftcard',
];

const PLATFORM_BRAND_PATTERN = /xbox|playstation|psn|nintendo|steam|netflix|spotify|itunes|apple|google play|razer|zgold|paysafe|blizzard|battle\.?net|epic games|origin|ea play|amazon/i;

/** DB-backed catalog segments */
export const CATALOG_SEGMENTS = {
  topup: 'topup',
  voucher: 'voucher',
};

/** UI-only voucher tags for platform vs in-game filters */
export const VOUCHER_UI_TAGS = {
  giftCard: 'gift_card',
  gamingAccount: 'gaming_account',
};

export function classifyVoucherSegment(title = '') {
  const normalized = String(title).trim().toLowerCase();
  if (!normalized) return VOUCHER_UI_TAGS.giftCard;

  if (GAMING_ACCOUNT_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return VOUCHER_UI_TAGS.gamingAccount;
  }

  if (GIFT_CARD_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return VOUCHER_UI_TAGS.giftCard;
  }

  if (PLATFORM_BRAND_PATTERN.test(normalized)) {
    return VOUCHER_UI_TAGS.gamingAccount;
  }

  return VOUCHER_UI_TAGS.giftCard;
}

export function isVoucherCatalogGame(game) {
  if (!game) return false;
  if (game.redemption_method === 'redeem_code') return true;
  return game.catalog_segment === CATALOG_SEGMENTS.voucher
    || game.catalog_segment === VOUCHER_UI_TAGS.giftCard
    || game.catalog_segment === VOUCHER_UI_TAGS.gamingAccount;
}

/** Storefront routing segment — topup or UI voucher tag */
export function getGameCatalogSegment(game) {
  if (!game) return CATALOG_SEGMENTS.topup;
  if (isVoucherCatalogGame(game)) {
    return classifyVoucherSegment(game.name_en || game.name_ar || game.slug || '');
  }
  return CATALOG_SEGMENTS.topup;
}

export function isGiftCardGame(game) {
  return getGameCatalogSegment(game) === VOUCHER_UI_TAGS.giftCard;
}

export function isGamingAccountGame(game) {
  return getGameCatalogSegment(game) === VOUCHER_UI_TAGS.gamingAccount;
}