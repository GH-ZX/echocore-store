import { supabase } from './supabase';
import { extractDeliveryCodes } from './orderReceipt';

const SETUP_MSG = 'Run supabase_admin_gift_migration.sql in the Supabase SQL Editor.';

function wrapRpcError(error) {
  if (error?.message?.includes('function') && error?.message?.includes('does not exist')) {
    throw new Error(SETUP_MSG);
  }
  throw error;
}

export async function adminGiftOrder({
  targetUserId,
  offerId,
  playerUid = null,
  playerServer = null,
  playerCharname = null,
  giftMessage = null,
  adminNote = null,
}) {
  const { data, error } = await supabase.rpc('admin_gift_order', {
    p_target_user_id: targetUserId,
    p_offer_id: offerId,
    p_player_uid: playerUid,
    p_player_server: playerServer,
    p_player_charname: playerCharname,
    p_gift_message: giftMessage,
    p_admin_note: adminNote,
  });

  if (error) wrapRpcError(error);
  return data;
}

export async function pollOrderFulfillment(orderId, { maxWaitMs = 90000, intervalMs = 2500 } = {}) {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const [{ data: order }, { data: items }] = await Promise.all([
      supabase
        .from('orders')
        .select('id, fulfillment_status, g2bulk_metadata, total, gift_message')
        .eq('id', orderId)
        .maybeSingle(),
      supabase
        .from('order_items')
        .select('id, delivery_items, player_uid, fulfillment_status')
        .eq('order_id', orderId),
    ]);

    const status = order?.fulfillment_status;
    if (status === 'fulfilled' || status === 'failed' || status === 'skipped') {
      return {
        order,
        items: items || [],
        codes: extractDeliveryCodes(items || []),
        status,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  const [{ data: order }, { data: items }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, fulfillment_status, g2bulk_metadata, total, gift_message')
      .eq('id', orderId)
      .maybeSingle(),
    supabase
      .from('order_items')
      .select('id, delivery_items, player_uid, fulfillment_status')
      .eq('order_id', orderId),
  ]);

  return {
    order,
    items: items || [],
    codes: extractDeliveryCodes(items || []),
    status: order?.fulfillment_status,
    timedOut: true,
  };
}