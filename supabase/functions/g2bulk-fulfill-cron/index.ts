import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Server-side reconciliation sweep: finds orders that were paid + delivered by
// G2Bulk but never recorded as 'fulfilled' (buyer closed the tab, client poll
// window elapsed, webhook missed), then re-runs the poll-only fulfillOrder path
// against the main g2bulk edge function so delivery state lands in the DB.
//
// Triggered by pg_cron -> pg_net -> HTTP POST with x-g2bulk-cron-secret.

const BATCH_SIZE = 6;
const MIN_AGE_MS = 45 * 1000;
const REQUEST_TIMEOUT_MS = 120 * 1000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-g2bulk-cron-secret',
};

type Json = Record<string, unknown>;
type ReconcileOutcome = {
  orderId: string;
  http: number;
  success: boolean;
  skipped?: boolean;
  pending?: boolean;
  fulfillmentStatus?: string | null;
  message?: string;
  error?: string;
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

function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
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
    .select('g2bulk_enabled, g2bulk_api_key')
    .eq('id', 1)
    .maybeSingle();

  if (settingsError) {
    return jsonResponse({ success: false, message: settingsError.message }, 500);
  }
  if (settings?.g2bulk_enabled !== true) {
    return jsonResponse({ success: true, skipped: true, reason: 'g2bulk_disabled' });
  }
  const dbKey = (settings?.g2bulk_api_key && String(settings.g2bulk_api_key).trim()) || '';
  const envKey = Deno.env.get('G2BULK_API_KEY')?.trim() || '';
  if (!dbKey && !envKey) {
    return jsonResponse({ success: true, skipped: true, reason: 'no_api_key' });
  }

  const cutoff = new Date(Date.now() - MIN_AGE_MS).toISOString();

  const { data: orders, error } = await serviceClient
    .from('orders')
    .select('id')
    .eq('status', 'completed')
    .in('fulfillment_status', ['pending', 'fulfilling'])
    .or(
      'g2bulk_order_id.not.is.null,'
      + 'g2bulk_metadata->>g2bulk_order_id.not.is.null,'
      + 'g2bulk_metadata->>g2bulkOrderId.not.is.null',
    )
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    return jsonResponse({ success: false, message: error.message }, 500);
  }

  const candidates = Array.isArray(orders) ? orders : [];

  // Service-role auth only (NOT the cron secret header) — the main function
  // blocks cron-secret calls unless action is syncCatalog/checkCatalog.
  const results: ReconcileOutcome[] = await Promise.all(
    candidates.map(async (o): Promise<ReconcileOutcome> => {
      const orderId = String(o.id);
      try {
        const res = await fetchWithTimeout(
          `${supabaseUrl}/functions/v1/g2bulk`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ action: 'fulfillOrder', orderId, pollOnly: true }),
          },
          REQUEST_TIMEOUT_MS,
        );
        const text = await res.text();
        let data: Json = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          data = { message: text.slice(0, 300) };
        }
        const fs = String(data.fulfillmentStatus || '');
        return {
          orderId,
          http: res.status,
          success: data.success === true,
          skipped: data.skipped === true,
          pending: data.pending === true,
          fulfillmentStatus: fs || null,
          message: data.skipped === true ? 'already_fulfilled' : String(data.message || ''),
        };
      } catch (err) {
        return {
          orderId,
          http: 0,
          success: false,
          error: (err instanceof Error ? err.message : 'Request failed'),
        };
      }
    }),
  );

  const terminal = ['fulfilled', 'failed'];
  const resolved = results.filter((r) => terminal.includes(String(r.fulfillmentStatus || '')));
  const stillPending = results.filter(
    (r) => r.fulfillmentStatus === 'fulfilling' || r.pending || r.fulfillmentStatus === 'pending',
  );
  const errors = results.filter((r) => !r.success && !r.skipped && !r.pending);

  return jsonResponse({
    success: true,
    scanned: results.length,
    resolved: resolved.length,
    stillPending: stillPending.length,
    errors: errors.length,
    results,
  });
});