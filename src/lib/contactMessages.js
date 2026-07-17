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
