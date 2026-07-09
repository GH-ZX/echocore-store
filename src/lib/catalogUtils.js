import { getStorefrontGames, getStorefrontVoucherGames, isStorefrontGame } from './gameRegions';
import {
  CATALOG_SEGMENTS,
  getGameCatalogSegment,
  isGiftCardGame,
  isGamingAccountGame,
} from './catalogSegments';

export { CATALOG_SEGMENTS, getGameCatalogSegment, isGiftCardGame, isGamingAccountGame };

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

export function getGiftCardGames(games = []) {
  return getStorefrontVoucherGames(games).filter((game) => isGiftCardGame(game));
}

export function getGamingAccountGames(games = []) {
  return getStorefrontVoucherGames(games).filter((game) => isGamingAccountGame(game));
}

export function getTopupGames(games = []) {
  return getStorefrontGames(games).filter((game) => isTopupGame(game) && game.active !== false);
}

export function countActiveOffers(gameId, offers = []) {
  if (!gameId) return 0;
  return offers.filter((offer) => offer.game_id === gameId && offer.active !== false).length;
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
    if (segment === CATALOG_SEGMENTS.gamingAccount) return gamingAccounts;
    if (segment === CATALOG_SEGMENTS.giftCard) return giftCards;
    return vouchers;
  }
  return topups;
}