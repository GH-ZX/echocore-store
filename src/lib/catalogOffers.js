import { supabase } from './supabase';
import { fetchLiveGameGroup, isLiveCatalogId } from './liveCatalog';
import { getGameBaseMeta } from './gameRegions';

function usesLiveCatalogForGame({ catalogMode = 'sync', storefrontGame, variant } = {}) {
  return catalogMode === 'live'
    || (catalogMode === 'hybrid' && (
      storefrontGame?.catalog_source === 'live'
      || isLiveCatalogId(storefrontGame?.id)
      || isLiveCatalogId(variant?.id)
    ));
}

/** Refresh offer prices for a regional variant (live API or Supabase). */
export async function refreshGameRegionOffers({
  variant,
  storefrontGame,
  catalogMode = 'sync',
} = {}) {
  if (!variant?.id || !storefrontGame) return null;

  if (usesLiveCatalogForGame({ catalogMode, storefrontGame, variant })) {
    const baseKey = storefrontGame.group_base_key || getGameBaseMeta(storefrontGame).baseKey;
    if (!baseKey) return null;
    return fetchLiveGameGroup(baseKey);
  }

  if (isLiveCatalogId(variant.id)) return null;

  const { data, error } = await supabase
    .from('offers')
    .select('*')
    .eq('game_id', variant.id)
    .eq('active', true);

  if (error) throw new Error(error.message);
  return { offers: data || [] };
}