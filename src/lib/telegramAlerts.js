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
