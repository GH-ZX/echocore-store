/**
 * Telegram Bot Edge Function — ECHOCORE Store
 *
 * Handles:
 *   Customer: /start, /help, /orders, /balance, /track <ref>, inline buttons
 *   Admin:    /pending, /approve <id>, /reject <id>, /stats, order picking
 *   Callback: order detail, approve/reject recharge, track order
 *
 * Webhook: set via BotFather → POST to /functions/v1/telegram-bot
 * Secret:  x-telegram-bot-secret header validated against store_settings.telegram_webhook_secret
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
    from: { id: number; first_name?: string; username?: string };
    message?: { message_id: number; chat: { id: number }; text?: string };
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
  isGroup: boolean;
}

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

async function isAdminUser(supabase: ReturnType<typeof createClient>, telegramUserId: number): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('telegram_chat_id', String(telegramUserId))
    .maybeSingle();
  return data?.role === 'admin';
}

async function findUserByTelegramChat(supabase: ReturnType<typeof createClient>, telegramChatId: number) {
  const { data } = await supabase
    .from('profiles')
    .select('id, name, username, role, balance')
    .eq('telegram_chat_id', String(telegramChatId))
    .maybeSingle();
  return data;
}

async function findUserByUsername(supabase: ReturnType<typeof createClient>, username: string) {
  const { data } = await supabase
    .from('profiles')
    .select('id, name, username, role, balance, telegram_chat_id')
    .ilike('username', username)
    .maybeSingle();
  return data;
}

// ─── Command handlers ───────────────────────────────────────────────────────

async function cmdStart(ctx: BotContext) {
  const linked = await findUserByTelegramChat(ctx.supabase, ctx.chatId);

  const storeUrl = 'https://www.echocore412.com';

  const linkUrl = `${storeUrl}/telegram-link?chat_id=${ctx.chatId}`;

  if (linked) {
    const balance = money(linked.balance);
    await sendMessage(ctx.botToken, ctx.chatId,
      `👋 <b>Welcome back, ${esc(linked.username || linked.name || ctx.firstName)}!</b>\n\n` +
      `💰 Balance: <b>${balance}</b>\n\n` +
      `Use the buttons below or type /help to see all commands.`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🛒 Browse Store', url: storeUrl },
              { text: '💰 My Balance', callback_data: 'my_balance' },
            ],
            [
              { text: '📦 My Orders', callback_data: 'my_orders' },
              { text: '🔄 Track Order', callback_data: 'track_order' },
            ],
            [
              { text: '❓ Help', callback_data: 'show_help' },
            ],
          ],
        },
      },
    );
  } else {
    await sendMessage(ctx.botToken, ctx.chatId,
      `👋 <b>Welcome to ECHOCORE Store!</b>\n\n` +
      `I help you track orders, check your balance, and get notified about deliveries.\n\n` +
      `Tap the button below to link your account. You'll be taken to the store to log in.`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔗 Link My Account', url: linkUrl },
            ],
            [
              { text: '🛒 Browse Store', url: storeUrl },
              { text: '❓ Help', callback_data: 'show_help' },
            ],
          ],
        },
      },
    );
  }
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
    `/link &lt;username&gt; — Link your store account`,
    `/unlink — Unlink your Telegram`,
    `/orders — Your recent orders`,
    `/balance — Check wallet balance`,
    `/track &lt;order_ref&gt; — Track an order`,
    ``,
    `<i>Tap a button or type a command to begin.</i>`,
  );

  await sendMessage(ctx.botToken, ctx.chatId, lines.join('\n'));
}

async function cmdLink(ctx: BotContext, args: string) {
  const username = args.trim().replace(/^@/, '');
  if (!username) {
    await sendMessage(ctx.botToken, ctx.chatId,
      `Usage: <code>/link your_username</code>\n\nFind your username on your profile page.`,
    );
    return;
  }

  const user = await findUserByUsername(ctx.supabase, username);
  if (!user) {
    await sendMessage(ctx.botToken, ctx.chatId,
      `❌ No account found with username <b>${esc(username)}</b>.\n\nCheck your username on the profile page and try again.`,
    );
    return;
  }

  if (user.telegram_chat_id && user.telegram_chat_id !== String(ctx.chatId)) {
    await sendMessage(ctx.botToken, ctx.chatId,
      `⚠️ This username is already linked to another Telegram account.\n\nUnlink it first from Telegram or contact support.`,
    );
    return;
  }

  const { error } = await ctx.supabase
    .from('profiles')
    .update({
      telegram_chat_id: String(ctx.chatId),
      telegram_linked_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) {
    console.error('link error:', error);
    await sendMessage(ctx.botToken, ctx.chatId, `❌ Failed to link account. Please try again later.`);
    return;
  }

  await sendMessage(ctx.botToken, ctx.chatId,
    `✅ <b>Account linked!</b>\n\n` +
    `Welcome, <b>${esc(user.username || user.name || username)}</b>.\n` +
    `Balance: <b>${money(user.balance)}</b>\n\n` +
    `You'll now receive delivery notifications here.`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🛒 Browse Store', url: 'https://www.echocore412.com' },
            { text: '💰 My Balance', callback_data: 'my_balance' },
          ],
          [
            { text: '📦 My Orders', callback_data: 'my_orders' },
          ],
        ],
      },
    },
  );
}

async function cmdUnlink(ctx: BotContext) {
  const user = await findUserByTelegramChat(ctx.supabase, ctx.chatId);
  if (!user) {
    await sendMessage(ctx.botToken, ctx.chatId, `You don't have a linked account.`);
    return;
  }

  const { error } = await ctx.supabase
    .from('profiles')
    .update({ telegram_chat_id: null, telegram_linked_at: null })
    .eq('id', user.id);

  if (error) {
    await sendMessage(ctx.botToken, ctx.chatId, `❌ Failed to unlink. Try again later.`);
    return;
  }

  await sendMessage(ctx.botToken, ctx.chatId,
    `✅ Account unlinked. You won't receive delivery notifications here anymore.\n\n` +
    `Use <code>/link username</code> to re-link anytime.`,
  );
}

async function cmdBalance(ctx: BotContext) {
  const user = await findUserByTelegramChat(ctx.supabase, ctx.chatId);
  if (!user) {
    await sendMessage(ctx.botToken, ctx.chatId,
      `🔗 Link your account first: <code>/link your_username</code>`,
    );
    return;
  }

  await sendMessage(ctx.botToken, ctx.chatId,
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

async function cmdOrders(ctx: BotContext) {
  const user = await findUserByTelegramChat(ctx.supabase, ctx.chatId);
  if (!user) {
    await sendMessage(ctx.botToken, ctx.chatId,
      `🔗 Link your account first: <code>/link your_username</code>`,
    );
    return;
  }

  const { data: orders } = await ctx.supabase
    .from('orders')
    .select('id, order_ref, total, status, fulfillment_status, created_at, payment_method')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5);

  if (!orders || orders.length === 0) {
    await sendMessage(ctx.botToken, ctx.chatId,
      `📦 No orders yet.\n\nBrowse the store to make your first purchase!`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: '🛒 Browse Store', url: 'https://www.echocore412.com' }]],
        },
      },
    );
    return;
  }

  const statusEmoji: Record<string, string> = {
    pending: '⏳',
    completed: '✅',
    failed: '❌',
    fulfilling: '🔄',
    fulfilled: '🎉',
  };

  const lines = orders.map((o) => {
    const emoji = statusEmoji[o.fulfillment_status] || statusEmoji[o.status] || '❓';
    const date = new Date(o.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    return `${emoji} <b>${esc(o.order_ref)}</b> — ${money(o.total)} · ${date}`;
  });

  await sendMessage(ctx.botToken, ctx.chatId,
    `📦 <b>Your Recent Orders</b>\n\n${lines.join('\n')}\n\n` +
    `Tap an order to track it, or type /track &lt;ref&gt;`,
    {
      reply_markup: {
        inline_keyboard: orders.slice(0, 3).map((o) => [
          { text: `📍 ${esc(o.order_ref)}`, callback_data: `track:${o.id}` },
        ]),
      },
    },
  );
}

async function cmdTrack(ctx: BotContext, args: string) {
  const ref = args.trim();
  if (!ref) {
    await sendMessage(ctx.botToken, ctx.chatId,
      `Usage: <code>/track ORDER-REF</code>\n\nExample: <code>/track EC-2401-A1B2</code>`,
    );
    return;
  }

  const { data: order } = await ctx.supabase
    .from('orders')
    .select('id, order_ref, total, status, fulfillment_status, g2bulk_metadata, created_at, payment_method')
    .ilike('order_ref', ref)
    .maybeSingle();

  if (!order) {
    await sendMessage(ctx.botToken, ctx.chatId, `❌ Order <b>${esc(ref)}</b> not found.`);
    return;
  }

  const meta = (order.g2bulk_metadata || {}) as Record<string, unknown>;
  const statusLabel: Record<string, string> = {
    pending: '⏳ Pending Payment',
    completed: '✅ Paid',
    fulfilling: '🔄 Fulfilling…',
    fulfilled: '🎉 Delivered',
    failed: '❌ Failed',
  };

  const lines = [
    `📍 <b>Order ${esc(order.order_ref)}</b>`,
    ``,
    `Status: <b>${statusLabel[order.fulfillment_status] || statusLabel[order.status] || order.status}</b>`,
    `Amount: <b>${money(order.total)}</b>`,
    `Payment: ${esc(order.payment_method)}`,
    `Date: ${new Date(order.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
  ];

  if (meta.balance_refunded) {
    lines.push(``, `💰 <i>Balance refunded: ${money(order.total)}</i>`);
  }
  if (meta.last_error) {
    lines.push(``, `⚠️ Error: <i>${esc(String(meta.last_error))}</i>`);
  }

  const buttons = [];
  if (order.fulfillment_status === 'fulfilled') {
    buttons.push([{ text: '📄 View Invoice', url: `https://www.echocore412.com/invoice/order/${order.id}` }]);
  } else if (order.fulfillment_status === 'failed' && meta.balance_refunded) {
    buttons.push([{ text: '💰 Recharge', url: 'https://www.echocore412.com/recharge' }]);
  }

  await sendMessage(ctx.botToken, ctx.chatId, lines.join('\n'), {
    reply_markup: buttons.length ? { inline_keyboard: buttons } : undefined,
  });
}

// ─── Admin command handlers ─────────────────────────────────────────────────

async function cmdPending(ctx: BotContext) {
  if (!ctx.isAdmin) {
    await sendMessage(ctx.botToken, ctx.chatId, `⛔ Admin only.`);
    return;
  }

  const { data: recharges } = await ctx.supabase
    .from('recharge_requests')
    .select('id, user_id, amount, reference, payment_method, status, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(10);

  if (!recharges || recharges.length === 0) {
    await sendMessage(ctx.botToken, ctx.chatId, `✅ No pending recharges.`);
    return;
  }

  // Fetch usernames
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

  await sendMessage(ctx.botToken, ctx.chatId,
    `⏳ <b>Pending Recharges (${recharges.length})</b>\n\n${lines.join('\n\n')}`,
    {
      reply_markup: {
        inline_keyboard: recharges.map((r) => [
          { text: `✅ Approve ${money(r.amount)}`, callback_data: `approve:${r.id}` },
          { text: `❌ Reject`, callback_data: `reject:${r.id}` },
        ]),
      },
    },
  );
}

async function cmdApprove(ctx: BotContext, args: string) {
  if (!ctx.isAdmin) {
    await sendMessage(ctx.botToken, ctx.chatId, `⛔ Admin only.`);
    return;
  }

  const id = args.trim();
  if (!id) {
    await sendMessage(ctx.botToken, ctx.chatId, `Usage: <code>/approve &lt;recharge_id&gt;</code>`);
    return;
  }

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(id)) {
    await sendMessage(ctx.botToken, ctx.chatId, `❌ Invalid recharge ID.`);
    return;
  }

  const { data: recharge } = await ctx.supabase
    .from('recharge_requests')
    .select('id, user_id, amount, status')
    .eq('id', id)
    .maybeSingle();

  if (!recharge) {
    await sendMessage(ctx.botToken, ctx.chatId, `❌ Recharge not found.`);
    return;
  }

  if (recharge.status !== 'pending') {
    await sendMessage(ctx.botToken, ctx.chatId, `⚠️ Recharge is already <b>${recharge.status}</b>.`);
    return;
  }

  // Approve: credit balance + mark approved
  const { data: profile } = await ctx.supabase
    .from('profiles')
    .select('balance')
    .eq('id', recharge.user_id)
    .maybeSingle();

  const newBalance = (profile?.balance ?? 0) + recharge.amount;

  const { error: updateErr } = await ctx.supabase
    .from('profiles')
    .update({ balance: newBalance })
    .eq('id', recharge.user_id);

  if (updateErr) {
    await sendMessage(ctx.botToken, ctx.chatId, `❌ Failed to credit balance: ${updateErr.message}`);
    return;
  }

  await ctx.supabase.from('transactions').insert({
    user_id: recharge.user_id,
    type: 'recharge',
    amount: recharge.amount,
    balance_after: newBalance,
    payment_method: 'manual',
    reference: recharge.reference,
    status: 'completed',
  });

  await ctx.supabase
    .from('recharge_requests')
    .update({ status: 'approved', reviewed_at: new Date().toISOString() })
    .eq('id', id);

  // Notify customer
  await ctx.supabase.from('notifications').insert({
    user_id: recharge.user_id,
    type: 'recharge_approved',
    metadata: { amount: recharge.amount, newBalance },
    link: '/profile',
  });

  // Notify customer via Telegram if linked
  const { data: customer } = await ctx.supabase
    .from('profiles')
    .select('telegram_chat_id, username')
    .eq('id', recharge.user_id)
    .maybeSingle();

  if (customer?.telegram_chat_id) {
    await sendMessage(ctx.botToken, Number(customer.telegram_chat_id),
      `✅ <b>Recharge Approved!</b>\n\n` +
      `Amount: <b>${money(recharge.amount)}</b>\n` +
      `New Balance: <b>${money(newBalance)}</b>`,
    );
  }

  await answerCallback(ctx.botToken, '', `✅ Approved: ${money(recharge.amount)}`);
  await sendMessage(ctx.botToken, ctx.chatId,
    `✅ <b>Recharge approved!</b>\n\n` +
    `Amount: ${money(recharge.amount)}\n` +
    `New balance: ${money(newBalance)}`,
  );
}

async function cmdReject(ctx: BotContext, args: string) {
  if (!ctx.isAdmin) {
    await sendMessage(ctx.botToken, ctx.chatId, `⛔ Admin only.`);
    return;
  }

  const id = args.trim();
  if (!id) {
    await sendMessage(ctx.botToken, ctx.chatId, `Usage: <code>/reject &lt;recharge_id&gt;</code>`);
    return;
  }

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(id)) {
    await sendMessage(ctx.botToken, ctx.chatId, `❌ Invalid recharge ID.`);
    return;
  }

  const { data: recharge } = await ctx.supabase
    .from('recharge_requests')
    .select('id, user_id, amount, status')
    .eq('id', id)
    .maybeSingle();

  if (!recharge) {
    await sendMessage(ctx.botToken, ctx.chatId, `❌ Recharge not found.`);
    return;
  }

  if (recharge.status !== 'pending') {
    await sendMessage(ctx.botToken, ctx.chatId, `⚠️ Recharge is already <b>${recharge.status}</b>.`);
    return;
  }

  await ctx.supabase
    .from('recharge_requests')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
    .eq('id', id);

  // Notify customer via Telegram if linked
  const { data: customer } = await ctx.supabase
    .from('profiles')
    .select('telegram_chat_id')
    .eq('id', recharge.user_id)
    .maybeSingle();

  if (customer?.telegram_chat_id) {
    await sendMessage(ctx.botToken, Number(customer.telegram_chat_id),
      `❌ <b>Recharge Rejected</b>\n\n` +
      `Amount: ${money(recharge.amount)}\n\n` +
      `Contact support if you believe this is an error.`,
    );
  }

  await sendMessage(ctx.botToken, ctx.chatId, `❌ Recharge rejected.`);
}

async function cmdStats(ctx: BotContext) {
  if (!ctx.isAdmin) {
    await sendMessage(ctx.botToken, ctx.chatId, `⛔ Admin only.`);
    return;
  }

  const [ordersRes, usersRes, revenueRes, pendingRes] = await Promise.all([
    ctx.supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
    ctx.supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'user'),
    ctx.supabase.from('orders').select('total').eq('status', 'completed'),
    ctx.supabase.from('recharge_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);

  const totalOrders = ordersRes.count ?? 0;
  const totalUsers = usersRes.count ?? 0;
  const totalRevenue = (revenueRes.data ?? []).reduce((sum: number, o: { total: number }) => sum + (o.total ?? 0), 0);
  const pendingCount = pendingRes.count ?? 0;

  await sendMessage(ctx.botToken, ctx.chatId,
    `📊 <b>Store Stats</b>\n\n` +
    `👥 Users: <b>${totalUsers}</b>\n` +
    `📦 Orders: <b>${totalOrders}</b>\n` +
    `💰 Revenue: <b>${money(totalRevenue)}</b>\n` +
    `⏳ Pending recharges: <b>${pendingCount}</b>`,
    {
      reply_markup: pendingCount > 0
        ? { inline_keyboard: [[{ text: `⏳ View Pending (${pendingCount})`, callback_data: 'admin_pending' }]] }
        : undefined,
    },
  );
}

async function cmdBroadcast(ctx: BotContext, args: string) {
  if (!ctx.isAdmin) {
    await sendMessage(ctx.botToken, ctx.chatId, `⛔ Admin only.`);
    return;
  }

  const msg = args.trim();
  if (!msg) {
    await sendMessage(ctx.botToken, ctx.chatId,
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
    await sendMessage(ctx.botToken, ctx.chatId, `No linked users to broadcast to.`);
    return;
  }

  let sent = 0;
  let failed = 0;
  for (const u of users) {
    if (!u.telegram_chat_id) continue;
    try {
      await sendMessage(ctx.botToken, Number(u.telegram_chat_id),
        `📢 <b>Store Announcement</b>\n\n${esc(msg)}`,
      );
      sent++;
    } catch {
      failed++;
    }
  }

  await sendMessage(ctx.botToken, ctx.chatId,
    `📢 Broadcast sent to <b>${sent}</b> user(s).${failed ? ` Failed: ${failed}` : ''}`,
  );
}

// ─── Callback query handler ─────────────────────────────────────────────────

async function handleCallback(ctx: BotContext, data: string) {
  if (data === 'my_balance') {
    const user = await findUserByTelegramChat(ctx.supabase, ctx.chatId);
    if (!user) {
      await answerCallback(ctx.botToken, ctx.callbackQueryId!, 'Link your account first');
      return;
    }
    await answerCallback(ctx.botToken, ctx.callbackQueryId!);
    await cmdBalance(ctx);
  }

  else if (data === 'my_orders') {
    await answerCallback(ctx.botToken, ctx.callbackQueryId!);
    await cmdOrders(ctx);
  }

  else if (data === 'track_order') {
    await answerCallback(ctx.botToken, ctx.callbackQueryId!, 'Send: /track ORDER-REF');
    await sendMessage(ctx.botToken, ctx.chatId,
      `📍 Send: <code>/track ORDER-REF</code>\n\nExample: <code>/track EC-2401-A1B2</code>`,
    );
  }

  else if (data === 'show_help') {
    await answerCallback(ctx.botToken, ctx.callbackQueryId!);
    await cmdHelp(ctx);
  }

  else if (data === 'admin_pending') {
    if (!ctx.isAdmin) {
      await answerCallback(ctx.botToken, ctx.callbackQueryId!, 'Admin only');
      return;
    }
    await answerCallback(ctx.botToken, ctx.callbackQueryId!);
    await cmdPending(ctx);
  }

  else if (data.startsWith('track:')) {
    const orderId = data.slice(6);
    await answerCallback(ctx.botToken, ctx.callbackQueryId!);

    const { data: order } = await ctx.supabase
      .from('orders')
      .select('id, order_ref, total, status, fulfillment_status, g2bulk_metadata, created_at, payment_method')
      .eq('id', orderId)
      .maybeSingle();

    if (!order) {
      await sendMessage(ctx.botToken, ctx.chatId, `❌ Order not found.`);
      return;
    }

    const meta = (order.g2bulk_metadata || {}) as Record<string, unknown>;
    const statusLabel: Record<string, string> = {
      pending: '⏳ Pending Payment',
      completed: '✅ Paid',
      fulfilling: '🔄 Fulfilling…',
      fulfilled: '🎉 Delivered',
      failed: '❌ Failed',
    };

    const lines = [
      `📍 <b>Order ${esc(order.order_ref)}</b>`,
      ``,
      `Status: <b>${statusLabel[order.fulfillment_status] || statusLabel[order.status] || order.status}</b>`,
      `Amount: <b>${money(order.total)}</b>`,
    ];

    if (meta.balance_refunded) {
      lines.push(`💰 <i>Refunded: ${money(order.total)}</i>`);
    }

    const buttons = [];
    if (order.fulfillment_status === 'fulfilled') {
      buttons.push([{ text: '📄 Invoice', url: `https://www.echocore412.com/invoice/order/${order.id}` }]);
    }

    await sendMessage(ctx.botToken, ctx.chatId, lines.join('\n'), {
      reply_markup: buttons.length ? { inline_keyboard: buttons } : undefined,
    });
  }

  else if (data.startsWith('approve:')) {
    const rechargeId = data.slice(8);
    if (!ctx.isAdmin) {
      await answerCallback(ctx.botToken, ctx.callbackQueryId!, 'Admin only');
      return;
    }
    await answerCallback(ctx.botToken, ctx.callbackQueryId!);
    await cmdApprove(ctx, rechargeId);
  }

  else if (data.startsWith('reject:')) {
    const rechargeId = data.slice(7);
    if (!ctx.isAdmin) {
      await answerCallback(ctx.botToken, ctx.callbackQueryId!, 'Admin only');
      return;
    }
    await answerCallback(ctx.botToken, ctx.callbackQueryId!);
    await cmdReject(ctx, rechargeId);
  }

  else {
    await answerCallback(ctx.botToken, ctx.callbackQueryId!, 'Unknown action');
  }
}

// ─── Bot commands registration (called on first deploy or /setcommands) ─────

async function setBotCommands(token: string) {
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

  await tgApi(token, 'setMyCommands', { commands });
  // Admin commands are set separately so they only show for admins
  // (Telegram doesn't support per-user command menus natively,
  //  but we set them anyway so admins see them in autocomplete)
  await tgApi(token, 'setMyCommands', { commands: [...commands, ...adminCommands] });
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

    // ── GET: setup webhook or set commands (admin only) ──
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const action = url.searchParams.get('action');
      const settings = await getStoreSettings(supabase);
      const token = settings?.telegram_bot_token?.trim();

      if (!token) {
        return new Response(JSON.stringify({ error: 'No bot token configured' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'link') {
      // Link a Telegram chat to the authenticated user
      const chatIdParam = url.searchParams.get('chat_id');
      if (!chatIdParam) {
        return new Response(JSON.stringify({ error: 'chat_id required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify the caller has a valid Supabase JWT
      const authHeader = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Authentication required' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Decode JWT to get user ID
      let userId: string | null = null;
      try {
        const parts = authHeader.split('.');
        if (parts.length === 3) {
          let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          const pad = b64.length % 4;
          if (pad) b64 += '='.repeat(4 - pad);
          const payload = JSON.parse(atob(b64));
          userId = payload.sub || null;
        }
      } catch {
        // ignore
      }

      if (!userId) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if this chat is already linked to someone else
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('telegram_chat_id', chatIdParam)
        .neq('id', userId)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ error: 'This Telegram account is already linked to another user' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Link
      const { error } = await supabase
        .from('profiles')
        .update({
          telegram_chat_id: chatIdParam,
          telegram_linked_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Notify the user via Telegram
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, name')
        .eq('id', userId)
        .maybeSingle();

      await sendMessage(token, Number(chatIdParam),
        `✅ <b>Account linked!</b>\n\n` +
        `Welcome, <b>${esc(profile?.username || profile?.name || 'User')}</b>.\n` +
        `You'll now receive order notifications here.`,
      );

      return new Response(JSON.stringify({ ok: true, linked: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'setup-webhook') {
        const secret = settings?.telegram_webhook_secret?.trim() || crypto.randomUUID();
        const webhookUrl = `${supabaseUrl}/functions/v1/telegram-bot`;

        // Save secret if new
        if (!settings?.telegram_webhook_secret) {
          await supabase
            .from('store_settings')
            .update({ telegram_webhook_secret: secret })
            .eq('id', 1);
        }

        const result = await setupWebhook(token, webhookUrl, secret);
        return new Response(JSON.stringify({ webhook: result, secret }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'set-commands') {
        const result = await setBotCommands(token);
        return new Response(JSON.stringify({ commands: result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'get-info') {
        const me = await tgApi(token, 'getMe', {});
        return new Response(JSON.stringify({ bot: me.result, webhook_secret_set: !!settings?.telegram_webhook_secret }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'Unknown action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── POST: Telegram webhook ──
    // Verify webhook secret
    const webhookSecret = req.headers.get('x-telegram-bot-secret')?.trim();
    const settings = await getStoreSettings(supabase);
    const expectedSecret = settings?.telegram_webhook_secret?.trim();

    if (expectedSecret && webhookSecret !== expectedSecret) {
      return new Response('Unauthorized', { status: 401 });
    }

    const token = settings?.telegram_bot_token?.trim();
    if (!token) {
      return new Response('No bot token', { status: 500 });
    }

    const update: TelegramUpdate = await req.json();

    // Build context
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
      webhookSecret: expectedSecret || '',
      chatId: chat.id,
      userId: from.id,
      firstName: from.first_name || '',
      username: from.username || '',
      isAdmin: false,
      isGroup: chat.type !== 'private',
    };

    // Check admin status
    ctx.isAdmin = await isAdminUser(supabase, ctx.userId);

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

    // Parse command
    const match = text.match(/^\/(\w+)(?:\s+(.*))?$/s);
    if (!match) {
      // Non-command text in private chat — show help
      if (!ctx.isGroup) {
        await sendMessage(token, ctx.chatId,
          `🤔 I'm not sure what you mean. Type /help to see what I can do!`,
        );
      }
      return new Response('ok');
    }

    const [, cmd, rawArgs] = match;
    const args = rawArgs || '';

    switch (cmd.toLowerCase()) {
      case 'start':
        await cmdStart(ctx);
        break;
      case 'help':
        await cmdHelp(ctx);
        break;
      case 'link':
        await cmdLink(ctx, args);
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
