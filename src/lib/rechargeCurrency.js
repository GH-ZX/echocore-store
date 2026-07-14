export const RECHARGE_PAY_CURRENCIES = ['USD', 'SYP'];

/** Western digits (0–9) in both AR and EN UI — matches supplier wallet formatting. */
const AMOUNT_LOCALE = 'en-US';

export function normalizePayCurrency(value) {
  const code = String(value || 'USD').toUpperCase();
  return RECHARGE_PAY_CURRENCIES.includes(code) ? code : 'USD';
}

export function getSypPerUsd(paymentConfig = {}) {
  const rate = parseFloat(paymentConfig.sypPerUsd);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/** SYP to send for a target USD wallet credit. */
export function sypForUsd(usdAmount, sypPerUsd) {
  const usd = parseFloat(usdAmount);
  const rate = parseFloat(sypPerUsd);
  if (!Number.isFinite(usd) || !Number.isFinite(rate) || rate <= 0) return 0;
  return Math.round(usd * rate);
}

/** USD wallet credit from actual SYP received. */
export function usdFromSypPaid(sypAmount, sypPerUsd) {
  const syp = parseFloat(sypAmount);
  const rate = parseFloat(sypPerUsd);
  if (!Number.isFinite(syp) || !Number.isFinite(rate) || rate <= 0) return 0;
  return Math.round((syp / rate) * 100) / 100;
}

export function formatSypAmount(value) {
  const num = parseFloat(value);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat(AMOUNT_LOCALE, {
    maximumFractionDigits: 0,
  }).format(num);
}

function formatUsdAmountLabel(usdAmount) {
  const usd = parseFloat(usdAmount);
  if (!Number.isFinite(usd)) return '0';
  if (Math.abs(usd - Math.round(usd)) < 0.001) return String(Math.round(usd));
  return usd.toFixed(2);
}

/** e.g. $2 → 270 SYP (Western digits, standard arrow). */
export function formatUsdToSypConversion(usdAmount, sypAmount) {
  const syp = parseFloat(sypAmount);
  if (!Number.isFinite(syp) || syp <= 0) return '—';
  return `$${formatUsdAmountLabel(usdAmount)} → ${formatSypAmount(syp)} SYP`;
}

/** Base recharge rate, e.g. $1 → 135 SYP. */
export function formatSypExchangeRate(sypPerUsd) {
  const rate = parseFloat(sypPerUsd);
  if (!Number.isFinite(rate) || rate <= 0) return '—';
  return formatUsdToSypConversion(1, rate);
}

export function isSypRateRecentlyUpdated(paymentConfig = {}, withinHours = 72) {
  const ts = paymentConfig.sypRateUpdatedAt;
  if (!ts) return false;
  const updated = new Date(ts).getTime();
  if (!Number.isFinite(updated)) return false;
  return Date.now() - updated < withinHours * 60 * 60 * 1000;
}

/** Success-screen copy for full vs partial recharge completion. */
export function buildRechargeCompletedMessage({
  completed = {},
  t = {},
  formatMessage: formatMsg,
}) {
  const credited = parseFloat(completed.creditedAmount || completed.amount || 0);
  const requested = parseFloat(completed.requestedAmount || completed.amount || 0);
  const balance = `$${Number(completed.newBalance || 0).toFixed(2)}`;
  const isPartial = Math.abs(credited - requested) >= 0.01;

  if (!isPartial) {
    return formatMsg(t.rechargeCompletedDesc, {
      amount: `$${credited.toFixed(2)}`,
      balance,
    });
  }

  const payCurrency = normalizePayCurrency(completed.payCurrency);
  if (payCurrency === 'SYP') {
    const rate = parseFloat(completed.sypPerUsd);
    const paidSyp = parseFloat(completed.paidAmount);
    const paidLabel = Number.isFinite(paidSyp) && paidSyp > 0
      ? `${formatSypAmount(paidSyp)} SYP`
      : '—';
    const requestedLabel = Number.isFinite(rate) && rate > 0
      ? formatUsdToSypConversion(requested, sypForUsd(requested, rate))
      : `$${requested.toFixed(2)}`;
    return formatMsg(t.rechargeCompletedPartialSypDesc, {
      requested: requestedLabel,
      paid: paidLabel,
      credited: `$${credited.toFixed(2)}`,
      balance,
    });
  }

  return formatMsg(t.rechargeCompletedPartialDesc, {
    credited: `$${credited.toFixed(2)}`,
    requested: `$${requested.toFixed(2)}`,
    balance,
  });
}

export function formatInvoicePayLabel({ currency, amount, usdAmount }) {
  const code = normalizePayCurrency(currency);
  if (code === 'SYP') {
    const usd = parseFloat(usdAmount);
    if (Number.isFinite(usd) && usd > 0) {
      return formatUsdToSypConversion(usd, amount);
    }
    return `${formatSypAmount(amount)} SYP`;
  }
  const usd = parseFloat(amount);
  return `$${Number.isFinite(usd) ? usd.toFixed(2) : '0.00'}`;
}