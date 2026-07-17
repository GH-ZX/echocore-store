import { getOfferWholesaleCost } from './offerCost';

const MS_PER_DAY = 86_400_000;

function parseMoney(value) {
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num : 0;
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function formatUsd(value) {
  const num = Number(value);
  return Number.isFinite(num) ? `$${num.toFixed(2)}` : '—';
}

function isCountableOrder(order) {
  return order?.status === 'completed' && order?.payment_method !== 'admin_gift';
}

function buildOfferMeta(offers = []) {
  const costById = {};
  const metaById = {};
  for (const offer of offers) {
    if (!offer?.id) continue;
    costById[offer.id] = getOfferWholesaleCost(offer);
    metaById[offer.id] = {
      name: offer.name_en || offer.name_ar || offer.id,
      price: parseMoney(offer.price),
      cost: getOfferWholesaleCost(offer),
    };
  }
  return { costById, metaById };
}

function sumOrderItemMetrics(order, costById) {
  const items = order.order_items || [];
  let revenue = 0;
  let cost = 0;
  let trackedItems = 0;
  let totalItems = 0;
  const byOffer = {};

  for (const item of items) {
    const qty = Math.max(1, Number.parseInt(item.quantity, 10) || 1);
    const itemRevenue = parseMoney(item.price) * qty;
    revenue += itemRevenue;
    totalItems += 1;

    const unitCost = costById[item.offer_id];
    const offerKey = item.offer_id || item.name_snapshot || 'unknown';
    if (!byOffer[offerKey]) {
      byOffer[offerKey] = {
        offerId: item.offer_id || null,
        name: item.name_snapshot || '—',
        revenue: 0,
        cost: 0,
        profit: 0,
        orders: 0,
        hasCost: false,
      };
    }
    byOffer[offerKey].revenue += itemRevenue;
    byOffer[offerKey].orders += 1;

    if (unitCost != null) {
      const itemCost = unitCost * qty;
      cost += itemCost;
      trackedItems += 1;
      byOffer[offerKey].cost += itemCost;
      byOffer[offerKey].hasCost = true;
      byOffer[offerKey].profit += itemRevenue - itemCost;
    }
  }

  const orderRevenue = revenue > 0 ? revenue : parseMoney(order.total);
  const fullyTracked = totalItems > 0 && trackedItems === totalItems;

  return {
    revenue: orderRevenue,
    cost,
    profit: cost > 0 || trackedItems > 0 ? orderRevenue - cost : null,
    fullyTracked,
    partialCost: trackedItems > 0 && trackedItems < totalItems,
    byOffer,
  };
}

function buildDayBuckets(days) {
  const buckets = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today.getTime() - offset * MS_PER_DAY);
    const key = date.toISOString().slice(0, 10);
    buckets.push({
      key,
      // Always Latin digits so chart axes match product prices / English numerals
      label: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      revenue: 0,
      cost: 0,
      profit: 0,
      orders: 0,
    });
  }

  return buckets;
}

/** Profit & margin analytics for admin overview. */
export function computeAdminProfitMetrics(orders = [], offers = [], { chartDays = 7 } = {}) {
  const { costById, metaById } = buildOfferMeta(offers);
  const dayBuckets = buildDayBuckets(chartDays);
  const dayIndex = Object.fromEntries(dayBuckets.map((day, index) => [day.key, index]));

  let completedOrders = 0;
  let trackedRevenue = 0;
  let untrackedRevenue = 0;
  let supplierCost = 0;
  let grossProfit = 0;
  let partialOrders = 0;

  const offerTotals = {};

  for (const order of orders) {
    if (!isCountableOrder(order)) continue;

    completedOrders += 1;
    const metrics = sumOrderItemMetrics(order, costById);
    const dayKey = String(order.created_at || '').slice(0, 10);
    const day = dayIndex[dayKey] != null ? dayBuckets[dayIndex[dayKey]] : null;

    if (day) {
      day.revenue += metrics.revenue;
      day.cost += metrics.cost;
      day.profit += metrics.revenue - metrics.cost;
      day.orders += 1;
    }

    if (metrics.fullyTracked || metrics.cost > 0) {
      trackedRevenue += metrics.revenue;
      supplierCost += metrics.cost;
      grossProfit += metrics.revenue - metrics.cost;
      if (metrics.partialCost) partialOrders += 1;
    } else {
      untrackedRevenue += metrics.revenue;
    }

    for (const [key, row] of Object.entries(metrics.byOffer)) {
      if (!offerTotals[key]) {
        offerTotals[key] = { ...row, orders: 0 };
      }
      offerTotals[key].revenue += row.revenue;
      offerTotals[key].cost += row.cost;
      offerTotals[key].profit += row.profit;
      offerTotals[key].orders += row.orders;
      if (row.hasCost) offerTotals[key].hasCost = true;
    }
  }

  const marginPercent = trackedRevenue > 0
    ? roundMoney((grossProfit / trackedRevenue) * 100)
    : null;

  const catalogOffers = Object.values(metaById).filter((row) => row.cost != null && row.price > 0);
  const catalogMarginPercent = catalogOffers.length > 0
    ? roundMoney(
      catalogOffers.reduce((sum, row) => sum + ((row.price - row.cost) / row.price) * 100, 0)
        / catalogOffers.length,
    )
    : null;

  const chartMax = Math.max(...dayBuckets.map((day) => day.revenue), 0.01);

  const topOffers = Object.values(offerTotals)
    .filter((row) => row.hasCost && row.profit > 0)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5);

  return {
    completedOrders,
    trackedRevenue: roundMoney(trackedRevenue),
    untrackedRevenue: roundMoney(untrackedRevenue),
    supplierCost: roundMoney(supplierCost),
    grossProfit: roundMoney(grossProfit),
    marginPercent,
    catalogMarginPercent,
    catalogOffersWithCost: catalogOffers.length,
    partialOrders,
    chartDays: dayBuckets.map((day) => ({
      ...day,
      revenue: roundMoney(day.revenue),
      cost: roundMoney(day.cost),
      profit: roundMoney(day.profit),
      revenuePct: Math.max(4, (day.revenue / chartMax) * 100),
      costPct: day.revenue > 0 ? Math.min(100, (day.cost / day.revenue) * 100) : 0,
      profitPct: day.revenue > 0 ? Math.max(0, ((day.revenue - day.cost) / day.revenue) * 100) : 0,
    })),
    topOffers: topOffers.map((row) => ({
      ...row,
      revenue: roundMoney(row.revenue),
      cost: roundMoney(row.cost),
      profit: roundMoney(row.profit),
      marginPercent: row.revenue > 0 ? roundMoney((row.profit / row.revenue) * 100) : null,
    })),
    formatUsd,
  };
}