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
    return DEFAULT_SITE_STATUS;
  }
  return { ...DEFAULT_SITE_STATUS, ...(data || {}) };
}

export function getMaintenanceMessage(siteStatus, lang = 'ar') {
  const ar = siteStatus?.maintenanceMessageAr?.trim();
  const en = siteStatus?.maintenanceMessageEn?.trim();
  if (lang === 'ar') return ar || en || '';
  return en || ar || '';
}

export function isMaintenanceActive(siteStatus, user) {
  if (!siteStatus?.maintenanceEnabled) return false;
  if (user?.role === 'admin' && siteStatus?.maintenanceAllowAdmins) return false;
  return true;
}

export function shouldShowMaintenanceBanner(siteStatus) {
  return !!siteStatus?.maintenanceEnabled;
}

export function isLoginBlockedDuringMaintenance(siteStatus, user) {
  if (!siteStatus?.maintenanceEnabled) return false;
  return user?.role !== 'admin';
}

export function isUserVerified(user) {
  return !!user?.verifiedAt;
}

export function isVerificationRequired(siteStatus, user) {
  if (!siteStatus?.requireVerifiedAccounts) return false;
  if (user?.role === 'admin') return false;
  return !isUserVerified(user);
}