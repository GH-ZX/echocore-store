import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Json = Record<string, unknown>;

function jsonResponse(body: Json, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

async function isAdmin(userClient: ReturnType<typeof createClient>, userId: string) {
  const { data } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  return data?.role === 'admin';
}

async function resolveUserEmail(serviceClient: ReturnType<typeof createClient>, userId: string) {
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (!profile) return { error: 'User not found', status: 404 };
  if (profile.role === 'admin') return { error: 'Cannot manage admin passwords here', status: 400 };

  const { data: authData, error: authError } = await serviceClient.auth.admin.getUserById(userId);
  if (authError || !authData?.user?.email) {
    return { error: authError?.message || 'User email not found', status: 404 };
  }

  return { email: authData.user.email };
}

function resolveRedirectTo(body: Json) {
  const fromBody = typeof body.redirectTo === 'string' ? body.redirectTo.trim() : '';
  if (fromBody) return fromBody;

  const siteDomain = Deno.env.get('SITE_DOMAIN')?.trim();
  if (siteDomain) {
    return `https://${siteDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/login?recovery=1`;
  }

  return undefined;
}

function validatePassword(password: unknown) {
  const value = String(password ?? '');
  if (value.length < 1 || value.length > 32) {
    return 'Password must be between 1 and 32 characters';
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse({ success: false, message: 'Supabase env not configured' }, 500);
  }

  const body = await readJson(req);
  const action = String(body.action || '');

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData?.user?.id) {
    return jsonResponse({ success: false, message: 'Unauthorized' }, 401);
  }

  if (!(await isAdmin(userClient, authData.user.id))) {
    return jsonResponse({ success: false, message: 'Admin only' }, 403);
  }

  const userId = String(body.userId || '');
  if (!userId) {
    return jsonResponse({ success: false, message: 'userId required' }, 400);
  }

  const emailResult = await resolveUserEmail(serviceClient, userId);
  if ('error' in emailResult) {
    return jsonResponse({ success: false, message: emailResult.error }, emailResult.status);
  }

  const email = emailResult.email;
  const redirectTo = resolveRedirectTo(body);

  if (action === 'send_reset_email') {
    const { error } = await serviceClient.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (error) {
      return jsonResponse({ success: false, message: error.message }, 400);
    }
    return jsonResponse({ success: true, email });
  }

  if (action === 'generate_recovery_link') {
    const { data, error } = await serviceClient.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: redirectTo ? { redirectTo } : undefined,
    });
    if (error) {
      return jsonResponse({ success: false, message: error.message }, 400);
    }
    const link = data?.properties?.action_link || '';
    if (!link) {
      return jsonResponse({ success: false, message: 'Could not generate recovery link' }, 500);
    }
    return jsonResponse({ success: true, email, recoveryLink: link });
  }

  if (action === 'set_password') {
    const passwordError = validatePassword(body.password);
    if (passwordError) {
      return jsonResponse({ success: false, message: passwordError }, 400);
    }

    const { error } = await serviceClient.auth.admin.updateUserById(userId, {
      password: String(body.password),
    });
    if (error) {
      return jsonResponse({ success: false, message: error.message }, 400);
    }
    return jsonResponse({ success: true });
  }

  return jsonResponse({ success: false, message: 'Unknown action' }, 400);
});