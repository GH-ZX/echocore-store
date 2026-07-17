import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { parseG2BulkGameMeta, parseRegionFromText } from './regionMeta.ts';
import {
  formatCatalogueOfferName,
  resolvePointsName,
} from './gameCurrency.ts';
import { priceFromCost, resolveSyncedPrice } from './markupPricing.ts';

const G2BULK_BASE = 'https://api.g2bulk.com/v1';
/** G2Bulk docs: poll every 2–5w s; MLBB top-ups can exceed 45 s. */
const G2BULK_POLL_INTERVAL_MS = 2_500;
const G2BULK_POLL_TIMEOUT_MS = 50_000;
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

function isServiceRoleAuthorized(req: Request, supabaseUrl: string) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    const projectRef = String(supabaseUrl).replace(/^https?:\/\//, '').split('.')[0];
    return payload.role === 'service_role' && payload.ref === projectRef;
  } catch {
    return false;
  }
}

type Json = Record<string, unknown>;

function jsonResponse(body: Json, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Update offer on sync: always refresh cost/metadata; reprice only when
 * pricing_mode is auto/margin (or missing). fixed + is_sale keep customer price.
 */
async function updateOfferPreservingPricing(
  serviceClient: ReturnType<typeof createClient>,
  offerId: string,
  offerRow: Record<string, unknown>,
  storeMarkupPercent: number,
) {
  const { data: existing } = await serviceClient
    .from('offers')
    .select('is_sale, pricing_mode, pricing_margin_percent, price')
    .eq('id', offerId)
    .maybeSingle();

  const row = { ...offerRow };
  // Never overwrite admin pricing policy from catalog sync.
  delete row.pricing_mode;
  delete row.pricing_margin_percent;

  const cost = Number(offerRow.g2bulk_cost_usd);
  const resolved = resolveSyncedPrice(
    existing,
    Number.isFinite(cost) ? cost : 0,
    storeMarkupPercent,
  );

  if (resolved.preservePrice) {
    delete row.price;
  } else {
    row.price = resolved.price;
  }

  const { error } = await serviceClient.from('offers').update(row).eq('id', offerId);
  return error;
}

/** @deprecated name kept for call-site searchability during deploy */
async function updateOfferPreservingSale(
  serviceClient: ReturnType<typeof createClient>,
  offerId: string,
  offerRow: Record<string, unknown>,
  storeMarkupPercent = 15,
) {
  return updateOfferPreservingPricing(serviceClient, offerId, offerRow, storeMarkupPercent);
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
  timeoutMs = 12000,
) {
  const headers = new Headers(init.headers);
  headers.set('X-API-Key', apiKey);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (idempotencyKey) {
    headers.set('X-Idempotency-Key', idempotencyKey);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${G2BULK_BASE}${path}`, { ...init, headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }

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
  const { data } = await serviceClient
    .from('store_settings')
    .select('g2bulk_api_key')
    .eq('id', 1)
    .maybeSingle();

  const dbKey = (data?.g2bulk_api_key as string | null)?.trim() || null;
  if (dbKey) return dbKey;

  return Deno.env.get('G2BULK_API_KEY')?.trim() || null;
}

async function loadStoreSettingsRow(serviceClient: ReturnType<typeof createClient>) {
  const { data, error } = await serviceClient
    .from('store_settings')
    .select('g2bulk_enabled, g2bulk_markup_percent, g2bulk_catalog_only, g2bulk_catalog_mode, g2bulk_last_sync_at, g2bulk_last_check_at, g2bulk_check_summary, g2bulk_auto_sync_enabled, g2bulk_auto_sync_hour, g2bulk_auto_sync_timezone, g2bulk_auto_approve, g2bulk_pull_selection, g2bulk_api_key')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) return null;
  return data as Json;
}

function buildSettingsEnvelope(row: Json | null | undefined, envKey: string | null | undefined) {
  const settingsRow = (row || {}) as Record<string, unknown>;
  const apiKey = String(settingsRow.g2bulk_api_key ?? '').trim();
  const envKeyTrimmed = String(envKey ?? '').trim();
  const apiKeySource = apiKey
    ? (envKeyTrimmed ? 'both' : 'db')
    : (envKeyTrimmed ? 'env' : 'none');

  return {
    g2bulk_enabled: settingsRow.g2bulk_enabled === true,
    g2bulk_markup_percent: Number(settingsRow.g2bulk_markup_percent ?? 15),

    g2bulk_catalog_only: settingsRow.g2bulk_catalog_only !== false,
    g2bulk_catalog_mode: String(settingsRow.g2bulk_catalog_mode || 'sync'),
    g2bulk_last_sync_at: settingsRow.g2bulk_last_sync_at || null,
    g2bulk_last_check_at: settingsRow.g2bulk_last_check_at || null,
    g2bulk_check_summary: settingsRow.g2bulk_check_summary || {},
    g2bulk_auto_sync_enabled: settingsRow.g2bulk_auto_sync_enabled !== false,
    g2bulk_auto_sync_hour: Number(settingsRow.g2bulk_auto_sync_hour ?? 5),
    g2bulk_auto_sync_timezone: String(settingsRow.g2bulk_auto_sync_timezone || 'Asia/Damascus'),
    g2bulk_auto_approve: true,
    g2bulk_pull_selection: settingsRow.g2bulk_pull_selection || {},
    g2bulk_api_key_set: !!(apiKey || envKeyTrimmed),
    g2bulk_api_key_masked: apiKey
      ? (apiKey.length <= 8 ? '********' : `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`)
      : null,
    g2bulk_api_key_source: apiKeySource,
    g2bulk_api_key_active_source: apiKey ? 'db' : (envKeyTrimmed ? 'env' : 'none'),
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'game';
}

function formatSyncError(err: unknown) {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message || 'sync failed');
  }
  return 'sync failed';
}

function absImageUrl(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `https://api.g2bulk.com${url.startsWith('/') ? url : `/${url}`}`;
}

async function loadStorePricingSettings(serviceClient: ReturnType<typeof createClient>) {
  const { data: settings, error } = await serviceClient
    .from('store_settings')
    .select('g2bulk_markup_percent')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    return { markup: 15 };
  }

  return {
    markup: Number(settings?.g2bulk_markup_percent ?? 15),
  };
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

const CATALOG_BATCH_MAX = 8;

async function fetchGameFieldsInfo(code: string): Promise<{ fields: string[]; notes: string; ok: boolean }> {
  try {
    const res = await fetch(`${G2BULK_BASE}/games/fields`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: code }),
    });
    const payload = await res.json().catch(() => ({}));
    const info = payload?.info && typeof payload.info === 'object' ? payload.info as Json : payload;
    const fields = Array.isArray(info?.fields)
      ? (info.fields as unknown[]).map((value) => String(value).trim()).filter(Boolean)
      : [];
    const notes = String(info?.notes || payload?.notes || '').trim();
    // Treat HTTP success or any non-empty fields as usable requirements.
    const ok = res.ok || fields.length > 0;
    return { fields, notes, ok };
  } catch {
    return { fields: [], notes: '', ok: false };
  }
}

/** Build servers + topup_fields payload for a game row from G2Bulk public APIs. */
async function fetchTopupRequirements(code: string): Promise<{
  fields: string[];
  notes: string;
  servers: Array<{ id: string; label: string }>;
  fieldsKnown: boolean;
}> {
  const [fieldInfo, serverOptions] = await Promise.all([
    fetchGameFieldsInfo(code),
    fetchGameServersList(code),
  ]);

  const fields = fieldInfo.fields;
  const notes = fieldInfo.notes;
  const fieldsKnown = fieldInfo.ok && fields.length > 0;
  const needsServer = fieldsKnown
    ? fields.some((field) => /server/i.test(field))
    : serverOptions.length > 0;

  return {
    fields: fieldsKnown ? fields : [],
    notes,
    // When fields are known and server is not required, clear stale server lists (e.g. PUBG).
    servers: needsServer ? serverOptions : [],
    fieldsKnown,
  };
}

