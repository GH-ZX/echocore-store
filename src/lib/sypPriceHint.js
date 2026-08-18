import { getSypPerUsd, sypForUsd, formatSypAmount } from './rechargeCurrency';

/**
 * Store-wide SYP rate cache for price hints. App.jsx syncs it whenever
 * paymentConfig hydrates so offer cards / buy panels can show "≈ X ل.س"
 * without prop-drilling the full payment config through every view.
 */
let cachedRate = null;

export function setSypRate(rate) {
  const n = parseFloat(rate);
  cachedRate = Number.isFinite(n) && n > 0 ? n : null;
}

export function getSypRate() {
  return cachedRate;
}

/** "≈ 20,000 ل.س" for AR visitors when a SYP rate is known; else null. */
export function getSypPriceHint(usdPrice, lang) {
  if (lang !== 'ar' || cachedRate == null) return null;
  const usd = parseFloat(usdPrice);
  if (!Number.isFinite(usd) || usd <= 0) return null;
  return `≈ ${formatSypAmount(sypForUsd(usd, cachedRate))} ل.س`;
}

export { getSypPerUsd };
