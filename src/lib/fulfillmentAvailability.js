import { checkFulfillmentAvailability } from './g2bulk';

export function getFulfillmentUnavailableMessage(result = {}, t = {}) {
  const reason = result?.reason || 'unknown';
  const messages = {
    out_of_stock: t.fulfillmentOutOfStock,
    supplier_unreachable: t.fulfillmentSupplierUnreachable,
    supplier_disabled: t.fulfillmentOutOfStock,
    supplier_not_configured: t.fulfillmentOutOfStock,
    not_mapped: t.fulfillmentOutOfStock,
    missing_supplier_cost: t.fulfillmentOutOfStock,
    offer_not_found: t.cartItemsRemoved,
    player_id_required: t.validUidRequired,
    items_required: t.fulfillmentOutOfStock,
  };
  return messages[reason] || t.fulfillmentOutOfStock || 'This product is temporarily unavailable.';
}

export async function inspectFulfillmentAvailability(items = []) {
  const payload = (items || [])
    .filter((item) => item?.offer_id)
    .map((item) => ({
      offer_id: item.offer_id,
      quantity: item.quantity || 1,
      player_uid: item.player_uid || null,
    }));

  if (!payload.length) {
    return { available: false, reason: 'items_required' };
  }

  return checkFulfillmentAvailability({ items: payload });
}

export async function assertBalanceFulfillmentAvailable(items = [], t = {}) {
  const result = await inspectFulfillmentAvailability(items);
  if (result?.available) return result;
  throw new Error(getFulfillmentUnavailableMessage(result, t));
}