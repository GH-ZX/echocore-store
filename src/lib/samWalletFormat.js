/** Storefront / admin UI only care about USD + SYP (not USDT/EUR). */
export const SUPPLIER_SAM_CURRENCIES = ['USD', 'SYP'];

/** @deprecated use SUPPLIER_SAM_CURRENCIES — kept for any raw API dumps */
const CURRENCY_ORDER = ['USD', 'SYP'];

export function normalizeSamBalances(balances) {
  if (!Array.isArray(balances)) return [];
  const map = new Map();
  balances.forEach((row) => {
    const currency = String(row?.currency || '').toUpperCase();
    if (!currency) return;
    // Ignore USDT / EUR / other — store only uses USD + SYP
    if (currency !== 'USD' && currency !== 'SYP') return;
    const amount = Number(row?.amount);
    map.set(currency, Number.isFinite(amount) ? amount : 0);
  });
  // Only include currencies that were present in the payload (avoid inventing $0 EUR etc.)
  if (map.size === 0) return [];
  return CURRENCY_ORDER
    .filter((currency) => map.has(currency))
    .map((currency) => ({
      currency,
      amount: map.get(currency) ?? 0,
    }));
}

/** Display lines for a single wallet — USD then SYP only. */
export function getWalletDisplayBalanceLines(wallet) {
  const balances = Array.isArray(wallet?.balances) ? wallet.balances : [];
  if (!balances.length) return [];
  return SUPPLIER_SAM_CURRENCIES
    .map((currency) => {
      const row = balances.find((b) => String(b.currency).toUpperCase() === currency);
      if (!row) return null;
      return { currency, amount: Number(row.amount) || 0 };
    })
    .filter(Boolean);
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

/** Identifier sent to Sam API POST /v1/invoices for a linked wallet row. */
export function getSamWalletInvoiceIdentifier(wallet) {
  if (!wallet) return '';
  return String(
    wallet.identifier
    || wallet.walletAddress
    || wallet.phone
    || wallet.cashCode
    || wallet.accountNumber
    || wallet.id
    || '',
  ).trim();
}

export function findSamWalletByIdentifier(wallets, identifier) {
  const needle = String(identifier || '').trim().toLowerCase();
  if (!needle || !Array.isArray(wallets)) return null;
  return wallets.find((wallet) => {
    const candidates = [
      wallet.identifier,
      wallet.walletAddress,
      wallet.phone,
      wallet.cashCode,
      wallet.accountNumber,
      wallet.id,
    ]
      .filter((value) => value != null && String(value).trim() !== '')
      .map((value) => String(value).trim().toLowerCase());
    return candidates.includes(needle);
  }) || null;
}

/**
 * Normalize Sam wallet rows from listWallets / getAllWalletBalances for admin UI.
 * Matches overview supplier-wallets store shape.
 */
export function normalizeSamWalletRows(wallets) {
  if (!Array.isArray(wallets)) return [];
  return wallets.map((wallet) => {
    const rawBalances = Array.isArray(wallet.balances) ? wallet.balances : [];
    const hasBalancePayload = rawBalances.length > 0;
    const identifier = getSamWalletInvoiceIdentifier(wallet);
    return {
      ...wallet,
      id: wallet.id,
      provider: wallet.provider,
      providerDisplayName: wallet.providerDisplayName || wallet.provider,
      label: wallet.label || '',
      identifier,
      balances: hasBalancePayload ? normalizeSamBalances(rawBalances) : [],
      error: wallet.error || null,
      balanceOk: hasBalancePayload && !wallet.error,
    };
  });
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

/**
 * Aggregate Sam balances for the admin card (USD + SYP only).
 * Returns [] when no wallet has real balance data — avoids fake $0 lines.
 */
export function getSamSupplierBalanceLines(wallets, currencies = SUPPLIER_SAM_CURRENCIES) {
  const list = Array.isArray(wallets) ? wallets : [];
  const hasAnyBalance = list.some((wallet) => (
    Array.isArray(wallet?.balances) && wallet.balances.length > 0
  ));
  if (!hasAnyBalance) return [];

  return currencies
    .map((currency) => ({
      currency,
      amount: sumBalancesAcrossWallets(list, currency),
    }))
    .filter((row) => list.some((w) => (w.balances || []).some((b) => b.currency === row.currency)));
}