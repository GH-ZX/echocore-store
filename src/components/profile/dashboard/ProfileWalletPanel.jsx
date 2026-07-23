import { useState } from 'react';
import {
  Wallet,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
} from 'lucide-react';
import { formatMoney } from '../../../lib/userDashboard';
import { INVOICE_KIND } from '../../../lib/invoiceBuilder';

function formatDateTime(dateStr, lang) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString(lang === 'ar' ? 'ar-SY-u-nu-latn' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ProfileWalletPanel({
  t = {},
  lang = 'ar',
  balance = 0,
  transactions = [],
  recharges = [],
  onRecharge,
  navigate,
  paymentLabel,
  txLabel,
}) {
  const [section, setSection] = useState('ledger'); // ledger | recharges

  return (
    <div className="space-y-4">
      <div className="profile-balance-panel !mt-0">
        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
          {t.yourBalance}
        </p>
        <p className="text-3xl font-black font-mono text-[var(--accent)]">
          {formatMoney(balance)}
        </p>
        {onRecharge ? (
          <button
            type="button"
            onClick={onRecharge}
            className="action-chip btn btn-primary !h-11 gap-2 px-5 mt-3"
          >
            <Wallet className="w-4 h-4" />
            {t.recharge}
          </button>
        ) : null}
      </div>

      <div className="flex rounded-xl border border-[var(--border)] p-1 bg-[var(--bg-primary)]/40">
        <button
          type="button"
          onClick={() => setSection('ledger')}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg ${
            section === 'ledger'
              ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
              : 'text-[var(--text-sec)]'
          }`}
        >
          {t.transactionHistory}
        </button>
        <button
          type="button"
          onClick={() => setSection('recharges')}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg ${
            section === 'recharges'
              ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
              : 'text-[var(--text-sec)]'
          }`}
        >
          {t.dashRecharges}
        </button>
      </div>

      {section === 'ledger' ? (
        transactions.length === 0 ? (
          <div className="text-center py-10 text-[var(--text-sec)]">
            <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t.noTransactions}</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {transactions.map((tx) => {
              const amount = parseFloat(tx.amount || 0);
              const isCredit = amount > 0;
              return (
                <div
                  key={tx.id}
                  className="profile-list-item flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-lg ${isCredit ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {isCredit
                        ? <ArrowUpRight className="w-4 h-4" />
                        : <ArrowDownRight className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{txLabel?.(tx.type) || tx.type}</p>
                      <p className="text-[10px] text-[var(--text-muted)] truncate">
                        {paymentLabel?.(tx.payment_method) || tx.payment_method || '—'}
                        {' · '}
                        {formatDateTime(tx.created_at, lang)}
                      </p>
                      {tx.balance_after != null && (
                        <p className="text-[10px] text-[var(--text-muted)]">
                          {t.dashBalanceAfter}: {formatMoney(tx.balance_after)}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className={`font-mono font-bold flex-shrink-0 ${isCredit ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isCredit ? '+' : ''}{amount.toFixed(2)}
                  </p>
                </div>
              );
            })}
          </div>
        )
      ) : recharges.length === 0 ? (
        <div className="text-center py-10 text-[var(--text-sec)]">
          <Wallet className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{t.dashNoRecharges}</p>
          {onRecharge ? (
            <button type="button" onClick={onRecharge} className="action-chip btn btn-secondary mt-4 !h-11">
              {t.rechargeNow || t.recharge}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
          {recharges.map((r) => {
            const status = String(r.status || '').toLowerCase();
            const statusClass =
              status === 'approved' || status === 'completed' || status === 'paid'
                ? 'text-emerald-400'
                : status === 'pending' || status === 'payment_sent'
                  ? 'text-amber-400'
                  : status === 'rejected' || status === 'cancelled' || status === 'expired'
                    ? 'text-red-400'
                    : 'text-[var(--text-muted)]';
            return (
              <div
                key={r.id}
                className="profile-list-item flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {formatMoney(r.amount)}
                    {r.payment_method
                      ? ` · ${paymentLabel?.(r.payment_method) || r.payment_method}`
                      : ''}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {formatDateTime(r.created_at, lang)}
                  </p>
                  <p className={`text-[10px] font-semibold mt-0.5 ${statusClass}`}>
                    {r.status || '—'}
                  </p>
                </div>
                {navigate && r.id && (status === 'approved' || status === 'completed' || status === 'paid') && (
                  <button
                    type="button"
                    onClick={() => navigate(`/invoice/${INVOICE_KIND.RECHARGE}/${r.id}`)}
                    className="btn btn-secondary !p-2"
                    title={t.viewInvoice}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
