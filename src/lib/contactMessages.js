import { supabase } from './supabase';

/**
 * Admin: list contact form submissions (newest first).
 */
export async function fetchContactMessages({ limit = 100 } = {}) {
  const { data, error } = await supabase
    .from('contact_messages')
    .select('id, user_id, name, email, message, status, created_at')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(500, Number(limit) || 100)));

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function fetchContactMessageById(messageId) {
  const id = String(messageId || '').trim();
  if (!id) return null;

  const { data, error } = await supabase
    .from('contact_messages')
    .select('id, user_id, name, email, message, status, created_at')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/** status: 'new' | 'read' | 'archived' */
export async function updateContactMessageStatus(messageId, status) {
  const id = String(messageId || '').trim();
  const next = String(status || '').trim();
  if (!id) throw new Error('Message id required');
  if (!['new', 'read', 'archived'].includes(next)) {
    throw new Error('Invalid status');
  }

  const { data, error } = await supabase
    .from('contact_messages')
    .update({ status: next })
    .eq('id', id)
    .select('id, user_id, name, email, message, status, created_at')
    .single();

  if (error) throw error;
  return data;
}

/**
 * Load full conversation (original message + reply bubbles).
 * Works for admin or the registered owner of the thread.
 */
export async function fetchContactThread(messageId) {
  const id = String(messageId || '').trim();
  if (!id) throw new Error('Message id required');

  const { data, error } = await supabase.rpc('get_contact_thread', {
    p_message_id: id,
  });

  if (error) throw error;

  const message = data?.message || null;
  const replies = Array.isArray(data?.replies) ? data.replies : [];
  return { message, replies };
}

/**
 * Send an in-app reply (admin or registered customer).
 */
export async function sendContactReply(messageId, body) {
  const id = String(messageId || '').trim();
  const text = String(body || '').trim();
  if (!id) throw new Error('Message id required');
  if (!text) throw new Error('Reply body required');

  const { data, error } = await supabase.rpc('send_contact_reply', {
    p_message_id: id,
    p_body: text,
  });

  if (error) throw error;
  return data;
}

/** Registered user: list their support threads. */
export async function fetchMyContactThreads({ limit = 50 } = {}) {
  const { data, error } = await supabase.rpc('get_my_contact_threads', {
    p_limit: Math.max(1, Math.min(100, Number(limit) || 50)),
  });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/** Build chat timeline: original customer message + replies. */
export function buildContactTimeline(message, replies = []) {
  if (!message) return [];
  const items = [
    {
      id: `orig-${message.id}`,
      kind: 'original',
      sender_role: 'user',
      body: message.message,
      created_at: message.created_at,
      name: message.name,
    },
    ...replies.map((row) => ({
      id: row.id,
      kind: 'reply',
      sender_role: row.sender_role,
      body: row.body,
      created_at: row.created_at,
      sender_user_id: row.sender_user_id,
    })),
  ];
  return items.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}
