import { describe, expect, it } from 'vitest';
import {
  TELEGRAM_ALERT_EVENTS,
  normalizeTelegramAlertPrefs,
  normalizeTelegramAlertsSettings,
} from './telegramAlerts';

describe('TELEGRAM_ALERT_EVENTS', () => {
  it('covers every wired event type', () => {
    expect(TELEGRAM_ALERT_EVENTS).toContain('orderPaid');
    expect(TELEGRAM_ALERT_EVENTS).toContain('recharge');
    expect(TELEGRAM_ALERT_EVENTS).toContain('fulfillmentFail');
    expect(TELEGRAM_ALERT_EVENTS).toContain('lowWallet');
    expect(TELEGRAM_ALERT_EVENTS).toContain('contact');
    expect(TELEGRAM_ALERT_EVENTS).toContain('review');
    expect(TELEGRAM_ALERT_EVENTS).toContain('signup');
  });
});

describe('normalizeTelegramAlertPrefs', () => {
  it('defaults every known event to on when prefs are missing', () => {
    const prefs = normalizeTelegramAlertPrefs(null);
    for (const key of TELEGRAM_ALERT_EVENTS) {
      expect(prefs[key]).toBe(true);
    }
  });

  it('respects explicit off toggles and ignores unknown keys', () => {
    const prefs = normalizeTelegramAlertPrefs({ signup: false, mystery: false });
    expect(prefs.signup).toBe(false);
    expect(prefs.orderPaid).toBe(true);
  });
});

describe('normalizeTelegramAlertsSettings', () => {
  it('maps the RPC envelope into a safe UI shape', () => {
    const settings = normalizeTelegramAlertsSettings({
      telegram_alerts_enabled: true,
      telegram_bot_token_set: true,
      telegram_bot_token_masked: '1234…5678',
      telegram_bot_username: 'my_store_bot',
      telegram_chat_id: '123456789',
      telegram_alert_prefs: { orderPaid: true, signup: false },
    });
    expect(settings.telegram_alerts_enabled).toBe(true);
    expect(settings.telegram_bot_token_set).toBe(true);
    expect(settings.telegram_bot_token_masked).toBe('1234…5678');
    expect(settings.telegram_bot_username).toBe('my_store_bot');
    expect(settings.telegram_chat_id).toBe('123456789');
    expect(settings.telegram_alert_prefs.orderPaid).toBe(true);
    expect(settings.telegram_alert_prefs.signup).toBe(false);
  });

  it('handles a completely empty envelope', () => {
    const settings = normalizeTelegramAlertsSettings(null);
    expect(settings.telegram_alerts_enabled).toBe(false);
    expect(settings.telegram_bot_token_set).toBe(false);
    expect(settings.telegram_bot_username).toBe('');
    expect(settings.telegram_chat_id).toBe('');
    expect(settings.telegram_alert_prefs.orderPaid).toBe(true);
  });
});
