import { getOfferWholesaleCost } from './offerCost';

const MS_PER_DAY = 86_400_000;

/** Preset period lengths for the profit stats page (null = all time). */
export const PROFIT_PERIOD_OPTIONS = [1, 7, 14, 30, 90, null];

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

function orderDayKey(order) {
  return String(order?.created_at || '').slice(0, 10);
}

function isOrderInPeriod(order, periodDays, todayStart) {
  if (periodDays == null) return true;
  const dayKey = orderDayKey(order);
  if (!dayKey || dayKey.length < 10) return false;
  const orderDate = new Date(`${dayKey}T00:00:00`);
  if (Number.isNaN(orderDate.getTime())) return false;
  const cutoff = new Date(todayStart.getTime() - (periodDays - 1) * MS_PER_DAY);
  return orderDate >= cutoff && orderDate <= todayStart;
}

function todayAtMidnight() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function resolveItemGame(item, catalogMaps) {
  const nestedGame = item?.offers?.games;
  if (nestedGame?.id) {
    return {
      gameId: nestedGame.id,
      name: nestedGame.name_ar || nestedGame.name_en || nestedGame.slug || nestedGame.id,
      nameAr: nestedGame.name_ar || nestedGame.name_en || null,
      nameEn: nestedGame.name_en || nestedGame.name_ar || null,
    };
  }
  const offerGameId = item?.offers?.game_id;
  if (offerGameId && catalogMaps.gamesById?.[offerGameId]) {
    return catalogMaps.gamesById[offerGameId];
  }
  const offerId = item?.offer_id;
  if (offerId && catalogMaps.offerToGame?.[offerId]) {
    return catalogMaps.offerToGame[offerId];
  }
  if (offerGameId) {
    return {
      gameId: offerGameId,
      name: offerGameId,
      nameAr: null,
      nameEn: null,
    };
  }
  return {
    gameId: 'unknown',
    name: '—',
    nameAr: null,
    nameEn: null,
  };
}

function buildCatalogMaps(offers = [], games = []) {
  const costById = {};
  const metaById = {};
  const gamesById = {};
  const offerToGame = {};

  for (const game of games) {
    if (!game?.id) continue;
    gamesById[game.id] = {
      gameId: game.id,
      name: game.name_ar || game.name_en || game.slug || game.id,
      nameAr: game.name_ar || game.name_en || null,
      nameEn: game.name_en || game.name_ar || null,
    };
  }

  for (const offer of offers) {
    if (!offer?.id) continue;
    costById[offer.id] = getOfferWholesaleCost(offer);
    metaById[offer.id] = {
      name: offer.name_ar || offer.name_en || offer.id,
      nameAr: offer.name_ar || offer.name_en || null,
      nameEn: offer.name_en || offer.name_ar || null,
      price: parseMoney(offer.price),
      cost: getOfferWholesaleCost(offer),
      gameId: offer.game_id || null,
    };
    if (offer.game_id && gamesById[offer.game_id]) {
      offerToGame[offer.id] = gamesById[offer.game_id];
    } else if (offer.game_id) {
      offerToGame[offer.id] = {
        gameId: offer.game_id,
        name: offer.game_id,
        nameAr: null,
        nameEn: null,
      };
    }
  }

  return { costById, metaById, gamesById, offerToGame };
}

