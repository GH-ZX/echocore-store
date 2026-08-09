import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SAM_API_BASE = 'https://sam-api.pro/api';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Json = Record<string, unknown>;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  if (text && typeof data.raw !== 'string') {
    data.raw = text;
  }
  return { res, data };
}

function samErrorMessage(data: Json, fallback: string, status = 0) {
  const code = typeof data.code === 'string' ? data.code : '';
  const message = typeof data.message === 'string' ? data.message : '';
  const error = typeof data.error === 'string' ? data.error : '';
  const raw = typeof data.raw === 'string' ? String(data.raw).slice(0, 300) : '';
  const detail = message || error || raw || (status ? `HTTP ${status}` : '') || fallback;
  return code ? `${code}: ${detail}` : detail;
}

// Map Sam API GET/POST invoice error codes to actionable messages + an uplevel
// `code` (SAM_*) the client can branch on (e.g. show a generic localized toast).
function mapSamInvoiceError(data: Json, fallback: string) {
  const code = typeof data.code === 'string' ? data.code : '';

  if (code === 'NOT_FOUND') {
    return {
      message: 'Sam receiving wallet not found. In Admin → Payments → Sam API, click "Test wallets", pick a linked wallet, then Save.',
      code: 'SAM_NOT_FOUND',
      samCode: 'NOT_FOUND',
    };
  }
  if (code === 'INVALID_IDENTIFIER') {
    return {
      message: 'Sam wallet identifier format is invalid for the selected provider.',
      code: 'SAM_INVALID_IDENTIFIER',
      samCode: 'INVALID_IDENTIFIER',
    };
  }
  if (code === 'WALLET_SESSION_EXPIRED') {
    return {
      message: 'Sam wallet session expired — re-link the wallet in the Sam dashboard.',
      code: 'SAM_SESSION',
      samCode: 'WALLET_SESSION_EXPIRED',
    };
  }
  if (code === 'MISSING_API_KEY' || code === 'INVALID_API_KEY') {
    return {
      message: 'Sam API key is missing or invalid. Configure it in Admin → Payments → Sam API.',
      code: 'SAM_API_KEY',
      samCode: code,
    };
  }
  if (code === 'VALIDATION_ERROR') {
    return {
      message: 'Sam rejected the invoice request (validation error). Check identifier/currency in Admin → Sam API.',
      code: 'SAM_VALIDATION',
      samCode: 'VALIDATION_ERROR',
    };
  }
  if (code === 'PROVIDER_ERROR' || code === 'WALLET_UPSTREAM_ERROR') {
    return {
      message: 'Payment provider is unavailable right now. Please try again later.',
      code: 'SAM_PROVIDER',
      samCode: code,
    };
  }

  return {
    message: samErrorMessage(data, fallback),
    code: String(code || 'SAM_UNKNOWN'),
    samCode: code,
  };
}

const SHAMCASH_RECIPIENT_RE = /^[0-9a-f]{32}$/;
const SYRIATEL_RECIPIENT_RE = /^(09\d{8}|\d{8})$/;
const SYRIATEL_PIN_RE = /^\d{4}$/;

const CURRENCY_IDS: Record<string, number> = { USD: 1, SYP: 2, EUR: 3 };
const CURRENCY_ID_TO_CODE: Record<number, string> = { 1: 'USD', 2: 'SYP', 3: 'EUR' };

function mapSamTransferError(data: Json, fallback: string, status = 0) {
  const code = typeof data.code === 'string' ? data.code : '';
  const isCloudflare = typeof data.title === 'string' && data.title.includes('502');

  if (status >= 500 || isCloudflare || code === 'WALLET_UPSTREAM_ERROR' || code === 'PROVIDER_ERROR') {
    return {
      message: 'Sam API is currently unavailable (provider error). Please try again in a few minutes.',
      code: 'SAM_PROVIDER',
      samCode: code || 'WALLET_UPSTREAM_ERROR',
    };
  }

  if (code === 'WALLET_SESSION_EXPIRED') {
    return {
      message: 'Sam wallet session expired — re-link the source wallet in the Sam dashboard.',
      code: 'SAM_SESSION',
      samCode: 'WALLET_SESSION_EXPIRED',
    };
  }
  if (code === 'MISSING_API_KEY' || code === 'INVALID_API_KEY') {
    return {
      message: 'Sam API key is missing or invalid. Configure it in Admin → Payments → Sam API.',
      code: 'SAM_API_KEY',
      samCode: code,
    };
  }
  if (code === 'VALIDATION_ERROR') {
    return {
      message: 'Sam rejected the transfer (validation error). Check recipient address, amount and currency.',
      code: 'SAM_VALIDATION',
      samCode: 'VALIDATION_ERROR',
    };
  }
  if (code === 'PROVIDER_ERROR' || code === 'WALLET_UPSTREAM_ERROR') {
    return {
      message: 'Payment provider is unavailable right now. Please try again later.',
      code: 'SAM_PROVIDER',
      samCode: code,
    };
  }
  if (code === 'NOT_FOUND') {
    return {
      message: 'Source or recipient wallet not found on Sam. Check the recipient id and source wallet.',
      code: 'SAM_NOT_FOUND',
      samCode: 'NOT_FOUND',
    };
  }
  if (code === 'INVALID_IDENTIFIER') {
    return {
      message: 'Recipient wallet id format is invalid for ShamCash.',
      code: 'SAM_INVALID_IDENTIFIER',
      samCode: 'INVALID_IDENTIFIER',
    };
  }

  return {
    message: samErrorMessage(data, fallback, status),
    code: String(code || 'SAM_UNKNOWN'),
    samCode: code,
  };
}

