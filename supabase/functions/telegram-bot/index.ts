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
import { type Lang, type StringKey, langFromTelegram, tr } from './i18n.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-telegram-bot-secret',
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name?: string; username?: string; is_bot?: boolean; language_code?: string };
    chat: { id: number; type: string };
    text?: string;
    date: number;
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name?: string; username?: string; is_bot?: boolean; language_code?: string };
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
  /** Listed in the store's Telegram alert chats: may review/approve/reject recharges (nothing else). */
  isApprover: boolean;
  /** Who is acting (for the audit log), e.g. "Granger (@granger)". */
  actorLabel: string;
  adminProfileId: string | null;
  isGroup: boolean;
  callbackQueryId?: string;
  /** Message holding the tapped button — replies edit it in place. */
  messageId?: number;
  lang: Lang;
  /** In-progress purchase (telegram_chats.flow). */
  flow: Record<string, unknown> | null;
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
  if (back && !ctx.isGroup) rows.push([{ text: tr(ctx.lang, 'back'), callback_data: 'menu' }]);
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

/** Chat ids from the alert settings (comma / space / newline separated), numeric only. */
function parseChatIds(raw: string | null | undefined): string[] {
  return (raw ?? '').split(/[\s,;]+/).filter((x) => /^-?[0-9]+$/.test(x));
}

/** The account recorded as reviewer when an approver without an admin profile acts from Telegram. */
async function getPrimaryAdminProfileId(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
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

const T = (ctx: BotContext, key: StringKey, vars: Record<string, string | number> = {}) => tr(ctx.lang, key, vars);
const nameOf = (ctx: BotContext, en?: string | null, ar?: string | null) =>
  String((ctx.lang === 'ar' ? (ar || en) : (en || ar)) || '').trim();

async function saveChat(ctx: BotContext, patch: { lang?: Lang; flow?: Record<string, unknown> | null }) {
  if (patch.lang) ctx.lang = patch.lang;
  if ('flow' in patch) ctx.flow = patch.flow ?? null;
  await ctx.supabase.from('telegram_chats').upsert({
    chat_id: String(ctx.chatId),
    lang: ctx.lang,
    flow: ctx.flow,
    updated_at: new Date().toISOString(),
  });
}

/** Calls the g2bulk edge function as the server (checkPlayer, availability, fulfillOrder). */
async function callG2bulk(body: Record<string, unknown>, timeoutMs = 20000): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/g2bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return await res.json().catch(() => ({}));
  } catch (err) {
    console.error('g2bulk call failed', body.action, err);
    return { success: false, error: 'network' };
  }
}

function menuRows(ctx: BotContext): Array<Array<Record<string, string>>> {
  const rows: Array<Array<Record<string, string>>> = [
    [
      { text: T(ctx, 'btnGames'), callback_data: 'browse_games' },
      { text: T(ctx, 'btnVouchers'), callback_data: 'browse_vouchers' },
    ],
    [
      { text: T(ctx, 'btnBalance'), callback_data: 'my_balance' },
      { text: T(ctx, 'btnOrders'), callback_data: 'my_orders' },
    ],
    [
      { text: T(ctx, 'btnTrack'), callback_data: 'track_order' },
      { text: T(ctx, 'btnRecharge'), url: `${STORE_URL}/recharge` },
    ],
    [
      { text: T(ctx, 'btnStore'), url: STORE_URL },
      { text: T(ctx, 'btnSupport'), url: `${STORE_URL}/contact` },
    ],
    [
      { text: T(ctx, 'btnAccount'), callback_data: 'account' },
      { text: T(ctx, 'btnHelp'), callback_data: 'show_help' },
    ],
    [{ text: T(ctx, 'langButton'), callback_data: 'lang' }],
  ];
  if (ctx.isAdmin && !ctx.isGroup) {
    rows.push(
      [
        { text: T(ctx, 'btnStats'), callback_data: 'admin_stats' },
        { text: T(ctx, 'btnPending'), callback_data: 'admin_pending' },
      ],
      [
        { text: T(ctx, 'btnRecent'), callback_data: 'admin_recent' },
        { text: T(ctx, 'btnFailed'), callback_data: 'admin_failed' },
      ],
    );
  } else if (ctx.isApprover && !ctx.isGroup) {
    rows.push([{ text: T(ctx, 'btnPending'), callback_data: 'admin_pending' }]);
  }
  return rows;
}

async function cmdStart(ctx: BotContext) {
  const linked = await findUserByTelegramChat(ctx.supabase, ctx.chatId);
  if (ctx.flow) await saveChat(ctx, { flow: null });

  // A linked account never sees the "link" prompt again: straight to the menu.
  if (linked || ctx.isAdmin) {
    const name = linked?.username || linked?.name || ctx.firstName;
    await reply(ctx,
      `${T(ctx, 'welcomeBack', { name: esc(name) })}\n\n` +
      (linked ? `${T(ctx, 'balanceLine', { balance: money(linked.balance) })}\n\n` : '') +
      T(ctx, 'chooseOption'),
      { reply_markup: { inline_keyboard: menuRows(ctx) } },
      { back: false },
    );
  } else {
    await sendLinkPrompt(ctx, T(ctx, 'welcomeNew'));
  }
}

/** Sends the "Link My Account" button carrying a fresh single-use token. */
async function sendLinkPrompt(ctx: BotContext, intro: string) {
  if (ctx.isGroup) {
    await reply(ctx, T(ctx, 'linkPrivate'));
    return;
  }
  const displayName = [ctx.firstName, ctx.username ? `(@${ctx.username})` : ''].filter(Boolean).join(' ') || `Telegram ${ctx.userId}`;
  const token = await createLinkToken(ctx.supabase, ctx.chatId, displayName);
  const rows: Array<Array<Record<string, string>>> = [];
  if (token) {
    rows.push([{ text: T(ctx, 'linkButton'), url: `${STORE_URL}/telegram-link?token=${token}` }]);
  }
  rows.push(
    [
      { text: T(ctx, 'btnStore'), url: STORE_URL },
      { text: T(ctx, 'btnHelp'), callback_data: 'show_help' },
    ],
    [{ text: T(ctx, 'langButton'), callback_data: 'lang' }],
  );
  await reply(ctx,
    intro + (token ? T(ctx, 'linkTap') : T(ctx, 'linkFailed')),
    { reply_markup: { inline_keyboard: rows } },
    { back: false },
  );
}

async function cmdLang(ctx: BotContext) {
  await saveChat(ctx, { lang: ctx.lang === 'ar' ? 'en' : 'ar' });
  if (ctx.callbackQueryId) await answerCallback(ctx.botToken, ctx.callbackQueryId, T(ctx, 'langSet'));
  await cmdStart(ctx);
}

async function cmdHelp(ctx: BotContext) {
  await reply(ctx, (ctx.isAdmin ? T(ctx, 'helpAdmin') : '') + T(ctx, 'helpUser'));
}

