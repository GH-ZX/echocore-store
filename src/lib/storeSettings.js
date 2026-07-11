import { supabase } from './supabase';

const DEFAULT_SETTINGS = {
  id: 1,
  shamcash_enabled: false,
  shamcash_api_base_url: 'https://api.shamcash-api.com/v1',
  shamcash_api_token: '',
  shamcash_account_id: '',
  shamcash_merchant_name: 'ECHOCORE Store',
  shamcash_qr_image_url: '',
  shamcash_pay_code: '',
  syriatel_enabled: false,
  syriatel_qr_image_url: '',
  syriatel_pay_code: '',
  binance_enabled: false,
  mastercard_enabled: false,
  theme: {},
  home_layout: [],
};

export async function fetchPaymentMethods() {
  const { data, error } = await supabase.rpc('get_payment_methods');
  if (error) {
    console.error('get_payment_methods:', error);
    return { shamcash: true, binance: false, mastercard: false, shamcashMerchantName: 'ECHOCORE Store', g2bulkCatalogOnly: true };
  }
  return data || { shamcash: false, binance: false, mastercard: false };
}

export async function fetchStoreSettings() {
  const { data, error } = await supabase
    .from('store_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    if (error.message?.includes('store_settings') || error.code === 'PGRST205') {
      throw new Error('Run setup_store_settings.sql in Supabase SQL Editor first.');
    }
    if (error.message?.includes('theme') || error.message?.includes('home_layout')) {
      throw new Error('Run setup_store_settings.sql in Supabase SQL Editor to enable store settings.');
    }
    throw error;
  }

  return { ...DEFAULT_SETTINGS, ...data };
}

export async function saveStoreSettings(settings) {
  let existing = DEFAULT_SETTINGS;
  try {
    existing = await fetchStoreSettings();
  } catch {
    // table may not exist yet during first-time setup
  }

  const payload = {
    id: 1,
    shamcash_enabled: settings.shamcash_enabled ?? existing.shamcash_enabled ?? DEFAULT_SETTINGS.shamcash_enabled,
    shamcash_api_base_url: (settings.shamcash_api_base_url ?? existing.shamcash_api_base_url ?? DEFAULT_SETTINGS.shamcash_api_base_url).replace(/\/$/, ''),
    shamcash_api_token: settings.shamcash_api_token !== undefined
      ? (settings.shamcash_api_token?.trim() || null)
      : (existing.shamcash_api_token?.trim() || null),
    shamcash_account_id: settings.shamcash_account_id !== undefined
      ? (settings.shamcash_account_id?.trim() || null)
      : (existing.shamcash_account_id?.trim() || null),
    shamcash_merchant_name: (settings.shamcash_merchant_name ?? existing.shamcash_merchant_name ?? DEFAULT_SETTINGS.shamcash_merchant_name).trim() || 'ECHOCORE Store',
    shamcash_qr_image_url: settings.shamcash_qr_image_url !== undefined
      ? (settings.shamcash_qr_image_url?.trim() || null)
      : (existing.shamcash_qr_image_url?.trim() || null),
    shamcash_pay_code: settings.shamcash_pay_code !== undefined
      ? (settings.shamcash_pay_code?.trim() || null)
      : (existing.shamcash_pay_code?.trim() || null),
    syriatel_enabled: settings.syriatel_enabled ?? existing.syriatel_enabled ?? DEFAULT_SETTINGS.syriatel_enabled,
    syriatel_qr_image_url: settings.syriatel_qr_image_url !== undefined
      ? (settings.syriatel_qr_image_url?.trim() || null)
      : (existing.syriatel_qr_image_url?.trim() || null),
    syriatel_pay_code: settings.syriatel_pay_code !== undefined
      ? (settings.syriatel_pay_code?.trim() || null)
      : (existing.syriatel_pay_code?.trim() || null),
    binance_enabled: settings.binance_enabled ?? existing.binance_enabled ?? DEFAULT_SETTINGS.binance_enabled,
    mastercard_enabled: settings.mastercard_enabled ?? existing.mastercard_enabled ?? DEFAULT_SETTINGS.mastercard_enabled,
    theme: settings.theme !== undefined ? (settings.theme || {}) : (existing.theme || {}),
    home_layout: settings.home_layout !== undefined ? (settings.home_layout || []) : (existing.home_layout || []),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('store_settings')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}