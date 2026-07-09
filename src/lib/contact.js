import { supabase } from './supabase';

export async function submitContactMessage({ name, email, message, userId }) {
  const trimmedEmail = email?.trim();
  const trimmedMessage = message?.trim();

  if (!trimmedEmail || !trimmedMessage) {
    throw new Error('Email and message are required');
  }

  const { error } = await supabase.from('contact_messages').insert({
    name: name?.trim() || null,
    email: trimmedEmail,
    message: trimmedMessage,
    user_id: userId || null,
  });

  if (error) throw error;
}