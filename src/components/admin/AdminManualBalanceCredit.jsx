import { useEffect, useState } from 'react';
import { Loader2, Search, UserRound, Wallet, AlertCircle, Minus, Plus } from 'lucide-react';
import ConfirmDialog from '../ui/ConfirmDialog';
import { fetchAdminUsers } from '../../lib/adminModeration';
import {
  adminAdjustUserBalance,
  adminManualBalanceCredit,
  validateManualCreditAmount,
  validateShamcashTransactionRef,
} from '../../lib/adminBalanceCredit';
import { formatMessage, formatMoney } from '../../lib/i18n';
import { useNotify } from '../../hooks/useNotify';

export default function AdminManualBalanceCredit({
  t = {},
  _lang = 'ar',
  onNotify,
  onCredited,
  presetUser = null,
  presetAmount = null,
  presetRequestId = null,
  presetTransactionRef = '',
  presetReason = '',
  /** When true, hide user search (user is fixed). */
  embedded = false,
  /** Allow debit (decrease balance). */
  allowDebit = true,
  className = '',
}) {
  const { notifyError, notifySuccess } = useNotify(onNotify);

  const [confirmAction, setConfirmAction] = useState('credit');
  const [searchInput, setSearchInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(presetUser);
  const [amount, setAmount] = useState(presetAmount != null ? String(presetAmount) : '');
  const [transactionRef, setTransactionRef] = useState(presetTransactionRef || '');
  const [reason, setReason] = useState('');
  const [rechargeRequestId, setRechargeRequestId] = useState(presetRequestId || '');
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (presetUser) setSelectedUser(presetUser);
  }, [presetUser]);

  useEffect(() => {
    if (presetAmount != null) setAmount(String(presetAmount));
  }, [presetAmount]);

  useEffect(() => {
    if (presetRequestId) setRechargeRequestId(presetRequestId);
  }, [presetRequestId]);

  useEffect(() => {
    if (presetTransactionRef) setTransactionRef(presetTransactionRef);
  }, [presetTransactionRef]);

  useEffect(() => {
    if (presetReason) setReason(presetReason);
  }, [presetReason]);

  const isDebit = confirmAction === 'debit' || confirmAction === 'zero';
  const isZeroAction = confirmAction === 'zero';
  const { valid: amountValid, value: amountValue } = validateManualCreditAmount(amount);
  const refCheck = validateShamcashTransactionRef(transactionRef);
  const hasUser = !!selectedUser?.id;
  const zeroAmount = selectedUser ? Number(selectedUser.balance || 0) : 0;
  const creditDisabled = !hasUser || !amountValid || saving;
  const debitDisabled =
    !hasUser || !amountValid || saving || Number(selectedUser?.balance || 0) < amountValue;
  const zeroDisabled = !hasUser || saving || zeroAmount <= 0;

  const runSearch = async () => {
    const query = searchInput.trim();
    if (!query) return;
    setSearching(true);
    try {
      const { rows } = await fetchAdminUsers(query, 12);
      setResults(rows);
      if (rows.length === 1) setSelectedUser(rows[0]);
    } catch (err) {
      notifyError(err.message);
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const resetForm = () => {
    if (!presetUser) setSelectedUser(null);
    if (presetAmount == null) setAmount('');
    if (!presetRequestId) setRechargeRequestId('');
    if (!presetTransactionRef) setTransactionRef('');
    setReason('');
    setResults([]);
    setSearchInput('');
  };

  const openConfirm = (dir) => {
    if (saving) return;
    if (dir === 'debit' && (!allowDebit || debitDisabled)) return;
    if (dir === 'credit' && creditDisabled) return;
    setConfirmAction(dir);
    setConfirmOpen(true);
  };

  const openZero = () => {
    if (saving || zeroDisabled) return;
    setConfirmAction('zero');
    setConfirmOpen(true);
  };

  const handleSubmit = async () => {
    if (!hasUser || saving) return;
    setSaving(true);
    try {
      let result;
      if (isZeroAction) {
        result = await adminAdjustUserBalance({
          userId: selectedUser.id,
          amount: 0,
          direction: 'debit',
          reason: reason.trim() || t.adminManualCreditReason_zeroed,
          forceZero: true,
        });
        notifySuccess(
          formatMessage(t.adminManualDebitSuccess, {
            amount: formatMoney(result.amount),
            user: result.userName || selectedUser.name || selectedUser.email,
            balance: formatMoney(result.newBalance || 0),
          }),
        );
      } else if (isDebit) {
        result = await adminAdjustUserBalance({
          userId: selectedUser.id,
          amount: amountValue,
          direction: 'debit',
          reason: reason.trim(),
          transactionRef: refCheck.value || null,
        });
        notifySuccess(
          formatMessage(t.adminManualDebitSuccess, {
            amount: formatMoney(result.amount),
            user: result.userName || selectedUser.name || selectedUser.email,
            balance: formatMoney(result.newBalance || 0),
          }),
        );
      } else if (rechargeRequestId) {
        result = await adminManualBalanceCredit({
          userId: selectedUser.id,
          amount: amountValue,
          reason: reason.trim(),
          transactionRef: refCheck.value || null,
          rechargeRequestId: rechargeRequestId || null,
        });
        notifySuccess(
          formatMessage(t.adminManualCreditSuccess, {
            amount: formatMoney(result.amount),
            user: result.userName || selectedUser.name || selectedUser.email,
            balance: formatMoney(result.newBalance || 0),
          }),
        );
      } else {
        result = await adminAdjustUserBalance({
          userId: selectedUser.id,
          amount: amountValue,
          direction: 'credit',
          reason: reason.trim(),
          transactionRef: refCheck.value || null,
        });
        notifySuccess(
          formatMessage(t.adminManualCreditSuccess, {
            amount: formatMoney(result.amount),
            user: result.userName || selectedUser.name || selectedUser.email,
            balance: formatMoney(result.newBalance || 0),
          }),
        );
      }

      // Keep selected user balance in sync when embedded
      if (selectedUser) {
        setSelectedUser((prev) => (prev ? { ...prev, balance: result.newBalance } : prev));
      }
      onCredited?.(result);
      setConfirmOpen(false);
      if (!embedded) resetForm();
      else {
        setReason('');
        setAmount('');
      }
    } catch (err) {
      notifyError(err.message || (isDebit ? t.adminManualDebitFailed : t.adminManualCreditFailed));
    } finally {
      setSaving(false);
    }
  };

  const hideSearch = embedded || !!presetUser;

  return (
    <div className={`card p-5 sm:p-6 border border-amber-500/20 bg-amber-500/5 ${className}`}>
      <div className="flex items-start gap-3 mb-4">
        <Wallet className="w-5 h-5 text-amber-300 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <h3 className="font-bold text-base">{t.adminManualWalletTitle || t.adminManualCreditTitle}</h3>
          <p className="text-xs text-[var(--text-sec)] mt-1 leading-relaxed max-w-2xl">
            {t.adminManualWalletHelp || t.adminManualCreditHelp}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {!hideSearch && (
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1.5">
              {t.adminManualCreditFindUser}
            </label>
            <div className="flex gap-2">
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                placeholder={t.adminManualCreditSearchPlaceholder}
                className="flex-1 bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-sm outline-none"
              />
              <button
                type="button"
                onClick={runSearch}
                disabled={searching || !searchInput.trim()}
                className="action-chip gap-2"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {t.adminManualCreditSearch}
              </button>
            </div>
            {results.length > 0 && (
              <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] overflow-hidden">
                {results.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => setSelectedUser(user)}
                    className={`w-full text-start px-3 py-2.5 text-sm border-b border-[var(--border)] last:border-0 hover:bg-[var(--accent)]/10 ${
                      selectedUser?.id === user.id ? 'bg-[var(--accent)]/10' : ''
                    }`}
                  >
                    <div className="font-semibold">
                      {user.username ? `@${user.username}` : (user.name || t.adminUsersUnnamed)}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)]">{user.email}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedUser && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-3 flex items-center gap-3">
            <UserRound className="w-8 h-8 text-[var(--accent)]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate font-mono text-[var(--accent)]">
                {selectedUser.username ? `@${selectedUser.username}` : (selectedUser.name || t.adminUsersUnnamed)}
              </div>
              <div className="text-xs text-[var(--text-muted)] truncate">{selectedUser.email}</div>
            </div>
            <div className="text-end">
              <div className="text-[10px] text-[var(--text-muted)]">{t.currentBalance}</div>
              <div className="font-mono font-bold text-[var(--accent)]">
                {formatMoney(selectedUser.balance || 0)}
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1.5">{t.adminManualCreditAmount}</label>
          <div className="flex items-center gap-2">
            {allowDebit && (
              <button
                type="button"
                onClick={() => openConfirm('debit')}
                disabled={debitDisabled}
                title={t.adminManualWalletDebit}
                aria-label={t.adminManualWalletDebit}
                className="flex items-center justify-center h-12 w-12 shrink-0 rounded-xl bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving && isDebit ? <Loader2 className="w-5 h-5 animate-spin" /> : <Minus className="w-5 h-5" />}
              </button>
            )}
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              className="flex-1 min-w-0 h-12 text-center text-lg font-mono bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-3 outline-none"
            />
            <button
              type="button"
              onClick={() => openConfirm('credit')}
              disabled={creditDisabled}
              title={t.adminManualWalletCredit}
              aria-label={t.adminManualWalletCredit}
              className="flex items-center justify-center h-12 w-12 shrink-0 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving && !isDebit ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            </button>
          </div>
          {isDebit && selectedUser && amountValid && Number(selectedUser.balance || 0) < amountValue && (
            <p className="text-[10px] text-red-400 mt-1">{t.adminManualDebitInsufficient}</p>
          )}
          {allowDebit && hasUser && (
            <button
              type="button"
              onClick={openZero}
              disabled={zeroDisabled}
              title={t.adminManualZeroBalance}
              className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)] transition-colors hover:border-red-500/40 hover:text-red-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t.adminManualZeroBalance}
            </button>
          )}
        </div>

        {rechargeRequestId && (
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1.5">
              {t.adminManualCreditTransactionRef}
            </label>
            <input
              type="text"
              value={transactionRef}
              onChange={(e) => setTransactionRef(e.target.value)}
              placeholder={t.samInvoiceTransactionRefPlaceholder}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 font-mono text-sm outline-none"
            />
            <p className="text-[10px] text-[var(--text-muted)] mt-1.5">{t.samInvoiceTransactionRefHint}</p>
            {!refCheck.valid && transactionRef.trim() && (
              <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {t.adminManualCreditRefInvalid}
              </p>
            )}
          </div>
        )}

        {rechargeRequestId && (
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1.5">
              {t.adminManualCreditLinkedRequest}
            </label>
            <input
              type="text"
              value={rechargeRequestId}
              readOnly
              className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-4 py-2.5 font-mono text-xs opacity-80"
            />
          </div>
        )}

        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1.5">{t.adminManualCreditReason}</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              isDebit
                ? (t.adminManualDebitReasonPlaceholder || t.adminManualCreditReasonPlaceholder)
                : t.adminManualCreditReasonPlaceholder
            }
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-sm outline-none"
          />
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={isZeroAction ? t.adminManualZeroConfirmTitle : (isDebit ? t.adminManualDebitConfirmTitle : t.adminManualCreditConfirmTitle)}
        message={formatMessage(
          isZeroAction ? t.adminManualZeroConfirmBody : (isDebit ? t.adminManualDebitConfirmBody : t.adminManualCreditConfirmBody),
          {
            amount: formatMoney(isZeroAction ? zeroAmount : amountValue),
            user: selectedUser?.username
              ? `@${selectedUser.username}`
              : (selectedUser?.name || selectedUser?.email || '—'),
          },
        )}
        confirmLabel={isZeroAction ? t.adminManualZeroBalance : (isDebit ? t.adminManualDebitSubmit : t.adminManualCreditSubmit)}
        cancelLabel={t.cancel}
        variant={isZeroAction || isDebit ? 'danger' : 'primary'}
        loading={saving}
        onConfirm={handleSubmit}
        onCancel={() => !saving && setConfirmOpen(false)}
      />
    </div>
  );
}
