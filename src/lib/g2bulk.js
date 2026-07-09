import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

async function parseInvokeError(error) {
  let message = error.message || 'G2Bulk request failed';
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
  if (/non-2xx/i.test(message)) {
    message = 'Catalog sync timed out or failed on the server. Try again — sync now runs in smaller batches.';
  }
  if (/unauthorized|admin only|jwt/i.test(message)) {
    message = 'Admin session expired or access denied. Log out, log back in as admin, then retry.';
  }
  return message;
}

async function invokeG2bulk(body) {
  const { data, error } = await supabase.functions.invoke('g2bulk', { body });
  if (error) {
    throw new Error(await parseInvokeError(error));
  }
  if (data?.success === false) {
    throw new Error(data.message || 'G2Bulk request failed');
  }
  return data;
}

/** Admin: verify API key + read G2Bulk wallet balance */
export async function g2bulkGetMe() {
  return invokeG2bulk({ action: 'getMe' });
}

/** Admin: read settings (key is masked) */
export async function fetchG2bulkSettings() {
  const data = await invokeG2bulk({ action: 'getSettings' });
  return data.settings;
}

/** Admin: save enabled, markup, catalog mode; pass apiKey only when changing it */
export async function saveG2bulkSettings({
  enabled,
  markupPercent,
  apiKey,
  catalogOnly,
  autoSyncEnabled,
  autoSyncHour,
  autoSyncTimezone,
}) {
  const { data, error } = await supabase.rpc('save_g2bulk_settings', {
    p_enabled: !!enabled,
    p_markup_percent: markupPercent ?? 15,
    p_api_key: apiKey !== undefined ? (apiKey?.trim() || '') : null,
    p_catalog_only: catalogOnly !== undefined ? !!catalogOnly : null,
    p_auto_sync_enabled: autoSyncEnabled !== undefined ? !!autoSyncEnabled : null,
    p_auto_sync_hour: autoSyncHour !== undefined ? Number(autoSyncHour) : null,
    p_auto_sync_timezone: autoSyncTimezone !== undefined ? (autoSyncTimezone?.trim() || null) : null,
  });
  if (error) {
    const msg = error.message || '';
    if (/g2bulk_auto_sync|function.*does not exist/i.test(msg)) {
      throw new Error('Run supabase_g2bulk_auto_sync_migration.sql in Supabase SQL Editor, then retry.');
    }
    throw error;
  }
  return data;
}

const GAMES_BATCH_SIZE = 12;

/**
 * Admin: import games + offers from G2Bulk in batches (avoids edge-function timeout).
 * @param {object} options
 * @param {boolean} [options.includeVouchers]
 * @param {boolean} [options.hideManual]
 * @param {(progress: object) => void} [options.onProgress]
 * @param {AbortSignal} [options.signal]
 */
export async function syncG2bulkCatalog({
  includeVouchers = true,
  hideManual = true,
  onProgress,
  signal,
} = {}) {
  const totals = {
    gamesSynced: 0,
    offersSynced: 0,
    offersSkipped: 0,
    errors: [],
  };

  const report = (phase, extra = {}) => {
    onProgress?.({ phase, ...totals, ...extra });
  };

  const checkAbort = () => {
    if (signal?.aborted) {
      throw new Error('Catalog sync cancelled');
    }
  };

  checkAbort();
  report('init');
  const init = await invokeG2bulk({
    action: 'syncCatalog',
    phase: 'init',
    hideManual,
  });

  const totalGames = init.totalGames ?? 0;
  let offset = 0;

  report('games', { current: 0, total: totalGames });

  while (offset < totalGames) {
    checkAbort();
    const batch = await invokeG2bulk({
      action: 'syncCatalog',
      phase: 'games',
      offset,
      limit: GAMES_BATCH_SIZE,
    });

    totals.gamesSynced += batch.gamesSynced ?? 0;
    totals.offersSynced += batch.offersSynced ?? 0;
    totals.offersSkipped += batch.offersSkipped ?? 0;
    if (batch.errors?.length) {
      totals.errors.push(...batch.errors);
    }

    offset = batch.nextOffset ?? offset + GAMES_BATCH_SIZE;
    report('games', { current: Math.min(offset, totalGames), total: totalGames });

    if (batch.gamesDone) break;
  }

  if (includeVouchers) {
    checkAbort();
    report('vouchers', { current: totalGames, total: totalGames });
    const vouchers = await invokeG2bulk({ action: 'syncCatalog', phase: 'vouchers' });
    totals.gamesSynced += vouchers.gamesSynced ?? 0;
    totals.offersSynced += vouchers.offersSynced ?? 0;
    totals.offersSkipped += vouchers.offersSkipped ?? 0;
    if (vouchers.errors?.length) {
      totals.errors.push(...vouchers.errors);
    }
  }

  checkAbort();
  report('finalize');
  const finalized = await invokeG2bulk({ action: 'syncCatalog', phase: 'finalize' });

  return {
    ...totals,
    errors: totals.errors.slice(0, 20),
    syncedAt: finalized.syncedAt,
  };
}

/** Authenticated: validate player UID before checkout */
export async function g2bulkCheckPlayer({ game, userId, serverId, charname }) {
  return invokeG2bulk({
    action: 'checkPlayer',
    game,
    user_id: userId,
    server_id: serverId || undefined,
    charname: charname || undefined,
  });
}

/** Fulfill a completed order via G2Bulk (balance or after admin approval) */
export async function fulfillOrderG2bulk(orderId) {
  return invokeG2bulk({ action: 'fulfillOrder', orderId });
}