async function cmdLink(ctx: BotContext) {
  // Linking requires logging in to the store through a single-use link.
  const linked = await findUserByTelegramChat(ctx.supabase, ctx.chatId);
  if (linked) {
    await reply(ctx, T(ctx, 'alreadyLinked', { name: esc(linked.username || linked.name) }));
    return;
  }
  await sendLinkPrompt(ctx, T(ctx, 'linkIntro'));
}

async function cmdUnlink(ctx: BotContext) {
  const user = await findUserByTelegramChat(ctx.supabase, ctx.chatId);
  if (!user) {
    await reply(ctx, T(ctx, 'notLinked'));
    return;
  }
  const { error } = await ctx.supabase
    .from('profiles')
    .update({ telegram_chat_id: null, telegram_linked_at: null })
    .eq('id', user.id);
  await reply(ctx, error ? T(ctx, 'unlinkFailed') : T(ctx, 'unlinked'), {}, { back: false });
}

async function cmdBalance(ctx: BotContext) {
  const user = await findUserByTelegramChat(ctx.supabase, ctx.chatId);
  if (!user) {
    await sendLinkPrompt(ctx, T(ctx, 'linkIntro'));
    return;
  }
  await reply(ctx,
    T(ctx, 'walletTitle', { balance: money(user.balance), name: esc(user.username || user.name) }),
    {
      reply_markup: {
        inline_keyboard: [[
          { text: T(ctx, 'btnRecharge'), url: `${STORE_URL}/recharge` },
          { text: T(ctx, 'btnOrders'), callback_data: 'my_orders' },
        ]],
      },
    },
  );
}

const ORDER_STATUS_EMOJI: Record<string, string> = {
  pending: '⏳',
  pending_payment: '⏳',
  completed: '✅',
  failed: '❌',
  fulfilling: '🔄',
  fulfilled: '🎉',
};

function statusLabel(ctx: BotContext, order: { status: string; fulfillment_status: string }) {
  const s = order.fulfillment_status || order.status;
  if (s === 'fulfilled') return T(ctx, 'stFulfilled');
  if (s === 'fulfilling') return T(ctx, 'stFulfilling');
  if (s === 'failed') return T(ctx, 'stFailed');
  if (order.status === 'completed') return T(ctx, 'stCompleted');
  if (order.status === 'pending_payment' || order.status === 'pending') return T(ctx, 'stPending');
  return esc(order.status);
}

function shortDate(ctx: BotContext, iso: string, withYear = false): string {
  return new Date(iso).toLocaleDateString(ctx.lang === 'ar' ? 'ar' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    ...(withYear ? { year: 'numeric' as const } : {}),
  });
}

async function cmdOrders(ctx: BotContext) {
  const user = await findUserByTelegramChat(ctx.supabase, ctx.chatId);
  if (!user) {
    await sendLinkPrompt(ctx, T(ctx, 'linkIntro'));
    return;
  }

  const { data: orders } = await ctx.supabase
    .from('orders')
    .select('id, order_ref, total, status, fulfillment_status, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5);

  if (!orders || orders.length === 0) {
    await reply(ctx, T(ctx, 'noOrders'), {
      reply_markup: { inline_keyboard: [[
        { text: T(ctx, 'btnGames'), callback_data: 'browse_games' },
        { text: T(ctx, 'btnVouchers'), callback_data: 'browse_vouchers' },
      ]] },
    });
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
      ? `\n   ${first.quantity ?? 1}× ${esc((first.name_snapshot ?? '—').slice(0, 60))}${its.length > 1 ? ` ${T(ctx, 'moreItems', { n: its.length - 1 })}` : ''}`
      : '';
    return `${emoji} <b>${esc(o.order_ref)}</b> — ${money(o.total)} · ${shortDate(ctx, o.created_at)}${productLine}`;
  });

  await reply(ctx,
    `${T(ctx, 'ordersTitle')}\n\n${lines.join('\n\n')}\n\n${T(ctx, 'tapOrder')}`,
    { reply_markup: { inline_keyboard: orders.map((o) => [{ text: `📍 ${o.order_ref}`, callback_data: `track:${o.id}` }]) } },
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
    T(ctx, 'orderTitle', { ref: esc(order.order_ref) }),
    ``,
    ...(items ? [items, ``] : []),
    `${T(ctx, 'status')}: <b>${statusLabel(ctx, order)}</b>`,
    `${T(ctx, 'amount')}: <b>${money(order.total)}</b>`,
    `${T(ctx, 'payment')}: ${esc(order.payment_method)}`,
    `${T(ctx, 'date')}: ${shortDate(ctx, order.created_at, true)}`,
  ];
  if (refunded) lines.push(``, T(ctx, 'refunded', { amount: money(order.total) }));

  const buttons: Array<Array<Record<string, string>>> = [];
  if (order.fulfillment_status === 'fulfilled') {
    buttons.push([{ text: T(ctx, 'btnInvoice'), url: `${STORE_URL}/invoice/order/${order.id}` }]);
  } else if (order.fulfillment_status === 'failed') {
    buttons.push([{ text: T(ctx, 'btnSupport'), url: `${STORE_URL}/contact` }]);
    if (ctx.isAdmin && !ctx.isGroup) {
      buttons.push([
        { text: T(ctx, 'btnRetry'), callback_data: `rt:${order.id}` },
        { text: T(ctx, 'btnRefund'), callback_data: `rf:${order.id}` },
      ]);
    }
  }
  buttons.push([{ text: T(ctx, 'btnOrders'), callback_data: 'my_orders' }]);

  await reply(ctx, lines.join('\n'), { reply_markup: { inline_keyboard: buttons } });
}

async function cmdTrack(ctx: BotContext, args: string) {
  const ref = args.trim();
  if (!ref) {
    await reply(ctx, T(ctx, 'trackHow'), {
      reply_markup: { inline_keyboard: [[{ text: T(ctx, 'btnOrders'), callback_data: 'my_orders' }]] },
    });
    return;
  }
  const { order, needsLink } = await loadVisibleOrder(ctx, { ref });
  if (needsLink) {
    await sendLinkPrompt(ctx, T(ctx, 'linkIntro'));
    return;
  }
  if (!order) {
    await reply(ctx, T(ctx, 'orderRefNotFound', { ref: esc(ref) }));
    return;
  }
  await sendOrderDetail(ctx, order);
}

// ─── Shop (buy with wallet balance) ─────────────────────────────────────────

const PACKS_PER_PAGE = 8;
const FLOW_TTL_MS = 15 * 60 * 1000;
const UID_RE = /^[A-Za-z0-9._\-]{2,30}$/;

function topupNeeds(fields: unknown) {
  const tokens = (Array.isArray(fields) ? fields : []).map((f) => String(f).toLowerCase().replace(/[\s_-]+/g, ''));
  return {
    server: tokens.some((t) => t.includes('server')),
    charname: tokens.some((t) => t.includes('charname') || t === 'character'),
  };
}

