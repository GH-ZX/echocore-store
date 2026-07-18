import { extractDeliveryCodes, formatOrderDisplayId, shortOrderId } from './orderReceipt';
import { getRedeemInstructions } from './redeemInstructions';
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

function buildOrderLine(item, games, offers, t, lang, fallbackCodes = []) {
  const game = resolveGameForItem(item, games, offers);
  let codes = extractDeliveryCodes([item]);
  // Single-line gift / voucher orders often only stash codes once (item or order meta).
  if (codes.length === 0 && fallbackCodes.length > 0) {
    codes = [...fallbackCodes];
  }
  const hasUid = !!item?.player_uid?.trim();
  const redemptionExtras = extractRedemptionInfo(item);

  const gameName = game
    ? (lang === 'ar' ? (game.name_ar || game.name_en) : (game.name_en || game.name_ar))
    : null;
  const packName = String(item.name_snapshot || '').trim();
  // Prefer "Game — Pack" on invoice lines when snapshot is still a bare catalogue name
  let lineName = packName;
  if (gameName && packName) {
    const alreadyPrefixed = packName.includes(gameName)
      || packName.includes('—')
      || packName.includes(' - ')
      || packName.includes('–');
    lineName = alreadyPrefixed ? packName : `${gameName} — ${packName}`;
  } else if (gameName && !packName) {
    lineName = gameName;
  }

  return {
    id: item.id,
    name: lineName || packName || '—',
    price: formatMoney(item.price),
    quantity: item.quantity || 1,
    lineTotal: formatMoney(parseFloat(item.price || 0) * (item.quantity || 1)),
    codes,
    hasCodes: codes.length > 0,
    playerUid: item.player_uid?.trim() || null,
    playerServer: item.player_server?.trim() || null,
    playerCharname: item.player_charname?.trim() || null,
    redemptionExtras,
    gameName,
    gameSlug: game?.slug || null,
    // Top-ups are already delivered to the UID — no "how to activate" steps.
    redeemSteps: codes.length > 0 ? getRedeemInstructions(game?.slug, lang) : [],
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
  const orderLevelCodes = extractDeliveryCodes(items, order?.g2bulk_metadata);
  const lines = items.map((item) => buildOrderLine(item, games, offers, t, lang, orderLevelCodes));
  // If still no per-line codes but order has codes (single pack gift), attach to first line
  if (orderLevelCodes.length > 0 && lines.length > 0 && !lines.some((line) => line.hasCodes)) {
    lines[0] = {
      ...lines[0],
      codes: orderLevelCodes,
      hasCodes: true,
      deliveryType: 'redeem',
      redeemSteps: getRedeemInstructions(lines[0].gameSlug, lang),
    };
  }

  const hasCodes = lines.some((line) => line.hasCodes) || orderLevelCodes.length > 0;
  const hasTopup = lines.some((line) => line.deliveryType === 'topup');
  const isGift = order.payment_method === 'admin_gift';

  let invoiceSubtype = 'purchase';
  if (isGift && hasCodes) invoiceSubtype = 'gift_redeem';
  else if (isGift && hasTopup) invoiceSubtype = 'gift_topup';
  else if (isGift) invoiceSubtype = 'gift';
  else if (hasCodes && hasTopup) invoiceSubtype = 'mixed';
  else if (hasCodes) invoiceSubtype = 'redeem';
  else if (hasTopup) invoiceSubtype = 'topup';

  const customer = resolveInvoiceCustomer(profile);
  // Deduplicate codes across lines + order meta (same code must never appear twice)
  const allCodes = hasCodes
    ? [...new Set(
      lines
        .flatMap((line) => line.codes || [])
        .concat(orderLevelCodes)
        .map((c) => String(c || '').trim())
        .filter(Boolean),
    )]
    : [];

  // Ensure each line's codes list is unique (normalizeDelivery can double-push)
  const linesDeduped = lines.map((line) => ({
    ...line,
    codes: [...new Set((line.codes || []).map((c) => String(c || '').trim()).filter(Boolean))],
    hasCodes: (line.codes || []).some((c) => String(c || '').trim()),
  })).map((line) => ({
    ...line,
    hasCodes: line.codes.length > 0,
  }));

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
    lines: linesDeduped,
    allCodes,
    hasCodes: allCodes.length > 0 || linesDeduped.some((l) => l.hasCodes),
    isGift,
    giftMessage: order.gift_message || null,
    notes: isGift
      ? (t.invoiceGiftNote || null)
      : null,
    codesMissing: isGift && !hasCodes && !hasTopup,
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

/** Notifications that mean the sale actually succeeded (invoice allowed). */
const ORDER_INVOICE_NOTIFICATION_TYPES = new Set([
  'order_gifted',
  'delivery_ready',
  'topup_delivered',
  'order_fulfilled',
  'admin_delivery_ready',
  'admin_topup_delivered',
  'admin_order_fulfilled',
]);

const RECHARGE_INVOICE_NOTIFICATION_TYPES = new Set([
  'recharge_approved',
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