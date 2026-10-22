import { useEffect } from 'react';
import { fetchPaymentMethods } from '../lib/storeSettings';
import { fetchSiteStatus } from '../lib/siteStatus';
import {
  catalogConfigKey,
  readCachedCatalog,
  readStorefrontCache,
  writeStorefrontCache,
} from '../lib/storefrontCache';

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
      // With a cached catalog the page is already painted: revalidate quietly (no spinner).
      const hydrated = !!readCachedCatalog();

      const runCatalog = async (config) => {
        if (config.g2bulkCatalogMode === 'live') {
          await loadLiveCatalog(config.g2bulkPullSelection);
          return;
        }
        if (!hydrated) setLoadingGames(true);
        try {
          await loadSyncedCatalog(config.g2bulkCatalogOnly, config.g2bulkPullSelection);
        } finally {
          setLoadingGames(false);
        }
      };

      // These do not depend on the payment config: start them all at once instead of
      // waiting a round trip for it (each round trip is expensive on slow mobile links).
      const independent = [
        refreshSiteTheme(),
        refreshHomeLayout(),
        refreshReviews(),
        fetchSiteStatus().then(setSiteStatus).catch(() => {}),
      ];

      // Start the catalog immediately using last visit's config; re-run only if it changed.
      const cachedConfig = readStorefrontCache('paymentConfig');
      const startedKey = cachedConfig ? catalogConfigKey(cachedConfig) : null;
      let catalog = cachedConfig ? runCatalog(cachedConfig) : null;

      const config = await fetchPaymentMethods();
      setPaymentConfig(config);
      // Never cache the error fallback (it carries no catalog mode) — only a real server response.
      if (config?.g2bulkCatalogMode) writeStorefrontCache('paymentConfig', config);

      if (!catalog || catalogConfigKey(config) !== startedKey) {
        // First visit, or the admin changed catalog mode/filters since last time.
        await Promise.allSettled([catalog]);
        catalog = runCatalog(config);
      }

      await Promise.allSettled([catalog, ...independent]);
    })();
    // Mount-only by design; catalog reloads after this go through refreshCatalog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