async function cmdBrowse(ctx: BotContext, kind: 'games' | 'vouchers') {
  let q = ctx.supabase
    .from('games')
    .select('id, slug, name_en, name_ar')
    .eq('active', true)
    .order('name_en', { ascending: true })
    .limit(60);
  q = kind === 'vouchers' ? q.eq('redemption_method', 'redeem_code') : q.neq('redemption_method', 'redeem_code');
  const { data: games } = await q;

  const ids = (games ?? []).map((g) => g.id);
  const { data: offerRows } = ids.length
    ? await ctx.supabase.from('offers').select('game_id').eq('active', true).in('game_id', ids)
    : { data: [] };
  const withOffers = new Set((offerRows ?? []).map((o) => o.game_id));
  const list = (games ?? []).filter((g) => withOffers.has(g.id));

  if (list.length === 0) {
    await reply(ctx, T(ctx, 'noneAvailable'));
    return;
  }
  const rows: Array<Array<Record<string, string>>> = [];
  for (let i = 0; i < list.length; i += 2) {
    rows.push(list.slice(i, i + 2).map((g) => ({
      text: nameOf(ctx, g.name_en, g.name_ar).slice(0, 30) || g.slug,
      callback_data: `bg:${g.id}:0`,
    })));
  }
  await reply(ctx, kind === 'vouchers' ? T(ctx, 'vouchersTitle') : T(ctx, 'gamesTitle'),
    { reply_markup: { inline_keyboard: rows } });
}

async function cmdPacks(ctx: BotContext, gameId: string, page: number) {
  const { data: game } = await ctx.supabase
    .from('games')
    .select('id, slug, name_en, name_ar, redemption_method, topup_fields, active')
    .eq('id', gameId)
    .maybeSingle();
  if (!game || !game.active) {
    await reply(ctx, T(ctx, 'noPacks'));
    return;
  }
  const gameName = esc(nameOf(ctx, game.name_en, game.name_ar));
  const storeRow = [{ text: T(ctx, 'btnOpenInStore'), url: `${STORE_URL}/game/${game.slug}` }];

  if (game.redemption_method !== 'redeem_code' && topupNeeds(game.topup_fields).charname) {
    await reply(ctx, T(ctx, 'websiteOnly', { game: gameName }), { reply_markup: { inline_keyboard: [storeRow] } });
    return;
  }

  const { data: offers } = await ctx.supabase
    .from('offers')
    .select('id, name_en, name_ar, price')
    .eq('game_id', gameId)
    .eq('active', true)
    .order('price', { ascending: true });
  if (!offers || offers.length === 0) {
    await reply(ctx, T(ctx, 'noPacks'), { reply_markup: { inline_keyboard: [storeRow] } });
    return;
  }

  const pages = Math.ceil(offers.length / PACKS_PER_PAGE);
  const p = Math.min(Math.max(0, page), pages - 1);
  const rows: Array<Array<Record<string, string>>> = offers
    .slice(p * PACKS_PER_PAGE, (p + 1) * PACKS_PER_PAGE)
    .map((o) => [{
      text: `${nameOf(ctx, o.name_en, o.name_ar).slice(0, 40)} — ${money(Number(o.price))}`,
      callback_data: `bo:${o.id}`,
    }]);
  const nav: Array<Record<string, string>> = [];
  if (p > 0) nav.push({ text: T(ctx, 'btnPrev'), callback_data: `bg:${gameId}:${p - 1}` });
  if (p < pages - 1) nav.push({ text: T(ctx, 'btnNext'), callback_data: `bg:${gameId}:${p + 1}` });
  if (nav.length) rows.push(nav);
  rows.push(storeRow);

  await reply(ctx,
    T(ctx, 'packsTitle', { game: gameName }) + (pages > 1 ? `  (${p + 1}/${pages})` : ''),
    { reply_markup: { inline_keyboard: rows } });
}

/** Step 1: a pack was chosen. Vouchers go straight to confirm; top-ups ask for the player ID. */
async function cmdPickOffer(ctx: BotContext, offerId: string) {
  const user = await findUserByTelegramChat(ctx.supabase, ctx.chatId);
  if (!user) {
    await sendLinkPrompt(ctx, T(ctx, 'linkIntro'));
    return;
  }
  const { data: quote } = await ctx.supabase.rpc('telegram_quote_offer', { p_user_id: user.id, p_offer_id: offerId });
  if (!quote?.ok) {
    await reply(ctx, T(ctx, 'errUnavailable'));
    return;
  }
  const flow: Record<string, unknown> = {
    offerId,
    gameId: quote.game_id,
    game: nameOf(ctx, quote.game_en, quote.game_ar),
    pack: nameOf(ctx, quote.offer_en, quote.offer_ar),
    isVoucher: !!quote.is_voucher,
    at: Date.now(),
  };
  if (quote.is_voucher) {
    await showConfirm(ctx, flow);
    return;
  }
  flow.step = 'uid';
  await saveChat(ctx, { flow });
  await reply(ctx,
    T(ctx, 'askUid', { game: esc(String(flow.game)), pack: esc(String(flow.pack)) }),
    { reply_markup: { inline_keyboard: [[{ text: T(ctx, 'cancel'), callback_data: 'bx' }]] } },
    { back: false },
  );
}

/** Step 2/3: typed player ID / server. */
async function handleFlowText(ctx: BotContext, text: string) {
  const flow = { ...(ctx.flow || {}) } as Record<string, unknown>;
  const value = text.trim();
  if (!UID_RE.test(value)) {
    await reply(ctx, T(ctx, 'badUid'),
      { reply_markup: { inline_keyboard: [[{ text: T(ctx, 'cancel'), callback_data: 'bx' }]] } }, { back: false });
    return;
  }

  if (flow.step === 'uid') {
    flow.uid = value;
    const { data: game } = await ctx.supabase
      .from('games').select('topup_fields, servers').eq('id', String(flow.gameId)).maybeSingle();
    if (topupNeeds(game?.topup_fields).server) {
      const servers = Array.isArray(game?.servers) ? game.servers as Array<{ id?: string; label?: string }> : [];
      if (servers.length > 0 && servers.length <= 24) {
        flow.step = 'server_pick';
        await saveChat(ctx, { flow });
        const rows: Array<Array<Record<string, string>>> = [];
        for (let i = 0; i < servers.length; i += 2) {
          rows.push(servers.slice(i, i + 2).map((s, j) => ({
            text: String(s.label || s.id).slice(0, 30),
            callback_data: `bs:${i + j}`,
          })));
        }
        rows.push([{ text: T(ctx, 'cancel'), callback_data: 'bx' }]);
        await reply(ctx, T(ctx, 'chooseServer'), { reply_markup: { inline_keyboard: rows } }, { back: false });
        return;
      }
      flow.step = 'server';
      await saveChat(ctx, { flow });
      await reply(ctx, T(ctx, 'askServer'),
        { reply_markup: { inline_keyboard: [[{ text: T(ctx, 'cancel'), callback_data: 'bx' }]] } }, { back: false });
      return;
    }
    await verifyPlayerAndConfirm(ctx, flow);
    return;
  }

  if (flow.step === 'server') {
    flow.server = value;
    await verifyPlayerAndConfirm(ctx, flow);
  }
}

