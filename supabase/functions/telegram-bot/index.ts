/**
 * Telegram Bot Edge Function — ECHOCORE Store
 *
 * Handles:
 *   Customer: /start, /help, /orders, /balance, /track <ref>, inline buttons
 *   Admin:    /pending, /approve <id>, /reject <id>, /stats, order picking
 *   Callback: order detail, approve/reject recharge, track order
 *
 * Webhook: set via BotFather → POST to /functions/v1/telegram-bot
 * Secret:  X-Telegram-Bot-Api-Secret-Token header validated against store_settings.telegram_webhook_secret
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-telegram-bot-secret',
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name?: string; username?: string; is_bot?: boolean };
    chat: { id: number; type: string };
    text?: string;
    date: number;
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name?: string; username?: string; is_bot?: boolean };
    message?: { message_id: number; chat: { id: number; type?: string }; text?: string };
    data?: string;
  };
}

interface BotContext {
  supabase: ReturnType<typeof createClient>;
  botToken: string;
  adminChatId: string;
  webhookSecret: string;
  chatId: number;
  userId: number;
  firstName: string;
  username: string;
  isAdmin: boolean;
  adminProfileId: string | null;
  isGroup: boolean;
  callbackQueryId?: string;
  /** Message holding the tapped button — replies edit it in place. */
  messageId?: number;
}

const STORE_URL = 'https://www.echocore412.com';

// ─── Telegram API helpers ───────────────────────────────────────────────────

async function tgApi(token: string, method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) {
    console.error(`TG API ${method} failed:`, JSON.stringify(json));
  }
  return json;
}

async function sendMessage(token: string, chatId: number, text: string, extra: Record<string, unknown> = {}) {
  return tgApi(token, 'sendMessage', {
    chat_id: chatId,
    text: text.slice(0, 4096),
    parse_mode: 'HTML',
    ...extra,
  });
}

async function answerCallback(token: string, callbackQueryId: string, text?: string) {
  return tgApi(token, 'answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: text || undefined,
    show_alert: !!text,
  });
}

const BACK_ROW = [{ text: '⬅️ Back to menu', callback_data: 'menu' }];

/**
 * Reply to the user. Button taps edit the same message (clean navigation);
 * typed commands send a new one. Every screen except the menu gets a Back row.
 */
async function reply(
  ctx: BotContext,
  text: string,
  extra: Record<string, unknown> = {},
  { back = true }: { back?: boolean } = {},
) {
  const markup = (extra.reply_markup as { inline_keyboard?: unknown[][] } | undefined) ?? {};
  const rows = Array.isArray(markup.inline_keyboard) ? [...markup.inline_keyboard] : [];
  if (back && !ctx.isGroup) rows.push(BACK_ROW);
  const payload = {
    ...extra,
    ...(rows.length ? { reply_markup: { ...markup, inline_keyboard: rows } } : {}),
  };
  if (ctx.messageId) {
    const edited = await tgApi(ctx.botToken, 'editMessageText', {
      chat_id: ctx.chatId,
      message_id: ctx.messageId,
      text: text.slice(0, 4096),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...payload,
    });
    if (edited?.ok) return edited;
    // Same content: nothing to do. Anything else (too old, etc.): send fresh.
    if (String(edited?.description || '').includes('message is not modified')) return edited;
  }
  return sendMessage(ctx.botToken, ctx.chatId, text, { disable_web_page_preview: true, ...payload });
}

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function money(n: number | null | undefined): string {
  return `$${(n ?? 0).toFixed(2)}`;
}

// ─── Database helpers ───────────────────────────────────────────────────────

async function getStoreSettings(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase
    .from('store_settings')
    .select('telegram_bot_token, telegram_chat_id, telegram_webhook_secret, g2bulk_enabled')
    .eq('id', 1)
    .maybeSingle();
  return data;
}

async function resolveAdminChatId(supabase: ReturnType<typeof createClient>): Promise<string> {
  const settings = await getStoreSettings(supabase);
  return (settings?.telegram_chat_id ?? '').trim();
}

/** Returns the admin's profile id when this Telegram user is a linked admin, else null. */
async function findAdminProfileId(supabase: ReturnType<typeof createClient>, telegramUserId: number): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('telegram_chat_id', String(telegramUserId))
    .maybeSingle();
  return data?.role === 'admin' ? data.id : null;
}

/**
 * Verifies the caller's Supabase JWT with the auth server (signature checked —
 * the function runs with verify_jwt = false so Telegram can reach the webhook).
 */
async function getVerifiedUser(supabase: ReturnType<typeof createClient>, req: Request) {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return null;
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data?.user) return null;
  return data.user;
}

