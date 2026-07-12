import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SAM_API_BASE = 'https://sam-api.pro/api';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Json = Record<string, unknown>;

function jsonResponse(body: Json, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

async function isAdmin(userClient: ReturnType<typeof createClient>, userId: string) {
  const { data } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  return data?.role === 'admin';
}

async function resolveSamApiKey(serviceClient: ReturnType<typeof createClient>) {
  const envKey = Deno.env.get('SAM_API_KEY')?.trim();
  if (envKey) return envKey;

  const { data } = await serviceClient
    .from('store_settings')
    .select('sam_api_key')
    .eq('id', 1)
    .maybeSingle();

  return (data?.sam_api_key as string | null)?.trim() || null;
}

async function resolveWebhookSecret(serviceClient: ReturnType<typeof createClient>) {
  const envSecret = Deno.env.get('SAM_WEBHOOK_SECRET')?.trim();
  if (envSecret) return envSecret;

  const { data } = await serviceClient
    .from('store_settings')
    .select('sam_webhook_secret')
    .eq('id', 1)
    .maybeSingle();

  return (data?.sam_webhook_secret as string | null)?.trim() || null;
}

async function samFetch(apiKey: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${apiKey}`);
  headers.set('Accept', 'application/json');
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${SAM_API_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let data: Json = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { res, data };
}

function samErrorMessage(data: Json, fallback: string) {
  const code = typeof data.code === 'string' ? data.code : '';
  const message = typeof data.message === 'string' ? data.message : fallback;
  return code ? `${code}: ${message}` : message;
}

function buildWebhookUrl(supabaseUrl: string, token: string) {
  const base = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/sam-api`;
  return `${base}?token=${encodeURIComponent(token)}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse({ success: false, message: 'Supabase env not configured' }, 500);
  }

  const url = new URL(req.url);
  const queryToken = url.searchParams.get('token')?.trim() || '';
  const body = await readJson(req);
  const isWebhookEvent = body.event === 'invoice.paid' || body.event === 'invoice.expired';
  const action = String(body.action || (isWebhookEvent ? 'webhook' : ''));

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  if (action === 'webhook' || isWebhookEvent) {
    const expectedToken = await resolveWebhookSecret(serviceClient);
    if (!expectedToken || queryToken !== expectedToken) {
      return jsonResponse({ success: false, message: 'Invalid webhook token' }, 401);
    }

    const invoiceId = String(body.invoiceId || '');
    if (!invoiceId) {
      return jsonResponse({ success: false, message: 'invoiceId required' }, 400);
    }

    const { data: row } = await serviceClient
      .from('sam_invoices')
      .select('*')
      .eq('sam_invoice_id', invoiceId)
      .maybeSingle();

    if (!row) {
      return jsonResponse({ success: false, message: 'Unknown invoice' }, 404);
    }

    const event = String(body.event || '');
    const amount = String(body.amount ?? '');
    const currency = String(body.currency ?? '');
    const method = String(body.method ?? '');

    if (amount && String(row.amount) !== amount) {
      return jsonResponse({ success: false, message: 'Amount mismatch' }, 400);
    }
    if (currency && row.currency !== currency) {
      return jsonResponse({ success: false, message: 'Currency mismatch' }, 400);
    }
    if (method && row.method !== method) {
      return jsonResponse({ success: false, message: 'Method mismatch' }, 400);
    }

    if (event === 'invoice.paid') {
      if (row.status === 'paid') {
        return jsonResponse({ success: true, skipped: true });
      }

      await serviceClient
        .from('sam_invoices')
        .update({
          status: 'paid',
          transaction_ref: typeof body.transactionRef === 'string' ? body.transactionRef : row.transaction_ref,
          paid_at: typeof body.paidAt === 'string' ? body.paidAt : new Date().toISOString(),
          webhook_received_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);

      return jsonResponse({ success: true, status: 'paid' });
    }

    if (event === 'invoice.expired') {
      if (row.status === 'paid') {
        return jsonResponse({ success: true, skipped: true });
      }

      await serviceClient
        .from('sam_invoices')
        .update({
          status: 'expired',
          webhook_received_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);

      return jsonResponse({ success: true, status: 'expired' });
    }

    return jsonResponse({ success: false, message: 'Unsupported webhook event' }, 400);
  }

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) {
    return jsonResponse({ success: false, message: 'Unauthorized' }, 401);
  }
  const userId = authData.user.id;

  if (!(await isAdmin(userClient, userId))) {
    return jsonResponse({ success: false, message: 'Admin only' }, 403);
  }

  if (action === 'getSettings') {
    const { data, error } = await userClient.rpc('get_sam_api_settings');
    if (error) {
      return jsonResponse({
        success: false,
        message: error.message.includes('sam_api')
          ? 'Run §16 Sam API section in supabase_echocore_full.sql first.'
          : error.message,
      }, 400);
    }

    const settings = { ...(data as Json) };
    const webhookSecret = await resolveWebhookSecret(serviceClient);
    if (webhookSecret) {
      settings.webhookUrl = buildWebhookUrl(supabaseUrl, webhookSecret);
    }

    const envKey = Deno.env.get('SAM_API_KEY')?.trim();
    if (envKey && !settings.sam_api_key_set) {
      settings.sam_api_key_set = true;
      settings.sam_api_key_masked = '•••••••• (edge secret)';
      settings.sam_api_key_source = 'env';
    } else if (settings.sam_api_key_set) {
      settings.sam_api_key_source = envKey ? 'both' : 'db';
    } else {
      settings.sam_api_key_source = 'none';
    }

    return jsonResponse({ success: true, settings });
  }

  if (action === 'saveSettings') {
    const { data, error } = await userClient.rpc('save_sam_api_settings', {
      p_enabled: body.enabled ?? false,
      p_wallet_mode: body.walletMode ?? 'manual',
      p_shamcash_wallet_identifier: body.shamcashWalletIdentifier ?? null,
      p_syriatel_wallet_identifier: body.syriatelWalletIdentifier ?? null,
      p_invoice_currency: body.invoiceCurrency ?? 'USD',
      p_api_key: body.apiKey !== undefined ? body.apiKey : null,
      p_regenerate_webhook_secret: !!body.regenerateWebhookSecret,
    });

    if (error) {
      return jsonResponse({ success: false, message: error.message }, 400);
    }

    const settings = { ...(data as Json) };
    const webhookSecret = await resolveWebhookSecret(serviceClient);
    if (webhookSecret) {
      settings.webhookUrl = buildWebhookUrl(supabaseUrl, webhookSecret);
    }

    return jsonResponse({ success: true, settings });
  }

  const apiKey = await resolveSamApiKey(serviceClient);
  if (!apiKey) {
    return jsonResponse({ success: false, message: 'Sam API key not configured' }, 400);
  }

  if (action === 'listWallets') {
    const { res, data } = await samFetch(apiKey, '/v1/wallets');
    if (!res.ok) {
      return jsonResponse({ success: false, message: samErrorMessage(data, 'Failed to list wallets') }, res.status);
    }
    return jsonResponse({ success: true, wallets: data });
  }

  if (action === 'getBalance') {
    const provider = String(body.provider || '');
    const identifier = String(body.identifier || '').trim();
    if (!provider || !identifier) {
      return jsonResponse({ success: false, message: 'provider and identifier required' }, 400);
    }
    if (provider !== 'shamcash' && provider !== 'syriatel') {
      return jsonResponse({ success: false, message: 'Invalid provider' }, 400);
    }

    const { res, data } = await samFetch(apiKey, `/v1/wallets/${provider}/${encodeURIComponent(identifier)}/balance`);
    if (!res.ok) {
      return jsonResponse({ success: false, message: samErrorMessage(data, 'Failed to read balance') }, res.status);
    }
    return jsonResponse({ success: true, balances: data });
  }

  if (action === 'getAllWalletBalances') {
    const { res, data } = await samFetch(apiKey, '/v1/wallets');
    if (!res.ok) {
      return jsonResponse({ success: false, message: samErrorMessage(data, 'Failed to list wallets') }, res.status);
    }

    const walletList = Array.isArray(data) ? data : [];
    const results: Json[] = [];

    for (const wallet of walletList) {
      const row = wallet as Record<string, unknown>;
      const provider = row.provider === 'syriatel' ? 'syriatel' : 'shamcash';
      const identifier = String(
        row.walletAddress || row.phone || row.cashCode || row.accountNumber || row.id || '',
      ).trim();

      if (!identifier) {
        results.push({
          id: row.id,
          provider,
          providerDisplayName: row.providerDisplayName || provider,
          label: row.label,
          identifier: null,
          balances: [],
          error: 'Missing wallet identifier',
        });
        continue;
      }

      const { res: balRes, data: balData } = await samFetch(
        apiKey,
        `/v1/wallets/${provider}/${encodeURIComponent(identifier)}/balance`,
      );

      results.push({
        id: row.id,
        provider,
        providerDisplayName: row.providerDisplayName || provider,
        label: row.label,
        identifier,
        balances: balRes.ok && Array.isArray(balData) ? balData : [],
        error: balRes.ok ? null : samErrorMessage(balData as Json, 'Failed to read balance'),
      });
    }

    return jsonResponse({ success: true, wallets: results });
  }

  return jsonResponse({ success: false, message: `Unknown action: ${action}` }, 400);
});