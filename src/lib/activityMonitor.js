/**
 * Admin activity stats + customer activity timeline helpers.
 */

const MS_DAY = 24 * 60 * 60 * 1000;
const MS_HOUR = 60 * 60 * 1000;

function parseTime(iso) {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function isSeverityBad(sev) {
  return ['warning', 'danger', 'error', 'warn', 'err', 'critical'].includes(
    String(sev || '').toLowerCase(),
  );
}

/** Stale deploy / tab left open — not a store outage; don't turn the health strip red. */
function isBenignClientNoise(row) {
  const type = String(row?.event_type || '').toLowerCase();
  if (type === 'chunk_load_failed') return true;
  if (type === 'react_error_boundary' || type === 'window_error' || type === 'unhandled_rejection') {
    const msg = String(
      row?.metadata?.message
      || row?.metadata?.consoleLog
      || row?.metadata?.error
      || '',
    );
    if (/Failed to fetch dynamically imported module|Loading chunk|Importing a module script failed/i.test(msg)) {
      return true;
    }
  }
  return false;
}

/**
 * Summarize admin site_logs rows for the monitor cards + feed.
 * @param {object[]} logs
 * @param {{ now?: number }} opts
 */
export function summarizeAdminActivity(logs = [], { now = Date.now() } = {}) {
  const dayAgo = now - MS_DAY;
  const hourAgo = now - MS_HOUR;
  const list = Array.isArray(logs) ? logs : [];

  let orders24h = 0;
  let recharges24h = 0;
  let auth24h = 0;
  let errors24h = 0;
  let contact24h = 0;
  let events1h = 0;
  let criticalOpen = 0;

  for (const row of list) {
    const ts = parseTime(row?.created_at);
    if (!ts) continue;
    if (ts >= hourAgo) events1h += 1;
    if (ts < dayAgo) continue;

    const cat = String(row?.category || '').toLowerCase();
    const type = String(row?.event_type || '').toLowerCase();
    const bad = isSeverityBad(row?.severity);
    const benign = isBenignClientNoise(row);

    if (cat === 'order' || type.includes('order') || type === 'placed' || type === 'balance_paid' || type === 'fulfilled') {
      orders24h += 1;
    }
    if (cat === 'recharge' || type.includes('recharge') || type === 'approved' || type === 'requested') {
      recharges24h += 1;
    }
    if (cat === 'auth' || type.startsWith('login') || type.startsWith('signup') || type === 'logout') {
      auth24h += 1;
    }
    if (cat === 'contact' || type === 'message_received') {
      contact24h += 1;
    }
    // Count real errors for the card, but exclude deploy/chunk noise from "critical" health
    if ((bad || cat === 'error' || cat === 'dev') && !benign) {
      errors24h += 1;
      if (['danger', 'error', 'critical', 'err'].includes(String(row?.severity || '').toLowerCase())) {
        criticalOpen += 1;
      }
    }
  }

  const health = criticalOpen > 0 ? 'degraded' : (errors24h > 8 ? 'busy' : 'ok');

  return {
    orders24h,
    recharges24h,
    auth24h,
    errors24h,
    contact24h,
    events1h,
    criticalOpen,
    health,
    sampleSize: list.length,
  };
}

/**
 * Build unified customer timeline from orders, recharges, transactions.
 * Newest first. Max `limit` items.
 */
export function buildCustomerActivityFeed({
  orders = [],
  recharges = [],
  transactions = [],
  limit = 25,
} = {}) {
  const items = [];

  for (const o of orders || []) {
    const id = o?.id;
    if (!id) continue;
    items.push({
      id: `order-${id}`,
      kind: 'order',
      status: o.status || '',
      amount: o.total,
      createdAt: o.created_at,
      ref: o.order_ref || String(id).slice(0, 8),
      orderId: id,
      labelKey: 'activityOrder',
    });
  }

  for (const r of recharges || []) {
    const id = r?.id;
    if (!id) continue;
    items.push({
      id: `recharge-${id}`,
      kind: 'recharge',
      status: r.status || '',
      amount: r.amount ?? r.credited_amount ?? r.requested_usd_amount,
      createdAt: r.created_at,
      ref: r.payment_reference || String(id).slice(0, 8),
      rechargeId: id,
      labelKey: 'activityRecharge',
    });
  }

  for (const tx of transactions || []) {
    const id = tx?.id;
    if (!id) continue;
    // skip pure purchase rows if order already listed (less noise)
    if (tx.type === 'purchase') continue;
    items.push({
      id: `tx-${id}`,
      kind: 'transaction',
      status: tx.status || tx.type || '',
      amount: tx.amount,
      createdAt: tx.created_at,
      ref: tx.reference || String(id).slice(0, 8),
      labelKey: tx.type === 'recharge' ? 'activityWalletCredit' : 'activityWalletMove',
      txType: tx.type,
    });
  }

  items.sort((a, b) => parseTime(b.createdAt) - parseTime(a.createdAt));
  return items.slice(0, limit);
}

export function activityTone(kind, status) {
  const st = String(status || '').toLowerCase();
  if (st.includes('fail') || st.includes('cancel') || st.includes('reject')) return 'danger';
  if (st.includes('pending') || st.includes('payment_sent') || st.includes('fulfilling')) return 'warning';
  if (st.includes('complet') || st.includes('approv') || st === 'success') return 'success';
  if (kind === 'order') return 'info';
  if (kind === 'recharge') return 'success';
  return 'info';
}
