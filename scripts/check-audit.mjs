import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://uaiirtgzqtnrvcrlxstg.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY environment variable is required to run audit.');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

async function run() {
  console.log('=== 1. CHECKING STORE SETTINGS ===');
  const { data: settings, error: sErr } = await sb
    .from('store_settings')
    .select('id, g2bulk_enabled, g2bulk_auto_refund_on_fail, g2bulk_block_when_wallet_low, sam_syp_per_usd')
    .eq('id', 1)
    .single();
  console.log('Settings:', JSON.stringify(settings, null, 2), sErr || '');

  console.log('\n=== 2. AUDITING OFFERS: PRICE < G2BULK_COST_USD (NEGATIVE MARGINS) ===');
  const { data: offers, error: oErr } = await sb
    .from('offers')
    .select('id, name_en, price, g2bulk_cost_usd, active, is_sale, pricing_mode, games(name_en)')
    .eq('active', true)
    .not('g2bulk_cost_usd', 'is', null)
    .gt('g2bulk_cost_usd', 0);

  if (oErr) {
    console.error('Offers error:', oErr);
  } else {
    const losingOffers = offers.filter(o => Number(o.price) < Number(o.g2bulk_cost_usd));
    console.log(`Total active offers with supplier cost: ${offers.length}`);
    console.log(`Offers selling AT A LOSS (price < cost): ${losingOffers.length}`);
    losingOffers.forEach(o => {
      const loss = (Number(o.g2bulk_cost_usd) - Number(o.price)).toFixed(2);
      console.log(`- ⚠️ [MONEY LEAK] Game: "${o.games?.name_en || 'N/A'}" | Offer: "${o.name_en}"`);
      console.log(`     Customer Pays: $${o.price} | G2Bulk Charges: $${o.g2bulk_cost_usd} | Loss Per Order: -$${loss} (mode: ${o.pricing_mode}, sale: ${o.is_sale})`);
    });
  }

  console.log('\n=== 3. CHECKING NEGATIVE BALANCES (DEBTORS) ===');
  const { data: debtors, error: dErr } = await sb
    .from('profiles')
    .select('id, username, name, balance')
    .lt('balance', 0)
    .order('balance', { ascending: true });
  console.log(`Total debtor accounts: ${debtors?.length || 0}`);
  let totalDebt = 0;
  debtors?.forEach(d => {
    totalDebt += Number(d.balance);
    console.log(`- ${d.username || d.name || d.id}: $${d.balance}`);
  });
  console.log(`Total outstanding debt: $${totalDebt.toFixed(2)}`);

  console.log('\n=== 4. CHECKING INVARIANT VIOLATIONS (DELIVERED AND REFUNDED) ===');
  const { data: ordersWithRefund, error: refErr } = await sb
    .from('orders')
    .select('id, total, status, fulfillment_status, created_at, user_id, g2bulk_order_id, g2bulk_metadata')
    .eq('fulfillment_status', 'fulfilled')
    .order('created_at', { ascending: false });

  if (refErr) {
    console.error('Orders error:', refErr);
  } else {
    const { data: refunds, error: txErr } = await sb
      .from('transactions')
      .select('id, user_id, amount, reference, created_at')
      .eq('type', 'refund')
      .eq('status', 'completed');

    if (txErr) {
      console.error('Transactions error:', txErr);
    } else {
      const violations = [];
      for (const order of ordersWithRefund) {
        const shortId = order.id.replace(/-/g, '').slice(0, 8).toUpperCase();
        const matchingRefund = refunds.find(r => r.reference && r.reference.includes(shortId));
        if (matchingRefund) {
          violations.push({ order, matchingRefund });
        }
      }
      console.log(`Total fulfilled orders: ${ordersWithRefund.length}`);
      console.log(`Total fulfilled orders with matching refund: ${violations.length}`);
      violations.slice(0, 10).forEach(v => {
        console.log(`- Order ${v.order.id} ($${v.order.total}) delivered via G2Bulk ID ${v.order.g2bulk_order_id}, but refunded $${v.matchingRefund.amount} on ${v.matchingRefund.created_at}`);
      });
      if (violations.length > 10) {
        console.log(`... and ${violations.length - 10} more historical violations.`);
      }
    }
  }

  console.log('\n=== 5. CHECKING RECENT ORDERS (LAST 20) ===');
  const { data: recentOrders, error: recErr } = await sb
    .from('orders')
    .select('id, total, status, fulfillment_status, payment_method, created_at, g2bulk_order_id, g2bulk_metadata')
    .order('created_at', { ascending: false })
    .limit(20);

  recentOrders?.forEach(o => {
    console.log(`- Order ${o.id.slice(0, 8)} | Total: $${o.total} | Status: ${o.status} | Fulfillment: ${o.fulfillment_status} | Method: ${o.payment_method} | G2Bulk: ${o.g2bulk_order_id || 'none'} | Date: ${o.created_at}`);
  });

  console.log('\n=== 6. CHECKING STUCK FULFILLING ORDERS (>30m) ===');
  const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: stuckOrders, error: stuckErr } = await sb
    .from('orders')
    .select('id, total, status, fulfillment_status, created_at, g2bulk_order_id')
    .eq('fulfillment_status', 'fulfilling')
    .lt('created_at', thirtyMinsAgo);
  console.log(`Stuck fulfilling orders: ${stuckOrders?.length || 0}`);
  stuckOrders?.forEach(s => console.log(`- Order ${s.id} ($${s.total}) stuck since ${s.created_at}`));
}

run();
