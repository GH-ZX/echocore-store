import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

async function parseInvokeError(error) {
  let message = error.message || 'Sam API request failed';
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

async function invokeSamApi(body) {
  const { data, error } = await supabase.functions.invoke('sam-api', { body });
  if (error) {
    throw new Error(await parseInvokeError(error));
  }
  if (data?.success === false) {
    const err = new Error(data.message || 'Sam API request failed');
    if (data.code) err.code = data.code;
    if (data.samCode) err.samCode = data.samCode;
    throw err;
  }
  return data;
}

export async function fetchSamApiSettings() {
  const data = await invokeSamApi({ action: 'getSettings' });
  return data.settings;
}

export async function saveSamApiSettings({
  enabled,
  walletMode,
  shamcashWalletIdentifier,
  syriatelWalletIdentifier,
  invoiceCurrency,
  sypPerUsd,
  apiKey,
  regenerateWebhookSecret,
  clearApiKey,
}) {
  const data = await invokeSamApi({
    action: 'saveSettings',
    enabled,
    walletMode,
    shamcashWalletIdentifier,
    syriatelWalletIdentifier,
    invoiceCurrency,
    sypPerUsd,
    apiKey,
    regenerateWebhookSecret,
    clearApiKey,
  });
  return data.settings;
}

export async function listSamWallets() {
  const data = await invokeSamApi({ action: 'listWallets' });
  return data.wallets || [];
}

export async function getSamWalletBalance(provider, identifier) {
  const data = await invokeSamApi({ action: 'getBalance', provider, identifier });
  return data.balances || [];
}

export async function fetchAllSamWalletBalances() {
  const data = await invokeSamApi({ action: 'getAllWalletBalances' });
  return { wallets: data.wallets || [] };
}

export async function createOrderInvoice({ orderId, paymentMethod }) {
  const data = await invokeSamApi({
    action: 'createInvoice',
    entityType: 'order',
    entityId: orderId,
    paymentMethod,
  });
  return data.invoice;
}

export async function createRechargeInvoice({ requestId, paymentMethod }) {
  const data = await invokeSamApi({
    action: 'createInvoice',
    entityType: 'recharge',
    entityId: requestId,
    paymentMethod,
  });
  return data.invoice;
}

/** Map Sam API / edge invoice errors to localized recharge copy. */
export function mapSamRechargeError(err, t = {}) {
  const code = String(err?.code || err?.samCode || '').toUpperCase();

  if (code === 'SAM_NOT_FOUND' || code === 'NOT_FOUND') {
    return t.samInvoiceWalletNotFound || t.samInvoiceCreateFailed || 'Payment unavailable';
  }
  if (code === 'SAM_SESSION' || code === 'WALLET_SESSION_EXPIRED') {
    return t.samInvoiceSessionExpired || t.samInvoiceCreateFailed || 'Payment unavailable';
  }
  if (code === 'SAM_API_KEY' || code === 'INVALID_API_KEY' || code === 'MISSING_API_KEY') {
    return t.samInvoicePaymentUnavailable || t.samInvoiceCreateFailed || 'Payment unavailable';
  }
  if (code === 'SAM_INVALID_IDENTIFIER' || code === 'INVALID_IDENTIFIER') {
    return t.samInvoiceWalletNotFound || t.samInvoiceCreateFailed || 'Payment unavailable';
  }
  if (code === 'EXPIRED') {
    return t.samInvoiceExpired || t.samInvoiceCreateFailed || 'Invoice expired';
  }

  return err?.message || t.samInvoiceCreateFailed || t.rechargeFailed || 'Recharge failed';
}

export async function verifyOrderInvoice(samInvoiceId, transactionRef) {
  const data = await invokeSamApi({
    action: 'verifyInvoice',
    samInvoiceId,
    transactionRef: String(transactionRef || '').trim(),
  });
  return data;
}

export async function getSamInvoiceStatus(samInvoiceId) {
  const data = await invokeSamApi({
    action: 'getInvoiceStatus',
    samInvoiceId,
  });
  return data;
}