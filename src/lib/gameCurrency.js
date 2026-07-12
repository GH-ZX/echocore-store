import { parseG2BulkGameMeta } from './regionMeta';

export const GENERIC_CURRENCY_LABELS = new Set(['', 'top-up', 'top up', 'points', 'voucher']);

/** G2Bulk base keys / codes → in-game currency label */
const BASE_KEY_CURRENCY = {
  valorant: 'VP',
  pubg_mobile: 'UC',
  pubgm: 'UC',
  pubg: 'UC',
  mobile_legends: 'Diamonds',
  mlbb: 'Diamonds',
  mobilelegends: 'Diamonds',
  genshin_impact: 'Genesis Crystals',
  genshin: 'Genesis Crystals',
  honkai_star_rail: 'Oneiric Shard',
  honkai_star: 'Oneiric Shard',
  honkai: 'Oneiric Shard',
  zenless_zone_zero: 'Monochrome',
  zenless: 'Monochrome',
  zzz: 'Monochrome',
  free_fire: 'Diamonds',
  freefire: 'Diamonds',
  clash_of_clans: 'Gems',
  clash_royale: 'Gems',
  league_of_legends: 'RP',
  lol: 'RP',
  wild_rift: 'Wild Cores',
  arena_of_valor: 'Vouchers',
  aov: 'Vouchers',
  call_of_duty_mobile: 'CP',
  codm: 'CP',
  blood_strike: 'Gold',
  honor_of_kings: 'Tokens',
  roblox: 'Robux',
  apex_legends: 'Coins',
  delta_force: 'Delta Coins',
  azur_lane: 'Gems',
  nikke: 'Gems',
  tower_of_fantasy: 'Tanium',
  identity_v: 'Echoes',
  dragonheir: 'Dragon Crystals',
  state_of_survival: 'Diamonds',
  rise_of_kingdoms: 'Gems',
  lords_mobile: 'Gems',
  brawl_stars: 'Gems',
  hay_day: 'Gems',
  efootball: 'Coins',
  pubgm: 'UC',
  deltaforce: 'Delta Coins',
  bloodstrike: 'Gold',
  bloodstrikeme: 'Gold',
  honkai_impact: 'Crystals',
  hsr: 'Oneiric Shard',
  gi: 'Genesis Crystals',
  wuwa: 'Lunite',
  codm_sgmy: 'CP',
  codm: 'CP',
  aove: 'Vouchers',
  afkjourney: 'Dragon Crystals',
  eafcmobile: 'FC Points',
  fc_mobile: 'FC Points',
  fifa: 'FC Points',
  steam: 'Wallet Code',
  nte: 'Riftcrystal',
  neverness_to_everness: 'Riftcrystal',
};

const NAME_KEYWORDS = [
  ['pubg', 'UC'],
  ['valorant', 'VP'],
  ['genshin', 'Genesis Crystals'],
  ['mobile legends', 'Diamonds'],
  ['mlbb', 'Diamonds'],
  ['honkai', 'Oneiric Shard'],
  ['zenless', 'Monochrome'],
  ['free fire', 'Diamonds'],
  ['clash of clans', 'Gems'],
  ['clash royale', 'Gems'],
  ['league of legends', 'RP'],
  ['wild rift', 'Wild Cores'],
  ['call of duty', 'CP'],
  ['roblox', 'Robux'],
  ['nikke', 'Gems'],
  ['azur lane', 'Gems'],
  ['tower of fantasy', 'Tanium'],
  ['identity v', 'Echoes'],
  ['blood strike', 'Gold'],
  ['honor of kings', 'Tokens'],
  ['neverness to everness', 'Riftcrystal'],
  ['neverness', 'Riftcrystal'],
];

export function isGenericCurrencyLabel(value = '') {
  return GENERIC_CURRENCY_LABELS.has(String(value || '').trim().toLowerCase());
}

export function isNumericOnlyPackName(name = '') {
  return /^[\d,]+(?:\.\d+)?$/.test(String(name).trim());
}

