/**
 * store_settings columns that must never be selected into the browser.
 * Keys live in Supabase Edge secrets (preferred) or DB — admin UIs use masked RPCs / edge only.
 */
export const STORE_SETTINGS_SECRET_COLUMNS = Object.freeze([
  'g2bulk_api_key',
  'sam_api_key',
  'sam_webhook_secret',
  'shamcash_api_token',
  'igdb_client_id',
  'igdb_client_secret',
]);

/** Columns safe for client admin/settings reads (no API keys / secrets). */
export const STORE_SETTINGS_CLIENT_SELECT = [
  'id',
  'shamcash_enabled',
  'shamcash_api_base_url',
  'shamcash_account_id',
  'shamcash_merchant_name',
  'binance_enabled',
  'mastercard_enabled',
  'theme',
  'updated_at',
  'home_layout',
  'shamcash_qr_image_url',
  'shamcash_pay_code',
  'g2bulk_enabled',
  'g2bulk_markup_percent',
  'g2bulk_catalog_only',
  'g2bulk_last_sync_at',
  'g2bulk_auto_sync_enabled',
  'g2bulk_auto_sync_hour',
  'g2bulk_auto_sync_timezone',
  'g2bulk_sync_state',
  'g2bulk_last_check_at',
  'g2bulk_check_summary',
  'g2bulk_catalog_mode',
  'g2bulk_pull_selection',
  'sam_api_enabled',
  'sam_wallet_mode',
  'sam_invoice_method',
  'sam_wallet_identifier',
  'sam_invoice_currency',
  'syriatel_enabled',
  'syriatel_qr_image_url',
  'syriatel_pay_code',
  'sam_shamcash_wallet_identifier',
  'sam_syriatel_wallet_identifier',
  'maintenance_enabled',
  'maintenance_message_ar',
  'maintenance_message_en',
  'maintenance_allow_admins',
  'require_verified_accounts',
  'g2bulk_charm_pricing_enabled',
  'cart_enabled',
  'g2bulk_auto_approve',
  'sam_syp_per_usd',
  'sam_syp_rate_updated_at',
  'igdb_auto_cover_on_sync',
].join(',');

/** Strip secret keys from any settings-like object (defense in depth). */
export function stripStoreSecrets(row) {
  if (!row || typeof row !== 'object') return row;
  const next = { ...row };
  for (const key of STORE_SETTINGS_SECRET_COLUMNS) {
    if (key in next) delete next[key];
  }
  // Never expose raw key fields under alternate names either
  delete next.api_key;
  delete next.apiKey;
  return next;
}

export function storeSecretKeySetFlags(row = {}) {
  return {
    g2bulk_api_key_set: !!(row.g2bulk_api_key && String(row.g2bulk_api_key).trim()),
    sam_api_key_set: !!(row.sam_api_key && String(row.sam_api_key).trim()),
    shamcash_api_token_set: !!(row.shamcash_api_token && String(row.shamcash_api_token).trim()),
    igdb_configured: !!(
      (row.igdb_client_id && String(row.igdb_client_id).trim())
      && (row.igdb_client_secret && String(row.igdb_client_secret).trim())
    ),
  };
}
