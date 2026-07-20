/**
 * IGDB (Twitch) client for admin game images.
 * Credentials live in store_settings; traffic goes through edge function `igdb`.
 * @see docs/igdb-api.md
 */
import { supabase } from './supabase';

async function invokeIgdb(body) {
  const { data, error } = await supabase.functions.invoke('igdb', { body });
  if (error) {
    const msg = error.message || 'IGDB request failed';
    // Surface edge JSON error body when present
    if (data?.error) throw new Error(data.error);
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function fetchIgdbSettings() {
  const data = await invokeIgdb({ action: 'getSettings' });
  return data.settings || {
    configured: false,
    igdb_client_id: '',
    igdb_client_secret_set: false,
  };
}

/**
 * @param {{ clientId?: string, clientSecret?: string, autoCoverOnSync?: boolean }} opts
 * Leave clientSecret empty to keep the existing secret.
 */
export async function saveIgdbSettings({
  clientId,
  clientSecret,
  autoCoverOnSync,
  clearSecret,
} = {}) {
  const data = await invokeIgdb({
    action: 'saveSettings',
    clientId,
    clientSecret,
    autoCoverOnSync,
    clearSecret: !!clearSecret,
  });
  return data.settings;
}

/** First name word for search (matches G2Bulk auto-cover logic). */
export function igdbFirstNameQuery(name) {
  const cleaned = String(name || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .split(/[:–—|]/)[0]
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  if (words[0].length <= 2 && words[1]) return `${words[0]} ${words[1]}`.slice(0, 40);
  return words[0].slice(0, 40);
}

export async function testIgdbConnection() {
  return invokeIgdb({ action: 'test' });
}

/**
 * Search IGDB for covers / artworks / screenshots for a game name.
 * @param {string} query
 */
export async function searchIgdbGameImages(query) {
  const data = await invokeIgdb({
    action: 'search',
    query: String(query || '').trim(),
  });
  return {
    covers: data.covers || [],
    logos: data.logos || [],
    results: data.results || [],
    games: data.games || [],
    sourcesUsed: data.sourcesUsed || ['IGDB'],
    totalFound: data.totalFound || 0,
    hasIgdbKey: data.configured !== false,
    configured: data.configured !== false,
  };
}
