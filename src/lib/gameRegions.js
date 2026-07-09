const REGION_TOKENS = {
  sea: 'SEA',
  southeast_asia: 'SEA',
  southeastasia: 'SEA',
  global: 'Global',
  gl: 'Global',
  europe: 'Europe',
  eu: 'Europe',
  turkey: 'Turkey',
  tr: 'Turkey',
  korea: 'Korea',
  kr: 'Korea',
  na: 'North America',
  north_america: 'North America',
  america: 'North America',
  latam: 'Latin America',
  latin_america: 'Latin America',
  mena: 'MENA',
  middle_east: 'Middle East',
  japan: 'Japan',
  jp: 'Japan',
  india: 'India',
  indonesia: 'Indonesia',
  id: 'Indonesia',
  russia: 'Russia',
  ru: 'Russia',
  china: 'China',
  cn: 'China',
  brazil: 'Brazil',
  br: 'Brazil',
  oceania: 'Oceania',
  oce: 'Oceania',
  taiwan: 'Taiwan',
  tw: 'Taiwan',
  hk: 'Hong Kong',
  hong_kong: 'Hong Kong',
  sg: 'Singapore',
  singapore: 'Singapore',
  ph: 'Philippines',
  philippines: 'Philippines',
  my: 'Malaysia',
  malaysia: 'Malaysia',
  th: 'Thailand',
  thailand: 'Thailand',
  vn: 'Vietnam',
  vietnam: 'Vietnam',
  kh: 'Cambodia',
  cambodia: 'Cambodia',
};

function normalizeRegionToken(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s/]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

export function normalizeRegionLabel(value = '') {
  const token = normalizeRegionToken(value);
  if (REGION_TOKENS[token]) return REGION_TOKENS[token];

  const cleaned = String(value).trim();
  if (!cleaned) return 'Global';
  return cleaned
    .split(/[\s/_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function parseG2BulkGameMeta(code = '', name = '') {
  const normalizedCode = String(code || '').trim().toLowerCase();
  const displayName = String(name || code || '').trim();
  const parts = normalizedCode.split(/[_-]+/).filter(Boolean);

  let regionLabel = null;
  let baseKey = normalizedCode;

  if (parts.length > 1) {
    const suffix = parts[parts.length - 1];
    if (REGION_TOKENS[suffix]) {
      regionLabel = REGION_TOKENS[suffix];
      baseKey = parts.slice(0, -1).join('_');
    }
  }

  if (!regionLabel) {
    const paren = displayName.match(/\(([^)]+)\)\s*$/);
    if (paren) regionLabel = normalizeRegionLabel(paren[1]);
  }

  if (!regionLabel) {
    const dash = displayName.match(/[-–—]\s*([^(-]+)\s*$/);
    if (dash) regionLabel = normalizeRegionLabel(dash[1]);
  }

  let baseName = displayName;
  if (regionLabel) {
    baseName = displayName
      .replace(/\s*\([^)]+\)\s*$/, '')
      .replace(/\s*[-–—]\s*[^-–—]+$/, '')
      .trim() || displayName;
  }

  if (!regionLabel) regionLabel = 'Global';

  return {
    baseKey: baseKey || normalizedCode,
    baseName: baseName || displayName || normalizedCode,
    regionLabel,
  };
}

export function isStorefrontGame(game) {
  return !!game && !game.parent_game_id;
}

export function getStorefrontGames(games = []) {
  return games.filter(isStorefrontGame);
}

export function getRegionVariants(games = [], parentId) {
  if (!parentId) return [];
  return games
    .filter((game) => game.parent_game_id === parentId && game.active !== false)
    .sort((a, b) => String(a.region_label || '').localeCompare(String(b.region_label || '')));
}

export function buildChildToParentMap(games = []) {
  const map = new Map();
  games.forEach((game) => {
    if (game.parent_game_id) map.set(game.id, game.parent_game_id);
  });
  return map;
}

export function getChildGameIds(games = [], game) {
  if (!game) return [];
  if (game.parent_game_id) return [game.id];

  const children = getRegionVariants(games, game.id);
  if (children.length > 0) return children.map((child) => child.id);
  return [game.id];
}

export function resolveStorefrontGame(games = [], gameOrSlug) {
  if (!gameOrSlug) return null;

  const game = typeof gameOrSlug === 'string'
    ? games.find((row) => (row.slug || row.id) === gameOrSlug || row.id === gameOrSlug)
    : gameOrSlug;

  if (!game) return null;
  if (!game.parent_game_id) return game;
  return games.find((row) => row.id === game.parent_game_id) || game;
}

export function getDisplayGameForOffer(offer, games = []) {
  if (!offer) return null;
  const fulfillment = games.find((game) => game.id === offer.game_id);
  if (!fulfillment) return null;
  if (fulfillment.parent_game_id) {
    return games.find((game) => game.id === fulfillment.parent_game_id) || fulfillment;
  }
  return fulfillment;
}

export function getFulfillmentGameForOffer(offer, games = []) {
  if (!offer) return null;
  return games.find((game) => game.id === offer.game_id) || null;
}

export function offerBelongsToStorefront(offer, games = [], storefrontIds = null) {
  if (!offer) return false;
  const ids = storefrontIds || new Set(getStorefrontGames(games).map((game) => game.id));
  if (ids.has(offer.game_id)) return true;

  const childToParent = buildChildToParentMap(games);
  const parentId = childToParent.get(offer.game_id);
  return !!(parentId && ids.has(parentId));
}

export function regionParamSlug(label = '') {
  return String(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'global';
}

export function findVariantByRegionParam(variants = [], regionParam = '') {
  if (!regionParam || variants.length === 0) return null;
  const normalized = String(regionParam).trim().toLowerCase();
  return variants.find((variant) => regionParamSlug(variant.region_label) === normalized)
    || variants.find((variant) => String(variant.region_label || '').toLowerCase() === normalized)
    || null;
}

export function pickDefaultVariant(variants = []) {
  if (!variants.length) return null;
  return variants.find((variant) => variant.region_label === 'Global')
    || variants[0];
}