import { gameDescriptions } from '../data/gameDescriptions';
import { brandUserText } from './branding';
import { collectCurrencyCandidateGames, lookupGameCurrencyLabel } from './gameCurrency';
import { parseG2BulkGameMeta } from './regionMeta';
import { formatMessage } from './i18n';
import { getGameDisplayName } from './offerDisplay';

const GENERIC_SYNC_PREFIX = /^instant\s+.+\s+top-up/i;

function normalizeKey(value = '') {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function compactKey(value = '') {
  return normalizeKey(value).replace(/_/g, '');
}

function keysMatch(key = '', candidate = '') {
  if (!key || !candidate) return false;
  if (key === candidate || key.includes(candidate) || candidate.includes(key)) return true;
  const keyCompact = compactKey(key);
  const candidateCompact = compactKey(candidate);
  return keyCompact === candidateCompact
    || keyCompact.includes(candidateCompact)
    || candidateCompact.includes(keyCompact);
}

function lookupDescriptionCopy(...keys) {
  for (const raw of keys) {
    const key = normalizeKey(raw);
    if (!key) continue;
    if (gameDescriptions[key]) return gameDescriptions[key];
    for (const [mapKey, copy] of Object.entries(gameDescriptions)) {
      if (keysMatch(key, mapKey)) return copy;
    }
  }
  return null;
}

function resolveDescriptionKeys(game, games = []) {
  const candidates = collectCurrencyCandidateGames(game, games);
  const keys = [];

  for (const row of candidates) {
    const meta = parseG2BulkGameMeta(
      row.g2bulk_game_code || row.slug || '',
      row.name_en || row.name_ar || '',
    );
    keys.push(
      row.group_base_key,
      meta.baseKey,
      row.g2bulk_game_code,
      row.slug,
    );
  }

  return keys.filter(Boolean);
}

function isGenericSyncedDescription(value = '') {
  const text = String(value || '').trim();
  if (!text) return true;
  if (GENERIC_SYNC_PREFIX.test(text)) return true;
  if (/^instant\s+.+\s+via\s+echocore\.?$/i.test(text)) return true;
  return false;
}

function readDbDescription(game, lang = 'ar') {
  const raw = lang === 'ar'
    ? (game?.description_ar || game?.description_en)
    : (game?.description_en || game?.description_ar);
  const text = String(raw || '').trim();
  if (!text || isGenericSyncedDescription(text)) return '';
  return text;
}

export function getGameMarketingDescription(game, lang = 'ar', games = [], offers = [], t = null) {
  if (!game) return '';

  const mapped = lookupDescriptionCopy(...resolveDescriptionKeys(game, games));
  if (mapped) {
    const text = lang === 'ar' ? (mapped.ar || mapped.en) : mapped.en;
    return brandUserText(text || '');
  }

  const fromDb = readDbDescription(game, lang);
  if (fromDb) return brandUserText(fromDb);

  if (t?.gameDescriptionFallback) {
    const currency = lookupGameCurrencyLabel(game, games, offers);
    return brandUserText(formatMessage(t.gameDescriptionFallback, {
      game: getGameDisplayName(game, lang),
      currency: currency || (lang === 'ar' ? 'الشحن' : 'top-up'),
    }));
  }

  return '';
}