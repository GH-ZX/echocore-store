/**
 * Advanced game image search — covers, heroes, screenshots, logos.
 * Sources: RAWG, SteamGridDB, Steam, Wikimedia Commons, iTunes, Wikipedia, DuckDuckGo.
 */

const RAWG_KEY = import.meta.env.VITE_RAWG_API_KEY || '';
const STEAMGRID_KEY = import.meta.env.VITE_STEAMGRIDDB_API_KEY || '';

const LOGO_URL_HINTS = /logo|icon|favicon|badge|emblem|symbol|avatar|profile|thumb\/|\/\d{1,2}x\d{1,2}\//i;
const COVER_URL_HINTS = /header|hero|banner|wallpaper|background|capsule|screenshot|cover|artwork|keyart|key-art|splash|grid|1920|1080|1280/i;

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

function inferType(item) {
  const url = (item.url || '').toLowerCase();
  const title = (item.title || '').toLowerCase();
  const w = item.width || 0;
  const h = item.height || 0;
  const ratio = w && h ? w / h : null;

  if (item.type) return item.type;
  if (LOGO_URL_HINTS.test(url) || LOGO_URL_HINTS.test(title)) return 'logo';
  if (COVER_URL_HINTS.test(url) || item.source === 'SteamGridDB Hero') return 'cover';
  if (ratio && ratio >= 1.25) return 'cover';
  if (ratio && ratio < 0.95) return 'cover';
  if (ratio && ratio >= 0.85 && ratio <= 1.15 && w < 400) return 'logo';
  if (w && w < 180) return 'logo';
  return 'cover';
}

function scoreImage(item) {
  const type = inferType(item);
  let score = item.baseScore || 0;
  const w = item.width || 0;
  const h = item.height || 0;
  const ratio = w && h ? w / h : null;
  const url = (item.url || '').toLowerCase();

  if (type === 'cover') score += 25;
  else score += 5;

  if (w >= 1280) score += 30;
  else if (w >= 800) score += 22;
  else if (w >= 500) score += 12;
  else if (w > 0 && w < 250) score -= 25;

  if (ratio && ratio >= 1.4 && ratio <= 2.4) score += 18;
  if (COVER_URL_HINTS.test(url)) score += 15;
  if (LOGO_URL_HINTS.test(url)) score -= 40;
  if (item.source === 'RAWG') score += 12;
  if (item.source === 'SteamGridDB') score += 14;
  if (item.source === 'Steam') score += 10;
  if (item.source === 'Commons') score += 8;
  if (item.source === 'Web') score += 4;

  return { ...item, type, score };
}

function rankResults(results) {
  return dedupe(results)
    .map(scoreImage)
    .filter((item) => item.score > -10)
    .sort((a, b) => b.score - a.score);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) return null;
  return res.json();
}

// ─── RAWG (best for PC/console games) ───────────────────────────────
async function searchRawg(query) {
  if (!RAWG_KEY) return [];

  const list = await fetchJson(
    `https://api.rawg.io/api/games?search=${encodeURIComponent(query)}&page_size=6&ordering=-rating&key=${RAWG_KEY}`
  );
  if (!list?.results?.length) return [];

  const results = [];
  const topGames = list.results.slice(0, 4);

  await Promise.all(topGames.map(async (game) => {
    if (game.background_image) {
      results.push({
        url: game.background_image,
        thumb: game.background_image,
        title: `${game.name} — artwork`,
        source: 'RAWG',
        type: 'cover',
        baseScore: 40,
        width: 1920,
        height: 1080,
      });
    }

    const [detail, screenshots] = await Promise.all([
      fetchJson(`https://api.rawg.io/api/games/${game.id}?key=${RAWG_KEY}`),
      fetchJson(`https://api.rawg.io/api/games/${game.id}/screenshots?key=${RAWG_KEY}`),
    ]);

    if (detail?.background_image_additional) {
      results.push({
        url: detail.background_image_additional,
        thumb: detail.background_image_additional,
        title: `${game.name} — hero`,
        source: 'RAWG',
        type: 'cover',
        baseScore: 45,
        width: 1920,
        height: 1080,
      });
    }

    for (const shot of (detail?.short_screenshots || []).slice(0, 4)) {
      if (shot.image) {
        results.push({
          url: shot.image,
          thumb: shot.image,
          title: `${game.name} — screenshot`,
          source: 'RAWG',
          type: 'cover',
          baseScore: 30,
          width: 1920,
          height: 1080,
        });
      }
    }

    for (const shot of (screenshots?.results || []).slice(0, 4)) {
      if (shot.image) {
        results.push({
          url: shot.image,
          thumb: shot.image,
          title: `${game.name} — screenshot`,
          source: 'RAWG',
          type: 'cover',
          baseScore: 28,
          width: 1920,
          height: 1080,
        });
      }
    }
  }));

  return results;
}

