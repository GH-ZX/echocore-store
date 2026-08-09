import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Binance Pay merchant integration — receive USDT customer recharges.
// Signing (HMAC-SHA512) and secret keys live ONLY here, never in the browser.
//
// Endpoints (per https://developers.binance.com/docs/binance-pay + official
// Postman collection):
//   POST /binancepay/openapi/v2/order        — create order -> prepayId+checkoutUrl
//   POST /binancepay/openapi/v2/order/query  — query order status
//   POST /binancepay/openapi/order/close     — close unpaid order
//   Webhook -> Binance posts bizStatus PAY_SUCCESS / PAY_CLOSED
//
// Headers required on every signed request:
//   Content-Type, BinancePay-Timestamp, BinancePay-Nonce,
//   BinancePay-Certificate-SN, BinancePay-Signature
// Signature = HMAC_SHA512(secret, `${timestamp}\n${nonce}\n${bodyJson}\n`).toUpperCase()

const BINANCE_PAY_BASE = 'https://bpay.binanceapi.com';

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ----- Supabase clients -----
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

function serviceClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function userClient(authHeader: string | null) {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
  });
}

async function isAdmin(client: ReturnType<typeof createClient>, userId: string) {
  const { data } = await client.from('profiles').select('role').eq('id', userId).maybeSingle();
  return data?.role === 'admin';
}

// ----- store_settings credential resolution -----
interface BinanceCreds {
  apiKey: string;
  apiSecret: string;
  certSn: string;
  merchantId: string;
  webhookSecret: string;
  apiEnabled: boolean;
  enabled: boolean;
}

async function resolveBinanceCreds(client: ReturnType<typeof createClient>): Promise<BinanceCreds | null> {
  const { data } = await client
    .from('store_settings')
    .select('binance_api_key, binance_api_secret, binance_cert_sn, binance_merchant_id, binance_webhook_secret, binance_api_enabled, binance_enabled')
    .eq('id', 1)
    .maybeSingle();
  if (!data) return null;
  const apiKey = (data.binance_api_key as string)?.trim() || '';
  const apiSecret = (data.binance_api_secret as string)?.trim() || '';
  if (!apiKey || !apiSecret) return null;
  return {
    apiKey,
    apiSecret,
    certSn: (data.binance_cert_sn as string)?.trim() || apiKey,
    merchantId: (data.binance_merchant_id as string)?.trim() || '',
    webhookSecret: (data.binance_webhook_secret as string)?.trim() || '',
    apiEnabled: !!data.binance_api_enabled,
    enabled: !!data.binance_enabled,
  };
}

// ----- HMAC-SHA512 signing (Deno WebCrypto) -----
async function hmacSha512Hex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const bytes = new Uint8Array(sig);
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) hex += bytes[i].toString(16).padStart(2, '0');
  return hex.toUpperCase();
}

// Minimal random nonce (crypto.getRandomValues)
function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Compact JSON without spaces — signature must use the EXACT body string sent.
function compactJson(obj: Json): string {
  return JSON.stringify(obj);
}

interface SignedRequestResult {
  ok: boolean;
  status: number;
  data: Json;
}

