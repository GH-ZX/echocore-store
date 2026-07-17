import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, UserRound, Wallet, AlertCircle, MinusCircle, PlusCircle } from 'lucide-react';
import ConfirmDialog from '../ui/ConfirmDialog';
import { fetchAdminUsers } from '../../lib/adminModeration';
import {
  adminAdjustUserBalance,
  adminManualBalanceCredit,
  validateManualCreditAmount,
  validateShamcashTransactionRef,
} from '../../lib/adminBalanceCredit';
import { RECHARGE_PRESETS } from '../../lib/recharge';
import { formatMessage } from '../../lib/i18n';

const REASON_PRESETS_CREDIT = [
  'shamcashExpiredRecovery',
  'shamcashLeftPaymentPage',
  'shamcashVerifyFailed',
];

const REASON_PRESETS_DEBIT = [
  'correctionDuplicateTopup',
  'correctionError',
  'abuseRecovery',
];

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
  /** Allow switching credit/debit (default true). */
  allowDebit = true,
  className = '',
}) {
  const notifyError = useCallback((message) => onNotify?.(message, 'error'), [onNotify]);
  const notifySuccess = useCallback((message) => onNotify?.(message, 'success'), [onNotify]);

  const [direction, setDirection] = useState('credit');
  const [searchInput, setSearchInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(presetUser);
  const [amount, setAmount] = useState(presetAmount != null ? String(presetAmount) : '10');
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

  const isDebit = direction === 'debit';
  const { valid: amountValid, value: amountValue } = validateManualCreditAmount(amount);
  const refCheck = validateShamcashTransactionRef(transactionRef);
  const reasonValid = reason.trim().length >= 5;
  const canSubmit = !!selectedUser?.id
    && amountValid
    && reasonValid
    && (isDebit || refCheck.valid)
    && (!isDebit || Number(selectedUser.balance || 0) >= amountValue);

  const reasonPresetOptions = useMemo(() => {
    const keys = isDebit ? REASON_PRESETS_DEBIT : REASON_PRESETS_CREDIT;
    return keys.map((key) => ({
      key,
      label: t[`adminManualCreditReason_${key}`] || key,
    }));
  }, [t, isDebit]);

  const runSearch = async () => {
    const query = searchInput.trim();
    if (!query) return;
    setSearching(true);
    try {
      const rows = await fetchAdminUsers(query, 12);
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
    if (presetAmount == null) setAmount('10');
    if (!presetRequestId) setRechargeRequestId('');
    if (!presetTransactionRef) setTransactionRef('');
    setReason('');
    setResults([]);
    setSearchInput('');
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      let result;
      if (isDebit) {
        result = await adminAdjustUserBalance({
          userId: selectedUser.id,
          amount: amountValue,
          direction: 'debit',
          reason: reason.trim(),
          transactionRef: refCheck.value || null,
        });
        notifySuccess(
          formatMessage(t.adminManualDebitSuccess, {
            amount: `$${parseFloat(result.amount).toFixed(2)}`,
            user: result.userName || selectedUser.name || selectedUser.email,
            balance: `$${Number(result.newBalance || 0).toFixed(2)}`,
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
            amount: `$${parseFloat(result.amount).toFixed(2)}`,
            user: result.userName || selectedUser.name || selectedUser.email,
            balance: `$${Number(result.newBalance || 0).toFixed(2)}`,
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
            amount: `$${parseFloat(result.amount).toFixed(2)}`,
            user: result.userName || selectedUser.name || selectedUser.email,
            balance: `$${Number(result.newBalance || 0).toFixed(2)}`,
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
        if (presetAmount == null) setAmount('10');
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
        {allowDebit && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDirection('credit')}
              className={`action-chip gap-1.5 text-xs ${!isDebit ? 'border-emerald-500/50 text-emerald-300' : ''}`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              {t.adminManualWalletCredit}
            </button>
            <button
              type="button"
              onClick={() => setDirection('debit')}
              className={`action-chip gap-1.5 text-xs ${isDebit ? 'border-red-500/50 text-red-300' : ''}`}
            >
              <MinusCircle className="w-3.5 h-3.5" />
              {t.adminManualWalletDebit}
            </button>
          </div>
        )}

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
                ${Number(selectedUser.balance || 0).toFixed(2)}
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1.5">{t.adminManualCreditAmount}</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {RECHARGE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmount(String(preset))}
                className={`action-chip text-xs ${amountValue === preset ? 'border-[var(--accent)] text-[var(--accent)]' : ''}`}
              >
                ${preset}
              </button>
            ))}
          </div>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 font-mono outline-none"
          />
          {isDebit && selectedUser && amountValid && Number(selectedUser.balance || 0) < amountValue && (
            <p className="text-[10px] text-red-400 mt-1">{t.adminManualDebitInsufficient}</p>
          )}
        </div>

        {!isDebit && (
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

        {rechargeRequestId && !isDebit && (
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
          <div className="flex flex-wrap gap-2 mb-2">
            {reasonPresetOptions.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setReason(opt.label)}
                className="action-chip text-xs"
              >
                {opt.label}
              </button>
            ))}
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              isDebit
                ? (t.adminManualDebitReasonPlaceholder || t.adminManualCreditReasonPlaceholder)
                : t.adminManualCreditReasonPlaceholder
            }
            rows={3}
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-sm outline-none resize-y"
          />
        </div>

        <button
          type="button"
          disabled={!canSubmit || saving}
          onClick={() => setConfirmOpen(true)}
          className={`btn w-full sm:w-auto ${isDebit ? 'bg-red-600 hover:bg-red-500 text-white border-red-600' : 'btn-primary'}`}
        >
          {saving
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : isDebit
              ? t.adminManualDebitSubmit
              : t.adminManualCreditSubmit}
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={isDebit ? t.adminManualDebitConfirmTitle : t.adminManualCreditConfirmTitle}
        message={formatMessage(
          isDebit ? t.adminManualDebitConfirmBody : t.adminManualCreditConfirmBody,
          {
            amount: `$${amountValue.toFixed(2)}`,
            user: selectedUser?.username
              ? `@${selectedUser.username}`
              : (selectedUser?.name || selectedUser?.email || '—'),
          },
        )}
        confirmLabel={isDebit ? t.adminManualDebitSubmit : t.adminManualCreditSubmit}
        cancelLabel={t.cancel}
        variant={isDebit ? 'danger' : 'primary'}
        loading={saving}
        onConfirm={handleSubmit}
        onCancel={() => !saving && setConfirmOpen(false)}
      />
    </div>
  );
}
