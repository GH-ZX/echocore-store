/**
 * Admin game image search — IGDB primary (via edge function + store_settings keys).
 * Optional free Steam store page fallback (no API key).
 * RAWG / env keys removed.
 *
 * @see docs/igdb-api.md
 */
import { searchIgdbGameImages } from './igdb';

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
}

function dedupe(results) {
  const seen = new Set();
  return results.filter((item) => {
    const key = normalizeUrl(item?.url || '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Steam public CDN — no key required */
async function searchSteam(query) {
  try {
    const res = await fetch(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&l=english&cc=US`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    return items.slice(0, 6).flatMap((item) => {
      const id = item.id;
      if (!id) return [];
      const title = item.name || query;
      return [
        {
          url: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`,
          thumb: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/capsule_231x87.jpg`,
          title: `${title} — Steam library`,
          type: 'cover',
          source: 'Steam',
          width: 600,
          height: 900,
          baseScore: 45,
        },
        {
          url: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`,
          thumb: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/capsule_184x69.jpg`,
          title: `${title} — Steam header`,
          type: 'cover',
          source: 'Steam',
          width: 460,
          height: 215,
          baseScore: 40,
        },
      ];
    });
  } catch {
    return [];
  }
}

/**
 * @param {string} query - Game name
 * @param {{ deep?: boolean }} options - deep currently unused (kept for API compatibility)
 */
export async function searchGameImages(query, options = {}) {
  void options;
  const q = (query || '').trim();

  if (!q || q.length < 2) {
    return {
      results: [],
      covers: [],
      logos: [],
      hasIgdbKey: false,
      sourcesUsed: [],
      totalFound: 0,
    };
  }

  let igdb = {
    covers: [],
    logos: [],
    results: [],
    hasIgdbKey: false,
    sourcesUsed: [],
    totalFound: 0,
    error: null,
  };

  try {
    igdb = await searchIgdbGameImages(q);
  } catch (err) {
    igdb.error = err?.message || 'IGDB search failed';
  }

  // Free fallback when IGDB empty or not configured
  let steam = [];
  if (!igdb.covers?.length) {
    steam = await searchSteam(q);
  }

  const covers = dedupe([...(igdb.covers || []), ...steam.filter((i) => i.type === 'cover')]).slice(0, 24);
  const logos = dedupe(igdb.logos || []).slice(0, 16);
  const sourcesUsed = [...new Set([
    ...(igdb.sourcesUsed || []),
    ...(steam.length ? ['Steam'] : []),
  ])];

  return {
    results: [...covers, ...logos].slice(0, 32),
    covers,
    logos,
    hasIgdbKey: !!igdb.hasIgdbKey || !!igdb.configured,
    hasRawgKey: false,
    hasSteamGridKey: false,
    sourcesUsed,
    totalFound: covers.length + logos.length,
    error: igdb.error || null,
  };
}
