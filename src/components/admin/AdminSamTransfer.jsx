import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  BadgeCheck,
  CheckCircle,
  ClipboardPaste,
  Heart,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  fetchSamApiSettings,
  listSamTransfers,
  mapSamTransferError,
  isValidSamRecipient,
  sendSamTransfer,
  clearSamTransfers,
} from '../../lib/samApi';
import { decodeQrFromFile } from '../../lib/qrDecode';
import { formatDateTime, formatMessage } from '../../lib/i18n';

const SYRIATEL_PIN_RE = /^\d{4}$/;
const SHAMCASH_ID_RE = /^[0-9a-f]{32}$/i;
const CURRENCIES = ['USD', 'SYP', 'EUR'];

function formatAmount(currency, amount) {
  const value = Number(amount);
  const safe = Number.isFinite(value) ? value : 0;
  const code = String(currency || 'USD').toUpperCase();
  if (code === 'USD' || code === 'EUR') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(safe);
  }
  return `${code} ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(safe)}`;
}

function maskRecipient(value) {
  const raw = String(value || '').trim();
  if (raw.length <= 4) return raw;
  return `**** **** **** ${raw.slice(-4)}`;
}

function recipientLabel(tr, t) {
  return tr?.customer?.name
    || tr?.customer?.username
    || (tr?.method === 'syriatel' ? t.samSendMethodSyriatel : t.samSendMethodShamcash);
}

/**
 * Admin payout form (Sam API): send from the store wallet to a ShamCash / Syriatel wallet.
 * Used on the APIs page and on the dashboard overview (`bare` drops the own header).
 */
