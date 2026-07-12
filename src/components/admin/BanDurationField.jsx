export default function BanDurationField({ t, duration, onDurationChange, banDays, onBanDaysChange }) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-[var(--text-sec)]">{t.adminBanDurationLabel}</label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onDurationChange('permanent')}
          className={`inbox-filter-chip ${duration === 'permanent' ? 'inbox-filter-chip--active' : ''}`}
        >
          {t.adminBanPermanent}
        </button>
        <button
          type="button"
          onClick={() => onDurationChange('temporary')}
          className={`inbox-filter-chip ${duration === 'temporary' ? 'inbox-filter-chip--active' : ''}`}
        >
          {t.adminBanTemporary}
        </button>
      </div>
      {duration === 'temporary' && (
        <input
          type="number"
          min={1}
          max={365}
          value={banDays}
          onChange={(event) => onBanDaysChange(event.target.value)}
          className="input w-full"
          placeholder={t.adminBanDaysPlaceholder}
        />
      )}
    </div>
  );
}