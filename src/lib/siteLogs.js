import { supabase } from './supabase';
import { formatMessage } from './i18n';

const RPC_SETUP_MSG =
  'Site logs are not configured. Run scripts/site-logs-migration.sql in Supabase.';

function isMissingRpc(error) {
  return error?.message?.includes('function') && error?.message?.includes('does not exist');
}

function applyTemplate(template, vars = {}) {
  if (!template) return '';
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value ?? '')),
    template,
  );
}

function formatMoney(value) {
  const num = parseFloat(value);
  return Number.isFinite(num) ? `$${num.toFixed(2)}` : '';
}

function resolveUserName(item, lang = 'ar') {
  const m = item?.metadata || {};
  if (m.userName) return m.userName;
  if (item?.subject_name) return item.subject_name;
  if (item?.actor_name) return item.actor_name;
  return lang === 'ar' ? 'مستخدم' : 'User';
}

function resolvePaymentMethod(method, t = {}) {
  if (method === 'ShamCash') return t.shamCash || 'ShamCash';
  if (method === 'SyriatelCash') return t.syriatelCash || 'Syriatel Cash';
  if (method === 'balance') return t.balance || 'Balance';
  return method || '';
}

export function formatSiteLog(item, t = {}, lang = 'ar') {
  const m = item?.metadata || {};
  const user = resolveUserName(item, lang);
  const email = m.email || '';
  const amount = formatMoney(m.amount ?? m.total);
  const reference = m.reference || '';
  const method = resolvePaymentMethod(m.paymentMethod, t);

  const templates = {
    login_success: {
      title: t.siteLogLoginSuccessTitle,
      body: applyTemplate(t.siteLogLoginSuccessBody, { user, email }),
      tone: 'success',
    },
    login_failed: {
      title: t.siteLogLoginFailedTitle,
      body: applyTemplate(t.siteLogLoginFailedBody, { email }),
      tone: 'warning',
    },
    logout: {
      title: t.siteLogLogoutTitle,
      body: applyTemplate(t.siteLogLogoutBody, { user, email }),
      tone: 'info',
    },
    signup_success: {
      title: t.siteLogSignupSuccessTitle,
      body: applyTemplate(t.siteLogSignupSuccessBody, { user, email }),
      tone: 'success',
    },
    signup_failed: {
      title: t.siteLogSignupFailedTitle,
      body: applyTemplate(t.siteLogSignupFailedBody, { email }),
      tone: 'warning',
    },
    requested: {
      title: t.siteLogRechargeRequestedTitle,
      body: applyTemplate(t.siteLogRechargeRequestedBody, { user, amount, method }),
      tone: 'info',
    },
    payment_sent: {
      title: item.category === 'order' ? t.siteLogOrderPaymentSentTitle : t.siteLogRechargePaymentSentTitle,
      body: item.category === 'order'
        ? applyTemplate(t.siteLogOrderPaymentSentBody, { user, amount, reference })
        : applyTemplate(t.siteLogRechargePaymentSentBody, { user, amount, reference }),
      tone: 'warning',
    },
    approved: {
      title: t.siteLogRechargeApprovedTitle,
      body: applyTemplate(t.siteLogRechargeApprovedBody, { user, amount }),
      tone: 'success',
    },
    rejected: {
      title: item.category === 'order' ? t.siteLogOrderRejectedTitle : t.siteLogRechargeRejectedTitle,
      body: item.category === 'order'
        ? applyTemplate(t.siteLogOrderRejectedBody, { user, amount })
        : applyTemplate(t.siteLogRechargeRejectedBody, { user, amount }),
      tone: 'danger',
    },
    sam_completed: {
      title: t.siteLogRechargeSamTitle,
      body: applyTemplate(t.siteLogRechargeSamBody, { user, amount, method, reference }),
      tone: 'success',
    },
    cancelled: {
      title: t.siteLogRechargeCancelledTitle,
      body: applyTemplate(t.siteLogRechargeCancelledBody, { user, amount }),
      tone: 'info',
    },
    placed: {
      title: t.siteLogOrderPlacedTitle,
      body: applyTemplate(t.siteLogOrderPlacedBody, { user, amount, method }),
      tone: 'info',
    },
    balance_paid: {
      title: t.siteLogOrderBalanceTitle,
      body: applyTemplate(t.siteLogOrderBalanceBody, { user, amount }),
      tone: 'success',
    },
    completed: {
      title: t.siteLogOrderCompletedTitle,
      body: applyTemplate(t.siteLogOrderCompletedBody, { user, amount, reference }),
      tone: 'success',
    },
    sam_paid: {
      title: t.siteLogOrderSamTitle,
      body: applyTemplate(t.siteLogOrderSamBody, { user, amount, method, reference }),
      tone: 'success',
    },
    message_received: {
      title: t.siteLogContactTitle,
      body: applyTemplate(t.siteLogContactBody, { name: m.name || user, email: m.email || '' }),
      tone: 'info',
    },
  };

  const key = item?.event_type;
  const fallback = {
    title: key || t.siteLogUnknownTitle,
    body: key || '',
    tone: item?.severity || 'info',
  };

  const formatted = templates[key] || fallback;
  const categoryLabel = t[`siteLogCategory${capitalize(item?.category)}`] || item?.category || '';

  return {
    ...formatted,
    category: item?.category,
    categoryLabel,
    eventType: key,
    createdAt: item?.created_at,
    orderId: m.orderId,
    requestId: m.requestId,
  };
}

function capitalize(value = '') {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export async function fetchAdminSiteLogs({ limit = 50, offset = 0, category = null } = {}) {
  const { data, error } = await supabase.rpc('get_admin_site_logs', {
    p_limit: limit,
    p_offset: offset,
    p_category: category || null,
  });

  if (error) {
    if (isMissingRpc(error)) throw new Error(RPC_SETUP_MSG);
    throw error;
  }

  return {
    logs: Array.isArray(data?.logs) ? data.logs : [],
    total: Number(data?.total) || 0,
    limit: Number(data?.limit) || limit,
    offset: Number(data?.offset) || offset,
  };
}

export async function logAuthEvent(eventType, { email = null, metadata = {} } = {}) {
  try {
    if (eventType === 'login_success' || eventType === 'logout' || eventType === 'signup_success') {
      await supabase.auth.getSession();
    }
    const { error } = await supabase.rpc('log_auth_event', {
      p_event_type: eventType,
      p_email: email,
      p_metadata: metadata,
    });
    if (error && !isMissingRpc(error)) {
      console.warn('log_auth_event failed:', error.message);
    }
  } catch (err) {
    console.warn('log_auth_event failed:', err);
  }
}

export function formatSiteLogCount(total, t = {}) {
  return formatMessage(t.siteLogCount, { count: total });
}