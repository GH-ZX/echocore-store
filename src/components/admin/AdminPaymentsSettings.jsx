import { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  Loader2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Save,
} from 'lucide-react';
import { fetchStoreSettings, saveStoreSettings } from '../../lib/storeSettings';
import { fetchSamApiSettings, saveSamApiSettings } from '../../lib/samApi';
import { uploadImage } from '../../lib/uploadImage';
import AdminSamApiSettings from './AdminSamApiSettings';
import AdminManualBalanceCredit from './AdminManualBalanceCredit';

function ManualWalletSection({
  title,
  help,
  qrLabel,
  payCodeLabel,
  payCodeHelp,
  payCodePlaceholder,
  enableLabel,
  enableHelp,
  qrImageUrl,
  payCode,
  enabled,
  uploading,
  onQrUpload,
  onPayCodeChange,
  onEnabledChange,
}) {
  return (
    <div className="space-y-4 p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)]">
      <div>
        <h3 className="font-bold text-sm">{title}</h3>
        <p className="text-xs text-[var(--text-sec)] mt-1">{help}</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1.5">{qrLabel}</label>
          <input type="file" accept="image/*" onChange={onQrUpload} className="w-full text-sm" />
          {uploading && <p className="text-xs text-[var(--text-muted)] mt-1">…</p>}
          {qrImageUrl && (
            <img
              src={qrImageUrl}
              alt=""
              className="mt-3 max-w-[180px] rounded-xl border border-[var(--border)] bg-white p-2"
            />
          )}
        </div>
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1.5">{payCodeLabel}</label>
          <input
            type="text"
            value={payCode}
            onChange={onPayCodeChange}
            placeholder={payCodePlaceholder}
            className="w-full bg-[var(--bg-surface)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-3 font-mono text-sm outline-none"
          />
          <p className="text-[10px] text-[var(--text-muted)] mt-1.5">{payCodeHelp}</p>
        </div>
      </div>
      <label className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={onEnabledChange}
          className="w-4 h-4 accent-[var(--accent)]"
        />
        <div>
          <div className="font-semibold text-sm">{enableLabel}</div>
          <div className="text-xs text-[var(--text-muted)]">{enableHelp}</div>
        </div>
      </label>
    </div>
  );
}

