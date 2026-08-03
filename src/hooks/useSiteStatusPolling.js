import { useEffect } from 'react';
import { fetchSiteStatus } from '../lib/siteStatus';

export function useSiteStatusPolling({ setSiteStatus, setMaintenanceBannerDismissed }) {
  useEffect(() => {
    const refreshStatus = () => {
      fetchSiteStatus()
        .then((status) => {
          setSiteStatus(status);
          if (!status?.maintenanceEnabled) {
            setMaintenanceBannerDismissed(false);
          }
        })
        .catch(() => {});
    };
    const intervalId = setInterval(refreshStatus, 60000);
    return () => clearInterval(intervalId);
  }, [setSiteStatus, setMaintenanceBannerDismissed]);
}
