import { supabase } from './supabase';

const DEFAULT_SITE_STATUS = {
  maintenanceEnabled: false,
  maintenanceMessageAr: '',
  maintenanceMessageEn: '',
  maintenanceAllowAdmins: true,
  requireVerifiedAccounts: false,
};

export async function fetchSiteStatus() {
  const { data, error } = await supabase.rpc('get_site_status');
  if (error) {
    console.error('get_site_status:', error);
    return { ...DEFAULT_SITE_STATUS };
  }
  return { ...DEFAULT_SITE_STATUS, ...(data || {}) };
}

export function getMaintenanceMessage(siteStatus, lang = 'ar') {
  const ar = siteStatus?.maintenanceMessageAr?.trim();
  const en = siteStatus?.maintenanceMessageEn?.trim();
  if (lang === 'ar') return ar || en || '';
  return en || ar || '';
}

/**
 * True when maintenance is on and this user is treated as a visitor
 * (admins are exempt only if maintenanceAllowAdmins is true).
 */
export function isMaintenanceActive(siteStatus, user) {
  if (!siteStatus?.maintenanceEnabled) return false;
  if (user?.role === 'admin' && siteStatus?.maintenanceAllowAdmins !== false) {
    return false;
  }
  return true;
}

export function shouldShowMaintenanceBanner(siteStatus) {
  return !!siteStatus?.maintenanceEnabled;
}

/** Non-admin cannot sign in (or keep a fresh session) during maintenance. */
export function isLoginBlockedDuringMaintenance(siteStatus, user) {
  if (!siteStatus?.maintenanceEnabled) return false;
  // Admins always may sign in so they can turn maintenance off.
  if (user?.role === 'admin') return false;
  return true;
}

/** Signup is always blocked while the flag is on (even before a user object exists). */
export function isSignupBlockedDuringMaintenance(siteStatus) {
  return !!siteStatus?.maintenanceEnabled;
}

/**
 * Purchases, cart checkout, and wallet recharge — blocked for everyone
 * affected by isMaintenanceActive (customers; admins only if allow-admins is off).
 */
export function isCommerceBlockedDuringMaintenance(siteStatus, user) {
  return isMaintenanceActive(siteStatus, user);
}

export function isUserVerified(user) {
  return !!(user?.verifiedAt || user?.verified_at);
}

export function isVerificationRequired(siteStatus, user) {
  if (!siteStatus?.requireVerifiedAccounts) return false;
  if (user?.role === 'admin') return false;
  return !isUserVerified(user);
}

/** Human-readable checklist for admin UI (keys for translations). */
export const MAINTENANCE_EFFECT_KEYS = [
  'adminMaintenanceEffectBanner',
  'adminMaintenanceEffectLogin',
  'adminMaintenanceEffectSignup',
  'adminMaintenanceEffectCommerce',
  'adminMaintenanceEffectBrowse',
];