async function isAdminProfile(supabase: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
  return data?.role === 'admin';
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** One-time link token: the chat_id never travels through a user-editable URL. */
async function createLinkToken(supabase: ReturnType<typeof createClient>, chatId: number, displayName: string): Promise<string | null> {
  const token = crypto.randomUUID().replace(/-/g, '');
  const { error } = await supabase
    .from('telegram_link_tokens')
    .insert({ token, chat_id: String(chatId), display_name: displayName.slice(0, 80) });
  if (error) {
    console.error('createLinkToken error:', error);
    return null;
  }
  return token;
}

/** Order lines like "• 2× Product" — product names for customer/admin views. */
async function orderItemsText(supabase: ReturnType<typeof createClient>, orderId: string): Promise<string> {
  const { data } = await supabase
    .from('order_items')
    .select('name_snapshot, quantity')
    .eq('order_id', orderId)
    .order('id', { ascending: true })
    .limit(8);
  return (data ?? [])
    .map((i: { name_snapshot: string | null; quantity: number | null }) =>
      `• ${i.quantity ?? 1}× ${esc((i.name_snapshot ?? '—').slice(0, 80))}`)
    .join('\n');
}

async function findUserByTelegramChat(supabase: ReturnType<typeof createClient>, telegramChatId: number) {
  const { data } = await supabase
    .from('profiles')
    .select('id, name, username, role, balance')
    .eq('telegram_chat_id', String(telegramChatId))
    .maybeSingle();
  return data;
}

// ─── Command handlers ───────────────────────────────────────────────────────

async function cmdStart(ctx: BotContext) {
  const linked = await findUserByTelegramChat(ctx.supabase, ctx.chatId);

  // A linked account never sees the "link" prompt again: straight to the menu.
  if (linked || ctx.isAdmin) {
    const name = linked?.username || linked?.name || ctx.firstName;
    const rows: Array<Array<Record<string, string>>> = [
      [
        { text: '💰 My Balance', callback_data: 'my_balance' },
        { text: '📦 My Orders', callback_data: 'my_orders' },
      ],
      [
        { text: '🔄 Track Order', callback_data: 'track_order' },
        { text: '➕ Recharge', url: `${STORE_URL}/recharge` },
      ],
      [
        { text: '🎮 Games', callback_data: 'browse_games' },
        { text: '🎟 Vouchers', callback_data: 'browse_vouchers' },
      ],
      [
        { text: '🛒 Open Store', url: STORE_URL },
        { text: '💬 Support', url: `${STORE_URL}/contact` },
      ],
      [
        { text: '⚙️ My Account', callback_data: 'account' },
        { text: '❓ Help', callback_data: 'show_help' },
      ],
    ];
    if (ctx.isAdmin && !ctx.isGroup) {
      rows.push(
        [
          { text: '📊 Stats', callback_data: 'admin_stats' },
          { text: '⏳ Pending Recharges', callback_data: 'admin_pending' },
        ],
        [
          { text: '🕒 Latest Orders', callback_data: 'admin_recent' },
          { text: '⚠️ Failed Orders', callback_data: 'admin_failed' },
        ],
      );
    }
    await reply(ctx,
      `👋 <b>Welcome back, ${esc(name)}!</b>\n\n` +
      (linked ? `💰 Balance: <b>${money(linked.balance)}</b>\n\n` : '') +
      `Choose an option below.`,
      { reply_markup: { inline_keyboard: rows } },
      { back: false },
    );
  } else {
    await sendLinkPrompt(ctx, `👋 <b>Welcome to ECHOCORE Store!</b>\n\n` +
      `I help you track orders, check your balance, and get notified about deliveries.\n\n`);
  }
}

/** Sends the "Link My Account" button carrying a fresh single-use token. */
async function sendLinkPrompt(ctx: BotContext, intro: string) {
  if (ctx.isGroup) {
    await reply(ctx, `Please message me in a private chat to link your account.`);
    return;
  }
  const displayName = [ctx.firstName, ctx.username ? `(@${ctx.username})` : ''].filter(Boolean).join(' ') || `Telegram ${ctx.userId}`;
  const token = await createLinkToken(ctx.supabase, ctx.chatId, displayName);
  const rows: Array<Array<Record<string, string>>> = [];
  if (token) {
    rows.push([{ text: '🔗 Link My Account', url: `${STORE_URL}/telegram-link?token=${token}` }]);
  }
  rows.push([
    { text: '🛒 Browse Store', url: STORE_URL },
    { text: '❓ Help', callback_data: 'show_help' },
  ]);
  await reply(ctx,
    intro +
    (token
      ? `Tap the button below and log in to the store to link your account. The link works once and expires in 15 minutes.`
      : `⚠️ Couldn't create a link right now. Please try again in a moment.`),
    { reply_markup: { inline_keyboard: rows } },
    { back: false },
  );
}

async function cmdHelp(ctx: BotContext) {
  const lines = ctx.isAdmin
    ? [
        `<b>📋 Admin Commands</b>`,
        ``,
        `/pending — Recharges awaiting approval`,
        `/approve &lt;id&gt; — Approve a recharge`,
        `/reject &lt;id&gt; — Reject a recharge`,
        `/stats — Quick store stats`,
        `/broadcast &lt;msg&gt; — Send announcement to all users`,
        ``,
        `<b>👤 Customer Commands</b>`,
        ``,
      ]
    : [];

  lines.push(
    `/start — Welcome + quick actions`,
    `/help — This message`,
    `/link — Link your store account`,
    `/unlink — Unlink your Telegram`,
    `/orders — Your recent orders`,
    `/balance — Check wallet balance`,
    `/track &lt;order_ref&gt; — Track an order`,
    ``,
    `<i>Tap a button or type a command to begin.</i>`,
  );

  await reply(ctx, lines.join('\n'));
}

async function cmdLink(ctx: BotContext) {
  // Linking by typing a username let anyone claim someone else's account notifications.
  // Linking now requires logging in to the store through a single-use link.
  const linked = await findUserByTelegramChat(ctx.supabase, ctx.chatId);
  if (linked) {
    await reply(ctx,
      `✅ Already linked to <b>${esc(linked.username || linked.name)}</b>. Use /unlink to disconnect.`);
    return;
  }
  await sendLinkPrompt(ctx, `🔗 <b>Link your account</b>\n\n`);
}

async function cmdUnlink(ctx: BotContext) {
  const user = await findUserByTelegramChat(ctx.supabase, ctx.chatId);
  if (!user) {
    await reply(ctx, `You don't have a linked account.`);
    return;
  }

  const { error } = await ctx.supabase
    .from('profiles')
    .update({ telegram_chat_id: null, telegram_linked_at: null })
    .eq('id', user.id);

  if (error) {
    await reply(ctx, `❌ Failed to unlink. Try again later.`);
    return;
  }

  await reply(ctx,
    `✅ Account unlinked. You won't receive delivery notifications here anymore.\n\n` +
    `Use /link to re-link anytime.`,
  );
}

async function cmdBalance(ctx: BotContext) {
  const user = await findUserByTelegramChat(ctx.supabase, ctx.chatId);
  if (!user) {
    await reply(ctx,
      `🔗 Link your account first with /link`,
    );
    return;
  }

  await reply(ctx,
    `💰 <b>Wallet Balance</b>\n\n` +
    `Balance: <b>${money(user.balance)}</b>\n` +
    `Account: <b>${esc(user.username || user.name)}</b>`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 Recharge', url: 'https://www.echocore412.com/recharge' },
            { text: '📦 My Orders', callback_data: 'my_orders' },
          ],
        ],
      },
    },
  );
}

