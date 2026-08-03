import { useEffect } from 'react';
import { fetchPaymentMethods } from '../lib/storeSettings';
import { fetchSiteStatus } from '../lib/siteStatus';

export function useStorefrontBootstrap({
  setPaymentConfig,
  setSiteStatus,
  setLoadingGames,
  loadLiveCatalog,
  loadSyncedCatalog,
  refreshSiteTheme,
  refreshHomeLayout,
  refreshReviews,
}) {
  useEffect(() => {
    (async () => {
      const config = await fetchPaymentMethods();
      setPaymentConfig(config);
      await Promise.allSettled([
        config.g2bulkCatalogMode === 'live'
          ? loadLiveCatalog(config.g2bulkPullSelection)
          : (async () => {
              setLoadingGames(true);
              try {
                await loadSyncedCatalog(config.g2bulkCatalogOnly, config.g2bulkPullSelection);
              } finally {
                setLoadingGames(false);
              }
            })(),
        refreshSiteTheme(),
        refreshHomeLayout(),
        refreshReviews(),
        fetchSiteStatus().then(setSiteStatus).catch(() => {}),
      ]);
    })();
    // Mount-only by design; catalog reloads after this go through refreshCatalog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
