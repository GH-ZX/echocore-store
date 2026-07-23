import { supabase } from './supabase';

/**
 * Submit contact form via rate-limited RPC (honeypot supported).
 * Falls back to direct insert only if RPC is not migrated yet (legacy).
 */
export async function submitContactMessage({
  name,
  email,
  message,
  userId,
  honeypot = '',
} = {}) {
  const trimmedEmail = email?.trim();
  const trimmedMessage = message?.trim();

  if (!trimmedEmail || !trimmedMessage) {
    throw new Error('Email and message are required');
  }

  // Bots: never hit the network with a filled honeypot on client either
  if (honeypot && String(honeypot).trim()) {
    return { ok: true, ignored: true };
  }

  const { data, error } = await supabase.rpc('submit_contact_message', {
    p_name: name?.trim() || null,
    p_email: trimmedEmail,
    p_message: trimmedMessage,
    p_honeypot: honeypot ? String(honeypot) : null,
  });

  if (!error) {
    return data || { ok: true };
  }

  const msg = error.message || '';

  // Pre-migration: function missing → legacy insert (still has RLS checks)
  if (/function|does not exist|Could not find the function/i.test(msg)) {
    const { error: insertError } = await supabase.from('contact_messages').insert({
      name: name?.trim() || null,
      email: trimmedEmail,
      message: trimmedMessage,
      user_id: userId || null,
    });
    if (insertError) throw insertError;
    return { ok: true, legacy: true };
  }

  if (/contact_rate_limited|rate_limited/i.test(msg)) {
    const err = new Error('contact_rate_limited');
    err.code = 'contact_rate_limited';
    throw err;
  }
  if (/contact_invalid_email|invalid_email/i.test(msg)) {
    const err = new Error('contact_invalid_email');
    err.code = 'contact_invalid_email';
    throw err;
  }
  if (/contact_invalid_message|invalid_message/i.test(msg)) {
    const err = new Error('contact_invalid_message');
    err.code = 'contact_invalid_message';
    throw err;
  }
  if (/contact_required/i.test(msg)) {
    const err = new Error('contact_required');
    err.code = 'contact_required';
    throw err;
  }

  throw error;
}

export function contactErrorMessage(err, t = {}) {
  const code = err?.code || err?.message || '';
  if (code === 'contact_rate_limited' || /contact_rate_limited/i.test(String(code))) {
    return t.contactRateLimited || t.contactSubmitFailed;
  }
  if (code === 'contact_invalid_email') {
    return t.contactInvalidEmail || t.contactSubmitFailed;
  }
  if (code === 'contact_invalid_message') {
    return t.contactInvalidMessage || t.contactSubmitFailed;
  }
  if (code === 'contact_required') {
    return t.contactEmailMessageRequired || t.contactSubmitFailed;
  }
  return t.contactSubmitFailed || 'Could not send your message.';
}