const ORDER_STATUS_EMOJI: Record<string, string> = {
  pending: '⏳',
  completed: '✅',
  failed: '❌',
  fulfilling: '🔄',
  fulfilled: '🎉',
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: '⏳ Pending payment',
  completed: '✅ Paid',
  fulfilling: '🔄 Fulfilling…',
  fulfilled: '🎉 Delivered',
  failed: '❌ Failed',
};

function shortDate(iso: string, withYear = false): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    ...(withYear ? { year: 'numeric' as const } : {}),
  });
}

async function cmdOrders(ctx: BotContext) {
  const user = await findUserByTelegramChat(ctx.supabase, ctx.chatId);
  if (!user) {
    await reply(ctx,
      `🔗 Link your account first with /link`,
      { reply_markup: { inline_keyboard: [[{ text: '🔗 Link my account', callback_data: 'link_account' }]] } },
    );
    return;
  }

  const { data: orders } = await ctx.supabase
    .from('orders')
    .select('id, order_ref, total, status, fulfillment_status, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5);

  if (!orders || orders.length === 0) {
    await reply(ctx,
      `📦 No orders yet.\n\nBrowse the store to make your first purchase!`,
      { reply_markup: { inline_keyboard: [[{ text: '🛒 Browse Store', url: STORE_URL }]] } },
    );
    return;
  }

  const { data: items } = await ctx.supabase
    .from('order_items')
    .select('order_id, name_snapshot, quantity')
    .in('order_id', orders.map((o) => o.id))
    .order('id', { ascending: true });

  const itemsByOrder = new Map<string, Array<{ name_snapshot: string | null; quantity: number | null }>>();
  for (const it of items ?? []) {
    const list = itemsByOrder.get(it.order_id) ?? [];
    list.push(it);
    itemsByOrder.set(it.order_id, list);
  }

  const lines = orders.map((o) => {
    const emoji = ORDER_STATUS_EMOJI[o.fulfillment_status] || ORDER_STATUS_EMOJI[o.status] || '❓';
    const its = itemsByOrder.get(o.id) ?? [];
    const first = its[0];
    const productLine = first
      ? `\n   ${first.quantity ?? 1}× ${esc((first.name_snapshot ?? '—').slice(0, 60))}${its.length > 1 ? ` +${its.length - 1} more` : ''}`
      : '';
    return `${emoji} <b>${esc(o.order_ref)}</b> — ${money(o.total)} · ${shortDate(o.created_at)}${productLine}`;
  });

  await reply(ctx,
    `📦 <b>Your Recent Orders</b>\n\n${lines.join('\n\n')}\n\nTap an order to see details.`,
    {
      reply_markup: {
        inline_keyboard: [
          ...orders.map((o) => [{ text: `📍 ${o.order_ref}`, callback_data: `track:${o.id}` }]),
          [{ text: '🛒 Browse Store', url: STORE_URL }],
        ],
      },
    },
  );
}

/** Loads an order the caller may see: own orders for customers, any order for admins (private chat). */
async function loadVisibleOrder(ctx: BotContext, filter: { id?: string; ref?: string }) {
  const user = await findUserByTelegramChat(ctx.supabase, ctx.chatId);
  const adminView = ctx.isAdmin && !ctx.isGroup;
  if (!user && !adminView) return { order: null, needsLink: true };

  let q = ctx.supabase
    .from('orders')
    .select('id, order_ref, total, status, fulfillment_status, g2bulk_metadata, created_at, payment_method, user_id');
  if (filter.id) q = q.eq('id', filter.id);
  // Escape LIKE wildcards: /track % must not match every order.
  if (filter.ref) q = q.ilike('order_ref', filter.ref.replace(/[\\%_]/g, '\\$&'));
  if (!adminView && user) q = q.eq('user_id', user.id);

  const { data } = await q.limit(1).maybeSingle();
  return { order: data, needsLink: false };
}

async function sendOrderDetail(ctx: BotContext, order: {
  id: string; order_ref: string; total: number; status: string; fulfillment_status: string;
  g2bulk_metadata: unknown; created_at: string; payment_method: string;
}) {
  const meta = (order.g2bulk_metadata || {}) as Record<string, unknown>;
  const items = await orderItemsText(ctx.supabase, order.id);
  const refunded = !!meta.balance_refunded;

  // Internal error text is never shown in Telegram.
  const lines = [
    `📍 <b>Order ${esc(order.order_ref)}</b>`,
    ``,
    ...(items ? [items, ``] : []),
    `Status: <b>${ORDER_STATUS_LABEL[order.fulfillment_status] || ORDER_STATUS_LABEL[order.status] || esc(order.status)}</b>`,
    `Amount: <b>${money(order.total)}</b>`,
    `Payment: ${esc(order.payment_method)}`,
    `Date: ${shortDate(order.created_at, true)}`,
  ];
  if (refunded) lines.push(``, `💰 <i>Balance refunded: ${money(order.total)}</i>`);

  const buttons: Array<Array<Record<string, string>>> = [];
  if (order.fulfillment_status === 'fulfilled') {
    buttons.push([{ text: '📄 View Invoice', url: `${STORE_URL}/invoice/order/${order.id}` }]);
  } else if (order.fulfillment_status === 'failed') {
    buttons.push([{ text: '💬 Contact Support', url: `${STORE_URL}/contact` }]);
  }
  buttons.push([
    { text: '📦 My Orders', callback_data: 'my_orders' },
    { text: '🛒 Browse Store', url: STORE_URL },
  ]);

  await reply(ctx, lines.join('\n'), {
    reply_markup: { inline_keyboard: buttons },
  });
}

async function cmdTrack(ctx: BotContext, args: string) {
  const ref = args.trim();
  if (!ref) {
    await reply(ctx,
      `Usage: <code>/track ORDER-REF</code>\n\nExample: <code>/track EC-2401-A1B2</code>`,
      { reply_markup: { inline_keyboard: [[{ text: '📦 My Orders', callback_data: 'my_orders' }]] } },
    );
    return;
  }

  const { order, needsLink } = await loadVisibleOrder(ctx, { ref });
  if (needsLink) {
    await reply(ctx, `🔗 Link your account first with /link`,
      { reply_markup: { inline_keyboard: [[{ text: '🔗 Link my account', callback_data: 'link_account' }]] } });
    return;
  }
  if (!order) {
    await reply(ctx, `❌ Order <b>${esc(ref)}</b> not found.`);
    return;
  }
  await sendOrderDetail(ctx, order);
}

// ─── Admin command handlers ─────────────────────────────────────────────────

/** Admin commands only run for a linked admin, in a private chat. */
async function requireAdmin(ctx: BotContext): Promise<boolean> {
  if (!ctx.isAdmin || !ctx.adminProfileId) {
    await reply(ctx, `⛔ Admin only.`);
    return false;
  }
  if (ctx.isGroup) {
    await reply(ctx, `⛔ Admin commands only work in a private chat with the bot.`);
    return false;
  }
  return true;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function cmdPending(ctx: BotContext) {
  if (!(await requireAdmin(ctx))) return;

  const { data: recharges } = await ctx.supabase
    .from('recharge_requests')
    .select('id, user_id, amount, reference, payment_method, status, created_at')
    .in('status', ['pending', 'payment_sent'])
    .order('created_at', { ascending: true })
    .limit(10);

  if (!recharges || recharges.length === 0) {
    await reply(ctx, `✅ No pending recharges.`);
    return;
  }

  const userIds = [...new Set(recharges.map((r) => r.user_id))];
  const { data: profiles } = await ctx.supabase
    .from('profiles')
    .select('id, username, name')
    .in('id', userIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const lines = recharges.map((r, i) => {
    const p = profileMap.get(r.user_id);
    const name = p?.username || p?.name || 'Unknown';
    const date = new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `${i + 1}. <b>${esc(name)}</b> — ${money(r.amount)} · ${date}\n   <code>${esc(r.reference)}</code>`;
  });

  await reply(ctx,
    `⏳ <b>Pending Recharges (${recharges.length})</b>\n\n${lines.join('\n\n')}`,
    {
      reply_markup: {
        inline_keyboard: [
          ...recharges.map((r, i) => [
            { text: `✅ #${i + 1} Approve ${money(r.amount)}`, callback_data: `approve:${r.id}` },
            { text: `❌ #${i + 1} Reject`, callback_data: `reject:${r.id}` },
          ]),
          [{ text: '🔎 Open dashboard', url: `${STORE_URL}/dashboard/recharges` }],
        ],
      },
    },
  );
}

async function cmdApprove(ctx: BotContext, args: string) {
  if (!(await requireAdmin(ctx))) return;

  const id = args.trim();
  if (!id) {
    await reply(ctx, `Usage: <code>/approve &lt;recharge_id&gt;</code>`);
    return;
  }
  if (!UUID_RE.test(id)) {
    await reply(ctx, `❌ Invalid recharge ID.`);
    return;
  }

  // Row-locked, atomic: the same credit path the dashboard uses (no read-modify-write here).
  const { data, error } = await ctx.supabase.rpc('telegram_approve_recharge', {
    p_request_id: id,
    p_admin_id: ctx.adminProfileId,
  });

  if (error || !data) {
    console.error('approve error:', error);
    await reply(ctx,
      `⚠️ Could not approve. It may not exist or was already handled. Check /pending.`);
    return;
  }

  const result = data as { userId: string; amount: number; newBalance: number };

  const { data: customer } = await ctx.supabase
    .from('profiles')
    .select('telegram_chat_id')
    .eq('id', result.userId)
    .maybeSingle();

  if (customer?.telegram_chat_id) {
    await sendMessage(ctx.botToken, Number(customer.telegram_chat_id),
      `✅ <b>Recharge approved!</b>\n\n` +
      `Amount: <b>${money(result.amount)}</b>\n` +
      `New balance: <b>${money(result.newBalance)}</b>`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '🛒 Shop now', url: STORE_URL },
            { text: '💰 My Balance', callback_data: 'my_balance' },
          ]],
        },
      },
    );
  }

  await reply(ctx,
    `✅ <b>Recharge approved</b>\n\n` +
    `Amount: ${money(result.amount)}\n` +
    `New balance: ${money(result.newBalance)}`,
    { reply_markup: { inline_keyboard: [[{ text: '⏳ Pending', callback_data: 'admin_pending' }]] } },
  );
}

