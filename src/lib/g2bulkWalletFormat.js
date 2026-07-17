const AMOUNT_LOCALE = 'en-US';

/** G2Bulk getMe balance is USD (see docs/g2bulk-api.md). */
export const G2BULK_WALLET_CURRENCY = 'USD';

/**
 * Parse G2Bulk getMe payload into a wallet row.
 * Returns null when balance is missing/invalid — never invent $0 from a bad response.
 */
export function normalizeG2bulkWallet(me) {
  if (!me || typeof me !== 'object') return null;

  const raw = me.balance ?? me.wallet_balance
    ?? (me.user && typeof me.user === 'object' ? me.user.balance : null)
    ?? (me.data && typeof me.data === 'object' ? me.data.balance : null);

  if (raw == null || raw === '') return null;

  const balance = Number(String(raw).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(balance)) return null;

  return {
    balance,
    currency: G2BULK_WALLET_CURRENCY,
    username: me.username || me.first_name || '',
    userId: me.user_id ?? null,
  };
}

export function getG2bulkBalanceLines(wallet) {
  if (!wallet || wallet.balance == null) return [];
  const amount = Number(wallet.balance);
  if (!Number.isFinite(amount)) return [];
  return [{
    currency: wallet.currency || G2BULK_WALLET_CURRENCY,
    amount,
  }];
}

export function formatG2bulkAmount(amount, currency = G2BULK_WALLET_CURRENCY) {
  const value = Number(amount);
  const safe = Number.isFinite(value) ? value : 0;
  const code = String(currency || G2BULK_WALLET_CURRENCY).toUpperCase();

  return `${new Intl.NumberFormat(AMOUNT_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(safe)} ${code}`;
}
