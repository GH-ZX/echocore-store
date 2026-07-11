import { useState, useEffect } from 'react';
import {
  Wallet,
  Link2,
  Loader2,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Save,
  Copy,
} from 'lucide-react';
import { fetchStoreSettings, saveStoreSettings } from '../../lib/storeSettings';
import { fetchSamApiSettings, listSamWallets, saveSamApiSettings } from '../../lib/samApi';
import { uploadImage } from '../../lib/uploadImage';

export default function AdminPaymentsSettings({ t = {}, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [samTesting, setSamTesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [qrUploading, setQrUploading] = useState(false);
  const [samWallets, setSamWallets] = useState([]);

  const [samForm, setSamForm] = useState({
    sam_api_enabled: false,
    sam_wallet_mode: 'manual',
    sam_invoice_method: 'shamcash',
    sam_wallet_identifier: '',
    sam_invoice_currency: 'USD',
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
  });

  const isApiMode = samForm.sam_wallet_mode === 'api';

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
      });

      setSamForm({
        sam_api_enabled: samData.sam_api_enabled ?? false,
        sam_wallet_mode: samData.sam_wallet_mode || 'manual',
        sam_invoice_method: samData.sam_invoice_method || 'shamcash',
        sam_wallet_identifier: samData.sam_wallet_identifier || '',
        sam_invoice_currency: samData.sam_invoice_currency || 'USD',
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
        binance_enabled: false,
        mastercard_enabled: false,
      });

      const settings = await saveSamApiSettings({
        enabled: isApiMode ? samForm.sam_api_enabled : false,
        walletMode: samForm.sam_wallet_mode,
        invoiceMethod: samForm.sam_invoice_method,
        walletIdentifier: samForm.sam_wallet_identifier,
        invoiceCurrency: samForm.sam_invoice_currency,
        apiKey: samForm.sam_api_key?.trim() ? samForm.sam_api_key : undefined,
        regenerateWebhookSecret,
      });

      setSamForm((prev) => ({
        ...prev,
        sam_api_key: '',
        sam_api_enabled: settings.sam_api_enabled ?? prev.sam_api_enabled,
        sam_wallet_mode: settings.sam_wallet_mode || prev.sam_wallet_mode,
        sam_invoice_method: settings.sam_invoice_method || prev.sam_invoice_method,
        sam_wallet_identifier: settings.sam_wallet_identifier || prev.sam_wallet_identifier,
        sam_invoice_currency: settings.sam_invoice_currency || prev.sam_invoice_currency,
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

  const handleSamTestWallets = async () => {
    setSamTesting(true);
    setError('');
    try {
      if (samForm.sam_api_key?.trim()) {
        await saveSamApiSettings({
          enabled: samForm.sam_api_enabled,
          walletMode: samForm.sam_wallet_mode,
          invoiceMethod: samForm.sam_invoice_method,
          walletIdentifier: samForm.sam_wallet_identifier,
          invoiceCurrency: samForm.sam_invoice_currency,
          apiKey: samForm.sam_api_key,
        });
        setSamForm((prev) => ({ ...prev, sam_api_key: '', sam_api_key_set: true }));
      }

      const wallets = await listSamWallets();
      const list = Array.isArray(wallets) ? wallets : [];
      setSamWallets(list);

      if (!samForm.sam_wallet_identifier && list[0]) {
        const first = list[0];
        const identifier = first.walletAddress || first.phone || first.cashCode || first.accountNumber || first.id;
        if (identifier) {
          setSamForm((prev) => ({
            ...prev,
            sam_wallet_identifier: String(identifier),
            sam_invoice_method: first.provider === 'syriatel' ? 'syriatel' : 'shamcash',
          }));
        }
      }
      setSuccess(t.samWalletsLoaded);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSamTesting(false);
    }
  };

  const copyWebhookUrl = async () => {
    if (!samForm.webhookUrl) return;
    try {
      await navigator.clipboard.writeText(samForm.webhookUrl);
      setSuccess(t.copied);
      setTimeout(() => setSuccess(''), 2000);
    } catch {
      setError(t.copyFailed);
    }
  };

  const handleQrUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrUploading(true);
    setError('');
    try {
      const url = await uploadImage(file, 'shamcash-qr');
      if (url) setForm((p) => ({ ...p, shamcash_qr_image_url: url }));
    } catch (err) {
      setError(err.message);
    } finally {
      setQrUploading(false);
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
          {isApiMode && (
            <a
              href="https://sam-api.pro/api-docs"
              target="_blank"
              rel="noopener noreferrer"
              className="action-chip text-xs gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Sam API Docs
            </a>
          )}
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
            <p className="text-sm text-[var(--text-sec)] pt-4">{t.shamcashManualAdminHelp}</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-[var(--text-muted)] block mb-1.5">{t.shamcashQrImage}</label>
                <input type="file" accept="image/*" onChange={handleQrUpload} className="w-full text-sm" />
                {qrUploading && <p className="text-xs text-[var(--text-muted)] mt-1">{t.uploading}</p>}
                {form.shamcash_qr_image_url && (
                  <img
                    src={form.shamcash_qr_image_url}
                    alt="ShamCash QR preview"
                    className="mt-3 max-w-[180px] rounded-xl border border-[var(--border)] bg-white p-2"
                  />
                )}
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)] block mb-1.5">{t.shamcashPayCodeLabel}</label>
                <input
                  type="text"
                  value={form.shamcash_pay_code}
                  onChange={(e) => setForm((p) => ({ ...p, shamcash_pay_code: e.target.value }))}
                  placeholder={t.shamcashPayCodePlaceholder}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-3 font-mono text-sm outline-none"
                />
                <p className="text-[10px] text-[var(--text-muted)] mt-1.5">{t.shamcashPayCodeHelp}</p>
              </div>
            </div>

            <label className="flex items-center gap-3 p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] cursor-pointer">
              <input
                type="checkbox"
                checked={form.shamcash_enabled}
                onChange={(e) => setForm((p) => ({ ...p, shamcash_enabled: e.target.checked }))}
                className="w-4 h-4 accent-[var(--accent)]"
              />
              <div>
                <div className="font-semibold">{t.enableShamcash}</div>
                <div className="text-xs text-[var(--text-muted)]">{t.enableShamcashManualHelp}</div>
              </div>
            </label>
          </div>
        ) : (
          <div className="space-y-4 pt-2 border-t border-[var(--border)]">
            <p className="text-sm text-[var(--text-sec)] pt-4">{t.samApiSectionHelp}</p>

            <label className="flex items-center gap-3 p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] cursor-pointer">
              <input
                type="checkbox"
                checked={samForm.sam_api_enabled}
                onChange={(e) => setSamForm((p) => ({ ...p, sam_api_enabled: e.target.checked }))}
                className="w-4 h-4 accent-[var(--accent)]"
              />
              <div>
                <div className="font-semibold">{t.samApiEnabledLabel}</div>
                <div className="text-xs text-[var(--text-muted)]">{t.samApiEnabledHelp}</div>
              </div>
            </label>

            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1.5">{t.samApiKeyLabel}</label>
              <input
                type="password"
                value={samForm.sam_api_key}
                onChange={(e) => setSamForm((p) => ({ ...p, sam_api_key: e.target.value }))}
                placeholder={samForm.sam_api_key_set ? samForm.sam_api_key_masked : 'sk_...'}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-3 font-mono text-sm outline-none"
                autoComplete="off"
              />
              <p className="text-[10px] text-[var(--text-muted)] mt-1.5">{t.samApiKeyHelp}</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-[var(--text-muted)] block mb-1.5">{t.samInvoiceMethodLabel}</label>
                <select
                  value={samForm.sam_invoice_method}
                  onChange={(e) => setSamForm((p) => ({ ...p, sam_invoice_method: e.target.value }))}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-3 text-sm outline-none"
                >
                  <option value="shamcash">ShamCash</option>
                  <option value="syriatel">Syriatel Cash</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)] block mb-1.5">{t.samInvoiceCurrencyLabel}</label>
                <select
                  value={samForm.sam_invoice_currency}
                  onChange={(e) => setSamForm((p) => ({ ...p, sam_invoice_currency: e.target.value }))}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-3 text-sm outline-none"
                >
                  <option value="USD">USD</option>
                  <option value="SYP">SYP</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1.5">{t.samWalletIdentifierLabel}</label>
              <input
                type="text"
                value={samForm.sam_wallet_identifier}
                onChange={(e) => setSamForm((p) => ({ ...p, sam_wallet_identifier: e.target.value }))}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-3 font-mono text-sm outline-none"
              />
              <p className="text-[10px] text-[var(--text-muted)] mt-1.5">{t.samWalletIdentifierHelp}</p>
              {samWallets.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {samWallets.map((wallet) => {
                    const id = wallet.walletAddress || wallet.phone || wallet.cashCode || wallet.accountNumber || wallet.id;
                    const label = wallet.providerDisplayName || wallet.provider || 'Wallet';
                    return (
                      <button
                        key={String(wallet.id || id)}
                        type="button"
                        onClick={() => setSamForm((p) => ({
                          ...p,
                          sam_wallet_identifier: String(id),
                          sam_invoice_method: wallet.provider === 'syriatel' ? 'syriatel' : 'shamcash',
                        }))}
                        className="action-chip text-xs font-mono"
                      >
                        {label}: {String(id).slice(0, 12)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {samForm.webhookUrl && (
              <div>
                <label className="text-xs text-[var(--text-muted)] block mb-1.5">{t.samWebhookUrlLabel}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={samForm.webhookUrl}
                    className="flex-1 bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-4 py-3 font-mono text-xs outline-none"
                  />
                  <button type="button" onClick={copyWebhookUrl} className="action-chip gap-1.5">
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[10px] text-[var(--text-muted)] mt-1.5">{t.samWebhookUrlHelp}</p>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-[var(--border)]">
          {isApiMode && (
            <button
              type="button"
              onClick={handleSamTestWallets}
              disabled={samTesting || (!samForm.sam_api_key && !samForm.sam_api_key_set)}
              className="action-chip border-green-500/30 text-green-400 hover:bg-green-500/10 disabled:opacity-50"
            >
              {samTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              {t.samTestWallets}
            </button>
          )}
          <button
            type="button"
            onClick={() => handleSaveAll(false)}
            disabled={saving}
            className="btn btn-primary action-chip gap-2 !border-0"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t.saveSettings}
          </button>
          {isApiMode && (
            <button
              type="button"
              onClick={() => handleSaveAll(true)}
              disabled={saving}
              className="action-chip text-xs"
            >
              {t.samRegenerateWebhook}
            </button>
          )}
          <button type="button" onClick={load} className="action-chip gap-2">
            <RefreshCw className="w-4 h-4" />
            {t.refresh}
          </button>
        </div>

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