async function cmdPickServer(ctx: BotContext, index: number) {
  const flow = { ...(ctx.flow || {}) } as Record<string, unknown>;
  if (flow.step !== 'server_pick') return;
  const { data: game } = await ctx.supabase
    .from('games').select('servers').eq('id', String(flow.gameId)).maybeSingle();
  const servers = Array.isArray(game?.servers) ? game.servers as Array<{ id?: string; label?: string }> : [];
  const s = servers[index];
  if (!s?.id) return;
  flow.server = String(s.id);
  flow.serverLabel = String(s.label || s.id);
  await verifyPlayerAndConfirm(ctx, flow);
}

async function verifyPlayerAndConfirm(ctx: BotContext, flow: Record<string, unknown>) {
  const { data: game } = await ctx.supabase
    .from('games').select('g2bulk_game_code, slug').eq('id', String(flow.gameId)).maybeSingle();
  const check = await callG2bulk({
    action: 'checkPlayer',
    game: game?.g2bulk_game_code || game?.slug,
    user_id: flow.uid,
    server_id: flow.server || undefined,
  });
  const valid = check?.valid;
  if (valid === 'invalid' || valid === false || valid === 'false') {
    flow.step = 'uid';
    delete flow.server;
    await saveChat(ctx, { flow });
    await reply(ctx, T(ctx, 'uidInvalid'),
      { reply_markup: { inline_keyboard: [[{ text: T(ctx, 'cancel'), callback_data: 'bx' }]] } }, { back: false });
    return;
  }
  const nick = String(check?.name || check?.player_name || check?.nickname || check?.username || '').trim();
  if (nick) flow.playerName = nick.slice(0, 40);
  await showConfirm(ctx, flow);
}

async function showConfirm(ctx: BotContext, flow: Record<string, unknown>) {
  const user = await findUserByTelegramChat(ctx.supabase, ctx.chatId);
  if (!user) {
    await sendLinkPrompt(ctx, T(ctx, 'linkIntro'));
    return;
  }
  const { data: quote } = await ctx.supabase.rpc('telegram_quote_offer', { p_user_id: user.id, p_offer_id: String(flow.offerId) });
  if (!quote?.ok) {
    await saveChat(ctx, { flow: null });
    await reply(ctx, T(ctx, 'errUnavailable'));
    return;
  }
  const price = Number(quote.price);
  const balance = Number(user.balance ?? 0);
  flow.step = 'confirm';
  flow.price = price;
  flow.key = crypto.randomUUID();
  flow.at = Date.now();
  await saveChat(ctx, { flow });

  const lines = [
    T(ctx, 'confirmTitle'),
    ``,
    `${T(ctx, 'product')}: <b>${esc(String(flow.game))}</b>`,
    `${T(ctx, 'pack')}: <b>${esc(String(flow.pack))}</b>`,
  ];
  if (flow.uid) lines.push(`${T(ctx, 'playerId')}: <code>${esc(String(flow.uid))}</code>`);
  if (flow.server) lines.push(`${T(ctx, 'server')}: <code>${esc(String(flow.serverLabel || flow.server))}</code>`);
  if (flow.playerName) lines.push(`${T(ctx, 'playerName')}: <b>${esc(String(flow.playerName))}</b>`);
  lines.push(
    ``,
    `${T(ctx, 'price')}: <b>${money(price)}</b>`,
    `${T(ctx, 'balanceNow')}: ${money(balance)}`,
  );

  const rows: Array<Array<Record<string, string>>> = [];
  if (balance + 1e-9 < price) {
    lines.push(``, T(ctx, 'notEnough'));
    rows.push([{ text: T(ctx, 'btnRecharge'), url: `${STORE_URL}/recharge` }]);
  } else {
    lines.push(`${T(ctx, 'balanceAfter')}: <b>${money(balance - price)}</b>`);
    rows.push([{ text: T(ctx, 'confirmBtn', { price: money(price) }), callback_data: 'bc' }]);
  }
  rows.push([{ text: T(ctx, 'cancel'), callback_data: 'bx' }]);
  await reply(ctx, lines.join('\n'), { reply_markup: { inline_keyboard: rows } }, { back: false });
}

function orderErrorKey(message: string): StringKey {
  const m = message.toLowerCase();
  if (m.includes('insufficient balance')) return 'errInsufficient';
  if (m.includes('already in progress')) return 'errDuplicate';
  if (m.includes('banned') || m.includes('suspended')) return 'errBanned';
  if (m.includes('admins cannot')) return 'errAdmin';
  if (m.includes('inactive') || m.includes('unavailable') || m.includes('below supplier') || m.includes('not found')) return 'errUnavailable';
  return 'errGeneric';
}

/** Step 4: confirmed. One tap = one order (flow is taken atomically; idempotency key on the order). */
async function cmdConfirm(ctx: BotContext) {
  const flow = ctx.flow as Record<string, unknown> | null;
  if (!flow || flow.step !== 'confirm' || !flow.key) return;
  if (Date.now() - Number(flow.at || 0) > FLOW_TTL_MS) {
    await saveChat(ctx, { flow: null });
    await reply(ctx, T(ctx, 'expired'));
    return;
  }

  // Take the flow: a second tap finds nothing and does nothing.
  const { data: taken } = await ctx.supabase
    .from('telegram_chats')
    .update({ flow: null, updated_at: new Date().toISOString() })
    .eq('chat_id', String(ctx.chatId))
    .eq('flow->>key', String(flow.key))
    .select('chat_id');
  if (!taken || taken.length === 0) return;
  ctx.flow = null;

  const user = await findUserByTelegramChat(ctx.supabase, ctx.chatId);
  if (!user) {
    await sendLinkPrompt(ctx, T(ctx, 'linkIntro'));
    return;
  }

  await reply(ctx, T(ctx, 'placing'), {}, { back: false });

  // Same pre-check as the website: never charge for something the supplier can't deliver now.
  const avail = await callG2bulk({
    action: 'checkFulfillmentAvailability',
    items: [{ offer_id: flow.offerId, quantity: 1, player_uid: flow.uid || null }],
  });
  if (avail?.available === false) {
    await reply(ctx, T(ctx, 'errUnavailable'));
    return;
  }

  const { data: order, error } = await ctx.supabase.rpc('telegram_create_order', {
    p_user_id: user.id,
    p_offer_id: String(flow.offerId),
    p_player_uid: flow.uid ? String(flow.uid) : null,
    p_player_server: flow.server ? String(flow.server) : null,
    p_idempotency_key: String(flow.key),
  });
  if (error || !order?.orderId) {
    console.error('telegram_create_order failed:', error?.message);
    await reply(ctx, T(ctx, orderErrorKey(String(error?.message || ''))));
    return;
  }

  const { data: orderRow } = await ctx.supabase
    .from('orders').select('order_ref').eq('id', order.orderId).maybeSingle();
  const ref = orderRow?.order_ref || String(order.orderId).slice(0, 8);

  await reply(ctx,
    T(ctx, 'placed', { ref: esc(ref), price: money(Number(flow.price)), balance: money(Number(order.newBalance)) }),
    { reply_markup: { inline_keyboard: [[{ text: `📍 ${ref}`, callback_data: `track:${order.orderId}` }]] } });

  // Deliver in the background (Telegram must get its 200 quickly).
  const job = (async () => {
    const result = await callG2bulk({ action: 'fulfillOrder', orderId: order.orderId }, 140000);
    const codes = Array.isArray(result?.deliveryItems) ? (result.deliveryItems as unknown[]).map(String) : [];
    if (flow.isVoucher && codes.length) {
      await sendMessage(ctx.botToken, ctx.chatId,
        T(ctx, 'codesTitle', { ref: esc(ref), codes: codes.map((c) => `<code>${esc(c)}</code>`).join('\n') }),
        { reply_markup: { inline_keyboard: [[{ text: T(ctx, 'btnInvoice'), url: `${STORE_URL}/invoice/order/${order.orderId}` }]] } });
    }
  })();
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(job); else await job;
}