async function cmdReject(ctx: BotContext, args: string) {
  if (!(await requireAdmin(ctx))) return;

  const id = args.trim();
  if (!id) {
    await reply(ctx, `Usage: <code>/reject &lt;recharge_id&gt;</code>`);
    return;
  }
  if (!UUID_RE.test(id)) {
    await reply(ctx, `❌ Invalid recharge ID.`);
    return;
  }

  const { data, error } = await ctx.supabase.rpc('telegram_reject_recharge', {
    p_request_id: id,
    p_admin_id: ctx.adminProfileId,
  });

  if (error || !data) {
    console.error('reject error:', error);
    await reply(ctx,
      `⚠️ Could not reject. It may not exist or was already handled. Check /pending.`);
    return;
  }

  const result = data as { userId: string; amount: number };

  const { data: customer } = await ctx.supabase
    .from('profiles')
    .select('telegram_chat_id')
    .eq('id', result.userId)
    .maybeSingle();

  if (customer?.telegram_chat_id) {
    await sendMessage(ctx.botToken, Number(customer.telegram_chat_id),
      `❌ <b>Recharge rejected</b>\n\n` +
      `Amount: ${money(result.amount)}\n\n` +
      `Contact support if you believe this is a mistake.`,
      { reply_markup: { inline_keyboard: [[{ text: '💬 Contact Support', url: `${STORE_URL}/contact` }]] } },
    );
  }

  await reply(ctx, `❌ Recharge rejected.`,
    { reply_markup: { inline_keyboard: [[{ text: '⏳ Pending', callback_data: 'admin_pending' }]] } });
}

