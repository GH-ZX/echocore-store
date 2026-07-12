const CURRENCY_ORDER = ['USD', 'USDT', 'SYP', 'EUR'];

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

const AMOUNT_LOCALE = 'en-US';

export function formatSamCurrencyAmount(currency, amount) {
  const value = Number(amount);
  const safe = Number.isFinite(value) ? value : 0;

  if (currency === 'USD') {
    return new Intl.NumberFormat(AMOUNT_LOCALE, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
  }

  if (currency === 'USDT') {
    return `${new Intl.NumberFormat(AMOUNT_LOCALE, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(safe)} USDT`;
  }

  if (currency === 'EUR') {
    return new Intl.NumberFormat(AMOUNT_LOCALE, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
  }

  return `${new Intl.NumberFormat(AMOUNT_LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(safe)} SYP`;
}

export function getSamWalletDisplayName(wallet) {
  const label = wallet?.label?.trim();
  if (label) return label;
  return wallet?.providerDisplayName || wallet?.provider || '';
}

export function getSamAccountLabel(wallets, fallback = '') {
  if (!Array.isArray(wallets)) return fallback;
  const label = wallets.map((w) => w.label?.trim()).find(Boolean);
  return label || fallback;
}

export function sumBalancesAcrossWallets(wallets, currency) {
  const code = String(currency || '').toUpperCase();
  return (wallets || []).reduce((sum, wallet) => {
    const row = (wallet.balances || []).find((b) => b.currency === code);
    return sum + (Number(row?.amount) || 0);
  }, 0);
}

export const SUPPLIER_SAM_CURRENCIES = ['USD', 'SYP'];

export function getSamSupplierBalanceLines(wallets, currencies = SUPPLIER_SAM_CURRENCIES) {
  return currencies.map((currency) => ({
    currency,
    amount: sumBalancesAcrossWallets(wallets, currency),
  }));
}