import { supabase } from './supabase';
import { ensureCatalogItems, isLiveCatalogId, mergeCatalogRows } from './liveCatalog';
import { stripOfferSecrets } from './offerWholesale';

/**
 * Resolve live-catalog offer IDs to persisted DB rows before checkout.
 * Returns the same list with live IDs replaced when possible.
 */
export async function resolveOffersForCheckout(items = [], { onOffersMerged } = {}) {
  const list = Array.isArray(items) ? items : [items];
  const liveItems = list.filter((item) => isLiveCatalogId(item?.id));
  if (liveItems.length === 0) return list;

  const idMap = await ensureCatalogItems(liveItems);
  const resolved = await Promise.all(list.map(async (item) => {
    const dbId = idMap.get(item.id);
    if (!dbId) return item;
    const { data } = await supabase.from('offers').select('*').eq('id', dbId).maybeSingle();
    return data ? stripOfferSecrets(data) : { ...item, id: dbId };
  }));

  if (typeof onOffersMerged === 'function') {
    onOffersMerged((prev) => mergeCatalogRows(prev, resolved));
  }

  return resolved;
}