async function cmdStats(ctx: BotContext) {
  if (!(await requireAdmin(ctx))) return;

  const [ordersRes, usersRes, revenueRes, pendingRes] = await Promise.all([
    ctx.supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
    ctx.supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'user'),
    ctx.supabase.from('orders').select('total').eq('status', 'completed'),
    ctx.supabase.from('recharge_requests').select('id', { count: 'exact', head: true }).in('status', ['pending', 'payment_sent']),
  ]);

  const totalOrders = ordersRes.count ?? 0;
  const totalUsers = usersRes.count ?? 0;
  const totalRevenue = (revenueRes.data ?? []).reduce((sum: number, o: { total: number }) => sum + (o.total ?? 0), 0);
  const pendingCount = pendingRes.count ?? 0;

  await reply(ctx,
    `📊 <b>Store Stats</b>\n\n` +
    `👥 Users: <b>${totalUsers}</b>\n` +
    `📦 Orders: <b>${totalOrders}</b>\n` +
    `💰 Revenue: <b>${money(totalRevenue)}</b>\n` +
    `⏳ Pending recharges: <b>${pendingCount}</b>`,
    {
      reply_markup: {
        inline_keyboard: [
          ...(pendingCount > 0 ? [[{ text: `⏳ View Pending (${pendingCount})`, callback_data: 'admin_pending' }]] : []),
          [{ text: '🔎 Open dashboard', url: `${STORE_URL}/dashboard` }],
        ],
      },
    },
  );
}

async function cmdBroadcast(ctx: BotContext, args: string) {
  if (!(await requireAdmin(ctx))) return;

  const msg = args.trim();
  if (!msg) {
    await reply(ctx,
      `Usage: <code>/broadcast Your announcement message</code>`,
    );
    return;
  }

  const { data: users } = await ctx.supabase
    .from('profiles')
    .select('id, telegram_chat_id')
    .eq('role', 'user')
    .not('telegram_chat_id', 'is', null);

  if (!users || users.length === 0) {
    await reply(ctx, `No linked users to broadcast to.`);
    return;
  }

  let sent = 0;
  let failed = 0;
  for (const u of users) {
    if (!u.telegram_chat_id) continue;
    // sendMessage never throws: count by Telegram's ok flag. Pace sends (~20/s) to stay under limits.
    const res = await sendMessage(ctx.botToken, Number(u.telegram_chat_id),
      `📢 <b>Store Announcement</b>\n\n${esc(msg)}`,
      { reply_markup: { inline_keyboard: [[{ text: '🛒 Open store', url: STORE_URL }]] } },
    );
    if (res?.ok) sent++; else failed++;
    await new Promise((r) => setTimeout(r, 50));
  }

  await reply(ctx,
    `📢 Broadcast delivered to <b>${sent}</b> user(s).${failed ? ` Failed: ${failed}` : ''}`,
  );
}

