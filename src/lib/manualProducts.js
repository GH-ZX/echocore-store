import { supabase } from './supabase';

// Products the store owner delivers by hand (games.delivery_mode = 'manual'): the customer
// answers the product's questions at checkout, the paid order waits in fulfillment_status
// 'awaiting_delivery', and the owner delivers it (optionally with text) or cancels it with a
// refund to the customer's balance. See supabase/migrations/20261107090000_manual_products_and_categories.sql.

export const MAX_CUSTOMER_FIELDS = 10;
export const CUSTOMER_FIELD_TYPES = ['text', 'email', 'phone', 'number', 'textarea'];
export const CATALOG_CHANGED_EVENT = 'echocore:catalog-changed';

export function isManualGame(game) {
  return game?.delivery_mode === 'manual';
}

export function isAwaitingDelivery(status) {
  return status === 'awaiting_delivery';
}

/** Storefront "G2Bulk catalog only" mode still shows the owner's own products. */
export function applyCatalogOnlyGames(query) {
  return query.or('catalog_source.eq.g2bulk,delivery_mode.eq.manual');
}

export function applyCatalogOnlyOffers(query) {
  return query.in('catalog_source', ['g2bulk', 'manual']);
}

export function slugify(value = '') {
  const slug = String(value)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug;
}

function fieldKey(label, index, used) {
  let key = slugify(label).replace(/-/g, '_').slice(0, 32) || `field_${index + 1}`;
  while (used.has(key)) key = `${key}_${index + 1}`;
  used.add(key);
  return key;
}

/** Clean the owner's list of questions: labels required, unique keys, known types, max 10. */
export function normalizeCustomerFields(fields = []) {
  const used = new Set();
  return (Array.isArray(fields) ? fields : [])
    .map((field) => ({
      key: String(field?.key || '').trim(),
      label_ar: String(field?.label_ar || '').trim().slice(0, 80),
      label_en: String(field?.label_en || '').trim().slice(0, 80),
      placeholder_ar: String(field?.placeholder_ar || '').trim().slice(0, 120),
      placeholder_en: String(field?.placeholder_en || '').trim().slice(0, 120),
      type: CUSTOMER_FIELD_TYPES.includes(field?.type) ? field.type : 'text',
      required: field?.required !== false,
    }))
    .filter((field) => field.label_ar || field.label_en)
    .slice(0, MAX_CUSTOMER_FIELDS)
    .map((field, index) => {
      const key = field.key && !used.has(field.key) && /^[a-z0-9_]{1,40}$/.test(field.key)
        ? (used.add(field.key), field.key)
        : fieldKey(field.label_en || field.label_ar, index, used);
      return {
        ...field,
        key,
        label_ar: field.label_ar || field.label_en,
        label_en: field.label_en || field.label_ar,
      };
    });
}

export function customerFieldLabel(field, lang) {
  return (lang === 'ar' ? field?.label_ar : field?.label_en) || field?.label_ar || field?.label_en || field?.key || '';
}

export function customerFieldPlaceholder(field, lang) {
  return (lang === 'ar' ? field?.placeholder_ar : field?.placeholder_en) || '';
}

/** Trimmed answers for the product's own fields only. */
export function cleanCustomerInputs(fields = [], inputs = {}) {
  const out = {};
  for (const field of normalizeCustomerFields(fields)) {
    const value = String(inputs?.[field.key] ?? '').trim().slice(0, 1000);
    if (value) out[field.key] = value;
  }
  return out;
}

export function missingCustomerFields(fields = [], inputs = {}) {
  const clean = cleanCustomerInputs(fields, inputs);
  return normalizeCustomerFields(fields).filter((field) => field.required && !clean[field.key]);
}

export function invalidCustomerFields(fields = [], inputs = {}) {
  const clean = cleanCustomerInputs(fields, inputs);
  return normalizeCustomerFields(fields).filter((field) => {
    const value = clean[field.key];
    if (!value) return false;
    if (field.type === 'email') return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    if (field.type === 'phone') return !/^\+?[0-9 ()-]{6,20}$/.test(value);
    if (field.type === 'number') return !/^-?[0-9]+([.,][0-9]+)?$/.test(value);
    return false;
  });
}

export function deliveryEta(game, lang) {
  return ((lang === 'ar' ? game?.delivery_eta_ar : game?.delivery_eta_en) || game?.delivery_eta_ar || game?.delivery_eta_en || '').trim();
}

export function deliveryNote(game, lang) {
  return ((lang === 'ar' ? game?.delivery_note_ar : game?.delivery_note_en) || game?.delivery_note_ar || game?.delivery_note_en || '').trim();
}

/** order_items.redemption_info.inputs → [{ label, value }] using the product's field labels. */
export function describeCustomerInputs(item, lang) {
  const inputs = item?.redemption_info?.inputs;
  if (!inputs || typeof inputs !== 'object') return [];
  const fields = item?.offers?.games?.customer_fields || [];
  const byKey = Object.fromEntries(normalizeCustomerFields(fields).map((field) => [field.key, field]));
  return Object.entries(inputs).map(([key, value]) => ({
    key,
    label: byKey[key] ? customerFieldLabel(byKey[key], lang) : key,
    value: String(value ?? ''),
  }));
}