export default function AdminPaymentsSettings({ t = {}, lang = 'ar', onSaved, onNotify }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [shamQrUploading, setShamQrUploading] = useState(false);
  const [syriatelQrUploading, setSyriatelQrUploading] = useState(false);

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

  const [form, setForm] = useState({
    shamcash_enabled: true,
    shamcash_merchant_name: 'ECHOCORE Store',
    shamcash_qr_image_url: '',
    shamcash_pay_code: '',
    syriatel_enabled: false,
    syriatel_qr_image_url: '',
    syriatel_pay_code: '',
  });

  const isApiMode = samForm.sam_wallet_mode === 'api';
  const apiKeyLocked = !!samForm.sam_api_key_set;

  const notifyError = useCallback((message) => {
    if (message) setError(message);
    else setError('');
  }, []);

  const notifySuccess = useCallback((message) => {
    if (!message) return;
    setSuccess(message);
    setTimeout(() => setSuccess(''), 3000);
  }, []);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [data, samData] = await Promise.all([
        fetchStoreSettings(),
        fetchSamApiSettings(),
      ]);

      setForm({
        shamcash_enabled: data.shamcash_enabled ?? true,
        shamcash_merchant_name: data.shamcash_merchant_name || 'ECHOCORE Store',
        shamcash_qr_image_url: data.shamcash_qr_image_url || '',
        shamcash_pay_code: data.shamcash_pay_code || '',
        syriatel_enabled: data.syriatel_enabled ?? false,
        syriatel_qr_image_url: data.syriatel_qr_image_url || '',
        syriatel_pay_code: data.syriatel_pay_code || '',
      });

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
  };

  useEffect(() => {
    load();
  }, []);

  const handleSaveAll = async (regenerateWebhookSecret = false) => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await saveStoreSettings({
        shamcash_enabled: form.shamcash_enabled,
        shamcash_merchant_name: form.shamcash_merchant_name,
        shamcash_qr_image_url: form.shamcash_qr_image_url,
        shamcash_pay_code: form.shamcash_pay_code,
        syriatel_enabled: form.syriatel_enabled,
        syriatel_qr_image_url: form.syriatel_qr_image_url,
        syriatel_pay_code: form.syriatel_pay_code,
        binance_enabled: false,
        mastercard_enabled: false,
      });

      const settings = await saveSamApiSettings({
        enabled: isApiMode ? samForm.sam_api_enabled : false,
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

      setSuccess(t.paymentSettingsSaved);
      onSaved?.();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || t.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleQrUpload = async (e, field, setUploading, folder) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const url = await uploadImage(file, folder);
      if (url) setForm((p) => ({ ...p, [field]: url }));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  if (loading) {
    return (
      <div className="card p-10 text-center text-[var(--text-sec)]">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card p-5 sm:p-6 border-[var(--accent)]/20">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-black flex items-center gap-2">
              <Wallet className="w-5 h-5 text-[var(--accent)]" />
              {t.paymentsTab}
            </h2>
            <p className="text-sm text-[var(--text-sec)] mt-1 max-w-2xl">
              {t.paymentsScreenHelp}
            </p>
          </div>
        </div>

        <div className="mb-6 p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)]">
          <label className="text-xs text-[var(--text-muted)] block mb-2">{t.samWalletModeLabel}</label>
          <div className="flex flex-wrap gap-2">
            {['manual', 'api'].map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSamForm((p) => ({ ...p, sam_wallet_mode: mode }))}
                className={`action-chip text-sm ${samForm.sam_wallet_mode === mode ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10' : ''}`}
              >
                {mode === 'manual' ? t.samWalletModeManual : t.samWalletModeApi}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="text-xs text-[var(--text-muted)] block mb-1.5">{t.merchantDisplayNameCustomer}</label>
          <input
            type="text"
            value={form.shamcash_merchant_name}
            onChange={(e) => setForm((p) => ({ ...p, shamcash_merchant_name: e.target.value }))}
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-3 outline-none"
          />
        </div>

        {!isApiMode ? (
          <div className="space-y-4 pt-2 border-t border-[var(--border)]">
            <p className="text-sm text-[var(--text-sec)] pt-4">{t.syriaManualPaymentsHelp}</p>

            <ManualWalletSection
              title={t.shamcashManualTitle}
              help={t.shamcashManualHelp}
              qrLabel={t.shamcashQrImage}
              payCodeLabel={t.shamcashPayCodeLabel}
              payCodeHelp={t.shamcashPayCodeHelp}
              payCodePlaceholder={t.shamcashPayCodePlaceholder}
              enableLabel={t.enableShamcash}
              enableHelp={t.enableShamcashManualHelp}
              qrImageUrl={form.shamcash_qr_image_url}
              payCode={form.shamcash_pay_code}
              enabled={form.shamcash_enabled}
              uploading={shamQrUploading}
              onQrUpload={(e) => handleQrUpload(e, 'shamcash_qr_image_url', setShamQrUploading, 'shamcash-qr')}
              onPayCodeChange={(e) => setForm((p) => ({ ...p, shamcash_pay_code: e.target.value }))}
              onEnabledChange={(e) => setForm((p) => ({ ...p, shamcash_enabled: e.target.checked }))}
            />

            <ManualWalletSection
              title={t.syriatelManualTitle}
              help={t.syriatelManualHelp}
              qrLabel={t.syriatelQrImage}
              payCodeLabel={t.syriatelPayCodeLabel}
              payCodeHelp={t.syriatelPayCodeHelp}
              payCodePlaceholder={t.syriatelPayCodePlaceholder}
              enableLabel={t.enableSyriatel}
              enableHelp={t.enableSyriatelManualHelp}
              qrImageUrl={form.syriatel_qr_image_url}
              payCode={form.syriatel_pay_code}
              enabled={form.syriatel_enabled}
              uploading={syriatelQrUploading}
              onQrUpload={(e) => handleQrUpload(e, 'syriatel_qr_image_url', setSyriatelQrUploading, 'syriatel-qr')}
              onPayCodeChange={(e) => setForm((p) => ({ ...p, syriatel_pay_code: e.target.value }))}
              onEnabledChange={(e) => setForm((p) => ({ ...p, syriatel_enabled: e.target.checked }))}
            />

            <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => handleSaveAll(false)}
                disabled={saving}
                className="btn btn-primary action-chip gap-2 !border-0"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t.saveSettings}
              </button>
              <button type="button" onClick={load} className="action-chip gap-2">
                <RefreshCw className="w-4 h-4" />
                {t.refresh}
              </button>
            </div>
          </div>
        ) : (
          <AdminSamApiSettings
            t={t}
            samForm={samForm}
            setSamForm={setSamForm}
            onSaved={onSaved}
            onError={notifyError}
            onSuccess={notifySuccess}
            saving={saving}
            onSaveAll={handleSaveAll}
          />
        )}

        {isApiMode && (
          <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-[var(--border)]">
            {apiKeyLocked && (
              <button
                type="button"
                onClick={() => handleSaveAll(false)}
                disabled={saving}
                className="btn btn-primary action-chip gap-2 !border-0"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t.saveSettings}
              </button>
            )}
            <button type="button" onClick={load} className="action-chip gap-2">
              <RefreshCw className="w-4 h-4" />
              {t.refresh}
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-sm">
            <CheckCircle className="w-4 h-4" />
            {success}
          </div>
        )}
      </div>

      <AdminManualBalanceCredit
        t={t}
        lang={lang}
        onNotify={onNotify}
        className="mb-6"
      />

      <div className="card p-5 sm:p-6 opacity-80">
        <h3 className="font-bold mb-3">{t.otherPaymentMethods}</h3>
        <div className="space-y-2 text-sm text-[var(--text-sec)]">
          <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)]">
            <span>Binance Pay (USDT)</span>
            <span className="text-xs px-2 py-1 rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)]">{t.comingSoon}</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)]">
            <span>MasterCard / Visa</span>
            <span className="text-xs px-2 py-1 rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)]">{t.comingSoon}</span>
          </div>
        </div>
      </div>
    </div>
  );
}