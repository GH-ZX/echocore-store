import { classifyVoucherSegment } from './catalogSegments';
import { supabase } from './supabase';
import {
  buildCarouselBaseKeysFromGames,
  normalizePullSelection,
  pruneSelectionToCatalog,
} from './pullCatalogUtils';

async function fetchSyncedPullFlags() {
  const [topupRes, voucherRes] = await Promise.all([
    supabase
      .from('games')
      .select('g2bulk_game_code, g2bulk_source_id, redemption_method, show_in_carousel, carousel_order, name_en, name_ar')
      .eq('catalog_source', 'g2bulk')
      .eq('redemption_method', 'uid')
      .not('g2bulk_game_code', 'is', null),
    supabase
      .from('games')
      .select('g2bulk_source_id, redemption_method, show_in_carousel, carousel_order, name_en, name_ar')
      .eq('catalog_source', 'g2bulk')
      .eq('redemption_method', 'redeem_code'),
  ]);

  if (topupRes.error) throw topupRes.error;
  if (voucherRes.error) throw voucherRes.error;

  const topupRows = topupRes.data || [];
  const voucherRows = voucherRes.data || [];

  return {
    topupCodes: new Set(
      topupRows.map((row) => String(row.g2bulk_game_code || '').trim()).filter(Boolean),
    ),
    voucherCategoryIds: new Set(
      voucherRows
        .map((row) => Number(row.g2bulk_source_id))
        .filter((value) => Number.isFinite(value)),
    ),
    // Live homepage carousel flags (redeem + top-up)
    carouselBaseKeys: buildCarouselBaseKeysFromGames([
      ...topupRows,
      ...voucherRows,
    ]),
  };
}

function markCatalogSynced(catalog = {}, flags = {}, selection = {}) {
  const normalized = normalizePullSelection(selection);
  const selectedTopup = new Set(normalized.topupSyncBaseKeys);
  const selectedAccounts = new Set(normalized.accountSyncCategoryIds);
  const selectedGifts = new Set(normalized.giftSyncCategoryIds);

  const games = (catalog.games || []).map((item) => {
    const code = String(item.code || '').trim();
    return {
      ...item,
      synced: flags.topupCodes?.has(code) && selectedTopup.has(code),
    };
  });

  const accounts = (catalog.accounts || []).map((item) => {
    const categoryId = Number(item.categoryId);
    return {
      ...item,
      synced: flags.voucherCategoryIds?.has(categoryId) && selectedAccounts.has(categoryId),
    };
  });

  const giftCards = (catalog.giftCards || []).map((item) => {
    const categoryId = Number(item.categoryId);
    return {
      ...item,
      synced: flags.voucherCategoryIds?.has(categoryId) && selectedGifts.has(categoryId),
    };
  });

  return { games, accounts, giftCards };
}

function mapBrowseGamesToPullRows(games = []) {
  return games.map((game) => {
    const code = String(game.code || game.g2bulk_game_code || '').trim();
    return {
      code,
      name: game.name_en || game.name_ar || code,
      image_url: game.image_url || game.logo_url || null,
      synced: false,
    };
  }).filter((row) => row.code);
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
  const flags = settleValue(flagsResult, { topupCodes: new Set(), voucherCategoryIds: new Set() });

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

  const savedSelection = normalizePullSelection(settings.g2bulk_pull_selection || {});
  // Pair dashboard carousel ticks with live games.show_in_carousel (homepage edits)
  const selectionWithLiveCarousel = normalizePullSelection({
    ...savedSelection,
    carouselBaseKeys: Array.isArray(flags.carouselBaseKeys) && flags.carouselBaseKeys.length > 0
      ? flags.carouselBaseKeys
      : savedSelection.carouselBaseKeys,
  });
  const marked = markCatalogSynced(remote, flags, selectionWithLiveCarousel);
  const selection = pruneSelectionToCatalog(selectionWithLiveCarousel, marked);

  return {
    success: true,
    ...marked,
    selection,
    databaseSelection: selection,
    savedSelection,
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