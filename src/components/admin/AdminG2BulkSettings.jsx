import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Zap, Loader2, CheckCircle, AlertCircle, Save, RefreshCw, Download, X,
  Clock, Key, Store, Truck, CalendarClock, ShieldCheck,
  Package, Info, CloudDownload, Trash2,
} from 'lucide-react';
import G2bulkWalletCard from '../ui/G2bulkWalletCard';
import G2bulkPullPanel from './G2bulkPullPanel';
import ConfirmDialog from '../ui/ConfirmDialog';
import {
  fetchG2bulkSettings,
  saveG2bulkSettings,
  syncG2bulkCatalog,
  clearG2bulkSyncedCatalog,
  applyG2bulkCharmPricing,
} from '../../lib/g2bulk';
import { refreshSupplierWallets } from '../../lib/adminSupplierWalletsStore';
import { useAdminG2bulkWallet } from '../../hooks/useAdminG2bulkWallet';
import { applyCharmPricing } from '../../lib/charmPricing';
import { countPullSelection, normalizeCatalogMode, normalizePullSelection } from '../../lib/pullCatalogUtils';
import { formatMessage } from '../../lib/i18n';

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

function CatalogModeToggle({ mode, onChange, t = {} }) {
  const resolved = normalizeCatalogMode(mode);
  return (
    <div className="inline-flex w-full sm:w-auto rounded-xl border border-[var(--border)] overflow-hidden">
      <button
        type="button"
        onClick={() => onChange('sync')}
        className={`flex-1 sm:flex-none px-4 py-2.5 min-h-[44px] text-sm font-semibold touch-manipulation transition-colors ${
          resolved === 'sync'
            ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
            : 'bg-[var(--bg-primary)]/40 text-[var(--text-sec)]'
        }`}
      >
        {t.g2bulkCatalogModeSync}
      </button>
      <button
        type="button"
        onClick={() => onChange('live')}
        className={`flex-1 sm:flex-none px-4 py-2.5 min-h-[44px] text-sm font-semibold touch-manipulation transition-colors border-s border-[var(--border)] ${
          resolved === 'live'
            ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
            : 'bg-[var(--bg-primary)]/40 text-[var(--text-sec)]'
        }`}
      >
        {t.g2bulkCatalogModeLive}
      </button>
    </div>
  );
}

