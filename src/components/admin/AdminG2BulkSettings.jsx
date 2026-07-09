import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Zap, Loader2, CheckCircle, AlertCircle, Save, RefreshCw, Download, X,
  Clock, Key, Store, Truck, CalendarClock,
} from 'lucide-react';
import G2bulkWalletCard from '../ui/G2bulkWalletCard';
import {
  fetchG2bulkSettings,
  saveG2bulkSettings,
  g2bulkGetMe,
  syncG2bulkCatalog,
} from '../../lib/g2bulk';

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Damascus', label: 'Syria (Asia/Damascus)' },
  { value: 'Asia/Riyadh', label: 'Saudi Arabia (Asia/Riyadh)' },
  { value: 'Asia/Dubai', label: 'UAE (Asia/Dubai)' },
  { value: 'Asia/Baghdad', label: 'Iraq (Asia/Baghdad)' },
  { value: 'Africa/Cairo', label: 'Egypt (Africa/Cairo)' },
  { value: 'Europe/London', label: 'UK (Europe/London)' },
  { value: 'UTC', label: 'UTC' },
];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${String(i).padStart(2, '0')}:00`,
}));

function StatusPill({ ok, label }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
        ok
          ? 'border-green-500/30 bg-green-500/10 text-green-300'
          : 'border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-muted)]'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-green-400' : 'bg-[var(--text-muted)]'}`} />
      {label}
    </span>
  );
}

