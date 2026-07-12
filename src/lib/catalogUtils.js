import {
  getStorefrontGames,
  getStorefrontVoucherGames,
  isStorefrontGame,
  storefrontGameHasOffers,
} from './gameRegions';
import {
  CATALOG_SEGMENTS,
  VOUCHER_UI_TAGS,
  getGameCatalogSegment,
  isGiftCardGame,
  isGamingAccountGame,
} from './catalogSegments';

export {
  CATALOG_SEGMENTS,
  VOUCHER_UI_TAGS,
  getGameCatalogSegment,
  isGiftCardGame,
  isGamingAccountGame,
};

export function isVoucherGame(game) {
  return !!game && game.redemption_method === 'redeem_code';
}

export function isTopupGame(game) {
  if (!game) return false;
  return game.redemption_method === 'uid'
    || game.redemption_method === 'both'
    || (!game.redemption_method && !isVoucherGame(game));
}

export function getVoucherGames(games = []) {
  return getStorefrontVoucherGames(games);
}

/** All G2Bulk voucher categories (gift cards + platform brands) — single storefront lane */
export function getCatalogVoucherGames(games = []) {
  return getStorefrontVoucherGames(games);
}

export function getGiftCardGames(games = []) {
  return getStorefrontVoucherGames(games).filter((game) => isGiftCardGame(game));
}

export function getGamingAccountGames(games = []) {
  return getStorefrontVoucherGames(games).filter((game) => isGamingAccountGame(game));
}

export function filterVoucherGamesBySegment(games = [], filter = 'all') {
  if (filter === 'platform') {
    return games.filter((game) => isGamingAccountGame(game));
  }
  if (filter === 'game') {
    return games.filter((game) => isGiftCardGame(game));
  }
  return games;
}

export function getTopupGames(games = []) {
  return getStorefrontGames(games).filter((game) => isTopupGame(game) && game.active !== false);
}

/** Top-up games visible on the storefront — excludes titles with zero active offers. */
export function getVisibleTopupGames(games = [], offers = [], { isAdmin = false } = {}) {
  const topups = getTopupGames(games);
  if (isAdmin) return topups;
  return topups.filter((game) => storefrontGameHasOffers(game, games, offers));
}

export function countActiveOffers(gameId, offers = []) {
  if (!gameId) return 0;
  return offers.filter((offer) => offer.game_id === gameId && offer.active !== false).length;
}

export function resolveOfferCatalogType(offer, games = []) {
  if (!offer) return 'topup';
  if (offer.g2bulk_type === 'voucher') return 'gift_code';
  if (offer.g2bulk_type === 'topup') return 'topup';

  const game = games.find((row) => row.id === offer.game_id);
  if (game?.redemption_method === 'redeem_code') return 'gift_code';
  return 'topup';
}

/** Admin + overview stats — separates UID top-up packs from instant gift codes. */
export function getCatalogOfferStats(offers = [], games = []) {
  let topupPacks = 0;
  let giftCodes = 0;

  offers.forEach((offer) => {
    if (offer.active === false) return;
    if (resolveOfferCatalogType(offer, games) === 'gift_code') {
      giftCodes += 1;
    } else {
      topupPacks += 1;
    }
  });

  return {
    games: getVisibleTopupGames(games, offers).length,
    topupPacks,
    giftCodes,
    totalPacks: topupPacks + giftCodes,
  };
}

export function offerBelongsToCatalog(offer, games = [], {
  vouchers = true,
  topups = true,
  giftCards = true,
  gamingAccounts = true,
} = {}) {
  if (!offer?.game_id) return false;
  const game = games.find((row) => row.id === offer.game_id);
  if (!game || !isStorefrontGame(game) || game.active === false) return false;
  if (isVoucherGame(game)) {
    if (!vouchers) return false;
    const segment = getGameCatalogSegment(game);
    if (segment === VOUCHER_UI_TAGS.gamingAccount) return gamingAccounts;
    if (segment === VOUCHER_UI_TAGS.giftCard) return giftCards;
    return vouchers;
  }
  return topups;
}