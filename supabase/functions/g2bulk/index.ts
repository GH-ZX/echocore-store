import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const G2BULK_BASE = 'https://api.g2bulk.com/v1';
const SKIP_GAME_CODES = new Set(['test', 'demo', 'sandbox']);
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-g2bulk-cron-secret',
};

function isCronAuthorized(req: Request): boolean {
  const secret = Deno.env.get('G2BULK_CRON_SECRET')?.trim();
  const header = req.headers.get('x-g2bulk-cron-secret')?.trim();
  return !!(secret && header && secret === header);
}

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

async function g2bulkFetch(
  apiKey: string,
  path: string,
  init: RequestInit = {},
  idempotencyKey?: string,
) {
  const headers = new Headers(init.headers);
  headers.set('X-API-Key', apiKey);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (idempotencyKey) {
    headers.set('X-Idempotency-Key', idempotencyKey);
  }

  const res = await fetch(`${G2BULK_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let data: Json = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { res, data };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveApiKeyRaw(serviceClient: ReturnType<typeof createClient>) {
  const envKey = Deno.env.get('G2BULK_API_KEY')?.trim();
  if (envKey) return envKey;

  const { data } = await serviceClient
    .from('store_settings')
    .select('g2bulk_api_key')
    .eq('id', 1)
    .maybeSingle();

  return (data?.g2bulk_api_key as string | null)?.trim() || null;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'game';
}

function absImageUrl(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `https://api.g2bulk.com${url.startsWith('/') ? url : `/${url}`}`;
}

function applyMarkup(cost: number, markupPercent: number) {
  const base = Number(cost);
  if (!Number.isFinite(base) || base <= 0) return 0.01;
  const marked = base * (1 + markupPercent / 100);
  return Math.ceil(marked * 100) / 100;
}

const REGION_TOKENS: Record<string, string> = {
  sea: 'SEA', southeast_asia: 'SEA', southeastasia: 'SEA', global: 'Global', gl: 'Global',
  europe: 'Europe', eu: 'Europe', turkey: 'Turkey', tr: 'Turkey', korea: 'Korea', kr: 'Korea',
  na: 'North America', north_america: 'North America', america: 'North America',
  latam: 'Latin America', latin_america: 'Latin America', mena: 'MENA', middle_east: 'Middle East',
  japan: 'Japan', jp: 'Japan', india: 'India', indonesia: 'Indonesia', id: 'Indonesia',
  russia: 'Russia', ru: 'Russia', china: 'China', cn: 'China', brazil: 'Brazil', br: 'Brazil',
  oceania: 'Oceania', oce: 'Oceania', taiwan: 'Taiwan', tw: 'Taiwan', hk: 'Hong Kong',
  hong_kong: 'Hong Kong', sg: 'Singapore', singapore: 'Singapore', ph: 'Philippines',
  philippines: 'Philippines', my: 'Malaysia', malaysia: 'Malaysia', th: 'Thailand',
  thailand: 'Thailand', vn: 'Vietnam', vietnam: 'Vietnam', kh: 'Cambodia', cambodia: 'Cambodia',
};

function normalizeRegionToken(value = '') {
  return String(value).trim().toLowerCase().replace(/[\s/]+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function normalizeRegionLabel(value = '') {
  const token = normalizeRegionToken(value);
  if (REGION_TOKENS[token]) return REGION_TOKENS[token];
  const cleaned = String(value).trim();
  if (!cleaned) return 'Global';
  return cleaned.split(/[\s/_-]+/).filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
}

function parseG2BulkGameMeta(code = '', name = '') {
  const normalizedCode = String(code || '').trim().toLowerCase();
  const displayName = String(name || code || '').trim();
  const parts = normalizedCode.split(/[_-]+/).filter(Boolean);

  let regionLabel: string | null = null;
  let baseKey = normalizedCode;

  if (parts.length > 1) {
    const suffix = parts[parts.length - 1];
    if (REGION_TOKENS[suffix]) {
      regionLabel = REGION_TOKENS[suffix];
      baseKey = parts.slice(0, -1).join('_');
    }
  }

  if (!regionLabel) {
    const paren = displayName.match(/\(([^)]+)\)\s*$/);
    if (paren) regionLabel = normalizeRegionLabel(paren[1]);
  }

  if (!regionLabel) {
    const dash = displayName.match(/[-–—]\s*([^(-]+)\s*$/);
    if (dash) regionLabel = normalizeRegionLabel(dash[1]);
  }

  let baseName = displayName;
  if (regionLabel) {
    baseName = displayName
      .replace(/\s*\([^)]+\)\s*$/, '')
      .replace(/\s*[-–—]\s*[^-–—]+$/, '')
      .trim() || displayName;
  }

  if (!regionLabel) regionLabel = 'Global';

  return { baseKey: baseKey || normalizedCode, baseName: baseName || displayName || normalizedCode, regionLabel };
}

const GAMING_ACCOUNT_KEYWORDS = [
  'xbox', 'playstation', 'psn', 'ps4', 'ps5', 'ps plus', 'nintendo', 'game pass', 'gamepass',
  'live gold', 'steam wallet', 'steam card', 'steam gift', 'netflix', 'spotify', 'disney',
  'prime video', 'amazon gift', 'apple', 'itunes', 'app store', 'apple gift', 'google play',
  'razer', 'razer gold', 'zgold', 'z gold', 'gold pin', 'paysafe', 'paysafecard',
  'blizzard', 'battle.net', 'battlenet', 'epic games', 'origin', 'ea play',
  'office', 'windows', 'chatgpt', 'discord nitro', 'vpn', 'subscription', 'membership',
  'account', 'wallet code', 'store credit',
];

function classifyVoucherSegment(title = '') {
  const normalized = String(title).trim().toLowerCase();
  if (!normalized) return 'gift_card';
  if (GAMING_ACCOUNT_KEYWORDS.some((keyword) => normalized.includes(keyword))) return 'gaming_account';
  if (/xbox|playstation|psn|nintendo|steam|netflix|spotify|itunes|apple|google play|razer|zgold|paysafe|blizzard|battle\.?net|epic games|origin|ea play|amazon/i.test(normalized)) {
    return 'gaming_account';
  }
  return 'gift_card';
}

async function fetchG2GamesPublic() {
  const gamesRes = await fetch(`${G2BULK_BASE}/games`);
  const gamesPayload = await gamesRes.json().catch(() => ({}));
  return Array.isArray(gamesPayload.games) ? gamesPayload.games as Json[] : [];
}

function filterValidG2Games(g2Games: Json[]) {
  return g2Games.filter((g) => {
    const code = String(g.code || '').trim().toLowerCase();
    return code && !SKIP_GAME_CODES.has(code);
  });
}

function pushCheckSample(list: Json[], item: Json, max = 8) {
  if (list.length < max) list.push(item);
}

const CATALOG_BATCH_MAX = 32;



async function isAdmin(userClient: ReturnType<typeof createClient>, userId: string) {
  const { data } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  return data?.role === 'admin';
}

async function pollVoucherDelivery(apiKey: string, g2bulkOrderId: number) {
  for (let i = 0; i < 15; i++) {
    const { res, data } = await g2bulkFetch(apiKey, `/orders/${g2bulkOrderId}/delivery`);
    if (res.status === 200 && Array.isArray(data.delivery_items)) {
      return { ok: true as const, items: data.delivery_items as string[], data };
    }
    if (res.status === 410) {
      return { ok: false as const, error: (data.message as string) || 'Order refunded' };
    }
    await sleep(3000);
  }
  return { ok: false as const, error: 'Delivery polling timed out' };
}

async function pollGameOrderStatus(apiKey: string, g2bulkOrderId: number) {
  for (let i = 0; i < 15; i++) {
    const { res, data } = await g2bulkFetch(apiKey, '/games/order/status', {
      method: 'POST',
      body: JSON.stringify({ order_id: g2bulkOrderId }),
    });
    const status = String(data.status || data.order?.status || '').toUpperCase();
    if (res.ok && status === 'COMPLETED') {
      return { ok: true as const, data };
    }
    if (status === 'FAILED' || status === 'REFUNDED') {
      return { ok: false as const, error: (data.message as string) || 'Top-up failed' };
    }
    await sleep(3000);
  }
  return { ok: false as const, error: 'Top-up status polling timed out' };
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

  const cronAuth = isCronAuthorized(req);
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const body = await readJson(req);
  const action = String(body.action || '');

  let userId: string | null = null;
  if (!cronAuth) {
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      return jsonResponse({ success: false, message: 'Unauthorized' }, 401);
    }
    userId = authData.user.id;
  } else if (action !== 'syncCatalog') {
    return jsonResponse({ success: false, message: 'Cron auth only allowed for syncCatalog' }, 403);
  }

  const apiKey = await resolveApiKeyRaw(serviceClient);
  if (['getMe', 'fulfillOrder'].includes(action) && !apiKey) {
    return jsonResponse({ success: false, message: 'G2Bulk API key not configured' }, 400);
  }

  if (action === 'getMe') {
    if (!(await isAdmin(userClient, userId!))) {
      return jsonResponse({ success: false, message: 'Admin only' }, 403);
    }
    const { res, data } = await g2bulkFetch(apiKey!, '/getMe');
    return jsonResponse({ success: res.ok, ...data }, res.status);
  }

  if (action === 'checkPlayer') {
    const { res, data } = await fetch(`${G2BULK_BASE}/games/checkPlayerId`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game: body.game,
        user_id: body.user_id,
        server_id: body.server_id ?? undefined,
        charname: body.charname ?? undefined,
      }),
    }).then(async (r) => ({ res: r, data: await r.json().catch(() => ({})) }));
    return jsonResponse(data as Json, res.status);
  }

  if (action === 'getSettings') {
    if (!(await isAdmin(userClient, userId!))) {
      return jsonResponse({ success: false, message: 'Admin only' }, 403);
    }
    const { data, error } = await userClient.rpc('get_g2bulk_settings');
    if (error) {
      return jsonResponse({
        success: false,
        message: error.message.includes('g2bulk_auto_sync')
          ? 'Run supabase_g2bulk_auto_sync_migration.sql in Supabase SQL Editor first.'
          : error.message,
      }, 400);
    }
    const settings = { ...(data as Json) };
    const envKey = Deno.env.get('G2BULK_API_KEY')?.trim();
    if (envKey && !settings.g2bulk_api_key_set) {
      settings.g2bulk_api_key_set = true;
      settings.g2bulk_api_key_masked = '•••••••• (edge secret)';
      settings.g2bulk_api_key_source = 'env';
    } else if (settings.g2bulk_api_key_set) {
      settings.g2bulk_api_key_source = envKey ? 'both' : 'db';
    } else {
      settings.g2bulk_api_key_source = 'none';
    }
    return jsonResponse({ success: true, settings });
  }

  if (action === 'fulfillOrder') {
    const orderId = String(body.orderId || '');
    if (!orderId) {
      return jsonResponse({ success: false, message: 'orderId required' }, 400);
    }

    const admin = await isAdmin(userClient, userId!);

    const { data: order, error: orderError } = await serviceClient
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (orderError || !order) {
      return jsonResponse({ success: false, message: 'Order not found' }, 404);
    }

    if (!admin && order.user_id !== userId) {
      return jsonResponse({ success: false, message: 'Unauthorized' }, 403);
    }

    if (order.status !== 'completed') {
      return jsonResponse({ success: false, message: 'Order is not completed' }, 400);
    }

    if (order.fulfillment_status === 'fulfilled') {
      return jsonResponse({ success: true, skipped: true, fulfillmentStatus: 'fulfilled' });
    }

    const { data: items } = await serviceClient
      .from('order_items')
      .select('*, offers(*, games(*))')
      .eq('order_id', orderId);

    const item = items?.[0];
    if (!item) {
      return jsonResponse({ success: false, message: 'No order items' }, 400);
    }

    const offer = item.offers;
    const game = offer?.games;
    const g2bulkType = offer?.g2bulk_type
      || (game?.redemption_method === 'redeem_code' ? 'voucher' : 'topup');

    const hasMapping = g2bulkType === 'voucher'
      ? !!offer?.g2bulk_product_id
      : !!(game?.g2bulk_game_code && (offer?.g2bulk_catalogue_name || offer?.name_en));

    if (!hasMapping) {
      await serviceClient.rpc('apply_g2bulk_fulfillment', {
        p_order_id: orderId,
        p_fulfillment_status: 'skipped',
        p_metadata: { reason: 'no_g2bulk_mapping' },
      });
      return jsonResponse({ success: true, skipped: true, fulfillmentStatus: 'skipped' });
    }

    await serviceClient.rpc('apply_g2bulk_fulfillment', {
      p_order_id: orderId,
      p_fulfillment_status: 'fulfilling',
    });

    const idempotencyKey = orderId;

    try {
      if (g2bulkType === 'voucher') {
        const productId = offer.g2bulk_product_id;
        const { res, data } = await g2bulkFetch(
          apiKey!,
          `/products/${productId}/purchase`,
          { method: 'POST', body: JSON.stringify({ quantity: item.quantity || 1 }) },
          idempotencyKey,
        );

        if (!res.ok || data.success === false) {
          throw new Error((data.message as string) || 'Voucher purchase failed');
        }

        let deliveryItems = Array.isArray(data.delivery_items) ? data.delivery_items as string[] : null;
        const g2bulkOrderId = data.order_id;

        if (!deliveryItems && data.status === 'PENDING' && g2bulkOrderId) {
          const polled = await pollVoucherDelivery(apiKey!, Number(g2bulkOrderId));
          if (!polled.ok) throw new Error(polled.error);
          deliveryItems = polled.items;
        }

        await serviceClient.rpc('apply_g2bulk_fulfillment', {
          p_order_id: orderId,
          p_fulfillment_status: 'fulfilled',
          p_g2bulk_order_id: String(g2bulkOrderId ?? ''),
          p_delivery_items: deliveryItems,
          p_metadata: { type: 'voucher', g2bulk: data },
        });

        return jsonResponse({
          success: true,
          fulfillmentStatus: 'fulfilled',
          deliveryItems: deliveryItems,
        });
      }

      const gameCode = game.g2bulk_game_code;
      const catalogueName = offer.g2bulk_catalogue_name || offer.name_en;
      const { res, data } = await g2bulkFetch(
        apiKey!,
        `/games/${gameCode}/order`,
        {
          method: 'POST',
          body: JSON.stringify({
            catalogue_name: catalogueName,
            player_id: item.player_uid,
            server_id: item.player_server || undefined,
            remark: `echocore-${orderId}`,
          }),
        },
        idempotencyKey,
      );

      if (!res.ok || data.success === false) {
        throw new Error((data.message as string) || 'Top-up order failed');
      }

      const g2bulkOrderId = data.order?.order_id ?? data.order_id;
      let finalStatus = String(data.order?.status || data.status || 'PENDING').toUpperCase();

      if (finalStatus !== 'COMPLETED' && g2bulkOrderId) {
        const polled = await pollGameOrderStatus(apiKey!, Number(g2bulkOrderId));
        if (!polled.ok) throw new Error(polled.error);
        finalStatus = 'COMPLETED';
      }

      await serviceClient.rpc('apply_g2bulk_fulfillment', {
        p_order_id: orderId,
        p_fulfillment_status: 'fulfilled',
        p_g2bulk_order_id: String(g2bulkOrderId ?? ''),
        p_metadata: { type: 'topup', g2bulk: data, status: finalStatus },
      });

      return jsonResponse({
        success: true,
        fulfillmentStatus: 'fulfilled',
        g2bulkOrderId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fulfillment failed';
      await serviceClient.rpc('apply_g2bulk_fulfillment', {
        p_order_id: orderId,
        p_fulfillment_status: 'failed',
        p_error: message,
      });
      return jsonResponse({ success: false, message }, 500);
    }
  }

  if (action === 'syncCatalog') {
    if (!cronAuth && !(await isAdmin(userClient, userId!))) {
      return jsonResponse({ success: false, message: 'Admin only' }, 403);
    }

    const phase = String(body.phase || 'init');
    const hideManual = body.hideManual !== false;
    const now = new Date().toISOString();

    const { data: settings } = await serviceClient
      .from('store_settings')
      .select('g2bulk_markup_percent')
      .eq('id', 1)
      .maybeSingle();

    const markup = Number(settings?.g2bulk_markup_percent ?? 15);

    async function ensureParentGame(
      meta: { baseKey: string; baseName: string },
      variant: Json,
      syncNow: string,
    ): Promise<string> {
      const parentSlug = slugify(meta.baseKey);
      const { data: existingParent } = await serviceClient
        .from('games')
        .select('id')
        .eq('slug', parentSlug)
        .is('parent_game_id', null)
        .maybeSingle();

      const imageUrl = absImageUrl(variant.image_url as string | undefined);
      const parentRow = {
        name_en: meta.baseName,
        name_ar: meta.baseName,
        slug: parentSlug,
        points_name: 'Top-up',
        image_url: imageUrl,
        logo_url: imageUrl,
        description_en: `Instant ${meta.baseName} top-up via G2Bulk`,
        description_ar: `Instant ${meta.baseName} top-up via G2Bulk`,
        redemption_method: 'uid',
        catalog_source: 'g2bulk',
        active: true,
        show_in_carousel: false,
        g2bulk_synced_at: syncNow,
        parent_game_id: null,
        region_label: null,
        g2bulk_game_code: null,
        g2bulk_source_id: null,
      };

      if (existingParent?.id) {
        const { error } = await serviceClient.from('games').update(parentRow).eq('id', existingParent.id);
        if (error) throw error;
        return existingParent.id as string;
      }

      const { data: inserted, error } = await serviceClient
        .from('games')
        .insert(parentRow)
        .select('id')
        .single();
      if (error) throw error;
      return inserted.id as string;
    }

    async function syncTopupGame(
      g: Json,
      syncNow: string,
    ): Promise<{ gamesSynced: number; offersSynced: number; offersSkipped: number; error?: string }> {
      const code = String(g.code || '').trim();
      if (!code) {
        return { gamesSynced: 0, offersSynced: 0, offersSkipped: 0 };
      }

      let gamesSynced = 0;
      let offersSynced = 0;
      let offersSkipped = 0;

      const meta = parseG2BulkGameMeta(code, String(g.name || code));
      const parentId = await ensureParentGame(meta, g, syncNow);
      const childSlug = slugify(code);
      const imageUrl = absImageUrl(g.image_url as string | undefined);

      const { data: existingChild } = await serviceClient
        .from('games')
        .select('id')
        .eq('g2bulk_game_code', code)
        .maybeSingle();

      const childRow = {
        name_en: String(g.name || `${meta.baseName} (${meta.regionLabel})`),
        name_ar: String(g.name || `${meta.baseName} (${meta.regionLabel})`),
        slug: childSlug,
        points_name: 'Top-up',
        image_url: imageUrl,
        logo_url: imageUrl,
        description_en: `Instant ${meta.baseName} top-up — ${meta.regionLabel}`,
        description_ar: `Instant ${meta.baseName} top-up — ${meta.regionLabel}`,
        g2bulk_game_code: code,
        g2bulk_source_id: g.id ?? null,
        redemption_method: 'uid',
        catalog_source: 'g2bulk',
        active: true,
        show_in_carousel: false,
        g2bulk_synced_at: syncNow,
        parent_game_id: parentId,
        region_label: meta.regionLabel,
      };

      let gameId = existingChild?.id as string | undefined;
      if (gameId) {
        const { error } = await serviceClient.from('games').update(childRow).eq('id', gameId);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await serviceClient
          .from('games')
          .insert(childRow)
          .select('id')
          .single();
        if (error) throw error;
        gameId = inserted.id;
        gamesSynced += 1;
      }

      await serviceClient
        .from('games')
        .update({ active: false })
        .eq('g2bulk_game_code', code)
        .is('parent_game_id', null)
        .neq('id', parentId);

      const catRes = await fetch(`${G2BULK_BASE}/games/${encodeURIComponent(code)}/catalogue`);
      const catPayload = await catRes.json().catch(() => ({}));
      const catalogues = Array.isArray(catPayload.catalogues) ? catPayload.catalogues : [];
      const liveNames: string[] = [];

      if (catalogues.length === 0) {
        await serviceClient.from('games').update({ active: false }).eq('id', gameId);
        return { gamesSynced, offersSynced, offersSkipped };
      }

      for (const item of catalogues) {
        const catalogueName = String(item.name || '').trim();
        if (!catalogueName) continue;
        liveNames.push(catalogueName);

        const cost = Number(item.amount);
        if (!Number.isFinite(cost) || cost <= 0) {
          offersSkipped += 1;
          continue;
        }

        const offerRow = {
          game_id: gameId,
          name_en: catalogueName,
          name_ar: catalogueName,
          price: applyMarkup(cost, markup),
          g2bulk_type: 'topup',
          g2bulk_catalogue_name: catalogueName,
          g2bulk_catalogue_id: item.id ?? null,
          g2bulk_cost_usd: cost,
          catalog_source: 'g2bulk',
          active: true,
          description_en: catalogueName,
          description_ar: catalogueName,
          g2bulk_synced_at: syncNow,
        };

        const { data: existingOffer } = await serviceClient
          .from('offers')
          .select('id')
          .eq('game_id', gameId)
          .eq('g2bulk_catalogue_name', catalogueName)
          .maybeSingle();

        if (existingOffer?.id) {
          const { error } = await serviceClient.from('offers').update(offerRow).eq('id', existingOffer.id);
          if (error) throw error;
        } else {
          const { error } = await serviceClient.from('offers').insert(offerRow);
          if (error) throw error;
        }
        offersSynced += 1;
      }

      const { data: staleOffers } = await serviceClient
        .from('offers')
        .select('id, g2bulk_catalogue_name')
        .eq('game_id', gameId)
        .eq('catalog_source', 'g2bulk')
        .eq('g2bulk_type', 'topup');

      for (const stale of staleOffers || []) {
        if (!liveNames.includes(String(stale.g2bulk_catalogue_name))) {
          await serviceClient.from('offers').update({ active: false }).eq('id', stale.id);
        }
      }

      return { gamesSynced, offersSynced, offersSkipped };
    }

    async function syncVoucherCatalog(syncNow: string) {
      let gamesSynced = 0;
      let offersSynced = 0;
      let offersSkipped = 0;
      const errors: string[] = [];

      const categoriesRes = await fetch(`${G2BULK_BASE}/category`);
      const categoriesPayload = await categoriesRes.json().catch(() => ({}));
      const categories = Array.isArray(categoriesPayload.categories) ? categoriesPayload.categories : [];
      const categoryMeta = new Map<number, { title: string; image_url: string | null; description: string }>();
      for (const cat of categories) {
        const id = Number(cat.id);
        if (!Number.isFinite(id)) continue;
        categoryMeta.set(id, {
          title: String(cat.title || `Category ${id}`),
          image_url: absImageUrl(cat.image_url as string | undefined),
          description: String(cat.description || '').trim(),
        });
      }

      const productsRes = await fetch(`${G2BULK_BASE}/products`);
      const productsPayload = await productsRes.json().catch(() => ({}));
      const products = Array.isArray(productsPayload.products) ? productsPayload.products : [];
      const byCategory = new Map<number, { title: string; items: Json[] }>();

      for (const product of products) {
        const categoryId = Number(product.category_id);
        if (!Number.isFinite(categoryId)) continue;
        const meta = categoryMeta.get(categoryId);
        const title = meta?.title || String(product.category_title || `Category ${categoryId}`);
        if (!byCategory.has(categoryId)) {
          byCategory.set(categoryId, { title, items: [] });
        }
        byCategory.get(categoryId)!.items.push(product);
      }

      const liveCategoryIds = new Set<number>();

      for (const [categoryId, group] of byCategory.entries()) {
        try {
          liveCategoryIds.add(categoryId);
          const meta = categoryMeta.get(categoryId);
          const title = meta?.title || group.title;
          const slug = slugify(`cards-${categoryId}-${title}`);
          const categoryImage = meta?.image_url
            || absImageUrl(group.items.find((item) => item.image_url)?.image_url as string | undefined);

          const { data: existingGame } = await serviceClient
            .from('games')
            .select('id')
            .eq('g2bulk_source_id', categoryId)
            .eq('redemption_method', 'redeem_code')
            .maybeSingle();

          const segment = classifyVoucherSegment(title);
          const gameRow = {
            name_en: title,
            name_ar: title,
            slug,
            points_name: segment === 'gaming_account' ? 'Account' : 'Gift card',
            image_url: categoryImage,
            logo_url: categoryImage,
            redemption_method: 'redeem_code',
            catalog_source: 'g2bulk',
            catalog_segment: segment,
            g2bulk_source_id: categoryId,
            active: true,
            show_in_carousel: false,
            g2bulk_synced_at: syncNow,
            description_en: meta?.description || title,
            description_ar: meta?.description || title,
          };

          let gameId = existingGame?.id as string | undefined;
          if (gameId) {
            const { error } = await serviceClient.from('games').update(gameRow).eq('id', gameId);
            if (error) throw error;
          } else {
            const { data: bySlug } = await serviceClient
              .from('games')
              .select('id')
              .eq('slug', slug)
              .maybeSingle();
            gameId = bySlug?.id as string | undefined;

            if (gameId) {
              const { error } = await serviceClient.from('games').update(gameRow).eq('id', gameId);
              if (error) throw error;
            } else {
              const { data: inserted, error } = await serviceClient
                .from('games')
                .insert(gameRow)
                .select('id')
                .single();
              if (error) throw error;
              gameId = inserted.id;
              gamesSynced += 1;
            }
          }

          const liveProductIds: number[] = [];
          let hasInStockOffer = false;

          for (const product of group.items) {
            const productId = Number(product.id);
            const stock = Number(product.stock ?? 0);
            const cost = Number(product.unit_price);
            if (!Number.isFinite(productId) || !Number.isFinite(cost) || cost <= 0) {
              offersSkipped += 1;
              continue;
            }

            liveProductIds.push(productId);
            if (stock > 0) hasInStockOffer = true;

            const offerTitle = String(product.title || `Product ${productId}`);
            const offerRow = {
              game_id: gameId,
              name_en: offerTitle,
              name_ar: offerTitle,
              price: applyMarkup(cost, markup),
              g2bulk_type: 'voucher',
              g2bulk_product_id: productId,
              g2bulk_cost_usd: cost,
              catalog_source: 'g2bulk',
              active: stock > 0,
              description_en: offerTitle,
              description_ar: offerTitle,
              g2bulk_synced_at: syncNow,
            };

            const { data: existingOffer } = await serviceClient
              .from('offers')
              .select('id')
              .eq('g2bulk_product_id', productId)
              .maybeSingle();

            if (existingOffer?.id) {
              const { error } = await serviceClient.from('offers').update(offerRow).eq('id', existingOffer.id);
              if (error) throw error;
            } else {
              const { error } = await serviceClient.from('offers').insert(offerRow);
              if (error) throw error;
            }
            offersSynced += 1;
          }

          const { data: staleOffers } = await serviceClient
            .from('offers')
            .select('id, g2bulk_product_id')
            .eq('game_id', gameId)
            .eq('catalog_source', 'g2bulk')
            .eq('g2bulk_type', 'voucher');

          for (const stale of staleOffers || []) {
            const productId = Number(stale.g2bulk_product_id);
            if (!liveProductIds.includes(productId)) {
              await serviceClient.from('offers').update({ active: false }).eq('id', stale.id);
            }
          }

          await serviceClient
            .from('games')
            .update({ active: hasInStockOffer })
            .eq('id', gameId);
        } catch (err) {
          errors.push(`voucher-${categoryId}: ${err instanceof Error ? err.message : 'sync failed'}`);
        }
      }

      const { data: staleVoucherGames } = await serviceClient
        .from('games')
        .select('id, g2bulk_source_id')
        .eq('catalog_source', 'g2bulk')
        .eq('redemption_method', 'redeem_code');

      for (const game of staleVoucherGames || []) {
        const sourceId = Number(game.g2bulk_source_id);
        if (!Number.isFinite(sourceId) || !liveCategoryIds.has(sourceId)) {
          await serviceClient.from('games').update({ active: false }).eq('id', game.id);
          await serviceClient.from('offers').update({ active: false }).eq('game_id', game.id);
        }
      }

      return { gamesSynced, offersSynced, offersSkipped, errors };
    }

    if (phase === 'init') {
      if (hideManual) {
        await serviceClient.from('games').update({ active: false }).eq('catalog_source', 'manual');
        await serviceClient.from('offers').update({ active: false }).eq('catalog_source', 'manual');
      }

      const validGames = filterValidG2Games(await fetchG2GamesPublic());

      await serviceClient.from('store_settings').update({
        g2bulk_sync_state: {
          type: 'sync',
          gameEntries: validGames.map((g) => ({
            code: String(g.code || '').trim(),
            name: g.name,
            image_url: g.image_url,
            id: g.id,
          })),
          startedAt: now,
        },
      }).eq('id', 1);

      return jsonResponse({
        success: true,
        phase: 'init',
        totalGames: validGames.length,
        syncedAt: now,
      });
    }

    if (phase === 'games') {
      const offset = Math.max(0, Number(body.offset) || 0);
      const limit = Math.min(CATALOG_BATCH_MAX, Math.max(1, Number(body.limit) || CATALOG_BATCH_MAX));

      const { data: settingsRow } = await serviceClient
        .from('store_settings')
        .select('g2bulk_sync_state')
        .eq('id', 1)
        .maybeSingle();
      const state = settingsRow?.g2bulk_sync_state as Json | null;

      let validGames: Json[] = [];
      if (state?.type === 'sync' && Array.isArray(state.gameEntries)) {
        validGames = state.gameEntries as Json[];
      } else {
        validGames = filterValidG2Games(await fetchG2GamesPublic());
      }

      const totalGames = validGames.length;
      const batch = validGames.slice(offset, offset + limit);

      let gamesSynced = 0;
      let offersSynced = 0;
      let offersSkipped = 0;
      const errors: string[] = [];

      const batchResults = await Promise.all(batch.map(async (g) => {
        const code = String(g.code || '').trim();
        try {
          const result = await syncTopupGame(g, now);
          return { code, error: null as string | null, ...result };
        } catch (err) {
          return {
            code,
            error: `${code}: ${err instanceof Error ? err.message : 'sync failed'}`,
            gamesSynced: 0,
            offersSynced: 0,
            offersSkipped: 0,
          };
        }
      }));

      for (const result of batchResults) {
        if (result.error) errors.push(result.error);
        gamesSynced += result.gamesSynced;
        offersSynced += result.offersSynced;
        offersSkipped += result.offersSkipped;
      }

      const nextOffset = offset + batch.length;
      const gamesDone = nextOffset >= totalGames;

      return jsonResponse({
        success: true,
        phase: 'games',
        totalGames,
        offset,
        limit,
        nextOffset,
        gamesDone,
        gamesSynced,
        offersSynced,
        offersSkipped,
        errors: errors.slice(0, 20),
      });
    }

    if (phase === 'vouchers') {
      const result = await syncVoucherCatalog(now);
      return jsonResponse({
        success: true,
        phase: 'vouchers',
        gamesSynced: result.gamesSynced,
        offersSynced: result.offersSynced,
        offersSkipped: result.offersSkipped,
        errors: result.errors.slice(0, 20),
      });
    }

    if (phase === 'finalize') {
      const { data: carouselCandidates } = await serviceClient
        .from('games')
        .select('id')
        .eq('catalog_source', 'g2bulk')
        .eq('redemption_method', 'uid')
        .eq('active', true)
        .not('image_url', 'is', null)
        .order('name_en', { ascending: true })
        .limit(12);

      await serviceClient
        .from('games')
        .update({ show_in_carousel: false })
        .eq('catalog_source', 'g2bulk');

      const carouselIds = (carouselCandidates || []).map((row) => row.id as string);
      for (let i = 0; i < carouselIds.length; i++) {
        await serviceClient
          .from('games')
          .update({ show_in_carousel: true, carousel_order: i })
          .eq('id', carouselIds[i]);
      }

      await serviceClient
        .from('store_settings')
        .update({ g2bulk_last_sync_at: now, updated_at: now, g2bulk_sync_state: null })
        .eq('id', 1);

      return jsonResponse({
        success: true,
        phase: 'finalize',
        syncedAt: now,
        carouselGames: carouselIds.length,
      });
    }

    return jsonResponse({ success: false, message: `Unknown sync phase: ${phase}` }, 400);
  }

  if (action === 'checkCatalog') {
    if (!(await isAdmin(userClient, userId!))) {
      return jsonResponse({ success: false, message: 'Admin only' }, 403);
    }

    const phase = String(body.phase || 'init');
    const now = new Date().toISOString();

    async function checkTopupGame(code: string) {
      const result = {
        newOffers: 0,
        priceChanges: 0,
        removedOffers: 0,
        unchangedOffers: 0,
        errors: [] as string[],
        samples: {
          priceChanges: [] as Json[],
          newOffers: [] as Json[],
          removedOffers: [] as Json[],
        },
      };

      try {
        const { data: dbGame } = await serviceClient
          .from('games')
          .select('id, name_en')
          .eq('g2bulk_game_code', code)
          .eq('catalog_source', 'g2bulk')
          .maybeSingle();

        const catRes = await fetch(`${G2BULK_BASE}/games/${encodeURIComponent(code)}/catalogue`);
        const catPayload = await catRes.json().catch(() => ({}));
        const catalogues = Array.isArray(catPayload.catalogues) ? catPayload.catalogues : [];
        const liveByName = new Map<string, number>();

        for (const item of catalogues) {
          const name = String(item.name || '').trim();
          const cost = Number(item.amount);
          if (!name || !Number.isFinite(cost) || cost <= 0) continue;
          liveByName.set(name, cost);
        }

        const gameLabel = String(dbGame?.name_en || code);

        if (!dbGame?.id) {
          result.newOffers = liveByName.size;
          for (const [name] of liveByName) {
            pushCheckSample(result.samples.newOffers, { game: gameLabel, offer: name });
          }
          return result;
        }

        const { data: dbOffers } = await serviceClient
          .from('offers')
          .select('id, name_en, g2bulk_catalogue_name, g2bulk_cost_usd, active')
          .eq('game_id', dbGame.id)
          .eq('catalog_source', 'g2bulk')
          .eq('g2bulk_type', 'topup');

        const dbByName = new Map<string, { cost: number; active: boolean }>();
        for (const offer of dbOffers || []) {
          const name = String(offer.g2bulk_catalogue_name || offer.name_en || '').trim();
          if (!name) continue;
          dbByName.set(name, {
            cost: Number(offer.g2bulk_cost_usd ?? 0),
            active: offer.active !== false,
          });
        }

        for (const [name, liveCost] of liveByName) {
          const dbEntry = dbByName.get(name);
          if (!dbEntry) {
            result.newOffers += 1;
            pushCheckSample(result.samples.newOffers, { game: gameLabel, offer: name });
          } else if (Math.abs(dbEntry.cost - liveCost) > 0.001) {
            result.priceChanges += 1;
            pushCheckSample(result.samples.priceChanges, {
              game: gameLabel,
              offer: name,
              was: dbEntry.cost,
              now: liveCost,
            });
          } else {
            result.unchangedOffers += 1;
          }
        }

        for (const [name, dbEntry] of dbByName) {
          if (!liveByName.has(name) && dbEntry.active) {
            result.removedOffers += 1;
            pushCheckSample(result.samples.removedOffers, { game: gameLabel, offer: name });
          }
        }
      } catch (err) {
        result.errors.push(`${code}: ${err instanceof Error ? err.message : 'check failed'}`);
      }

      return result;
    }

    if (phase === 'init') {
      const validGames = filterValidG2Games(await fetchG2GamesPublic());
      const liveCodes = new Set(validGames.map((g) => String(g.code || '').trim()));

      const { data: dbGames } = await serviceClient
        .from('games')
        .select('id, g2bulk_game_code, name_en')
        .eq('catalog_source', 'g2bulk')
        .eq('redemption_method', 'uid')
        .not('g2bulk_game_code', 'is', null);

      const dbCodes = new Set(
        (dbGames || []).map((g) => String(g.g2bulk_game_code || '').trim()).filter(Boolean),
      );
      const newGameCodes = [...liveCodes].filter((code) => !dbCodes.has(code));
      const removedGames = (dbGames || []).filter((g) => {
        const code = String(g.g2bulk_game_code || '').trim();
        return code && !liveCodes.has(code);
      });

      await serviceClient.from('store_settings').update({
        g2bulk_sync_state: {
          type: 'check',
          gameEntries: validGames.map((g) => ({ code: String(g.code || '').trim() })),
          startedAt: now,
        },
      }).eq('id', 1);

      return jsonResponse({
        success: true,
        phase: 'init',
        totalGames: validGames.length,
        newGames: newGameCodes.length,
        removedGames: removedGames.length,
        samples: {
          newGames: newGameCodes.slice(0, 8),
          removedGames: removedGames.slice(0, 8).map((g) => String(g.name_en || g.g2bulk_game_code)),
        },
        errors: [],
      });
    }

    if (phase === 'games') {
      const offset = Math.max(0, Number(body.offset) || 0);
      const limit = Math.min(CATALOG_BATCH_MAX, Math.max(1, Number(body.limit) || CATALOG_BATCH_MAX));

      const { data: settingsRow } = await serviceClient
        .from('store_settings')
        .select('g2bulk_sync_state')
        .eq('id', 1)
        .maybeSingle();
      const state = settingsRow?.g2bulk_sync_state as Json | null;

      let codes: string[] = [];
      if (state?.type === 'check' && Array.isArray(state.gameEntries)) {
        codes = (state.gameEntries as Json[])
          .map((g) => String(g.code || '').trim())
          .filter(Boolean);
      } else {
        codes = filterValidG2Games(await fetchG2GamesPublic())
          .map((g) => String(g.code || '').trim());
      }

      const totalGames = codes.length;
      const batch = codes.slice(offset, offset + limit);
      const batchResults = await Promise.all(batch.map((code) => checkTopupGame(code)));

      const totals = {
        newOffers: 0,
        priceChanges: 0,
        removedOffers: 0,
        unchangedOffers: 0,
        errors: [] as string[],
        samples: {
          priceChanges: [] as Json[],
          newOffers: [] as Json[],
          removedOffers: [] as Json[],
        },
      };

      for (const row of batchResults) {
        totals.newOffers += row.newOffers;
        totals.priceChanges += row.priceChanges;
        totals.removedOffers += row.removedOffers;
        totals.unchangedOffers += row.unchangedOffers;
        totals.errors.push(...row.errors);
        for (const key of ['priceChanges', 'newOffers', 'removedOffers'] as const) {
          for (const item of row.samples[key]) {
            pushCheckSample(totals.samples[key], item);
          }
        }
      }

      const nextOffset = offset + batch.length;
      return jsonResponse({
        success: true,
        phase: 'games',
        totalGames,
        offset,
        limit,
        nextOffset,
        gamesDone: nextOffset >= totalGames,
        newOffers: totals.newOffers,
        priceChanges: totals.priceChanges,
        removedOffers: totals.removedOffers,
        unchangedOffers: totals.unchangedOffers,
        samples: totals.samples,
        errors: totals.errors.slice(0, 20),
      });
    }

    if (phase === 'vouchers') {
      const totals = {
        newOffers: 0,
        priceChanges: 0,
        removedOffers: 0,
        stockChanges: 0,
        unchangedOffers: 0,
        errors: [] as string[],
        samples: {
          priceChanges: [] as Json[],
          newOffers: [] as Json[],
          removedOffers: [] as Json[],
        },
      };

      try {
        const productsRes = await fetch(`${G2BULK_BASE}/products`);
        const productsPayload = await productsRes.json().catch(() => ({}));
        const products = Array.isArray(productsPayload.products) ? productsPayload.products : [];
        const liveById = new Map<number, { cost: number; inStock: boolean; title: string }>();

        for (const product of products) {
          const productId = Number(product.id);
          const cost = Number(product.unit_price);
          const stock = Number(product.stock ?? 0);
          if (!Number.isFinite(productId) || !Number.isFinite(cost) || cost <= 0) continue;
          liveById.set(productId, {
            cost,
            inStock: stock > 0,
            title: String(product.title || `Product ${productId}`),
          });
        }

        const { data: dbOffers } = await serviceClient
          .from('offers')
          .select('id, name_en, g2bulk_product_id, g2bulk_cost_usd, active')
          .eq('catalog_source', 'g2bulk')
          .eq('g2bulk_type', 'voucher');

        const dbById = new Map<number, { cost: number; active: boolean; title: string }>();
        for (const offer of dbOffers || []) {
          const productId = Number(offer.g2bulk_product_id);
          if (!Number.isFinite(productId)) continue;
          dbById.set(productId, {
            cost: Number(offer.g2bulk_cost_usd ?? 0),
            active: offer.active !== false,
            title: String(offer.name_en || `Product ${productId}`),
          });
        }

        for (const [productId, live] of liveById) {
          const dbEntry = dbById.get(productId);
          if (!dbEntry) {
            totals.newOffers += 1;
            pushCheckSample(totals.samples.newOffers, { game: 'Voucher', offer: live.title });
            continue;
          }

          if (Math.abs(dbEntry.cost - live.cost) > 0.001) {
            totals.priceChanges += 1;
            pushCheckSample(totals.samples.priceChanges, {
              game: 'Voucher',
              offer: live.title,
              was: dbEntry.cost,
              now: live.cost,
            });
          } else if (dbEntry.active !== live.inStock) {
            totals.stockChanges += 1;
          } else {
            totals.unchangedOffers += 1;
          }
        }

        for (const [productId, dbEntry] of dbById) {
          if (!liveById.has(productId) && dbEntry.active) {
            totals.removedOffers += 1;
            pushCheckSample(totals.samples.removedOffers, { game: 'Voucher', offer: dbEntry.title });
          }
        }
      } catch (err) {
        totals.errors.push(err instanceof Error ? err.message : 'Voucher check failed');
      }

      return jsonResponse({
        success: true,
        phase: 'vouchers',
        ...totals,
        errors: totals.errors.slice(0, 20),
      });
    }

    if (phase === 'finalize') {
      const initTotals = (body.initTotals as Json) || {};
      const gamesTotals = (body.gamesTotals as Json) || {};
      const vouchersTotals = (body.vouchersTotals as Json) || {};
      const initSamples = (body.initSamples as Json) || {};
      const gamesSamples = (body.gamesSamples as Json) || {};
      const vouchersSamples = (body.vouchersSamples as Json) || {};

      const summary = {
        newGames: Number(initTotals.newGames) || 0,
        removedGames: Number(initTotals.removedGames) || 0,
        newOffers: (Number(gamesTotals.newOffers) || 0) + (Number(vouchersTotals.newOffers) || 0),
        priceChanges: (Number(gamesTotals.priceChanges) || 0) + (Number(vouchersTotals.priceChanges) || 0),
        removedOffers: (Number(gamesTotals.removedOffers) || 0) + (Number(vouchersTotals.removedOffers) || 0),
        stockChanges: Number(vouchersTotals.stockChanges) || 0,
        unchangedOffers: (Number(gamesTotals.unchangedOffers) || 0) + (Number(vouchersTotals.unchangedOffers) || 0),
        samples: {
          newGames: Array.isArray(initSamples.newGames) ? initSamples.newGames.slice(0, 8) : [],
          removedGames: Array.isArray(initSamples.removedGames) ? initSamples.removedGames.slice(0, 8) : [],
          priceChanges: [
            ...(Array.isArray(gamesSamples.priceChanges) ? gamesSamples.priceChanges : []),
            ...(Array.isArray(vouchersSamples.priceChanges) ? vouchersSamples.priceChanges : []),
          ].slice(0, 8),
          newOffers: [
            ...(Array.isArray(gamesSamples.newOffers) ? gamesSamples.newOffers : []),
            ...(Array.isArray(vouchersSamples.newOffers) ? vouchersSamples.newOffers : []),
          ].slice(0, 8),
          removedOffers: [
            ...(Array.isArray(gamesSamples.removedOffers) ? gamesSamples.removedOffers : []),
            ...(Array.isArray(vouchersSamples.removedOffers) ? vouchersSamples.removedOffers : []),
          ].slice(0, 8),
        },
      };

      const totalChanges = summary.newGames + summary.removedGames
        + summary.newOffers + summary.priceChanges
        + summary.removedOffers + summary.stockChanges;
      const fullSummary = {
        ...summary,
        totalChanges,
        upToDate: totalChanges === 0,
      };

      await serviceClient.from('store_settings').update({
        g2bulk_last_check_at: now,
        g2bulk_check_summary: fullSummary,
        g2bulk_sync_state: null,
        updated_at: now,
      }).eq('id', 1);

      return jsonResponse({
        success: true,
        phase: 'finalize',
        summary: fullSummary,
        checkedAt: now,
      });
    }

    return jsonResponse({ success: false, message: `Unknown check phase: ${phase}` }, 400);
  }

  if (action === 'browseCatalog') {
    const { data: settings } = await serviceClient
      .from('store_settings')
      .select('g2bulk_markup_percent')
      .eq('id', 1)
      .maybeSingle();
    const markup = Number(settings?.g2bulk_markup_percent ?? 15);
    const subAction = String(body.subAction || 'listGames');

    async function fetchG2GamesPublic() {
      const gamesRes = await fetch(`${G2BULK_BASE}/games`);
      const gamesPayload = await gamesRes.json().catch(() => ({}));
      return Array.isArray(gamesPayload.games) ? gamesPayload.games : [];
    }

    if (subAction === 'listGames') {
      const g2Games = await fetchG2GamesPublic();
      const groups = new Map<string, { baseKey: string; baseName: string; image_url: string | null; variantCount: number }>();

      for (const g of g2Games) {
        const code = String(g.code || '').trim();
        if (!code || SKIP_GAME_CODES.has(code.toLowerCase())) continue;
        const meta = parseG2BulkGameMeta(code, String(g.name || code));
        const image = absImageUrl(g.image_url as string | undefined);
        if (!groups.has(meta.baseKey)) {
          groups.set(meta.baseKey, {
            baseKey: meta.baseKey,
            baseName: meta.baseName,
            image_url: image,
            variantCount: 0,
          });
        }
        const group = groups.get(meta.baseKey)!;
        group.variantCount += 1;
        if (!group.image_url && image) group.image_url = image;
      }

      const games = [...groups.values()].map((group) => ({
        id: `live:parent:${group.baseKey}`,
        slug: slugify(group.baseKey),
        name_en: group.baseName,
        name_ar: group.baseName,
        points_name: 'Top-up',
        image_url: group.image_url,
        logo_url: group.image_url,
        redemption_method: 'uid',
        catalog_source: 'live',
        active: true,
        group_base_key: group.baseKey,
        variant_count: group.variantCount,
      }));

      return jsonResponse({ success: true, games });
    }

    if (subAction === 'gameGroup') {
      const baseKey = String(body.baseKey || '').trim().toLowerCase();
      if (!baseKey) return jsonResponse({ success: false, message: 'baseKey required' }, 400);

      const g2Games = await fetchG2GamesPublic();
      const variants = g2Games.filter((g) => {
        const code = String(g.code || '').trim();
        if (!code || SKIP_GAME_CODES.has(code.toLowerCase())) return false;
        return parseG2BulkGameMeta(code, String(g.name || code)).baseKey === baseKey;
      });

      const parentMeta = variants[0]
        ? parseG2BulkGameMeta(String(variants[0].code), String(variants[0].name))
        : { baseKey, baseName: baseKey, regionLabel: 'Global' };

      const games: Json[] = [];
      const offers: Json[] = [];
      const parentId = `live:parent:${baseKey}`;

      const variantPayloads = await Promise.all(variants.map(async (g) => {
        const code = String(g.code || '').trim();
        const meta = parseG2BulkGameMeta(code, String(g.name || code));
        const catRes = await fetch(`${G2BULK_BASE}/games/${encodeURIComponent(code)}/catalogue`);
        const catPayload = await catRes.json().catch(() => ({}));
        const catalogues = Array.isArray(catPayload.catalogues) ? catPayload.catalogues : [];
        return { g, code, meta, catalogues };
      }));

      for (const { g, code, meta, catalogues } of variantPayloads) {
        const variantId = `live:variant:${code}`;

        games.push({
          id: variantId,
          slug: slugify(code),
          parent_game_id: parentId,
          region_label: meta.regionLabel,
          g2bulk_game_code: code,
          name_en: String(g.name || meta.baseName),
          name_ar: String(g.name || meta.baseName),
          image_url: absImageUrl(g.image_url as string | undefined),
          catalog_source: 'live',
          redemption_method: 'uid',
          catalog_segment: 'topup',
          active: true,
        });

        for (const item of catalogues) {
          const catalogueName = String(item.name || '').trim();
          const cost = Number(item.amount);
          if (!catalogueName || !Number.isFinite(cost) || cost <= 0) continue;

          offers.push({
            id: `live:topup:${code}:${catalogueName}`,
            game_id: variantId,
            name_en: catalogueName,
            name_ar: catalogueName,
            price: applyMarkup(cost, markup),
            region: meta.regionLabel,
            g2bulk_type: 'topup',
            g2bulk_game_code: code,
            g2bulk_catalogue_name: catalogueName,
            g2bulk_cost_usd: cost,
            catalog_source: 'live',
            active: true,
          });
        }
      }

      const parent = {
        id: parentId,
        slug: slugify(baseKey),
        name_en: parentMeta.baseName,
        name_ar: parentMeta.baseName,
        group_base_key: baseKey,
        catalog_source: 'live',
        redemption_method: 'uid',
        active: variants.length > 0,
        image_url: absImageUrl(variants[0]?.image_url as string | undefined),
      };

      return jsonResponse({ success: true, parent, games, offers });
    }

    if (subAction === 'vouchers') {
      const segmentFilter = String(body.segment || '').trim();
      const categoriesRes = await fetch(`${G2BULK_BASE}/category`);
      const categoriesPayload = await categoriesRes.json().catch(() => ({}));
      const categories = Array.isArray(categoriesPayload.categories) ? categoriesPayload.categories : [];
      const categoryMeta = new Map<number, { title: string; image_url: string | null; product_count: number }>();
      for (const cat of categories) {
        const id = Number(cat.id);
        if (!Number.isFinite(id)) continue;
        categoryMeta.set(id, {
          title: String(cat.title || `Category ${id}`),
          image_url: absImageUrl(cat.image_url as string | undefined),
          product_count: Number(cat.product_count ?? 0),
        });
      }

      const productsRes = await fetch(`${G2BULK_BASE}/products`);
      const productsPayload = await productsRes.json().catch(() => ({}));
      const products = Array.isArray(productsPayload.products) ? productsPayload.products : [];
      const byCategory = new Map<number, Json[]>();

      for (const product of products) {
        const categoryId = Number(product.category_id);
        if (!Number.isFinite(categoryId)) continue;
        if (!byCategory.has(categoryId)) byCategory.set(categoryId, []);
        byCategory.get(categoryId)!.push(product);
      }

      const games: Json[] = [];
      const offers: Json[] = [];

      const categoryIds = new Set<number>([
        ...categoryMeta.keys(),
        ...byCategory.keys(),
      ]);

      for (const categoryId of categoryIds) {
        const meta = categoryMeta.get(categoryId);
        const items = byCategory.get(categoryId) || [];
        const title = meta?.title || String(items[0]?.category_title || `Category ${categoryId}`);
        const segment = classifyVoucherSegment(title);
        if (segmentFilter && segment !== segmentFilter) continue;

        const gameId = `live:voucher:${categoryId}`;
        const categoryImage = meta?.image_url
          || absImageUrl(items.find((item) => item.image_url)?.image_url as string | undefined);
        const hasStock = items.some((item) => Number(item.stock ?? 0) > 0);

        games.push({
          id: gameId,
          slug: slugify(`cards-${categoryId}-${title}`),
          name_en: title,
          name_ar: title,
          image_url: categoryImage,
          redemption_method: 'redeem_code',
          catalog_source: 'live',
          catalog_segment: segment,
          active: hasStock || items.length > 0 || (meta?.product_count ?? 0) > 0,
          g2bulk_category_id: categoryId,
        });

        for (const product of items) {
          const productId = Number(product.id);
          const stock = Number(product.stock ?? 0);
          const cost = Number(product.unit_price);
          if (!Number.isFinite(productId) || !Number.isFinite(cost) || cost <= 0) continue;

          offers.push({
            id: `live:voucher:${productId}`,
            game_id: gameId,
            name_en: String(product.title || `Product ${productId}`),
            name_ar: String(product.title || `Product ${productId}`),
            price: applyMarkup(cost, markup),
            g2bulk_type: 'voucher',
            g2bulk_product_id: productId,
            g2bulk_cost_usd: cost,
            catalog_source: 'live',
            active: stock > 0,
          });
        }
      }

      return jsonResponse({ success: true, games, offers, segment: segmentFilter || 'all' });
    }

    return jsonResponse({ success: false, message: `Unknown browse subAction: ${subAction}` }, 400);
  }

  if (action === 'ensureCatalogItems') {
    if (!userId) return jsonResponse({ success: false, message: 'Unauthorized' }, 401);

    const items = Array.isArray(body.items) ? body.items : [];
    const now = new Date().toISOString();

    const { data: settings } = await serviceClient
      .from('store_settings')
      .select('g2bulk_markup_percent')
      .eq('id', 1)
      .maybeSingle();
    const markup = Number(settings?.g2bulk_markup_percent ?? 15);

    const resolved: { liveId: string; offerId: string }[] = [];

    for (const raw of items) {
      const liveId = String(raw.id || '');
      const g2bulkType = String(raw.g2bulk_type || 'topup');

      if (g2bulkType === 'topup') {
        const code = String(raw.g2bulk_game_code || '').trim();
        const catalogueName = String(raw.g2bulk_catalogue_name || '').trim();
        if (!code || !catalogueName) continue;

        const meta = parseG2BulkGameMeta(code, String(raw.game_name || code));
        const parentSlug = slugify(meta.baseKey);
        let parentId: string;

        const { data: existingParent } = await serviceClient
          .from('games')
          .select('id')
          .eq('slug', parentSlug)
          .is('parent_game_id', null)
          .maybeSingle();

        if (existingParent?.id) {
          parentId = existingParent.id as string;
        } else {
          const { data: insertedParent, error: parentError } = await serviceClient
            .from('games')
            .insert({
              name_en: meta.baseName,
              name_ar: meta.baseName,
              slug: parentSlug,
              points_name: 'Top-up',
              redemption_method: 'uid',
              catalog_source: 'g2bulk',
              active: true,
              show_in_carousel: false,
              g2bulk_synced_at: now,
            })
            .select('id')
            .single();
          if (parentError) throw parentError;
          parentId = insertedParent.id as string;
        }

        const { data: existingChild } = await serviceClient
          .from('games')
          .select('id')
          .eq('g2bulk_game_code', code)
          .maybeSingle();

        const childRow = {
          name_en: String(raw.game_name || `${meta.baseName} (${meta.regionLabel})`),
          name_ar: String(raw.game_name || `${meta.baseName} (${meta.regionLabel})`),
          slug: slugify(code),
          parent_game_id: parentId,
          region_label: meta.regionLabel,
          g2bulk_game_code: code,
          redemption_method: 'uid',
          catalog_source: 'g2bulk',
          active: true,
          show_in_carousel: false,
          g2bulk_synced_at: now,
        };

        let childId = existingChild?.id as string | undefined;
        if (childId) {
          await serviceClient.from('games').update(childRow).eq('id', childId);
        } else {
          const { data: insertedChild, error: childError } = await serviceClient
            .from('games')
            .insert(childRow)
            .select('id')
            .single();
          if (childError) throw childError;
          childId = insertedChild.id as string;
        }

        const cost = Number(raw.g2bulk_cost_usd ?? raw.price);
        const offerRow = {
          game_id: childId,
          name_en: catalogueName,
          name_ar: catalogueName,
          price: Number.isFinite(cost) && cost > 0 ? applyMarkup(cost, markup) : Number(raw.price) || 0.01,
          g2bulk_type: 'topup',
          g2bulk_catalogue_name: catalogueName,
          g2bulk_cost_usd: Number.isFinite(cost) ? cost : null,
          catalog_source: 'g2bulk',
          active: true,
          region: meta.regionLabel,
          g2bulk_synced_at: now,
        };

        const { data: existingOffer } = await serviceClient
          .from('offers')
          .select('id')
          .eq('game_id', childId)
          .eq('g2bulk_catalogue_name', catalogueName)
          .maybeSingle();

        let offerId = existingOffer?.id as string | undefined;
        if (offerId) {
          await serviceClient.from('offers').update(offerRow).eq('id', offerId);
        } else {
          const { data: insertedOffer, error: offerError } = await serviceClient
            .from('offers')
            .insert(offerRow)
            .select('id')
            .single();
          if (offerError) throw offerError;
          offerId = insertedOffer.id as string;
        }

        if (offerId) resolved.push({ liveId, offerId });
        continue;
      }

      if (g2bulkType === 'voucher') {
        const productId = Number(raw.g2bulk_product_id);
        if (!Number.isFinite(productId)) continue;

        let offerId: string | undefined;
        const { data: existingOffer } = await serviceClient
          .from('offers')
          .select('id')
          .eq('g2bulk_product_id', productId)
          .maybeSingle();
        offerId = existingOffer?.id as string | undefined;

        if (!offerId) {
          const productRes = await fetch(`${G2BULK_BASE}/products/${productId}`);
          const productPayload = await productRes.json().catch(() => ({}));
          const product = productPayload.product || productPayload;
          const categoryId = Number(product.category_id);
          const title = String(product.category_title || product.title || `Product ${productId}`);
          const slug = slugify(`cards-${categoryId}-${title}`);
          const cost = Number(product.unit_price);

          const { data: gameRow } = await serviceClient
            .from('games')
            .select('id')
            .eq('g2bulk_source_id', categoryId)
            .eq('redemption_method', 'redeem_code')
            .maybeSingle();

          let gameId = gameRow?.id as string | undefined;
          if (!gameId) {
            const { data: insertedGame } = await serviceClient
              .from('games')
              .insert({
                name_en: title,
                name_ar: title,
                slug,
                points_name: 'Gift card',
                redemption_method: 'redeem_code',
                catalog_source: 'g2bulk',
                g2bulk_source_id: categoryId,
                active: true,
                show_in_carousel: false,
                g2bulk_synced_at: now,
              })
              .select('id')
              .single();
            gameId = insertedGame?.id as string;
          }

          const { data: insertedOffer } = await serviceClient
            .from('offers')
            .insert({
              game_id: gameId,
              name_en: String(product.title || `Product ${productId}`),
              name_ar: String(product.title || `Product ${productId}`),
              price: applyMarkup(cost, markup),
              g2bulk_type: 'voucher',
              g2bulk_product_id: productId,
              g2bulk_cost_usd: cost,
              catalog_source: 'g2bulk',
              active: Number(product.stock ?? 0) > 0,
              g2bulk_synced_at: now,
            })
            .select('id')
            .single();
          offerId = insertedOffer?.id as string;
        }

        if (offerId) resolved.push({ liveId, offerId });
      }
    }

    return jsonResponse({ success: true, resolved });
  }

  return jsonResponse({ success: false, message: 'Unknown action' }, 400);
});