export default function AdminSamTransfer({
  t = {}, lang = 'ar', samSettings: samSettingsProp, onError, onSuccess, onTransferComplete,
  initialCustomer = null, bare = false,
}) {
  const [fetchedSettings, setFetchedSettings] = useState(null);
  const samSettings = samSettingsProp || fetchedSettings;

  const [view, setView] = useState('new');
  const [method, setMethod] = useState('shamcash');
  const [recipient, setRecipient] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(initialCustomer);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [note, setNote] = useState('');
  const [pinCode, setPinCode] = useState('');

  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  const [transfers, setTransfers] = useState([]);
  const [transfersTotal, setTransfersTotal] = useState(0);
  const [transfersLoading, setTransfersLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const transfersRequestRef = useRef(0);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const recipientInputRef = useRef(null);
  const qrFileInputRef = useRef(null);
  const [qrScanning, setQrScanning] = useState(false);
  const [qrError, setQrError] = useState('');
  const [qrScanNote, setQrScanNote] = useState('');
  const qrScanRequestRef = useRef(0);

  useEffect(() => {
    if (samSettingsProp) return undefined;
    let cancelled = false;
    fetchSamApiSettings()
      .then((data) => { if (!cancelled) setFetchedSettings(data || {}); })
      .catch(() => { if (!cancelled) setFetchedSettings({}); });
    return () => { cancelled = true; };
  }, [samSettingsProp]);

  useEffect(() => {
    if (initialCustomer) return;
    setMethod((current) => {
      if (current === 'shamcash' && samSettings?.sam_shamcash_wallet_identifier) return current;
      if (current === 'syriatel' && samSettings?.sam_syriatel_wallet_identifier) return current;
      return samSettings?.sam_shamcash_wallet_identifier || !samSettings?.sam_syriatel_wallet_identifier
        ? 'shamcash'
        : 'syriatel';
    });
  }, [initialCustomer, samSettings?.sam_shamcash_wallet_identifier, samSettings?.sam_syriatel_wallet_identifier]);

  useEffect(() => {
    if (!initialCustomer) return;
    setSelectedCustomer(initialCustomer);
    setMethod(initialCustomer.sam_shamcash_wallet_id ? 'shamcash' : 'syriatel');
    setRecipient(initialCustomer.sam_shamcash_wallet_id || initialCustomer.sam_syriatel_recipient || '');
  }, [initialCustomer]);

  const loadTransfers = useCallback(async (pageToLoad = page) => {
    const requestId = ++transfersRequestRef.current;
    setTransfersLoading(true);
    setHistoryError('');
    try {
      const data = await listSamTransfers({ page: pageToLoad, pageSize });
      if (requestId !== transfersRequestRef.current) return;
      setTransfers(data.transfers || []);
      setTransfersTotal(data.total ?? 0);
      setPage(data.page ?? 1);
    } catch (err) {
      if (requestId !== transfersRequestRef.current) return;
      setHistoryError(err.message);
      setTransfers([]);
    } finally {
      if (requestId === transfersRequestRef.current) setTransfersLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    loadTransfers(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClearTransfers = async () => {
    setClearing(true);
    setHistoryError('');
    try {
      const data = await clearSamTransfers();
      setTransfers([]);
      setTransfersTotal(0);
      setConfirmClear(false);
      onSuccess?.(data?.message || t.samSendHistoryCleared);
    } catch (err) {
      setHistoryError(err.message);
    } finally {
      setClearing(false);
    }
  };

  const sourceIdentifier = method === 'syriatel'
    ? samSettings?.sam_syriatel_wallet_identifier || ''
    : samSettings?.sam_shamcash_wallet_identifier || '';

  const recipientValid = isValidSamRecipient(method, recipient);
  const amountNumber = Number(amount);
  const amountValid = Number.isFinite(amountNumber) && amountNumber > 0;
  const pinValid = method === 'syriatel' ? SYRIATEL_PIN_RE.test(pinCode.trim()) : true;
  const formValid = !!sourceIdentifier && recipientValid && amountValid && pinValid;

  /** One entry per recipient, newest first; successful transfers win over failed ones. */
  const savedRecipients = useMemo(() => {
    const byKey = new Map();
    for (const tr of transfers) {
      const id = String(tr.recipientIdentifier || '').trim();
      if (!id) continue;
      const key = `${tr.method}:${id.toLowerCase()}`;
      const prev = byKey.get(key);
      if (!prev || (prev.status === 'failed' && tr.status !== 'failed')) byKey.set(key, tr);
    }
    return [...byKey.values()];
  }, [transfers]);

  const knownRecipient = useMemo(() => {
    const key = recipient.trim().toLowerCase();
    if (!key) return null;
    return savedRecipients.find((tr) => String(tr.recipientIdentifier).toLowerCase() === key) || null;
  }, [recipient, savedRecipients]);

  const selectRecipient = (tr) => {
    setMethod(tr.method === 'syriatel' ? 'syriatel' : 'shamcash');
    setRecipient(String(tr.recipientIdentifier || '').trim());
    if (tr.currency) setCurrency(String(tr.currency).toUpperCase());
    setSelectedCustomer(null);
    setQrError('');
    setQrScanNote('');
    setView('new');
  };

  const resetRecipient = (nextMethod = method) => {
    setSelectedCustomer(null);
    setRecipient('');
    setMethod(nextMethod);
    setQrError('');
    setQrScanNote('');
  };

  const submit = async () => {
    if (!formValid || sending) return;
    setSending(true);
    try {
      await sendSamTransfer({
        method,
        recipient: recipient.trim(),
        amount: amountNumber,
        currency,
        note,
        pinCode: pinCode.trim(),
        customerId: selectedCustomer?.id || null,
      });
      onSuccess?.(t.samSendSuccess);
      onTransferComplete?.(selectedCustomer);
      setRecipient('');
      setAmount('');
      setNote('');
      setConfirming(false);
      await loadTransfers(1);
    } catch (err) {
      onError?.(mapSamTransferError(err, t));
      setConfirming(false);
    } finally {
      setPinCode('');
      setSending(false);
    }
  };

  const pasteRecipient = async () => {
    try {
      const text = String(await navigator.clipboard.readText()).trim();
      if (text) {
        setRecipient(text);
        return;
      }
    } catch {
      // Clipboard read blocked — let the admin paste by hand.
    }
    recipientInputRef.current?.focus();
  };

  const handleQrFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const requestId = ++qrScanRequestRef.current;
    setQrError('');
    setQrScanNote('');
    setQrScanning(true);
    try {
      const decoded = await decodeQrFromFile(file);
      if (requestId !== qrScanRequestRef.current) return;
      if (!decoded) {
        setQrError(t.samQrDecodeFailed);
        return;
      }
      const cleaned = String(decoded).trim();
      if (SHAMCASH_ID_RE.test(cleaned)) {
        setMethod('shamcash');
        setRecipient(cleaned);
        setQrScanNote(t.samQrFilled);
      } else {
        setQrError(formatMessage(t.samQrUnrecognized, { value: cleaned }));
      }
    } catch {
      if (requestId === qrScanRequestRef.current) setQrError(t.samQrDecodeFailed);
    } finally {
      if (requestId === qrScanRequestRef.current) setQrScanning(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(transfersTotal / pageSize));
  const tabs = [
    { id: 'new', icon: Plus, label: t.samSendTabNew },
    { id: 'saved', icon: Heart, label: t.samSendTabSaved },
    { id: 'history', icon: History, label: t.samSendTabHistory },
  ];

  const content = (
    <div className="sam-send space-y-4">
      <div className="flex items-center gap-2">
        <div className="sam-send__tabs" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={view === tab.id}
              onClick={() => setView(tab.id)}
              className={`sam-send__tab ${view === tab.id ? 'is-active' : ''}`}
            >
              <tab.icon className={`w-4 h-4 ${tab.id === 'saved' && view === tab.id ? 'fill-current' : ''}`} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => loadTransfers(1)}
          disabled={transfersLoading}
          className="sam-send__icon-btn ms-auto"
          title={t.samSendHistoryRefresh}
          aria-label={t.samSendHistoryRefresh}
        >
          {transfersLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>

      {view === 'new' && (
        <div className="space-y-4">
          <div className="sam-send__methods">
            {['shamcash', 'syriatel'].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => { if (key !== method) resetRecipient(key); }}
                className={`sam-send__method ${method === key ? 'is-active' : ''}`}
              >
                {key === 'syriatel' ? t.samSendMethodSyriatel : t.samSendMethodShamcash}
              </button>
            ))}
          </div>

          {!sourceIdentifier && samSettings && (
            <p className="flex items-start gap-1.5 text-xs text-amber-300/90 leading-relaxed">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
              {t.samSendSourceMissing}
            </p>
          )}

          {recipientValid ? (
            <div className="sam-send__card flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 font-semibold text-sm truncate">
                  <span className="truncate">
                    {selectedCustomer?.name || selectedCustomer?.username || (knownRecipient ? recipientLabel(knownRecipient, t) : (method === 'syriatel' ? t.samSendMethodSyriatel : t.samSendMethodShamcash))}
                  </span>
                  {(selectedCustomer || knownRecipient?.customer) && (
                    <BadgeCheck className="w-4 h-4 shrink-0 text-[var(--accent)]" aria-label={t.samSendLinkedCustomer} />
                  )}
                </div>
                <div className="font-mono text-xs text-[var(--text-sec)] mt-0.5 truncate" dir="ltr" title={recipient}>
                  {recipient}
                </div>
              </div>
              <button
                type="button"
                onClick={() => resetRecipient()}
                className="sam-send__icon-btn"
                title={t.samSendChangeRecipient}
                aria-label={t.samSendChangeRecipient}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              {method === 'shamcash' && (
                <>
                  <input
                    ref={qrFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleQrFile}
                  />
                  <button
                    type="button"
                    onClick={() => { setQrError(''); setQrScanNote(''); qrFileInputRef.current?.click(); }}
                    disabled={qrScanning}
                    className="sam-send__drop"
                  >
                    {qrScanning
                      ? <Loader2 className="w-10 h-10 animate-spin" />
                      : <UploadCloud className="w-10 h-10" strokeWidth={1.6} />}
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {qrScanning ? t.samQrScanning : t.samSendQrUpload}
                    </span>
                  </button>
                  <div className="sam-send__or"><span>{t.samSendOr}</span></div>
                </>
              )}

              <div className="sam-send__paste">
                <input
                  ref={recipientInputRef}
                  className={`sam-send__paste-input ${recipient ? 'font-mono' : ''}`}
                  placeholder={method === 'syriatel' ? t.samSendRecipientSyriatelHint : t.samSendPastePlaceholder}
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value.trim())}
                  dir="auto"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={pasteRecipient}
                  className="sam-send__paste-btn"
                  title={t.samSendPaste}
                  aria-label={t.samSendPaste}
                >
                  <ClipboardPaste className="w-5 h-5" />
                </button>
              </div>
              {recipient && !recipientValid && (
                <p className="flex items-center gap-1 text-[11px] text-red-400 -mt-2">
                  <AlertCircle className="w-3 h-3" />
                  {method === 'syriatel' ? t.samSendRecipientSyriatelHint : t.samSendRecipientInvalid}
                </p>
              )}
            </>
          )}

          {qrScanNote && (
            <p className="flex items-center gap-1 text-[11px] text-emerald-400 -mt-2">
              <CheckCircle className="w-3 h-3" />
              {qrScanNote}
            </p>
          )}
          {qrError && (
            <p className="flex items-start gap-1 text-[11px] text-amber-300 -mt-2 leading-snug break-all">
              <AlertCircle className="w-3 h-3 shrink-0 mt-px" />
              {qrError}
            </p>
          )}

          {recipientValid && (
            <div className="space-y-3">
              <div className="sam-send__amount">
                <input
                  className="sam-send__amount-input"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-label={t.samSendAmount}
                  dir="ltr"
                />
                <div className="sam-send__currencies" dir="ltr">
                  {CURRENCIES.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setCurrency(code)}
                      className={`sam-send__currency ${currency === code ? 'is-active' : ''}`}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              </div>

              {method === 'syriatel' && (
                <input
                  className="sam-send__field font-mono"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder={t.samSendPinCode}
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
                  aria-label={t.samSendPinCode}
                />
              )}

              <input
                className="sam-send__field"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t.samSendNote}
                aria-label={t.samSendNote}
              />
            </div>
          )}

          <button
            type="button"
            disabled={!formValid}
            onClick={() => setConfirming(true)}
            className="btn btn-primary w-full justify-center gap-2 py-3 text-sm rounded-2xl disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {recipientValid ? t.samSendBtn : t.samSendContinue}
          </button>
        </div>
      )}

      {view === 'saved' && (
        savedRecipients.length === 0 ? (
          <EmptyState loading={transfersLoading} error={historyError} t={t} text={t.samSendSavedEmpty} onRetry={() => loadTransfers(1)} />
        ) : (
          <div className="space-y-2.5">
            {savedRecipients.map((tr) => (
              <button
                key={`${tr.method}:${tr.recipientIdentifier}`}
                type="button"
                onClick={() => selectRecipient(tr)}
                className="sam-send__card sam-send__card--button w-full flex items-center gap-3 text-start"
                title={t.samSendToThis}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{recipientLabel(tr, t)}</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="font-mono text-xs text-[var(--text-sec)] tracking-wide" dir="ltr">
                      {maskRecipient(tr.recipientIdentifier)}
                    </span>
                    {tr.customer && <BadgeCheck className="w-4 h-4 shrink-0 text-[var(--accent)]" aria-label={t.samSendLinkedCustomer} />}
                  </div>
                </div>
                <ArrowUpRight className="w-5 h-5 shrink-0 text-[var(--text-sec)] rtl:-scale-x-100" />
              </button>
            ))}
          </div>
        )
      )}

      {view === 'history' && (
        <div className="space-y-2.5">
          {transfers.length === 0 ? (
            <EmptyState loading={transfersLoading} error={historyError} t={t} text={t.samSendHistoryEmpty} onRetry={() => loadTransfers(1)} />
          ) : (
            transfers.map((tr) => {
              const failed = tr.status === 'failed';
              return (
                <button
                  key={tr.id}
                  type="button"
                  onClick={() => selectRecipient(tr)}
                  className="sam-send__card sam-send__card--button w-full flex items-center gap-3 text-start"
                  title={t.samSendToThis}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">{recipientLabel(tr, t)}</div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">
                      <span dir="ltr">{maskRecipient(tr.recipientIdentifier)}</span>
                      {tr.createdAt ? ` · ${formatDateTime(tr.createdAt, lang)}` : ''}
                      {tr.admin?.username ? ` · ${t.samSendBy} ${tr.admin.username}` : ''}
                    </div>
                    {failed && tr.samMessage ? (
                      <div className="text-[10px] text-red-400/90 truncate mt-0.5" dir="auto" title={tr.samMessage}>{tr.samMessage}</div>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-end">
                    <div
                      className={`flex items-center gap-1 font-bold text-sm tabular-nums ${failed ? 'text-[var(--text-muted)] line-through' : 'text-red-400'}`}
                      dir="ltr"
                    >
                      {!failed && <ArrowUpRight className="w-4 h-4" />}
                      {formatAmount(tr.currency, tr.amount)}
                    </div>
                    {failed && <div className="text-[10px] text-red-400 mt-0.5">{t.samSendStatusFailed}</div>}
                  </div>
                </button>
              );
            })
          )}

          {(transfersTotal > pageSize || transfersTotal > 0) && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {transfersTotal > pageSize && (
                <>
                  <span className="text-xs text-[var(--text-muted)]">
                    {formatMessage(t.samSendHistoryPage, { page, total: totalPages })}
                  </span>
                  <button
                    type="button"
                    disabled={page <= 1 || transfersLoading}
                    onClick={() => loadTransfers(page - 1)}
                    className="btn btn-secondary text-xs py-1.5 px-3 disabled:opacity-50"
                  >
                    {t.prev}
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages || transfersLoading}
                    onClick={() => loadTransfers(page + 1)}
                    className="btn btn-secondary text-xs py-1.5 px-3 disabled:opacity-50"
                  >
                    {t.next}
                  </button>
                </>
              )}
              <span className="ms-auto">
                {confirmClear ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="text-[11px] text-red-400">{t.samSendHistoryClearConfirm}</span>
                    <button
                      type="button"
                      disabled={clearing}
                      onClick={handleClearTransfers}
                      className="btn btn-secondary text-xs py-1.5 px-2.5 inline-flex items-center gap-1 border-red-500/40 text-red-400 disabled:opacity-50"
                    >
                      {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      {t.samSendHistoryClearYes}
                    </button>
                    <button
                      type="button"
                      disabled={clearing}
                      onClick={() => setConfirmClear(false)}
                      className="btn btn-secondary text-xs py-1.5 px-2.5 disabled:opacity-50"
                    >
                      {t.cancel}
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={clearing || transfersTotal === 0}
                    onClick={() => setConfirmClear(true)}
                    className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-red-400 disabled:opacity-40"
                    title={t.samSendHistoryClearTitle}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t.samSendHistoryClear}
                  </button>
                )}
              </span>
            </div>
          )}
        </div>
      )}

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60"
          onClick={() => { if (!sending) { setConfirming(false); setPinCode(''); } }}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-base">{t.samSendConfirmTitle}</h4>
              <button
                type="button"
                onClick={() => { setConfirming(false); setPinCode(''); }}
                className="sam-send__icon-btn ms-auto"
                aria-label={t.samSendCancel}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-center py-2">
              <div className="text-3xl font-black tabular-nums text-[var(--text-primary)]" dir="ltr">
                {formatAmount(currency, amountNumber)}
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-1">{t.samSendConfirmHelp}</p>
            </div>

            <div className="rounded-2xl border border-[var(--border)] divide-y divide-[var(--border)] text-sm">
              <ConfirmRow label={t.samSendTo} value={recipient.trim()} mono dir="ltr" />
              <ConfirmRow label={t.samSendFrom} value={sourceIdentifier} mono dir="ltr" />
              <ConfirmRow label={t.samSendCurrency} value={`${currency} · ${method === 'syriatel' ? t.samSendMethodSyriatel : t.samSendMethodShamcash}`} dir="ltr" />
              {note.trim() ? <ConfirmRow label={t.samSendNote} value={note.trim()} /> : null}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setConfirming(false); setPinCode(''); }}
                disabled={sending}
                className="btn btn-secondary text-sm py-3 justify-center rounded-2xl"
              >
                {t.samSendCancel}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={sending}
                className="btn btn-primary text-sm py-3 px-2 justify-center inline-flex items-center gap-2 rounded-2xl whitespace-nowrap disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {t.samSendConfirmSend}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (bare) return content;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-4 sm:p-5 space-y-4">
      <h3 className="font-bold text-lg">{t.samSendTitle}</h3>
      {content}
    </section>
  );
}

function EmptyState({ loading, error, t, text, onRetry }) {
  if (error) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-2xl bg-red-500/10 border border-red-500/25 text-red-400 text-sm">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        <span className="min-w-0">{error}</span>
        <button type="button" onClick={onRetry} className="ms-auto shrink-0 btn btn-secondary text-xs py-1 px-2">
          {t.retry || t.samSendHistoryRefresh}
        </button>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-sm text-[var(--text-sec)] py-6">
        <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
        {t.samTransferHistoryLoading}
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
      {text}
    </div>
  );
}

function ConfirmRow({ label, value, mono = false, dir }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
      <span className="text-xs text-[var(--text-muted)] shrink-0">{label}</span>
      <span
        className={`text-sm min-w-0 font-semibold ${mono ? 'font-mono text-xs break-all' : 'break-words'}`}
        dir={dir || undefined}
      >
        {value}
      </span>
    </div>
  );
}
