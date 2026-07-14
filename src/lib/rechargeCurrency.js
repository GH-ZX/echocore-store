export const RECHARGE_PAY_CURRENCIES = ['USD', 'SYP'];

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

export function formatSypAmount(value, lang = 'ar') {
  const num = parseFloat(value);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-SY' : 'en-US', {
    maximumFractionDigits: 0,
  }).format(num);
}

export function isSypRateRecentlyUpdated(paymentConfig = {}, withinHours = 72) {
  const ts = paymentConfig.sypRateUpdatedAt;
  if (!ts) return false;
  const updated = new Date(ts).getTime();
  if (!Number.isFinite(updated)) return false;
  return Date.now() - updated < withinHours * 60 * 60 * 1000;
}

export function formatInvoicePayLabel({ currency, amount, lang = 'ar' }) {
  const code = normalizePayCurrency(currency);
  if (code === 'SYP') {
    return `${formatSypAmount(amount, lang)} SYP`;
  }
  const usd = parseFloat(amount);
  return `$${Number.isFinite(usd) ? usd.toFixed(2) : '0.00'}`;
}