/** Map the database's checkout errors to the customer's language. */
export function manualCheckoutErrorMessage(error, t = {}) {
  const message = String(error?.message || error || '');
  if (message.includes('manual_products_separately')) {
    return t.manualProductsSeparately || 'Products delivered by the store must be bought on their own.';
  }
  const required = message.match(/manual_input_required:\s*(.+)$/);
  if (required) {
    return `${t.manualInputRequired || 'Please fill in'}: ${required[1].trim()}`;
  }
  return null;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────────────────

export async function fetchCategories({ includeInactive = false } = {}) {
  let query = supabase.from('categories').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true });
  if (!includeInactive) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function saveCategory(category) {
  const row = {
    slug: slugify(category.slug || category.name_en || category.name_ar) || `category-${Date.now().toString(36)}`,
    name_ar: String(category.name_ar || category.name_en || '').trim(),
    name_en: String(category.name_en || category.name_ar || '').trim(),
    description_ar: String(category.description_ar || '').trim() || null,
    description_en: String(category.description_en || '').trim() || null,
    image_url: String(category.image_url || '').trim() || null,
    sort_order: Number.isFinite(Number(category.sort_order)) ? Number(category.sort_order) : 0,
    active: category.active !== false,
    show_on_home: category.show_on_home !== false,
    updated_at: new Date().toISOString(),
  };
  const query = category.id
    ? supabase.from('categories').update(row).eq('id', category.id)
    : supabase.from('categories').insert(row);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

export async function deleteCategory(id) {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Create or update a manual product and its price options in one go.
 * `packages` rows: { id?, name_ar, name_en, price, active }. Removed packages are hidden
 * (active = false), never deleted, so old orders keep their offer.
 */
export async function saveManualProduct(product, packages = [], { removedPackageIds = [] } = {}) {
  const nameAr = String(product.name_ar || '').trim();
  const nameEn = String(product.name_en || '').trim() || nameAr;
  const gameRow = {
    name_ar: nameAr || nameEn,
    name_en: nameEn,
    slug: slugify(product.slug || nameEn) || `product-${Date.now().toString(36)}`,
    points_name: String(product.points_name || '').trim() || '-',
    description_ar: String(product.description_ar || '').trim(),
    description_en: String(product.description_en || '').trim(),
    image_url: product.image_url || null,
    logo_url: product.logo_url || null,
    image_custom: !!product.image_url,
    logo_custom: !!product.logo_url,
    category_id: product.category_id || null,
    delivery_mode: 'manual',
    delivery_eta_ar: String(product.delivery_eta_ar || '').trim() || null,
    delivery_eta_en: String(product.delivery_eta_en || '').trim() || null,
    delivery_note_ar: String(product.delivery_note_ar || '').trim() || null,
    delivery_note_en: String(product.delivery_note_en || '').trim() || null,
    customer_fields: normalizeCustomerFields(product.customer_fields),
    card_badge_ar: String(product.card_badge_ar || '').trim() || null,
    card_badge_en: String(product.card_badge_en || '').trim() || null,
    redemption_method: 'redeem_code',
    catalog_source: 'manual',
    active: product.active !== false,
  };

  const gameQuery = product.id
    ? supabase.from('games').update(gameRow).eq('id', product.id)
    : supabase.from('games').insert({ ...gameRow, show_in_carousel: false });
  const { data: game, error: gameError } = await gameQuery.select().single();
  if (gameError) {
    if (gameError.code === '23505') throw new Error('slug_taken');
    throw gameError;
  }

  const saved = [];
  for (const pack of packages) {
    const price = Math.round(Number(pack.price) * 100) / 100;
    const row = {
      game_id: game.id,
      name_ar: String(pack.name_ar || pack.name_en || '').trim(),
      name_en: String(pack.name_en || pack.name_ar || '').trim(),
      price,
      active: pack.active !== false,
      pricing_mode: 'fixed',
      catalog_source: 'manual',
      is_sale: false,
    };
    const query = pack.id
      ? supabase.from('offers').update(row).eq('id', pack.id)
      : supabase.from('offers').insert(row);
    const { data, error } = await query.select().single();
    if (error) throw error;
    saved.push(data);
  }
  if (removedPackageIds.length) {
    const { data, error } = await supabase.from('offers').update({ active: false }).in('id', removedPackageIds).select();
    if (error) throw error;
    saved.push(...(data || []));
  }

  announceCatalogChange({ games: [game], offers: saved });
  return { game, offers: saved };
}

export async function fetchManualPackages(gameId) {
  if (!gameId) return [];
  const { data, error } = await supabase
    .from('offers')
    .select('id, name_ar, name_en, price, active, created_at')
    .eq('game_id', gameId)
    .order('price', { ascending: true });
  if (error) throw error;
  return data || [];
}

export function announceCatalogChange(detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CATALOG_CHANGED_EVENT, { detail }));
}

export async function adminDeliverOrder(orderId, deliveryText = '') {
  const { data, error } = await supabase.rpc('admin_deliver_order', {
    p_order_id: orderId,
    p_delivery_text: String(deliveryText || '').trim() || null,
  });
  if (error) throw error;
  return data;
}

export async function adminCancelManualOrder(orderId, reason = '') {
  const { data, error } = await supabase.rpc('admin_cancel_manual_order', {
    p_order_id: orderId,
    p_reason: String(reason || '').trim() || null,
  });
  if (error) throw error;
  return data;
}
