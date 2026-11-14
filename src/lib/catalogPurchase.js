import { supabase } from './supabase';
import { ensureCatalogItems, isLiveCatalogId, mergeCatalogRows } from './liveCatalog';
import { stripOfferSecrets } from './offerWholesale';

/**
 * Resolve live-catalog offer IDs to persisted DB rows before checkout.
 * Returns the same list with live IDs replaced when possible.
 *
 * Creating rows from the live catalogue (ensureCatalogItems) is admin-only since 2026-11-14,
 * so a customer can only buy packs that are already synced. A live-only pack that can't be
 * resolved stops the checkout with `unavailableMessage` instead of failing later with a
 * database error.
 */
export async function resolveOffersForCheckout(items = [], { onOffersMerged, unavailableMessage } = {}) {
  const list = Array.isArray(items) ? items : [items];
  const liveItems = list.filter((item) => isLiveCatalogId(item?.id));
  if (liveItems.length === 0) return list;

  let idMap;
  try {
    idMap = await ensureCatalogItems(liveItems);
  } catch {
    idMap = new Map();
  }
  if (liveItems.some((item) => !idMap.get(item.id))) {
    throw new Error(unavailableMessage || 'This pack is not available right now');
  }

  const resolved = await Promise.all(list.map(async (item) => {
    const dbId = idMap.get(item.id);
    if (!dbId) return item;
    const { data } = await supabase.from('public_offers').select('*').eq('id', dbId).maybeSingle();
    return data ? stripOfferSecrets(data) : { ...item, id: dbId };
  }));

  if (typeof onOffersMerged === 'function') {
    onOffersMerged((prev) => mergeCatalogRows(prev, resolved));
  }

  return resolved;
}
