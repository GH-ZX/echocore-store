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
    throw new Error(data.message || 'Sam API request failed');
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
  apiKey,
  regenerateWebhookSecret,
}) {
  const data = await invokeSamApi({
    action: 'saveSettings',
    enabled,
    walletMode,
    shamcashWalletIdentifier,
    syriatelWalletIdentifier,
    invoiceCurrency,
    apiKey,
    regenerateWebhookSecret,
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