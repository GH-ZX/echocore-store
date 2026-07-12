import { parseG2BulkGameMeta } from './regionMeta.ts';

const GENERIC_CURRENCY_LABELS = new Set(['', 'top-up', 'top up', 'points', 'voucher']);

const BASE_KEY_CURRENCY: Record<string, string> = {
  valorant: 'VP',
  pubg_mobile: 'UC',
  pubgm: 'UC',
  pubg: 'UC',
  mobile_legends: 'Diamonds',
  mlbb: 'Diamonds',
  mobilelegends: 'Diamonds',
  genshin_impact: 'Genesis Crystals',
  genshin: 'Genesis Crystals',
  gi: 'Genesis Crystals',
  honkai_star_rail: 'Oneiric Shard',
  honkai_star: 'Oneiric Shard',
  honkai: 'Oneiric Shard',
  hsr: 'Oneiric Shard',
  honkai_impact: 'Crystals',
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
  aove: 'Vouchers',
  call_of_duty_mobile: 'CP',
  codm: 'CP',
  codm_sgmy: 'CP',
  blood_strike: 'Gold',
  bloodstrike: 'Gold',
  bloodstrikeme: 'Gold',
  honor_of_kings: 'Tokens',
  roblox: 'Robux',
  apex_legends: 'Coins',
  delta_force: 'Delta Coins',
  deltaforce: 'Delta Coins',
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
  fc_mobile: 'FC Points',
  fifa: 'FC Points',
  eafcmobile: 'FC Points',
  steam: 'Wallet Code',
  wuwa: 'Lunite',
  afkjourney: 'Dragon Crystals',
  nte: 'Riftcrystal',
  neverness_to_everness: 'Riftcrystal',
};

const NAME_KEYWORDS: Array<[string, string]> = [
  ['pubg', 'UC'],
  ['valorant', 'VP'],
  ['genshin', 'Genesis Crystals'],
  ['mobile legends', 'Diamonds'],
  ['mlbb', 'Diamonds'],
  ['honkai', 'Oneiric Shard'],
  ['zenless', 'Monochrome'],
  ['free fire', 'Diamonds'],
  ['freefire', 'Diamonds'],
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
  ['bloodstrike', 'Gold'],
  ['honor of kings', 'Tokens'],
  ['delta force', 'Delta Coins'],
  ['deltaforce', 'Delta Coins'],
  ['neverness to everness', 'Riftcrystal'],
  ['neverness', 'Riftcrystal'],
];

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

export function lookupCurrencyFromKeys(...keys: string[]) {
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

export function lookupGameCurrencyLabel(
  code = '',
  name = '',
  baseKey = '',
) {
  const meta = parseG2BulkGameMeta(code, name);
  const fromKeys = lookupCurrencyFromKeys(code, baseKey || meta.baseKey);
  if (fromKeys) return fromKeys;
  return lookupCurrencyFromName(`${name} ${meta.baseName || ''}`);
}

export function formatPackNameWithCurrency(packName: string, currency: string) {
  const raw = String(packName || '').trim();
  if (!raw) return raw;
  const suffix = extractCurrencySuffixFromName(raw);
  if (suffix && !isGenericCurrencyLabel(suffix)) return raw;
  const label = String(currency || '').trim();
  if (!label || isGenericCurrencyLabel(label)) return raw;
  if (isNumericOnlyPackName(raw)) return `${raw} ${label}`;
  return raw;
}

export function formatCatalogueOfferName(
  catalogueName: string,
  code = '',
  gameName = '',
  baseKey = '',
) {
  const raw = String(catalogueName || '').trim();
  if (!raw) return raw;
  const suffix = extractCurrencySuffixFromName(raw);
  if (suffix && !isGenericCurrencyLabel(suffix)) return raw;
  const currency = lookupGameCurrencyLabel(code, gameName, baseKey);
  return formatPackNameWithCurrency(raw, currency);
}

export function resolvePointsName(
  catalogues: Array<Record<string, unknown>> = [],
  code = '',
  gameName = '',
  baseKey = '',
) {
  const counts = new Map<string, number>();
  for (const item of catalogues) {
    const name = String(item.name || '').trim();
    const match = name.match(/^[\d,]+(?:\.\d+)?\s+(.+)$/i);
    const suffix = match?.[1]?.trim();
    if (!suffix || isGenericCurrencyLabel(suffix)) continue;
    counts.set(suffix, (counts.get(suffix) || 0) + 1);
  }

  let best = '';
  let bestCount = 0;
  counts.forEach((count, suffix) => {
    if (count > bestCount) {
      best = suffix;
      bestCount = count;
    }
  });
  if (best) return best;

  const fromMap = lookupGameCurrencyLabel(code, gameName, baseKey);
  return fromMap || '';
}