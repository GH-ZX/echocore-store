import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const G2BULK_BASE = 'https://api.g2bulk.com/v1';
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

    async function fetchG2Games() {
      const gamesRes = await fetch(`${G2BULK_BASE}/games`);
      const gamesPayload = await gamesRes.json().catch(() => ({}));
      return Array.isArray(gamesPayload.games) ? gamesPayload.games : [];
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

      const slug = slugify(code);
      const { data: existingGame } = await serviceClient
        .from('games')
        .select('id')
        .eq('g2bulk_game_code', code)
        .maybeSingle();

      const gameRow = {
        name_en: String(g.name || code),
        name_ar: String(g.name || code),
        slug,
        points_name: 'Top-up',
        image_url: absImageUrl(g.image_url as string | undefined),
        logo_url: absImageUrl(g.image_url as string | undefined),
        description_en: `Instant ${g.name || code} top-up via G2Bulk`,
        description_ar: `Instant ${g.name || code} top-up via G2Bulk`,
        g2bulk_game_code: code,
        g2bulk_source_id: g.id ?? null,
        redemption_method: 'uid',
        catalog_source: 'g2bulk',
        active: true,
        show_in_carousel: false,
        g2bulk_synced_at: syncNow,
      };

      let gameId = existingGame?.id as string | undefined;
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
      }
      gamesSynced += 1;

      await sleep(80);
      const catRes = await fetch(`${G2BULK_BASE}/games/${encodeURIComponent(code)}/catalogue`);
      const catPayload = await catRes.json().catch(() => ({}));
      const catalogues = Array.isArray(catPayload.catalogues) ? catPayload.catalogues : [];
      const liveNames: string[] = [];

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

      const productsRes = await fetch(`${G2BULK_BASE}/products`);
      const productsPayload = await productsRes.json().catch(() => ({}));
      const products = Array.isArray(productsPayload.products) ? productsPayload.products : [];
      const byCategory = new Map<number, { title: string; items: Json[] }>();

      for (const product of products) {
        const categoryId = Number(product.category_id);
        if (!Number.isFinite(categoryId)) continue;
        const title = String(product.category_title || `Category ${categoryId}`);
        if (!byCategory.has(categoryId)) {
          byCategory.set(categoryId, { title, items: [] });
        }
        byCategory.get(categoryId)!.items.push(product);
      }

      for (const [categoryId, group] of byCategory.entries()) {
        try {
          const slug = slugify(`cards-${categoryId}-${group.title}`);
          const { data: existingGame } = await serviceClient
            .from('games')
            .select('id')
            .eq('slug', slug)
            .maybeSingle();

          const gameRow = {
            name_en: group.title,
            name_ar: group.title,
            slug,
            points_name: 'Gift card',
            redemption_method: 'redeem_code',
            catalog_source: 'g2bulk',
            active: true,
            show_in_carousel: false,
            g2bulk_synced_at: syncNow,
            description_en: group.title,
            description_ar: group.title,
          };

          let gameId = existingGame?.id as string | undefined;
          if (gameId) {
            await serviceClient.from('games').update(gameRow).eq('id', gameId);
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

          for (const product of group.items) {
            const productId = Number(product.id);
            const stock = Number(product.stock ?? 0);
            const cost = Number(product.unit_price);
            if (!Number.isFinite(productId) || !Number.isFinite(cost) || cost <= 0) {
              offersSkipped += 1;
              continue;
            }

            const title = String(product.title || `Product ${productId}`);
            const offerRow = {
              game_id: gameId,
              name_en: title,
              name_ar: title,
              price: applyMarkup(cost, markup),
              g2bulk_type: 'voucher',
              g2bulk_product_id: productId,
              g2bulk_cost_usd: cost,
              catalog_source: 'g2bulk',
              active: stock > 0,
              description_en: title,
              description_ar: title,
              g2bulk_synced_at: syncNow,
            };

            const { data: existingOffer } = await serviceClient
              .from('offers')
              .select('id')
              .eq('g2bulk_product_id', productId)
              .maybeSingle();

            if (existingOffer?.id) {
              await serviceClient.from('offers').update(offerRow).eq('id', existingOffer.id);
            } else {
              await serviceClient.from('offers').insert(offerRow);
            }
            offersSynced += 1;
          }
        } catch (err) {
          errors.push(`voucher-${categoryId}: ${err instanceof Error ? err.message : 'sync failed'}`);
        }
      }

      return { gamesSynced, offersSynced, offersSkipped, errors };
    }

    if (phase === 'init') {
      if (hideManual) {
        await serviceClient.from('games').update({ active: false }).eq('catalog_source', 'manual');
        await serviceClient.from('offers').update({ active: false }).eq('catalog_source', 'manual');
      }

      const g2Games = await fetchG2Games();
      const totalGames = g2Games.filter((g) => String(g.code || '').trim()).length;

      return jsonResponse({
        success: true,
        phase: 'init',
        totalGames,
        syncedAt: now,
      });
    }

    if (phase === 'games') {
      const offset = Math.max(0, Number(body.offset) || 0);
      const limit = Math.min(20, Math.max(1, Number(body.limit) || 12));
      const g2Games = await fetchG2Games();
      const validGames = g2Games.filter((g) => String(g.code || '').trim());
      const totalGames = validGames.length;
      const batch = validGames.slice(offset, offset + limit);

      let gamesSynced = 0;
      let offersSynced = 0;
      let offersSkipped = 0;
      const errors: string[] = [];

      for (const g of batch) {
        const code = String(g.code || '').trim();
        try {
          const result = await syncTopupGame(g, now);
          gamesSynced += result.gamesSynced;
          offersSynced += result.offersSynced;
          offersSkipped += result.offersSkipped;
        } catch (err) {
          errors.push(`${code}: ${err instanceof Error ? err.message : 'sync failed'}`);
        }
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

  return jsonResponse({ success: false, message: 'Unknown action' }, 400);
});