import { classifyVoucherSegment } from './catalogSegments';
import { supabase } from './supabase';
import { normalizePullSelection } from './pullCatalogUtils';

function slugifyCatalogKey(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'game';
}

async function fetchSyncedPullFlags() {
  const [topupRes, voucherRes] = await Promise.all([
    supabase
      .from('games')
      .select('slug')
      .eq('catalog_source', 'g2bulk')
      .is('parent_game_id', null)
      .eq('redemption_method', 'uid'),
    supabase
      .from('games')
      .select('g2bulk_source_id')
      .eq('catalog_source', 'g2bulk')
      .eq('redemption_method', 'redeem_code'),
  ]);

  if (topupRes.error) throw topupRes.error;
  if (voucherRes.error) throw voucherRes.error;

  return {
    topupSlugs: new Set(
      (topupRes.data || []).map((row) => String(row.slug || '').trim()).filter(Boolean),
    ),
    voucherCategoryIds: new Set(
      (voucherRes.data || [])
        .map((row) => Number(row.g2bulk_source_id))
        .filter((value) => Number.isFinite(value)),
    ),
  };
}

function markCatalogSynced(catalog = {}, flags = {}) {
  const games = (catalog.games || []).map((item) => {
    const baseKey = String(item.baseKey || '').trim();
    const slugKey = slugifyCatalogKey(baseKey);
    return {
      ...item,
      synced: flags.topupSlugs?.has(slugKey) || flags.topupSlugs?.has(baseKey),
    };
  });

  const accounts = (catalog.accounts || []).map((item) => ({
    ...item,
    synced: flags.voucherCategoryIds?.has(Number(item.categoryId)),
  }));

  const giftCards = (catalog.giftCards || []).map((item) => ({
    ...item,
    synced: flags.voucherCategoryIds?.has(Number(item.categoryId)),
  }));

  return { games, accounts, giftCards };
}

function mapBrowseGamesToPullRows(games = []) {
  return games.map((game) => {
    const baseKey = String(game.group_base_key || game.slug || '').trim();
    return {
      baseKey,
      baseName: game.name_en || game.name_ar || baseKey,
      image_url: game.image_url || game.logo_url || null,
      variantCount: Number(game.variant_count) || 1,
      synced: false,
    };
  }).filter((row) => row.baseKey);
}

function splitCategoriesToPullRows(categories = []) {
  const accounts = [];
  const giftCards = [];

  for (const category of categories) {
    const categoryId = Number(category.id);
    if (!Number.isFinite(categoryId)) continue;
    const title = String(category.title || `Category ${categoryId}`);
    const uiSegment = classifyVoucherSegment(title);
    const row = {
      categoryId,
      title,
      image_url: category.image_url || null,
      productCount: Number(category.product_count ?? 0),
      synced: false,
    };
    if (uiSegment === 'gaming_account') accounts.push(row);
    else giftCards.push(row);
  }

  accounts.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  giftCards.sort((a, b) => String(a.title).localeCompare(String(b.title)));

  return { accounts, giftCards };
}

/**
 * Fallback when listPullCatalog edge action is unreachable.
 * Uses lighter browseCatalog calls + direct Supabase reads.
 */
function settleValue(result, fallback = null) {
  return result.status === 'fulfilled' ? result.value : fallback;
}

export async function buildPullCatalogClientFallback(invokeG2bulk, settings = {}) {
  const [gamesResult, categoriesResult, flagsResult] = await Promise.allSettled([
    invokeG2bulk({ action: 'browseCatalog', subAction: 'listGames' }),
    invokeG2bulk({ action: 'browseCatalog', subAction: 'listPullCategories' }),
    fetchSyncedPullFlags(),
  ]);

  const gamesPayload = settleValue(gamesResult, { games: [] });
  const categoriesPayload = settleValue(categoriesResult, { accounts: [], giftCards: [], categories: [] });
  const flags = settleValue(flagsResult, { topupSlugs: new Set(), voucherCategoryIds: new Set() });

  if (gamesResult.status === 'rejected' && categoriesResult.status === 'rejected') {
    throw gamesResult.reason || categoriesResult.reason;
  }

  const remote = {
    games: mapBrowseGamesToPullRows(gamesPayload.games || []),
    accounts: categoriesPayload.accounts || [],
    giftCards: categoriesPayload.giftCards || [],
  };

  if (!remote.accounts.length && !remote.giftCards.length && Array.isArray(categoriesPayload.categories)) {
    const split = splitCategoriesToPullRows(categoriesPayload.categories);
    remote.accounts = split.accounts;
    remote.giftCards = split.giftCards;
  }

  const marked = markCatalogSynced(remote, flags);
  const selection = normalizePullSelection(settings.g2bulk_pull_selection || {});

  return {
    success: true,
    ...marked,
    selection,
    databaseSelection: selection,
    savedSelection: selection,
    catalogMode: settings.g2bulk_catalog_mode || 'sync',
    persisted: false,
    fallback: true,
  };
}

export function isEdgeTransportError(error) {
  const message = String(error?.message || error || '');
  return /failed to send a request to the edge function/i.test(message)
    || /failed to fetch/i.test(message)
    || /network/i.test(message);
}