// ─── SteamGridDB (wide heroes + grids + logos) ──────────────────────
async function searchSteamGridDb(query) {
  if (!STEAMGRID_KEY) return [];

  const headers = { Authorization: `Bearer ${STEAMGRID_KEY}` };
  const auto = await fetchJson(
    `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(query)}`,
    { headers }
  );

  const games = (auto?.data || []).slice(0, 3);
  if (!games.length) return [];

  const results = [];

  await Promise.all(games.map(async (g) => {
    const id = g.id;
    const name = g.name;

    const [heroes, grids, logos] = await Promise.all([
      fetchJson(`https://www.steamgriddb.com/api/v2/heroes/game/${id}`, { headers }),
      fetchJson(`https://www.steamgriddb.com/api/v2/grids/game/${id}`, { headers }),
      fetchJson(`https://www.steamgriddb.com/api/v2/logos/game/${id}`, { headers }),
    ]);

    for (const h of (heroes?.data || []).slice(0, 4)) {
      if (h.url) {
        results.push({
          url: h.url,
          thumb: h.thumb || h.url,
          title: `${name} — hero banner`,
          source: 'SteamGridDB',
          type: 'cover',
          baseScore: 50,
          width: h.width,
          height: h.height,
        });
      }
    }

    for (const grid of (grids?.data || []).slice(0, 3)) {
      if (grid.url) {
        results.push({
          url: grid.url,
          thumb: grid.thumb || grid.url,
          title: `${name} — cover`,
          source: 'SteamGridDB',
          type: 'cover',
          baseScore: 35,
          width: grid.width,
          height: grid.height,
        });
      }
    }

    for (const logo of (logos?.data || []).slice(0, 2)) {
      if (logo.url) {
        results.push({
          url: logo.url,
          thumb: logo.thumb || logo.url,
          title: `${name} — logo`,
          source: 'SteamGridDB',
          type: 'logo',
          baseScore: 20,
          width: logo.width,
          height: logo.height,
        });
      }
    }
  }));

  return results;
}

// ─── Steam store ────────────────────────────────────────────────────
async function searchSteam(query) {
  try {
    const data = await fetchJson(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&l=english&cc=US`
    );
    const results = [];

    for (const item of (data?.items || []).slice(0, 6)) {
      if (item.header_image) {
        results.push({
          url: item.header_image,
          thumb: item.tiny_image || item.header_image,
          title: `${item.name} — Steam header`,
          source: 'Steam',
          type: 'cover',
          baseScore: 38,
          width: 460,
          height: 215,
        });
      }
      if (item.large_capsule_image) {
        results.push({
          url: item.large_capsule_image,
          thumb: item.tiny_image || item.large_capsule_image,
          title: `${item.name} — Steam capsule`,
          source: 'Steam',
          type: 'cover',
          baseScore: 32,
          width: 616,
          height: 353,
        });
      }
      if (item.small_capsule_image) {
        results.push({
          url: item.small_capsule_image,
          thumb: item.small_capsule_image,
          title: `${item.name} — logo`,
          source: 'Steam',
          type: 'logo',
          baseScore: 10,
          width: 184,
          height: 69,
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}

// ─── Wikimedia Commons (high-res promotional art) ───────────────────
async function searchWikimediaCommons(query) {
  const searches = [
    `${query} video game banner`,
    `${query} video game screenshot`,
    `${query} video game cover`,
  ];

  const results = [];

  await Promise.all(searches.map(async (term) => {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(term)}&gsrnamespace=6&gsrlimit=6&prop=imageinfo&iiprop=url|size|thumburl&iiurlwidth=900&format=json&origin=*`;
    const data = await fetchJson(url);
    const pages = data?.query?.pages || {};

    for (const page of Object.values(pages)) {
      const info = page.imageinfo?.[0];
      if (!info?.url) continue;
      const w = info.width || 0;
      const h = info.height || 0;
      if (w < 400 && h < 400) continue;
      if (LOGO_URL_HINTS.test(info.url) || LOGO_URL_HINTS.test(page.title || '')) continue;

      results.push({
        url: info.url,
        thumb: info.thumburl || info.url,
        title: (page.title || '').replace('File:', '').slice(0, 60),
        source: 'Commons',
        type: w >= h * 1.2 ? 'cover' : 'logo',
        baseScore: w >= 800 ? 25 : 15,
        width: w,
        height: h,
      });
    }
  }));

  return results;
}