// ─── Menu screens ───────────────────────────────────────────────────────────

/** Store games or vouchers as link buttons (two per row). */
async function cmdBrowse(ctx: BotContext, kind: 'games' | 'vouchers') {
  let q = ctx.supabase
    .from('games')
    .select('slug, name_en')
    .eq('active', true)
    .order('name_en', { ascending: true })
    .limit(24);
  q = kind === 'vouchers' ? q.eq('redemption_method', 'redeem_code') : q.neq('redemption_method', 'redeem_code');
  const { data: games } = await q;

  if (!games || games.length === 0) {
    await reply(ctx, kind === 'vouchers' ? `🎟 No vouchers available right now.` : `🎮 No games available right now.`);
    return;
  }

  const rows: Array<Array<Record<string, string>>> = [];
  for (let i = 0; i < games.length; i += 2) {
    rows.push(games.slice(i, i + 2).map((g) => ({
      text: String(g.name_en || g.slug).trim().slice(0, 30),
      url: `${STORE_URL}/game/${g.slug}`,
    })));
  }
  await reply(ctx,
    kind === 'vouchers'
      ? `🎟 <b>Gift Cards & Vouchers</b>\n\nTap one to open it in the store.`
      : `🎮 <b>Game Top-Ups</b>\n\nTap a game to open it in the store.`,
    { reply_markup: { inline_keyboard: rows } },
  );
}

async function cmdAccount(ctx: BotContext) {
  const user = await findUserByTelegramChat(ctx.supabase, ctx.chatId);
  if (!user) {
    await sendLinkPrompt(ctx, `🔗 <b>Link your account</b>\n\n`);
    return;
  }
  await reply(ctx,
    `⚙️ <b>My Account</b>\n\n` +
    `Account: <b>${esc(user.username || user.name)}</b>\n` +
    `Balance: <b>${money(user.balance)}</b>\n\n` +
    `This Telegram receives your order and recharge notifications.`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '👤 Open my profile', url: `${STORE_URL}/profile` }],
          [{ text: '🔓 Unlink Telegram', callback_data: 'unlink_ask' }],
        ],
      },
    },
  );
}

async function cmdUnlinkAsk(ctx: BotContext) {
  await reply(ctx,
    `🔓 <b>Unlink this Telegram?</b>\n\nYou'll stop getting order notifications here. You can link again anytime.`,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Yes, unlink', callback_data: 'unlink_yes' },
          { text: '✖️ Cancel', callback_data: 'account' },
        ]],
      },
    },
  );
}

/** Admin: latest orders, or failed ones from the last 30 days. */
async function cmdAdminOrders(ctx: BotContext, failedOnly: boolean) {
  if (!(await requireAdmin(ctx))) return;
  let q = ctx.supabase
    .from('orders')
    .select('id, order_ref, total, status, fulfillment_status, created_at')
    .order('created_at', { ascending: false })
    .limit(8);
  if (failedOnly) {
    q = q.eq('status', 'completed').eq('fulfillment_status', 'failed')
      .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString());
  }
  const { data: orders } = await q;
  if (!orders || orders.length === 0) {
    await reply(ctx, failedOnly ? `✅ No failed orders in the last 30 days.` : `No orders yet.`);
    return;
  }
  const lines = orders.map((o) => {
    const emoji = ORDER_STATUS_EMOJI[o.fulfillment_status] || ORDER_STATUS_EMOJI[o.status] || '❓';
    return `${emoji} <b>${esc(o.order_ref)}</b> — ${money(o.total)} · ${shortDate(o.created_at)}`;
  });
  await reply(ctx,
    `${failedOnly ? '⚠️ <b>Failed Orders (30 days)</b>' : '🕒 <b>Latest Orders</b>'}\n\n${lines.join('\n')}`,
    {
      reply_markup: {
        inline_keyboard: [
          ...orders.map((o) => [{ text: `📍 ${o.order_ref}`, callback_data: `track:${o.id}` }]),
          [{ text: '🔎 Open dashboard', url: `${STORE_URL}/dashboard/orders` }],
        ],
      },
    },
  );
}

// ─── Callback query handler ─────────────────────────────────────────────────

async function handleCallback(ctx: BotContext, data: string) {
  // Always acknowledge once so the button spinner clears.
  await answerCallback(ctx.botToken, ctx.callbackQueryId!);

  if (data === 'menu') {
    await cmdStart(ctx);
  }

  else if (data === 'my_balance') {
    await cmdBalance(ctx);
  }

  else if (data === 'browse_games' || data === 'browse_vouchers') {
    await cmdBrowse(ctx, data === 'browse_games' ? 'games' : 'vouchers');
  }

  else if (data === 'account') {
    await cmdAccount(ctx);
  }

  else if (data === 'unlink_ask') {
    await cmdUnlinkAsk(ctx);
  }

  else if (data === 'unlink_yes') {
    await cmdUnlink(ctx);
  }

  else if (data === 'admin_stats') {
    await cmdStats(ctx);
  }

  else if (data === 'admin_recent' || data === 'admin_failed') {
    await cmdAdminOrders(ctx, data === 'admin_failed');
  }

  else if (data === 'my_orders') {
    await cmdOrders(ctx);
  }

  else if (data === 'link_account') {
    await cmdLink(ctx);
  }

  else if (data === 'track_order') {
    await reply(ctx,
      `📍 Send: <code>/track ORDER-REF</code>\n\nExample: <code>/track EC-2401-A1B2</code>`,
      { reply_markup: { inline_keyboard: [[{ text: '📦 My Orders', callback_data: 'my_orders' }]] } },
    );
  }

  else if (data === 'show_help') {
    await cmdHelp(ctx);
  }

  else if (data === 'admin_pending') {
    await cmdPending(ctx);
  }

  else if (data.startsWith('track:')) {
    const orderId = data.slice(6);
    if (!UUID_RE.test(orderId)) return;
    const { order, needsLink } = await loadVisibleOrder(ctx, { id: orderId });
    if (needsLink) {
      await reply(ctx, `🔗 Link your account first with /link`);
      return;
    }
    if (!order) {
      await reply(ctx, `❌ Order not found.`);
      return;
    }
    await sendOrderDetail(ctx, order);
  }

  else if (data.startsWith('approve:')) {
    await cmdApprove(ctx, data.slice(8));
  }

  else if (data.startsWith('reject:')) {
    await cmdReject(ctx, data.slice(7));
  }
}