function sumOrderItemMetrics(order, costById, catalogMaps) {
  const items = order.order_items || [];
  let revenue = 0;
  let cost = 0;
  let trackedItems = 0;
  let totalItems = 0;
  let units = 0;
  const byOffer = {};
  const byGame = {};

  for (const item of items) {
    const qty = Math.max(1, Number.parseInt(item.quantity, 10) || 1);
    const itemRevenue = parseMoney(item.price) * qty;
    revenue += itemRevenue;
    totalItems += 1;
    units += qty;

    const unitCost = costById[item.offer_id];
    const offerKey = item.offer_id || item.name_snapshot || 'unknown';
    const displayName = item.name_snapshot
      || item.offers?.name_ar
      || item.offers?.name_en
      || '—';

    if (!byOffer[offerKey]) {
      byOffer[offerKey] = {
        offerId: item.offer_id || null,
        name: displayName,
        revenue: 0,
        cost: 0,
        profit: 0,
        units: 0,
        lineCount: 0,
        hasCost: false,
      };
    }
    byOffer[offerKey].revenue += itemRevenue;
    byOffer[offerKey].units += qty;
    byOffer[offerKey].lineCount += 1;

    const game = resolveItemGame(item, catalogMaps);
    const gameKey = game.gameId || 'unknown';
    if (!byGame[gameKey]) {
      byGame[gameKey] = {
        gameId: game.gameId,
        name: game.name,
        nameAr: game.nameAr,
        nameEn: game.nameEn,
        revenue: 0,
        cost: 0,
        profit: 0,
        units: 0,
        lineCount: 0,
        hasCost: false,
      };
    }
    byGame[gameKey].revenue += itemRevenue;
    byGame[gameKey].units += qty;
    byGame[gameKey].lineCount += 1;

    if (unitCost != null) {
      const itemCost = unitCost * qty;
      cost += itemCost;
      trackedItems += 1;
      byOffer[offerKey].cost += itemCost;
      byOffer[offerKey].hasCost = true;
      byOffer[offerKey].profit += itemRevenue - itemCost;
      byGame[gameKey].cost += itemCost;
      byGame[gameKey].hasCost = true;
      byGame[gameKey].profit += itemRevenue - itemCost;
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
    units: units || (totalItems > 0 ? totalItems : 1),
    byOffer,
    byGame,
  };
}

function buildDayBuckets(days, locale = 'en-US') {
  const buckets = [];
  const today = todayAtMidnight();
  const count = Math.max(1, days);

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(today.getTime() - offset * MS_PER_DAY);
    const key = date.toISOString().slice(0, 10);
    buckets.push({
      key,
      // Latin digits for axes so they match product prices
      label: date.toLocaleDateString(locale === 'ar' ? 'ar-SY' : 'en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
      labelShort: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      revenue: 0,
      cost: 0,
      profit: 0,
      orders: 0,
      units: 0,
    });
  }

  return buckets;
}

function finalizeBuyerList(buyersMap = {}) {
  return Object.values(buyersMap)
    .map((buyer) => {
      const revenue = roundMoney(buyer.revenue);
      const cost = roundMoney(buyer.cost);
      const profit = roundMoney(buyer.profit);
      const units = buyer.units || 0;
      const orders = buyer.orders || 0;
      const purchases = [...(buyer.purchases || [])]
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .map((p) => ({
          ...p,
          revenue: roundMoney(p.revenue),
          cost: roundMoney(p.cost),
          profit: roundMoney(p.profit),
        }));
      return {
        userId: buyer.userId,
        username: buyer.username,
        name: buyer.name,
        label: buyer.label,
        revenue,
        cost,
        profit,
        units,
        orders,
        lastOrderAt: buyer.lastOrderAt || null,
        marginPercent: revenue > 0 ? roundMoney((profit / revenue) * 100) : null,
        purchases,
      };
    })
    .sort((a, b) => (b.revenue || 0) - (a.revenue || 0) || (b.units || 0) - (a.units || 0));
}

function rankRows(rows, sortKey, limit = 10) {
  return [...rows]
    .sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0))
    .slice(0, limit)
    .map((row) => {
      const { buyers, ...rest } = row;
      const buyerList = finalizeBuyerList(buyers);
      return {
        ...rest,
        revenue: roundMoney(row.revenue),
        cost: roundMoney(row.cost),
        profit: roundMoney(row.profit),
        marginPercent: row.revenue > 0 ? roundMoney((row.profit / row.revenue) * 100) : null,
        buyerList,
        buyerCount: buyerList.length,
      };
    });
}

function resolveCustomerIdentity(order) {
  const profile = order?.profiles || null;
  const userId = order?.user_id || null;
  const username = String(profile?.username || '').trim() || null;
  const name = String(profile?.name || '').trim() || null;
  // Display name first; username is secondary in the UI.
  let label = '—';
  if (name) {
    label = name;
  } else if (username) {
    label = username.startsWith('@') ? username : `@${username}`;
  } else if (userId) {
    label = String(userId).slice(0, 8);
  }
  return {
    userId: userId || `anon:${label}`,
    username,
    name,
    label,
  };
}

