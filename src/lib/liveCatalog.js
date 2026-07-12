import { supabase } from './supabase';
import { normalizePullSelection } from './pullCatalogUtils';

async function invokeG2bulk(body) {
  const { data, error } = await supabase.functions.invoke('g2bulk', { body });
  if (error) throw new Error(error.message || 'Catalog request failed');
  if (data?.success === false) throw new Error(data.message || 'Catalog request failed');
  return data;
}

export const LIVE_ID_PREFIX = 'live:';

export function isLiveCatalogId(id) {
  return typeof id === 'string' && id.startsWith(LIVE_ID_PREFIX);
}

export function parseLiveCatalogId(id) {
  if (!isLiveCatalogId(id)) return null;
  const parts = String(id).split(':');
  if (parts.length < 3) return null;
  const kind = parts[1];
  if (kind === 'parent') return { kind: 'parent', baseKey: parts.slice(2).join(':') };
  if (kind === 'variant') return { kind: 'variant', gameCode: parts.slice(2).join(':') };
  if (kind === 'topup') return { kind: 'topup', gameCode: parts[2], catalogueName: parts.slice(3).join(':') };
  if (kind === 'voucher') {
    const ref = parts[2];
    const numeric = Number(ref);
    return { kind: 'voucher', ref, numeric: Number.isFinite(numeric) ? numeric : null };
  }
  return { kind, ref: parts.slice(2).join(':') };
}

export function buildLiveParentId(baseKey) {
  return `live:parent:${baseKey}`;
}

export function buildLiveVariantId(gameCode) {
  return `live:variant:${gameCode}`;
}

export function buildLiveTopupOfferId(gameCode, catalogueName) {
  return `live:topup:${gameCode}:${catalogueName}`;
}

export function buildLiveVoucherGameId(categoryId) {
  return `live:voucher:${categoryId}`;
}

export function buildLiveVoucherOfferId(productId) {
  return `live:voucher:${productId}`;
}

export async function fetchLiveGameList() {
  const data = await invokeG2bulk({ action: 'browseCatalog', subAction: 'listGames' });
  return data.games || [];
}

export async function fetchLiveGameGroup(baseKey) {
  if (!baseKey) return { parent: null, games: [], offers: [] };
  const data = await invokeG2bulk({
    action: 'browseCatalog',
    subAction: 'gameGroup',
    baseKey,
  });
  return {
    parent: data.parent || null,
    games: data.games || [],
    offers: data.offers || [],
  };
}

export async function fetchLiveVouchers(segment = '') {
  const data = await invokeG2bulk({
    action: 'browseCatalog',
    subAction: 'vouchers',
    segment: segment || undefined,
  });
  return {
    games: data.games || [],
    offers: data.offers || [],
  };
}

export async function fetchLiveGiftCards() {
  return fetchLiveVouchers('gift_card');
}

export async function fetchLiveGamingAccounts() {
  return fetchLiveVouchers('gaming_account');
}

export async function fetchLiveFullCatalog() {
  const [topupGames, giftCards, gamingAccounts] = await Promise.all([
    fetchLiveGameList(),
    fetchLiveGiftCards(),
    fetchLiveGamingAccounts(),
  ]);

  return {
    games: mergeCatalogRows(topupGames, [...giftCards.games, ...gamingAccounts.games]),
    offers: mergeCatalogRows(giftCards.offers, gamingAccounts.offers),
  };
}

/** Fetch only the live catalog slices referenced by the current pull selection. */
export async function fetchLiveCatalogForSelection(pull = {}) {
  const normalized = normalizePullSelection(pull);
  const needTopups = normalized.topupLiveBaseKeys.length > 0;
  const needVouchers = normalized.accountLiveCategoryIds.length > 0
    || normalized.giftLiveCategoryIds.length > 0;

  const [topupGames, voucherData] = await Promise.all([
    needTopups ? fetchLiveGameList() : Promise.resolve([]),
    needVouchers ? fetchLiveVouchers('') : Promise.resolve({ games: [], offers: [] }),
  ]);

  return {
    games: mergeCatalogRows(topupGames, voucherData.games || []),
    offers: voucherData.offers || [],
  };
}

export async function ensureCatalogItems(items = []) {
  const liveItems = items.filter((item) => isLiveCatalogId(item.id));
  if (liveItems.length === 0) return new Map();

  const data = await invokeG2bulk({
    action: 'ensureCatalogItems',
    items: liveItems,
  });

  const map = new Map();
  (data.resolved || []).forEach((row) => {
    if (row.liveId && row.offerId) map.set(row.liveId, row.offerId);
  });
  return map;
}

export function mergeCatalogRows(existing = [], incoming = []) {
  const map = new Map(existing.map((row) => [row.id, row]));
  incoming.forEach((row) => {
    if (row?.id) map.set(row.id, row);
  });
  return [...map.values()];
}