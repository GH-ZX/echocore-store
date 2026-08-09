import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  Copy,
  History,
  Loader2,
  RefreshCw,
  Smartphone,
} from 'lucide-react';
import { getSamWalletTransactions, fetchAllSamWalletBalances } from '../../lib/samApi';
import {
  getSamWalletDisplayName,
  getSamWalletInvoiceIdentifier,
  normalizeSamWalletRows,
} from '../../lib/samWalletFormat';
import { formatDateTime, formatMessage } from '../../lib/i18n';

const SHAMCASH_LOGO_SRC = '/shamcash-logo.svg';

function WalletIcon({ provider }) {
  if (provider === 'syriatel') {
    return (
      <span className="sam-wallet-row__icon sam-wallet-row__icon--syriatel" aria-hidden>
        <Smartphone className="w-4 h-4" strokeWidth={2} />
      </span>
    );
  }
  return (
    <span className="sam-wallet-row__icon sam-wallet-row__icon--sham" aria-hidden>
      <img
        src={SHAMCASH_LOGO_SRC}
        alt=""
        className="sam-wallet-row__brand-logo"
        width={22}
        height={26}
        decoding="async"
        draggable={false}
      />
    </span>
  );
}

function TxTypeBadge({ type, t }) {
  const isCredit = type === 'credit' || type === 'in';
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${
        isCredit
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
          : 'border-red-500/30 bg-red-500/10 text-red-300'
      }`}
    >
      {isCredit ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
      {isCredit ? t.samWalletTxIn : t.samWalletTxOut}
    </span>
  );
}

function formatTxAmount(currency, amount, type) {
  const value = Number(amount);
  const safe = Number.isFinite(value) ? value : 0;
  const isCredit = type === 'credit' || type === 'in';
  const sign = safe > 0 ? (isCredit ? '+' : '-') : '';
  const code = String(currency || 'USD').toUpperCase();
  const locale = 'en-US';

  let formatted;
  if (code === 'USD') {
    formatted = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(safe);
  } else if (code === 'EUR') {
    formatted = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(safe);
  } else {
    formatted = `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(safe)} ${code}`;
  }
  return `${sign}${formatted}`;
}

export default function AdminSamWalletHistory({ t = {}, lang = 'ar', onError, onSuccess }) {
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [wallets, setWallets] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [direction, setDirection] = useState('all');
  const [transactions, setTransactions] = useState([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [expandedId, setExpandedId] = useState(null);
  const onErrorRef = useRef(onError);
  const onSuccessRef = useRef(onSuccess);
  const walletsRequestRef = useRef(0);
  const transactionsRequestRef = useRef(0);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  const notifyError = useCallback((message) => {
    onErrorRef.current?.(message);
  }, []);

  const notifySuccess = useCallback((message) => {
    onSuccessRef.current?.(message);
  }, []);

  const loadWallets = useCallback(async () => {
    const requestId = ++walletsRequestRef.current;
    setWalletsLoading(true);
    try {
      const data = await fetchAllSamWalletBalances();
      if (requestId !== walletsRequestRef.current) return;
      const list = normalizeSamWalletRows(data?.wallets);
      setWallets(list);
      setSelectedId((prev) => {
        if (prev && list.some((w) => getSamWalletInvoiceIdentifier(w) === prev)) return prev;
        const sham = list.find((w) => w.provider !== 'syriatel');
        return getSamWalletInvoiceIdentifier(sham || list[0] || {});
      });
    } catch (err) {
      if (requestId === walletsRequestRef.current) notifyError(err.message);
    } finally {
      if (requestId === walletsRequestRef.current) setWalletsLoading(false);
    }
  }, [notifyError]);

  const loadTransactions = useCallback(async (identifier, dir) => {
    const requestId = ++transactionsRequestRef.current;
    if (!identifier) {
      setTransactions([]);
      setPage(1);
      setExpandedId(null);
      setLoadingTx(false);
      return;
    }
    setLoadingTx(true);
    try {
      const wallet = wallets.find((w) => getSamWalletInvoiceIdentifier(w) === identifier);
      const provider = wallet?.provider === 'syriatel' ? 'syriatel' : 'shamcash';
      const data = await getSamWalletTransactions(provider, identifier, dir);
      if (requestId !== transactionsRequestRef.current) return;
      setTransactions(data.transactions || []);
      setPage(1);
    } catch (err) {
      if (requestId === transactionsRequestRef.current) {
        notifyError(err.message);
        setTransactions([]);
      }
    } finally {
      if (requestId === transactionsRequestRef.current) setLoadingTx(false);
    }
  }, [wallets, notifyError]);

  useEffect(() => {
    loadWallets();
  }, [loadWallets]);

  useEffect(() => {
    loadTransactions(selectedId, direction);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, direction]);

  const totalPages = Math.max(1, Math.ceil(transactions.length / pageSize));
  const pageRows = useMemo(
    () => transactions.slice((page - 1) * pageSize, page * pageSize),
    [transactions, page, pageSize],
  );

  const copyRef = async (value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      notifySuccess(t.copied);
    } catch {
      notifyError(t.copyFailed);
    }
  };

  const selectedWallet = wallets.find((w) => getSamWalletInvoiceIdentifier(w) === selectedId);

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-xl shrink-0 bg-[var(--bg-surface)] text-[var(--text-sec)]">
            <History className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-base">{t.samWalletHistoryTitle}</h3>
            <p className="text-sm text-[var(--text-sec)] mt-0.5">{t.samWalletHistoryHelp}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => loadTransactions(selectedId, direction)}
          disabled={loadingTx || !selectedId}
          className="action-chip gap-1.5 text-xs"
        >
          {loadingTx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {t.samWalletHistoryRefresh}
        </button>
      </div>

      {walletsLoading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--text-sec)] py-4">
          <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
          {t.samExternalWalletLoading}
        </div>
      ) : wallets.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] py-4">{t.samApiNoWalletsYet}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-2">
              {wallets.map((wallet) => {
                const id = getSamWalletInvoiceIdentifier(wallet);
                const isActive = id === selectedId;
                return (
                  <button
                    key={String(wallet.id || id)}
                    type="button"
                    onClick={() => setSelectedId(id)}
                    className={`action-chip text-xs !h-9 !min-h-9 px-3 ${isActive ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10' : ''}`}
                  >
                    {getSamWalletDisplayName(wallet) || wallet.providerDisplayName || wallet.provider}: {id.slice(0, 14)}
                  </button>
                );
              })}
            </div>
            <span className="w-px bg-[var(--border)] mx-1 self-stretch hidden sm:block" aria-hidden />
            <div className="flex flex-wrap gap-2">
              {['all', 'in', 'out'].map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDirection(direction === key ? 'all' : key)}
                  className={`action-chip text-xs !h-9 !min-h-9 px-3 ${direction === key ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10' : ''}`}
                >
                  {t[`samWalletTxDir_${key}`] || key}
                </button>
              ))}
            </div>
          </div>

          {selectedWallet && (
            <div className="sam-wallet-row">
              <span className="sam-wallet-row__lead">
                <WalletIcon provider={selectedWallet.provider} />
                <span className="sam-wallet-row__copy">
                  <span className="sam-wallet-row__name">
                    {getSamWalletDisplayName(selectedWallet) || selectedWallet.providerDisplayName || selectedWallet.provider}
                  </span>
                  <span className="sam-wallet-row__hint font-mono" dir="ltr">
                    {selectedId}
                  </span>
                </span>
              </span>
              <span className="sam-wallet-row__amounts" dir="ltr">
                {(selectedWallet.balances || []).map((b) => (
                  <span key={b.currency} className="sam-wallet-row__amount font-mono">
                    {new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(b.amount)} {b.currency}
                  </span>
                ))}
              </span>
            </div>
          )}

          {loadingTx ? (
            <div className="flex items-center gap-2 text-sm text-[var(--text-sec)] py-6">
              <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
              {t.samExternalWalletLoading}
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] py-6 text-center">{t.samWalletTxEmpty}</p>
          ) : (
            <>
              <div className="space-y-2">
                {pageRows.map((tx) => {
                  const txType = String(tx.type || '').toLowerCase();
                  const isCredit = txType === 'credit' || txType === 'in';
                  const txId = String(tx.id || tx.occurredAt || '');
                  const expanded = expandedId === txId;
                  return (
                    <div
                      key={txId}
                      className={`rounded-xl border bg-[var(--bg-primary)] transition-colors ${
                        expanded ? 'border-[var(--accent)]/40' : 'border-[var(--border)]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : txId)}
                        className="w-full flex items-center gap-3 px-3.5 py-3 text-start"
                      >
                        <WalletIcon provider={selectedWallet?.provider} />
                        <span className="flex-1 min-w-0">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="text-sm font-semibold truncate">
                              {tx.counterparty || t.samWalletTxUnknownCounterparty}
                            </span>
                            <TxTypeBadge type={txType} t={t} />
                          </span>
                          <span className="block text-[11px] font-mono text-[var(--text-muted)] mt-0.5 truncate">
                            {tx.occurredAt ? formatDateTime(tx.occurredAt, lang) : ''}
                          </span>
                          {tx.description || tx.note ? (
                            <span className="block text-[11px] text-[var(--text-sec)] mt-0.5 truncate" dir="auto">
                              {tx.description || tx.note}
                            </span>
                          ) : null}
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span
                            className={`font-mono font-semibold tabular-nums text-sm ${
                              isCredit ? 'text-emerald-400' : 'text-red-400'
                            }`}
                            dir="ltr"
                          >
                            {formatTxAmount(tx.currency, tx.amount, txType)}
                          </span>
                          <ChevronDown
                            className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${expanded ? 'rotate-180' : ''}`}
                            aria-hidden
                          />
                        </span>
                      </button>

                      {expanded && (
                        <div className="px-3.5 pb-3.5 pt-1 space-y-3">
                          <div className="grid sm:grid-cols-2 gap-2 text-sm">
                            <DetailRow label={t.samWalletTxTypeLabel}>
                              <span className={isCredit ? 'text-emerald-400' : 'text-red-400'}>
                                {isCredit ? t.samWalletTxIn : t.samWalletTxOut}
                              </span>
                            </DetailRow>
                            <DetailRow label={t.samWalletTxAmountLabel} mono>
                              {formatTxAmount(tx.currency, tx.amount, txType)}
                            </DetailRow>
                            <DetailRow label={t.samWalletTxCounterpartyLabel}>
                              {tx.counterparty || t.samWalletTxUnknownCounterparty}
                            </DetailRow>
                            <DetailRow label={t.samWalletTxCurrencyLabel} mono>
                              {String(tx.currency || 'USD').toUpperCase()}
                            </DetailRow>
                            <DetailRow label={t.samWalletTxStatusLabel}>
                              {tx.status ? String(tx.status) : '—'}
                            </DetailRow>
                            <DetailRow label={t.samWalletTxOccurredLabel}>
                              {tx.occurredAt ? formatDateTime(tx.occurredAt, lang) : '—'}
                            </DetailRow>
                            <DetailRow label={t.samWalletTxRef} mono>
                              {tx.id ? (
                                <button
                                  type="button"
                                  onClick={() => copyRef(tx.id)}
                                  className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
                                >
                                  <span className="font-mono" dir="ltr">{tx.id}</span>
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <span className="text-[var(--text-muted)]">—</span>
                              )}
                            </DetailRow>
                          </div>
                          {tx.description || tx.note ? (
                            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                              <span className="block text-[11px] text-[var(--text-muted)] mb-1">
                                {t.samWalletTxDescriptionLabel}
                              </span>
                              <span dir="auto" className="break-words">{tx.description || tx.note}</span>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {transactions.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="text-xs text-[var(--text-muted)] tabular-nums">
                    {formatMessage(t.samHistoryPageInfo, {
                      from: (page - 1) * pageSize + 1,
                      to: Math.min(page * pageSize, transactions.length),
                      total: transactions.length,
                    })}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1">
                      {[25, 50, 100].map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() => {
                            setPageSize(size);
                            setPage(1);
                          }}
                          className={`action-chip text-[10px] !h-7 !min-h-7 px-2 ${
                            pageSize === size ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10' : ''
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="action-chip text-xs gap-1.5 disabled:opacity-40"
                    >
                      <ChevronDown className="w-3.5 h-3.5 rotate-90" aria-hidden />
                      {t.samHistoryPrev}
                    </button>
                    <span className="text-xs text-[var(--text-sec)] tabular-nums">
                      {t.samHistoryPage} {page} / {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="action-chip text-xs gap-1.5 disabled:opacity-40"
                    >
                      {t.samHistoryNext}
                      <ChevronDown className="w-3.5 h-3.5 -rotate-90" aria-hidden />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

function DetailRow({ label, children, mono = false }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 min-w-0">
      <span className="text-[11px] text-[var(--text-muted)] shrink-0">{label}</span>
      <span className={`text-xs truncate text-right ${mono ? 'font-mono' : ''}`}>{children}</span>
    </div>
  );
}
