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
  g2bulkGetMe,
  syncG2bulkCatalog,
  clearG2bulkSyncedCatalog,
} from '../../lib/g2bulk';
import { countPullSelection, normalizePullSelection } from '../../lib/pullCatalogUtils';
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

export default function AdminG2BulkSettings({ t = {}, lang = 'ar', onCatalogSynced }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [pullPanelOpen, setPullPanelOpen] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const [includeVouchers, setIncludeVouchers] = useState(true);
  const syncAbortRef = useRef(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [pullSelection, setPullSelection] = useState(normalizePullSelection());

  const [form, setForm] = useState({
    g2bulk_enabled: false,
    g2bulk_markup_percent: 15,
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

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchG2bulkSettings();
      setForm({
        g2bulk_enabled: data.g2bulk_enabled ?? false,
        g2bulk_markup_percent: data.g2bulk_markup_percent ?? 15,
        g2bulk_catalog_only: data.g2bulk_catalog_only ?? true,
        g2bulk_catalog_mode: data.g2bulk_catalog_mode || 'sync',
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
      catalogMode: payload.g2bulk_catalog_mode,
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
      setSuccess(t.g2bulkSettingsSaved);
      await load();
      await onCatalogSynced?.(form.g2bulk_catalog_only);
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

  const pullCounts = useMemo(
    () => countPullSelection(pullSelection, { includeGiftCards: includeVouchers }),
    [pullSelection, includeVouchers],
  );

  const catalogNeverSynced = !form.g2bulk_last_sync_at;
  const hasAnyPullSelection = pullCounts.total > 0;
  const hasSyncableSelection = (
    pullCounts.syncGames + pullCounts.accounts + pullCounts.giftCards
  ) > 0;

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

  const handleSyncCatalog = async () => {
    if (!hasSyncableSelection) {
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
        includeVouchers,
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

  return (
    <div className="space-y-6 max-w-4xl">
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
          <div>
            <label className="block text-sm font-medium mb-1.5">
              {t.g2bulkCatalogSource}
            </label>
            <select
              value={form.g2bulk_catalog_mode || 'sync'}
              onChange={(e) => setForm((p) => ({ ...p, g2bulk_catalog_mode: e.target.value }))}
              className="input w-full max-w-md"
            >
              <option value="sync">
                {t.g2bulkCatalogModeSync}
              </option>
              <option value="live">
                {t.g2bulkCatalogModeLive}
              </option>
              <option value="hybrid">
                {t.g2bulkCatalogModeHybrid}
              </option>
            </select>
            <p className="text-xs text-[var(--text-muted)] mt-1.5 max-w-xl">
              {form.g2bulk_catalog_mode === 'hybrid'
                ? t.g2bulkCatalogModeHybridHelp
                : form.g2bulk_catalog_mode === 'live'
                ? t.g2bulkCatalogModeLiveHelp
                : t.g2bulkCatalogModeSyncHelp}
            </p>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.g2bulk_catalog_only}
              onChange={(e) => setForm((p) => ({ ...p, g2bulk_catalog_only: e.target.checked }))}
              className="rounded border-[var(--border)]"
              disabled={form.g2bulk_catalog_mode === 'live'}
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
        icon={Package}
        accent
        title={t.g2bulkCatalogHealth}
        description={t.g2bulkCatalogHealthDesc}
      >
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
                <div className="text-xs text-[var(--text-muted)] mt-1 space-y-0.5">
                  {hasAnyPullSelection && (
                    <div>
                      {t.g2bulkSelected}{' '}
                      {pullCounts.games} {t.g2bulkGamesUnit}
                      {' ('}
                      {pullCounts.syncGames} {t.g2bulkSyncedUnit}
                      {' · '}
                      {pullCounts.liveGames} {t.g2bulkLiveUnit}
                      {')'}
                      {' · '}
                      {pullCounts.accounts} {t.g2bulkAccountsUnit}
                      {includeVouchers && (
                        <>
                          {' · '}
                          {pullCounts.giftCards} {t.g2bulkGiftCardsUnit}
                        </>
                      )}
                      {pullCounts.carousel > 0 && (
                        <>
                          {' · '}
                          {pullCounts.carousel} {t.g2bulkCarouselUnit}
                        </>
                      )}
                      {form.g2bulk_catalog_mode && (
                        <>
                          {' · '}
                          {form.g2bulk_catalog_mode === 'hybrid'
                            ? t.g2bulkHybridMode
                            : form.g2bulk_catalog_mode === 'live'
                              ? t.g2bulkLiveMode
                              : t.g2bulkSyncMode}
                        </>
                      )}
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
          </ul>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={includeVouchers}
            onChange={(e) => setIncludeVouchers(e.target.checked)}
            className="rounded border-[var(--border)]"
            disabled={syncing || clearing}
          />
          <span className="text-sm">
            {t.g2bulkIncludeVouchers}
          </span>
        </label>

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

          <button
            type="button"
            onClick={handleClearSyncedCatalog}
            disabled={syncing || clearing}
            className="btn btn-secondary inline-flex items-center gap-2 text-red-300 border-red-500/30 hover:border-red-500/50"
          >
            {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {t.g2bulkRemoveSynced}
          </button>

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
        lang={lang}
        includeGiftCards={includeVouchers}
        initialSelection={pullSelection}
        onLoaded={(selection, catalogMode) => {
          setPullSelection(normalizePullSelection(selection || {}));
          if (catalogMode) {
            setForm((prev) => ({ ...prev, g2bulk_catalog_mode: catalogMode }));
          }
        }}
        onSaved={(selection, catalogMode) => {
          setPullSelection(normalizePullSelection(selection || {}));
          if (catalogMode) {
            setForm((prev) => ({ ...prev, g2bulk_catalog_mode: catalogMode }));
          }
          setSuccess(t.g2bulkPullSelectionSaved);
          onCatalogSynced?.(form.g2bulk_catalog_only);
          setTimeout(() => setSuccess(''), 3000);
        }}
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