import { useCallback, useState } from 'react';
import { sortGamesByCarousel } from '../lib/carouselUtils';
import { supabase } from '../lib/supabase';
import { fetchAllSupabaseRows } from '../lib/supabaseQuery';
import { stripOffersSecrets, withAdminWholesale } from '../lib/offerWholesale';
import { readCachedCatalog } from '../lib/storefrontCache';

export function useCatalogState({ isAdmin = false, defaultCatalogOnly = true }) {
  // Repeat visits start from the cached PUBLIC catalog and revalidate in the background,
  // so the home page paints immediately even on a slow mobile link.
  const [games, setGames] = useState(() => readCachedCatalog()?.games ?? []);
  const [offers, setOffers] = useState(() => readCachedCatalog()?.offers ?? []);
  const [loadingGames, setLoadingGames] = useState(() => !readCachedCatalog());

  const fetchGames = useCallback(async ({ background = false, catalogOnly = defaultCatalogOnly } = {}) => {
    if (!background) setLoadingGames(true);
    try {
      const data = await fetchAllSupabaseRows(
        () => {
          let pageQuery = supabase
            .from('games')
            .select('*')
            .eq('active', true);
          if (catalogOnly) {
            pageQuery = pageQuery.eq('catalog_source', 'g2bulk');
          }
          return pageQuery.order('created_at', { ascending: true });
        },
      );

      setGames(sortGamesByCarousel(data || []));
    } catch (err) {
      console.error('Failed to load games:', err);
      setGames([]);
    } finally {
      setLoadingGames(false);
    }
  }, [defaultCatalogOnly]);

  const fetchOffers = useCallback(async ({ catalogOnly = defaultCatalogOnly } = {}) => {
    try {
      const data = await fetchAllSupabaseRows(
        () => {
          let pageQuery = supabase
            .from('public_offers')
            .select('*')
            .eq('active', true);
          if (catalogOnly) {
            pageQuery = pageQuery.eq('catalog_source', 'g2bulk');
          }
          return pageQuery.order('created_at', { ascending: true });
        },
      );

      const cleaned = stripOffersSecrets(data || []);
      const withCost = await withAdminWholesale(cleaned, { isAdmin });
      setOffers(withCost);
    } catch (err) {
      console.error('Error fetching offers:', err);
      setOffers([]);
    }
  }, [defaultCatalogOnly, isAdmin]);

  return {
    games,
    setGames,
    offers,
    setOffers,
    loadingGames,
    setLoadingGames,
    fetchGames,
    fetchOffers,
  };
}