// ─── Bot commands registration ──────────────────────────────────────────────

async function setBotCommands(supabase: ReturnType<typeof createClient>, token: string) {
  const commands = [
    { command: 'start', description: 'Start the bot / quick actions' },
    { command: 'help', description: 'Show all commands' },
    { command: 'link', description: 'Link your store account' },
    { command: 'unlink', description: 'Unlink your Telegram' },
    { command: 'orders', description: 'Your recent orders' },
    { command: 'balance', description: 'Check wallet balance' },
    { command: 'track', description: 'Track an order by reference' },
  ];

  const adminCommands = [
    { command: 'pending', description: '[Admin] Pending recharges' },
    { command: 'approve', description: '[Admin] Approve a recharge' },
    { command: 'reject', description: '[Admin] Reject a recharge' },
    { command: 'stats', description: '[Admin] Store stats' },
    { command: 'broadcast', description: '[Admin] Send announcement' },
  ];

  const results: unknown[] = [await tgApi(token, 'setMyCommands', { commands })];

  // Admin commands are scoped to linked admins' private chats only.
  const { data: admins } = await supabase
    .from('profiles')
    .select('telegram_chat_id')
    .eq('role', 'admin')
    .not('telegram_chat_id', 'is', null);

  for (const a of admins ?? []) {
    if (!a.telegram_chat_id) continue;
    results.push(await tgApi(token, 'setMyCommands', {
      commands: [...commands, ...adminCommands],
      scope: { type: 'chat', chat_id: Number(a.telegram_chat_id) },
    }));
  }
  return results;
}

// ─── Webhook setup endpoint ─────────────────────────────────────────────────

async function setupWebhook(token: string, webhookUrl: string, secret: string) {
  const result = await tgApi(token, 'setWebhook', {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  });
  return result;
}