export function extractCurrencySuffixFromName(name = '') {
  const trimmed = String(name).trim();
  const match = trimmed.match(/^[\d,]+(?:\.\d+)?\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

export function formatPackNameWithCurrency(packName, currency) {
  const raw = String(packName || '').trim();
  if (!raw) return raw;
  if (extractCurrencySuffixFromName(raw)) return raw;
  const label = String(currency || '').trim();
  if (!label || isGenericCurrencyLabel(label)) return raw;
  if (isNumericOnlyPackName(raw)) return `${raw} ${label}`;
  return raw;
}

function normalizeKey(value = '') {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function compactKey(value = '') {
  return normalizeKey(value).replace(/_/g, '');
}

function keysMatchCurrency(key = '', baseKey = '') {
  if (!key || !baseKey) return false;
  if (key === baseKey || key.includes(baseKey) || baseKey.includes(key)) return true;
  const keyCompact = compactKey(key);
  const baseCompact = compactKey(baseKey);
  return keyCompact === baseCompact
    || keyCompact.includes(baseCompact)
    || baseCompact.includes(keyCompact);
}

function lookupCurrencyFromKeys(...keys) {
  for (const raw of keys) {
    const key = normalizeKey(raw);
    if (!key) continue;
    if (BASE_KEY_CURRENCY[key]) return BASE_KEY_CURRENCY[key];
    for (const [baseKey, currency] of Object.entries(BASE_KEY_CURRENCY)) {
      if (keysMatchCurrency(key, baseKey)) return currency;
    }
  }
  return '';
}

function lookupCurrencyFromName(name = '') {
  const lower = String(name).toLowerCase();
  for (const [keyword, currency] of NAME_KEYWORDS) {
    if (lower.includes(keyword)) return currency;
  }
  return '';
}

export function collectCurrencyCandidateGames(game, games = []) {
  if (!game) return [];
  const seen = new Set();
  const out = [];
  const add = (row) => {
    if (!row?.id || seen.has(row.id)) return;
    seen.add(row.id);
    out.push(row);
  };

  add(game);

  if (game.parent_game_id) {
    add(games.find((row) => row.id === game.parent_game_id));
  }

  games.filter((row) => row.parent_game_id === game.id).forEach(add);

  const meta = parseG2BulkGameMeta(
    game.g2bulk_game_code || game.slug || '',
    game.name_en || game.name_ar || '',
  );
  const baseKey = normalizeKey(game.group_base_key || meta.baseKey);

  if (baseKey) {
    games.forEach((row) => {
      const rowMeta = parseG2BulkGameMeta(
        row.g2bulk_game_code || row.slug || '',
        row.name_en || row.name_ar || '',
      );
      const rowBase = normalizeKey(row.group_base_key || rowMeta.baseKey);
      if (rowBase && (rowBase === baseKey || rowBase.includes(baseKey) || baseKey.includes(rowBase))) {
        add(row);
      }
    });
  }

  return out;
}

export function getScopedOffersForGame(game, games = [], relatedOffers = []) {
  if (!relatedOffers.length || !game) return relatedOffers;
  const ids = new Set(collectCurrencyCandidateGames(game, games).map((row) => row.id));
  const scoped = relatedOffers.filter((offer) => ids.has(offer.game_id));
  return scoped.length > 0 ? scoped : relatedOffers;
}

function lookupCurrencyFromOffers(offers = []) {
  for (const offer of offers) {
    const fromCode = lookupCurrencyFromKeys(offer?.g2bulk_game_code);
    if (fromCode) return fromCode;

    for (const name of [offer.g2bulk_catalogue_name, offer.name_en, offer.name_ar].filter(Boolean)) {
      const suffix = extractCurrencySuffixFromName(name);
      if (suffix && !isGenericCurrencyLabel(suffix)) return suffix;
    }
  }
  return '';
}

export function lookupGameCurrencyLabel(game, games = [], relatedOffers = [], offer = null) {
  const fromOfferCode = lookupCurrencyFromKeys(offer?.g2bulk_game_code);
  if (fromOfferCode) return fromOfferCode;

  const candidates = collectCurrencyCandidateGames(game, games);

  for (const row of candidates) {
    const points = String(row.points_name || '').trim();
    if (points && !isGenericCurrencyLabel(points)) return points;
  }

  const scopedOffers = getScopedOffersForGame(game, games, relatedOffers);
  const fromOffers = lookupCurrencyFromOffers(offer ? [offer, ...scopedOffers] : scopedOffers);
  if (fromOffers) return fromOffers;

  for (const row of candidates) {
    const meta = parseG2BulkGameMeta(
      row.g2bulk_game_code || row.slug || '',
      row.name_en || row.name_ar || '',
    );
    const fromKeys = lookupCurrencyFromKeys(
      row.g2bulk_game_code,
      row.slug,
      row.group_base_key,
      meta.baseKey,
    );
    if (fromKeys) return fromKeys;

    const fromName = lookupCurrencyFromName(`${row.name_en || ''} ${row.name_ar || ''} ${meta.baseName || ''}`);
    if (fromName) return fromName;
  }

  return '';
}