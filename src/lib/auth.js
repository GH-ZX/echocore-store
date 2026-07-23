import { supabase } from './supabase';

export const PASSWORD_RECOVERY_FLAG = 'echocore-password-recovery';
/** sessionStorage: 'signup' | 'login' — set before Google OAuth redirect */
export const OAUTH_INTENT_KEY = 'echocore-oauth-intent';
export const PASSWORD_MIN_LENGTH = 1;
export const PASSWORD_MAX_LENGTH = 32;

/** Remember whether Google was started from signup or login (survives OAuth redirect). */
export function setOAuthIntent(intent) {
  if (typeof window === 'undefined') return;
  const value = intent === 'signup' ? 'signup' : 'login';
  try {
    sessionStorage.setItem(OAUTH_INTENT_KEY, value);
  } catch {
    /* private mode / blocked storage */
  }
}

/** Read and clear OAuth intent. Returns 'signup' | 'login' | null. */
export function consumeOAuthIntent() {
  if (typeof window === 'undefined') return null;
  try {
    const value = sessionStorage.getItem(OAUTH_INTENT_KEY);
    sessionStorage.removeItem(OAUTH_INTENT_KEY);
    if (value === 'signup' || value === 'login') return value;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * True if this auth user was created more than `windowMs` ago (returning account).
 * New Google signups have created_at ≈ now.
 */
export function isLikelyExistingAuthUser(user, windowMs = 60_000) {
  if (!user?.created_at) return false;
  const created = new Date(user.created_at).getTime();
  if (!Number.isFinite(created)) return false;
  return Date.now() - created > windowMs;
}

export function validatePasswordLength(password) {
  const len = String(password ?? '').length;
  if (len < PASSWORD_MIN_LENGTH || len > PASSWORD_MAX_LENGTH) {
    return {
      valid: false,
      code: len > PASSWORD_MAX_LENGTH ? 'too_long' : 'too_short',
    };
  }
  return { valid: true };
}

function joinUrlPath(basePath = '/', subPath = '/') {
  const base = String(basePath || '/').replace(/\/+$/, '') || '';
  const sub = String(subPath || '/').startsWith('/') ? subPath : `/${subPath}`;
  return `${base}${sub}` || '/';
}

/** Origin used after OAuth / email links (production domain when configured). */
export function getAuthRedirectOrigin() {
  const explicit = import.meta.env.VITE_AUTH_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const domain = import.meta.env.VITE_SITE_DOMAIN?.trim();
  if (domain) return `https://${domain}`.replace(/\/+$/, '');

  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
}

/**
 * Full redirect URL for Supabase auth (must match Dashboard → Redirect URLs).
 * Includes Vite BASE_URL so GitHub Pages (/echocore-store/) works.
 */
export function getAuthRedirectUrl(path = '/login') {
  const origin = getAuthRedirectOrigin();
  const fullPath = joinUrlPath(import.meta.env.BASE_URL, path);
  return `${origin}${fullPath}`;
}

export function isPasswordRecoveryUrl() {
  if (typeof window === 'undefined') return false;

  const search = new URLSearchParams(window.location.search);
  if (search.get('recovery') === '1') return true;

  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return false;

  const hashParams = new URLSearchParams(hash);
  return hashParams.get('type') === 'recovery';
}

export function markPasswordRecoveryPending() {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(PASSWORD_RECOVERY_FLAG, '1');
}

export function clearPasswordRecoveryPending() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(PASSWORD_RECOVERY_FLAG);
}

export function isPasswordRecoveryPending() {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(PASSWORD_RECOVERY_FLAG) === '1';
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: getAuthRedirectUrl('/login'),
    },
  });
  if (error) throw error;
}

export async function sendEmailOtp(email, { shouldCreateUser = true } = {}) {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: {
      shouldCreateUser,
      emailRedirectTo: getAuthRedirectUrl('/login'),
    },
  });
  if (error) throw error;
}

export async function verifyEmailOtp(email, token) {
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: 'email',
  });
  if (error) throw error;
  return data;
}

export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: getAuthRedirectUrl('/login?recovery=1'),
  });
  if (error) throw error;
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}