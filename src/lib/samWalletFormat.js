const CURRENCY_ORDER = ['USD', 'SYP', 'EUR'];

export function normalizeSamBalances(balances) {
  if (!Array.isArray(balances)) return [];
  const map = new Map();
  balances.forEach((row) => {
    const currency = String(row?.currency || '').toUpperCase();
    if (!currency) return;
    const amount = Number(row?.amount);
    map.set(currency, Number.isFinite(amount) ? amount : 0);
  });
  return CURRENCY_ORDER.map((currency) => ({
    currency,
    amount: map.get(currency) ?? 0,
  }));
}

export function formatSamCurrencyAmount(currency, amount, lang = 'ar') {
  const value = Number(amount);
  const safe = Number.isFinite(value) ? value : 0;
  const locale = lang === 'ar' ? 'ar-SY' : 'en-US';

  if (currency === 'USD') {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
  }

  if (currency === 'EUR') {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
  }

  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(safe)} SYP`;
}

export function sumBalancesAcrossWallets(wallets, currency) {
  const code = String(currency || '').toUpperCase();
  return (wallets || []).reduce((sum, wallet) => {
    const row = (wallet.balances || []).find((b) => b.currency === code);
    return sum + (Number(row?.amount) || 0);
  }, 0);
}