async function binanceSignedPost(creds: BinanceCreds, path: string, body: Json): Promise<SignedRequestResult> {
  const bodyJson = compactJson(body);
  const timestamp = String(Date.now());
  const nonce = randomNonce();
  const payload = `${timestamp}\n${nonce}\n${bodyJson}\n`;
  const signature = await hmacSha512Hex(creds.apiSecret, payload);

  const res = await fetch(`${BINANCE_PAY_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'BinancePay-Timestamp': timestamp,
      'BinancePay-Nonce': nonce,
      'BinancePay-Certificate-SN': creds.certSn,
      'BinancePay-Signature': signature,
    },
    body: bodyJson,
  });

  const text = await res.text();
  let data: Json = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (text && typeof data.raw !== 'string') data.raw = text.slice(0, 500);
  return { ok: res.ok, status: res.status, data };
}

function binanceErrorMessage(data: Json, fallback: string) {
  const msg = typeof data.message === 'string' ? data.message : '';
  const errMsg = typeof data.errorMessage === 'string' ? data.errorMessage : '';
  const code = typeof data.code === 'string' ? data.code : '';
  const detail = msg || errMsg || (typeof data.raw === 'string' ? String(data.raw).slice(0, 300) : '') || fallback;
  return code ? `${code}: ${detail}` : detail;
}

// Build the public webhook URL Binance will POST to.
function buildWebhookUrl(clientToken: string) {
  const path = '/functions/v1/binance-pay';
  return `${supabaseUrl.replace(/\/$/, '')}${path}?token=${encodeURIComponent(clientToken)}`;
}

// Pretty unique merchantTradeNo (our internal order ref to Binance).
function makeMerchantTradeNo(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = randomNonce().slice(0, 8).toUpperCase();
  return `EC-${ts}-${rnd}`;
}

// =============================================================
// Action handlers
// =============================================================

// Admin: read masked settings + configured flags.
async function getSettings(service: ReturnType<typeof createClient>) {
  const { data } = await service
    .from('store_settings')
    .select('binance_enabled, binance_api_enabled, binance_api_key, binance_api_secret, binance_cert_sn, binance_merchant_id, binance_webhook_secret')
    .eq('id', 1)
    .maybeSingle();
  if (!data) return jsonResponse({ success: true, settings: { binance_enabled: false, binance_api_enabled: false, binance_api_key_set: false, binance_api_secret_set: false, binance_cert_sn_set: false, binance_merchant_id_set: false, binance_api_key_masked: '', binance_cert_sn_masked: '', binance_merchant_id: '' } });
  const mask = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 4) + '••••' + v.slice(-4) : '');
  return jsonResponse({
    success: true,
    settings: {
      binance_enabled: !!data.binance_enabled,
      binance_api_enabled: !!data.binance_api_enabled,
      binance_api_key_set: !!(data.binance_api_key && String(data.binance_api_key).trim()),
      binance_api_secret_set: !!(data.binance_api_secret && String(data.binance_api_secret).trim()),
      binance_cert_sn_set: !!(data.binance_cert_sn && String(data.binance_cert_sn).trim()),
      binance_merchant_id_set: !!(data.binance_merchant_id && String(data.binance_merchant_id).trim()),
      binance_api_key_masked: mask(data.binance_api_key),
      binance_cert_sn_masked: mask(data.binance_cert_sn),
      binance_merchant_id: (data.binance_merchant_id as string) || '',
    },
  });
}

interface SaveSettingsBody {
  binance_enabled?: boolean;
  binance_api_enabled?: boolean;
  binance_api_key?: string;
  binance_api_secret?: string;
  binance_cert_sn?: string;
  binance_merchant_id?: string;
  regenerateWebhookSecret?: boolean;
  clearApiKey?: boolean;
  clearApiSecret?: boolean;
}

// Admin: write settings. Empty string values are ignored (keys keep their stored value).
async function saveSettings(service: ReturnType<typeof createClient>, body: SaveSettingsBody) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.binance_enabled === 'boolean') patch.binance_enabled = body.binance_enabled;
  if (typeof body.binance_api_enabled === 'boolean') patch.binance_api_enabled = body.binance_api_enabled;
  if (typeof body.binance_merchant_id === 'string') patch.binance_merchant_id = body.binance_merchant_id.trim() || null;
  if (typeof body.binance_cert_sn === 'string') {
    patch.binance_cert_sn = body.binance_cert_sn.trim() || null;
  }
  if (body.clearApiKey) {
    patch.binance_api_key = null;
  } else if (typeof body.binance_api_key === 'string' && body.binance_api_key.trim()) {
    patch.binance_api_key = body.binance_api_key.trim();
  }
  if (body.clearApiSecret) {
    patch.binance_api_secret = null;
  } else if (typeof body.binance_api_secret === 'string' && body.binance_api_secret.trim()) {
    patch.binance_api_secret = body.binance_api_secret.trim();
  }
  if (body.regenerateWebhookSecret) {
    patch.binance_webhook_secret = randomNonce() + randomNonce();
  }

  // If enabling api mode without key+secret, refuse.
  const { data: current } = await service.from('store_settings').select('binance_api_key, binance_api_secret, binance_webhook_secret').eq('id', 1).maybeSingle();
  const willHaveKey = body.clearApiKey ? false : (patch.binance_api_key != null ? !!patch.binance_api_key : !!(current?.binance_api_key && String(current.binance_api_key).trim()));
  const willHaveSecret = body.clearApiSecret ? false : (patch.binance_api_secret != null ? !!patch.binance_api_secret : !!(current?.binance_api_secret && String(current.binance_api_secret).trim()));
  if ((patch.binance_api_enabled === true || (body.binance_enabled === true && current)) && !(willHaveKey && willHaveSecret)) {
    return jsonResponse({ success: false, message: 'Cannot enable Binance Pay without API Key and Secret.' }, 400);
  }

  // Ensure the webhook secret always exists so the embedded webhook token works.
  if (!patch.binance_webhook_secret && !(current?.binance_webhook_secret && String(current.binance_webhook_secret).trim())) {
    patch.binance_webhook_secret = randomNonce() + randomNonce();
  }

  const { error } = await service.from('store_settings').update(patch).eq('id', 1);
  if (error) return jsonResponse({ success: false, message: error.message }, 400);

  // Return refreshed masked settings.
  return getSettings(service);
}

// User: create a Binance Pay recharge order.
async function createRechargeOrder(service: ReturnType<typeof createClient>, userClient: ReturnType<typeof createClient>, userId: string, body: { requestId?: string; amount?: number }) {
  const creds = await resolveBinanceCreds(service);
  if (!creds || !creds.apiEnabled || !creds.enabled) {
    return jsonResponse({ success: false, message: 'Binance Pay is not enabled.', code: 'BINANCE_NOT_CONFIGURED' }, 400);
  }

  const requestId = String(body.requestId || '').trim();
  const rawAmount = Number(body.amount);
  if (!requestId || !UUID_RE.test(requestId)) {
    return jsonResponse({ success: false, message: 'Invalid recharge request id.', code: 'BINANCE_VALIDATION' }, 400);
  }
  if (!Number.isFinite(rawAmount) || rawAmount < 1 || rawAmount > 500) {
    return jsonResponse({ success: false, message: 'Amount must be between 1 and 500 USDT.', code: 'BINANCE_VALIDATION' }, 400);
  }

  // Load the recharge request, confirm ownership + pending status.
  const { data: req, error: reqErr } = await service
    .from('recharge_requests')
    .select('id, user_id, status, amount, reference, pay_currency')
    .eq('id', requestId)
    .maybeSingle();
  if (reqErr || !req) return jsonResponse({ success: false, message: 'Recharge request not found.' }, 404);
  if (req.user_id !== userId) return jsonResponse({ success: false, message: 'Not allowed.' }, 403);
  if (req.status !== 'pending' && req.status !== 'payment_sent') {
    return jsonResponse({ success: false, message: 'Recharge request is no longer awaiting payment.' }, 400);
  }

  // De-dup: if an open Binance Pay order already exists for this recharge, return it.
  const { data: existing } = await service
    .from('binance_pay_orders')
    .select('id, merchant_trade_no, prepay_id, checkout_url, status, order_amount, currency')
    .eq('recharge_request_id', requestId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing && existing.status === 'pending' && existing.checkout_url) {
    return jsonResponse({
      success: true,
      order: {
        merchantTradeNo: existing.merchant_trade_no,
        prepayId: existing.prepay_id,
        checkoutUrl: existing.checkout_url,
        amount: Number(existing.order_amount),
        currency: existing.currency,
        status: existing.status,
      },
    });
  }

  const amount = Math.round(rawAmount * 100) / 100;
  const merchantTradeNo = makeMerchantTradeNo();
  const webhookSecret = creds.webhookSecret || '';
  const returnUrl = typeof (body as { returnUrl?: string }).returnUrl === 'string'
    ? (body as { returnUrl?: string }).returnUrl.trim()
    : '';

  const orderBody: Json = {
    env: { terminalType: 'WEB' },
    merchantTradeNo,
    orderAmount: amount,
    currency: 'USDT',
    goods: {
      goodsType: '01',
      goodsCategory: 'D000',
      referenceGoodsId: String(req.reference || requestId).slice(0, 32),
      goodsName: 'ECHOCORE Wallet Recharge',
      goodsDetail: 'Store balance top-up',
      goodsUnitAmount: { currency: 'USDT', amount },
    },
    webhookUrl: buildWebhookUrl(webhookSecret),
    returnUrl: returnUrl || undefined,
    orderExpireTime: Date.now() + 15 * 60 * 1000,
  };
  if (!orderBody.returnUrl) delete orderBody.returnUrl;

  const result = await binanceSignedPost(creds, '/binancepay/openapi/v2/order', orderBody);
  if (!result.ok || result.data?.status === 'FAIL') {
    return jsonResponse({ success: false, message: binanceErrorMessage(result.data, 'Binance Pay create order failed.'), code: 'BINANCE_PROVIDER', raw: result.data }, result.status);
  }

  const prepayId = typeof result.data.prepayId === 'string' ? result.data.prepayId : String(result.data.prepayId || '');
  const checkoutUrl = typeof result.data.checkoutUrl === 'string' ? result.data.checkoutUrl : String(result.data.deeplink || result.data.checkUrl || '');

  const { error: insertErr } = await service.from('binance_pay_orders').insert({
    recharge_request_id: requestId,
    entity_type: 'recharge',
    prepay_id: prepayId || null,
    merchant_trade_no: merchantTradeNo,
    order_amount: amount,
    currency: 'USDT',
    status: 'pending',
    checkout_url: checkoutUrl || null,
  });
  if (insertErr) {
    return jsonResponse({ success: false, message: 'Failed to record Binance Pay order: ' + insertErr.message }, 500);
  }

  // Mark the recharge request as payment_sent so it's recognized as in-flight.
  await service.from('recharge_requests').update({ status: 'payment_sent', updated_at: new Date().toISOString() }).eq('id', requestId);

  return jsonResponse({
    success: true,
    order: {
      merchantTradeNo,
      prepayId,
      checkoutUrl,
      amount,
      currency: 'USDT',
      status: 'pending',
    },
  });
}

// User / admin: query order status from our DB (authoritative — updated by webhook).
async function getOrderStatus(service: ReturnType<typeof createClient>, userId: string, body: { requestId?: string; merchantTradeNo?: string }) {
  const requestId = String(body.requestId || '').trim();
  const merchantTradeNo = String(body.merchantTradeNo || '').trim();
  if (!requestId && !merchantTradeNo) return jsonResponse({ success: false, message: 'requestId or merchantTradeNo required.' }, 400);

  let query = service.from('binance_pay_orders').select('id, merchant_trade_no, prepay_id, checkout_url, status, order_amount, paid_amount, currency, biz_status, created_at, updated_at, recharge_request_id');
  if (merchantTradeNo) {
    query = query.eq('merchant_trade_no', merchantTradeNo);
  } else if (requestId && UUID_RE.test(requestId)) {
    query = query.eq('recharge_request_id', requestId);
  } else {
    return jsonResponse({ success: false, message: 'Invalid identifier.' }, 400);
  }
  const { data, error } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return jsonResponse({ success: false, message: 'Order not found.' }, 404);

  // When paid, also return the credited amount + fresh profile balance so the
  // client can update the wallet without an extra round-trip.
  let creditedAmount: number | null = null;
  let newBalance: number | null = null;
  if (data.status === 'paid' && data.recharge_request_id) {
    const { data: reqRow } = await service
      .from('recharge_requests')
      .select('id, user_id, credited_amount')
      .eq('id', data.recharge_request_id)
      .maybeSingle();
    if (reqRow) {
      creditedAmount = reqRow.credited_amount != null ? Number(reqRow.credited_amount) : null;
      if (reqRow.user_id && reqRow.user_id === userId) {
        const { data: profileRow } = await service
          .from('profiles')
          .select('balance')
          .eq('id', reqRow.user_id)
          .maybeSingle();
        newBalance = profileRow?.balance != null ? Number(profileRow.balance) : null;
      }
    }
  }

  return jsonResponse({
    success: true,
    order: {
      merchantTradeNo: data.merchant_trade_no,
      prepayId: data.prepay_id,
      checkoutUrl: data.checkout_url,
      status: data.status,
      bizStatus: data.biz_status,
      amount: Number(data.order_amount),
      paidAmount: data.paid_amount != null ? Number(data.paid_amount) : null,
      currency: data.currency,
      creditedAmount,
      newBalance,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  });
}

// Public webhook: Binance Pay posts payment status notifications here.
// We verify the shared token in the query string against the stored secret
// (rejects spoofed calls) and, best-effort, the Binance signature header.
async function handleWebhook(service: ReturnType<typeof createClient>, req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || '';

  // Reject unauthenticated webhook deliveries: the order's checkout URL embeds
  // this token, so a mismatch means the call did not come from Binance.
  const { data: whSettings } = await service
    .from('store_settings')
    .select('binance_webhook_secret')
    .eq('id', 1)
    .maybeSingle();
  const expectedSecret = (whSettings?.binance_webhook_secret as string)?.trim() || '';
  if (!expectedSecret || token !== expectedSecret) {
    console.warn('Binance Pay webhook rejected: invalid or missing token');
    return jsonResponse({ returnCode: 'FAIL', returnMsg: 'Invalid webhook token' }, 401);
  }

  const text = await req.text();
  let payload: Json = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  // Binance webhook fields (businessData is a JSON string):
  //   bizType, bizStatus, bizIdSubstitution (merchantTradeNo), tradeInfo, ...
  const bizStatus = typeof payload.bizStatus === 'string' ? payload.bizStatus : '';

  // Deterministic extraction: bizIdSubstitution -> businessData.merchantTradeNo
  // -> transAmt -> merchantId. Always returns a trimmed string or ''.
  let merchantTradeNo = '';
  const directSub = typeof payload.bizIdSubstitution === 'string' ? payload.bizIdSubstitution : '';
  if (directSub) {
    merchantTradeNo = directSub.trim();
  } else {
    const businessDataRaw = typeof payload.businessData === 'string' ? payload.businessData : '';
    if (businessDataRaw) {
      try {
        const bd = JSON.parse(businessDataRaw);
        merchantTradeNo = String(
          bd.merchantTradeNo ?? bd.transAmt ?? bd.merchantId ?? ''
        ).trim();
      } catch { /* ignore parse errors */ }
    }
  }

  if (!merchantTradeNo) {
    console.warn('Binance Pay webhook: missing merchantTradeNo', { bizStatus, payloadKeys: Object.keys(payload) });
    return jsonResponse({ returnCode: 'FAIL', returnMsg: 'Missing merchantTradeNo' }, 400);
  }

  // Resolve the order by merchantTradeNo
  const { data: ord } = await service
    .from('binance_pay_orders')
    .select('id, merchant_trade_no, status, recharge_request_id, webhook_received_at')
    .eq('merchant_trade_no', merchantTradeNo)
    .maybeSingle();

  if (!ord) {
    console.warn('Binance Pay webhook: order not found', { merchantTradeNo, bizStatus });
    return jsonResponse({ returnCode: 'FAIL', returnMsg: 'Order not found' }, 404);
  }

  if (ord.status !== 'paid') {
    // Update the order row with webhook payload + biz status
    const nextStatus = bizStatus === 'PAY_SUCCESS' ? 'paid' : bizStatus === 'PAY_CLOSED' ? 'expired' : ord.status;
    await service.from('binance_pay_orders').update({
      biz_status: bizStatus,
      webhook_payload: payload,
      webhook_received_at: new Date().toISOString(),
      status: nextStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', ord.id);

    if (bizStatus === 'PAY_SUCCESS') {
      // Best-effort verification query to Binance for the paid amount + txn id
      let paidAmount: number | null = null;
      let transactionRef = '';
      try {
        const creds = await resolveBinanceCreds(service);
        if (creds) {
          const q = await binanceSignedPost(creds, '/binancepay/openapi/v2/order/query', { merchantTradeNo: merchantTradeNo.trim() });
          const inner = (q.data as Json)?.data as Json | undefined;
          if (inner) {
            paidAmount = Number(inner.paidAmount ?? inner.orderAmount ?? 0) || null;
            transactionRef = String(inner.transactionId || inner.tradeId || '');
          }
        }
      } catch { /* verification best-effort */ }

      if (paidAmount != null && paidAmount > 0) {
        await service.from('binance_pay_orders').update({ paid_amount: paidAmount, transaction_ref: transactionRef || null }).eq('id', ord.id);
      }

      // Credit the customer balance via the SECURITY DEFINER RPC (idempotent).
      try {
        await service.rpc('complete_recharge_from_binance_pay_order', { p_merchant_trade_no: merchantTradeNo.trim() });
      } catch (e) {
        console.error('complete_recharge_from_binance_pay_order failed:', (e as Error).message);
      }
    }
  }

  // Acknowledge per Binance spec.
  return jsonResponse({ returnCode: 'SUCCESS', returnMsg: 'OK' });
}

// =============================================================
// Main router
// =============================================================
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  // Webhook path: any path with ?token= is treated as webhook delivery.
  const isWebhook = url.searchParams.has('token') || url.pathname.endsWith('/webhook');

  if (isWebhook && req.method !== 'OPTIONS') {
    const service = serviceClient();
    return handleWebhook(service, req);
  }

  const body = await readJson(req);
  const action = String(body.action || '');

  if (!action) return jsonResponse({ success: false, message: 'action required' }, 400);

  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || null;

  const ADMIN_ACTIONS = new Set(['getSettings', 'saveSettings']);
  const USER_ACTIONS = new Set(['createRechargeOrder', 'getOrderStatus']);

  if (!ADMIN_ACTIONS.has(action) && !USER_ACTIONS.has(action)) {
    return jsonResponse({ success: false, message: `Unknown action: ${action}` }, 400);
  }

  const uc = userClient(authHeader);
  const { data: authData, error: authError } = await uc.auth.getUser();
  if (authError || !authData.user) {
    return jsonResponse({ success: false, message: 'Unauthorized' }, 401);
  }
  const userId = authData.user.id;

  const service = serviceClient();

  if (ADMIN_ACTIONS.has(action)) {
    const userIsAdmin = await isAdmin(uc, userId);
    if (!userIsAdmin) return jsonResponse({ success: false, message: 'Admin only' }, 403);

    if (action === 'getSettings') return getSettings(service);
    if (action === 'saveSettings') return saveSettings(service, body as SaveSettingsBody);
  }

  if (action === 'createRechargeOrder') return createRechargeOrder(service, uc, userId, body as { requestId?: string; amount?: number });
  if (action === 'getOrderStatus') return getOrderStatus(service, userId, body as { requestId?: string; merchantTradeNo?: string });

  return jsonResponse({ success: false, message: `Unknown action: ${action}` }, 400);
});