import { supabase } from './supabase';

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
  giftMessage = null,
  adminNote = null,
}) {
  const { data, error } = await supabase.rpc('admin_gift_order', {
    p_target_user_id: targetUserId,
    p_offer_id: offerId,
    p_player_uid: playerUid,
    p_player_server: playerServer,
    p_gift_message: giftMessage,
    p_admin_note: adminNote,
  });

  if (error) wrapRpcError(error);
  return data;
}