function rankCustomerRows(rows, sortKey, limit, totalRevenue) {
  return [...rows]
    .sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0))
    .slice(0, limit)
    .map((row) => {
      const revenue = roundMoney(row.revenue);
      const cost = roundMoney(row.cost);
      const profit = roundMoney(row.profit);
      const orders = row.orders || 0;
      const orderList = [...(row.orderList || [])]
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .map((entry) => ({
          ...entry,
          revenue: roundMoney(entry.revenue),
          cost: roundMoney(entry.cost),
          profit: roundMoney(entry.profit),
          items: (entry.items || []).map((item) => ({
            ...item,
            revenue: roundMoney(item.revenue),
            cost: roundMoney(item.cost),
            profit: roundMoney(item.profit),
          })),
        }));
      return {
        userId: row.userId,
        username: row.username,
        name: row.name,
        label: row.label,
        revenue,
        cost,
        profit,
        orders,
        units: row.units || 0,
        lastOrderAt: row.lastOrderAt || null,
        avgOrderValue: orders > 0 ? roundMoney(revenue / orders) : 0,
        marginPercent: revenue > 0 ? roundMoney((profit / revenue) * 100) : null,
        sharePercent: totalRevenue > 0 ? roundMoney((revenue / totalRevenue) * 100) : 0,
        orderList,
      };
    });
}

/**
 * Profit & margin analytics for admin overview + full stats page.
 * @param {object[]} orders
 * @param {object[]} offers
 * @param {{ periodDays?: number|null, chartDays?: number|null, games?: object[], lang?: string, topLimit?: number }} options
 *   - periodDays: how far back KPIs/rankings look (null = all completed orders)
 *   - chartDays: day buckets for charts (defaults to periodDays or 30 when all-time)
 */
