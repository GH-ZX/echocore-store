import { useState, useEffect } from 'react';
import { Wallet, Link2, Loader2, CheckCircle, AlertCircle, ExternalLink, RefreshCw, Save } from 'lucide-react';
import { fetchStoreSettings, saveStoreSettings } from '../../lib/storeSettings';
import { testShamcashConnection } from '../../lib/shamcashApi';
import { uploadImage } from '../../lib/uploadImage';
export default function AdminPaymentsSettings({ t = {}, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testResult, setTestResult] = useState(null);

  const [qrUploading, setQrUploading] = useState(false);

  const [form, setForm] = useState({
    shamcash_enabled: true,
    shamcash_api_base_url: 'https://api.shamcash-api.com/v1',
    shamcash_api_token: '',
    shamcash_account_id: '',
    shamcash_merchant_name: 'ECHOCORE Store',
    shamcash_qr_image_url: '',
    shamcash_pay_code: '',
    binance_enabled: false,
    mastercard_enabled: false,
  });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchStoreSettings();
      setForm({
        shamcash_enabled: data.shamcash_enabled ?? true,
        shamcash_api_base_url: data.shamcash_api_base_url || 'https://api.shamcash-api.com/v1',
        shamcash_api_token: data.shamcash_api_token || '',
        shamcash_account_id: data.shamcash_account_id || '',
        shamcash_merchant_name: data.shamcash_merchant_name || 'ECHOCORE Store',
        shamcash_qr_image_url: data.shamcash_qr_image_url || '',
        shamcash_pay_code: data.shamcash_pay_code || '',
        binance_enabled: false,
        mastercard_enabled: false,
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

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await saveStoreSettings({
        ...form,
        binance_enabled: false,
        mastercard_enabled: false,
      });
      setSuccess(t.paymentSettingsSaved);
      onSaved?.();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || t.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setError('');
    setTestResult(null);
    try {
      const result = await testShamcashConnection({
        apiBaseUrl: form.shamcash_api_base_url,
        apiToken: form.shamcash_api_token,
        accountId: form.shamcash_account_id,
      });
      setTestResult(result);
      if (result.accountId && !form.shamcash_account_id) {
        setForm((prev) => ({ ...prev, shamcash_account_id: result.accountId }));
      }
      setSuccess(t.shamcashConnected);
    } catch (err) {
      setError(err.message);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="card p-10 text-center text-[var(--text-sec)]">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--accent)]" />
      </div>
    );
  }

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

  return (
    <div className="space-y-6">
      <div className="card p-5 sm:p-6 border-green-500/20">
        <div className="mb-6">
          <h2 className="text-xl font-black flex items-center gap-2">
            <Wallet className="w-5 h-5 text-green-400" />
            {t.shamcashManualTitle}
          </h2>
          <p className="text-sm text-[var(--text-sec)] mt-1 max-w-2xl">
            {t.shamcashManualAdminHelp}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mb-6">
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
            <p className="text-[10px] text-[var(--text-muted)] mt-1.5">
              {t.shamcashPayCodeHelp}
            </p>
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

        <label className="flex items-center gap-3 mb-2 p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] cursor-pointer">
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

        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-[var(--border)]">
          <button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary action-chip gap-2 !border-0">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t.saveSettings}
          </button>
          <button type="button" onClick={load} className="action-chip gap-2">
            <RefreshCw className="w-4 h-4" />
            {t.refresh}
          </button>
        </div>
      </div>

      <div className="card p-5 sm:p-6 opacity-90">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-black flex items-center gap-2">
              <Link2 className="w-5 h-5 text-[var(--accent)]" />
              {t.shamcashApiSectionTitle}
            </h2>
            <p className="text-sm text-[var(--text-sec)] mt-1 max-w-2xl">
              {t.shamcashApiLaterHelp}
            </p>
          </div>
          <a
            href="https://shamcash.sy/ar/apiRequest"
            target="_blank"
            rel="noopener noreferrer"
            className="action-chip text-xs gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {t.requestShamcashApi}
          </a>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="text-xs text-[var(--text-muted)] block mb-1.5">{t.apiBaseUrl}</label>
            <input
              type="url"
              value={form.shamcash_api_base_url}
              onChange={(e) => setForm((p) => ({ ...p, shamcash_api_base_url: e.target.value }))}
              placeholder="https://api.shamcash-api.com/v1"
              className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-3 font-mono text-sm outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs text-[var(--text-muted)] block mb-1.5">{t.apiBearerToken}</label>
            <input
              type="password"
              value={form.shamcash_api_token}
              onChange={(e) => setForm((p) => ({ ...p, shamcash_api_token: e.target.value }))}
              placeholder="••••••••••••••••"
              className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-3 font-mono text-sm outline-none"
              autoComplete="off"
            />
            <p className="text-[10px] text-[var(--text-muted)] mt-1.5">
              {t.tokenSecurityNote}
            </p>
          </div>

          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1.5">{t.accountId}</label>
            <input
              type="text"
              value={form.shamcash_account_id}
              onChange={(e) => setForm((p) => ({ ...p, shamcash_account_id: e.target.value }))}
              placeholder={t.accountIdAutoFillPlaceholder}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-3 font-mono text-sm outline-none"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || !form.shamcash_api_token}
              className="action-chip w-full border-green-500/30 text-green-400 hover:bg-green-500/10 disabled:opacity-50"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              {t.testConnection}
            </button>
          </div>
        </div>

        {testResult && (
          <div className="mt-4 p-4 rounded-xl bg-green-500/10 border border-green-500/25 text-sm">
            <div className="flex items-center gap-2 text-green-400 font-semibold mb-2">
              <CheckCircle className="w-4 h-4" />
              {t.connectionOk}
            </div>
            <div className="text-[var(--text-sec)] space-y-1 text-xs font-mono">
              <div>{t.accountsLabel}: {testResult.accountCount}</div>
              {testResult.accountId && <div>Account ID: {testResult.accountId}</div>}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-[var(--border)]">
          <button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary action-chip gap-2 !border-0">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t.saveSettings}
          </button>
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