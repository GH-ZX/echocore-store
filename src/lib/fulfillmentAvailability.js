import { checkFulfillmentAvailability, diagnoseFulfillmentAvailability } from './g2bulk';

export function getFulfillmentUnavailableMessage(result = {}, t = {}) {
  const reason = result?.reason || 'unknown';
  const messages = {
    out_of_stock: t.fulfillmentOutOfStock,
    // Store G2Bulk wallet cannot cover cost — was wrongly labeled "out of stock".
    insufficient_supplier_balance: t.fulfillmentSupplierBalanceLow
      || t.fulfillmentTemporarilyUnavailable,
    supplier_unreachable: t.fulfillmentSupplierUnreachable,
    supplier_disabled: t.fulfillmentSupplierDisabled || t.fulfillmentTemporarilyUnavailable,
    supplier_not_configured: t.fulfillmentSupplierNotConfigured || t.fulfillmentTemporarilyUnavailable,
    not_mapped: t.fulfillmentOfferMisconfigured || t.fulfillmentTemporarilyUnavailable,
    missing_supplier_cost: t.fulfillmentOfferMisconfigured || t.fulfillmentTemporarilyUnavailable,
    offer_not_found: t.cartItemsRemoved,
    player_id_required: t.validUidRequired,
    items_required: t.fulfillmentTemporarilyUnavailable || t.fulfillmentOutOfStock,
  };

  let message = messages[reason]
    || t.fulfillmentTemporarilyUnavailable
    || t.fulfillmentOutOfStock
    || 'This product is temporarily unavailable.';

  // Helpful detail for wallet shortfall when amounts are present.
  if (
    reason === 'insufficient_supplier_balance'
    && Number.isFinite(Number(result.walletBalance))
    && Number.isFinite(Number(result.requiredCost))
  ) {
    const wallet = Number(result.walletBalance).toFixed(2);
    const need = Number(result.requiredCost).toFixed(2);
    message = `${message} (${wallet} / ${need} USD)`;
  }

  return message;
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

  const result = await checkFulfillmentAvailability({ items: payload });

  // Always log structured result so admin can diagnose from browser DevTools.
  if (typeof console !== 'undefined' && result && result.available === false) {
    console.warn('[fulfillment]', {
      reason: result.reason,
      detail: result.detail,
      walletBalance: result.walletBalance,
      requiredCost: result.requiredCost,
      offerName: result.offerName,
      items: result.items,
      steps: result.steps,
    });
  }

  return result;
}

export async function assertBalanceFulfillmentAvailable(items = [], t = {}) {
  const result = await inspectFulfillmentAvailability(items);
  if (result?.available) return result;
  throw new Error(getFulfillmentUnavailableMessage(result, t));
}

/** Admin-only: full diagnostic steps for one offer. */
export async function diagnoseOfferFulfillment({ offerId, playerUid = null, quantity = 1 } = {}) {
  return diagnoseFulfillmentAvailability({
    items: [{
      offer_id: offerId,
      quantity,
      player_uid: playerUid,
    }],
  });
}