async function fetchGameServersList(code: string): Promise<Array<{ id: string; label: string }>> {
  try {
    const res = await fetch(`${G2BULK_BASE}/games/servers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: code }),
    });
    if (res.status === 403) return [];
    const payload = await res.json().catch(() => ({}));
    const servers = payload?.servers;
    if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return [];
    return Object.entries(servers as Record<string, unknown>)
      .map(([id, label]) => ({
        id: String(id).trim(),
        label: String(label ?? id).trim(),
      }))
      .filter((row) => row.id);
  } catch {
    return [];
  }
}

function buildTopupDescription(meta: { baseName: string; regionLabel: string }, notes = '') {
  if (notes) return notes;
  if (meta.regionLabel && meta.regionLabel !== 'Global') {
    return `Instant ${meta.baseName} top-up for ${meta.regionLabel} accounts.`;
  }
  return `Instant ${meta.baseName} top-up via EchoCore.`;
}

type PullSelection = {
  topupSyncBaseKeys: string[];
  topupLiveBaseKeys: string[];
  topupBaseKeys: string[];
  accountSyncCategoryIds: number[];
  accountLiveCategoryIds: number[];
  accountCategoryIds: number[];
  giftSyncCategoryIds: number[];
  giftLiveCategoryIds: number[];
  giftCategoryIds: number[];
  carouselBaseKeys: string[];
};

function normalizeIdList(sel: Json, key: string) {
  return Array.isArray(sel[key])
    ? (sel[key] as unknown[]).map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : [];
}

function normalizeCategoryIdSplit(sel: Json, syncKey: string, liveKey: string, legacyKey: string) {
  const syncIds = normalizeIdList(sel, syncKey);
  const liveIds = normalizeIdList(sel, liveKey);
  const legacyIds = normalizeIdList(sel, legacyKey);
  const syncCategoryIds = syncIds.length > 0 || liveIds.length > 0 ? syncIds : legacyIds;
  const liveCategoryIds = liveIds;
  const categoryIds = [...new Set([...syncCategoryIds, ...liveCategoryIds])];
  return { syncCategoryIds, liveCategoryIds, categoryIds };
}

function normalizePullSelection(raw: unknown): PullSelection {
  const sel = (raw && typeof raw === 'object' ? raw : {}) as Json;
  const syncKeys = Array.isArray(sel.topupSyncBaseKeys)
    ? sel.topupSyncBaseKeys.map((value) => String(value).trim()).filter(Boolean)
    : [];
  const liveKeys = Array.isArray(sel.topupLiveBaseKeys)
    ? sel.topupLiveBaseKeys.map((value) => String(value).trim()).filter(Boolean)
    : [];
  const legacyKeys = Array.isArray(sel.topupBaseKeys)
    ? sel.topupBaseKeys.map((value) => String(value).trim()).filter(Boolean)
    : [];
  const topupSyncBaseKeys = syncKeys.length > 0 || liveKeys.length > 0 ? syncKeys : legacyKeys;
  const topupLiveBaseKeys = liveKeys;
  const topupBaseKeys = [...new Set([...topupSyncBaseKeys, ...topupLiveBaseKeys])];

  const accountSplit = normalizeCategoryIdSplit(sel, 'accountSyncCategoryIds', 'accountLiveCategoryIds', 'accountCategoryIds');
  const giftSplit = normalizeCategoryIdSplit(sel, 'giftSyncCategoryIds', 'giftLiveCategoryIds', 'giftCategoryIds');

  return {
    topupSyncBaseKeys,
    topupLiveBaseKeys,
    topupBaseKeys,
    accountSyncCategoryIds: accountSplit.syncCategoryIds,
    accountLiveCategoryIds: accountSplit.liveCategoryIds,
    accountCategoryIds: accountSplit.categoryIds,
    giftSyncCategoryIds: giftSplit.syncCategoryIds,
    giftLiveCategoryIds: giftSplit.liveCategoryIds,
    giftCategoryIds: giftSplit.categoryIds,
    carouselBaseKeys: Array.isArray(sel.carouselBaseKeys)
      ? sel.carouselBaseKeys.map((value) => String(value).trim()).filter(Boolean)
      : [],
  };
}

function deriveCatalogMode(selection: PullSelection) {
  const hasSync = selection.topupSyncBaseKeys.length > 0
    || selection.accountSyncCategoryIds.length > 0
    || selection.giftSyncCategoryIds.length > 0;
  const hasLive = selection.topupLiveBaseKeys.length > 0
    || selection.accountLiveCategoryIds.length > 0
    || selection.giftLiveCategoryIds.length > 0;
  if (hasLive && hasSync) return 'hybrid';
  if (hasLive) return 'live';
  return 'sync';
}

function isEmptyPullSelection(sel: PullSelection) {
  return sel.topupBaseKeys.length === 0
    && sel.accountCategoryIds.length === 0
    && sel.giftCategoryIds.length === 0;
}

function mergePullSelections(saved: PullSelection, db: PullSelection): PullSelection {
  if (isEmptyPullSelection(saved)) {
    return normalizePullSelection(db);
  }
  return normalizePullSelection(saved);
}

function slugifyPullKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'game';
}

function slugifyUnderscoreKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'game';
}

function buildCatalogKeyIndex(games: Json[]) {
  const keyToCanonical = new Map<string, string>();
  for (const game of games) {
    const code = String(game.code || '').trim();
    if (!code) continue;
    for (const alias of [code, code.toLowerCase(), slugifyPullKey(code), slugifyUnderscoreKey(code)]) {
      if (alias) keyToCanonical.set(alias, code);
    }
  }
  return keyToCanonical;
}

function resolveCatalogBaseKey(key: string, index: Map<string, string>) {
  const raw = String(key || '').trim();
  if (!raw) return '';
  return index.get(raw)
    || index.get(raw.toLowerCase())
    || index.get(slugifyPullKey(raw))
    || index.get(slugifyUnderscoreKey(raw))
    || '';
}

function prunePullSelectionToCatalog(
  selection: PullSelection,
  catalog: { games: Json[]; accounts: Json[]; giftCards: Json[] },
): PullSelection {
  const index = buildCatalogKeyIndex(catalog.games || []);
  const validCodes = new Set(
    (catalog.games || []).map((g) => String(g.code || '').trim()).filter(Boolean),
  );
  const validAccountIds = new Set(
    (catalog.accounts || []).map((row) => Number(row.categoryId)).filter((value) => Number.isFinite(value)),
  );
  const validGiftIds = new Set(
    (catalog.giftCards || []).map((row) => Number(row.categoryId)).filter((value) => Number.isFinite(value)),
  );

  const pruneKeys = (keys: string[]) => [...new Set(
    keys
      .map((value) => resolveCatalogBaseKey(value, index))
      .filter((code) => code && validCodes.has(code)),
  )];

  const pruneIds = (ids: number[], valid: Set<number>) => [...new Set(
    ids.filter((value) => Number.isFinite(value) && valid.has(value)),
  )];

  return normalizePullSelection({
    ...selection,
    topupSyncBaseKeys: pruneKeys(selection.topupSyncBaseKeys),
    topupLiveBaseKeys: pruneKeys(selection.topupLiveBaseKeys),
    accountSyncCategoryIds: pruneIds(selection.accountSyncCategoryIds, validAccountIds),
    accountLiveCategoryIds: pruneIds(selection.accountLiveCategoryIds, validAccountIds),
    giftSyncCategoryIds: pruneIds(selection.giftSyncCategoryIds, validGiftIds),
    giftLiveCategoryIds: pruneIds(selection.giftLiveCategoryIds, validGiftIds),
    carouselBaseKeys: pruneKeys(selection.carouselBaseKeys),
  });
}

function pullSelectionFingerprint(selection: PullSelection) {
  const normalized = normalizePullSelection(selection);
  return JSON.stringify({
    topupSyncBaseKeys: normalized.topupSyncBaseKeys,
    topupLiveBaseKeys: normalized.topupLiveBaseKeys,
    accountSyncCategoryIds: normalized.accountSyncCategoryIds,
    accountLiveCategoryIds: normalized.accountLiveCategoryIds,
    giftSyncCategoryIds: normalized.giftSyncCategoryIds,
    giftLiveCategoryIds: normalized.giftLiveCategoryIds,
    carouselBaseKeys: normalized.carouselBaseKeys,
  });
}

async function buildDatabasePullSelectionFromDb(
  serviceClient: ReturnType<typeof createClient>,
): Promise<PullSelection> {
  const [{ data: topupGames }, { data: voucherGames }] = await Promise.all([
    serviceClient
      .from('games')
      .select('id, slug, g2bulk_game_code, name_en, show_in_carousel, carousel_order')
      .eq('catalog_source', 'g2bulk')
      .eq('redemption_method', 'uid')
      .not('g2bulk_game_code', 'is', null),
    serviceClient
      .from('games')
      .select('g2bulk_source_id, catalog_segment, name_en')
      .eq('catalog_source', 'g2bulk')
      .eq('redemption_method', 'redeem_code'),
  ]);

  const topupSyncBaseKeys: string[] = [];
  const carouselRows: { code: string; order: number }[] = [];

  for (const game of topupGames || []) {
    const code = String(game.g2bulk_game_code || '').trim();
    if (!code) continue;
    topupSyncBaseKeys.push(code);
    if (game.show_in_carousel) {
      carouselRows.push({
        code,
        order: Number(game.carousel_order ?? 999),
      });
    }
  }

  carouselRows.sort((a, b) => a.order - b.order);

  const accountSyncCategoryIds: number[] = [];
  const giftSyncCategoryIds: number[] = [];
  for (const row of voucherGames || []) {
    const categoryId = Number(row.g2bulk_source_id);
    if (!Number.isFinite(categoryId)) continue;
    const uiSegment = classifyVoucherSegment(String(row.name_en || ''));
    if (uiSegment === 'gaming_account') accountSyncCategoryIds.push(categoryId);
    else giftSyncCategoryIds.push(categoryId);
  }

  return normalizePullSelection({
    topupSyncBaseKeys,
    topupLiveBaseKeys: [],
    accountSyncCategoryIds,
    giftSyncCategoryIds,
    carouselBaseKeys: carouselRows.map((row) => row.code),
  });
}

async function loadPullSelection(serviceClient: ReturnType<typeof createClient>): Promise<PullSelection> {
  const { data } = await serviceClient
    .from('store_settings')
    .select('g2bulk_pull_selection')
    .eq('id', 1)
    .maybeSingle();
  return normalizePullSelection(data?.g2bulk_pull_selection);
}

async function buildPullCatalogPruneSnapshot() {
  const [validGames, categoriesPayload] = await Promise.all([
    fetchG2GamesPublic().then((rows) => filterValidG2Games(rows)),
    fetch(`${G2BULK_BASE}/category`).then((res) => res.json().catch(() => ({}))),
  ]);

  const games = validGames
    .filter((g) => !!String(g.code || '').trim())
    .map((g) => {
      const code = String(g.code || '').trim();
      const meta = parseG2BulkGameMeta(code, String(g.name || code));
      const displayName = meta.regionLabel !== 'Global'
        ? `${meta.baseName} (${meta.regionLabel})`
        : meta.baseName;
      return {
        code,
        name: displayName,
        image_url: absImageUrl(g.image_url as string | undefined),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const categories = Array.isArray(categoriesPayload.categories) ? categoriesPayload.categories : [];
  const accounts: Json[] = [];
  const giftCards: Json[] = [];

  for (const category of categories) {
    const categoryId = Number(category.id);
    if (!Number.isFinite(categoryId)) continue;
    const title = String(category.title || `Category ${categoryId}`);
    const segment = classifyVoucherSegment(title);
    const row = {
      categoryId,
      title,
      image_url: absImageUrl(category.image_url as string | undefined),
      productCount: Number(category.product_count ?? 0),
    };
    if (segment === 'gaming_account') accounts.push(row);
    else giftCards.push(row);
  }

  accounts.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  giftCards.sort((a, b) => String(a.title).localeCompare(String(b.title)));

  return { games, accounts, giftCards };
}

async function buildPullCatalogLists(serviceClient: ReturnType<typeof createClient>) {
  const [pruneSnapshot, syncedGames, syncedVoucherGames, savedSelection] = await Promise.all([
    buildPullCatalogPruneSnapshot(),
    serviceClient
      .from('games')
      .select('g2bulk_game_code, name_en')
      .eq('catalog_source', 'g2bulk')
      .eq('redemption_method', 'uid')
      .not('g2bulk_game_code', 'is', null),
    serviceClient
      .from('games')
      .select('g2bulk_source_id')
      .eq('catalog_source', 'g2bulk')
      .eq('redemption_method', 'redeem_code'),
    loadPullSelection(serviceClient),
  ]);

  const selection = normalizePullSelection(savedSelection);
  const selectedTopupCodes = new Set(selection.topupSyncBaseKeys);
  const selectedAccountIds = new Set(selection.accountSyncCategoryIds);
  const selectedGiftIds = new Set(selection.giftSyncCategoryIds);

  const syncedCodes = new Set(
    (syncedGames || []).map((row) => String(row.g2bulk_game_code || '').trim()).filter(Boolean),
  );
  const syncedCategoryIds = new Set(
    (syncedVoucherGames || [])
      .map((row) => Number(row.g2bulk_source_id))
      .filter((value) => Number.isFinite(value)),
  );

  const games = pruneSnapshot.games.map((row) => {
    const code = String(row.code || '').trim();
    return {
      ...row,
      synced: syncedCodes.has(code) && selectedTopupCodes.has(code),
    };
  });

  const accounts = pruneSnapshot.accounts.map((row) => {
    const categoryId = Number(row.categoryId);
    return {
      ...row,
      synced: syncedCategoryIds.has(categoryId) && selectedAccountIds.has(categoryId),
    };
  });

  const giftCards = pruneSnapshot.giftCards.map((row) => {
    const categoryId = Number(row.categoryId);
    return {
      ...row,
      synced: syncedCategoryIds.has(categoryId) && selectedGiftIds.has(categoryId),
    };
  });

  return { games, accounts, giftCards };
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
  const deadline = Date.now() + G2BULK_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { res, data } = await g2bulkFetch(apiKey, `/orders/${g2bulkOrderId}/delivery`);
    if (res.status === 200 && Array.isArray(data.delivery_items)) {
      return { ok: true as const, items: data.delivery_items as string[], data };
    }
    if (res.status === 410) {
      return { ok: false as const, error: (data.message as string) || 'Order refunded' };
    }
    await sleep(G2BULK_POLL_INTERVAL_MS);
  }
  return { ok: false as const, error: 'Delivery polling timed out' };
}

async function pollGameOrderStatus(apiKey: string, g2bulkOrderId: number) {
  const deadline = Date.now() + G2BULK_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
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
    await sleep(G2BULK_POLL_INTERVAL_MS);
  }
  return { ok: false as const, error: 'Top-up status polling timed out' };
}

function buildG2bulkCallbackUrl(supabaseUrl: string) {
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/g2bulk`;
}

type FulfillItemResult =
  | { ok: true; skipped?: boolean; g2bulkOrderId?: string; deliveryItems?: string[]; metadata?: Json }
  | { ok: false; error: string };

type AvailabilityItem = {
  offer_id?: string;
  quantity?: number;
  player_uid?: string | null;
};

function resolveEmbeddedGame(raw: unknown): Json {
  if (Array.isArray(raw)) {
    const first = raw[0];
    return first && typeof first === 'object' ? first as Json : {};
  }
  if (raw && typeof raw === 'object') return raw as Json;
  return {};
}

function parseG2bulkWalletBalance(data: Json): number {
  const candidates = [
    data.balance,
    data.wallet_balance,
    (data.user as Json | undefined)?.balance,
    (data.data as Json | undefined)?.balance,
  ];
  for (const value of candidates) {
    if (value == null || value === '') continue;
    const n = Number(String(value).replace(/[^0-9.\-]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return Number.NaN;
}

/** Live supplier cost + stock for one mapped offer. Prefer live G2Bulk data over stale DB cost. */
async function resolveLiveSupplierQuote(
  apiKey: string,
  offer: Json,
  game: Json,
  g2bulkType: string,
  qty: number,
): Promise<
  | { ok: true; unitCost: number }
  | { ok: false; reason: string; offerName?: string }
> {
  const offerName = String(offer.name_en || '');
  const dbCost = Number(offer.g2bulk_cost_usd);

  if (g2bulkType === 'voucher') {
    const productId = offer.g2bulk_product_id;
    if (productId == null || productId === '') {
      return { ok: false, reason: 'not_mapped', offerName };
    }

    try {
      const { res, data } = await g2bulkFetch(
        apiKey,
        `/products/${encodeURIComponent(String(productId))}`,
        {},
        undefined,
        8000,
      );
      if (!res.ok || data.success === false) {
        // Fall back to DB cost only when product endpoint is unreachable.
        if (Number.isFinite(dbCost) && dbCost > 0) {
          return { ok: true, unitCost: dbCost };
        }
        return { ok: false, reason: 'supplier_unreachable' };
      }

      // Docs: GET /products/:id returns { success, products: [ { unit_price, stock, ... } ] }
      let product: Json = {};
      if (Array.isArray(data.products) && data.products[0] && typeof data.products[0] === 'object') {
        product = data.products[0] as Json;
      } else if (data.product && typeof data.product === 'object' && !Array.isArray(data.product)) {
        product = data.product as Json;
      } else if (data.unit_price != null || data.stock != null || data.id != null) {
        product = data;
      }

      const stock = Number(product.stock);
      if (Number.isFinite(stock) && stock < qty) {
        return { ok: false, reason: 'out_of_stock', offerName };
      }

      const liveCost = Number(product.unit_price ?? product.price ?? product.amount);
      if (Number.isFinite(liveCost) && liveCost > 0) {
        return { ok: true, unitCost: liveCost };
      }
      if (Number.isFinite(dbCost) && dbCost > 0) {
        return { ok: true, unitCost: dbCost };
      }
      return { ok: false, reason: 'missing_supplier_cost', offerName };
    } catch {
      if (Number.isFinite(dbCost) && dbCost > 0) {
        return { ok: true, unitCost: dbCost };
      }
      return { ok: false, reason: 'supplier_unreachable' };
    }
  }

  // Top-up: confirm catalogue row still exists and read live amount.
  const gameCode = String(game.g2bulk_game_code || '').trim();
  const catalogueName = String(offer.g2bulk_catalogue_name || offer.name_en || '').trim();
  const catalogueId = offer.g2bulk_catalogue_id != null && offer.g2bulk_catalogue_id !== ''
    ? Number(offer.g2bulk_catalogue_id)
    : null;
  if (!gameCode || (!catalogueName && !Number.isFinite(catalogueId as number))) {
    return { ok: false, reason: 'not_mapped', offerName };
  }

  try {
    const catRes = await fetch(
      `${G2BULK_BASE}/games/${encodeURIComponent(gameCode)}/catalogue`,
    );
    const catPayload = await catRes.json().catch(() => ({})) as Json;
    if (!catRes.ok) {
      if (Number.isFinite(dbCost) && dbCost > 0) {
        return { ok: true, unitCost: dbCost };
      }
      return { ok: false, reason: 'supplier_unreachable' };
    }

    const catalogues = Array.isArray(catPayload.catalogues)
      ? catPayload.catalogues as Json[]
      : [];
    const match = catalogues.find((row) => {
      if (Number.isFinite(catalogueId as number) && Number(row?.id) === catalogueId) return true;
      const name = String(row?.name || '').trim();
      if (!catalogueName) return false;
      return name === catalogueName || name.toLowerCase() === catalogueName.toLowerCase();
    });

    if (!match) {
      // Catalogue still loads but this pack is gone — fall back to DB cost if present
      // so a display-name mismatch does not hard-block purchases.
      if (Number.isFinite(dbCost) && dbCost > 0) {
        return { ok: true, unitCost: dbCost };
      }
      return { ok: false, reason: 'out_of_stock', offerName };
    }

    const liveCost = Number(match.amount ?? match.unit_price ?? match.price);
    if (Number.isFinite(liveCost) && liveCost > 0) {
      return { ok: true, unitCost: liveCost };
    }
    if (Number.isFinite(dbCost) && dbCost > 0) {
      return { ok: true, unitCost: dbCost };
    }
    return { ok: false, reason: 'missing_supplier_cost', offerName };
  } catch {
    if (Number.isFinite(dbCost) && dbCost > 0) {
      return { ok: true, unitCost: dbCost };
    }
    return { ok: false, reason: 'supplier_unreachable' };
  }
}

async function evaluateFulfillmentAvailability(
  serviceClient: ReturnType<typeof createClient>,
  apiKey: string | null,
  rawItems: AvailabilityItem[],
) {
  const items = Array.isArray(rawItems) ? rawItems.filter((row) => row?.offer_id) : [];
  if (!items.length) {
    return { available: false, reason: 'items_required' };
  }

  const settingsRow = await loadStoreSettingsRow(serviceClient);
  if (!settingsRow?.g2bulk_enabled) {
    return { available: false, reason: 'supplier_disabled' };
  }

  if (!apiKey) {
    return { available: false, reason: 'supplier_not_configured' };
  }

  const offerIds = items.map((row) => String(row.offer_id));
  const { data: offers, error: offersError } = await serviceClient
    .from('offers')
    .select('id, name_en, g2bulk_cost_usd, g2bulk_type, g2bulk_product_id, g2bulk_catalogue_name, g2bulk_catalogue_id, games(g2bulk_game_code, redemption_method)')
    .in('id', offerIds);

  if (offersError) {
    return { available: false, reason: 'supplier_unreachable', message: offersError.message };
  }

  let totalSupplierCost = 0;

  for (const item of items) {
    const offer = (offers || []).find((row) => String(row.id) === String(item.offer_id)) as Json | undefined;
    if (!offer) {
      return { available: false, reason: 'offer_not_found' };
    }

    const qty = Math.max(1, Number(item.quantity) || 1);
    const game = resolveEmbeddedGame(offer.games);
    const g2bulkType = String(offer.g2bulk_type || '')
      || (game.redemption_method === 'redeem_code' ? 'voucher' : 'topup');
    const hasMapping = g2bulkType === 'voucher'
      ? !!offer.g2bulk_product_id
      : !!(game.g2bulk_game_code && (offer.g2bulk_catalogue_name || offer.name_en));

    if (!hasMapping) {
      return { available: false, reason: 'not_mapped', offerName: offer.name_en };
    }

    if (g2bulkType === 'topup' && !String(item.player_uid || '').trim()) {
      return { available: false, reason: 'player_id_required' };
    }

    const quote = await resolveLiveSupplierQuote(apiKey, offer, game, g2bulkType, qty);
    if (!quote.ok) {
      return {
        available: false,
        reason: quote.reason,
        offerName: quote.offerName || offer.name_en,
      };
    }

    totalSupplierCost += quote.unitCost * qty;
  }

  try {
    const { res, data } = await g2bulkFetch(apiKey, '/getMe', {}, undefined, 8000);
    if (!res.ok || data.success === false) {
      return { available: false, reason: 'supplier_unreachable' };
    }

    const walletBalance = parseG2bulkWalletBalance(data);
    if (!Number.isFinite(walletBalance)) {
      return { available: false, reason: 'supplier_unreachable' };
    }

    // Store's G2Bulk wallet cannot cover supplier cost — not the same as product stock.
    if (walletBalance + 0.001 < totalSupplierCost) {
      return {
        available: false,
        reason: 'insufficient_supplier_balance',
        walletBalance,
        requiredCost: totalSupplierCost,
      };
    }

    return {
      available: true,
      walletBalance,
      requiredCost: totalSupplierCost,
    };
  } catch {
    return { available: false, reason: 'supplier_unreachable' };
  }
}

async function fulfillG2bulkOrderItem(
  apiKey: string,
  orderId: string,
  item: Json,
  callbackUrl?: string | null,
): Promise<FulfillItemResult> {
  const offer = (item.offers || {}) as Json;
  const game = (offer.games || {}) as Json;
  const g2bulkType = (offer.g2bulk_type as string)
    || (game.redemption_method === 'redeem_code' ? 'voucher' : 'topup');

  const hasMapping = g2bulkType === 'voucher'
    ? !!offer.g2bulk_product_id
    : !!(game.g2bulk_game_code && (offer.g2bulk_catalogue_name || offer.name_en));

  if (!hasMapping) {
    return { ok: true, skipped: true, metadata: { reason: 'no_g2bulk_mapping' } };
  }

  const idempotencyKey = String(item.id || orderId);

  if (g2bulkType === 'voucher') {
    const productId = offer.g2bulk_product_id;
    const { res, data } = await g2bulkFetch(
      apiKey,
      `/products/${productId}/purchase`,
      { method: 'POST', body: JSON.stringify({ quantity: item.quantity || 1 }) },
      idempotencyKey,
    );

    if (!res.ok || data.success === false) {
      return { ok: false, error: (data.message as string) || 'Voucher purchase failed' };
    }

    let deliveryItems = Array.isArray(data.delivery_items) ? data.delivery_items as string[] : null;
    const g2bulkOrderId = data.order_id;

    if (!deliveryItems && data.status === 'PENDING' && g2bulkOrderId) {
      const polled = await pollVoucherDelivery(apiKey, Number(g2bulkOrderId));
      if (!polled.ok) return { ok: false, error: polled.error };
      deliveryItems = polled.items;
    }

    return {
      ok: true,
      g2bulkOrderId: String(g2bulkOrderId ?? ''),
      deliveryItems: deliveryItems || undefined,
      metadata: { type: 'voucher', g2bulk: data },
    };
  }

  const playerId = String(item.player_uid || '').trim();
  if (!playerId) {
    return { ok: false, error: 'Player ID is required for this top-up' };
  }

  const gameCode = game.g2bulk_game_code;
  const catalogueName = offer.g2bulk_catalogue_name || offer.name_en;
  const orderBody: Json = {
    catalogue_name: catalogueName,
    player_id: playerId,
    server_id: item.player_server || undefined,
    charname: item.player_charname || undefined,
    remark: `echocore-${orderId}`,
  };
  if (callbackUrl) orderBody.callback_url = callbackUrl;

  const { res, data } = await g2bulkFetch(
    apiKey,
    `/games/${gameCode}/order`,
    { method: 'POST', body: JSON.stringify(orderBody) },
    idempotencyKey,
  );

  if (!res.ok || data.success === false) {
    return { ok: false, error: (data.message as string) || 'Top-up order failed' };
  }

  const g2bulkOrderId = data.order?.order_id ?? data.order_id;
  let finalStatus = String(data.order?.status || data.status || 'PENDING').toUpperCase();

  if (finalStatus !== 'COMPLETED' && g2bulkOrderId) {
    const polled = await pollGameOrderStatus(apiKey, Number(g2bulkOrderId));
    if (!polled.ok) return { ok: false, error: polled.error };
    finalStatus = 'COMPLETED';
  }

  return {
    ok: true,
    g2bulkOrderId: String(g2bulkOrderId ?? ''),
    metadata: { type: 'topup', g2bulk: data, status: finalStatus },
  };
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
  const serviceAuth = isServiceRoleAuthorized(req, supabaseUrl);
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const body = await readJson(req);
  const action = String(body.action || '');

  let userId: string | null = null;
  if (!cronAuth && !serviceAuth) {
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      return jsonResponse({ success: false, message: 'Unauthorized' }, 401);
    }
    userId = authData.user.id;
  } else if (cronAuth && action !== 'syncCatalog' && action !== 'checkCatalog') {
    return jsonResponse({ success: false, message: 'Cron auth only allowed for syncCatalog/checkCatalog' }, 403);
  } else if (serviceAuth && !['syncCatalog', 'checkCatalog', 'fulfillOrder'].includes(action)) {
    return jsonResponse({ success: false, message: 'Service auth only allowed for syncCatalog/checkCatalog/fulfillOrder' }, 403);
  }

  const apiKey = await resolveApiKeyRaw(serviceClient);
  if (['getMe', 'fulfillOrder'].includes(action) && !apiKey) {
    return jsonResponse({ success: false, message: 'G2Bulk API key not configured' }, 400);
  }

  if (action === 'checkFulfillmentAvailability') {
    if (!userId) {
      return jsonResponse({ success: false, message: 'Not authenticated' }, 401);
    }

    const rawItems = Array.isArray(body.items) ? body.items as AvailabilityItem[] : [];
    const result = await evaluateFulfillmentAvailability(serviceClient, apiKey, rawItems);
    return jsonResponse({ success: true, ...result });
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

  if (action === 'getTopupMeta') {
    const code = String(body.game || '').trim();
    if (!code) {
      return jsonResponse({ success: false, message: 'game code required' }, 400);
    }

    const topupReqs = await fetchTopupRequirements(code);
    const fields = topupReqs.fields;
    const requiresServer = fields.some((field) => /server/i.test(field));
    const requiresCharname = fields.some((field) => /charname|character|char_name/i.test(field));

    return jsonResponse({
      success: true,
      game: code,
      fields,
      servers: topupReqs.servers,
      notes: topupReqs.notes,
      requiresServer,
      requiresCharname,
      fieldsKnown: topupReqs.fieldsKnown,
    });
  }

  if (action === 'saveSettings') {
    if (!(await isAdmin(userClient, userId!))) {
      return jsonResponse({ success: false, message: 'Admin only' }, 403);
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      // Manual approval path is intentionally disabled: always enforce auto-approve.
      g2bulk_auto_approve: true,
    };
    const payload = body as Json;

    if (payload.enabled !== undefined) {
      updates.g2bulk_enabled = !!payload.enabled;
    }
    if (payload.markupPercent !== undefined) {
      updates.g2bulk_markup_percent = Number(payload.markupPercent ?? 15);
    }
    if (payload.apiKey !== undefined) {
      updates.g2bulk_api_key = String(payload.apiKey || '').trim() || null;
    }
    if (payload.catalogOnly !== undefined) {
      updates.g2bulk_catalog_only = !!payload.catalogOnly;
    }
    if (payload.catalogMode !== undefined) {
      updates.g2bulk_catalog_mode = String(payload.catalogMode || 'sync');
    }
    if (payload.autoSyncEnabled !== undefined) {
      updates.g2bulk_auto_sync_enabled = !!payload.autoSyncEnabled;
    }
    if (payload.autoSyncHour !== undefined) {
      updates.g2bulk_auto_sync_hour = Number(payload.autoSyncHour ?? 5);
    }
    if (payload.autoSyncTimezone !== undefined) {
      updates.g2bulk_auto_sync_timezone = String(payload.autoSyncTimezone || 'Asia/Damascus');
    }
    const { error } = await serviceClient.from('store_settings').update(updates).eq('id', 1);
    if (error) {
      return jsonResponse({ success: false, message: error.message }, 500);
    }

    const row = await loadStoreSettingsRow(serviceClient);
    const envKey = Deno.env.get('G2BULK_API_KEY')?.trim();
    return jsonResponse({ success: true, settings: buildSettingsEnvelope(row, envKey) });
  }

  if (action === 'getSettings') {
    if (!(await isAdmin(userClient, userId!))) {
      return jsonResponse({ success: false, message: 'Admin only' }, 403);
    }

    const envKey = Deno.env.get('G2BULK_API_KEY')?.trim();
    const row = await loadStoreSettingsRow(serviceClient);
    let settings = buildSettingsEnvelope(row, envKey);

    if (!row) {
      try {
        const { data, error } = await userClient.rpc('get_g2bulk_settings');
        if (!error && data && typeof data === 'object') {
          settings = { ...settings, ...(data as Json) };
        }
      } catch {
        // ignore and fall back to the direct row values above
      }
    }

    const savedSelection = normalizePullSelection(settings.g2bulk_pull_selection);
    if (isEmptyPullSelection(savedSelection)) {
      const databaseSelection = await buildDatabasePullSelectionFromDb(serviceClient);
      const selection = mergePullSelections(savedSelection, databaseSelection);
      const catalogMode = deriveCatalogMode(selection);

      if (!isEmptyPullSelection(databaseSelection)) {
        const selectionPayload = {
          ...selection,
          updatedAt: new Date().toISOString(),
        };
        const { error: persistError } = await serviceClient
          .from('store_settings')
          .update({
            g2bulk_pull_selection: selectionPayload,
            g2bulk_catalog_mode: catalogMode,
            updated_at: new Date().toISOString(),
          })
          .eq('id', 1);

        if (!persistError) {
          settings.g2bulk_pull_selection = selectionPayload;
          settings.g2bulk_catalog_mode = catalogMode;
        }
      }
    }

    return jsonResponse({ success: true, settings });
  }

  if (action === 'fulfillOrder') {
    const orderId = String(body.orderId || '');
    if (!orderId) {
      return jsonResponse({ success: false, message: 'orderId required' }, 400);
    }

    const admin = serviceAuth || (userId ? await isAdmin(userClient, userId) : false);

    const { data: order, error: orderError } = await serviceClient
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (orderError || !order) {
      return jsonResponse({ success: false, message: 'Order not found' }, 404);
    }

    if (!admin && !serviceAuth && order.user_id !== userId) {
      return jsonResponse({ success: false, message: 'Unauthorized' }, 403);
    }

    if (order.status !== 'completed') {
      return jsonResponse({ success: false, message: 'Order is not completed' }, 400);
    }

    if (order.fulfillment_status === 'fulfilled') {
      return jsonResponse({ success: true, skipped: true, fulfillmentStatus: 'fulfilled' });
    }

    if (order.fulfillment_status === 'fulfilling') {
      return jsonResponse({ success: true, inProgress: true, fulfillmentStatus: 'fulfilling' });
    }

    const settingsRow = await loadStoreSettingsRow(serviceClient);
    if (!settingsRow?.g2bulk_enabled) {
      await serviceClient.rpc('apply_g2bulk_fulfillment', {
        p_order_id: orderId,
        p_fulfillment_status: 'skipped',
        p_metadata: { reason: 'g2bulk_disabled' },
      });
      return jsonResponse({ success: true, skipped: true, fulfillmentStatus: 'skipped' });
    }

    const { data: items } = await serviceClient
      .from('order_items')
      .select('*, offers(*, games(*))')
      .eq('order_id', orderId);

    if (!items?.length) {
      return jsonResponse({ success: false, message: 'No order items' }, 400);
    }

    const mappableItems = items.filter((row) => {
      const offer = row.offers;
      const game = offer?.games;
      const g2bulkType = offer?.g2bulk_type
        || (game?.redemption_method === 'redeem_code' ? 'voucher' : 'topup');
      return g2bulkType === 'voucher'
        ? !!offer?.g2bulk_product_id
        : !!(game?.g2bulk_game_code && (offer?.g2bulk_catalogue_name || offer?.name_en));
    });

    if (mappableItems.length === 0) {
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

    const callbackUrl = buildG2bulkCallbackUrl(supabaseUrl);
    const itemResults: Json[] = [];
    let fulfilledCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];
    let primaryG2bulkOrderId: string | null = null;
    const allDeliveryItems: string[] = [];

    try {
      for (const row of items) {
        if (row.fulfillment_status === 'fulfilled') {
          fulfilledCount += 1;
          itemResults.push({ itemId: row.id, status: 'fulfilled', skipped: true });
          continue;
        }

        const result = await fulfillG2bulkOrderItem(apiKey!, orderId, row, callbackUrl);

        if (result.ok && result.skipped) {
          skippedCount += 1;
          await serviceClient
            .from('order_items')
            .update({ fulfillment_status: 'fulfilled' })
            .eq('id', row.id);
          itemResults.push({ itemId: row.id, status: 'skipped' });
          continue;
        }

        if (!result.ok) {
          failedCount += 1;
          errors.push(result.error);
          await serviceClient
            .from('order_items')
            .update({ fulfillment_status: 'failed' })
            .eq('id', row.id);
          itemResults.push({ itemId: row.id, status: 'failed', error: result.error });
          continue;
        }

        fulfilledCount += 1;
        if (!primaryG2bulkOrderId && result.g2bulkOrderId) {
          primaryG2bulkOrderId = result.g2bulkOrderId;
        }
        if (result.deliveryItems?.length) {
          allDeliveryItems.push(...result.deliveryItems);
        }

        await serviceClient
          .from('order_items')
          .update({
            fulfillment_status: 'fulfilled',
            delivery_items: result.deliveryItems?.length ? result.deliveryItems : null,
          })
          .eq('id', row.id);

        itemResults.push({
          itemId: row.id,
          status: 'fulfilled',
          g2bulkOrderId: result.g2bulkOrderId,
        });
      }

      const finalStatus = failedCount > 0
        ? 'failed'
        : (fulfilledCount > 0 ? 'fulfilled' : 'skipped');

      await serviceClient.rpc('apply_g2bulk_fulfillment', {
        p_order_id: orderId,
        p_fulfillment_status: finalStatus,
        p_g2bulk_order_id: primaryG2bulkOrderId || undefined,
        p_delivery_items: allDeliveryItems.length ? allDeliveryItems : null,
        p_metadata: { items: itemResults, fulfilledCount, failedCount, skippedCount },
        p_error: errors[0] || null,
      });

      if (finalStatus === 'failed') {
        return jsonResponse({
          success: false,
          message: errors[0] || 'Fulfillment failed',
          fulfillmentStatus: 'failed',
          itemResults,
        }, 500);
      }

      return jsonResponse({
        success: true,
        fulfillmentStatus: finalStatus,
        deliveryItems: allDeliveryItems.length ? allDeliveryItems : undefined,
        g2bulkOrderId: primaryG2bulkOrderId,
        itemResults,
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
    if (!cronAuth && !serviceAuth && !(await isAdmin(userClient, userId!))) {
      return jsonResponse({ success: false, message: 'Admin only' }, 403);
    }

    const phase = String(body.phase || 'init');
    const hideManual = body.hideManual !== false;
    const now = new Date().toISOString();

    const { markup } = await loadStorePricingSettings(serviceClient);

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
      const slug = slugify(code);
      const imageUrl = absImageUrl(g.image_url as string | undefined);

      const [catRes, topupReqs] = await Promise.all([
        fetch(`${G2BULK_BASE}/games/${encodeURIComponent(code)}/catalogue`),
        fetchTopupRequirements(code),
      ]);
      const catPayload = await catRes.json().catch(() => ({}));
      const catalogues = Array.isArray(catPayload.catalogues) ? catPayload.catalogues : [];

      const description = buildTopupDescription(meta, topupReqs.notes);
      const displayName = meta.regionLabel !== 'Global'
        ? `${meta.baseName} (${meta.regionLabel})`
        : meta.baseName;

      const { data: existing } = await serviceClient
        .from('games')
        .select('id')
        .eq('g2bulk_game_code', code)
        .maybeSingle();

      const inferredPointsName = resolvePointsName(
        catalogues,
        code,
        meta.baseName,
        meta.baseKey,
      );

      const gameRow: Record<string, unknown> = {
        name_en: displayName,
        name_ar: displayName,
        slug,
        points_name: inferredPointsName || 'Top-up',
        image_url: imageUrl,
        description_en: description,
        description_ar: description,
        g2bulk_game_code: code,
        g2bulk_source_id: g.id ?? null,
        redemption_method: 'uid',
        catalog_source: 'g2bulk',
        catalog_segment: 'topup',
        active: catalogues.length > 0,
        show_in_carousel: false,
        g2bulk_synced_at: syncNow,
        parent_game_id: null,
        region_label: meta.regionLabel,
        servers: topupReqs.servers,
        topup_notes: topupReqs.notes || null,
      };
      if (topupReqs.fieldsKnown) {
        gameRow.topup_fields = topupReqs.fields;
      }

      let gameId = existing?.id as string | undefined;
      if (gameId) {
        const { error } = await serviceClient.from('games').update(gameRow).eq('id', gameId);
        if (error) throw error;
      } else {
        const { data: bySlug } = await serviceClient
          .from('games')
          .select('id')
          .eq('slug', slug)
          .maybeSingle();
        if (bySlug?.id) {
          const { error } = await serviceClient.from('games').update(gameRow).eq('id', bySlug.id);
          if (error) throw error;
          gameId = bySlug.id as string;
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

        const catalogueRegion = parseRegionFromText(catalogueName);
        const offerRegion = catalogueRegion.regionLabel !== 'Global'
          ? catalogueRegion.regionLabel
          : meta.regionLabel;

        const displayName = formatCatalogueOfferName(
          catalogueName,
          code,
          meta.baseName,
          meta.baseKey,
        );

        const offerRow = {
          game_id: gameId,
          name_en: displayName,
          name_ar: displayName,
          price: priceFromCost(cost, markup),
          region: offerRegion,
          g2bulk_type: 'topup',
          g2bulk_catalogue_name: catalogueName,
          g2bulk_catalogue_id: item.id ?? null,
          g2bulk_cost_usd: cost,
          catalog_source: 'g2bulk',
          active: true,
          description_en: displayName,
          description_ar: displayName,
          g2bulk_synced_at: syncNow,
        };

        const { data: existingOffer } = await serviceClient
          .from('offers')
          .select('id')
          .eq('game_id', gameId)
          .eq('g2bulk_catalogue_name', catalogueName)
          .maybeSingle();

        if (existingOffer?.id) {
          const error = await updateOfferPreservingSale(serviceClient, existingOffer.id, offerRow, markup);
          if (error) throw error;
        } else {
          const { error } = await serviceClient.from('offers').insert({
            ...offerRow,
            pricing_mode: 'auto',
          });
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

    async function syncVoucherCatalog(
      syncNow: string,
      voucherFilter: {
        accountSyncCategoryIds: Set<number>;
        giftSyncCategoryIds: Set<number>;
        includeGiftCards: boolean;
      },
    ) {
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
          const meta = categoryMeta.get(categoryId);
          const title = meta?.title || group.title;
          const uiSegment = classifyVoucherSegment(title);
          const allowed = uiSegment === 'gaming_account'
            ? voucherFilter.accountSyncCategoryIds.has(categoryId)
            : (voucherFilter.includeGiftCards && voucherFilter.giftSyncCategoryIds.has(categoryId));
          if (!allowed) continue;

          liveCategoryIds.add(categoryId);
          const slug = slugify(`cards-${categoryId}-${title}`);
          const categoryImage = meta?.image_url
            || absImageUrl(group.items.find((item) => item.image_url)?.image_url as string | undefined);

          const { data: existingGame } = await serviceClient
            .from('games')
            .select('id')
            .eq('g2bulk_source_id', categoryId)
            .eq('redemption_method', 'redeem_code')
            .maybeSingle();

          const gameRow = {
            name_en: title,
            name_ar: title,
            slug,
            points_name: 'Voucher',
            image_url: categoryImage,
            redemption_method: 'redeem_code',
            catalog_source: 'g2bulk',
            catalog_segment: 'voucher',
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
            const offerRegionMeta = parseRegionFromText(offerTitle);
            const offerRow = {
              game_id: gameId,
              name_en: offerTitle,
              name_ar: offerTitle,
              price: priceFromCost(cost, markup),
              region: offerRegionMeta.regionLabel !== 'Global' ? offerRegionMeta.regionLabel : null,
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
              const error = await updateOfferPreservingSale(serviceClient, existingOffer.id, offerRow, markup);
              if (error) throw error;
            } else {
              const { error } = await serviceClient.from('offers').insert({
                ...offerRow,
                pricing_mode: 'auto',
              });
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

      const pullSelection = prunePullSelectionToCatalog(
        await loadPullSelection(serviceClient),
        {
          games: filterValidG2Games(await fetchG2GamesPublic()).map((g) => ({
            code: String(g.code || '').trim(),
          })),
          accounts: [],
          giftCards: [],
        },
      );
      const selectedCodes = new Set(pullSelection.topupSyncBaseKeys);
      const allValidGames = filterValidG2Games(await fetchG2GamesPublic());
      const validGames = selectedCodes.size > 0
        ? allValidGames.filter((game) => {
          const code = String(game.code || '').trim();
          return code && selectedCodes.has(code);
        })
        : [];

      await serviceClient.from('store_settings').update({
        g2bulk_sync_state: {
          type: 'sync',
          gameEntries: validGames.map((g) => ({
            code: String(g.code || '').trim(),
            name: g.name,
            image_url: g.image_url,
            id: g.id,
          })),
          pullSelection,
          includeGiftCards: body.includeGiftCards !== false,
          startedAt: now,
        },
      }).eq('id', 1);

      return jsonResponse({
        success: true,
        phase: 'init',
        totalGames: validGames.length,
        selectedGames: validGames.length,
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

      const batchResults = [] as Array<{ code: string; error: string | null; gamesSynced: number; offersSynced: number; offersSkipped: number }>;
      for (const g of batch) {
        const code = String(g.code || '').trim();
        try {
          const result = await syncTopupGame(g, now);
          batchResults.push({ code, error: null, ...result });
        } catch (err) {
          batchResults.push({
            code,
            error: `${code}: ${formatSyncError(err)}`,
            gamesSynced: 0,
            offersSynced: 0,
            offersSkipped: 0,
          });
        }
      }

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
      const { data: settingsRow } = await serviceClient
        .from('store_settings')
        .select('g2bulk_sync_state')
        .eq('id', 1)
        .maybeSingle();
      const state = settingsRow?.g2bulk_sync_state as Json | null;
      const pullSelection = normalizePullSelection(state?.pullSelection || await loadPullSelection(serviceClient));
      const includeGiftCards = state?.includeGiftCards !== false && body.includeGiftCards !== false;
      const result = await syncVoucherCatalog(now, {
        accountSyncCategoryIds: new Set(pullSelection.accountSyncCategoryIds),
        giftSyncCategoryIds: new Set(pullSelection.giftSyncCategoryIds),
        includeGiftCards,
      });
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
      const { data: settingsRow } = await serviceClient
        .from('store_settings')
        .select('g2bulk_sync_state')
        .eq('id', 1)
        .maybeSingle();
      const state = settingsRow?.g2bulk_sync_state as Json | null;
      const pullSelection = normalizePullSelection(state?.pullSelection || await loadPullSelection(serviceClient));
      const carouselBaseKeys = pullSelection.carouselBaseKeys;

      const { data: topupGames } = await serviceClient
        .from('games')
        .select('id, g2bulk_game_code, name_en')
        .eq('catalog_source', 'g2bulk')
        .eq('redemption_method', 'uid')
        .not('g2bulk_game_code', 'is', null);

      await serviceClient
        .from('games')
        .update({ show_in_carousel: false })
        .eq('catalog_source', 'g2bulk');

      const selectedCodes = new Set(pullSelection.topupSyncBaseKeys);
      for (const game of topupGames || []) {
        const code = String(game.g2bulk_game_code || '').trim();
        if (!code || !selectedCodes.has(code)) {
          await serviceClient.from('games').update({ active: false }).eq('id', game.id);
          await serviceClient.from('offers').update({ active: false }).eq('game_id', game.id);
        }
      }

      const carouselIds: string[] = [];
      for (let i = 0; i < carouselBaseKeys.length; i++) {
        const targetCode = carouselBaseKeys[i];
        const matching = (topupGames || []).filter((row) => {
          const code = String(row.g2bulk_game_code || '').trim();
          return code && code === targetCode && selectedCodes.has(code);
        });
        for (const game of matching) {
          carouselIds.push(game.id as string);
          await serviceClient
            .from('games')
            .update({ show_in_carousel: true, carousel_order: i })
            .eq('id', game.id);
        }
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
    if (!cronAuth && !serviceAuth && !(await isAdmin(userClient, userId!))) {
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
    const { markup } = await loadStorePricingSettings(serviceClient);
    const subAction = String(body.subAction || 'listGames');

    async function fetchG2GamesPublic() {
      const gamesRes = await fetch(`${G2BULK_BASE}/games`);
      const gamesPayload = await gamesRes.json().catch(() => ({}));
      return Array.isArray(gamesPayload.games) ? gamesPayload.games : [];
    }

    if (subAction === 'listPullCategories') {
      const categoriesRes = await fetch(`${G2BULK_BASE}/category`);
      const categoriesPayload = await categoriesRes.json().catch(() => ({}));
      const categories = Array.isArray(categoriesPayload.categories) ? categoriesPayload.categories : [];
      const accounts: Json[] = [];
      const giftCards: Json[] = [];

      for (const category of categories) {
        const categoryId = Number(category.id);
        if (!Number.isFinite(categoryId)) continue;
        const title = String(category.title || `Category ${categoryId}`);
        const segment = classifyVoucherSegment(title);
        const row = {
          categoryId,
          title,
          image_url: absImageUrl(category.image_url as string | undefined),
          productCount: Number(category.product_count ?? 0),
          synced: false,
        };
        if (segment === 'gaming_account') accounts.push(row);
        else giftCards.push(row);
      }

      accounts.sort((a, b) => String(a.title).localeCompare(String(b.title)));
      giftCards.sort((a, b) => String(a.title).localeCompare(String(b.title)));

      return jsonResponse({ success: true, accounts, giftCards, categories });
    }

    if (subAction === 'listGames') {
      const g2Games = await fetchG2GamesPublic();
      const games = g2Games
        .filter((g) => {
          const code = String(g.code || '').trim();
          return code && !SKIP_GAME_CODES.has(code.toLowerCase());
        })
        .map((g) => {
          const code = String(g.code || '').trim();
          const meta = parseG2BulkGameMeta(code, String(g.name || code));
          const displayName = meta.regionLabel !== 'Global'
            ? `${meta.baseName} (${meta.regionLabel})`
            : meta.baseName;
          return {
            id: `live:game:${code}`,
            slug: slugify(code),
            code,
            name_en: displayName,
            name_ar: displayName,
            points_name: 'Top-up',
            image_url: absImageUrl(g.image_url as string | undefined),
            logo_url: absImageUrl(g.image_url as string | undefined),
            redemption_method: 'uid',
            catalog_source: 'live',
            active: true,
            g2bulk_game_code: code,
          };
        });

      return jsonResponse({ success: true, games });
    }

    if (subAction === 'gameGroup') {
      const code = String(body.code || '').trim();
      if (!code) return jsonResponse({ success: false, message: 'code required' }, 400);

      const g2Games = await fetchG2GamesPublic();
      const g = g2Games.find((row) => String(row.code || '').trim() === code);
      if (!g) return jsonResponse({ success: false, message: 'Game not found' }, 404);

      const meta = parseG2BulkGameMeta(code, String(g.name || code));
      const displayName = meta.regionLabel !== 'Global'
        ? `${meta.baseName} (${meta.regionLabel})`
        : meta.baseName;

      const catRes = await fetch(`${G2BULK_BASE}/games/${encodeURIComponent(code)}/catalogue`);
      const catPayload = await catRes.json().catch(() => ({}));
      const catalogues = Array.isArray(catPayload.catalogues) ? catPayload.catalogues : [];

      const pointsName = resolvePointsName(catalogues, code, meta.baseName, meta.baseKey);
      const gameRow = {
        id: `live:game:${code}`,
        slug: slugify(code),
        code,
        name_en: displayName,
        name_ar: displayName,
        points_name: pointsName || 'Top-up',
        image_url: absImageUrl(g.image_url as string | undefined),
        catalog_source: 'live',
        redemption_method: 'uid',
        catalog_segment: 'topup',
        active: catalogues.length > 0,
        g2bulk_game_code: code,
      };

      const offers = catalogues
        .filter((item) => {
          const name = String(item.name || '').trim();
          const cost = Number(item.amount);
          return name && Number.isFinite(cost) && cost > 0;
        })
        .map((item) => {
          const catalogueName = String(item.name || '').trim();
          const cost = Number(item.amount);
          return {
            id: `live:topup:${code}:${catalogueName}`,
            game_id: gameRow.id,
            name_en: formatCatalogueOfferName(catalogueName, code, meta.baseName, meta.baseKey),
            name_ar: formatCatalogueOfferName(catalogueName, code, meta.baseName, meta.baseKey),
            price: priceFromCost(cost, markup),
            region: meta.regionLabel,
            g2bulk_type: 'topup',
            g2bulk_game_code: code,
            g2bulk_catalogue_name: catalogueName,
            g2bulk_cost_usd: cost,
            catalog_source: 'live',
            active: true,
          };
        });

      return jsonResponse({ success: true, game: gameRow, offers });
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
        const uiSegment = classifyVoucherSegment(title);
        if (segmentFilter && uiSegment !== segmentFilter) continue;

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
          catalog_segment: 'voucher',
          active: hasStock || items.length > 0 || (meta?.product_count ?? 0) > 0,
          g2bulk_source_id: categoryId,
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
            price: priceFromCost(cost, markup),
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

    const { markup } = await loadStorePricingSettings(serviceClient);

    const resolved: { liveId: string; offerId: string }[] = [];

    for (const raw of items) {
      const liveId = String(raw.id || '');
      const g2bulkType = String(raw.g2bulk_type || 'topup');

      if (g2bulkType === 'topup') {
        const code = String(raw.g2bulk_game_code || '').trim();
        const catalogueName = String(raw.g2bulk_catalogue_name || '').trim();
        if (!code || !catalogueName) continue;

        const meta = parseG2BulkGameMeta(code, String(raw.game_name || code));
        const slug = slugify(code);

        const { data: existingGame } = await serviceClient
          .from('games')
          .select('id')
          .eq('g2bulk_game_code', code)
          .maybeSingle();

        const displayName = String(raw.game_name || `${meta.baseName} (${meta.regionLabel})`);

        const gameRow = {
          name_en: displayName,
          name_ar: displayName,
          slug,
          points_name: 'Top-up',
          redemption_method: 'uid',
          catalog_source: 'g2bulk',
          active: true,
          show_in_carousel: false,
          region_label: meta.regionLabel,
          g2bulk_game_code: code,
          g2bulk_synced_at: now,
        };

        let gameId = existingGame?.id as string | undefined;
        if (gameId) {
          await serviceClient.from('games').update(gameRow).eq('id', gameId);
        } else {
          const { data: inserted, error: insertError } = await serviceClient
            .from('games')
            .insert(gameRow)
            .select('id')
            .single();
          if (insertError) throw insertError;
          gameId = inserted.id as string;
        }

        const cost = Number(raw.g2bulk_cost_usd ?? raw.price);
        const offerDisplayName = formatCatalogueOfferName(
          catalogueName,
          code,
          meta.baseName,
          meta.baseKey,
        );

        const offerRow = {
          game_id: gameId,
          name_en: offerDisplayName,
          name_ar: offerDisplayName,
          price: Number.isFinite(cost) && cost > 0
            ? priceFromCost(cost, markup)
            : Number(raw.price) || 0.01,
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
          .eq('game_id', gameId)
          .eq('g2bulk_catalogue_name', catalogueName)
          .maybeSingle();

        let offerId = existingOffer?.id as string | undefined;
        if (offerId) {
          const error = await updateOfferPreservingSale(serviceClient, offerId, offerRow, markup);
          if (error) throw error;
        } else {
          const { data: insertedOffer, error: offerError } = await serviceClient
            .from('offers')
            .insert({ ...offerRow, pricing_mode: 'auto' })
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
                points_name: 'Voucher',
                redemption_method: 'redeem_code',
                catalog_source: 'g2bulk',
                catalog_segment: 'voucher',
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
              price: priceFromCost(cost, markup),
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

  if (action === 'listPullCatalog') {
    if (!(await isAdmin(userClient, userId!))) {
      return jsonResponse({ success: false, message: 'Admin only' }, 403);
    }

    try {
      const [savedSelection, catalog, databaseSelection] = await Promise.all([
        loadPullSelection(serviceClient),
        buildPullCatalogLists(serviceClient),
        buildDatabasePullSelectionFromDb(serviceClient),
      ]);
      const mergedSelection = mergePullSelections(savedSelection, databaseSelection);
      const selection = prunePullSelectionToCatalog(mergedSelection, catalog);
      const catalogMode = deriveCatalogMode(selection);
      let persisted = false;

      const shouldPersist = pullSelectionFingerprint(savedSelection) !== pullSelectionFingerprint(selection)
        || (isEmptyPullSelection(savedSelection) && !isEmptyPullSelection(databaseSelection));

      if (shouldPersist) {
        const { error: persistError } = await serviceClient
          .from('store_settings')
          .update({
            g2bulk_pull_selection: { ...selection, updatedAt: new Date().toISOString() },
            g2bulk_catalog_mode: catalogMode,
            updated_at: new Date().toISOString(),
          })
          .eq('id', 1);
        persisted = !persistError;
      }

      return jsonResponse({
        success: true,
        ...catalog,
        selection,
        databaseSelection,
        savedSelection,
        catalogMode,
        persisted,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'listPullCatalog failed';
      console.error('listPullCatalog', err);
      return jsonResponse({ success: false, message }, 500);
    }
  }

  if (action === 'savePullSelection') {
    if (!(await isAdmin(userClient, userId!))) {
      return jsonResponse({ success: false, message: 'Admin only' }, 403);
    }

    const catalog = await buildPullCatalogPruneSnapshot();
    const selection = prunePullSelectionToCatalog(normalizePullSelection({
      topupSyncBaseKeys: body.topupSyncBaseKeys,
      topupLiveBaseKeys: body.topupLiveBaseKeys,
      topupBaseKeys: body.topupBaseKeys,
      accountSyncCategoryIds: body.accountSyncCategoryIds,
      accountLiveCategoryIds: body.accountLiveCategoryIds,
      accountCategoryIds: body.accountCategoryIds,
      giftSyncCategoryIds: body.giftSyncCategoryIds,
      giftLiveCategoryIds: body.giftLiveCategoryIds,
      giftCategoryIds: body.giftCategoryIds,
      carouselBaseKeys: body.carouselBaseKeys,
    }), catalog);
    const catalogMode = body.catalogMode === 'live' || body.catalogMode === 'sync'
      ? body.catalogMode
      : deriveCatalogMode(selection);
    const selectionPayload = {
      ...selection,
      updatedAt: new Date().toISOString(),
    };

    const { error } = await serviceClient
      .from('store_settings')
      .update({
        g2bulk_pull_selection: selectionPayload,
        g2bulk_catalog_mode: catalogMode,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    if (error) {
      return jsonResponse({ success: false, message: error.message }, 500);
    }

    return jsonResponse({ success: true, selection: selectionPayload, catalogMode });
  }

  if (action === 'clearSyncedCatalog') {
    if (!(await isAdmin(userClient, userId!))) {
      return jsonResponse({ success: false, message: 'Admin only' }, 403);
    }

    const { count: offerCount } = await serviceClient
      .from('offers')
      .delete({ count: 'exact' })
      .eq('catalog_source', 'g2bulk');

    const { count: deletedGames } = await serviceClient
      .from('games')
      .delete({ count: 'exact' })
      .eq('catalog_source', 'g2bulk');

    await serviceClient.from('store_settings').update({
      g2bulk_last_sync_at: null,
      g2bulk_last_check_at: null,
      g2bulk_check_summary: null,
      g2bulk_sync_state: null,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);

    return jsonResponse({
      success: true,
      cleared: true,
      offersRemoved: offerCount ?? 0,
      gamesRemoved: deletedGames ?? 0,
    });
  }

  return jsonResponse({ success: false, message: 'Unknown action' }, 400);
});