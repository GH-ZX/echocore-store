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

/** Admin — invoice history feed (joins recharge reference + customer name). */
export async function listSamInvoices({ status, method, entityType, search, page, pageSize } = {}) {
  const data = await invokeSamApi({
    action: 'listInvoices',
    status: status || undefined,
    method: method || undefined,
    entityType: entityType || undefined,
    search: search || undefined,
    page,
    pageSize,
  });
  return {
    invoices: data.invoices || [],
    total: data.total ?? 0,
    page: data.page ?? 1,
    pageSize: data.pageSize ?? 0,
    stats: data.stats || null,
  };
}

/** Admin — real wallet transaction history from Sam API (in/out with counterparty). */
export async function getSamWalletTransactions(provider, identifier, direction = 'all') {
  const data = await invokeSamApi({
    action: 'getWalletTransactions',
    provider,
    identifier,
    direction,
  });
  return {
    transactions: data.transactions || [],
    provider: data.provider,
    identifier: data.identifier,
  };
}

const CURRENCY_TO_ID = { USD: 1, SYP: 2, EUR: 3 };
const SHAMCASH_RECIPIENT_RE = /^[0-9a-f]{32}$/i;
const SYRIATEL_RECIPIENT_RE = /^(09\d{8}|\d{8})$/;

export function isValidSamRecipient(method, value) {
  const recipient = String(value || '').trim();
  if (String(method || '').toLowerCase() === 'shamcash') return SHAMCASH_RECIPIENT_RE.test(recipient);
  if (String(method || '').toLowerCase() === 'syriatel') return SYRIATEL_RECIPIENT_RE.test(recipient);
  return false;
}

export function buildSamRechargeHistoryPayload({ page, pageSize, search, status, method } = {}) {
  return {
    action: 'listRechargeHistory',
    page,
    pageSize,
    search: search || undefined,
    status: status || undefined,
    method: method || undefined,
  };
}

/** Admin — unified customer recharge audit (Sam invoices + manual requests). */
export async function listSamRechargeHistory(filters = {}) {
  const data = await invokeSamApi(buildSamRechargeHistoryPayload(filters));
  return {
    rows: data.rows || [],
    total: data.total ?? 0,
    page: data.page ?? 1,
    pageSize: data.pageSize ?? 0,
    stats: data.stats || null,
  };
}

export function buildSamTransferPayload({ method, recipient, amount, currency = 'USD', note = '', pinCode = '', customerId = null }) {
  return {
    action: 'transfer',
    method,
    recipient,
    amount,
    currency,
    currencyId: CURRENCY_TO_ID[currency] || 1,
    note,
    pinCode,
    customerId: customerId || undefined,
  };
}

/** Admin — send money out of a linked wallet (ShamCash or Syriatel). */
export async function sendSamTransfer({
  method,
  recipient,
  amount,
  currency = 'USD',
  note = '',
  pinCode = '',
  customerId = null,
}) {
  const data = await invokeSamApi(buildSamTransferPayload({
    method, recipient, amount, currency, note, pinCode, customerId,
  }));
  return data.transfer;
}

/** Admin — payout ledger (recent Sam transfers + total). */
export async function listSamTransfers({ page, pageSize, method, status } = {}) {
  const data = await invokeSamApi({
    action: 'listTransfers',
    page,
    pageSize,
    method: method || undefined,
    status: status || undefined,
  });
  return {
    transfers: data.transfers || [],
    total: data.total ?? 0,
    page: data.page ?? 1,
    pageSize: data.pageSize ?? 0,
  };
}

/** Admin — permanently delete all sam_transfers history. */
export async function clearSamTransfers() {
  const data = await invokeSamApi({ action: 'clearTransfers' });
  return data;
}

/** Map Sam API / edge transfer errors to localized copy. */
export function mapSamTransferError(err, t = {}) {
  const code = String(err?.code || err?.samCode || '').toUpperCase();

  if (code === 'SAM_NOT_CONFIGURED') {
    return t.samSendSourceMissing || t.samSendFailed || 'Source wallet is not configured';
  }
  if (code === 'SAM_INSUFFICIENT_BALANCE') {
    return t.samSendInsufficientBalance || t.samSendFailed || 'Insufficient balance';
  }
  if (code === 'SAM_SESSION' || code === 'WALLET_SESSION_EXPIRED') {
    return t.samSendSessionExpired || t.samSendFailed || 'Wallet session expired';
  }
  if (code === 'SAM_API_KEY' || code === 'INVALID_API_KEY' || code === 'MISSING_API_KEY') {
    return t.samSendPaymentUnavailable || t.samSendFailed || 'Payment unavailable';
  }
  if (code === 'SAM_VALIDATION' || code === 'VALIDATION_ERROR') {
    return t.samSendRecipientInvalid || t.samSendFailed || 'Invalid payment request';
  }
  if (code === 'SAM_PROVIDER' || code === 'PROVIDER_ERROR' || code === 'WALLET_UPSTREAM_ERROR') {
    return t.samSendProviderError || t.samSendFailed || 'Provider unavailable';
  }

  return err?.message || t.samSendFailed || 'Transfer failed';
}