async function resolveTransferSourceIdentifier(
  serviceClient: ReturnType<typeof createClient>,
  method: string,
): Promise<string | null> {
  const { data } = await serviceClient
    .from('store_settings')
    .select('sam_shamcash_wallet_identifier, sam_syriatel_wallet_identifier')
    .eq('id', 1)
    .maybeSingle();

  const column = method === 'syriatel' ? 'sam_syriatel_wallet_identifier' : 'sam_shamcash_wallet_identifier';
  const value = data?.[column];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function checkTransferSourceBalance(
  apiKey: string,
  method: string,
  source: string,
  currency: string,
  amount: number,
): Promise<{ ok: true } | { ok: false; message: string; code: string }> {
  const path = `/v1/wallets/${method}/${encodeURIComponent(source)}/balance`;
  const { res, data } = await samFetch(apiKey, path);
  if (!res.ok) return { ok: true };

  const balances = Array.isArray(data) ? data : [];
  const entry = balances.find(
    (b) => String((b as Json).currency || '').toUpperCase() === currency,
  ) as Json | undefined;
  if (!entry) return { ok: true };

  const available = Number(entry.amount ?? entry.balance ?? 0);
  if (Number.isFinite(available) && available > 0 && available < amount) {
    return {
      ok: false,
      message: `Insufficient ${currency} balance in the source wallet (${available.toFixed(2)} available).`,
      code: 'SAM_INSUFFICIENT_BALANCE',
    };
  }

  return { ok: true };
}

function buildWebhookUrl(supabaseUrl: string, token: string) {
  const base = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/sam-api`;
  return `${base}?token=${encodeURIComponent(token)}`;
}

function sypForUsd(usd: number, rate: number): number {
  if (!Number.isFinite(usd) || !Number.isFinite(rate) || rate <= 0) return 0;
  return Math.round(usd * rate);
}

function parsePaidAmount(payload: Json, fallback: unknown): number | null {
  const raw = payload.paidAmount ?? payload.amount ?? fallback;
  const num = typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''));
  return Number.isFinite(num) && num > 0 ? Math.round(num * 100) / 100 : null;
}

function invoiceAmountString(amount: number, currency: string): string {
  if (currency === 'SYP') return String(Math.round(amount));
  return Number(amount).toFixed(2);
}

const ADMIN_ACTIONS = new Set([
  'getSettings',
  'saveSettings',
  'listWallets',
  'getBalance',
  'getAllWalletBalances',
  'listInvoices',
  'listRechargeHistory',
  'getWalletTransactions',
  'transfer',
  'listTransfers',
  'clearTransfers',
]);

const USER_ACTIONS = new Set(['createInvoice', 'verifyInvoice', 'getInvoiceStatus']);

function paymentMethodToSam(method: string) {
  if (method === 'SyriatelCash') return 'syriatel';
  return 'shamcash';
}

function walletIdentifierCandidates(wallet: Record<string, unknown>): string[] {
  return [
    wallet.walletAddress,
    wallet.phone,
    wallet.cashCode,
    wallet.accountNumber,
    wallet.id,
  ]
    .filter((value) => value != null && String(value).trim() !== '')
    .map((value) => String(value).trim());
}

function invoiceIdentifierForWallet(wallet: Record<string, unknown>, provider: string): string | null {
  if (provider === 'syriatel') {
    const identifier = String(wallet.phone || wallet.cashCode || wallet.walletAddress || wallet.id || '').trim();
    return identifier || null;
  }

  const identifier = String(
    wallet.walletAddress || wallet.accountNumber || wallet.phone || wallet.id || '',
  ).trim();
  return identifier || null;
}

async function resolveSamInvoiceIdentifier(
  apiKey: string,
  samMethod: string,
  storedIdentifier: string,
): Promise<{ identifier: string } | { error: string; code: string; samCode?: string }> {
  const stored = storedIdentifier.trim();
  if (!stored) {
    return {
      error: 'Sam API receiving wallet not configured',
      code: 'SAM_NOT_CONFIGURED',
    };
  }

  const { res, data } = await samFetch(apiKey, '/v1/wallets');
  if (!res.ok) {
    const mapped = mapSamInvoiceError(data, 'Failed to list Sam wallets');
    return {
      error: mapped.message,
      code: mapped.code,
      samCode: mapped.samCode,
    };
  }

  const wallets = Array.isArray(data) ? data : [];
  const normalizedStored = stored.toLowerCase();

  const match = wallets.find((wallet) => {
    const row = wallet as Record<string, unknown>;
    const provider = row.provider === 'syriatel' ? 'syriatel' : 'shamcash';
    if (provider !== samMethod) return false;
    return walletIdentifierCandidates(row).some((candidate) => candidate.toLowerCase() === normalizedStored);
  }) as Record<string, unknown> | undefined;

  if (!match) {
    return {
      error: 'Sam receiving wallet not found. In Admin → Payments → Sam API, click "Test wallets", pick a linked wallet, then Save.',
      code: 'SAM_NOT_FOUND',
      samCode: 'NOT_FOUND',
    };
  }

  const identifier = invoiceIdentifierForWallet(match, samMethod);
  if (!identifier) {
    return {
      error: 'Linked Sam wallet has no usable identifier for invoices.',
      code: 'SAM_INVALID_IDENTIFIER',
      samCode: 'INVALID_IDENTIFIER',
    };
  }

  return { identifier };
}

async function triggerG2bulkFulfillment(orderId: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (!supabaseUrl || !serviceRoleKey || !orderId) return;

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/g2bulk`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'fulfillOrder', orderId }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('G2Bulk fulfillOrder after Sam payment:', payload);
    }
  } catch (err) {
    console.error('G2Bulk fulfillOrder invoke failed:', err);
  }
}

