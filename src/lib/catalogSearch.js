import { getGameDisplayName } from './offerDisplay';

export function normalizeCatalogQuery(query = '') {
  return String(query || '').trim().toLowerCase();
}

export function filterGamesByQuery(games = [], query = '', lang = 'ar') {
  const q = normalizeCatalogQuery(query);
  if (!q) return games;

  return games.filter((game) => {
    const name = getGameDisplayName(game, lang).toLowerCase();
    const slug = String(game.slug || '').toLowerCase();
    const region = String(game.region_label || '').toLowerCase();
    return name.includes(q) || slug.includes(q) || region.includes(q);
  });
}