import { useEffect, useState, useCallback } from 'react';
import {
  Send,
  Loader2,
  CheckCircle,
  AlertCircle,
  Save,
  Bell,
  MessageSquare,
  Lock,
} from 'lucide-react';
import AdminApiKeyField from './AdminApiKeyField';
import ConfirmDialog from '../ui/ConfirmDialog';
import {
  TELEGRAM_ALERT_EVENTS,
  fetchTelegramAlertsSettings,
  saveTelegramAlertsSettings,
  sendTestTelegramAlert,
} from '../../lib/telegramAlerts';

const EVENT_KEYS = {
  orderPaid: 'telegramEventOrderPaid',
  recharge: 'telegramEventRecharge',
  fulfillmentFail: 'telegramEventFulfillmentFail',
  lowWallet: 'telegramEventLowWallet',
  invariantViolation: 'telegramEventInvariantViolation',
  stuckFulfillment: 'telegramEventStuckFulfillment',
  recentFailures: 'telegramEventRecentFailures',
  contact: 'telegramEventContact',
  review: 'telegramEventReview',
  signup: 'telegramEventSignup',
};

export default function AdminTelegramSettings({ t = {}, embedded = false }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteKeyOpen, setDeleteKeyOpen] = useState(false);
  const [deletingKey, setDeletingKey] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [form, setForm] = useState({
    telegram_alerts_enabled: false,
    telegram_bot_token_set: false,
    telegram_bot_token_masked: '',
    telegram_bot_username: '',
    telegram_chat_id: '',
    telegram_alert_prefs: {},
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchTelegramAlertsSettings();
      setForm(data);
      setTokenInput('');
    } catch (err) {
      setError(err.message || t.telegramLoadFailed);
    } finally {
      setLoading(false);
    }
  }, [t.telegramLoadFailed]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const saved = await saveTelegramAlertsSettings({
        enabled: form.telegram_alerts_enabled,
        botToken: tokenInput.trim() ? tokenInput.trim() : undefined,
        botUsername: form.telegram_bot_username,
        chatId: form.telegram_chat_id,
        alertPrefs: form.telegram_alert_prefs,
      });
      setForm(saved);
      setTokenInput('');
      setSuccess(t.telegramSettingsSaved);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || t.telegramSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setError('');
    setSuccess('');
    try {
      // Persist pending fields first so the test uses the real chat id / token.
      if (tokenInput.trim() || form.telegram_chat_id) {
        await handleSave();
      }
      const ok = await sendTestTelegramAlert();
      if (!ok) {
        setError(t.telegramTestFailed);
      } else {
        setSuccess(t.telegramTestSent);
        setTimeout(() => setSuccess(''), 4000);
      }
    } catch (err) {
      setError(err.message || t.telegramTestFailed);
    } finally {
      setTesting(false);
    }
  };

  const handleDeleteKey = async () => {
    setDeletingKey(true);
    setError('');
    try {
      const saved = await saveTelegramAlertsSettings({ botToken: '' });
      setForm(saved);
      setTokenInput('');
      setDeleteKeyOpen(false);
      setSuccess(t.telegramKeyRemoved);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || t.telegramSaveFailed);
    } finally {
      setDeletingKey(false);
    }
  };

  const togglePref = (key) => {
    setForm((prev) => ({
      ...prev,
      telegram_alert_prefs: {
        ...prev.telegram_alert_prefs,
        [key]: prev.telegram_alert_prefs[key] !== false,
      },
    }));
  };

  const botUsername = form.telegram_bot_username;
  const botLink = botUsername ? `https://t.me/${botUsername.replace(/^@/, '')}` : '';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[var(--text-sec)]">
        <Loader2 className="w-7 h-7 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className={`space-y-5 ${embedded ? 'max-w-none' : 'max-w-4xl'}`}>
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)]/60 p-5 sm:p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-[var(--bg-primary)] text-[var(--text-sec)]">
            <Bell className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-base">{t.telegramTitle}</h3>
            <p className="text-sm text-[var(--text-sec)] mt-0.5 leading-relaxed">
              {t.telegramDesc}
            </p>
          </div>
        </div>

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

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.telegram_alerts_enabled}
            onChange={(e) => setForm((p) => ({ ...p, telegram_alerts_enabled: e.target.checked }))}
            className="rounded border-[var(--border)]"
          />
          <span className="text-sm font-medium">{t.telegramEnabled}</span>
        </label>

        <AdminApiKeyField
          t={t}
          id="telegram-bot-token"
          title={t.telegramBotTokenLabel}
          description={t.telegramBotTokenDesc}
          locked={form.telegram_bot_token_set}
          maskedValue={form.telegram_bot_token_masked}
          value={tokenInput}
          onChange={setTokenInput}
          placeholder={t.telegramBotTokenPlaceholder}
          onConnect={handleTest}
          connectLabel={t.telegramTestSend}
          connectDisabled={!form.telegram_alerts_enabled || !(form.telegram_bot_token_set || tokenInput.trim() || form.telegram_chat_id)}
          connecting={testing}
          onDelete={() => setDeleteKeyOpen(true)}
          deleteLabel={t.telegramDeleteKey}
        />

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              {t.telegramBotUsernameLabel}
            </label>
            <input
              type="text"
              value={form.telegram_bot_username}
              onChange={(e) => setForm((p) => ({ ...p, telegram_bot_username: e.target.value }))}
              placeholder={t.telegramBotUsernamePlaceholder}
              dir="ltr"
              className="input w-full"
            />
            {botLink && (
              <a
                href={botLink}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[var(--accent)] inline-flex items-center gap-1 mt-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                {t.telegramOpenChat}
              </a>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">
              {t.telegramChatIdLabel}
            </label>
            <input
              type="text"
              value={form.telegram_chat_id}
              onChange={(e) => setForm((p) => ({ ...p, telegram_chat_id: e.target.value }))}
              placeholder={t.telegramChatIdPlaceholder}
              dir="ltr"
              className="input w-full font-mono"
            />
            <p className="text-xs text-[var(--text-muted)] mt-1.5 leading-relaxed">
              {t.telegramChatIdHint}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/30 px-4 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[var(--text-sec)]" />
            <label className="block text-sm font-semibold text-[var(--text-primary)]">
              {t.telegramEventsLabel}
            </label>
          </div>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            {t.telegramEventsHint}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {TELEGRAM_ALERT_EVENTS.map((key) => (
              <label key={key} className="flex items-center gap-2.5 cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]/60 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={form.telegram_alert_prefs[key] !== false}
                  onChange={() => togglePref(key)}
                  className="rounded border-[var(--border)]"
                />
                <span className="text-sm">{t[EVENT_KEYS[key]] || key}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary action-chip gap-2 !border-0 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t.save || t.saveSettings}
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || saving}
            className="btn btn-secondary action-chip gap-2 disabled:opacity-50"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {t.telegramTestSend}
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={deleteKeyOpen}
        title={t.telegramDeleteKeyTitle}
        message={t.telegramDeleteKeyConfirm}
        confirmLabel={t.telegramDeleteKey}
        cancelLabel={t.cancel}
        loading={deletingKey}
        onConfirm={handleDeleteKey}
        onCancel={() => setDeleteKeyOpen(false)}
      />
    </div>
  );
}
