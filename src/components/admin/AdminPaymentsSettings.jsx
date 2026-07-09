import { useState, useEffect } from 'react';
import { Wallet, Link2, Loader2, CheckCircle, AlertCircle, ExternalLink, RefreshCw, Save } from 'lucide-react';
import { fetchStoreSettings, saveStoreSettings } from '../../lib/storeSettings';
import { testShamcashConnection } from '../../lib/shamcashApi';

export default function AdminPaymentsSettings({ t = {}, lang = 'ar', onSaved }) {
  const isAr = lang === 'ar';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testResult, setTestResult] = useState(null);

  const [form, setForm] = useState({
    shamcash_enabled: true,
    shamcash_api_base_url: 'https://api.shamcash-api.com/v1',
    shamcash_api_token: '',
    shamcash_account_id: '',
    shamcash_merchant_name: 'ECHOCORE Store',
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
      setSuccess(t.paymentSettingsSaved || (isAr ? 'تم حفظ إعدادات الدفع' : 'Payment settings saved'));
      onSaved?.();
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
      const result = await testShamcashConnection({
        apiBaseUrl: form.shamcash_api_base_url,
        apiToken: form.shamcash_api_token,
        accountId: form.shamcash_account_id,
      });
      setTestResult(result);
      if (result.accountId && !form.shamcash_account_id) {
        setForm((prev) => ({ ...prev, shamcash_account_id: result.accountId }));
      }
      setSuccess(t.shamcashConnected || (isAr ? 'تم الاتصال بـ ShamCash بنجاح' : 'ShamCash connection successful'));
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

  return (
    <div className="space-y-6">
      <div className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-black flex items-center gap-2">
              <Wallet className="w-5 h-5 text-green-400" />
              {t.shamcashSettings || (isAr ? 'إعدادات ShamCash' : 'ShamCash API')}
            </h2>
            <p className="text-sm text-[var(--text-sec)] mt-1 max-w-2xl">
              {t.shamcashSettingsHelp || (isAr
                ? 'اربط حساب التاجر عبر API Token من لوحة ShamCash. التوكن يُخزّن بشكل آمن ولا يظهر للعملاء.'
                : 'Connect your merchant account with an API token from the ShamCash dashboard. The token is stored securely and never shown to customers.')}
            </p>
          </div>
          <a
            href="https://shamcash.sy/ar/apiRequest"
            target="_blank"
            rel="noopener noreferrer"
            className="action-chip text-xs gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {t.requestShamcashApi || (isAr ? 'طلب API' : 'Request API Access')}
          </a>
        </div>

        <label className="flex items-center gap-3 mb-6 p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] cursor-pointer">
          <input
            type="checkbox"
            checked={form.shamcash_enabled}
            onChange={(e) => setForm((p) => ({ ...p, shamcash_enabled: e.target.checked }))}
            className="w-4 h-4 accent-[var(--accent)]"
          />
          <div>
            <div className="font-semibold">{t.enableShamcash || (isAr ? 'تفعيل ShamCash للعملاء' : 'Enable ShamCash for customers')}</div>
            <div className="text-xs text-[var(--text-muted)]">{t.enableShamcashHelp || (isAr ? 'يظهر كطريقة دفع في الشحن والشراء' : 'Shows as a payment method in recharge and checkout')}</div>
          </div>
        </label>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="text-xs text-[var(--text-muted)] block mb-1.5">{t.merchantDisplayName || (isAr ? 'اسم التاجر (يظهر للعميل)' : 'Merchant name (shown to customers)')}</label>
            <input
              type="text"
              value={form.shamcash_merchant_name}
              onChange={(e) => setForm((p) => ({ ...p, shamcash_merchant_name: e.target.value }))}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-3 outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs text-[var(--text-muted)] block mb-1.5">{t.apiBaseUrl || 'API Base URL'}</label>
            <input
              type="url"
              value={form.shamcash_api_base_url}
              onChange={(e) => setForm((p) => ({ ...p, shamcash_api_base_url: e.target.value }))}
              placeholder="https://api.shamcash-api.com/v1"
              className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-3 font-mono text-sm outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs text-[var(--text-muted)] block mb-1.5">{t.apiBearerToken || (isAr ? 'API Bearer Token' : 'API Bearer Token')}</label>
            <input
              type="password"
              value={form.shamcash_api_token}
              onChange={(e) => setForm((p) => ({ ...p, shamcash_api_token: e.target.value }))}
              placeholder="••••••••••••••••"
              className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-3 font-mono text-sm outline-none"
              autoComplete="off"
            />
            <p className="text-[10px] text-[var(--text-muted)] mt-1.5">
              {t.tokenSecurityNote || (isAr ? 'لا تشارك التوكن. يُستخدم للتحقق من المعاملات فقط.' : 'Never share this token. Used only for verifying transactions.')}
            </p>
          </div>

          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1.5">{t.accountId || (isAr ? 'معرّف الحساب (Account ID)' : 'Account ID')}</label>
            <input
              type="text"
              value={form.shamcash_account_id}
              onChange={(e) => setForm((p) => ({ ...p, shamcash_account_id: e.target.value }))}
              placeholder={isAr ? 'يُملأ تلقائياً بعد اختبار الاتصال' : 'Auto-filled after connection test'}
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
              {t.testConnection || (isAr ? 'اختبار الاتصال' : 'Test Connection')}
            </button>
          </div>
        </div>

        {testResult && (
          <div className="mt-4 p-4 rounded-xl bg-green-500/10 border border-green-500/25 text-sm">
            <div className="flex items-center gap-2 text-green-400 font-semibold mb-2">
              <CheckCircle className="w-4 h-4" />
              {t.connectionOk || (isAr ? 'الاتصال ناجح' : 'Connection OK')}
            </div>
            <div className="text-[var(--text-sec)] space-y-1 text-xs font-mono">
              <div>{isAr ? 'الحسابات' : 'Accounts'}: {testResult.accountCount}</div>
              {testResult.accountId && <div>Account ID: {testResult.accountId}</div>}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-[var(--border)]">
          <button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary action-chip gap-2 !border-0">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t.saveSettings || (isAr ? 'حفظ الإعدادات' : 'Save Settings')}
          </button>
          <button type="button" onClick={load} className="action-chip gap-2">
            <RefreshCw className="w-4 h-4" />
            {t.refresh || (isAr ? 'تحديث' : 'Refresh')}
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
        <h3 className="font-bold mb-3">{t.otherPaymentMethods || (isAr ? 'طرق دفع أخرى' : 'Other Payment Methods')}</h3>
        <div className="space-y-2 text-sm text-[var(--text-sec)]">
          <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)]">
            <span>Binance Pay (USDT)</span>
            <span className="text-xs px-2 py-1 rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)]">{t.comingSoon || (isAr ? 'قريباً' : 'Coming soon')}</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)]">
            <span>MasterCard / Visa</span>
            <span className="text-xs px-2 py-1 rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)]">{t.comingSoon || (isAr ? 'قريباً' : 'Coming soon')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}