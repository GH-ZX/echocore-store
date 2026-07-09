import { supabase } from './supabase';

async function invokeG2bulk(body) {
  const { data, error } = await supabase.functions.invoke('g2bulk', { body });
  if (error) throw new Error(error.message || 'Catalog request failed');
  if (data?.success === false) throw new Error(data.message || 'Catalog request failed');
  return data;
}

export function isLiveCatalogId(id) {
  return typeof id === 'string' && id.startsWith('live:');
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