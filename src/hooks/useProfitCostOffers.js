import { useEffect, useMemo, useState } from 'react';
import { fetchAdminOfferWholesale } from '../lib/offerWholesale';

/**
 * Profit metrics look up supplier cost by offer id in the storefront `offers`
 * list, which only holds active offers. Orders for packs the sync later
 * deactivated (out of stock / deselected) then show as "revenue without
 * supplier cost". Fetch the stored cost for those ids and append cost-only
 * offer rows so past orders keep their real margin.
 */
export function useProfitCostOffers(orders = [], offers = []) {
  const [extraCosts, setExtraCosts] = useState({});

  const missingIdsKey = useMemo(() => {
    const known = new Set((offers || []).map((o) => o?.id).filter(Boolean));
    const missing = new Set();
    for (const order of orders || []) {
      for (const item of order?.order_items || []) {
        const id = item?.offer_id;
        if (id && !known.has(id)) missing.add(id);
      }
    }
    return [...missing].sort().join(',');
  }, [orders, offers]);

  useEffect(() => {
    if (!missingIdsKey) return undefined;
    let cancelled = false;
    fetchAdminOfferWholesale(missingIdsKey.split(',')).then((map) => {
      if (!cancelled) setExtraCosts(map || {});
    });
    return () => {
      cancelled = true;
    };
  }, [missingIdsKey]);

  return useMemo(() => {
    const ids = Object.keys(extraCosts);
    if (!ids.length) return offers;
    const itemByOffer = {};
    for (const order of orders || []) {
      for (const item of order?.order_items || []) {
        if (item?.offer_id) itemByOffer[item.offer_id] = item;
      }
    }
    const extra = ids.map((id) => ({
      id,
      game_id: itemByOffer[id]?.offers?.game_id || null,
      name_en: itemByOffer[id]?.offers?.name_en || itemByOffer[id]?.name_snapshot || null,
      name_ar: itemByOffer[id]?.offers?.name_ar || itemByOffer[id]?.name_snapshot || null,
      g2bulk_cost_usd: extraCosts[id]?.g2bulk_cost_usd ?? null,
      pricing_mode: extraCosts[id]?.pricing_mode ?? null,
      pricing_margin_percent: extraCosts[id]?.pricing_margin_percent ?? null,
      active: false,
    }));
    return [...(offers || []), ...extra];
  }, [offers, orders, extraCosts]);
}
