import { getChildGameIds } from './gameRegions';
import { resolveSupabaseGameLogo } from './supabaseGameLogos';

const STOP_WORDS = new Set([
  'mobile', 'global', 'mena', 'top', 'up', 'topup', 'top-up', 'game', 'games',
  'the', 'and', 'for', 'instant', 'code', 'card', 'gift', 'pack', 'points', 'credits',
  'شحن', 'فوري', 'كود', 'بطاقة', 'لعبة', 'العاب', 'ألعاب', 'عالمي', 'عالمية',
]);

function assetUrl(fileName) {
  try {
    return new URL(`../assets/${fileName}`, import.meta.url).href;
  } catch {
    return null;
  }
}

/** Known brand logos bundled with the storefront. Keywords match name_en, name_ar, slug. */
const BRAND_LOGO_REGISTRY = [
  {
    id: 'valorant',
    keywords: [
      'valorant', 'valo', 'فالورانت', 'فالورن', 'ريوت فالورانت', 'riot valorant',
    ],
    logo: assetUrl('valorant-logo.png'),
  },
  {
    id: 'lol',
    keywords: [
      'league of legends', 'league legends', 'league-of-legends', 'lol', 'legends',
      'ليج اوف ليجندز', 'ليج أوف ليجندز', 'لول', 'ليجيند',
    ],
    logo: assetUrl('league-of-legends-logo.png'),
  },
  {
    id: 'xbox',
    keywords: [
      'xbox', 'game pass', 'gamepass', 'xbox live', 'microsoft xbox', 'xbox game',
      'إكسبوكس', 'اكسبوكس', 'جيم باس', 'جيم باس',
    ],
    logo: assetUrl('xbox-logo.png'),
  },
];

export function normalizeGameSearchText(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[^\w\u0600-\u06FF\s-]/g, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectGameSearchText(game) {
  if (!game) return '';
  return [
    game.name_en,
    game.name_ar,
    game.slug,
    game.points_name,
    game.g2bulk_game_code,
    game.group_base_key,
  ]
    .filter(Boolean)
    .join(' ');
}

function tokenizeSearchText(text) {
  return normalizeGameSearchText(text)
    .split(' ')
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function matchBrandLogoByName(game) {
  const haystack = normalizeGameSearchText(collectGameSearchText(game));
  if (!haystack) return null;

  let bestLogo = null;
  let bestScore = 0;

  for (const brand of BRAND_LOGO_REGISTRY) {
    if (!brand.logo) continue;
    for (const keyword of brand.keywords) {
      const needle = normalizeGameSearchText(keyword);
      if (!needle || needle.length < 2) continue;
      if (!haystack.includes(needle)) continue;

      const score = needle.length + (haystack.startsWith(needle) ? 4 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestLogo = brand.logo;
      }
    }
  }

  return bestLogo;
}

function scoreCatalogNameMatch(targetGame, candidateGame) {
  if (!candidateGame?.logo_url) return 0;
  if (targetGame.id === candidateGame.id) return 0;

  const targetText = normalizeGameSearchText(collectGameSearchText(targetGame));
  const candidateText = normalizeGameSearchText(collectGameSearchText(candidateGame));
  if (!targetText || !candidateText) return 0;

  if (targetText === candidateText) return 100;
  if (targetText.includes(candidateText) || candidateText.includes(targetText)) {
    return 60 + Math.min(candidateText.length, targetText.length);
  }

  const targetTokens = tokenizeSearchText(targetText);
  const candidateTokens = tokenizeSearchText(candidateText);
  if (targetTokens.length === 0 || candidateTokens.length === 0) return 0;

  let score = 0;
  for (const candidateToken of candidateTokens) {
    for (const targetToken of targetTokens) {
      if (targetToken === candidateToken) {
        score += candidateToken.length + 6;
      } else if (targetToken.includes(candidateToken) || candidateToken.includes(targetToken)) {
        score += Math.min(targetToken.length, candidateToken.length) + 2;
      }
    }
  }

  return score;
}

/** Search the full catalog for another title with a similar name that already has a logo. */
export function findCatalogLogoByName(game, games = []) {
  if (!game) return null;

  let bestLogo = null;
  let bestScore = 0;

  for (const candidate of games) {
    const score = scoreCatalogNameMatch(game, candidate);
    if (score > bestScore) {
      bestScore = score;
      bestLogo = candidate.logo_url;
    }
  }

  return bestScore >= 8 ? bestLogo : null;
}

function findOfferLogoByName(game, games = [], offers = []) {
  const childIds = getChildGameIds(games, game);
  const haystack = normalizeGameSearchText(collectGameSearchText(game));
  if (!haystack) return null;

  const gameOffers = offers.filter(
    (offer) => childIds.includes(offer.game_id) && offer.active !== false,
  );

  for (const offer of gameOffers) {
    const offerText = normalizeGameSearchText(
      [offer.name_en, offer.name_ar, offer.slug].filter(Boolean).join(' '),
    );
    if (!offerText) continue;

    const sharesName = offerText.includes(haystack)
      || haystack.includes(offerText)
      || tokenizeSearchText(offerText).some((token) => haystack.includes(token) && token.length > 3);

    if (!sharesName) continue;
    if (offer.image_url) return offer.image_url;
    if (offer.sale_image_url) return offer.sale_image_url;
  }

  return null;
}

/** Resolve the best carousel logo for a game using name search + catalog + offers. */
export function resolveCarouselLogo(game, games = [], offers = []) {
  if (!game) return null;
  if (game.logo_url) return game.logo_url;

  const supabaseLogo = resolveSupabaseGameLogo(game, games);
  if (supabaseLogo) return supabaseLogo;

  const brandLogo = matchBrandLogoByName(game);
  if (brandLogo) return brandLogo;

  const catalogLogo = findCatalogLogoByName(game, games);
  if (catalogLogo) return catalogLogo;

  const childIds = getChildGameIds(games, game);
  for (const childId of childIds) {
    const child = games.find((row) => row.id === childId);
    if (child?.logo_url) return child.logo_url;
    const childBrand = matchBrandLogoByName(child);
    if (childBrand) return childBrand;
  }

  const offerLogo = findOfferLogoByName(game, games, offers);
  if (offerLogo) return offerLogo;

  for (const offer of offers.filter((row) => childIds.includes(row.game_id) && row.active !== false)) {
    if (offer.image_url) return offer.image_url;
    if (offer.sale_image_url) return offer.sale_image_url;
  }

  return null;
}