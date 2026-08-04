import { Wrench } from 'lucide-react';
import { getMaintenanceMessage } from '../lib/siteStatus';
import EmptyState from '../components/ui/EmptyState';

export default function MaintenanceView({
  t = {},
  lang = 'ar',
  siteStatus,
  onContactSupport,
}) {
  const customMessage = getMaintenanceMessage(siteStatus, lang);

  return (
    <div className="max-w-lg mx-auto px-2 sm:px-0 animate-fade-in">
      <EmptyState
        icon={Wrench}
        iconClass="text-amber-400"
        className="sm:p-10"
        title={t.maintenancePageTitle}
        description={customMessage || t.maintenancePageDesc}
        action={
          <button
            type="button"
            onClick={onContactSupport}
            className="btn btn-secondary w-full mt-6"
          >
            {t.maintenanceContactSupport}
          </button>
        }
      />
    </div>
  );
}