export function computeAdminProfitMetrics(orders = [], offers = [], {
  periodDays = 7,
  chartDays = null,
  games = [],
  lang = 'ar',
  topLimit = 10,
} = {}) {
  const catalogMaps = buildCatalogMaps(offers, games);
  const { costById, metaById } = catalogMaps;
  const today = todayAtMidnight();

  const resolvedChartDays = chartDays != null
    ? chartDays
    : (periodDays != null ? periodDays : 30);

  const dayBuckets = buildDayBuckets(resolvedChartDays, lang);
  const dayIndex = Object.fromEntries(dayBuckets.map((day, index) => [day.key, index]));

  let completedOrders = 0;
  let trackedRevenue = 0;
  let untrackedRevenue = 0;
  let supplierCost = 0;
  let grossProfit = 0;
  let partialOrders = 0;
  let totalUnits = 0;
  let totalRevenueAll = 0;

  const offerTotals = {};
  const gameTotals = {};
  const paymentTotals = {};
  const customerTotals = {};

  for (const order of orders) {
    if (!isCountableOrder(order)) continue;
    if (!isOrderInPeriod(order, periodDays, today)) continue;

    completedOrders += 1;
    const metrics = sumOrderItemMetrics(order, costById, catalogMaps);
    const dayKey = orderDayKey(order);
    const day = dayIndex[dayKey] != null ? dayBuckets[dayIndex[dayKey]] : null;

    totalRevenueAll += metrics.revenue;
    totalUnits += metrics.units;

    if (day) {
      day.revenue += metrics.revenue;
      day.cost += metrics.cost;
      day.profit += metrics.revenue - metrics.cost;
      day.orders += 1;
      day.units += metrics.units;
    }

    if (metrics.fullyTracked || metrics.cost > 0) {
      trackedRevenue += metrics.revenue;
      supplierCost += metrics.cost;
      grossProfit += metrics.revenue - metrics.cost;
      if (metrics.partialCost) partialOrders += 1;
    } else {
      untrackedRevenue += metrics.revenue;
    }

    const payMethod = order.payment_method || 'unknown';
    if (!paymentTotals[payMethod]) {
      paymentTotals[payMethod] = { method: payMethod, revenue: 0, orders: 0, cost: 0, profit: 0 };
    }
    paymentTotals[payMethod].revenue += metrics.revenue;
    paymentTotals[payMethod].orders += 1;
    paymentTotals[payMethod].cost += metrics.cost;
    paymentTotals[payMethod].profit += metrics.revenue - metrics.cost;

    const customer = resolveCustomerIdentity(order);
    if (!customerTotals[customer.userId]) {
      customerTotals[customer.userId] = {
        userId: customer.userId,
        username: customer.username,
        name: customer.name,
        label: customer.label,
        revenue: 0,
        cost: 0,
        profit: 0,
        orders: 0,
        units: 0,
        lastOrderAt: null,
        orderList: [],
      };
    }
    const cust = customerTotals[customer.userId];
    const orderProfit = metrics.revenue - metrics.cost;
    cust.revenue += metrics.revenue;
    cust.cost += metrics.cost;
    cust.profit += orderProfit;
    cust.orders += 1;
    cust.units += metrics.units;
    if (customer.username && !cust.username) cust.username = customer.username;
    if (customer.name && !cust.name) {
      cust.name = customer.name;
      cust.label = customer.name;
    } else if (customer.label && (cust.label === '—' || !cust.label)) {
      cust.label = customer.label;
    }
    const createdAt = order.created_at || null;
    if (createdAt && (!cust.lastOrderAt || createdAt > cust.lastOrderAt)) {
      cust.lastOrderAt = createdAt;
    }
    cust.orderList.push({
      orderId: order.id || null,
      createdAt,
      revenue: metrics.revenue,
      cost: metrics.cost,
      profit: orderProfit,
      units: metrics.units,
      paymentMethod: order.payment_method || null,
      items: Object.values(metrics.byOffer).map((item) => ({
        offerId: item.offerId,
        name: item.name,
        units: item.units,
        revenue: item.revenue,
        cost: item.cost,
        profit: item.profit,
      })),
    });

    for (const [key, row] of Object.entries(metrics.byOffer)) {
      // Start from zero — never seed with row values then += (that doubles cost/profit/revenue).
      if (!offerTotals[key]) {
        offerTotals[key] = {
          offerId: row.offerId ?? null,
          name: row.name || '—',
          revenue: 0,
          cost: 0,
          profit: 0,
          units: 0,
          lineCount: 0,
          hasCost: false,
          buyers: {},
        };
      }
      offerTotals[key].revenue += row.revenue;
      offerTotals[key].cost += row.cost;
      offerTotals[key].profit += row.profit;
      offerTotals[key].units += row.units;
      offerTotals[key].lineCount += row.lineCount;
      if (row.hasCost) offerTotals[key].hasCost = true;
      if (row.name && offerTotals[key].name === '—') offerTotals[key].name = row.name;

      // Who bought this pack (for expand → buyers list)
      const buyerId = customer.userId;
      if (!offerTotals[key].buyers[buyerId]) {
        offerTotals[key].buyers[buyerId] = {
          userId: customer.userId,
          username: customer.username,
          name: customer.name,
          label: customer.label,
          revenue: 0,
          cost: 0,
          profit: 0,
          units: 0,
          orders: 0,
          lastOrderAt: null,
          purchases: [],
        };
      }
      const buyer = offerTotals[key].buyers[buyerId];
      buyer.revenue += row.revenue;
      buyer.cost += row.cost;
      buyer.profit += row.profit;
      buyer.units += row.units;
      buyer.orders += 1;
      if (customer.username && !buyer.username) buyer.username = customer.username;
      if (customer.name && !buyer.name) {
        buyer.name = customer.name;
        buyer.label = customer.name;
      } else if (customer.label && (buyer.label === '—' || !buyer.label)) {
        buyer.label = customer.label;
      }
      if (createdAt && (!buyer.lastOrderAt || createdAt > buyer.lastOrderAt)) {
        buyer.lastOrderAt = createdAt;
      }
      buyer.purchases.push({
        orderId: order.id || null,
        createdAt,
        units: row.units,
        revenue: row.revenue,
        cost: row.cost,
        profit: row.profit,
      });
    }

    for (const [key, row] of Object.entries(metrics.byGame)) {
      if (!gameTotals[key]) {
        gameTotals[key] = {
          gameId: row.gameId,
          name: row.name,
          nameAr: row.nameAr,
          nameEn: row.nameEn,
          revenue: 0,
          cost: 0,
          profit: 0,
          units: 0,
          lineCount: 0,
          hasCost: false,
        };
      }
      gameTotals[key].revenue += row.revenue;
      gameTotals[key].cost += row.cost;
      gameTotals[key].profit += row.profit;
      gameTotals[key].units += row.units;
      gameTotals[key].lineCount += row.lineCount;
      if (row.hasCost) gameTotals[key].hasCost = true;
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
  const offerRows = Object.values(offerTotals);
  const gameRows = Object.values(gameTotals);
  const customerRows = Object.values(customerTotals);

  const avgOrderValue = completedOrders > 0
    ? roundMoney(totalRevenueAll / completedOrders)
    : 0;

  const paymentBreakdown = Object.values(paymentTotals)
    .map((row) => ({
      ...row,
      revenue: roundMoney(row.revenue),
      cost: roundMoney(row.cost),
      profit: roundMoney(row.profit),
      sharePercent: totalRevenueAll > 0
        ? roundMoney((row.revenue / totalRevenueAll) * 100)
        : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    periodDays,
    chartDayCount: resolvedChartDays,
    completedOrders,
    totalUnits,
    totalRevenue: roundMoney(totalRevenueAll),
    trackedRevenue: roundMoney(trackedRevenue),
    untrackedRevenue: roundMoney(untrackedRevenue),
    supplierCost: roundMoney(supplierCost),
    grossProfit: roundMoney(grossProfit),
    marginPercent,
    avgOrderValue,
    catalogMarginPercent,
    catalogOffersWithCost: catalogOffers.length,
    partialOrders,
    uniqueCustomers: customerRows.length,
    chartDays: dayBuckets.map((day) => ({
      ...day,
      revenue: roundMoney(day.revenue),
      cost: roundMoney(day.cost),
      profit: roundMoney(day.profit),
      revenuePct: Math.max(4, (day.revenue / chartMax) * 100),
      costPct: day.revenue > 0 ? Math.min(100, (day.cost / day.revenue) * 100) : 0,
      profitPct: day.revenue > 0 ? Math.max(0, ((day.revenue - day.cost) / day.revenue) * 100) : 0,
    })),
    topOffersByProfit: rankRows(
      offerRows.filter((r) => r.hasCost),
      'profit',
      topLimit,
    ),
    topOffersByRevenue: rankRows(offerRows, 'revenue', topLimit),
    topOffersByUnits: rankRows(offerRows, 'units', topLimit),
    topGamesByProfit: rankRows(
      gameRows.filter((r) => r.hasCost && r.gameId !== 'unknown'),
      'profit',
      topLimit,
    ),
    topGamesByRevenue: rankRows(
      gameRows.filter((r) => r.gameId !== 'unknown'),
      'revenue',
      topLimit,
    ),
    topGamesByUnits: rankRows(
      gameRows.filter((r) => r.gameId !== 'unknown'),
      'units',
      topLimit,
    ),
    topCustomersByRevenue: rankCustomerRows(customerRows, 'revenue', topLimit, totalRevenueAll),
    topCustomersByOrders: rankCustomerRows(customerRows, 'orders', topLimit, totalRevenueAll),
    topCustomersByProfit: rankCustomerRows(customerRows, 'profit', topLimit, totalRevenueAll),
    /** @deprecated prefer topOffersByProfit */
    topOffers: rankRows(
      offerRows.filter((r) => r.hasCost && r.profit > 0),
      'profit',
      5,
    ),
    paymentBreakdown,
    dailyReview: dayBuckets
      .filter((d) => d.orders > 0)
      .map((day) => ({
        ...day,
        revenue: roundMoney(day.revenue),
        cost: roundMoney(day.cost),
        profit: roundMoney(day.profit),
        marginPercent: day.revenue > 0
          ? roundMoney(((day.revenue - day.cost) / day.revenue) * 100)
          : null,
      }))
      .reverse(),
    formatUsd,
  };
}
