import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

async function parseInvokeError(error) {
  let message = error.message || 'Binance Pay request failed';
  if (error instanceof FunctionsHttpError && error.context) {
    try {
      const body = await error.context.json();
      if (body?.message) message = body.message;
      else if (typeof body?.error === 'string') message = body.error;
    } catch {
      try {
        const text = await error.context.text();
        if (text) message = text.slice(0, 300);
      } catch {
        /* keep default */
      }
    }
  }
  if (/unauthorized|admin only|jwt/i.test(message)) {
    return 'Admin session expired or access denied. Log out, log back in as admin, then retry.';
  }
  return message;
}

async function invokeBinancePay(body) {
  const { data, error } = await supabase.functions.invoke('binance-pay', { body });
  if (error) {
    throw new Error(await parseInvokeError(error));
  }
  if (data?.success === false) {
    const err = new Error(data.message || 'Binance Pay request failed');
    if (data.code) err.code = data.code;
    if (data.binanceCode) err.binanceCode = data.binanceCode;
    throw err;
  }
  return data;
}

/** Admin — read masked Binance Pay settings + configured flags. */
export async function fetchBinancePaySettings() {
  const data = await invokeBinancePay({ action: 'getSettings' });
  return data.settings || {
    binance_enabled: false,
    binance_api_enabled: false,
    binance_api_key_set: false,
    binance_api_secret_set: false,
    binance_cert_sn_set: false,
    binance_merchant_id_set: false,
    binance_api_key_masked: '',
    binance_cert_sn_masked: '',
    binance_merchant_id: '',
  };
}

/** Admin — save Binance Pay settings. Empty string fields are ignored server-side. */
export async function saveBinancePaySettings({
  enabled,
  apiEnabled,
  apiKey,
  apiSecret,
  certSn,
  merchantId,
  regenerateWebhookSecret,
  clearApiKey,
  clearApiSecret,
} = {}) {
  const data = await invokeBinancePay({
    action: 'saveSettings',
    binance_enabled: typeof enabled === 'boolean' ? enabled : undefined,
    binance_api_enabled: typeof apiEnabled === 'boolean' ? apiEnabled : undefined,
    binance_api_key: apiKey,
    binance_api_secret: apiSecret,
    binance_cert_sn: certSn,
    binance_merchant_id: merchantId,
    regenerateWebhookSecret,
    clearApiKey,
    clearApiSecret,
  });
  return data.settings || {};
}

/** User — create a Binance Pay recharge order for an existing recharge request. */
export async function createBinancePayRechargeOrder({ requestId, amount, returnUrl }) {
  const data = await invokeBinancePay({
    action: 'createRechargeOrder',
    requestId,
    amount,
    returnUrl,
  });
  return data.order || null;
}

/** User / admin — query a Binance Pay order status (authoritative, from our DB). */
export async function getBinancePayOrderStatus({ requestId, merchantTradeNo } = {}) {
  const data = await invokeBinancePay({
    action: 'getOrderStatus',
    requestId,
    merchantTradeNo,
  });
  return data.order || null;
}

/** Map Binance Pay edge errors to localized copy. */
export function mapBinancePayError(err, t = {}) {
  const code = String(err?.code || '').toUpperCase();
  if (code === 'BINANCE_NOT_CONFIGURED') {
    return t.binanceNotConfigured || t.binancePayFailed || 'Binance Pay is not configured';
  }
  if (code === 'BINANCE_VALIDATION') {
    return t.binanceValidationError || t.binancePayFailed || 'Binance Pay rejected the request';
  }
  if (code === 'BINANCE_PROVIDER') {
    return t.binanceProviderError || t.binancePayFailed || 'Binance Pay is unavailable right now';
  }
  return err?.message || t.binancePayFailed || 'Binance Pay request failed';
}