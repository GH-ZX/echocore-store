import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GAMES_BATCH_SIZE = 32;
const STALE_SYNC_MS = 2 * 60 * 60 * 1000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-g2bulk-cron-secret',
};

type Json = Record<string, unknown>;
type SyncState = {
  in_progress: boolean;
  phase: 'games' | 'vouchers' | 'finalize';
  offset: number;
  totalGames: number;
  includeVouchers: boolean;
  hideManual: boolean;
  startedAt: string;
  gamesSynced: number;
  offersSynced: number;
  offersSkipped: number;
  errors: string[];
};

function jsonResponse(body: Json, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isCronAuthorized(req: Request): boolean {
  const secret = Deno.env.get('G2BULK_CRON_SECRET')?.trim();
  const header = req.headers.get('x-g2bulk-cron-secret')?.trim();
  return !!(secret && header && secret === header);
}

function getZonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: Number(pick('hour')) % 24,
    minute: Number(pick('minute')),
    dateKey: `${pick('year')}-${pick('month')}-${pick('day')}`,
  };
}

function syncedOnDate(lastSyncAt: string | null, timeZone: string, dateKey: string) {
  if (!lastSyncAt) return false;
  const parts = getZonedParts(new Date(lastSyncAt), timeZone);
  return parts.dateKey === dateKey;
}

