const AMOUNT_LOCALE = 'en-US';

export const G2BULK_WALLET_CURRENCY = 'USDT';

export function normalizeG2bulkWallet(me) {
  if (!me || typeof me !== 'object') return null;

  const balance = Number(me.balance);
  return {
    balance: Number.isFinite(balance) ? balance : 0,
    currency: G2BULK_WALLET_CURRENCY,
    username: me.username || me.first_name || '',
    userId: me.user_id ?? null,
  };
}

export function getG2bulkBalanceLines(wallet) {
  if (!wallet) return [];
  return [{
    currency: wallet.currency || G2BULK_WALLET_CURRENCY,
    amount: Number(wallet.balance) || 0,
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