async function cmdCancelFlow(ctx: BotContext) {
  await saveChat(ctx, { flow: null });
  await cmdStart(ctx);
}

// ─── Admin command handlers ─────────────────────────────────────────────────

/** Reviewing recharges: linked admins and anyone listed in the alert chats, in a private chat. */
async function requireApprover(ctx: BotContext): Promise<boolean> {
  if ((!ctx.isAdmin && !ctx.isApprover) || !ctx.adminProfileId) {
    await reply(ctx, T(ctx, 'adminOnly'));
    return false;
  }
  if (ctx.isGroup) {
    await reply(ctx, T(ctx, 'adminPrivate'));
    return false;
  }
  return true;
}

/** Admin commands only run for a linked admin, in a private chat. */
async function requireAdmin(ctx: BotContext): Promise<boolean> {
  if (!ctx.isAdmin || !ctx.adminProfileId) {
    await reply(ctx, T(ctx, 'adminOnly'));
    return false;
  }
  if (ctx.isGroup) {
    await reply(ctx, T(ctx, 'adminPrivate'));
    return false;
  }
  return true;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function cmdPending(ctx: BotContext) {
  if (!(await requireApprover(ctx))) return;

  const { data: recharges } = await ctx.supabase
    .from('recharge_requests')
    .select('id, user_id, amount, reference, payment_method, status, created_at, payment_txn_ref, payment_proof_path')
    .in('status', ['pending', 'payment_sent'])
    .order('created_at', { ascending: true })
    .limit(10);

  if (!recharges || recharges.length === 0) {
    await reply(ctx, T(ctx, 'noPending'));
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
    const name = p?.username || p?.name || '—';
    const date = new Date(r.created_at).toLocaleString(ctx.lang === 'ar' ? 'ar' : 'en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const proof = [r.payment_txn_ref ? `<code>${esc(r.payment_txn_ref)}</code>` : '', r.payment_proof_path ? '🧾' : ''].filter(Boolean).join(' ');
    return `${i + 1}. <b>${esc(name)}</b> — ${money(r.amount)} · ${date}\n   <code>${esc(r.reference)}</code>${proof ? `\n   ${proof}` : ''}`;
  });

  await reply(ctx,
    `${T(ctx, 'pendingTitle', { n: recharges.length })}\n\n${lines.join('\n\n')}`,
    {
      reply_markup: {
        inline_keyboard: [
          ...recharges.map((r, i) => [
            { text: T(ctx, 'approveBtn', { i: i + 1, amount: money(r.amount) }), callback_data: `approve:${r.id}` },
            { text: T(ctx, 'rejectBtn', { i: i + 1 }), callback_data: `reject:${r.id}` },
          ]),
          [{ text: T(ctx, 'btnDashboard'), url: `${STORE_URL}/dashboard/recharges` }],
        ],
      },
    },
  );
}

async function langForChat(ctx: BotContext, chatId: string): Promise<Lang> {
  const { data } = await ctx.supabase.from('telegram_chats').select('lang').eq('chat_id', chatId).maybeSingle();
  return (data?.lang === 'en' ? 'en' : 'ar');
}

async function cmdApprove(ctx: BotContext, args: string) {
  if (!(await requireApprover(ctx))) return;
  const id = args.trim();
  if (!id) {
    await reply(ctx, T(ctx, 'approveUsage'));
    return;
  }
  if (!UUID_RE.test(id)) {
    await reply(ctx, T(ctx, 'invalidId'));
    return;
  }

  // Row-locked, atomic credit (same rules as the dashboard).
  const { data, error } = await ctx.supabase.rpc('telegram_approve_recharge', {
    p_request_id: id,
    p_admin_id: ctx.adminProfileId,
    p_actor: ctx.actorLabel || null,
  });
  if (error || !data) {
    console.error('approve error:', error);
    await reply(ctx, T(ctx, String(error?.message || '').includes('txn_ref_already_approved') ? 'approveTxnUsed' : 'approveFailed'), { reply_markup: { inline_keyboard: [[{ text: T(ctx, 'btnPending'), callback_data: 'admin_pending' }]] } });
    return;
  }
  const result = data as { userId: string; amount: number; newBalance: number };

  // The customer DM is sent by the recharge_requests status trigger (covers dashboard + bot).

  await reply(ctx,
    T(ctx, 'approved', { amount: money(result.amount), balance: money(result.newBalance) }),
    { reply_markup: { inline_keyboard: [[{ text: T(ctx, 'btnPending'), callback_data: 'admin_pending' }]] } });
}

async function cmdReject(ctx: BotContext, args: string) {
  if (!(await requireApprover(ctx))) return;
  const id = args.trim();
  if (!id) {
    await reply(ctx, T(ctx, 'rejectUsage'));
    return;
  }
  if (!UUID_RE.test(id)) {
    await reply(ctx, T(ctx, 'invalidId'));
    return;
  }

  const { data, error } = await ctx.supabase.rpc('telegram_reject_recharge', {
    p_request_id: id,
    p_admin_id: ctx.adminProfileId,
    p_actor: ctx.actorLabel || null,
  });
  if (error || !data) {
    console.error('reject error:', error);
    await reply(ctx, T(ctx, 'rejectFailed'), { reply_markup: { inline_keyboard: [[{ text: T(ctx, 'btnPending'), callback_data: 'admin_pending' }]] } });
    return;
  }
  const result = data as { userId: string; amount: number };

  // The customer DM is sent by the recharge_requests status trigger (covers dashboard + bot).

  await reply(ctx, T(ctx, 'rejected'),
    { reply_markup: { inline_keyboard: [[{ text: T(ctx, 'btnPending'), callback_data: 'admin_pending' }]] } });
}

async function cmdStats(ctx: BotContext) {
  if (!(await requireAdmin(ctx))) return;
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const [ordersRes, usersRes, revenueRes, pendingRes, todayRes] = await Promise.all([
    ctx.supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
    ctx.supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'user'),
    ctx.supabase.from('orders').select('total').eq('status', 'completed'),
    ctx.supabase.from('recharge_requests').select('id', { count: 'exact', head: true }).in('status', ['pending', 'payment_sent']),
    ctx.supabase.from('orders').select('total').eq('status', 'completed').gte('created_at', dayStart.toISOString()),
  ]);
  const sum = (rows: Array<{ total: number }> | null) => (rows ?? []).reduce((s, o) => s + Number(o.total ?? 0), 0);
  const pendingCount = pendingRes.count ?? 0;

  await reply(ctx,
    T(ctx, 'statsTitle', {
      users: usersRes.count ?? 0,
      orders: ordersRes.count ?? 0,
      revenue: money(sum(revenueRes.data)),
      todayOrders: (todayRes.data ?? []).length,
      todayRevenue: money(sum(todayRes.data)),
      pending: pendingCount,
    }),
    {
      reply_markup: {
        inline_keyboard: [
          ...(pendingCount > 0 ? [[{ text: T(ctx, 'viewPending', { n: pendingCount }), callback_data: 'admin_pending' }]] : []),
          [{ text: T(ctx, 'btnDashboard'), url: `${STORE_URL}/dashboard` }],
        ],
      },
    },
  );
}

