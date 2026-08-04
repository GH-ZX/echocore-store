import { supabase } from './supabase';
import { isMissingRpc } from './supabaseErrors';

/** Top offer ids by completed purchase quantity (public). */
export async function fetchBestsellingOfferRanks(limit = 10) {
  const { data, error } = await supabase.rpc('get_bestselling_offer_ids', {
    p_limit: Math.max(1, Math.min(50, Number(limit) || 10)),
  });
  if (error) {
    if (isMissingRpc(error)) {
      console.warn('get_bestselling_offer_ids missing — run scripts/bestselling-offers-migration.sql');
      return [];
    }
    console.warn('get_bestselling_offer_ids', error.message);
    return [];
  }
  return Array.isArray(data) ? data : [];
}