// ─── Wikipedia (original images only, skip tiny) ────────────────────
async function searchWikipedia(query) {
  const searchData = await fetchJson(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`${query} video game`)}&srlimit=3&format=json&origin=*`
  );
  const pages = searchData?.query?.search || [];
  if (!pages.length) return [];

  const titles = pages.map((p) => p.title).join('|');
  const imgData = await fetchJson(
    `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles)}&prop=pageimages&piprop=original|thumbnail&pithumbsize=1200&format=json&origin=*`
  );

  const results = [];
  for (const page of Object.values(imgData?.query?.pages || {})) {
    const original = page.original;
    if (!original?.source) continue;
    const w = original.width || 0;
    const h = original.height || 0;
    if (w < 350 && h < 350) continue;

    const isLogo = w < 500 && h < 500 && Math.abs(w - h) < 120;
    results.push({
      url: original.source,
      thumb: page.thumbnail?.source || original.source,
      title: page.title,
      source: 'Wikipedia',
      type: isLogo ? 'logo' : 'cover',
      baseScore: isLogo ? 8 : 18,
      width: w,
      height: h,
    });
  }

  return results;
}

// ─── Apple App Store (mobile games — screenshots & artwork) ─────────
async function searchItunes(query) {
  try {
    const data = await fetchJson(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=software&limit=8`
    );
    const results = [];

    for (const app of data?.results || []) {
      const name = app.trackName || query;
      if (app.artworkUrl512) {
        const hires = app.artworkUrl512.replace('512x512bb', '1000x1000bb');
        results.push({
          url: hires,
          thumb: app.artworkUrl512,
          title: `${name} — App icon`,
          source: 'App Store',
          type: 'logo',
          baseScore: 12,
          width: 1000,
          height: 1000,
        });
      }
      for (const shot of (app.screenshotUrls || []).slice(0, 3)) {
        results.push({
          url: shot,
          thumb: shot,
          title: `${name} — screenshot`,
          source: 'App Store',
          type: 'cover',
          baseScore: 30,
          width: 1284,
          height: 2778,
        });
      }
      for (const shot of (app.ipadScreenshotUrls || []).slice(0, 2)) {
        results.push({
          url: shot,
          thumb: shot,
          title: `${name} — iPad screenshot`,
          source: 'App Store',
          type: 'cover',
          baseScore: 28,
          width: 2048,
          height: 2732,
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}

// ─── DuckDuckGo image search (web-wide covers & wallpapers) ───────
async function getDdgVqd(query) {
  try {
    const res = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`);
    const html = await res.text();
    const match = html.match(/vqd=["']([^"']+)["']/);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

async function searchDuckDuckGo(query) {
  const searchTerms = [
    `${query} video game key art wallpaper`,
    `${query} game banner 1920x1080`,
    `${query} official game artwork`,
  ];

  const results = [];

  for (const term of searchTerms) {
    try {
      const vqd = await getDdgVqd(term);
      if (!vqd) continue;

      const url = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(term)}&vqd=${encodeURIComponent(vqd)}&f=,,,,,&p=1`;
      const data = await fetchJson(url);
      for (const r of (data?.results || []).slice(0, 6)) {
        if (!r.image) continue;
        if (r.width < 400 || r.height < 250) continue;
        if (LOGO_URL_HINTS.test(r.image) || LOGO_URL_HINTS.test(r.title || '')) continue;

        results.push({
          url: r.image,
          thumb: r.thumbnail || r.image,
          title: (r.title || term).slice(0, 70),
          source: 'Web',
          type: 'cover',
          baseScore: 20,
          width: r.width,
          height: r.height,
        });
      }
    } catch {
      // DDG may block browser CORS — skip silently
    }
  }

  return results;
}

/**
 * @param {string} query - Game name
 * @param {{ deep?: boolean }} options - deep = run all web sources (slower, more results)
 */
export async function searchGameImages(query, options = {}) {
  const q = (query || '').trim();
  const deep = options.deep !== false;

  if (!q || q.length < 2) {
    return { results: [], covers: [], logos: [], hasRawgKey: !!RAWG_KEY, hasSteamGridKey: !!STEAMGRID_KEY };
  }

  const primary = await Promise.all([
    searchRawg(q),
    searchSteamGridDb(q),
    searchSteam(q),
    searchItunes(q),
  ]);

  const extended = deep
    ? await Promise.all([
        searchWikimediaCommons(q),
        searchWikipedia(q),
        searchDuckDuckGo(q),
      ])
    : [[], [], []];

  const all = [...primary.flat(), ...extended.flat()];
  const ranked = rankResults(all);

  const covers = ranked.filter((i) => i.type === 'cover').slice(0, 16);
  const logos = ranked.filter((i) => i.type === 'logo').slice(0, 8);
  const results = [...covers, ...logos].slice(0, 20);

  const sourcesUsed = [...new Set(ranked.map((r) => r.source))];

  return {
    results,
    covers,
    logos,
    hasRawgKey: !!RAWG_KEY,
    hasSteamGridKey: !!STEAMGRID_KEY,
    sourcesUsed,
    totalFound: ranked.length,
  };
}