async function cmdBroadcast(ctx: BotContext, args: string) {
  if (!(await requireAdmin(ctx))) return;
  const msg = args.trim();
  if (!msg) {
    await reply(ctx, T(ctx, 'broadcastUsage'));
    return;
  }

  const { data: users } = await ctx.supabase
    .from('profiles')
    .select('id, telegram_chat_id')
    .eq('role', 'user')
    .not('telegram_chat_id', 'is', null);
  if (!users || users.length === 0) {
    await reply(ctx, T(ctx, 'noLinkedUsers'));
    return;
  }

  let sent = 0;
  let failed = 0;
  for (const u of users) {
    if (!u.telegram_chat_id) continue;
    const cl = await langForChat(ctx, String(u.telegram_chat_id));
    // sendMessage never throws: count by Telegram's ok flag. Pace sends (~20/s) to stay under limits.
    const res = await sendMessage(ctx.botToken, Number(u.telegram_chat_id),
      `${tr(cl, 'announcement')}\n\n${esc(msg)}`,
      { reply_markup: { inline_keyboard: [[{ text: tr(cl, 'btnStore'), url: STORE_URL }]] } },
    );
    if (res?.ok) sent++; else failed++;
    await new Promise((r) => setTimeout(r, 50));
  }
  await reply(ctx, T(ctx, 'broadcastDone', { sent, failed: failed ? ` ✖ ${failed}` : '' }));
}

// ─── Menu screens ───────────────────────────────────────────────────────────

async function cmdAccount(ctx: BotContext) {
  const user = await findUserByTelegramChat(ctx.supabase, ctx.chatId);
  if (!user) {
    await sendLinkPrompt(ctx, T(ctx, 'linkIntro'));
    return;
  }
  await reply(ctx,
    T(ctx, 'accountTitle', { name: esc(user.username || user.name), balance: money(user.balance) }),
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: T(ctx, 'btnProfile'), url: `${STORE_URL}/profile` }],
          [{ text: T(ctx, 'langButton'), callback_data: 'lang' }],
          [{ text: T(ctx, 'btnUnlink'), callback_data: 'unlink_ask' }],
        ],
      },
    },
  );
}

async function cmdUnlinkAsk(ctx: BotContext) {
  await reply(ctx, T(ctx, 'unlinkAsk'), {
    reply_markup: {
      inline_keyboard: [[
        { text: T(ctx, 'btnUnlinkYes'), callback_data: 'unlink_yes' },
        { text: T(ctx, 'cancel'), callback_data: 'account' },
      ]],
    },
  });
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
    await reply(ctx, failedOnly ? T(ctx, 'noFailed') : T(ctx, 'noOrdersAdmin'));
    return;
  }
  const lines = orders.map((o) => {
    const emoji = ORDER_STATUS_EMOJI[o.fulfillment_status] || ORDER_STATUS_EMOJI[o.status] || '❓';
    return `${emoji} <b>${esc(o.order_ref)}</b> — ${money(o.total)} · ${shortDate(ctx, o.created_at)}`;
  });
  await reply(ctx,
    `${failedOnly ? T(ctx, 'failedTitle') : T(ctx, 'recentTitle')}\n\n${lines.join('\n')}`,
    {
      reply_markup: {
        inline_keyboard: [
          ...orders.map((o) => [{ text: `📍 ${o.order_ref}`, callback_data: `track:${o.id}` }]),
          [{ text: T(ctx, 'btnDashboard'), url: `${STORE_URL}/dashboard/orders` }],
        ],
      },
    },
  );
}

// ─── Admin: retry fulfilment / refund a failed order ───────────────
// Both actions need an explicit confirm tap and only work for a linked admin in a private chat.
// Internal error text is never shown; the checks mirror the dashboard and the SQL refund path.

type AdminOrder = {
  id: string; order_ref: string; total: number; status: string; payment_method: string;
  fulfillment_status: string | null; g2bulk_order_id: string | null; g2bulk_metadata: unknown; user_id: string | null;
};

async function loadAdminOrder(ctx: BotContext, id: string): Promise<AdminOrder | null> {
  const { data } = await ctx.supabase
    .from('orders')
    .select('id, order_ref, total, status, payment_method, fulfillment_status, g2bulk_order_id, g2bulk_metadata, user_id')
    .eq('id', id)
    .maybeSingle();
  return (data as AdminOrder | null) ?? null;
}

