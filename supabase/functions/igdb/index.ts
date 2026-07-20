/**
 * IGDB (Twitch) proxy for ECHOCORE admin game image search.
 * Browser cannot call api.igdb.com (CORS) — all traffic goes through this function.
 * Credentials: store_settings.igdb_client_id / igdb_client_secret (not env).
 *
 * Docs: docs/igdb-api.md · https://api-docs.igdb.com/#getting-started
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const IGDB_BASE = 'https://api.igdb.com/v4';
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const IMAGE_CDN = 'https://images.igdb.com/igdb/image/upload';

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

/** In-memory token cache per isolate */
let cachedToken: { token: string; expiresAt: number; clientId: string } | null = null;

function imageUrl(imageId: string, size = 'cover_big') {
  if (!imageId) return '';
  return `${IMAGE_CDN}/t_${size}/${imageId}.jpg`;
}

function maskSecret(value: string | null | undefined) {
  const v = String(value || '').trim();
  if (!v) return null;
  if (v.length <= 8) return '********';
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

async function requireAdmin(req: Request) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase env missing on edge function');
  }

  const auth = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!auth) throw Object.assign(new Error('Unauthorized'), { status: 401 });

  const userClient = createClient(supabaseUrl, anonKey || serviceKey, {
    global: { headers: { Authorization: `Bearer ${auth}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    throw Object.assign(new Error('Unauthorized'), { status: 401 });
  }

  const serviceClient = createClient(supabaseUrl, serviceKey);
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') {
    throw Object.assign(new Error('Admin only'), { status: 403 });
  }

  return { serviceClient, userId: userData.user.id };
}

async function loadIgdbCredentials(serviceClient: ReturnType<typeof createClient>) {
  const { data, error } = await serviceClient
    .from('store_settings')
    .select('igdb_client_id, igdb_client_secret, igdb_auto_cover_on_sync')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  const clientId = String(data?.igdb_client_id || '').trim();
  const clientSecret = String(data?.igdb_client_secret || '').trim();
  const autoCoverOnSync = !!(data as { igdb_auto_cover_on_sync?: boolean } | null)?.igdb_auto_cover_on_sync;
  return { clientId, clientSecret, autoCoverOnSync };
}

async function getAccessToken(clientId: string, clientSecret: string) {
  if (!clientId || !clientSecret) {
    throw Object.assign(new Error('IGDB Client ID and Secret not configured'), { status: 400 });
  }

  const now = Date.now();
  if (
    cachedToken
    && cachedToken.clientId === clientId
    && cachedToken.expiresAt > now + 60_000
  ) {
    return cachedToken.token;
  }

  const url = new URL(TWITCH_TOKEN_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('client_secret', clientSecret);
  url.searchParams.set('grant_type', 'client_credentials');

  const res = await fetch(url.toString(), { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    const msg = body.message || body.error || `Twitch token HTTP ${res.status}`;
    throw Object.assign(new Error(String(msg)), { status: 502 });
  }

  const expiresIn = Number(body.expires_in) || 3600;
  cachedToken = {
    token: String(body.access_token),
    expiresAt: now + expiresIn * 1000,
    clientId,
  };
  return cachedToken.token;
}

async function igdbPost(
  path: string,
  apicalypse: string,
  clientId: string,
  accessToken: string,
) {
  const res = await fetch(`${IGDB_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'text/plain',
    },
    body: apicalypse,
  });

  if (res.status === 429) {
    throw Object.assign(new Error('IGDB rate limit (4 req/s). Wait a moment and retry.'), {
      status: 429,
    });
  }

  const text = await res.text();
  let data: unknown = [];
  try {
    data = text ? JSON.parse(text) : [];
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const msg = typeof data === 'object' && data && 'message' in data
      ? String((data as { message: string }).message)
      : `IGDB HTTP ${res.status}`;
    throw Object.assign(new Error(msg), { status: 502 });
  }

  return Array.isArray(data) ? data : [];
}

function pushImage(
  list: Array<Record<string, unknown>>,
  imageId: string,
  opts: { title: string; type: string; source: string; baseScore?: number },
) {
  if (!imageId) return;
  list.push({
    url: imageUrl(imageId, opts.type === 'logo' ? 'cover_big' : '1080p'),
    thumb: imageUrl(imageId, 'thumb'),
    title: opts.title,
    type: opts.type,
    source: opts.source,
    width: opts.type === 'logo' ? 512 : 1920,
    height: opts.type === 'logo' ? 512 : 1080,
    image_id: imageId,
    baseScore: opts.baseScore ?? 50,
  });
}

async function searchGames(query: string, clientId: string, token: string) {
  const q = query.replace(/"/g, '').trim().slice(0, 80);
  if (q.length < 2) return { covers: [], logos: [], results: [], games: [] };

  const body = [
    `search "${q}";`,
    'fields name,slug,cover.image_id,artworks.image_id,screenshots.image_id;',
    'where version_parent = null;',
    'limit 12;',
  ].join(' ');

  const games = await igdbPost('/games', body, clientId, token) as Array<Record<string, unknown>>;

  const covers: Array<Record<string, unknown>> = [];
  const logos: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  for (const game of games) {
    const name = String(game.name || q);
    const cover = game.cover as { image_id?: string } | undefined;
    const coverId = cover?.image_id ? String(cover.image_id) : '';
    if (coverId && !seen.has(coverId)) {
      seen.add(coverId);
      pushImage(covers, coverId, {
        title: `${name} — cover`,
        type: 'cover',
        source: 'IGDB',
        baseScore: 80,
      });
      // Cover also usable as logo fallback
      pushImage(logos, coverId, {
        title: `${name} — cover`,
        type: 'logo',
        source: 'IGDB',
        baseScore: 40,
      });
    }

    const artworks = Array.isArray(game.artworks) ? game.artworks : [];
    for (const art of artworks.slice(0, 6)) {
      const id = String((art as { image_id?: string })?.image_id || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      pushImage(covers, id, {
        title: `${name} — artwork`,
        type: 'cover',
        source: 'IGDB Art',
        baseScore: 70,
      });
      pushImage(logos, id, {
        title: `${name} — artwork`,
        type: 'logo',
        source: 'IGDB Art',
        baseScore: 55,
      });
    }

    const shots = Array.isArray(game.screenshots) ? game.screenshots : [];
    for (const shot of shots.slice(0, 8)) {
      const id = String((shot as { image_id?: string })?.image_id || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      pushImage(covers, id, {
        title: `${name} — screenshot`,
        type: 'cover',
        source: 'IGDB Shot',
        baseScore: 55,
      });
    }
  }

  return {
    covers: covers.slice(0, 24),
    logos: logos.slice(0, 16),
    results: [...covers, ...logos].slice(0, 32),
    games: games.map((g) => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
    })),
    sourcesUsed: ['IGDB'],
    totalFound: covers.length + logos.length,
    hasIgdbKey: true,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { serviceClient } = await requireAdmin(req);
    const payload = await req.json().catch(() => ({}));
    const action = String(payload.action || 'search').trim();

    if (action === 'getSettings') {
      const { clientId, clientSecret, autoCoverOnSync } = await loadIgdbCredentials(serviceClient);
      return jsonResponse({
        settings: {
          igdb_client_id: clientId || '',
          igdb_client_id_masked: maskSecret(clientId),
          igdb_client_secret_set: !!clientSecret,
          igdb_client_secret_masked: maskSecret(clientSecret),
          configured: !!(clientId && clientSecret),
          igdb_auto_cover_on_sync: autoCoverOnSync,
        },
      });
    }

    if (action === 'saveSettings') {
      const nextId = payload.clientId !== undefined
        ? String(payload.clientId || '').trim()
        : undefined;
      const nextSecret = payload.clientSecret !== undefined
        ? String(payload.clientSecret || '').trim()
        : undefined;

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (nextId !== undefined) updates.igdb_client_id = nextId || null;
      if (payload.clearSecret === true) {
        updates.igdb_client_secret = null;
        cachedToken = null;
      } else if (nextSecret !== undefined && nextSecret.length > 0) {
        updates.igdb_client_secret = nextSecret;
        cachedToken = null;
      }
      if (payload.autoCoverOnSync !== undefined) {
        updates.igdb_auto_cover_on_sync = !!payload.autoCoverOnSync;
      }

      const { error } = await serviceClient
        .from('store_settings')
        .upsert({ id: 1, ...updates }, { onConflict: 'id' });
      if (error) throw error;

      const { clientId, clientSecret, autoCoverOnSync } = await loadIgdbCredentials(serviceClient);
      return jsonResponse({
        ok: true,
        settings: {
          igdb_client_id: clientId || '',
          igdb_client_id_masked: maskSecret(clientId),
          igdb_client_secret_set: !!clientSecret,
          igdb_client_secret_masked: maskSecret(clientSecret),
          configured: !!(clientId && clientSecret),
          igdb_auto_cover_on_sync: autoCoverOnSync,
        },
      });
    }

    if (action === 'test' || action === 'search') {
      const { clientId, clientSecret } = await loadIgdbCredentials(serviceClient);
      if (!clientId || !clientSecret) {
        return jsonResponse({
          error: 'IGDB not configured. Add Client ID and Secret on Products → IGDB.',
          configured: false,
          covers: [],
          logos: [],
          results: [],
        }, 400);
      }

      const token = await getAccessToken(clientId, clientSecret);

      if (action === 'test') {
        const sample = await igdbPost(
          '/games',
          'fields name; limit 3;',
          clientId,
          token,
        );
        return jsonResponse({
          ok: true,
          configured: true,
          sampleCount: sample.length,
          sample: sample.map((g: Record<string, unknown>) => g.name),
        });
      }

      const query = String(payload.query || '').trim();
      const result = await searchGames(query, clientId, token);
      return jsonResponse({ ok: true, configured: true, ...result });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    const status = (err as { status?: number })?.status || 500;
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, status);
  }
});
