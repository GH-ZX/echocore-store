/**
 * IGDB cover helper for G2Bulk sync (optional auto-cover).
 * Uses store_settings credentials — rate-limit ~4 req/s.
 * @see docs/igdb-api.md
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const IGDB_BASE = 'https://api.igdb.com/v4';
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const IMAGE_CDN = 'https://images.igdb.com/igdb/image/upload';

type ServiceClient = ReturnType<typeof createClient>;

let cachedToken: { token: string; expiresAt: number; clientId: string } | null = null;
let lastIgdbCallAt = 0;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * First meaningful name token only — not the full title.
 * e.g. "Mobile Legends: Bang Bang (Global)" → "Mobile"
 *      "FC 24" → "FC 24" (tiny first word gets second word)
 */
export function igdbFirstNameQuery(name: string): string {
  const cleaned = String(name || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .split(/[:–—|]/)[0]
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  if (words[0].length <= 2 && words[1]) {
    return `${words[0]} ${words[1]}`.slice(0, 40);
  }
  return words[0].slice(0, 40);
}

export async function loadIgdbAutoCoverConfig(serviceClient: ServiceClient) {
  const { data } = await serviceClient
    .from('store_settings')
    .select('igdb_auto_cover_on_sync, igdb_client_id, igdb_client_secret')
    .eq('id', 1)
    .maybeSingle();

  const auto = !!(data as { igdb_auto_cover_on_sync?: boolean } | null)?.igdb_auto_cover_on_sync;
  const clientId = String((data as { igdb_client_id?: string } | null)?.igdb_client_id || '').trim();
  const clientSecret = String((data as { igdb_client_secret?: string } | null)?.igdb_client_secret || '').trim();
  return {
    enabled: auto && !!clientId && !!clientSecret,
    clientId,
    clientSecret,
  };
}

async function getAccessToken(clientId: string, clientSecret: string) {
  const now = Date.now();
  if (cachedToken && cachedToken.clientId === clientId && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token;
  }
  const url = new URL(TWITCH_TOKEN_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('client_secret', clientSecret);
  url.searchParams.set('grant_type', 'client_credentials');
  const res = await fetch(url.toString(), { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) return null;
  const expiresIn = Number(body.expires_in) || 3600;
  cachedToken = {
    token: String(body.access_token),
    expiresAt: now + expiresIn * 1000,
    clientId,
  };
  return cachedToken.token;
}

async function throttleIgdb() {
  const wait = Math.max(0, 280 - (Date.now() - lastIgdbCallAt));
  if (wait) await sleep(wait);
  lastIgdbCallAt = Date.now();
}

/**
 * Best cover URL for a game name (first-name query). Null if none.
 */
export async function fetchIgdbCoverForGameName(
  gameName: string,
  clientId: string,
  clientSecret: string,
): Promise<string | null> {
  const q = igdbFirstNameQuery(gameName).replace(/"/g, '');
  if (q.length < 2) return null;

  const token = await getAccessToken(clientId, clientSecret);
  if (!token) return null;

  await throttleIgdb();
  const body = [
    `search "${q}";`,
    'fields name,cover.image_id;',
    'where version_parent = null & cover != null;',
    'limit 5;',
  ].join(' ');

  const res = await fetch(`${IGDB_BASE}/games`, {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'text/plain',
    },
    body,
  });
  if (!res.ok) return null;
  const games = await res.json().catch(() => []);
  if (!Array.isArray(games) || !games.length) return null;

  for (const g of games) {
    const imageId = g?.cover?.image_id ? String(g.cover.image_id) : '';
    if (imageId) {
      return `${IMAGE_CDN}/t_cover_big/${imageId}.jpg`;
    }
  }
  return null;
}

/**
 * Apply IGDB cover when auto-sync is on and the game is not image-locked.
 * Marks image_custom so later G2Bulk syncs keep the cover.
 */
export async function maybeApplyIgdbAutoCover(
  serviceClient: ServiceClient,
  gameId: string,
  gameName: string,
  config: { enabled: boolean; clientId: string; clientSecret: string },
): Promise<boolean> {
  if (!config.enabled || !gameId) return false;

  const { data: existing } = await serviceClient
    .from('games')
    .select('image_custom, image_url')
    .eq('id', gameId)
    .maybeSingle();

  if ((existing as { image_custom?: boolean } | null)?.image_custom) {
    return false;
  }

  // Skip if already has a store-uploaded custom-looking image
  const url = String((existing as { image_url?: string } | null)?.image_url || '');
  if (url && /\/storage\/v1\/object\//i.test(url)) {
    return false;
  }

  try {
    const cover = await fetchIgdbCoverForGameName(gameName, config.clientId, config.clientSecret);
    if (!cover) return false;
    const { error } = await serviceClient
      .from('games')
      .update({
        image_url: cover,
        image_custom: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', gameId);
    return !error;
  } catch {
    return false;
  }
}
