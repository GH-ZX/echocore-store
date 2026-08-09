import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Bitcoin,
  CheckCircle,
  ExternalLink,
  Loader2,
  RefreshCw,
  Save,
} from 'lucide-react';
import { Spinner } from '../routing/PageLoader';
import AdminApiKeyField from './AdminApiKeyField';
import ConfirmDialog from '../ui/ConfirmDialog';
import {
  fetchBinancePaySettings,
  saveBinancePaySettings,
} from '../../lib/binancePay';

function Toggle({ checked, onChange, label, hint, disabled }) {
  return (
    <label className={`flex items-start gap-3 cursor-pointer rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3.5 py-3 ${disabled ? 'opacity-50' : ''}`}>
      <span className="relative inline-flex shrink-0 mt-0.5">
        <input
          type="checkbox"
          checked={!!checked}
          onChange={(e) => !disabled && onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only peer"
        />
        <span className="w-9 h-5 rounded-full bg-[var(--border)] peer-checked:bg-emerald-500/70 transition-colors" />
        <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        {hint ? <span className="block text-xs text-[var(--text-muted)] mt-0.5">{hint}</span> : null}
      </span>
    </label>
  );
}

export default function AdminBinanceSettings({ t = {}, onNotify, embedded = false }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiKeySet, setApiKeySet] = useState(false);
  const [apiKeyMasked, setApiKeyMasked] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [apiSecretSet, setApiSecretSet] = useState(false);
  const [certSn, setCertSn] = useState('');
  const [certSnSet, setCertSnSet] = useState(false);
  const [certSnMasked, setCertSnMasked] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [deleteKeyOpen, setDeleteKeyOpen] = useState(false);
  const [deletingKey, setDeletingKey] = useState(false);

  const keyLocked = apiKeySet;
  const secretLocked = apiSecretSet;
  const ready = apiKeySet && apiSecretSet;

  const applySettings = useCallback((s) => {
    setEnabled(!!(s.binance_enabled && s.binance_api_enabled));
    setApiKeySet(!!s.binance_api_key_set);
    setApiKeyMasked(s.binance_api_key_masked || '');
    setApiSecretSet(!!s.binance_api_secret_set);
    setCertSnSet(!!s.binance_cert_sn_set);
    setCertSnMasked(s.binance_cert_sn_masked || '');
    setMerchantId(s.binance_merchant_id || '');
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const s = await fetchBinancePaySettings();
      applySettings(s);
      setApiKey('');
      setApiSecret('');
      setCertSn('');
    } catch (err) {
      setError(err.message || t.binanceLoadFailed);
    } finally {
      setLoading(false);
    }
  }, [applySettings, t.binanceLoadFailed]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (e) => {
    e?.preventDefault?.();
    setSaving(true);
    setError('');
    try {
      const s = await saveBinancePaySettings({
        enabled,
        apiEnabled: enabled,
        apiKey: keyLocked ? undefined : (apiKey.trim() || undefined),
        apiSecret: secretLocked ? undefined : (apiSecret.trim() || undefined),
        certSn: certSn.trim() || undefined,
        merchantId: merchantId.trim() || undefined,
      });
      applySettings(s);
      setApiKey('');
      setApiSecret('');
      setCertSn('');
      onNotify?.(t.binanceSaved, 'success');
    } catch (err) {
      setError(err.message || t.binanceSaveFailed);
      onNotify?.(err.message || t.binanceSaveFailed, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteKey = async () => {
    setDeletingKey(true);
    try {
      const s = await saveBinancePaySettings({ enabled: false, apiEnabled: false, clearApiKey: true, clearApiSecret: true });
      applySettings(s);
      setDeleteKeyOpen(false);
      onNotify?.(t.binanceKeysCleared, 'success');
    } catch (err) {
      setError(err.message || t.binanceSaveFailed);
    } finally {
      setDeletingKey(false);
    }
  };

  if (loading) {
    return (
      <div className="py-8 text-center">
        <Spinner size="md" className="mx-auto text-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!embedded && (
        <div className="flex items-start gap-3">
          <span className="p-2 rounded-xl shrink-0 bg-[#FCD535]/10 text-[#FCD535]">
            <Bitcoin className="w-5 h-5" />
          </span>
          <div>
            <h3 className="font-semibold text-base">{t.binanceApiTitle}</h3>
            <p className="text-sm text-[var(--text-sec)] mt-0.5">{t.binanceApiHelp}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="min-w-0">{error}</span>
        </div>
      )}

      <div className="flex items-center gap-2 text-xs">
        {ready ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
            <CheckCircle className="w-3.5 h-3.5" /> {t.binanceConfigured}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300">
            <AlertCircle className="w-3.5 h-3.5" /> {t.binanceNotConfigured}
          </span>
        )}
        <a
          href="https://developers.binance.com/docs/binance-pay"
          target="_blank"
          rel="noopener noreferrer"
          className="action-chip text-[10px] gap-1 ms-auto"
        >
          <ExternalLink className="w-3 h-3" /> {t.binanceApiDocs}
        </a>
      </div>

      <Toggle
        checked={enabled}
        onChange={setEnabled}
        label={t.binanceEnableLabel}
        hint={t.binanceEnableHint}
        disabled={!ready}
      />

      <AdminApiKeyField
        t={t}
        id="binance-api-key"
        title={t.binanceApiKeyLabel}
        description={t.binanceApiKeyHelp}
        locked={keyLocked}
        maskedValue={apiKeyMasked}
        value={apiKey}
        onChange={setApiKey}
        placeholder={t.binanceApiKeyPlaceholder}
        onDelete={keyLocked ? () => setDeleteKeyOpen(true) : undefined}
        deleteLabel={t.binanceDeleteKey}
        hint={t.binanceApiKeyHint}
      />

      <AdminApiKeyField
        t={t}
        id="binance-api-secret"
        title={t.binanceApiSecretLabel}
        description={t.binanceApiSecretHelp}
        locked={secretLocked}
        value={apiSecret}
        onChange={setApiSecret}
        placeholder={t.binanceApiSecretPlaceholder}
        hint={t.binanceApiSecretHint}
      />

      <div className="admin-api-key-card">
        <div className="admin-api-key-card__head">
          <span className="admin-api-key-card__icon" aria-hidden>
            <Bitcoin className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h4 className="admin-api-key-card__title">{t.binanceCertSnLabel}</h4>
            <p className="admin-api-key-card__desc">{t.binanceCertSnHelp}</p>
          </div>
          {certSnSet && <span className="text-[10px] text-[var(--text-muted)] font-mono">{certSnMasked}</span>}
        </div>
        <input
          id="binance-cert-sn"
          type="text"
          value={certSn}
          onChange={(e) => setCertSn(e.target.value)}
          placeholder={t.binanceCertSnPlaceholder}
          autoComplete="off"
          dir="ltr"
          className="admin-api-key-card__input font-mono"
        />
      </div>

      <div className="admin-api-key-card">
        <div className="admin-api-key-card__head">
          <span className="admin-api-key-card__icon" aria-hidden>
            <Bitcoin className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h4 className="admin-api-key-card__title">{t.binanceMerchantIdLabel}</h4>
            <p className="admin-api-key-card__desc">{t.binanceMerchantIdHelp}</p>
          </div>
        </div>
        <input
          id="binance-merchant-id"
          type="text"
          value={merchantId}
          onChange={(e) => setMerchantId(e.target.value)}
          placeholder={t.binanceMerchantIdPlaceholder}
          autoComplete="off"
          dir="ltr"
          className="admin-api-key-card__input font-mono"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary text-sm py-2 px-4 inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t.save || t.binanceSave}
        </button>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="btn btn-secondary text-sm py-2 px-3 inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" /> {t.refresh || t.binanceRefresh}
        </button>
      </div>

      {/* Instructions */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 space-y-2 text-sm text-[var(--text-sec)]">
        <h4 className="font-semibold text-[var(--text-primary)]">{t.binanceInstructionsTitle}</h4>
        <ol className="list-decimal list-inside space-y-1.5 text-xs leading-relaxed">
          <li>{t.binanceStep1}</li>
          <li>{t.binanceStep2}</li>
          <li>{t.binanceStep3}</li>
          <li>{t.binanceStep4}</li>
          <li>{t.binanceStep5}</li>
        </ol>
        <p className="text-[11px] text-[var(--text-muted)] pt-1">{t.binanceSecurityNote}</p>
      </div>

      <ConfirmDialog
        open={deleteKeyOpen}
        title={t.binanceDeleteKeyTitle}
        message={t.binanceDeleteKeyConfirm}
        confirmLabel={t.delete || t.binanceDeleteKey}
        cancelLabel={t.cancel}
        loading={deletingKey}
        onConfirm={handleDeleteKey}
        onCancel={() => !deletingKey && setDeleteKeyOpen(false)}
      />
    </div>
  );
}