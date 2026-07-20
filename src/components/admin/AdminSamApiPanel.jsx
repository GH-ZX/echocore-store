import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Loader2, RefreshCw, Save, Smartphone } from 'lucide-react';
import { fetchSamApiSettings, saveSamApiSettings } from '../../lib/samApi';
import AdminSamApiSettings from './AdminSamApiSettings';

/**
 * Self-contained Sam API settings (API keys, wallets, SYP rate).
 * Used on the APIs hub; payments page keeps manual QR methods only.
 */
export default function AdminSamApiPanel({ t = {}, onSaved, onNotify, embedded = false }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [samForm, setSamForm] = useState({
    sam_api_enabled: false,
    sam_wallet_mode: 'manual',
    sam_shamcash_wallet_identifier: '',
    sam_syriatel_wallet_identifier: '',
    sam_invoice_currency: 'USD',
    sam_syp_per_usd: 135,
    sam_api_key: '',
    sam_api_key_set: false,
    sam_api_key_masked: '',
    webhookUrl: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const samData = await fetchSamApiSettings();
      setSamForm({
        sam_api_enabled: samData.sam_api_enabled ?? false,
        sam_wallet_mode: samData.sam_wallet_mode || 'manual',
        sam_shamcash_wallet_identifier: samData.sam_shamcash_wallet_identifier || '',
        sam_syriatel_wallet_identifier: samData.sam_syriatel_wallet_identifier || '',
        sam_invoice_currency: samData.sam_invoice_currency || 'USD',
        sam_syp_per_usd: samData.sam_syp_per_usd ?? 135,
        sam_api_key: '',
        sam_api_key_set: !!samData.sam_api_key_set,
        sam_api_key_masked: samData.sam_api_key_masked || '',
        webhookUrl: samData.webhookUrl || '',
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaveAll = async (regenerateWebhookSecret = false) => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const settings = await saveSamApiSettings({
        enabled: samForm.sam_api_enabled,
        walletMode: samForm.sam_wallet_mode,
        shamcashWalletIdentifier: samForm.sam_shamcash_wallet_identifier,
        syriatelWalletIdentifier: samForm.sam_syriatel_wallet_identifier,
        invoiceCurrency: samForm.sam_invoice_currency,
        sypPerUsd: samForm.sam_syp_per_usd,
        apiKey: samForm.sam_api_key?.trim() ? samForm.sam_api_key : undefined,
        regenerateWebhookSecret,
      });
      setSamForm((prev) => ({
        ...prev,
        sam_api_key: '',
        sam_api_enabled: settings.sam_api_enabled ?? prev.sam_api_enabled,
        sam_wallet_mode: settings.sam_wallet_mode || prev.sam_wallet_mode,
        sam_shamcash_wallet_identifier: settings.sam_shamcash_wallet_identifier || prev.sam_shamcash_wallet_identifier,
        sam_syriatel_wallet_identifier: settings.sam_syriatel_wallet_identifier || prev.sam_syriatel_wallet_identifier,
        sam_invoice_currency: settings.sam_invoice_currency || prev.sam_invoice_currency,
        sam_syp_per_usd: settings.sam_syp_per_usd ?? prev.sam_syp_per_usd,
        sam_api_key_set: !!settings.sam_api_key_set,
        sam_api_key_masked: settings.sam_api_key_masked || prev.sam_api_key_masked,
        webhookUrl: settings.webhookUrl || prev.webhookUrl,
      }));
      setSuccess(t.paymentSettingsSaved || t.igdbSaved);
      onNotify?.(t.paymentSettingsSaved || t.igdbSaved, 'success');
      onSaved?.();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || t.saveFailed);
      onNotify?.(err.message || t.saveFailed, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-apis-section-body py-10 text-center">
        <Loader2 className="w-7 h-7 animate-spin mx-auto text-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!embedded && (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              samForm.sam_api_key_set
                ? 'border-green-500/30 bg-green-500/10 text-green-300'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${samForm.sam_api_key_set ? 'bg-green-400' : 'bg-amber-300'}`} />
            {samForm.sam_api_key_set ? t.samApiKeyConfigured || t.igdbConfigured : t.samApiKeyNotSet || t.igdbNotConfigured}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-[var(--border)] text-[var(--text-sec)]">
            <Smartphone className="w-3 h-3" />
            {samForm.sam_wallet_mode === 'api' ? t.samWalletModeApi : t.samWalletModeManual}
          </span>
        </div>
      )}

      <AdminSamApiSettings
        t={t}
        samForm={samForm}
        setSamForm={setSamForm}
        onSaved={onSaved}
        onError={(msg) => { setError(msg || ''); if (msg) onNotify?.(msg, 'error'); }}
        onSuccess={(msg) => { setSuccess(msg || ''); if (msg) onNotify?.(msg, 'success'); }}
        saving={saving}
        onSaveAll={handleSaveAll}
      />

      <div className="flex flex-col-reverse sm:flex-row flex-wrap gap-2 pt-2">
        <button
          type="button"
          onClick={() => handleSaveAll(false)}
          disabled={saving}
          className="btn btn-primary gap-2 text-sm py-2.5 px-4 w-full sm:w-auto justify-center"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t.saveSettings}
        </button>
        <button
          type="button"
          onClick={load}
          disabled={saving}
          className="btn btn-secondary gap-2 text-sm py-2.5 px-4 w-full sm:w-auto justify-center"
        >
          <RefreshCw className="w-4 h-4" />
          {t.refresh}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-sm">
          <CheckCircle className="w-4 h-4" />
          {success}
        </div>
      )}
    </div>
  );
}
