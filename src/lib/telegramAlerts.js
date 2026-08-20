import { supabase } from './supabase';
import { isMissingRpc, buildRpcSetupMsg } from './supabaseErrors';

export const TELEGRAM_ALERT_EVENTS = [
  'orderPaid',
  'recharge',
  'fulfillmentFail',
  'lowWallet',
  'invariantViolation',
  'stuckFulfillment',
  'recentFailures',
  'contact',
  'review',
  'signup',
];

export function normalizeTelegramAlertPrefs(raw) {
  const prefs = (raw && typeof raw === 'object') ? raw : {};
  const out = {};
  for (const key of TELEGRAM_ALERT_EVENTS) {
    out[key] = prefs[key] !== false;
  }
  return out;
}

export function normalizeTelegramAlertsSettings(raw) {
  const data = (raw && typeof raw === 'object') ? raw : {};
  return {
    telegram_alerts_enabled: data.telegram_alerts_enabled === true,
    telegram_bot_token_set: data.telegram_bot_token_set === true,
    telegram_bot_token_masked: data.telegram_bot_token_masked || '',
    telegram_bot_username: data.telegram_bot_username || '',
    telegram_chat_id: data.telegram_chat_id || '',
    telegram_alert_prefs: normalizeTelegramAlertPrefs(data.telegram_alert_prefs),
  };
}

/** Admin: read Telegram alert settings (bot token is masked). */
export async function fetchTelegramAlertsSettings() {
  const { data, error } = await supabase.rpc('get_telegram_alerts_settings');
  if (error) {
    if (isMissingRpc(error)) throw new Error(buildRpcSetupMsg('Telegram alerts'));
    throw error;
  }
  return normalizeTelegramAlertsSettings(data || {});
}

/** Admin: save Telegram alert settings. Pass botToken only to change it. */
export async function saveTelegramAlertsSettings({
  enabled,
  botToken,
  botUsername,
  chatId,
  alertPrefs,
}) {
  const { data, error } = await supabase.rpc('save_telegram_alerts_settings', {
    p_enabled: enabled !== undefined ? !!enabled : null,
    p_bot_token: botToken !== undefined ? (botToken?.trim() || '') : null,
    p_bot_username: botUsername !== undefined ? (botUsername?.trim() || '') : null,
    p_chat_id: chatId !== undefined ? (chatId?.trim() || '') : null,
    p_alert_prefs: alertPrefs !== undefined ? alertPrefs : null,
  });
  if (error) {
    if (isMissingRpc(error)) throw new Error(buildRpcSetupMsg('Telegram alerts'));
    throw error;
  }
  return normalizeTelegramAlertsSettings(data || {});
}

/** Admin: send a test alert to the configured chat to verify wiring. */
export async function sendTestTelegramAlert() {
  const { data, error } = await supabase.rpc('send_test_telegram_alert');
  if (error) {
    if (isMissingRpc(error)) throw new Error(buildRpcSetupMsg('Telegram alerts'));
    throw error;
  }
  return data === 'sent';
}

/** Admin: get Telegram bot info (linked users, webhook status). */
export async function fetchTelegramBotInfo() {
  const { data, error } = await supabase.rpc('get_telegram_bot_info');
  if (error) {
    if (isMissingRpc(error)) return null;
    throw error;
  }
  return data || null;
}

/** Admin: set up the Telegram webhook via the edge function. */
export async function setupTelegramWebhook() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const baseUrl = supabase.supabaseUrl;
  const res = await fetch(`${baseUrl}/functions/v1/telegram-bot?action=setup-webhook`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabase.supabaseKey,
    },
  });
  if (!res.ok) throw new Error(`Webhook setup failed: ${res.status}`);
  return res.json();
}

/** Admin: register bot commands with Telegram. */
export async function setTelegramBotCommands() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const baseUrl = supabase.supabaseUrl;
  const res = await fetch(`${baseUrl}/functions/v1/telegram-bot?action=set-commands`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabase.supabaseKey,
    },
  });
  if (!res.ok) throw new Error(`Set commands failed: ${res.status}`);
  return res.json();
}
