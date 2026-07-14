import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Search, Users, HandCoins } from 'lucide-react';
import { fetchAdminUsers } from '../../lib/adminModeration';
import { formatMessage } from '../../lib/i18n';

const LIST_LIMIT = 100;

export default function AdminCustomerBalances({
  t = {},
  onNotify,
  onSelectForCredit,
  refreshKey = 0,
}) {
  const notifyError = useCallback((message) => onNotify?.(message, 'error'), [onNotify]);

  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);

  const load = useCallback(async (search = query) => {
    setLoading(true);
    try {
      const rows = await fetchAdminUsers(search, LIST_LIMIT);
      setUsers(Array.isArray(rows) ? rows : []);
    } catch (err) {
      notifyError(err.message);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [query, notifyError]);

  useEffect(() => {
    load(query);
  }, [load, query, refreshKey]);

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0)),
    [users],
  );

  const totalBalance = useMemo(
    () => sortedUsers.reduce((sum, user) => sum + Number(user.balance || 0), 0),
    [sortedUsers],
  );

  const runSearch = () => setQuery(searchInput.trim());

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
            ${totalBalance.toFixed(2)}
          </div>
          <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
            {formatMessage(t.adminCustomerBalancesCount, { count: sortedUsers.length })}
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5 border-b border-[var(--border)] flex flex-wrap gap-2">
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
        <button type="button" onClick={() => load(query)} className="action-chip gap-2">
          <RefreshCw className="w-4 h-4" />
          {t.refresh}
        </button>
        {query && (
          <button
            type="button"
            onClick={() => {
              setSearchInput('');
              setQuery('');
            }}
            className="action-chip text-xs"
          >
            {t.clearSearch}
          </button>
        )}
      </div>

      {loading ? (
        <div className="p-10 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--accent)]" />
        </div>
      ) : sortedUsers.length === 0 ? (
        <div className="p-10 text-center text-[var(--text-sec)] text-sm">
          {t.adminCustomerBalancesEmpty}
        </div>
      ) : (
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
              {sortedUsers.map((user) => (
                <tr key={user.id} className="border-b border-[var(--border)] last:border-0 align-middle">
                  <td className="p-3 min-w-[8rem]">
                    <div className="font-semibold truncate">{user.name || t.adminUsersUnnamed}</div>
                  </td>
                  <td className="p-3 text-[var(--text-sec)] text-xs break-all max-w-[14rem]">
                    {user.email || '—'}
                  </td>
                  <td className="p-3 text-end font-mono font-bold text-[var(--accent)] whitespace-nowrap">
                    ${Number(user.balance || 0).toFixed(2)}
                  </td>
                  <td className="p-3 text-end whitespace-nowrap">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}