async function invokeSyncPhase(
  supabaseUrl: string,
  serviceRoleKey: string,
  cronSecret: string,
  phase: string,
  extra: Json = {},
) {
  const res = await fetch(`${supabaseUrl}/functions/v1/g2bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceRoleKey}`,
      'x-g2bulk-cron-secret': cronSecret,
    },
    body: JSON.stringify({ action: 'syncCatalog', phase, ...extra }),
  });

  const text = await res.text();
  let data: Json = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text.slice(0, 300) };
  }

  if (!res.ok || data.success === false) {
    throw new Error(String(data.message || `syncCatalog ${phase} failed (${res.status})`));
  }

  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!isCronAuthorized(req)) {
    return jsonResponse({ success: false, message: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const cronSecret = Deno.env.get('G2BULK_CRON_SECRET')?.trim();

  if (!supabaseUrl || !serviceRoleKey || !cronSecret) {
    return jsonResponse({ success: false, message: 'Cron env not configured' }, 500);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: settings, error: settingsError } = await serviceClient
    .from('store_settings')
    .select(`
      g2bulk_auto_sync_enabled,
      g2bulk_auto_sync_hour,
      g2bulk_auto_sync_timezone,
      g2bulk_last_sync_at,
      g2bulk_sync_state,
      g2bulk_pull_selection
    `)
    .eq('id', 1)
    .maybeSingle();

  if (settingsError) {
    return jsonResponse({ success: false, message: settingsError.message }, 500);
  }

  if (!settings?.g2bulk_auto_sync_enabled) {
    return jsonResponse({ success: true, skipped: true, reason: 'auto_sync_disabled' });
  }

  const timeZone = String(settings.g2bulk_auto_sync_timezone || 'Asia/Damascus');
  const syncHour = Number(settings.g2bulk_auto_sync_hour ?? 5);
  const now = new Date();
  const local = getZonedParts(now, timeZone);
  const lastSyncAt = settings.g2bulk_last_sync_at as string | null;
  const alreadySyncedToday = syncedOnDate(lastSyncAt, timeZone, local.dateKey);

  let state = settings.g2bulk_sync_state as SyncState | null;

  if (state?.in_progress && state.startedAt) {
    const age = now.getTime() - new Date(state.startedAt).getTime();
    if (age > STALE_SYNC_MS) {
      state = null;
      await serviceClient.from('store_settings').update({ g2bulk_sync_state: null }).eq('id', 1);
    }
  }

  const shouldStartDaily = !state?.in_progress
    && !alreadySyncedToday
    && local.hour === syncHour
    && local.minute < 30;

  if (!state?.in_progress && !shouldStartDaily) {
    return jsonResponse({
      success: true,
      skipped: true,
      reason: alreadySyncedToday ? 'already_synced_today' : 'outside_sync_window',
      localTime: `${local.dateKey} ${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`,
    });
  }

  const pullSelection = (settings?.g2bulk_pull_selection || {}) as Json;
  const topupSyncBaseKeys = Array.isArray(pullSelection.topupSyncBaseKeys) ? pullSelection.topupSyncBaseKeys : (
    Array.isArray(pullSelection.topupBaseKeys) ? pullSelection.topupBaseKeys : []
  );
  const accountCategoryIds = Array.isArray(pullSelection.accountCategoryIds) ? pullSelection.accountCategoryIds : [];
  const giftCategoryIds = Array.isArray(pullSelection.giftCategoryIds) ? pullSelection.giftCategoryIds : [];
  const includeGiftCards = giftCategoryIds.length > 0;
  const hasPullSelection = topupSyncBaseKeys.length > 0
    || accountCategoryIds.length > 0
    || giftCategoryIds.length > 0;

  if (!state?.in_progress && !hasPullSelection) {
    return jsonResponse({ success: true, skipped: true, reason: 'no_pull_selection' });
  }

  try {
    if (!state?.in_progress) {
      const init = await invokeSyncPhase(supabaseUrl, serviceRoleKey, cronSecret, 'init', {
        hideManual: true,
        includeGiftCards,
      });

      state = {
        in_progress: true,
        phase: 'games',
        offset: 0,
        totalGames: Number(init.totalGames) || 0,
        includeVouchers: includeGiftCards,
        hideManual: true,
        startedAt: now.toISOString(),
        gamesSynced: 0,
        offersSynced: 0,
        offersSkipped: 0,
        errors: [],
      };

      await serviceClient.from('store_settings').update({ g2bulk_sync_state: state }).eq('id', 1);

      return jsonResponse({
        success: true,
        action: 'started',
        totalGames: state.totalGames,
        localTime: `${local.dateKey} ${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`,
      });
    }

    if (state.phase === 'games') {
      const batch = await invokeSyncPhase(supabaseUrl, serviceRoleKey, cronSecret, 'games', {
        offset: state.offset,
        limit: GAMES_BATCH_SIZE,
      });

      state.gamesSynced += Number(batch.gamesSynced) || 0;
      state.offersSynced += Number(batch.offersSynced) || 0;
      state.offersSkipped += Number(batch.offersSkipped) || 0;
      if (Array.isArray(batch.errors)) {
        state.errors.push(...(batch.errors as string[]));
      }

      const nextOffset = Number(batch.nextOffset) || state.offset + GAMES_BATCH_SIZE;
      const gamesDone = !!batch.gamesDone || nextOffset >= state.totalGames;

      if (gamesDone) {
        state.phase = state.includeVouchers ? 'vouchers' : 'finalize';
        state.offset = nextOffset;
      } else {
        state.offset = nextOffset;
      }

      await serviceClient.from('store_settings').update({ g2bulk_sync_state: state }).eq('id', 1);

      return jsonResponse({
        success: true,
        action: 'games_batch',
        phase: state.phase,
        offset: state.offset,
        totalGames: state.totalGames,
        gamesDone,
        gamesSynced: state.gamesSynced,
        offersSynced: state.offersSynced,
      });
    }

    if (state.phase === 'vouchers') {
      const vouchers = await invokeSyncPhase(supabaseUrl, serviceRoleKey, cronSecret, 'vouchers', {
        includeGiftCards,
      });

      state.gamesSynced += Number(vouchers.gamesSynced) || 0;
      state.offersSynced += Number(vouchers.offersSynced) || 0;
      state.offersSkipped += Number(vouchers.offersSkipped) || 0;
      if (Array.isArray(vouchers.errors)) {
        state.errors.push(...(vouchers.errors as string[]));
      }
      state.phase = 'finalize';

      await serviceClient.from('store_settings').update({ g2bulk_sync_state: state }).eq('id', 1);

      return jsonResponse({
        success: true,
        action: 'vouchers_done',
        gamesSynced: state.gamesSynced,
        offersSynced: state.offersSynced,
      });
    }

    if (state.phase === 'finalize') {
      const finalized = await invokeSyncPhase(supabaseUrl, serviceRoleKey, cronSecret, 'finalize');

      await serviceClient.from('store_settings').update({
        g2bulk_sync_state: null,
        g2bulk_last_sync_at: finalized.syncedAt || now.toISOString(),
        updated_at: now.toISOString(),
      }).eq('id', 1);

      return jsonResponse({
        success: true,
        action: 'completed',
        gamesSynced: state.gamesSynced,
        offersSynced: state.offersSynced,
        offersSkipped: state.offersSkipped,
        errors: state.errors.slice(0, 20),
        syncedAt: finalized.syncedAt || now.toISOString(),
      });
    }

    return jsonResponse({ success: false, message: `Unknown sync phase: ${state.phase}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Auto sync tick failed';
    await serviceClient.from('store_settings').update({ g2bulk_sync_state: null }).eq('id', 1);
    return jsonResponse({ success: false, message }, 500);
  }
});