async function completeEntityAfterPaid(
  serviceClient: ReturnType<typeof createClient>,
  row: Record<string, unknown>,
) {
  if (!row.entity_id) return null;

  if (row.entity_type === 'order') {
    const { data, error } = await serviceClient.rpc('complete_order_from_sam_invoice', {
      p_sam_invoice_id: row.sam_invoice_id,
    });

    if (error) {
      console.error('complete_order_from_sam_invoice:', error.message);
      return { error: error.message };
    }

    const orderId = String((data as Json)?.orderId || row.entity_id || '');
    if (orderId) {
      await triggerG2bulkFulfillment(orderId);
    }

    return data;
  }

  if (row.entity_type === 'recharge') {
    const { data, error } = await serviceClient.rpc('complete_recharge_from_sam_invoice', {
      p_sam_invoice_id: row.sam_invoice_id,
    });

    if (error) {
      console.error('complete_recharge_from_sam_invoice:', error.message);
      return { error: error.message };
    }

    return data;
  }

  return null;
}

async function cancelEntityAfterExpired(
  serviceClient: ReturnType<typeof createClient>,
  row: Record<string, unknown>,
) {
  if (!row.entity_id) return null;

  if (row.entity_type === 'order') {
    const { data, error } = await serviceClient.rpc('cancel_order_from_sam_invoice', {
      p_sam_invoice_id: row.sam_invoice_id,
    });

    if (error) {
      console.error('cancel_order_from_sam_invoice:', error.message);
      return { error: error.message };
    }

    return data;
  }

  if (row.entity_type === 'recharge') {
    const { data, error } = await serviceClient.rpc('cancel_recharge_from_sam_invoice', {
      p_sam_invoice_id: row.sam_invoice_id,
    });

    if (error) {
      console.error('cancel_recharge_from_sam_invoice:', error.message);
      return { error: error.message };
    }

    return data;
  }

  return null;
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
    const currency = String(body.currency ?? '');
    const method = String(body.method ?? '');

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

      const paidAmount = parsePaidAmount(body as Json, row.amount);

      await serviceClient
        .from('sam_invoices')
        .update({
          status: 'paid',
          paid_amount: paidAmount,
          transaction_ref: typeof body.transactionRef === 'string' ? body.transactionRef : row.transaction_ref,
          paid_at: typeof body.paidAt === 'string' ? body.paidAt : new Date().toISOString(),
          webhook_received_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);

      const completion = await completeEntityAfterPaid(serviceClient, row as Record<string, unknown>);

      return jsonResponse({ success: true, status: 'paid', completion });
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

      const cancellation = await cancelEntityAfterExpired(serviceClient, row as Record<string, unknown>);

      return jsonResponse({ success: true, status: 'expired', cancellation });
    }

    return jsonResponse({ success: false, message: 'Unsupported webhook event' }, 400);
  }

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) {
    return jsonResponse({ success: false, message: 'Unauthorized' }, 401);
  }
  const userId = authData.user.id;
  const userIsAdmin = await isAdmin(userClient, userId);

  if (ADMIN_ACTIONS.has(action) && !userIsAdmin) {
    return jsonResponse({ success: false, message: 'Admin only' }, 403);
  }

  if (!ADMIN_ACTIONS.has(action) && !USER_ACTIONS.has(action)) {
    return jsonResponse({ success: false, message: `Unknown action: ${action}` }, 400);
  }

  if (USER_ACTIONS.has(action)) {
    const apiKey = await resolveSamApiKey(serviceClient);
    if (!apiKey) {
      return jsonResponse({ success: false, message: 'Sam API key not configured' }, 400);
    }

    if (action === 'createInvoice') {
      const entityType = String(body.entityType || '');
      const entityId = String(body.entityId || '');
      const paymentMethod = String(body.paymentMethod || 'ShamCash');

      if (!entityType || !entityId) {
        return jsonResponse({ success: false, message: 'entityType and entityId required' }, 400);
      }
      if (entityType !== 'order' && entityType !== 'recharge') {
        return jsonResponse({ success: false, message: 'Unsupported entity type' }, 400);
      }
      if (paymentMethod !== 'ShamCash' && paymentMethod !== 'SyriatelCash') {
        return jsonResponse({ success: false, message: 'Invalid payment method' }, 400);
      }

      let invoiceAmount = 0;
      let requestedUsdAmount: number | null = null;
      let sypPerUsdSnapshot: number | null = null;
      let payCurrency = 'USD';

      if (entityType === 'order') {
        const { data: order } = await serviceClient
          .from('orders')
          .select('id, user_id, total, status, payment_method')
          .eq('id', entityId)
          .maybeSingle();

        if (!order || order.user_id !== userId) {
          return jsonResponse({ success: false, message: 'Order not found' }, 404);
        }
        if (order.status !== 'pending_payment') {
          return jsonResponse({ success: false, message: 'Order is not awaiting payment' }, 400);
        }
        if (order.payment_method !== paymentMethod) {
          return jsonResponse({ success: false, message: 'Payment method mismatch' }, 400);
        }

        invoiceAmount = order.total;
      } else {
        if (userIsAdmin) {
          return jsonResponse({
            success: false,
            message: 'Admin accounts cannot recharge store balance from the storefront',
            code: 'ADMIN_RECHARGE_FORBIDDEN',
          }, 403);
        }

        const { data: recharge } = await serviceClient
          .from('recharge_requests')
          .select('id, user_id, amount, status, payment_method, pay_currency, syp_per_usd_snapshot')
          .eq('id', entityId)
          .maybeSingle();

        if (!recharge || recharge.user_id !== userId) {
          return jsonResponse({ success: false, message: 'Recharge request not found' }, 404);
        }
        if (recharge.status !== 'pending') {
          return jsonResponse({ success: false, message: 'Recharge request is not awaiting payment' }, 400);
        }
        if (recharge.payment_method !== paymentMethod) {
          return jsonResponse({ success: false, message: 'Payment method mismatch' }, 400);
        }

        invoiceAmount = recharge.amount;
        payCurrency = String(recharge.pay_currency || 'USD').toUpperCase();
        requestedUsdAmount = Number(recharge.amount);
        if (payCurrency === 'SYP') {
          sypPerUsdSnapshot = Number(recharge.syp_per_usd_snapshot) || null;
        }
      }

      const { data: existing } = await serviceClient
        .from('sam_invoices')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing?.payment_url && existing?.sam_invoice_id) {
        return jsonResponse({
          success: true,
          invoice: {
            samInvoiceId: existing.sam_invoice_id,
            paymentUrl: existing.payment_url,
            expiresAt: existing.expires_at,
            amount: existing.amount,
            currency: existing.currency,
            status: existing.status,
            requestedUsdAmount: existing.requested_usd_amount ?? null,
          },
        });
      }

      const { data: settings } = await serviceClient
        .from('store_settings')
        .select(
          'sam_wallet_mode, sam_api_enabled, sam_invoice_currency, sam_syp_per_usd, sam_shamcash_wallet_identifier, sam_syriatel_wallet_identifier, sam_webhook_secret',
        )
        .eq('id', 1)
        .maybeSingle();

      if (!settings || settings.sam_wallet_mode !== 'api' || !settings.sam_api_enabled) {
        return jsonResponse({ success: false, message: 'Sam API wallet mode is not enabled' }, 400);
      }

      const samMethod = paymentMethodToSam(paymentMethod);
      const storedIdentifier = samMethod === 'syriatel'
        ? String(settings.sam_syriatel_wallet_identifier || '').trim()
        : String(settings.sam_shamcash_wallet_identifier || '').trim();
      let currency = String(settings.sam_invoice_currency || 'USD');
      const storeSypRate = Number(settings.sam_syp_per_usd) || 135;

      if (entityType === 'recharge') {
        if (payCurrency === 'SYP') {
          const rate = sypPerUsdSnapshot && sypPerUsdSnapshot > 0 ? sypPerUsdSnapshot : storeSypRate;
          sypPerUsdSnapshot = rate;
          currency = 'SYP';
          invoiceAmount = sypForUsd(requestedUsdAmount || invoiceAmount, rate);
          if (invoiceAmount <= 0) {
            return jsonResponse({ success: false, message: 'Invalid SYP invoice amount' }, 400);
          }
        } else {
          currency = 'USD';
          requestedUsdAmount = requestedUsdAmount ?? invoiceAmount;
        }
      }

      const webhookSecret = await resolveWebhookSecret(serviceClient);

      if (!storedIdentifier || !webhookSecret) {
        return jsonResponse({ success: false, message: 'Sam API receiving wallet not configured' }, 400);
      }

      const resolved = await resolveSamInvoiceIdentifier(apiKey, samMethod, storedIdentifier);
      if ('error' in resolved) {
        return jsonResponse({
          success: false,
          message: resolved.error,
          code: resolved.code,
          samCode: resolved.samCode,
        }, 400);
      }

      const identifier = resolved.identifier;
      const amountStr = invoiceAmountString(invoiceAmount, currency);
      const webhookUrl = buildWebhookUrl(supabaseUrl, webhookSecret);

      const { res, data } = await samFetch(apiKey, '/v1/invoices', {
        method: 'POST',
        body: JSON.stringify({
          method: samMethod,
          identifier,
          amount: amountStr,
          currency,
          webhookUrl,
        }),
      });

      if (!res.ok) {
        const mapped = mapSamInvoiceError(data, 'Failed to create invoice');
        return jsonResponse({
          success: false,
          message: mapped.message,
          code: mapped.code,
          samCode: mapped.samCode,
        }, res.status);
      }

      const samInvoiceId = String(data.invoiceId || '');
      const paymentUrl = String(data.paymentUrl || '');
      const expiresAt = typeof data.expiresAt === 'string' ? data.expiresAt : null;

      if (!samInvoiceId || !paymentUrl) {
        return jsonResponse({ success: false, message: 'Invalid invoice response from Sam API' }, 502);
      }

      const insertRow: Record<string, unknown> = {
        user_id: userId,
        entity_type: entityType,
        entity_id: entityId,
        sam_invoice_id: samInvoiceId,
        payment_url: paymentUrl,
        amount: invoiceAmount,
        currency,
        method: samMethod,
        status: 'pending',
        expires_at: expiresAt,
      };

      if (entityType === 'recharge') {
        insertRow.requested_usd_amount = requestedUsdAmount ?? invoiceAmount;
        if (currency === 'SYP' && sypPerUsdSnapshot) {
          insertRow.syp_per_usd_snapshot = sypPerUsdSnapshot;
        }
      }

      const { error: insertError } = await serviceClient.from('sam_invoices').insert(insertRow);

      if (insertError) {
        return jsonResponse({ success: false, message: insertError.message }, 400);
      }

      return jsonResponse({
        success: true,
        invoice: {
          samInvoiceId,
          paymentUrl,
          expiresAt,
          amount: invoiceAmount,
          currency,
          status: 'pending',
          requestedUsdAmount: entityType === 'recharge' ? (requestedUsdAmount ?? invoiceAmount) : null,
        },
      });
    }

    if (action === 'verifyInvoice') {
      const samInvoiceId = String(body.samInvoiceId || '').trim();
      const transactionRef = String(body.transactionRef || '').trim();

      if (!samInvoiceId || !transactionRef) {
        return jsonResponse({ success: false, message: 'samInvoiceId and transactionRef required' }, 400);
      }

      const { data: row } = await serviceClient
        .from('sam_invoices')
        .select('*')
        .eq('sam_invoice_id', samInvoiceId)
        .maybeSingle();

      if (!row || row.user_id !== userId) {
        return jsonResponse({ success: false, message: 'Invoice not found' }, 404);
      }

      if (row.status === 'paid') {
        const completion = await completeEntityAfterPaid(serviceClient, row as Record<string, unknown>);
        return jsonResponse({ success: true, verified: true, status: 'paid', completion });
      }

      if (row.status === 'expired') {
        return jsonResponse({ success: false, message: 'EXPIRED: Invoice expired', code: 'EXPIRED' }, 410);
      }

      const { res, data } = await samFetch(apiKey, `/pay/${encodeURIComponent(samInvoiceId)}/verify`, {
        method: 'POST',
        body: JSON.stringify({ transactionRef }),
      });

      if (res.status === 410) {
        await serviceClient
          .from('sam_invoices')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .eq('id', row.id);
        await cancelEntityAfterExpired(serviceClient, row as Record<string, unknown>);
        return jsonResponse({ success: false, message: 'EXPIRED: Invoice expired', code: 'EXPIRED' }, 410);
      }

      if (!res.ok) {
        return jsonResponse({ success: false, message: samErrorMessage(data, 'Verification failed') }, res.status);
      }

      const verified = data.verified === true;
      if (!verified) {
        return jsonResponse({
          success: true,
          verified: false,
          message: typeof data.message === 'string' ? data.message : 'Payment not found',
        });
      }

      let paidAmount = parsePaidAmount(data as Json, row.amount);
      if (paidAmount == null) {
        const { res: payRes, data: payData } = await samFetch(apiKey, `/pay/${encodeURIComponent(samInvoiceId)}`);
        if (payRes.ok) {
          paidAmount = parsePaidAmount(payData as Json, row.amount);
        }
      }

      await serviceClient
        .from('sam_invoices')
        .update({
          status: 'paid',
          paid_amount: paidAmount,
          transaction_ref: transactionRef,
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);

      const completion = await completeEntityAfterPaid(serviceClient, {
        ...row,
        transaction_ref: transactionRef,
        paid_amount: paidAmount,
        status: 'paid',
      } as Record<string, unknown>);

      return jsonResponse({ success: true, verified: true, status: 'paid', completion });
    }

    if (action === 'getInvoiceStatus') {
      const samInvoiceId = String(body.samInvoiceId || '').trim();
      if (!samInvoiceId) {
        return jsonResponse({ success: false, message: 'samInvoiceId required' }, 400);
      }

      const { data: row } = await serviceClient
        .from('sam_invoices')
        .select('*')
        .eq('sam_invoice_id', samInvoiceId)
        .maybeSingle();

      if (!row || row.user_id !== userId) {
        return jsonResponse({ success: false, message: 'Invoice not found' }, 404);
      }

      if (row.status === 'pending') {
        const { res, data } = await samFetch(apiKey, `/pay/${encodeURIComponent(samInvoiceId)}`);
        if (res.ok && data.status === 'paid') {
          const paidAmount = parsePaidAmount(data as Json, row.amount);

          await serviceClient
            .from('sam_invoices')
            .update({
              status: 'paid',
              paid_amount: paidAmount,
              paid_at: typeof data.paidAt === 'string' ? data.paidAt : new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', row.id);

          const completion = await completeEntityAfterPaid(serviceClient, {
            ...row,
            status: 'paid',
            paid_amount: paidAmount,
          } as Record<string, unknown>);

          return jsonResponse({ success: true, status: 'paid', completion });
        }
        if (res.status === 410 || data.status === 'expired' || data.code === 'EXPIRED') {
          await serviceClient
            .from('sam_invoices')
            .update({ status: 'expired', updated_at: new Date().toISOString() })
            .eq('id', row.id);
          await cancelEntityAfterExpired(serviceClient, row as Record<string, unknown>);
          return jsonResponse({ success: true, status: 'expired' });
        }
      }

      let completion: unknown = null;
      if (row.status === 'paid') {
        completion = await completeEntityAfterPaid(serviceClient, row as Record<string, unknown>);
      }

      let orderStatus: string | null = null;
      let rechargeStatus: string | null = null;

      if (row.entity_type === 'order' && row.entity_id) {
        const { data: order } = await serviceClient
          .from('orders')
          .select('status')
          .eq('id', row.entity_id)
          .maybeSingle();
        orderStatus = (order?.status as string) || null;
      }

      if (row.entity_type === 'recharge' && row.entity_id) {
        const { data: recharge } = await serviceClient
          .from('recharge_requests')
          .select('status')
          .eq('id', row.entity_id)
          .maybeSingle();
        rechargeStatus = (recharge?.status as string) || null;
      }

      return jsonResponse({
        success: true,
        status: row.status,
        orderStatus,
        rechargeStatus,
        completion,
        expiresAt: row.expires_at,
        paymentUrl: row.payment_url,
      });
    }

    return jsonResponse({ success: false, message: `Unknown action: ${action}` }, 400);
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
    const sypRaw = body.sypPerUsd;
    const sypPerUsd = sypRaw !== undefined && sypRaw !== null && sypRaw !== ''
      ? Number(sypRaw)
      : null;

    const { data, error } = await userClient.rpc('save_sam_api_settings', {
      p_enabled: body.enabled ?? false,
      p_wallet_mode: body.walletMode ?? 'manual',
      p_shamcash_wallet_identifier: body.shamcashWalletIdentifier ?? null,
      p_syriatel_wallet_identifier: body.syriatelWalletIdentifier ?? null,
      p_invoice_currency: body.invoiceCurrency ?? 'USD',
      p_api_key: body.apiKey !== undefined ? body.apiKey : null,
      p_regenerate_webhook_secret: !!body.regenerateWebhookSecret,
      p_clear_api_key: !!body.clearApiKey,
      p_syp_per_usd: Number.isFinite(sypPerUsd) && sypPerUsd > 0 ? sypPerUsd : null,
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

  if (action === 'listInvoices') {
    const status = typeof body.status === 'string' && body.status ? String(body.status) : '';
    const method = typeof body.method === 'string' && body.method ? String(body.method) : '';
    const entityType = typeof body.entityType === 'string' && body.entityType ? String(body.entityType) : '';
    const search = typeof body.search === 'string' ? String(body.search).trim() : '';
    const rawPage = Number(body.page);
    const rawPageSize = Number(body.pageSize);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
    const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(Math.floor(rawPageSize), 100) : 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const allowedStatus = new Set(['pending', 'paid', 'expired', 'failed', 'cancelled']);
    const allowedMethods = new Set(['shamcash', 'syriatel']);
    const allowedEntityTypes = new Set(['recharge', 'order']);

    const applyFilters = <T extends ReturnType<typeof serviceClient.from>>(q: T): T => {
      let b = q;
      if (allowedStatus.has(status)) b = b.eq('status', status) as T;
      if (allowedMethods.has(method)) b = b.eq('method', method) as T;
      if (allowedEntityTypes.has(entityType)) b = b.eq('entity_type', entityType) as T;
      if (search) {
        const like = `%${search}%`;
        b = b.or(`transaction_ref.ilike.${like},sam_invoice_id.ilike.${like}`) as T;
      }
      return b;
    };

    const [statusAgg, collectedAgg] = await Promise.all([
      applyFilters(serviceClient.from('sam_invoices').select('status, count()')),
      applyFilters(serviceClient.from('sam_invoices').select('currency, sum(paid_amount)')),
    ]);

    const byStatus: Record<string, number> = { pending: 0, paid: 0, expired: 0, failed: 0, cancelled: 0 };
    for (const row of (statusAgg.data || []) as { status?: string; count?: number }[]) {
      const key = String(row.status || '');
      if (key in byStatus) byStatus[key] = Number(row.count) || 0;
    }
    const collectedByCurrency: Record<string, number> = {};
    for (const row of (collectedAgg.data || []) as { currency?: string; sum?: number | null }[]) {
      const key = String(row.currency || '');
      const value = Number(row.sum || 0);
      if (key && value > 0) collectedByCurrency[key] = value;
    }

    let query: ReturnType<typeof serviceClient.from> = serviceClient
      .from('sam_invoices')
      .select(
        'id, user_id, entity_type, entity_id, sam_invoice_id, payment_url, amount, requested_usd_amount, paid_amount, syp_per_usd_snapshot, currency, method, status, transaction_ref, webhook_received_at, paid_at, expires_at, created_at, updated_at',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(from, to);

    query = applyFilters(query);

    const { data: invoices, error, count } = await query;
    if (error) {
      return jsonResponse({ success: false, message: error.message }, 400);
    }

    const rows = Array.isArray(invoices) ? invoices : [];
    const stats = {
      total: count ?? rows.length,
      byStatus,
      collectedByCurrency,
    };
    const entityRefs = rows
      .filter((row) => row.entity_id && (row.entity_type === 'recharge' || row.entity_type === 'order'))
      .map((row) => row.entity_id as string);
    const userIds = rows.map((row) => row.user_id as string).filter(Boolean);

    const [entityResult, profileResult] = await Promise.all([
      entityRefs.length
        ? serviceClient
            .from('recharge_requests')
            .select('id, reference')
            .in('id', entityRefs)
        : Promise.resolve({ data: [] }),
      userIds.length
        ? serviceClient.from('profiles').select('id, name').in('id', userIds)
        : Promise.resolve({ data: [] }),
    ]);

    const rechargeRefs = new Map<string, string>();
    for (const row of (entityResult.data as { id: string; reference: string }[]) || []) {
      rechargeRefs.set(row.id, row.reference);
    }
    const profileNames = new Map<string, string>();
    for (const row of (profileResult.data as { id: string; name: string | null }[]) || []) {
      if (row.name) profileNames.set(row.id, row.name);
    }

    return jsonResponse({
      success: true,
      invoices: rows.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        reference: row.entity_type === 'recharge' ? (rechargeRefs.get(String(row.entity_id)) || null) : null,
        customer_name: profileNames.get(String(row.user_id)) || null,
        sam_invoice_id: row.sam_invoice_id,
        payment_url: row.payment_url,
        amount: row.amount,
        requested_usd_amount: row.requested_usd_amount,
        paid_amount: row.paid_amount,
        syp_per_usd_snapshot: row.syp_per_usd_snapshot,
        currency: row.currency,
        method: row.method,
        status: row.status,
        transaction_ref: row.transaction_ref,
        webhook_received_at: row.webhook_received_at,
        paid_at: row.paid_at,
        expires_at: row.expires_at,
        created_at: row.created_at,
      })),
      total: count ?? rows.length,
      page,
      pageSize,
      stats,
    });
  }

  if (action === 'listRechargeHistory') {
    const search = typeof body.search === 'string' ? String(body.search).trim().toLowerCase() : '';
    const status = typeof body.status === 'string' ? String(body.status).trim().toLowerCase() : '';
    const method = typeof body.method === 'string' ? String(body.method).trim().toLowerCase() : '';
    const rawPage = Number(body.page);
    const rawPageSize = Number(body.pageSize);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
    const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(Math.floor(rawPageSize), 100) : 25;

    // The RPC owns the union, exact count, filters, and deterministic event/id ordering;
    // the edge function never downloads historical source rows to merge or slice.
    // The RPC validates the passed admin id (service role has no auth.uid()).
    const { data, error } = await serviceClient.rpc('list_admin_recharge_history', {
      p_page: page,
      p_page_size: pageSize,
      p_search: search,
      p_status: status,
      p_method: method,
      p_admin_id: userId,
    });
    if (error) {
      return jsonResponse({ success: false, message: error.message }, 400);
    }
    return jsonResponse({
      success: true,
      ...((data || {}) as Record<string, unknown>),
    });
  }

  if (action === 'getWalletTransactions') {
    const provider = String(body.provider || '').trim();
    const identifier = String(body.identifier || '').trim();
    const direction = String(body.direction || 'all').trim();

    if (provider !== 'shamcash' && provider !== 'syriatel') {
      return jsonResponse({ success: false, message: 'Invalid provider' }, 400);
    }
    if (!identifier) {
      return jsonResponse({ success: false, message: 'identifier required' }, 400);
    }
    const dir = direction === 'in' || direction === 'out' ? direction : 'all';
    const query = dir === 'all' ? '' : `?direction=${dir}`;

    const walletApiKey = await resolveSamApiKey(serviceClient);
    if (!walletApiKey) {
      return jsonResponse({ success: false, message: 'Sam API key not configured' }, 400);
    }

    const { res, data } = await samFetch(
      walletApiKey,
      `/v1/wallets/${provider}/${encodeURIComponent(identifier)}/transactions${query}`,
    );
    if (!res.ok) {
      return jsonResponse({ success: false, message: samErrorMessage(data, 'Failed to read wallet transactions') }, res.status);
    }

    const list = Array.isArray(data) ? data : [];
    return jsonResponse({ success: true, provider, identifier, direction: dir, transactions: list });
  }

  const apiKey = await resolveSamApiKey(serviceClient);
  if (!apiKey && action !== 'transfer') {
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

  if (action === 'transfer') {
    const requestedMethod = String(body.method || '').trim().toLowerCase();
    const validMethod = requestedMethod === 'shamcash' || requestedMethod === 'syriatel';
    const method = validMethod ? requestedMethod : 'shamcash';
    const source = validMethod ? await resolveTransferSourceIdentifier(serviceClient, method) : null;
    const rawAmount = Number(body.amount);
    const roundedAmount = Math.round(rawAmount * 100) / 100;
    const validAmount = Number.isFinite(rawAmount) && rawAmount > 0 && roundedAmount > 0;
    const amount = roundedAmount;

    const requestedCurrency = String(body.currency || '').trim().toUpperCase();
    let currency = requestedCurrency;
    let currencyId = Number(body.currencyId);
    if (currency && CURRENCY_IDS[currency]) {
      currencyId = CURRENCY_IDS[currency];
    } else if (Number.isFinite(currencyId) && CURRENCY_ID_TO_CODE[currencyId]) {
      currency = CURRENCY_ID_TO_CODE[currencyId];
    } else {
      currency = '';
    }
    const validCurrency = Boolean(currency && CURRENCY_IDS[currency]);

    const recipient = String(body.recipient || '').trim();
    const note = typeof body.note === 'string' ? String(body.note).trim() || null : null;
    const auditAmount = validAmount && amount <= 999999999999.99 ? amount : 0.01;
    const auditCurrency = validCurrency ? currency : 'USD';
    let verifiedCustomerId: string | null = null;
    const recordAttempt = async (status: 'failed' | 'completed', samMessage: string) => {
      const { error } = await serviceClient.from('sam_transfers').insert({
        created_by: userId,
        customer_id: verifiedCustomerId,
        method,
        source_identifier: source,
        recipient_identifier: recipient,
        currency: auditCurrency,
        amount: auditAmount,
        note,
        status,
        sam_message: samMessage,
      });
      if (error) console.error('sam_transfers insert:', error.message);
    };

    if (!validMethod) {
      const message = 'Invalid transfer method; expected shamcash or syriatel.';
      await recordAttempt('failed', message);
      return jsonResponse({ success: false, message, code: 'SAM_VALIDATION' }, 400);
    }

    const suppliedCustomerId = typeof body.customerId === 'string' ? body.customerId.trim() : '';
    if (suppliedCustomerId) {
      if (!UUID_RE.test(suppliedCustomerId)) {
        const message = 'Customer must be a valid customer profile.';
        await recordAttempt('failed', message);
        return jsonResponse({ success: false, message, code: 'SAM_VALIDATION' }, 400);
      }

      const { data: customerProfile, error: customerError } = await serviceClient
        .from('profiles')
        .select('id, role')
        .eq('id', suppliedCustomerId)
        .maybeSingle();

      if (customerError || !customerProfile || customerProfile.role !== 'user') {
        const message = 'Customer profile was not found or is not a customer.';
        await recordAttempt('failed', message);
        return jsonResponse({ success: false, message, code: 'SAM_VALIDATION' }, 400);
      }

      verifiedCustomerId = customerProfile.id;
    }

    if (!validAmount) {
      const message = 'Amount must be a positive number';
      await recordAttempt('failed', message);
      return jsonResponse({ success: false, message }, 400);
    }
    if (!validCurrency) {
      const message = 'Invalid currency';
      await recordAttempt('failed', message);
      return jsonResponse({ success: false, message }, 400);
    }
    if (!source) {
      const message = method === 'syriatel'
        ? 'Syriatel source wallet is not configured. Set it in Admin → Payments → Sam API.'
        : 'ShamCash source wallet is not configured. Set it in Admin → Payments → Sam API.';
      await recordAttempt('failed', message);
      return jsonResponse({ success: false, message, code: 'SAM_NOT_CONFIGURED' }, 400);
    }
    if (!recipient) {
      const message = 'Recipient identifier required';
      await recordAttempt('failed', message);
      return jsonResponse({ success: false, message }, 400);
    }

    let transferBody: Json;
    if (method === 'shamcash') {
      if (!SHAMCASH_RECIPIENT_RE.test(recipient.toLowerCase())) {
        await recordAttempt('failed', 'Recipient must be a 32-character ShamCash wallet id (hex).');
        return jsonResponse({
          success: false,
          message: 'Recipient must be a 32-character ShamCash wallet id (hex).',
          code: 'SAM_VALIDATION',
        }, 400);
      }
      transferBody = {
        recipientAddress: recipient,
        currencyId,
        amount,
        note: typeof body.note === 'string' && body.note.trim() ? String(body.note).trim() : undefined,
      };
    } else {
      if (!SYRIATEL_RECIPIENT_RE.test(recipient)) {
        const message = 'Recipient must be a 10-digit Syriatel phone starting with 09 or an 8-digit cash code.';
        await recordAttempt('failed', message);
        return jsonResponse({ success: false, message, code: 'SAM_VALIDATION' }, 400);
      }
      const pinCode = String(body.pinCode || '').trim();
      if (!SYRIATEL_PIN_RE.test(pinCode)) {
        await recordAttempt('failed', 'Syriatel transfers require a 4-digit PIN.');
        return jsonResponse({ success: false, message: 'Syriatel transfers require a 4-digit PIN.' }, 400);
      }
      transferBody = { toGsmOrCode: recipient, amount, pinCode };
    }

    if (!apiKey) {
      const message = 'Sam API key not configured';
      await recordAttempt('failed', message);
      return jsonResponse({ success: false, message }, 400);
    }

    const balanceCheck = await checkTransferSourceBalance(apiKey, method, source, currency, amount);
    if (!balanceCheck.ok) {
      await recordAttempt('failed', balanceCheck.message);
      return jsonResponse({ success: false, message: balanceCheck.message, code: balanceCheck.code }, 400);
    }

    const { res, data } = await samFetch(apiKey, `/v1/wallets/${method}/${encodeURIComponent(source)}/transfer`, {
      method: 'POST',
      body: JSON.stringify(transferBody),
    });

    if (!res.ok) {
      const mapped = mapSamTransferError(data as Json, 'Failed to send transfer', res.status);
      const detail = samErrorMessage(data as Json, mapped.message, res.status);
      await recordAttempt('failed', detail);
      return jsonResponse({ success: false, message: mapped.message, code: mapped.code, samCode: mapped.samCode }, res.status);
    }

    const { data: insertRow, error: insertError } = await serviceClient.from('sam_transfers').insert({
      created_by: userId,
      customer_id: verifiedCustomerId,
      method,
      source_identifier: source,
      recipient_identifier: recipient,
      currency,
      amount,
      note,
      status: 'completed',
      sam_message: typeof data.message === 'string' ? data.message : null,
    }).select('id, created_at').single();

    if (insertError) {
      console.error('sam_transfers insert:', insertError.message);
    }

    return jsonResponse({
      success: true,
      transfer: {
        id: insertRow?.id,
        method,
        sourceIdentifier: source,
        recipientIdentifier: recipient,
        currency,
        amount,
        note: typeof body.note === 'string' ? String(body.note).trim() || null : null,
        status: 'completed',
        customerId: verifiedCustomerId,
        createdAt: insertRow?.created_at || new Date().toISOString(),
      },
    });
  }

  if (action === 'listTransfers') {
    const rawPage = Number(body.page);
    const rawPageSize = Number(body.pageSize);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
    const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(Math.floor(rawPageSize), 100) : 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query: ReturnType<typeof serviceClient.from> = serviceClient
      .from('sam_transfers')
      .select('*', { count: 'exact' });
    const methodFilter = String(body.method || '');
    if (methodFilter === 'shamcash' || methodFilter === 'syriatel') {
      query = query.eq('method', methodFilter);
    }
    const statusFilter = String(body.status || '');
    if (statusFilter === 'completed' || statusFilter === 'failed') {
      query = query.eq('status', statusFilter);
    }

    const { data: rows, count, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      return jsonResponse({ success: false, message: error.message }, 400);
    }

    const list = (rows || []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: row.id,
        createdBy: row.created_by || null,
        customerId: row.customer_id || null,
        method: row.method,
        sourceIdentifier: row.source_identifier || null,
        recipientIdentifier: row.recipient_identifier,
        currency: row.currency,
        amount: Number(row.amount) || 0,
        note: row.note || null,
        status: row.status,
        samMessage: row.sam_message || null,
        createdAt: row.created_at,
      };
    });

    const adminIds = [...new Set(list.map((t) => t.createdBy).filter(Boolean))] as string[];
    const customerIds = [...new Set(list.map((t) => t.customerId).filter(Boolean))] as string[];
    let adminsByName: Record<string, { username?: string; name?: string }> = {};
    let customersByName: Record<string, { username?: string; name?: string }> = {};
    if (adminIds.length > 0) {
      const { data: adminRows } = await serviceClient
        .from('profiles')
        .select('id, username, name')
        .in('id', adminIds);
      for (const r of (adminRows || [])) {
        const row = r as Record<string, unknown>;
        adminsByName[String(row.id)] = { username: row.username as string, name: row.name as string };
      }
    }
    if (customerIds.length > 0) {
      const { data: customerRows } = await serviceClient
        .from('profiles')
        .select('id, username, name')
        .in('id', customerIds);
      for (const r of (customerRows || [])) {
        const row = r as Record<string, unknown>;
        customersByName[String(row.id)] = { username: row.username as string, name: row.name as string };
      }
    }

    return jsonResponse({
      success: true,
      transfers: list.map((t) => ({
        ...t,
        admin: t.createdBy ? adminsByName[t.createdBy] || null : null,
        customer: t.customerId ? customersByName[t.customerId] || null : null,
      })),
      total: Number(count ?? 0),
      page,
      pageSize,
    });
  }

  if (action === 'clearTransfers') {
    const { error } = await serviceClient.from('sam_transfers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      return jsonResponse({ success: false, message: error.message }, 400);
    }
    return jsonResponse({ success: true, message: 'Transfer history cleared' });
  }

  return jsonResponse({ success: false, message: `Unknown action: ${action}` }, 400);
});
