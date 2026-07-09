import { getStorefrontGames, isStorefrontGame } from './gameRegions';

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
  return getStorefrontGames(games).filter((game) => isVoucherGame(game) && game.active !== false);
}

export function getTopupGames(games = []) {
  return getStorefrontGames(games).filter((game) => isTopupGame(game) && game.active !== false);
}

export function countActiveOffers(gameId, offers = []) {
  if (!gameId) return 0;
  return offers.filter((offer) => offer.game_id === gameId && offer.active !== false).length;
}

export function offerBelongsToCatalog(offer, games = [], { vouchers = true, topups = true } = {}) {
  if (!offer?.game_id) return false;
  const game = games.find((row) => row.id === offer.game_id);
  if (!game || !isStorefrontGame(game) || game.active === false) return false;
  if (isVoucherGame(game)) return vouchers;
  return topups;
}