// ─── Main handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── GET: account linking (any logged-in user) + setup actions (admin only) ──
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const action = url.searchParams.get('action');
      const settings = await getStoreSettings(supabase);
      const token = settings?.telegram_bot_token?.trim();

      if (!token) {
        return json({ error: 'No bot token configured' }, 400);
      }

      // The function runs with verify_jwt = false (Telegram can't send one), so every
      // GET action verifies the caller's JWT with the auth server itself.
      const caller = await getVerifiedUser(supabase, req);
      if (!caller) {
        return json({ error: 'Authentication required' }, 401);
      }

      if (action === 'link-preview') {
        const previewToken = url.searchParams.get('token')?.trim() ?? '';
        if (!/^[0-9a-f]{32}$/i.test(previewToken)) {
          return json({ error: 'Invalid or expired link. Send /start to the bot again.' }, 400);
        }
        const { data: preview } = await supabase.rpc('peek_telegram_link_token', { p_token: previewToken });
        if (!preview?.ok) {
          return json({ error: 'Invalid or expired link. Send /start to the bot again.' }, 400);
        }
        return json({ ok: true, display_name: preview.display_name });
      }

      if (action === 'link') {
        const linkToken = url.searchParams.get('token')?.trim() ?? '';
        if (!/^[0-9a-f]{32}$/i.test(linkToken)) {
          return json({ error: 'Invalid or expired link. Send /start to the bot again.' }, 400);
        }

        const { data: result, error } = await supabase.rpc('consume_telegram_link_token', {
          p_token: linkToken,
          p_user_id: caller.id,
        });

        if (error) {
          console.error('link error:', error);
          return json({ error: 'Could not link your account. Please try again.' }, 500);
        }
        if (!result?.ok) {
          return json({
            error: result?.reason === 'chat_taken'
              ? 'This Telegram account is already linked to another user.'
              : result?.reason === 'already_linked'
              ? 'Your account already has a Telegram linked. Send /unlink in the bot first.'
              : 'Invalid or expired link. Send /start to the bot again.',
          }, result?.reason === 'chat_taken' || result?.reason === 'already_linked' ? 409 : 400);
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('username, name')
          .eq('id', caller.id)
          .maybeSingle();

        await sendMessage(token, Number(result.chat_id),
          `✅ <b>Account linked!</b>\n\n` +
          `Welcome, <b>${esc(profile?.username || profile?.name || 'User')}</b>.\n` +
          `You'll now receive order notifications here.`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '📦 My Orders', callback_data: 'my_orders' },
                  { text: '💰 My Balance', callback_data: 'my_balance' },
                ],
                [
                  { text: '🏠 Menu', callback_data: 'menu' },
                  { text: '🛒 Browse Store', url: STORE_URL },
                ],
              ],
            },
          },
        );

        return json({ ok: true, linked: true });
      }

      // Everything below changes bot configuration: admins only.
      if (!(await isAdminProfile(supabase, caller.id))) {
        return json({ error: 'Admin only' }, 403);
      }

      if (action === 'setup-webhook') {
        const secret = settings?.telegram_webhook_secret?.trim() || crypto.randomUUID();
        const webhookUrl = `${supabaseUrl}/functions/v1/telegram-bot`;

        if (!settings?.telegram_webhook_secret) {
          await supabase
            .from('store_settings')
            .update({ telegram_webhook_secret: secret })
            .eq('id', 1);
        }

        // The secret is never echoed back to the browser.
        const result = await setupWebhook(token, webhookUrl, secret);
        return json({ webhook: result });
      }

      if (action === 'set-commands') {
        const result = await setBotCommands(supabase, token);
        return json({ commands: result });
      }

      if (action === 'get-info') {
        const me = await tgApi(token, 'getMe', {});
        return json({ bot: me.result, webhook_secret_set: !!settings?.telegram_webhook_secret });
      }

      return json({ error: 'Unknown action' }, 400);
    }

    // ── POST: Telegram webhook ──
    // Fail closed: without a configured secret anyone could forge updates (e.g. admin approvals).
    // Telegram sends setWebhook's secret_token in X-Telegram-Bot-Api-Secret-Token.
    const webhookSecret = (
      req.headers.get('x-telegram-bot-api-secret-token')
      ?? req.headers.get('x-telegram-bot-secret')
    )?.trim() ?? '';
    const settings = await getStoreSettings(supabase);
    const expectedSecret = settings?.telegram_webhook_secret?.trim() ?? '';

    if (!expectedSecret) {
      return new Response('Webhook secret not configured', { status: 503 });
    }
    if (!timingSafeEqual(webhookSecret, expectedSecret)) {
      return new Response('Unauthorized', { status: 401 });
    }

    const token = settings?.telegram_bot_token?.trim();
    if (!token) {
      return new Response('No bot token', { status: 500 });
    }

    const update: TelegramUpdate = await req.json();

    const msg = update.message;
    const cb = update.callback_query;
    const from = cb?.from || msg?.from;
    const chat = cb?.message?.chat || msg?.chat;

    if (!from || !chat) {
      return new Response('ok');
    }

    // Ignore bot's own messages
    if (from.is_bot) {
      return new Response('ok');
    }

    const ctx: BotContext = {
      supabase,
      botToken: token,
      adminChatId: (settings?.telegram_chat_id ?? '').trim(),
      webhookSecret: expectedSecret,
      chatId: chat.id,
      userId: from.id,
      firstName: from.first_name || '',
      username: from.username || '',
      isAdmin: false,
      adminProfileId: null,
      isGroup: chat.type !== 'private',
      callbackQueryId: cb?.id,
      messageId: cb?.message?.message_id,
    };

    ctx.adminProfileId = await findAdminProfileId(supabase, ctx.userId);
    ctx.isAdmin = !!ctx.adminProfileId;

    // ── Handle callback query ──
    if (cb?.data) {
      await handleCallback(ctx, cb.data);
      return new Response('ok');
    }

    // ── Handle text message ──
    const text = msg?.text?.trim() || '';
    if (!text) {
      return new Response('ok');
    }

    // Parse command (supports /cmd@BotName in groups)
    const match = text.match(/^\/(\w+)(?:@\w+)?(?:\s+(.*))?$/s);
    if (!match) {
      if (!ctx.isGroup) {
        await sendMessage(token, ctx.chatId,
          `🤔 I'm not sure what you mean. Pick an option below or type /help.`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '📦 My Orders', callback_data: 'my_orders' },
                  { text: '💰 My Balance', callback_data: 'my_balance' },
                ],
                [{ text: '❓ Help', callback_data: 'show_help' }],
              ],
            },
          },
        );
      }
      return new Response('ok');
    }

    const [, cmd, rawArgs] = match;
    const args = rawArgs || '';

    switch (cmd.toLowerCase()) {
      case 'start':
      case 'menu':
        await cmdStart(ctx);
        break;
      case 'help':
        await cmdHelp(ctx);
        break;
      case 'link':
        await cmdLink(ctx);
        break;
      case 'unlink':
        await cmdUnlink(ctx);
        break;
      case 'balance':
        await cmdBalance(ctx);
        break;
      case 'orders':
        await cmdOrders(ctx);
        break;
      case 'track':
        await cmdTrack(ctx, args);
        break;
      // Admin commands
      case 'pending':
        await cmdPending(ctx);
        break;
      case 'approve':
        await cmdApprove(ctx, args);
        break;
      case 'reject':
        await cmdReject(ctx, args);
        break;
      case 'stats':
        await cmdStats(ctx);
        break;
      case 'broadcast':
        await cmdBroadcast(ctx, args);
        break;
      default:
        if (!ctx.isGroup) {
          await sendMessage(token, ctx.chatId, `Unknown command: /${esc(cmd)}. Type /help for available commands.`);
        }
    }

    return new Response('ok');
  } catch (err) {
    console.error('telegram-bot error:', err);
    return new Response('ok'); // Always 200 to Telegram to prevent retries
  }
});
