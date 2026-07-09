import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Zap, Loader2, CheckCircle, AlertCircle, Save, RefreshCw, Download, X,
  Clock, Key, Store, Truck, CalendarClock, ShieldCheck, ArrowRight,
  Package, TrendingUp, MinusCircle, PlusCircle, Info,
} from 'lucide-react';
import G2bulkWalletCard from '../ui/G2bulkWalletCard';
import {
  fetchG2bulkSettings,
  saveG2bulkSettings,
  g2bulkGetMe,
  syncG2bulkCatalog,
  checkG2bulkCatalog,
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

function StatChip({ label, value, tone = 'default' }) {
  const tones = {
    default: 'border-[var(--border)] bg-[var(--bg-primary)]/50 text-[var(--text-sec)]',
    good: 'border-green-500/25 bg-green-500/10 text-green-300',
    warn: 'border-amber-500/25 bg-amber-500/10 text-amber-200',
    muted: 'border-[var(--border)] bg-transparent text-[var(--text-muted)]',
  };
  return (
    <div className={`rounded-xl border px-3 py-2.5 min-w-[7rem] ${tones[tone] || tones.default}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-lg font-black mt-0.5 tabular-nums">{value}</div>
    </div>
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
  const [checking, setChecking] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const [checkProgress, setCheckProgress] = useState(null);
  const [includeVouchers, setIncludeVouchers] = useState(true);
  const syncAbortRef = useRef(null);
  const checkAbortRef = useRef(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [checkResult, setCheckResult] = useState(null);

  const [form, setForm] = useState({
    g2bulk_enabled: false,
    g2bulk_markup_percent: 15,
    g2bulk_catalog_only: true,
    g2bulk_auto_sync_enabled: true,
    g2bulk_auto_sync_hour: 5,
    g2bulk_auto_sync_timezone: 'Asia/Damascus',
    g2bulk_last_sync_at: null,
    g2bulk_last_check_at: null,
    g2bulk_check_summary: null,
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
        g2bulk_last_check_at: data.g2bulk_last_check_at || null,
        g2bulk_check_summary: data.g2bulk_check_summary || null,
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

  const handleCancelCheck = () => {
    checkAbortRef.current?.abort();
  };

  const catalogSummary = checkResult?.summary || form.g2bulk_check_summary;
  const catalogUpToDate = !!catalogSummary?.upToDate;
  const catalogNeverSynced = !form.g2bulk_last_sync_at;
  const catalogChanges = Number(catalogSummary?.totalChanges ?? 0);

  const catalogStatus = useMemo(() => {
    if (checking) return 'checking';
    if (catalogNeverSynced) return 'never';
    if (catalogSummary?.upToDate) return 'current';
    if (catalogChanges > 0) return 'updates';
    if (form.g2bulk_last_check_at) return 'stale';
    return 'unknown';
  }, [checking, catalogNeverSynced, catalogSummary, catalogChanges, form.g2bulk_last_check_at]);

  const progressPhaseLabel = (progress, mode = 'sync') => {
    if (!progress) return mode === 'check'
      ? (isAr ? 'جاري الفحص…' : 'Checking…')
      : (isAr ? 'جاري الاستيراد…' : 'Importing…');
    if (progress.phase === 'init') return isAr ? 'جاري التحضير…' : 'Preparing…';
    if (progress.phase === 'games' && progress.total > 0) {
      return isAr
        ? `${mode === 'check' ? 'فحص' : 'مزامنة'} الألعاب ${progress.current}/${progress.total}`
        : `${mode === 'check' ? 'Scanning' : 'Syncing'} games ${progress.current}/${progress.total}`;
    }
    if (progress.phase === 'vouchers') {
      return isAr ? 'بطاقات الهدايا…' : 'Gift cards…';
    }
    if (progress.phase === 'finalize') return isAr ? 'إنهاء…' : 'Finishing…';
    return mode === 'check'
      ? (isAr ? 'جاري الفحص…' : 'Checking…')
      : (isAr ? 'جاري الاستيراد…' : 'Importing…');
  };

  const progressPercent = (progress) => {
    if (!progress) return 0;
    if (progress.phase === 'init') return 6;
    if (progress.phase === 'games' && progress.total > 0) {
      return 6 + Math.round((progress.current / progress.total) * 84);
    }
    if (progress.phase === 'vouchers') return 94;
    if (progress.phase === 'finalize') return 99;
    return 0;
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

  const handleCheckCatalog = async () => {
    setChecking(true);
    setError('');
    setSuccess('');
    setCheckResult(null);
    setCheckProgress({ phase: 'init', current: 0, total: 0 });

    const controller = new AbortController();
    checkAbortRef.current = controller;

    try {
      const result = await checkG2bulkCatalog({
        includeVouchers,
        signal: controller.signal,
        onProgress: (progress) => setCheckProgress(progress),
      });

      setCheckResult(result);
      setCheckProgress(null);
      setForm((prev) => ({
        ...prev,
        g2bulk_last_check_at: result.checkedAt || prev.g2bulk_last_check_at,
        g2bulk_check_summary: result.summary || prev.g2bulk_check_summary,
      }));

      if (result.summary?.upToDate) {
        setSuccess(isAr
          ? 'الكتالوج محدّث — لا توجد تغييرات من G2Bulk'
          : 'Catalog is up to date — no changes from G2Bulk');
      } else {
        setSuccess(isAr
          ? `تم العثور على ${result.summary?.totalChanges ?? 0} تغيير(ات) — يمكنك المزامنة الآن`
          : `Found ${result.summary?.totalChanges ?? 0} change(s) — you can sync now`);
      }
      setTimeout(() => setSuccess(''), 6000);
    } catch (err) {
      setCheckProgress(null);
      const cancelled = controller.signal.aborted || /cancel/i.test(err.message || '');
      setError(
        cancelled
          ? (isAr ? 'تم إلغاء الفحص' : 'Check cancelled')
          : (err.message || (isAr ? 'فشل فحص الكتالوج' : 'Catalog check failed')),
      );
    } finally {
      checkAbortRef.current = null;
      setChecking(false);
    }
  };

  const handleSyncCatalog = async (force = false) => {
    if (!force && catalogUpToDate && !catalogNeverSynced) {
      const ok = window.confirm(isAr
        ? 'الكتالوج محدّث حسب آخر فحص. هل تريد مزامنة كاملة على أي حال؟'
        : 'Catalog looks up to date from the last check. Run a full sync anyway?');
      if (!ok) return;
    }
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
        includeVouchers,
        hideManual: true,
        signal: controller.signal,
        onProgress: (progress) => setSyncProgress(progress),
      });

      setSyncResult(result);
      setSyncProgress(null);
      setCheckResult(null);
      setSuccess(
        isAr
          ? `تمت المزامنة — ${result.gamesSynced} لعبة · ${result.offersSynced} عرض`
          : `Sync complete — ${result.gamesSynced} games · ${result.offersSynced} offers`,
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
        icon={Package}
        accent
        title={isAr ? 'صحة الكتالوج' : 'Catalog health'}
        description={isAr
          ? 'افحص التحديثات أولاً — المزامنة الكاملة تستغرق وقتاً لكنها لا تحذف الطلبات'
          : 'Check for updates first — full sync takes time but does not delete orders'}
      >
        <div className={`rounded-2xl border px-4 py-4 ${
          catalogStatus === 'current'
            ? 'border-green-500/30 bg-green-500/5'
            : catalogStatus === 'updates'
              ? 'border-amber-500/30 bg-amber-500/5'
              : catalogStatus === 'checking'
                ? 'border-[var(--accent)]/30 bg-[var(--accent)]/5'
                : 'border-[var(--border)] bg-[var(--bg-primary)]/35'
        }`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              {catalogStatus === 'current' && <ShieldCheck className="w-6 h-6 text-green-400 shrink-0" />}
              {catalogStatus === 'updates' && <TrendingUp className="w-6 h-6 text-amber-300 shrink-0" />}
              {catalogStatus === 'checking' && <Loader2 className="w-6 h-6 text-[var(--accent)] animate-spin shrink-0" />}
              {catalogStatus === 'never' && <Info className="w-6 h-6 text-[var(--text-muted)] shrink-0" />}
              {(catalogStatus === 'stale' || catalogStatus === 'unknown') && (
                <RefreshCw className="w-6 h-6 text-[var(--text-sec)] shrink-0" />
              )}
              <div>
                <div className="font-bold text-base">
                  {catalogStatus === 'current' && (isAr ? 'محدّث — لا تغييرات' : 'Up to date — no changes')}
                  {catalogStatus === 'updates' && (isAr
                    ? `${catalogChanges} تغيير(ات) من G2Bulk`
                    : `${catalogChanges} change(s) from G2Bulk`)}
                  {catalogStatus === 'checking' && (isAr ? 'جاري مقارنة الكتالوج…' : 'Comparing catalog…')}
                  {catalogStatus === 'never' && (isAr ? 'لم تُزامَن بعد' : 'Never synced yet')}
                  {catalogStatus === 'stale' && (isAr ? 'لم يُفحَص مؤخراً' : 'Not checked recently')}
                  {catalogStatus === 'unknown' && (isAr ? 'حالة الكتالوج غير معروفة' : 'Catalog status unknown')}
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-1 space-y-0.5">
                  {form.g2bulk_last_sync_at && (
                    <div>
                      {isAr ? 'آخر مزامنة:' : 'Last sync:'}{' '}
                      {new Date(form.g2bulk_last_sync_at).toLocaleString()}
                    </div>
                  )}
                  {form.g2bulk_last_check_at && (
                    <div>
                      {isAr ? 'آخر فحص:' : 'Last check:'}{' '}
                      {new Date(form.g2bulk_last_check_at).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/30 px-4 py-3 text-sm text-[var(--text-sec)]">
          <p className="font-medium text-[var(--text-primary)] mb-2 flex items-center gap-2">
            <Info className="w-4 h-4 text-[var(--accent)]" />
            {isAr ? 'ماذا تفعل المزامنة؟' : 'What does sync do?'}
          </p>
          <ul className="space-y-1 text-xs leading-relaxed list-disc ps-5">
            <li>{isAr ? 'تحدّث الأسعار من كتالوج G2Bulk المباشر' : 'Updates prices from live G2Bulk catalogue'}</li>
            <li>{isAr ? 'تضيف ألعاباً وعروضاً جديدة' : 'Adds new games and offers'}</li>
            <li>{isAr ? 'تعطّل العروض المحذوفة من G2Bulk (بدون حذف سجلات الطلبات)' : 'Deactivates offers removed from G2Bulk (order history stays)'}</li>
            <li>{isAr ? 'تجمّع المناطق الإقليمية وتجلب قوائم السيرفرات' : 'Groups regional variants and refreshes server lists'}</li>
          </ul>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={includeVouchers}
            onChange={(e) => setIncludeVouchers(e.target.checked)}
            className="rounded border-[var(--border)]"
            disabled={syncing || checking}
          />
          <span className="text-sm">
            {isAr ? 'تضمين بطاقات الهدايا (vouchers)' : 'Include gift card vouchers'}
          </span>
        </label>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleCheckCatalog}
            disabled={syncing || checking}
            className="btn btn-secondary inline-flex items-center gap-2"
          >
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {checking
              ? progressPhaseLabel(checkProgress, 'check')
              : (isAr ? 'فحص التحديثات' : 'Check for updates')}
          </button>

          <button
            type="button"
            onClick={() => handleSyncCatalog(false)}
            disabled={syncing || checking}
            className={`btn inline-flex items-center gap-2 ${
              catalogUpToDate && !catalogNeverSynced ? 'btn-secondary' : 'btn-primary'
            }`}
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {syncing
              ? syncPhaseLabel(syncProgress)
              : catalogUpToDate && !catalogNeverSynced
                ? (isAr ? 'مزامنة كاملة (اختياري)' : 'Force full sync')
                : (t.g2bulkSyncNow || (isAr ? 'مزامنة الكتالوج' : 'Sync catalog'))}
          </button>

          {(syncing || checking) && (
            <button
              type="button"
              onClick={syncing ? handleCancelSync : handleCancelCheck}
              className="btn btn-secondary inline-flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
          )}
        </div>

        {(checking && checkProgress) && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-[var(--text-muted)]">
              <span>{progressPhaseLabel(checkProgress, 'check')}</span>
              <span>{progressPercent(checkProgress)}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-[var(--border)] overflow-hidden">
              <div
                className="h-full rounded-full bg-cyan-400/80 transition-all duration-300 ease-out"
                style={{ width: `${progressPercent(checkProgress)}%` }}
              />
            </div>
          </div>
        )}

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

        {catalogSummary && !checking && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <StatChip
                label={isAr ? 'بدون تغيير' : 'Unchanged'}
                value={catalogSummary.unchangedOffers ?? 0}
                tone="good"
              />
              <StatChip
                label={isAr ? 'أسعار' : 'Prices'}
                value={catalogSummary.priceChanges ?? 0}
                tone={(catalogSummary.priceChanges ?? 0) > 0 ? 'warn' : 'muted'}
              />
              <StatChip
                label={isAr ? 'عروض جديدة' : 'New offers'}
                value={catalogSummary.newOffers ?? 0}
                tone={(catalogSummary.newOffers ?? 0) > 0 ? 'warn' : 'muted'}
              />
              <StatChip
                label={isAr ? 'ألعاب جديدة' : 'New games'}
                value={catalogSummary.newGames ?? 0}
                tone={(catalogSummary.newGames ?? 0) > 0 ? 'warn' : 'muted'}
              />
              <StatChip
                label={isAr ? 'محذوفة' : 'Removed'}
                value={(catalogSummary.removedOffers ?? 0) + (catalogSummary.removedGames ?? 0)}
                tone={((catalogSummary.removedOffers ?? 0) + (catalogSummary.removedGames ?? 0)) > 0 ? 'warn' : 'muted'}
              />
            </div>

            {catalogSummary.samples && (
              <div className="text-xs text-[var(--text-sec)] space-y-2 max-h-40 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/25 px-3 py-2">
                {(catalogSummary.samples.priceChanges || []).map((row) => (
                  <div key={`${row.game}-${row.offer}`} className="flex items-center gap-2 font-mono">
                    <TrendingUp className="w-3 h-3 text-amber-300 shrink-0" />
                    <span className="truncate">{row.game} · {row.offer}</span>
                    <span className="text-[var(--text-muted)] shrink-0">${row.was?.toFixed?.(2) ?? row.was} → ${row.now?.toFixed?.(2) ?? row.now}</span>
                  </div>
                ))}
                {(catalogSummary.samples.newOffers || []).map((row) => (
                  <div key={`new-${row.game}-${row.offer}`} className="flex items-center gap-2">
                    <PlusCircle className="w-3 h-3 text-green-400 shrink-0" />
                    <span className="truncate">{row.game} · {row.offer}</span>
                  </div>
                ))}
                {(catalogSummary.samples.removedOffers || []).map((row) => (
                  <div key={`rm-${row.game}-${row.offer}`} className="flex items-center gap-2">
                    <MinusCircle className="w-3 h-3 text-red-400 shrink-0" />
                    <span className="truncate">{row.game} · {row.offer}</span>
                  </div>
                ))}
                {(catalogSummary.samples.newGames || []).map((code) => (
                  <div key={`game-${code}`} className="flex items-center gap-2">
                    <PlusCircle className="w-3 h-3 text-green-400 shrink-0" />
                    <span>{isAr ? 'لعبة جديدة:' : 'New game:'} {code}</span>
                  </div>
                ))}
              </div>
            )}

            {catalogUpToDate && !catalogNeverSynced && (
              <p className="text-xs text-green-300/90 flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" />
                {isAr
                  ? 'لا حاجة للمزامنة الآن — شغّل فحصاً دورياً أو انتظر المزامنة التلقائية'
                  : 'No sync needed right now — run checks periodically or wait for auto-sync'}
              </p>
            )}

            {!catalogUpToDate && catalogChanges > 0 && !syncing && (
              <p className="text-xs text-amber-200/90 flex items-center gap-1.5">
                <ArrowRight className="w-3.5 h-3.5" />
                {isAr
                  ? 'يوجد تغييرات — اضغط «مزامنة الكتالوج» لتطبيقها على المتجر'
                  : 'Changes detected — press Sync catalog to apply them to the store'}
              </p>
            )}
          </div>
        )}

        {checkResult?.errors?.length > 0 && (
          <div className="text-xs text-amber-300/90 space-y-1 max-h-28 overflow-y-auto">
            <p className="font-medium">{isAr ? 'تحذيرات الفحص:' : 'Check warnings:'}</p>
            {checkResult.errors.map((msg) => (
              <p key={msg} className="font-mono opacity-90">{msg}</p>
            ))}
          </div>
        )}

        {syncResult?.errors?.length > 0 && (
          <div className="text-xs text-amber-300/90 space-y-1 max-h-32 overflow-y-auto">
            <p className="font-medium">{isAr ? 'تحذيرات المزامنة:' : 'Sync warnings:'}</p>
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