/** Decides what a retry would do. Mirrors canRetryOrderFulfillment() in the dashboard (stricter: no timed in-flight restarts). */
function retryPlan(order: AdminOrder): { ok: false; key: StringKey } | { ok: true; mode: 'poll' | 'purchase' } {
  const meta = (order.g2bulk_metadata || {}) as Record<string, unknown>;
  if (meta.balance_refunded === true || meta.balance_refunded === 'true') return { ok: false, key: 'retryBlockedRefunded' };
  if (meta.do_not_refulfill === true || meta.free_after_refund === true) return { ok: false, key: 'retryBlockedLocked' };
  if (order.status !== 'completed') return { ok: false, key: 'retryNotPaid' };
  const fs = order.fulfillment_status || 'pending';
  if (fs === 'fulfilled' || fs === 'skipped') return { ok: false, key: 'retryAlreadyDone' };
  const supplierId = order.g2bulk_order_id || meta.g2bulk_order_id || meta.g2bulkOrderId;
  // A known supplier order => poll only, never a second purchase.
  if (supplierId) return { ok: true, mode: 'poll' };
  if (fs === 'failed') return { ok: true, mode: 'purchase' };
  return { ok: false, key: 'retryNoSupplier' };
}

function backToOrderRow(ctx: BotContext, orderId: string) {
  return [{ text: T(ctx, 'btnBackOrder'), callback_data: `track:${orderId}` }];
}

async function cmdRetryAsk(ctx: BotContext, orderId: string) {
  if (!(await requireAdmin(ctx))) return;
  if (!UUID_RE.test(orderId)) return;
  const order = await loadAdminOrder(ctx, orderId);
  if (!order) { await reply(ctx, T(ctx, 'orderNotFound')); return; }

  const plan = retryPlan(order);
  if (!plan.ok) {
    await reply(ctx, T(ctx, plan.key), { reply_markup: { inline_keyboard: [backToOrderRow(ctx, order.id)] } });
    return;
  }
  await reply(ctx,
    T(ctx, plan.mode === 'poll' ? 'retryConfirmPoll' : 'retryConfirmPurchase', {
      ref: esc(order.order_ref), amount: money(order.total),
    }),
    { reply_markup: { inline_keyboard: [
      [{ text: T(ctx, 'btnConfirmRetry'), callback_data: `rtc:${order.id}` }],
      backToOrderRow(ctx, order.id),
    ] } });
}

async function cmdRetryRun(ctx: BotContext, orderId: string) {
  if (!(await requireAdmin(ctx))) return;
  if (!UUID_RE.test(orderId)) return;
  // Re-check at execution time: state may have changed since the confirm screen.
  const order = await loadAdminOrder(ctx, orderId);
  if (!order) { await reply(ctx, T(ctx, 'orderNotFound')); return; }
  const plan = retryPlan(order);
  if (!plan.ok) {
    await reply(ctx, T(ctx, plan.key), { reply_markup: { inline_keyboard: [backToOrderRow(ctx, order.id)] } });
    return;
  }

  const res = await callG2bulk({
    action: 'fulfillOrder',
    orderId: order.id,
    ...(plan.mode === 'poll' ? { pollOnly: true, mode: 'poll' } : {}),
  }, 55000);

  await ctx.supabase.rpc('try_append_site_log', {
    p_category: 'order',
    p_event_type: 'retry_via_telegram',
    p_severity: 'info',
    p_subject_user_id: order.user_id,
    p_actor_user_id: ctx.adminProfileId,
    p_metadata: { orderId: order.id, orderRef: order.order_ref, mode: plan.mode, accepted: res?.success !== false },
  });

  if (res?.success === false) {
    await reply(ctx, T(ctx, 'retryFailed'), { reply_markup: { inline_keyboard: [backToOrderRow(ctx, order.id)] } });
    return;
  }
  await reply(ctx, T(ctx, 'retryStarted', { ref: esc(order.order_ref) }),
    { reply_markup: { inline_keyboard: [backToOrderRow(ctx, order.id)] } });
}

const REFUND_ERROR_KEYS: Record<string, StringKey> = {
  refund_already: 'refundAlready',
  refund_not_failed: 'refundNotFailed',
  refund_not_balance: 'refundNotBalance',
  refund_delivered: 'refundDelivered',
  refund_locked: 'refundLocked',
  refund_not_found: 'orderNotFound',
};

function refundErrorKey(message: string | undefined): StringKey {
  const hit = Object.keys(REFUND_ERROR_KEYS).find((k) => (message || '').includes(k));
  return hit ? REFUND_ERROR_KEYS[hit] : 'refundFailed';
}

async function cmdRefundAsk(ctx: BotContext, orderId: string) {
  if (!(await requireAdmin(ctx))) return;
  if (!UUID_RE.test(orderId)) return;
  const order = await loadAdminOrder(ctx, orderId);
  if (!order) { await reply(ctx, T(ctx, 'orderNotFound')); return; }

  const meta = (order.g2bulk_metadata || {}) as Record<string, unknown>;
  let blocked: StringKey | null = null;
  if (meta.balance_refunded === true || meta.balance_refunded === 'true') blocked = 'refundAlready';
  else if (order.status !== 'completed' || order.fulfillment_status !== 'failed') blocked = 'refundNotFailed';
  else if (order.payment_method !== 'balance' || !order.user_id) blocked = 'refundNotBalance';
  if (blocked) {
    await reply(ctx, T(ctx, blocked), { reply_markup: { inline_keyboard: [backToOrderRow(ctx, order.id)] } });
    return;
  }
  await reply(ctx,
    T(ctx, 'refundConfirm', { ref: esc(order.order_ref), amount: money(order.total) }),
    { reply_markup: { inline_keyboard: [
      [{ text: T(ctx, 'btnConfirmRefund'), callback_data: `rfc:${order.id}` }],
      backToOrderRow(ctx, order.id),
    ] } });
}

async function cmdRefundRun(ctx: BotContext, orderId: string) {
  if (!(await requireAdmin(ctx))) return;
  if (!UUID_RE.test(orderId)) return;

  // Row-locked in SQL; the FULFILL-REFUND reference makes a double tap harmless.
  const { data, error } = await ctx.supabase.rpc('telegram_refund_failed_order', {
    p_order_id: orderId,
    p_admin_id: ctx.adminProfileId,
  });
  if (error || !data) {
    console.error('refund error:', error?.message);
    await reply(ctx, T(ctx, refundErrorKey(error?.message)), {
      reply_markup: { inline_keyboard: [backToOrderRow(ctx, orderId)] },
    });
    return;
  }
  const r = data as { orderRef: string; amount: number; newBalance: number };
  await reply(ctx,
    T(ctx, 'refundDone', { ref: esc(r.orderRef), amount: money(r.amount), balance: money(r.newBalance) }),
    { reply_markup: { inline_keyboard: [backToOrderRow(ctx, orderId)] } });
}

// ─── Callback query handler ─────────────────────────────────────────────────