function SectionCard({ icon: Icon, title, description, children, accent = false }) {
  return (
    <section
      className={`rounded-2xl border p-5 sm:p-6 space-y-4 ${
        accent
          ? 'border-[var(--accent)]/35 bg-[var(--accent)]/5'
          : 'border-[var(--border)] bg-[var(--bg-surface)]/60'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-xl shrink-0 ${accent ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'bg-[var(--bg-primary)] text-[var(--text-sec)]'}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-base">{title}</h3>
          {description && <p className="text-sm text-[var(--text-sec)] mt-0.5">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export default function AdminG2BulkSettings({ t = {}, lang = 'ar', onCatalogSynced }) {
  const isAr = lang === 'ar';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const syncAbortRef = useRef(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [syncResult, setSyncResult] = useState(null);

  const [form, setForm] = useState({
    g2bulk_enabled: false,
    g2bulk_markup_percent: 15,
    g2bulk_catalog_only: true,
    g2bulk_auto_sync_enabled: true,
    g2bulk_auto_sync_hour: 5,
    g2bulk_auto_sync_timezone: 'Asia/Damascus',
    g2bulk_last_sync_at: null,
    g2bulk_api_key_set: false,
    g2bulk_api_key_masked: '',
    g2bulk_api_key_source: 'none',
  });
  const [apiKeyInput, setApiKeyInput] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchG2bulkSettings();
      setForm({
        g2bulk_enabled: data.g2bulk_enabled ?? false,
        g2bulk_markup_percent: data.g2bulk_markup_percent ?? 15,
        g2bulk_catalog_only: data.g2bulk_catalog_only ?? true,
        g2bulk_auto_sync_enabled: data.g2bulk_auto_sync_enabled ?? true,
        g2bulk_auto_sync_hour: data.g2bulk_auto_sync_hour ?? 5,
        g2bulk_auto_sync_timezone: data.g2bulk_auto_sync_timezone || 'Asia/Damascus',
        g2bulk_last_sync_at: data.g2bulk_last_sync_at || null,
        g2bulk_api_key_set: !!data.g2bulk_api_key_set,
        g2bulk_api_key_masked: data.g2bulk_api_key_masked || '',
        g2bulk_api_key_source: data.g2bulk_api_key_source || (data.g2bulk_api_key_set ? 'db' : 'none'),
      });
      setApiKeyInput('');
    } catch (err) {
      setError(err.message || (isAr ? 'تعذر تحميل إعدادات G2Bulk' : 'Failed to load G2Bulk settings'));
    } finally {
      setLoading(false);
    }
  }, [isAr]);

  useEffect(() => {
    load();
  }, [load]);

  const scheduleLabel = useMemo(() => {
    const hour = HOUR_OPTIONS.find((h) => h.value === Number(form.g2bulk_auto_sync_hour))?.label
      || `${form.g2bulk_auto_sync_hour}:00`;
    const tz = TIMEZONE_OPTIONS.find((z) => z.value === form.g2bulk_auto_sync_timezone)?.label
      || form.g2bulk_auto_sync_timezone;
    return `${hour} · ${tz}`;
  }, [form.g2bulk_auto_sync_hour, form.g2bulk_auto_sync_timezone]);

  const persistSettings = async (overrides = {}) => {
    const payload = { ...form, ...overrides };
    await saveG2bulkSettings({
      enabled: payload.g2bulk_enabled,
      markupPercent: parseFloat(payload.g2bulk_markup_percent) || 15,
      catalogOnly: payload.g2bulk_catalog_only,
      autoSyncEnabled: payload.g2bulk_auto_sync_enabled,
      autoSyncHour: Number(payload.g2bulk_auto_sync_hour),
      autoSyncTimezone: payload.g2bulk_auto_sync_timezone,
      apiKey: apiKeyInput.trim() ? apiKeyInput.trim() : undefined,
    });
    if (apiKeyInput.trim()) setApiKeyInput('');
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await persistSettings();
      setSuccess(t.g2bulkSettingsSaved || (isAr ? 'تم حفظ إعدادات G2Bulk' : 'G2Bulk settings saved'));
      await load();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || (isAr ? 'فشل الحفظ' : 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setError('');
    setTestResult(null);
    try {
      if (apiKeyInput.trim()) {
        await persistSettings();
        await load();
      }
      const me = await g2bulkGetMe();
      setTestResult({
        ok: true,
        balance: me.balance,
        username: me.username || me.first_name,
      });
    } catch (err) {
      setTestResult({ ok: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleCancelSync = () => {
    syncAbortRef.current?.abort();
  };

  const syncPhaseLabel = (progress) => {
    if (!progress) return isAr ? 'جاري الاستيراد…' : 'Importing…';
    if (progress.phase === 'init') return isAr ? 'جاري التحضير…' : 'Preparing…';
    if (progress.phase === 'games' && progress.total > 0) {
      return isAr
        ? `الألعاب ${progress.current}/${progress.total}`
        : `Games ${progress.current}/${progress.total}`;
    }
    if (progress.phase === 'vouchers') return isAr ? 'بطاقات الهدايا…' : 'Gift cards…';
    if (progress.phase === 'finalize') return isAr ? 'إنهاء…' : 'Finishing…';
    return isAr ? 'جاري الاستيراد…' : 'Importing…';
  };

  const syncPercent = (progress) => {
    if (!progress) return 0;
    if (progress.phase === 'init') return 8;
    if (progress.phase === 'games' && progress.total > 0) {
      return 8 + Math.round((progress.current / progress.total) * 82);
    }
    if (progress.phase === 'vouchers') return 94;
    if (progress.phase === 'finalize') return 99;
    return 0;
  };

  const handleSyncCatalog = async () => {
    setSyncing(true);
    setError('');
    setSuccess('');
    setSyncResult(null);
    setSyncProgress({ phase: 'init', current: 0, total: 0, gamesSynced: 0, offersSynced: 0 });

    const controller = new AbortController();
    syncAbortRef.current = controller;

    try {
      if (apiKeyInput.trim()) {
        await persistSettings();
      }

      const result = await syncG2bulkCatalog({
        includeVouchers: true,
        hideManual: true,
        signal: controller.signal,
        onProgress: (progress) => setSyncProgress(progress),
      });

      setSyncResult(result);
      setSyncProgress(null);
      setSuccess(
        isAr
          ? `تم استيراد ${result.gamesSynced} لعبة و ${result.offersSynced} عرض`
          : `Imported ${result.gamesSynced} games and ${result.offersSynced} offers`,
      );
      await load();
      await onCatalogSynced?.(form.g2bulk_catalog_only);
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setSyncProgress(null);
      const cancelled = controller.signal.aborted || /cancel/i.test(err.message || '');
      setError(
        cancelled
          ? (isAr ? 'تم إلغاء الاستيراد' : 'Import cancelled')
          : (err.message || (isAr ? 'فشل استيراد الكتالوج' : 'Catalog sync failed')),
      );
    } finally {
      syncAbortRef.current = null;
      setSyncing(false);
    }
  };

  const apiKeyHint = () => {
    if (form.g2bulk_api_key_source === 'env') {
      return isAr
        ? 'المفتاح مُعرّف في Supabase Edge secrets (ليس في قاعدة البيانات). اختبر الاتصال للتأكد.'
        : 'Key is set in Supabase Edge secrets (not in the database). Use Test connection to verify.';
    }
    if (form.g2bulk_api_key_source === 'both') {
      return isAr ? 'مفتاح في Edge secrets وقاعدة البيانات.' : 'Key in Edge secrets and database.';
    }
    if (form.g2bulk_api_key_set) {
      return isAr ? 'المفتاح محفوظ في قاعدة البيانات.' : 'Key saved in database.';
    }
    return isAr
      ? 'الصق المفتاح هنا أو عيّنه في Supabase → Edge Functions → Secrets كـ G2BULK_API_KEY'
      : 'Paste key here or set G2BULK_API_KEY in Supabase Edge Function secrets';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[var(--text-sec)]">
        <Loader2 className="w-7 h-7 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-3 rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)]">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold">
              {t.g2bulkTitle || (isAr ? 'G2Bulk' : 'G2Bulk')}
            </h2>
            <p className="text-sm text-[var(--text-sec)] mt-1 max-w-xl">
              {t.g2bulkCatalogDesc || (isAr
                ? 'استورد الكتالوج، اضبط الأسعار، وجدول المزامنة التلقائية.'
                : 'Import catalog, set pricing, and schedule automatic sync.')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill
            ok={form.g2bulk_api_key_set}
            label={form.g2bulk_api_key_set
              ? (isAr ? 'API متصل' : 'API configured')
              : (isAr ? 'API غير مُعد' : 'API not set')}
          />
          <StatusPill
            ok={!!form.g2bulk_last_sync_at}
            label={form.g2bulk_last_sync_at
              ? (isAr ? 'تمت مزامنة' : 'Synced')
              : (isAr ? 'لم تُزامَن بعد' : 'Never synced')}
          />
        </div>
      </header>

      {(error || success) && (
        <div className="space-y-2">
          {error && (
            <div className="flex items-start gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 text-green-400 text-sm bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
              <CheckCircle className="w-4 h-4 shrink-0" />
              {success}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          icon={Key}
          title={isAr ? 'اتصال API' : 'API connection'}
          description={isAr ? 'مفتاح G2Bulk للتوريد واختبار الرصيد' : 'G2Bulk key for fulfillment and balance check'}
        >
          {form.g2bulk_api_key_set && (
            <div className="flex items-center gap-2 text-sm text-[var(--text-sec)] bg-[var(--bg-primary)]/50 rounded-lg px-3 py-2">
              <Key className="w-4 h-4 text-[var(--accent)] shrink-0" />
              <span className="font-mono truncate">{form.g2bulk_api_key_masked}</span>
            </div>
          )}
          <input
            type="password"
            autoComplete="off"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder={isAr ? 'مفتاح API جديد (اختياري)' : 'New API key (optional)'}
            className="input w-full font-mono text-sm"
          />
          <p className="text-xs text-[var(--text-muted)]">{apiKeyHint()}</p>

          {testResult?.ok && (
            <G2bulkWalletCard
              balance={testResult.balance}
              username={testResult.username}
              lang={lang}
            />
          )}
          {testResult && !testResult.ok && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 px-4 py-3 text-sm flex items-start gap-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{testResult.message}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="btn btn-secondary w-full sm:w-auto inline-flex items-center justify-center gap-2"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {t.testConnection || (isAr ? 'اختبار الاتصال' : 'Test connection')}
          </button>
        </SectionCard>

        <SectionCard
          icon={Store}
          title={isAr ? 'المتجر' : 'Storefront'}
          description={isAr ? 'هامش الربح ومصدر الكتالوج' : 'Markup and catalog source'}
        >
          <div>
            <label className="block text-sm font-medium mb-1.5">
              {t.g2bulkMarkup || (isAr ? 'هامش الربح %' : 'Markup %')}
            </label>
            <input
              type="number"
              min="0"
              max="200"
              step="0.5"
              value={form.g2bulk_markup_percent}
              onChange={(e) => setForm((p) => ({ ...p, g2bulk_markup_percent: e.target.value }))}
              className="input w-full max-w-[120px]"
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.g2bulk_catalog_only}
              onChange={(e) => setForm((p) => ({ ...p, g2bulk_catalog_only: e.target.checked }))}
              className="rounded border-[var(--border)]"
            />
            <span className="text-sm">
              {t.g2bulkCatalogOnly || (isAr ? 'عرض منتجات G2Bulk فقط' : 'Show only G2Bulk products')}
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.g2bulk_enabled}
              onChange={(e) => setForm((p) => ({ ...p, g2bulk_enabled: e.target.checked }))}
              className="rounded border-[var(--border)]"
            />
            <span className="text-sm">
              {t.g2bulkEnabled || (isAr ? 'توريد تلقائي بعد الدفع' : 'Auto-fulfill after payment')}
            </span>
          </label>
        </SectionCard>
      </div>

      <SectionCard
        icon={Download}
        accent
        title={isAr ? 'استيراد الكتالوج' : 'Import catalog'}
        description={isAr
          ? 'يجلب الألعاب والعروض من G2Bulk ويملأ الكاروسيل تلقائياً'
          : 'Pulls games & offers from G2Bulk and fills the home carousel'}
      >
        {form.g2bulk_last_sync_at && (
          <p className="text-xs text-[var(--text-muted)]">
            {isAr ? 'آخر مزامنة:' : 'Last sync:'}{' '}
            {new Date(form.g2bulk_last_sync_at).toLocaleString()}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleSyncCatalog}
            disabled={syncing}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {syncing
              ? syncPhaseLabel(syncProgress)
              : (t.g2bulkSyncNow || (isAr ? 'استيراد الآن' : 'Sync now'))}
          </button>
          {syncing && (
            <button
              type="button"
              onClick={handleCancelSync}
              className="btn btn-secondary inline-flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
          )}
        </div>

        {syncing && syncProgress && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-[var(--text-muted)]">
              <span>{syncPhaseLabel(syncProgress)}</span>
              <span>{syncPercent(syncProgress)}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-[var(--border)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all duration-300 ease-out"
                style={{ width: `${syncPercent(syncProgress)}%` }}
              />
            </div>
            {syncProgress.offersSynced > 0 && (
              <p className="text-xs text-[var(--text-muted)]">
                {isAr
                  ? `${syncProgress.gamesSynced} لعبة · ${syncProgress.offersSynced} عرض`
                  : `${syncProgress.gamesSynced} games · ${syncProgress.offersSynced} offers`}
              </p>
            )}
          </div>
        )}

        {syncResult?.errors?.length > 0 && (
          <div className="text-xs text-amber-300/90 space-y-1 max-h-32 overflow-y-auto">
            <p className="font-medium">{isAr ? 'تحذيرات:' : 'Warnings:'}</p>
            {syncResult.errors.map((msg) => (
              <p key={msg} className="font-mono opacity-90">{msg}</p>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        icon={CalendarClock}
        title={isAr ? 'مزامنة تلقائية' : 'Scheduled sync'}
        description={isAr
          ? 'تشغيل الاستيراد يومياً في الوقت المحدد'
          : 'Run catalog import daily at your chosen time'}
      >
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.g2bulk_auto_sync_enabled}
            onChange={(e) => setForm((p) => ({ ...p, g2bulk_auto_sync_enabled: e.target.checked }))}
            className="rounded border-[var(--border)]"
          />
          <span className="text-sm font-medium">
            {isAr ? 'تفعيل المزامنة اليومية' : 'Enable daily auto-sync'}
          </span>
        </label>

        {form.g2bulk_auto_sync_enabled && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[var(--accent)]" />
                {isAr ? 'وقت المزامنة' : 'Sync time'}
              </label>
              <select
                value={form.g2bulk_auto_sync_hour}
                onChange={(e) => setForm((p) => ({ ...p, g2bulk_auto_sync_hour: Number(e.target.value) }))}
                className="input w-full"
              >
                {HOUR_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">
                {isAr ? 'المنطقة الزمنية' : 'Timezone'}
              </label>
              <select
                value={form.g2bulk_auto_sync_timezone}
                onChange={(e) => setForm((p) => ({ ...p, g2bulk_auto_sync_timezone: e.target.value }))}
                className="input w-full"
              >
                {TIMEZONE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {form.g2bulk_auto_sync_enabled && (
          <p className="text-xs text-[var(--text-muted)] bg-[var(--bg-primary)]/40 rounded-lg px-3 py-2">
            {isAr ? 'التالي:' : 'Next run:'}{' '}
            <span className="text-[var(--text-sec)]">{scheduleLabel}</span>
            {' · '}
            {isAr ? 'كل يوم (إذا لم تُزامَن بعد)' : 'every day (if not already synced)'}
          </p>
        )}
      </SectionCard>

      <div className="flex flex-wrap gap-3 pt-2 border-t border-[var(--border)]">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary inline-flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t.save || (isAr ? 'حفظ الإعدادات' : 'Save settings')}
        </button>
        <p className="text-xs text-[var(--text-muted)] self-center flex items-center gap-1.5">
          <Truck className="w-3.5 h-3.5" />
          {isAr ? 'احفظ بعد تغيير الجدولة أو هامش الربح' : 'Save after changing schedule or markup'}
        </p>
      </div>
    </div>
  );
}