export default function AdminG2BulkSettings({ t = {}, lang = 'ar', onCatalogSynced, embedded = false }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [pullPanelOpen, setPullPanelOpen] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const syncAbortRef = useRef(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [pullSelection, setPullSelection] = useState(normalizePullSelection());
  const [applyingCharm, setApplyingCharm] = useState(false);

  const [form, setForm] = useState({
    g2bulk_enabled: false,
    g2bulk_markup_percent: 15,
    g2bulk_charm_pricing_enabled: false,
    g2bulk_catalog_only: true,
    g2bulk_catalog_mode: 'sync',
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
  const walletEnabled = !loading && (form.g2bulk_api_key_set || apiKeyInput.trim().length > 0);
  const {
    wallet: g2bulkWallet,
    loading: walletLoading,
    error: walletError,
    refresh: refreshG2bulkWallet,
    hasFetched: walletFetched,
  } = useAdminG2bulkWallet(walletEnabled, { autoFetch: true });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchG2bulkSettings();
      setForm({
        g2bulk_enabled: data.g2bulk_enabled ?? false,
        g2bulk_markup_percent: data.g2bulk_markup_percent ?? 15,
        g2bulk_charm_pricing_enabled: data.g2bulk_charm_pricing_enabled ?? false,
        g2bulk_catalog_only: data.g2bulk_catalog_only ?? true,
        g2bulk_catalog_mode: normalizeCatalogMode(data.g2bulk_catalog_mode),
        g2bulk_auto_sync_enabled: data.g2bulk_auto_sync_enabled ?? true,
        g2bulk_auto_sync_hour: data.g2bulk_auto_sync_hour ?? 5,
        g2bulk_auto_sync_timezone: data.g2bulk_auto_sync_timezone || 'Asia/Damascus',
        g2bulk_last_sync_at: data.g2bulk_last_sync_at || null,
        g2bulk_last_check_at: data.g2bulk_last_check_at || null,
        g2bulk_check_summary: data.g2bulk_check_summary || null,
        g2bulk_pull_selection: data.g2bulk_pull_selection || null,
        g2bulk_api_key_set: !!data.g2bulk_api_key_set,
        g2bulk_api_key_masked: data.g2bulk_api_key_masked || '',
        g2bulk_api_key_source: data.g2bulk_api_key_source || (data.g2bulk_api_key_set ? 'db' : 'none'),
      });
      setApiKeyInput('');
      setPullSelection(normalizePullSelection(data.g2bulk_pull_selection || {}));
    } catch (err) {
      setError(err.message || t.g2bulkLoadFailed);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const charmPreview = useMemo(() => {
    const markedSamples = [0.43, 0.85, 1.25, 1.68];
    return markedSamples.map((plain) => ({
      plain,
      charm: applyCharmPricing(plain),
    }));
  }, []);

  const handleApplyCharmPricing = async () => {
    setApplyingCharm(true);
    setError('');
    setSuccess('');
    try {
      const result = await applyG2bulkCharmPricing();
      setSuccess(formatMessage(t.g2bulkCharmPricingApplied, { count: result.updated ?? 0 }));
      await onCatalogSynced?.(form.g2bulk_catalog_only);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || t.g2bulkCharmPricingFailed);
    } finally {
      setApplyingCharm(false);
    }
  };

  const scheduleLabel = useMemo(() => {
    const hour = HOUR_OPTIONS.find((h) => h.value === Number(form.g2bulk_auto_sync_hour))?.label
      || `${form.g2bulk_auto_sync_hour}:00`;
    const tz = TIMEZONE_OPTIONS.find((z) => z.value === form.g2bulk_auto_sync_timezone)?.label
      || form.g2bulk_auto_sync_timezone;
    return `${hour} · ${tz}`;
  }, [form.g2bulk_auto_sync_hour, form.g2bulk_auto_sync_timezone]);

  const persistSettings = async (overrides = {}) => {
    const payload = { ...form, ...overrides };
    const saved = await saveG2bulkSettings({
      enabled: payload.g2bulk_enabled,
      markupPercent: parseFloat(payload.g2bulk_markup_percent) || 15,
      charmPricingEnabled: !!payload.g2bulk_charm_pricing_enabled,
      catalogOnly: payload.g2bulk_catalog_only,
      catalogMode: payload.g2bulk_catalog_mode,
      autoSyncEnabled: payload.g2bulk_auto_sync_enabled,
      autoSyncHour: Number(payload.g2bulk_auto_sync_hour),
      autoSyncTimezone: payload.g2bulk_auto_sync_timezone,
      apiKey: apiKeyInput.trim() ? apiKeyInput.trim() : undefined,
    });
    if (apiKeyInput.trim()) setApiKeyInput('');
    if (saved) {
      setForm((prev) => ({
        ...prev,
        g2bulk_enabled: saved.g2bulk_enabled ?? prev.g2bulk_enabled,
        g2bulk_markup_percent: saved.g2bulk_markup_percent ?? prev.g2bulk_markup_percent,
        g2bulk_charm_pricing_enabled: saved.g2bulk_charm_pricing_enabled ?? prev.g2bulk_charm_pricing_enabled,
        g2bulk_catalog_only: saved.g2bulk_catalog_only ?? prev.g2bulk_catalog_only,
        g2bulk_catalog_mode: saved.g2bulk_catalog_mode || prev.g2bulk_catalog_mode,
        g2bulk_auto_sync_enabled: saved.g2bulk_auto_sync_enabled ?? prev.g2bulk_auto_sync_enabled,
        g2bulk_auto_sync_hour: saved.g2bulk_auto_sync_hour ?? prev.g2bulk_auto_sync_hour,
        g2bulk_auto_sync_timezone: saved.g2bulk_auto_sync_timezone || prev.g2bulk_auto_sync_timezone,
        g2bulk_last_sync_at: saved.g2bulk_last_sync_at || prev.g2bulk_last_sync_at,
        g2bulk_last_check_at: saved.g2bulk_last_check_at || prev.g2bulk_last_check_at,
        g2bulk_check_summary: saved.g2bulk_check_summary || prev.g2bulk_check_summary,
        g2bulk_pull_selection: saved.g2bulk_pull_selection || prev.g2bulk_pull_selection,
        g2bulk_api_key_set: saved.g2bulk_api_key_set ?? prev.g2bulk_api_key_set,
        g2bulk_api_key_masked: saved.g2bulk_api_key_masked || prev.g2bulk_api_key_masked,
        g2bulk_api_key_source: saved.g2bulk_api_key_source || prev.g2bulk_api_key_source,
      }));
      setPullSelection(normalizePullSelection(saved.g2bulk_pull_selection || {}));
    }
    return saved;
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const saved = await persistSettings();
      setSuccess(t.g2bulkSettingsSaved);
      if (!saved) {
        await load();
      }
      await onCatalogSynced?.(form.g2bulk_catalog_only);
      if (form.g2bulk_api_key_set || apiKeyInput.trim()) {
        await refreshG2bulkWallet();
        await refreshSupplierWallets();
      }
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || t.g2bulkSaveFailed);
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
      }
      const wallet = await refreshG2bulkWallet();
      if (!wallet) {
        setTestResult({ ok: false, message: 'Failed to load G2Bulk wallet' });
        return;
      }
      setTestResult({
        ok: true,
        balance: wallet.balance,
        username: wallet.username,
      });
      await refreshSupplierWallets();
    } catch (err) {
      setTestResult({ ok: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleCancelSync = () => {
    syncAbortRef.current?.abort();
  };

  const handlePullSelectionLoaded = useCallback((selection, catalogMode) => {
    setPullSelection(normalizePullSelection(selection || {}));
    if (catalogMode) {
      setForm((prev) => ({ ...prev, g2bulk_catalog_mode: catalogMode }));
    }
  }, []);

  const handlePullSelectionSaved = useCallback((selection, catalogMode) => {
    setPullSelection(normalizePullSelection(selection || {}));
    if (catalogMode) {
      setForm((prev) => ({ ...prev, g2bulk_catalog_mode: catalogMode }));
    }
    setSuccess(t.g2bulkPullSelectionSaved);
    onCatalogSynced?.(form.g2bulk_catalog_only);
    setTimeout(() => setSuccess(''), 3000);
  }, [t.g2bulkPullSelectionSaved, onCatalogSynced, form.g2bulk_catalog_only]);

  const handleSaveAndSyncSelection = useCallback(async (selection, catalogMode) => {
    setPullSelection(normalizePullSelection(selection || {}));
    if (catalogMode) {
      setForm((prev) => ({ ...prev, g2bulk_catalog_mode: catalogMode }));
    }
    await handleSyncCatalog({ selectionOverride: selection });
  }, []);

  const catalogMode = normalizeCatalogMode(form.g2bulk_catalog_mode);

  const pullCounts = useMemo(() => {
    const all = countPullSelection(pullSelection);
    if (catalogMode === 'live') {
      return {
        ...all,
        games: all.liveGames,
        vouchers: all.liveVouchers,
        carousel: 0,
      };
    }
    return {
      ...all,
      games: all.syncGames,
      vouchers: all.syncVouchers,
    };
  }, [pullSelection, catalogMode]);

  const catalogNeverSynced = !form.g2bulk_last_sync_at;
  const hasAnyPullSelection = (pullCounts.games + pullCounts.vouchers) > 0;
  const hasSyncableSelection = catalogMode === 'sync' && hasAnyPullSelection;

  const catalogStatus = useMemo(() => {
    if (syncing) return 'syncing';
    if (!hasAnyPullSelection) return 'no-selection';
    if (catalogNeverSynced) return 'ready';
    return 'synced';
  }, [syncing, hasAnyPullSelection, catalogNeverSynced]);

  const syncPhaseLabel = (progress) => {
    if (!progress) return t.g2bulkImporting;
    if (progress.phase === 'init') return t.g2bulkPreparing;
    if (progress.phase === 'games' && progress.total > 0) {
      return formatMessage(t.g2bulkGamesProgress, {
        current: progress.current,
        total: progress.total,
      });
    }
    if (progress.phase === 'vouchers') return t.g2bulkGiftCardsPhase;
    if (progress.phase === 'finalize') return t.g2bulkFinishing;
    return t.g2bulkImporting;
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

  const handleClearSyncedCatalog = () => {
    setShowClearConfirm(true);
  };

  const confirmClearSyncedCatalog = async () => {
    setClearing(true);
    setError('');
    setSuccess('');
    try {
      const result = await clearG2bulkSyncedCatalog();
      setSuccess(formatMessage(t.g2bulkClearSuccess, {
        games: result.gamesRemoved ?? 0,
        offers: result.offersRemoved ?? 0,
      }));
      await load();
      await onCatalogSynced?.(form.g2bulk_catalog_only);
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err.message || t.g2bulkClearFailed);
    } finally {
      setClearing(false);
      setShowClearConfirm(false);
    }
  };

  const handleSyncCatalog = async ({ selectionOverride = null } = {}) => {
    const effectiveSelection = selectionOverride || pullSelection;
    const counts = countPullSelection(effectiveSelection);
    const canSync = (counts.syncGames + counts.syncVouchers) > 0;

    if (!canSync) {
      setError(hasAnyPullSelection ? t.g2bulkSyncNeedLiveGames : t.g2bulkSyncNeedSelection);
      setPullPanelOpen(true);
      return;
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
        hideManual: true,
        signal: controller.signal,
        onProgress: (progress) => setSyncProgress(progress),
      });

      setSyncResult(result);
      setSyncProgress(null);
      setSuccess(formatMessage(t.g2bulkSyncProgress, {
        games: result.gamesSynced,
        offers: result.offersSynced,
      }));
      await load();
      await onCatalogSynced?.(form.g2bulk_catalog_only);
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setSyncProgress(null);
      const cancelled = controller.signal.aborted || /cancel/i.test(err.message || '');
      setError(
        cancelled
          ? t.g2bulkImportCancelled
          : (err.message || t.g2bulkImportFailed),
      );
    } finally {
      syncAbortRef.current = null;
      setSyncing(false);
    }
  };

  const apiKeyHint = () => {
    if (form.g2bulk_api_key_source === 'env') {
      return t.g2bulkApiKeyEdgeOnly;
    }
    if (form.g2bulk_api_key_source === 'both') {
      return t.g2bulkApiKeyBoth;
    }
    if (form.g2bulk_api_key_set) {
      return t.g2bulkApiKeyDb;
    }
    return t.g2bulkApiKeyHint;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[var(--text-sec)]">
        <Loader2 className="w-7 h-7 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  const handleCatalogModeChange = (nextMode) => {
    const resolved = normalizeCatalogMode(nextMode);
    setForm((prev) => ({
      ...prev,
      g2bulk_catalog_mode: resolved,
      g2bulk_catalog_only: resolved === 'live' ? false : prev.g2bulk_catalog_only,
    }));
  };

  const catalogHealthSection = (
    <SectionCard
      icon={Package}
      accent
      title={t.g2bulkCatalogHealth}
      description={t.g2bulkCatalogHealthDesc}
    >
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/30 px-4 py-3 space-y-2">
        <label className="block text-sm font-medium">{t.g2bulkCatalogSource}</label>
        <CatalogModeToggle
          mode={catalogMode}
          onChange={handleCatalogModeChange}
          t={t}
        />
        <p className="text-xs text-[var(--text-muted)]">
          {catalogMode === 'live' ? t.g2bulkCatalogModeLiveHelp : t.g2bulkCatalogModeSyncHelp}
        </p>
      </div>

      <div className={`rounded-2xl border px-4 py-4 ${
        catalogStatus === 'synced'
          ? 'border-green-500/30 bg-green-500/5'
          : catalogStatus === 'no-selection'
            ? 'border-amber-500/30 bg-amber-500/5'
            : catalogStatus === 'syncing'
              ? 'border-[var(--accent)]/30 bg-[var(--accent)]/5'
              : 'border-[var(--border)] bg-[var(--bg-primary)]/35'
      }`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {catalogStatus === 'synced' && <ShieldCheck className="w-6 h-6 text-green-400 shrink-0" />}
            {catalogStatus === 'no-selection' && <Info className="w-6 h-6 text-amber-300 shrink-0" />}
            {catalogStatus === 'syncing' && <Loader2 className="w-6 h-6 text-[var(--accent)] animate-spin shrink-0" />}
            {(catalogStatus === 'ready' || catalogStatus === 'never') && (
              <CloudDownload className="w-6 h-6 text-[var(--text-sec)] shrink-0" />
            )}
            <div>
              <div className="font-bold text-base">
                {catalogStatus === 'no-selection' && t.g2bulkNothingSelected}
                {catalogStatus === 'ready' && t.g2bulkReadyToSync}
                {catalogStatus === 'synced' && t.g2bulkSelectionSynced}
                {catalogStatus === 'syncing' && t.g2bulkSyncing}
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-1 space-y-1">
                {hasAnyPullSelection && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]/30 px-3 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-sec)]">
                        {t.g2bulkLaneTopups}
                      </div>
                      <div className="mt-0.5 text-sm text-[var(--text-primary)] font-semibold">
                        {pullCounts.games} {t.g2bulkGamesUnit}
                      </div>
                      <div className="text-[11px]">
                        {catalogMode === 'live' ? t.g2bulkLiveMode : t.g2bulkSyncMode}
                        {pullCounts.carousel > 0 && (
                          <>
                            {' · '}
                            {pullCounts.carousel} {t.g2bulkCarouselUnit}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]/30 px-3 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-sec)]">
                        {t.g2bulkLaneVouchers}
                      </div>
                      <div className="mt-0.5 text-sm text-[var(--text-primary)] font-semibold">
                        {pullCounts.vouchers} {t.g2bulkVouchersUnit}
                      </div>
                      <div className="text-[11px]">
                        {pullCounts.platformVouchers} {t.g2bulkVoucherPlatformUnit}
                        {pullCounts.gameVouchers > 0 && (
                          <>
                            {' · '}
                            {pullCounts.gameVouchers} {t.g2bulkVoucherGameUnit}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {form.g2bulk_last_sync_at && (
                  <div>
                    {t.g2bulkLastSync}{' '}
                    {new Date(form.g2bulk_last_sync_at).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {catalogMode === 'sync' && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/30 px-4 py-3 text-sm text-[var(--text-sec)]">
          <p className="font-medium text-[var(--text-primary)] mb-2 flex items-center gap-2">
            <Info className="w-4 h-4 text-[var(--accent)]" />
            {t.g2bulkWhatSyncDoes}
          </p>
          <ul className="space-y-1 text-xs leading-relaxed list-disc ps-5">
            <li>{t.g2bulkSyncStep1}</li>
            <li>{t.g2bulkSyncStep2}</li>
            <li>{t.g2bulkSyncStep3}</li>
            <li>{t.g2bulkSyncStep4}</li>
            <li>{t.g2bulkSyncStep5}</li>
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setPullPanelOpen(true)}
          disabled={syncing || clearing}
          className="btn btn-primary inline-flex items-center gap-2"
        >
          <CloudDownload className="w-4 h-4" />
          {t.g2bulkPullFromApi}
        </button>

        {catalogMode === 'sync' && (
          <button
            type="button"
            onClick={handleSyncCatalog}
            disabled={syncing || clearing || !hasSyncableSelection}
            className="btn btn-secondary inline-flex items-center gap-2"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {syncing
              ? syncPhaseLabel(syncProgress)
              : t.g2bulkSyncNow}
          </button>
        )}

        {catalogMode === 'sync' && (
          <button
            type="button"
            onClick={handleClearSyncedCatalog}
            disabled={syncing || clearing}
            className="btn btn-secondary inline-flex items-center gap-2 text-red-300 border-red-500/30 hover:border-red-500/50"
          >
            {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {t.g2bulkRemoveSynced}
          </button>
        )}

        {syncing && (
          <button
            type="button"
            onClick={handleCancelSync}
            className="btn btn-secondary inline-flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            {t.cancel}
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
              {formatMessage(t.g2bulkSyncProgress, {
                games: syncProgress.gamesSynced,
                offers: syncProgress.offersSynced,
              })}
            </p>
          )}
        </div>
      )}

      {syncResult?.errors?.length > 0 && (
        <div className="text-xs text-amber-300/90 space-y-1 max-h-32 overflow-y-auto">
          <p className="font-medium">{t.g2bulkSyncWarnings}</p>
          {syncResult.errors.map((msg) => (
            <p key={msg} className="font-mono opacity-90">{msg}</p>
          ))}
        </div>
      )}
    </SectionCard>
  );

  const connectionSections = (
    <>
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          icon={Key}
          title={t.g2bulkApiConnection}
          description={t.g2bulkApiConnectionDesc}
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
            placeholder={t.g2bulkNewApiKeyPlaceholder}
            className="input w-full font-mono text-sm"
          />
          <p className="text-xs text-[var(--text-muted)]">{apiKeyHint()}</p>

          {walletEnabled && (
            <G2bulkWalletCard
              balance={testResult?.ok ? testResult.balance : g2bulkWallet?.balance}
              username={testResult?.ok ? testResult.username : g2bulkWallet?.username}
              loading={walletLoading || testing}
              error={testResult && !testResult.ok ? testResult.message : walletError}
              idle={!walletFetched}
              lang={lang}
              onRefresh={() => refreshG2bulkWallet()}
            />
          )}

          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="btn btn-secondary w-full sm:w-auto inline-flex items-center justify-center gap-2"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {t.testConnection}
          </button>
        </SectionCard>

        <SectionCard
          icon={Store}
          title={t.g2bulkStorefront}
          description={t.g2bulkStorefrontDesc}
        >
          <div>
            <label className="block text-sm font-medium mb-1.5">
              {t.g2bulkMarkup}
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
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/30 px-4 py-3 space-y-3 max-w-xl">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={!!form.g2bulk_charm_pricing_enabled}
                onChange={(e) => setForm((p) => ({ ...p, g2bulk_charm_pricing_enabled: e.target.checked }))}
                className="rounded border-[var(--border)] mt-0.5"
              />
              <span className="text-sm leading-relaxed">
                <span className="font-medium text-[var(--text-primary)] block">{t.g2bulkCharmPricing}</span>
                <span className="text-[var(--text-muted)]">{t.g2bulkCharmPricingHelp}</span>
              </span>
            </label>
            <div className="text-xs text-[var(--text-sec)] space-y-1 font-mono">
              {charmPreview.map((row) => (
                <div key={row.plain}>
                  ${row.plain.toFixed(2)} → ${row.charm.toFixed(2)}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={handleApplyCharmPricing}
              disabled={applyingCharm || saving}
              className="btn btn-secondary text-sm inline-flex items-center gap-2"
            >
              {applyingCharm ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {t.g2bulkApplyCharmPricing}
            </button>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.g2bulk_catalog_only}
              onChange={(e) => setForm((p) => ({ ...p, g2bulk_catalog_only: e.target.checked }))}
              className="rounded border-[var(--border)]"
              disabled={catalogMode === 'live'}
            />
            <span className="text-sm">
              {t.g2bulkCatalogOnly}
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
              {t.g2bulkEnabled}
            </span>
          </label>
        </SectionCard>
      </div>

      <SectionCard
        icon={CalendarClock}
        title={t.g2bulkScheduledSync}
        description={t.g2bulkScheduledSyncDesc}
      >
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.g2bulk_auto_sync_enabled}
            onChange={(e) => setForm((p) => ({ ...p, g2bulk_auto_sync_enabled: e.target.checked }))}
            className="rounded border-[var(--border)]"
          />
          <span className="text-sm font-medium">
            {t.g2bulkEnableDailySync}
          </span>
        </label>

        {form.g2bulk_auto_sync_enabled && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[var(--accent)]" />
                {t.g2bulkSyncTime}
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
                {t.g2bulkTimezone}
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
            {t.g2bulkNextRun}{' '}
            <span className="text-[var(--text-sec)]">{scheduleLabel}</span>
            {' · '}
            {t.g2bulkEveryDayNote}
          </p>
        )}
      </SectionCard>
    </>
  );

  return (
    <div className={`space-y-6 ${embedded ? 'max-w-none' : 'max-w-4xl'}`}>
      {!embedded && (
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-3 rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)]">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold">
              {t.g2bulkTitle}
            </h2>
            <p className="text-sm text-[var(--text-sec)] mt-1 max-w-xl">
              {t.g2bulkCatalogDesc}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill
            ok={form.g2bulk_api_key_set}
            label={form.g2bulk_api_key_set ? t.g2bulkApiConfigured : t.g2bulkApiNotSet}
          />
          <StatusPill
            ok={!!form.g2bulk_last_sync_at}
            label={form.g2bulk_last_sync_at ? t.g2bulkSynced : t.g2bulkNeverSynced}
          />
        </div>
      </header>
      )}

      {embedded && (
        <div className="rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="p-2.5 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)] shrink-0">
                <Zap className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold">{t.g2bulkTitle}</h2>
                <p className="text-sm text-[var(--text-sec)] mt-0.5">{t.g2bulkCatalogDesc}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusPill
                ok={form.g2bulk_api_key_set}
                label={form.g2bulk_api_key_set ? t.g2bulkApiConfigured : t.g2bulkApiNotSet}
              />
              <StatusPill
                ok={!!form.g2bulk_last_sync_at}
                label={form.g2bulk_last_sync_at ? t.g2bulkSynced : t.g2bulkNeverSynced}
              />
            </div>
          </div>
        </div>
      )}

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

      {embedded ? (
        <>
          {catalogHealthSection}
          <details className="g2bulk-embedded-advanced rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)]/40 overflow-hidden group">
            <summary className="cursor-pointer list-none px-4 py-3 sm:px-5 sm:py-4 flex items-center justify-between gap-3 touch-manipulation">
              <span className="font-semibold text-sm text-[var(--text-primary)]">
                {t.g2bulkApiConnection} · {t.g2bulkScheduledSync}
              </span>
              <span className="text-xs text-[var(--text-muted)] group-open:hidden">{t.saveSettings}</span>
            </summary>
            <div className="px-4 pb-5 sm:px-5 space-y-6 border-t border-[var(--border)] pt-4">
              {connectionSections}
            </div>
          </details>
        </>
      ) : (
        <>
          {connectionSections}
          {catalogHealthSection}
        </>
      )}

      <div className="flex flex-wrap gap-3 pt-2 border-t border-[var(--border)]">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary inline-flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t.saveSettings}
        </button>
        <p className="text-xs text-[var(--text-muted)] self-center flex items-center gap-1.5">
          <Truck className="w-3.5 h-3.5" />
          {t.g2bulkSaveSettingsHint}
        </p>
      </div>

      <G2bulkPullPanel
        open={pullPanelOpen}
        onClose={() => setPullPanelOpen(false)}
        t={t}
        catalogMode={catalogMode}
        initialSelection={pullSelection}
        onLoaded={handlePullSelectionLoaded}
        onSaved={handlePullSelectionSaved}
        onSaveAndSync={handleSaveAndSyncSelection}
      />

      <ConfirmDialog
        open={showClearConfirm}
        title={t.g2bulkClearCatalogTitle}
        message={t.g2bulkClearCatalogConfirm}
        confirmLabel={t.g2bulkRemoveSynced}
        cancelLabel={t.cancel}
        loading={clearing}
        onConfirm={confirmClearSyncedCatalog}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}