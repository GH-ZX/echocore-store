import { extractDeliveryCodes, formatOrderDisplayId, shortOrderId } from './orderReceipt';
import { getRedeemInstructions, getTopupSteps } from './redeemInstructions';
import { formatProfileUsername, getProfileUsername } from './username';

function resolveInvoiceCustomer(profile) {
  const name = String(profile?.name || '').trim() || null;
  const usernameRaw = getProfileUsername(profile);
  const username = usernameRaw ? formatProfileUsername(usernameRaw) : null;
  const email = String(profile?.email || '').trim() || null;
  return { name, username, email };
}

export const INVOICE_KIND = {
  ORDER: 'order',
  RECHARGE: 'recharge',
};

function formatMoney(value) {
  const num = parseFloat(value);
  return Number.isFinite(num) ? `$${num.toFixed(2)}` : '—';
}

function resolveGameForItem(item, games = [], offers = []) {
  const offer = offers.find((row) => row.id === item.offer_id);
  if (!offer) return null;
  return games.find((row) => row.id === offer.game_id) || null;
}

function extractRedemptionInfo(item) {
  const raw = item?.redemption_info;
  if (!raw || typeof raw !== 'object') return [];
  return Object.entries(raw)
    .filter(([, value]) => value != null && String(value).trim())
    .map(([key, value]) => ({ key, value: String(value).trim() }));
}

function buildOrderLine(item, games, offers, t, lang) {
  const game = resolveGameForItem(item, games, offers);
  const codes = extractDeliveryCodes([item]);
  const hasUid = !!item?.player_uid?.trim();
  const redemptionExtras = extractRedemptionInfo(item);

  return {
    id: item.id,
    name: item.name_snapshot,
    price: formatMoney(item.price),
    quantity: item.quantity || 1,
    lineTotal: formatMoney(parseFloat(item.price || 0) * (item.quantity || 1)),
    codes,
    hasCodes: codes.length > 0,
    playerUid: item.player_uid?.trim() || null,
    playerServer: item.player_server?.trim() || null,
    playerCharname: item.player_charname?.trim() || null,
    redemptionExtras,
    gameName: game ? (lang === 'ar' ? (game.name_ar || game.name_en) : (game.name_en || game.name_ar)) : null,
    gameSlug: game?.slug || null,
    redeemSteps: codes.length > 0
      ? getRedeemInstructions(game?.slug, lang)
      : hasUid
        ? getTopupSteps(lang)
        : [],
    deliveryType: codes.length > 0 ? 'redeem' : hasUid ? 'topup' : 'other',
  };
}

export function buildOrderInvoice({
  order,
  items = [],
  games = [],
  offers = [],
  profile = null,
  t = {},
  lang = 'ar',
}) {
  const lines = items.map((item) => buildOrderLine(item, games, offers, t, lang));
  const hasCodes = lines.some((line) => line.hasCodes);
  const hasTopup = lines.some((line) => line.deliveryType === 'topup');

  let invoiceSubtype = 'purchase';
  if (hasCodes && hasTopup) invoiceSubtype = 'mixed';
  else if (hasCodes) invoiceSubtype = 'redeem';
  else if (hasTopup) invoiceSubtype = 'topup';

  const customer = resolveInvoiceCustomer(profile);

  return {
    kind: INVOICE_KIND.ORDER,
    subtype: invoiceSubtype,
    invoiceNumber: formatOrderDisplayId(order),
    orderId: order.id,
    issuedAt: order.updated_at || order.created_at,
    customerName: customer.name,
    customerUsername: customer.username,
    customerEmail: customer.email,
    paymentMethod: order.payment_method,
    status: order.status,
    fulfillmentStatus: order.fulfillment_status || null,
    total: formatMoney(order.total),
    totalRaw: parseFloat(order.total || 0),
    lines,
    giftMessage: order.gift_message || null,
    notes: order.payment_method === 'admin_gift'
      ? t.invoiceGiftNote
      : null,
  };
}

export function buildRechargeInvoice({
  recharge,
  samInvoice = null,
  profile = null,
  t = {},
}) {
  const paymentMethod = recharge.payment_method || samInvoice?.payment_method || 'ShamCash';
  const customer = resolveInvoiceCustomer(profile);

  return {
    kind: INVOICE_KIND.RECHARGE,
    subtype: 'wallet_recharge',
    invoiceNumber: `RCH-${shortOrderId(recharge.id)}`,
    rechargeId: recharge.id,
    issuedAt: recharge.updated_at || recharge.created_at,
    customerName: customer.name,
    customerUsername: customer.username,
    customerEmail: customer.email,
    paymentMethod,
    status: recharge.status,
    amount: formatMoney(recharge.amount),
    amountRaw: parseFloat(recharge.amount || 0),
    currency: samInvoice?.currency || 'USD',
    lines: [],
    notes: t.invoiceRechargeNote,
  };
}

export function getInvoiceRoute(invoice) {
  if (!invoice) return null;
  if (invoice.kind === INVOICE_KIND.ORDER && invoice.orderId) {
    return `/invoice/order/${invoice.orderId}`;
  }
  if (invoice.kind === INVOICE_KIND.RECHARGE && invoice.rechargeId) {
    return `/invoice/recharge/${invoice.rechargeId}`;
  }
  return null;
}

const ORDER_INVOICE_NOTIFICATION_TYPES = new Set([
  'purchase_completed',
  'order_completed',
  'order_gifted',
  'delivery_ready',
  'topup_delivered',
  'order_fulfilled',
  'fulfillment_failed',
  'fulfillment_failed_refunded',
  'admin_order_payment_sent',
]);

const RECHARGE_INVOICE_NOTIFICATION_TYPES = new Set([
  'recharge_approved',
  'recharge_payment_sent',
  'admin_recharge_payment_sent',
  'admin_recharge_completed',
]);

export function getInvoiceRouteFromNotification(item) {
  const metadata = item?.metadata || {};
  const orderId = metadata.orderId;
  const requestId = metadata.requestId;

  if (orderId && ORDER_INVOICE_NOTIFICATION_TYPES.has(item?.type)) {
    return `/invoice/order/${orderId}`;
  }

  if (requestId && RECHARGE_INVOICE_NOTIFICATION_TYPES.has(item?.type)) {
    return `/invoice/recharge/${requestId}`;
  }

  return null;
}