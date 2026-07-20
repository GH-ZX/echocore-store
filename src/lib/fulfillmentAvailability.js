import { checkFulfillmentAvailability, diagnoseFulfillmentAvailability } from './g2bulk';
import { supabase } from './supabase';

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

  // Never append wallet/cost figures — those are admin-only (console.warn below).
  return messages[reason]
    || t.fulfillmentTemporarilyUnavailable
    || t.fulfillmentOutOfStock
    || 'This product is temporarily unavailable.';
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

/**
 * Prevent double top-up while a paid order for the same offer+player is still
 * pending/fulfilling (common when poll timeout made the user think it failed).
 */
export async function assertNoOpenDuplicateTopup(userId, items = [], t = {}) {
  if (!userId) return;
  for (const item of items || []) {
    const offerId = item?.offer_id;
    const playerUid = String(item?.player_uid || '').trim();
    if (!offerId || !playerUid) continue;

    const { data, error } = await supabase.rpc('has_open_duplicate_topup', {
      p_user_id: userId,
      p_offer_id: offerId,
      p_player_uid: playerUid,
      p_within_minutes: 20,
    });
    if (error) {
      // Missing RPC must not block purchases; log only
      console.warn('has_open_duplicate_topup:', error.message);
      return;
    }
    if (data === true) {
      throw new Error(
        t.purchaseAlreadyProcessing
        || t.purchaseInProgress
        || 'A top-up for this player is already processing. Wait a few minutes before buying again.',
      );
    }
  }
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
