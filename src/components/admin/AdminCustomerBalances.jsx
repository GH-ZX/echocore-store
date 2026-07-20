import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Search,
  Users,
  HandCoins,
  History,
} from 'lucide-react';
import { fetchAdminUsers } from '../../lib/adminModeration';
import { getAdminUserWalletFlowPath } from '../../lib/adminRoutes';
import { formatMessage } from '../../lib/i18n';
import { getProfileUsername } from '../../lib/username';

const PAGE_SIZE = 25;

const BALANCE_FILTERS = [
  { id: 'all', labelKey: 'adminCustomerBalancesFilterAll' },
  { id: 'positive', labelKey: 'adminCustomerBalancesFilterPositive' },
  { id: 'zero', labelKey: 'adminCustomerBalancesFilterZero' },
];

export default function AdminCustomerBalances({
  t = {},
  onNotify,
  onSelectForCredit,
  refreshKey = 0,
}) {
  const navigate = useNavigate();
  const notifyError = useCallback((message) => onNotify?.(message, 'error'), [onNotify]);

  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [balanceFilter, setBalanceFilter] = useState('all');
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1);
  const safePage = Math.min(page, totalPages - 1);

  const load = useCallback(async (search = query, pageIndex = safePage, bal = balanceFilter) => {
    setLoading(true);
    try {
      const { rows, total: count } = await fetchAdminUsers(
        search,
        PAGE_SIZE,
        pageIndex * PAGE_SIZE,
        { orderBy: 'balance', balanceFilter: bal },
      );
      setUsers(Array.isArray(rows) ? rows : []);
      setTotal(Number(count) || 0);
    } catch (err) {
      notifyError(err.message);
      setUsers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [query, safePage, balanceFilter, notifyError]);

  useEffect(() => {
    load(query, safePage, balanceFilter);
  }, [load, query, safePage, balanceFilter, refreshKey]);

  useEffect(() => {
    if (page > 0 && page >= totalPages) {
      setPage(Math.max(0, totalPages - 1));
    }
  }, [page, totalPages]);

  const pageBalanceSum = useMemo(
    () => users.reduce((sum, user) => sum + Number(user.balance || 0), 0),
    [users],
  );

  const runSearch = () => {
    setPage(0);
    setQuery(searchInput.trim());
  };

  const setFilter = (id) => {
    setBalanceFilter(id);
    setPage(0);
  };

  const openWalletFlow = (user) => {
    const key = getProfileUsername(user) || user?.id;
    if (!key) return;
    navigate(getAdminUserWalletFlowPath(key));
  };

  const rangeStart = total === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, (safePage + 1) * PAGE_SIZE);

  return (
    <section className="card overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-[var(--border)] flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black flex items-center gap-2">
            <Users className="w-5 h-5 text-[var(--accent)]" aria-hidden="true" />
            {t.adminCustomerBalancesTitle}
          </h2>
          <p className="text-xs text-[var(--text-sec)] mt-1 max-w-2xl leading-relaxed">
            {t.adminCustomerBalancesHelp}
          </p>
        </div>
        <div className="text-end">
          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">
            {t.adminCustomerBalancesTotal}
          </div>
          <div className="font-mono font-black text-[var(--accent)] text-lg">
            ${pageBalanceSum.toFixed(2)}
          </div>
          <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
            {formatMessage(t.adminCustomerBalancesCount, { count: total })}
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5 border-b border-[var(--border)] space-y-3">
        <div className="flex flex-wrap gap-2">
          {BALANCE_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`action-chip text-xs ${
                balanceFilter === f.id ? 'border-[var(--accent)]/50 text-[var(--accent)] bg-[var(--accent)]/10' : ''
              }`}
            >
              {t[f.labelKey] || f.id}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            placeholder={t.adminCustomerBalancesSearchPlaceholder}
            className="flex-1 min-w-[12rem] bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-sm outline-none"
          />
          <button type="button" onClick={runSearch} className="action-chip gap-2">
            <Search className="w-4 h-4" />
            {t.adminManualCreditSearch}
          </button>
          <button type="button" onClick={() => load(query, safePage, balanceFilter)} className="action-chip gap-2">
            <RefreshCw className="w-4 h-4" />
            {t.refresh}
          </button>
          {(query || balanceFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setQuery('');
                setBalanceFilter('all');
                setPage(0);
              }}
              className="action-chip text-xs"
            >
              {t.clearSearch}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-10 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--accent)]" />
        </div>
      ) : users.length === 0 ? (
        <div className="p-10 text-center text-[var(--text-sec)] text-sm">
          {t.adminCustomerBalancesEmpty}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-xs">
                  <th className="text-start p-3">{t.adminRechargeUser}</th>
                  <th className="text-start p-3">{t.email}</th>
                  <th className="text-end p-3">{t.balance}</th>
                  <th className="text-end p-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-[var(--border)] last:border-0 align-middle">
                    <td className="p-3 min-w-[8rem]">
                      <div className="font-semibold truncate">{user.name || t.adminUsersUnnamed}</div>
                      {user.username && (
                        <div className="text-[10px] text-[var(--text-muted)] font-mono">@{user.username}</div>
                      )}
                    </td>
                    <td className="p-3 text-[var(--text-sec)] text-xs break-all max-w-[14rem]">
                      {user.email || '—'}
                    </td>
                    <td className="p-3 text-end font-mono font-bold text-[var(--accent)] whitespace-nowrap">
                      ${Number(user.balance || 0).toFixed(2)}
                    </td>
                    <td className="p-3 text-end">
                      <div className="inline-flex flex-wrap justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openWalletFlow(user)}
                          className="action-chip gap-1 text-xs !py-1.5"
                          title={t.adminTrackPurchases}
                        >
                          <History className="w-3.5 h-3.5" />
                          {t.adminTrackPurchases}
                        </button>
                        {onSelectForCredit && (
                          <button
                            type="button"
                            onClick={() => onSelectForCredit(user)}
                            className="action-chip gap-1 text-xs !py-1.5"
                            title={t.adminManualCreditSubmit}
                          >
                            <HandCoins className="w-3.5 h-3.5" />
                            {t.adminManualCreditSubmit}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-3 sm:p-4 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-[var(--text-muted)]">
              {formatMessage(t.adminCustomerBalancesPageRange || '{from}–{to} of {total}', {
                from: rangeStart,
                to: rangeEnd,
                total,
              })}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="action-chip gap-1 text-xs disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
                {t.prev || 'Prev'}
              </button>
              <span className="text-xs font-mono text-[var(--text-sec)] min-w-[4.5rem] text-center">
                {safePage + 1} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages - 1 || loading}
                onClick={() => setPage((p) => p + 1)}
                className="action-chip gap-1 text-xs disabled:opacity-40"
              >
                {t.next || 'Next'}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
