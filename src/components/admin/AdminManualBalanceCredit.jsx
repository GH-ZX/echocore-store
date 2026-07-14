import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, UserRound, Wallet, AlertCircle } from 'lucide-react';
import ConfirmDialog from '../ui/ConfirmDialog';
import { fetchAdminUsers } from '../../lib/adminModeration';
import {
  adminManualBalanceCredit,
  validateManualCreditAmount,
  validateShamcashTransactionRef,
} from '../../lib/adminBalanceCredit';
import { RECHARGE_PRESETS } from '../../lib/recharge';
import { formatMessage } from '../../lib/i18n';

const REASON_PRESETS = [
  'shamcashExpiredRecovery',
  'shamcashLeftPaymentPage',
  'shamcashVerifyFailed',
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
  className = '',
}) {
  const notifyError = useCallback((message) => onNotify?.(message, 'error'), [onNotify]);
  const notifySuccess = useCallback((message) => onNotify?.(message, 'success'), [onNotify]);

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

  const { valid: amountValid, value: amountValue } = validateManualCreditAmount(amount);
  const refCheck = validateShamcashTransactionRef(transactionRef);
  const reasonValid = reason.trim().length >= 5;
  const canSubmit = !!selectedUser?.id && amountValid && reasonValid && refCheck.valid;

  const reasonPresetOptions = useMemo(
    () => REASON_PRESETS.map((key) => ({
      key,
      label: t[`adminManualCreditReason_${key}`] || key,
    })),
    [t],
  );

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

  const handleCredit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const result = await adminManualBalanceCredit({
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
      onCredited?.(result);
      setConfirmOpen(false);
      resetForm();
    } catch (err) {
      notifyError(err.message || t.adminManualCreditFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`card p-5 sm:p-6 border border-amber-500/20 bg-amber-500/5 ${className}`}>
      <div className="flex items-start gap-3 mb-4">
        <Wallet className="w-5 h-5 text-amber-300 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <h3 className="font-bold text-base">{t.adminManualCreditTitle}</h3>
          <p className="text-xs text-[var(--text-sec)] mt-1 leading-relaxed max-w-2xl">
            {t.adminManualCreditHelp}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {!presetUser && (
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
                    <div className="font-semibold">{user.name || t.adminUsersUnnamed}</div>
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
              <div className="font-semibold truncate">{selectedUser.name || t.adminUsersUnnamed}</div>
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
        </div>

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

        {rechargeRequestId && (
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1.5">
              {t.adminManualCreditLinkedRequest}
            </label>
            <input
              type="text"
              value={rechargeRequestId}
              readOnly
              className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-4 py-2.5 font-mono text-xs text-[var(--text-muted)] outline-none"
            />
          </div>
        )}

        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1.5">{t.adminManualCreditReason}</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {reasonPresetOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setReason(option.label)}
                className="action-chip text-xs"
              >
                {option.label}
              </button>
            ))}
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={t.adminManualCreditReasonPlaceholder}
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-3 text-sm outline-none resize-y min-h-[5rem]"
          />
        </div>

        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={!canSubmit || saving}
          className="btn btn-primary w-full sm:w-auto gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
          {t.adminManualCreditSubmit}
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={t.adminManualCreditConfirmTitle}
        message={formatMessage(t.adminManualCreditConfirmBody, {
          amount: amountValid ? `$${amountValue.toFixed(2)}` : '$0.00',
          user: selectedUser?.name || selectedUser?.email || '—',
        })}
        confirmLabel={t.adminManualCreditSubmit}
        cancelLabel={t.cancel}
        variant="primary"
        onConfirm={handleCredit}
        onCancel={() => setConfirmOpen(false)}
        loading={saving}
      />
    </div>
  );
}