async function handleCallback(ctx: BotContext, data: string) {
  // Acknowledge so the button spinner clears (the language toggle shows its own toast).
  if (data !== 'lang') await answerCallback(ctx.botToken, ctx.callbackQueryId!);

  if (data === 'menu') await cmdStart(ctx);
  else if (data === 'lang') await cmdLang(ctx);
  else if (data === 'my_balance') await cmdBalance(ctx);
  else if (data === 'my_orders') await cmdOrders(ctx);
  else if (data === 'link_account') await cmdLink(ctx);
  else if (data === 'show_help') await cmdHelp(ctx);
  else if (data === 'account') await cmdAccount(ctx);
  else if (data === 'unlink_ask') await cmdUnlinkAsk(ctx);
  else if (data === 'unlink_yes') await cmdUnlink(ctx);
  else if (data === 'browse_games') await cmdBrowse(ctx, 'games');
  else if (data === 'browse_vouchers') await cmdBrowse(ctx, 'vouchers');
  else if (data === 'track_order') {
    await reply(ctx, T(ctx, 'trackHow'), {
      reply_markup: { inline_keyboard: [[{ text: T(ctx, 'btnOrders'), callback_data: 'my_orders' }]] },
    });
  }
  else if (data === 'admin_pending') await cmdPending(ctx);
  else if (data === 'admin_stats') await cmdStats(ctx);
  else if (data === 'admin_recent' || data === 'admin_failed') await cmdAdminOrders(ctx, data === 'admin_failed');
  else if (data.startsWith('bg:')) {
    const [, gameId, page] = data.split(':');
    if (UUID_RE.test(gameId)) await cmdPacks(ctx, gameId, Number(page) || 0);
  }
  else if (data.startsWith('bo:')) {
    const offerId = data.slice(3);
    if (UUID_RE.test(offerId)) await cmdPickOffer(ctx, offerId);
  }
  else if (data.startsWith('bs:')) await cmdPickServer(ctx, Number(data.slice(3)));
  else if (data === 'bc') await cmdConfirm(ctx);
  else if (data === 'bx') await cmdCancelFlow(ctx);
  else if (data.startsWith('track:')) {
    const orderId = data.slice(6);
    if (!UUID_RE.test(orderId)) return;
    const { order, needsLink } = await loadVisibleOrder(ctx, { id: orderId });
    if (needsLink) {
      await sendLinkPrompt(ctx, T(ctx, 'linkIntro'));
      return;
    }
    if (!order) {
      await reply(ctx, T(ctx, 'orderNotFound'));
      return;
    }
    await sendOrderDetail(ctx, order);
  }
  else if (data.startsWith('rt:')) await cmdRetryAsk(ctx, data.slice(3));
  else if (data.startsWith('rtc:')) await cmdRetryRun(ctx, data.slice(4));
  else if (data.startsWith('rf:')) await cmdRefundAsk(ctx, data.slice(3));
  else if (data.startsWith('rfc:')) await cmdRefundRun(ctx, data.slice(4));
  else if (data.startsWith('approve:')) await cmdApprove(ctx, data.slice(8));
  else if (data.startsWith('reject:')) await cmdReject(ctx, data.slice(7));
}

// ─── Bot commands registration ──────────────────────────────────────────────

async function setBotCommands(supabase: ReturnType<typeof createClient>, token: string) {
  const commands = [
    { command: 'start', description: 'Start the bot / quick actions' },
    { command: 'menu', description: 'Main menu' },
    { command: 'lang', description: 'العربية / English' },
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
  // Approvers (alert chats without an admin profile): only the recharge-review commands.
  const settings = await getStoreSettings(supabase);
  const adminChats = new Set((admins ?? []).map((a: { telegram_chat_id: string | null }) => String(a.telegram_chat_id)));
  const reviewCommands = adminCommands.filter((c) => ['pending', 'approve', 'reject'].includes(c.command));
  for (const id of parseChatIds(settings?.telegram_chat_id)) {
    if (adminChats.has(id) || id.startsWith('-')) continue;
    results.push(await tgApi(token, 'setMyCommands', {
      commands: [...commands, ...reviewCommands],
      scope: { type: 'chat', chat_id: Number(id) },
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

        const { data: chatRow } = await supabase
          .from('telegram_chats').select('lang').eq('chat_id', String(result.chat_id)).maybeSingle();
        const ll: Lang = chatRow?.lang === 'en' ? 'en' : 'ar';
        await sendMessage(token, Number(result.chat_id),
          tr(ll, 'linkedOk', { name: esc(profile?.username || profile?.name || 'User') }),
          {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: tr(ll, 'btnGames'), callback_data: 'browse_games' },
                  { text: tr(ll, 'btnVouchers'), callback_data: 'browse_vouchers' },
                ],
                [
                  { text: tr(ll, 'btnMenu'), callback_data: 'menu' },
                  { text: tr(ll, 'btnStore'), url: STORE_URL },
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
      isApprover: false,
      actorLabel: '',
      adminProfileId: null,
      isGroup: chat.type !== 'private',
      callbackQueryId: cb?.id,
      messageId: cb?.message?.message_id,
      lang: langFromTelegram(from.language_code),
      flow: null,
    };

    // Per-chat language + in-progress purchase.
    const { data: chatPrefs } = await supabase
      .from('telegram_chats').select('lang, flow').eq('chat_id', String(chat.id)).maybeSingle();
    if (chatPrefs?.lang === 'ar' || chatPrefs?.lang === 'en') ctx.lang = chatPrefs.lang;
    ctx.flow = (chatPrefs?.flow && typeof chatPrefs.flow === 'object') ? chatPrefs.flow as Record<string, unknown> : null;

    const profileAdminId = await findAdminProfileId(supabase, ctx.userId);
    ctx.isAdmin = !!profileAdminId;
    ctx.isApprover = !ctx.isGroup && parseChatIds(settings?.telegram_chat_id).includes(String(ctx.userId));
    ctx.adminProfileId = profileAdminId ?? (ctx.isApprover ? await getPrimaryAdminProfileId(supabase) : null);
    ctx.actorLabel = [ctx.firstName, ctx.username ? `(@${ctx.username})` : '', `tg:${ctx.userId}`].filter(Boolean).join(' ');

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
      if (ctx.isGroup) return new Response('ok');
      // Typed player ID / server while buying.
      const step = ctx.flow?.step;
      if ((step === 'uid' || step === 'server') && Date.now() - Number(ctx.flow?.at || 0) <= 15 * 60 * 1000) {
        await handleFlowText(ctx, text);
        return new Response('ok');
      }
      await reply(ctx, tr(ctx.lang, 'notUnderstood'), {
        reply_markup: { inline_keyboard: [[{ text: tr(ctx.lang, 'btnMenu'), callback_data: 'menu' }]] },
      }, { back: false });
      return new Response('ok');
    }

    const [, cmd, rawArgs] = match;
    const args = rawArgs || '';

    switch (cmd.toLowerCase()) {
      case 'start':
      case 'menu':
        await cmdStart(ctx);
        break;
      case 'lang':
        await cmdLang(ctx);
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
          await reply(ctx, tr(ctx.lang, 'unknownCommand', { cmd: esc(cmd) }));
        }
    }

    return new Response('ok');
  } catch (err) {
    console.error('telegram-bot error:', err);
    return new Response('ok'); // Always 200 to Telegram to prevent retries
  }
});
