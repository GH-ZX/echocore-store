import { supabase } from './supabase';
import { formatMessage } from './i18n';

const RPC_SETUP_MSG =
  'Site logs are not configured. Ensure supabase_echocore_full.sql (site_logs RPCs) is applied.';

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
      body: m.reason === 'sam_invoice_expired'
        ? applyTemplate(t.siteLogRechargeExpiredBody, { user, amount })
        : applyTemplate(t.siteLogRechargeCancelledBody, { user, amount }),
      tone: m.reason === 'sam_invoice_expired' ? 'warning' : 'info',
    },
    manual_credit: {
      title: t.siteLogManualCreditTitle,
      body: applyTemplate(t.siteLogManualCreditBody, {
        user,
        amount,
        admin: m.adminName || (lang === 'ar' ? 'الإدارة' : 'Admin'),
        reason: m.reason || '',
      }),
      tone: 'success',
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
      title: item.category === 'recharge'
        ? (t.siteLogRechargeCompletedTitle || t.siteLogOrderCompletedTitle)
        : t.siteLogOrderCompletedTitle,
      body: item.category === 'recharge'
        ? applyTemplate(t.siteLogRechargeCompletedBody || t.siteLogOrderCompletedBody, { user, amount, reference })
        : applyTemplate(t.siteLogOrderCompletedBody, { user, amount, reference }),
      tone: 'success',
    },
    sam_paid: {
      title: t.siteLogOrderSamTitle,
      body: applyTemplate(t.siteLogOrderSamBody, { user, amount, method, reference }),
      tone: 'success',
    },
    fulfilled: {
      title: t.siteLogOrderFulfilledTitle || t.siteLogOrderCompletedTitle,
      body: applyTemplate(t.siteLogOrderFulfilledBody || t.siteLogOrderCompletedBody, { user, amount, reference }),
      tone: 'success',
    },
    fulfillment_failed: {
      title: t.siteLogOrderFulfillFailedTitle || t.notifFulfillmentFailedTitle,
      body: applyTemplate(
        t.siteLogOrderFulfillFailedBody || t.notifFulfillmentFailedBody,
        { user, amount },
      ),
      tone: 'danger',
    },
    message_received: {
      title: t.siteLogContactTitle,
      body: applyTemplate(t.siteLogContactBody, { name: m.name || user, email: m.email || '' }),
      tone: 'info',
    },
    // Wallet ledger (transactions.type) — purchase = balance debit for an order
    purchase: {
      title: t.siteLogWalletPurchaseTitle || t.siteLogOrderBalanceTitle,
      body: applyTemplate(
        t.siteLogWalletPurchaseBody || t.siteLogOrderBalanceBody,
        { user, amount: amount || formatMoney(m.amount), method },
      ),
      tone: 'info',
    },
    refund: {
      title: t.siteLogWalletRefundTitle || t.siteLogUnknownTitle,
      body: applyTemplate(t.siteLogWalletRefundBody || '{user} · {amount}', { user, amount }),
      tone: 'warning',
    },
    adjustment: {
      title: t.siteLogWalletAdjustTitle || t.siteLogManualCreditTitle,
      body: applyTemplate(
        t.siteLogWalletAdjustBody || t.siteLogManualCreditBody,
        { user, amount, admin: m.adminName || '', reason: m.reason || '' },
      ),
      tone: Number(m.amount) < 0 ? 'warning' : 'success',
    },
    movement: {
      title: t.siteLogWalletMoveTitle || t.siteLogUnknownTitle,
      body: applyTemplate(t.siteLogWalletMoveBody || '{user} · {amount}', { user, amount }),
      tone: 'info',
    },
  };

  const key = item?.event_type;
  const fallback = {
    title: key || t.siteLogUnknownTitle,
    body: [
      user && user !== 'User' && user !== 'مستخدم' ? user : '',
      amount,
      method,
      m.reference || '',
    ].filter(Boolean).join(' · ') || key || '',
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

/**
 * @param {{ limit?: number, offset?: number, category?: string|null, severity?: string|null }} opts
 * category: auth | recharge | order | wallet | contact | dev | error
 * severity: info | success | warning | danger | critical (warn+danger)
 */
export async function fetchAdminSiteLogs({
  limit = 50,
  offset = 0,
  category = null,
  severity = null,
} = {}) {
  const payload = {
    p_limit: limit,
    p_offset: offset,
    p_category: category || null,
    p_severity: severity || null,
  };
  let { data, error } = await supabase.rpc('get_admin_site_logs', payload);
  if (error) {
    // Fallback for older 3-arg RPC (no p_severity)
    const legacy = await supabase.rpc('get_admin_site_logs', {
      p_limit: limit,
      p_offset: offset,
      p_category: category || null,
    });
    if (legacy.error) {
      if (isMissingRpc(error) || isMissingRpc(legacy.error)) throw new Error(RPC_SETUP_MSG);
      throw error;
    }
    data = legacy.data;
  }

  let logs = Array.isArray(data?.logs) ? data.logs : [];
  let total = Number(data?.total) || 0;

  // Client-side severity filter when RPC lacks p_severity
  if (severity === 'critical' && logs.length) {
    const crit = new Set(['warning', 'danger', 'error', 'warn', 'err']);
    const filtered = logs.filter((row) => crit.has(String(row?.severity || '').toLowerCase()));
    if (filtered.length !== logs.length) {
      logs = filtered;
      total = filtered.length;
    }
  }

  return {
    logs,
    total,
    limit: Number(data?.limit) || limit,
    offset: Number(data?.offset) || offset,
    retentionDays: Number(data?.retentionDays) || 30,
  };
}

/**
 * Write auth activity for ALL users (sign-in / sign-up / logout / failures).
 * Always non-throwing — failures only console.warn so login UX is never blocked.
 *
 * @param {string} eventType login_success | login_failed | logout | signup_success | signup_failed
 * @param {{ email?: string|null, userId?: string|null, userName?: string|null, metadata?: object }} opts
 */
export async function logAuthEvent(eventType, {
  email = null,
  userId = null,
  userName = null,
  metadata = {},
} = {}) {
  try {
    // Attach JWT when possible so auth.uid() resolves for actor linkage
    if (
      eventType === 'login_success'
      || eventType === 'logout'
      || eventType === 'signup_success'
    ) {
      await supabase.auth.getSession();
    }

    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const meta = {
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
    };
    if (userId) meta.userId = String(userId);
    if (userName) meta.userName = String(userName);

    const { error } = await supabase.rpc('log_auth_event', {
      p_event_type: eventType,
      p_email: normalizedEmail || email || null,
      p_metadata: meta,
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

const DEV_LOG_SEVERITY = {
  success: 'OK  ',
  info: 'INFO',
  warning: 'WARN',
  danger: 'ERR ',
};

/** Keys reserved for expanded console dump (not the one-line summary). */
const CONSOLE_META_KEYS = new Set([
  'consoleLog',
  'stack',
  'componentStack',
  'fullError',
  'raw',
  'trace',
]);

const DEV_LOG_META_ORDER = [
  'user',
  'actor',
  'subject',
  'email',
  'name',
  'admin',
  'adminName',
  'amount',
  'total',
  'balanceAfter',
  'method',
  'paymentMethod',
  'reference',
  'orderId',
  'requestId',
  'transactionId',
  'messageId',
  'samInvoiceId',
  'status',
  'type',
  'error',
  'message',
  'reason',
  'endpoint',
  'httpStatus',
  'filename',
  'lineno',
  'colno',
  'url',
  'response',
  'body',
  'webhook',
  'payload',
  'code',
  'detail',
];

export function normalizeLogSeverity(value) {
  const s = String(value || 'info').toLowerCase().trim();
  if (s === 'error' || s === 'err' || s === 'critical' || s === 'fatal') return 'danger';
  if (s === 'warn') return 'warning';
  if (s === 'ok') return 'success';
  if (['info', 'success', 'warning', 'danger'].includes(s)) return s;
  return 'info';
}

function formatDevLogTimestamp(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-------------------';
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function escapeDevLogValue(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    try {
      const raw = JSON.stringify(value);
      return raw.length > 240 ? `${raw.slice(0, 237)}...` : raw;
    } catch {
      return String(value);
    }
  }
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (text.length > 120) return `${text.slice(0, 117)}...`;
  if (/[\s|="'`]/.test(text)) return `"${text.replace(/"/g, '\'')}"`;
  return text;
}

function buildDevLogFields(item, lang = 'ar') {
  const metadata = { ...(item?.metadata || {}) };
  const user = resolveUserName(item, lang);
  const genericUser = lang === 'ar' ? 'مستخدم' : 'User';

  if (user && user !== genericUser) {
    metadata.user = metadata.userName || user;
  }
  if (item?.actor_name && item.actor_name !== metadata.user) {
    metadata.actor = item.actor_name;
  }
  if (item?.subject_name && item.subject_name !== metadata.user) {
    metadata.subject = item.subject_name;
  }
  delete metadata.userName;
  CONSOLE_META_KEYS.forEach((key) => {
    delete metadata[key];
  });
  // userAgent is huge and noisy on the one-liner
  delete metadata.userAgent;

  const used = new Set();
  const parts = [];

  DEV_LOG_META_ORDER.forEach((key) => {
    if (metadata[key] == null || metadata[key] === '') return;
    parts.push(`${key}=${escapeDevLogValue(metadata[key])}`);
    used.add(key);
  });

  Object.keys(metadata)
    .filter((key) => !used.has(key) && metadata[key] != null && metadata[key] !== '')
    .sort()
    .forEach((key) => {
      parts.push(`${key}=${escapeDevLogValue(metadata[key])}`);
    });

  return parts.join(' ');
}

/** Full multi-line console dump for expanded WARN/ERR rows. */
export function extractConsoleLogDump(item) {
  const m = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const chunks = [];

  const push = (label, value) => {
    if (value == null || value === '') return;
    const text = typeof value === 'object'
      ? (() => {
        try {
          return JSON.stringify(value, null, 2);
        } catch {
          return String(value);
        }
      })()
      : String(value);
    const trimmed = text.trim();
    if (!trimmed) return;
    chunks.push(label ? `${label}:\n${trimmed}` : trimmed);
  };

  push(null, m.consoleLog);
  push('stack', m.stack && m.stack !== m.consoleLog ? m.stack : null);
  push('componentStack', m.componentStack);
  push('fullError', m.fullError);
  push('trace', m.trace);
  push('raw', m.raw);

  if (!chunks.length && (m.error || m.message || m.detail)) {
    push('error', m.error);
    push('message', m.message);
    push('detail', m.detail);
  }

  if (!chunks.length && m.response != null) {
    push('response', m.response);
  }

  return chunks.length ? chunks.join('\n\n') : '';
}

export function formatDevLogLine(item, lang = 'ar') {
  const severityKey = normalizeLogSeverity(item?.severity);
  const severity = DEV_LOG_SEVERITY[severityKey] || DEV_LOG_SEVERITY.info;
  const tag = `${item?.category || 'unknown'}.${item?.event_type || 'event'}`;
  const fields = buildDevLogFields(item, lang);
  const timestamp = formatDevLogTimestamp(item?.created_at);
  const consoleLog = extractConsoleLogDump(item);
  const isAlert = severityKey === 'warning' || severityKey === 'danger';
  // Message first; timestamp last (easier to scan on mobile).
  const body = fields
    ? `${severity} | ${tag} | ${fields}`
    : `${severity} | ${tag}`;
  const text = `${body} · ${timestamp}`;

  return {
    text,
    body,
    fields,
    timestamp,
    consoleLog,
    isAlert,
    severity: severityKey,
    tag,
    id: item?.id,
    createdAt: item?.created_at,
  };
}

function safeMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  return { ...metadata };
}

/**
 * Serialize Error / unknown into metadata suitable for site_logs + expand panel.
 */
export function serializeErrorForLog(error, extra = {}) {
  const meta = safeMetadata(extra);
  if (error == null) {
    return {
      ...meta,
      message: meta.message || 'Unknown error',
      consoleLog: meta.consoleLog || meta.message || 'Unknown error',
    };
  }
  if (typeof error === 'string') {
    return {
      ...meta,
      message: error,
      consoleLog: meta.consoleLog || error,
    };
  }
  if (error instanceof Error) {
    const consoleLog = [error.stack || `${error.name || 'Error'}: ${error.message}`]
      .filter(Boolean)
      .join('\n');
    return {
      ...meta,
      name: error.name,
      message: error.message || String(error),
      stack: error.stack || null,
      consoleLog: meta.consoleLog || consoleLog,
    };
  }
  try {
    const asJson = JSON.stringify(error, null, 2);
    return {
      ...meta,
      message: meta.message || String(error),
      consoleLog: meta.consoleLog || asJson || String(error),
      fullError: error,
    };
  } catch {
    return {
      ...meta,
      message: meta.message || String(error),
      consoleLog: meta.consoleLog || String(error),
    };
  }
}

export async function logDevEvent(eventType, { severity = 'info', metadata = {}, error = null } = {}) {
  try {
    const meta = error != null
      ? serializeErrorForLog(error, safeMetadata(metadata))
      : safeMetadata(metadata);
    const { error: rpcError } = await supabase.rpc('log_dev_event', {
      p_event_type: eventType,
      p_severity: normalizeLogSeverity(severity),
      p_metadata: meta,
    });
    if (rpcError && !isMissingRpc(rpcError)) {
      console.warn('log_dev_event failed:', rpcError.message);
    }
  } catch (err) {
    console.warn('log_dev_event failed:', err);
  }
}

/**
 * Critical client/storefront errors (purchase failures, uncaught UI errors, etc.).
 * Non-throwing. Rate-limited server-side.
 */
export async function logClientError(eventType, {
  severity = 'danger',
  error = null,
  metadata = {},
} = {}) {
  try {
    const meta = serializeErrorForLog(error, {
      ...safeMetadata(metadata),
      url: typeof window !== 'undefined' ? window.location?.href : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    });
    const { error: rpcError } = await supabase.rpc('log_client_error', {
      p_event_type: eventType || 'client_error',
      p_severity: normalizeLogSeverity(severity),
      p_metadata: meta,
    });
    if (rpcError && !isMissingRpc(rpcError)) {
      console.warn('log_client_error failed:', rpcError.message);
    }
  } catch (err) {
    console.warn('log_client_error failed:', err);
  }
}

let globalErrorLoggingInstalled = false;

/** Install once: window error + unhandledrejection → site_logs (category error). */
export function installGlobalErrorLogging() {
  if (typeof window === 'undefined' || globalErrorLoggingInstalled) return;
  globalErrorLoggingInstalled = true;

  window.addEventListener('error', (event) => {
    const message = event?.message || 'window_error';
    // Ignore noisy browser extensions / script load noise without useful stack
    if (/ResizeObserver|Script error\.?/i.test(message) && !event?.error) return;
    logClientError('window_error', {
      severity: 'danger',
      error: event?.error || message,
      metadata: {
        message,
        filename: event?.filename || null,
        lineno: event?.lineno ?? null,
        colno: event?.colno ?? null,
        consoleLog: event?.error?.stack
          || `${message}${event?.filename ? ` at ${event.filename}:${event.lineno || 0}:${event.colno || 0}` : ''}`,
      },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    logClientError('unhandled_rejection', {
      severity: 'danger',
      error: reason,
      metadata: {
        consoleLog: reason instanceof Error
          ? (reason.stack || reason.message)
          : (typeof reason === 'string' ? reason : (() => {
            try { return JSON.stringify(reason, null, 2); } catch { return String(reason); }
          })()),
      },
    });
  });
}