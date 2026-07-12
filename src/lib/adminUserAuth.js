import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { getAuthRedirectUrl } from './auth';

async function parseInvokeError(error) {
  let message = error.message || 'Admin user auth request failed';
  if (error instanceof FunctionsHttpError && error.context) {
    try {
      const body = await error.context.json();
      if (body?.message) message = body.message;
    } catch {
      try {
        const text = await error.context.text();
        if (text) message = text.slice(0, 300);
      } catch {
        /* keep default */
      }
    }
  }
  return message;
}

async function invokeAdminUserAuth(body) {
  const { data, error } = await supabase.functions.invoke('admin-user-auth', { body });
  if (error) {
    throw new Error(await parseInvokeError(error));
  }
  if (data?.success === false) {
    throw new Error(data.message || 'Admin user auth request failed');
  }
  return data;
}

export async function adminSendPasswordResetEmail(userId) {
  return invokeAdminUserAuth({
    action: 'send_reset_email',
    userId,
    redirectTo: getAuthRedirectUrl('/login?recovery=1'),
  });
}

export async function adminGenerateRecoveryLink(userId) {
  return invokeAdminUserAuth({
    action: 'generate_recovery_link',
    userId,
    redirectTo: getAuthRedirectUrl('/login?recovery=1'),
  });
}

export async function adminSetUserPassword(userId, password) {
  return invokeAdminUserAuth({
    action: 'set_password',
    userId,
    password,
  });
}