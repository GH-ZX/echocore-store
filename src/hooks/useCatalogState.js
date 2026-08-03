import { useCallback, useState } from 'react';
import { sortGamesByCarousel } from '../lib/carouselUtils';
import { supabase } from '../lib/supabase';
import { fetchAllSupabaseRows } from '../lib/supabaseQuery';
import { stripOffersSecrets, withAdminWholesale } from '../lib/offerWholesale';

export function useCatalogState({ isAdmin = false, defaultCatalogOnly = true }) {
  const [games, setGames] = useState([]);
  const [offers, setOffers] = useState([]);
  const [loadingGames, setLoadingGames] = useState(true);

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
            .from('offers')
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
