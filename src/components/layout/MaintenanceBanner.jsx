import { Wrench, X } from 'lucide-react';
import { getMaintenanceMessage } from '../../lib/siteStatus';

export default function MaintenanceBanner({
  t = {},
  lang = 'ar',
  siteStatus,
  user,
  dismissed = false,
  onDismiss,
}) {
  if (!siteStatus?.maintenanceEnabled || dismissed) return null;

  const message = getMaintenanceMessage(siteStatus, lang) || t.maintenanceBannerDefault;
  const adminNote = user?.role === 'admin' && siteStatus?.maintenanceEnabled
    ? t.maintenanceBannerAdminNote
    : '';

  return (
    <div
      className="maintenance-banner"
      role="status"
      aria-live="polite"
    >
      <div className="maintenance-banner-inner">
        <Wrench className="w-4 h-4 flex-shrink-0 text-amber-300" strokeWidth={2.5} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-amber-50">{t.maintenanceBannerTitle}</div>
          <div className="text-xs text-amber-100/90 mt-0.5 leading-relaxed">{message}</div>
          {adminNote && (
            <div className="text-[11px] text-amber-200/80 mt-1">{adminNote}</div>
          )}
          {!user && (
            <div className="text-[11px] text-amber-200/80 mt-1">{t.maintenanceLoginDisabled}</div>
          )}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="maintenance-banner-dismiss"
            aria-label={t.dismiss}
          >
            <X className="w-4 h-4" strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
}