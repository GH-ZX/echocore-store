import { Wrench } from 'lucide-react';
import { getMaintenanceMessage } from '../lib/siteStatus';

export default function MaintenanceView({
  t = {},
  lang = 'ar',
  siteStatus,
  onContactSupport,
}) {
  const customMessage = getMaintenanceMessage(siteStatus, lang);

  return (
    <div className="max-w-lg mx-auto px-2 sm:px-0 animate-fade-in">
      <div className="card p-8 sm:p-10 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/15 flex items-center justify-center text-amber-400 mx-auto mb-5">
          <Wrench className="w-8 h-8" strokeWidth={2} />
        </div>
        <h1 className="text-2xl font-black mb-2">{t.maintenancePageTitle}</h1>
        <p className="text-sm text-[var(--text-sec)] leading-relaxed">
          {customMessage || t.maintenancePageDesc}
        </p>
        <button
          type="button"
          onClick={onContactSupport}
          className="btn btn-secondary w-full mt-6"
        >
          {t.maintenanceContactSupport}
        </button>
      </div>
    </div>
  );
}