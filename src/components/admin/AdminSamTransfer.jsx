import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Copy,
  History,
  Loader2,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import {
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

function formatAmount(currency, amount) {
  const value = Number(amount);
  const safe = Number.isFinite(value) ? value : 0;
  const code = String(currency || 'USD').toUpperCase();
  const locale = 'en-US';
  if (code === 'USD') {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(safe);
  }
  if (code === 'EUR') {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(safe);
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(safe)} ${code}`;
}

export default function AdminSamTransfer({
  t = {}, lang = 'ar', samSettings, onError, onSuccess, onTransferComplete,
  initialCustomer = null,
}) {
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
  const [formRef, setFormRef] = useState(null);
  const transfersRequestRef = useRef(0);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const qrFileInputRef = useRef(null);
  const [qrPreview, setQrPreview] = useState('');
  const [qrScanning, setQrScanning] = useState(false);
  const [qrError, setQrError] = useState('');
  const [qrScanNote, setQrScanNote] = useState('');
  const qrScanRequestRef = useRef(0);

  useEffect(() => {
    if (initialCustomer) return;
    setMethod((current) => {
      if (current === 'shamcash' && samSettings?.sam_shamcash_wallet_identifier) return current;
      if (current === 'syriatel' && samSettings?.sam_syriatel_wallet_identifier) return current;
      return samSettings?.sam_shamcash_wallet_identifier ? 'shamcash' : 'syriatel';
    });
  }, [initialCustomer, samSettings?.sam_shamcash_wallet_identifier, samSettings?.sam_syriatel_wallet_identifier]);

  useEffect(() => {
    if (!initialCustomer) return;
    setSelectedCustomer(initialCustomer);
    const nextMethod = initialCustomer.sam_shamcash_wallet_id ? 'shamcash' : 'syriatel';
    const nextRecipient = initialCustomer.sam_shamcash_wallet_id || initialCustomer.sam_syriatel_recipient || '';
    setMethod(nextMethod);
    setRecipient(nextRecipient);
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

  const recentRecipients = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const tr of transfers) {
      if (!tr.recipientIdentifier) continue;
      const key = String(tr.recipientIdentifier).toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        list.push(tr.recipientIdentifier);
      }
      if (list.length >= 5) break;
    }
    return list;
  }, [transfers]);

  const selectRecipient = (tr) => {
    setMethod(tr.method === 'syriatel' ? 'syriatel' : 'shamcash');
    setRecipient(String(tr.recipientIdentifier || '').trim());
    setCurrency((prev) => (prev ? prev : tr.currency || 'USD'));
    formRef?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      setPinCode('');
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

  const clearCustomer = (nextMethod = 'shamcash') => {
    setSelectedCustomer(null);
    setRecipient('');
    setMethod(nextMethod);
  };

  const copyValue = async (value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(String(value));
      onSuccess?.(t.copied);
    } catch {
      onError?.(t.copyFailed);
    }
  };

  const openQrPicker = () => {
    setQrError('');
    setQrScanNote('');
    qrFileInputRef.current?.click();
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
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('read-failed'));
        reader.readAsDataURL(file);
      });
      if (requestId !== qrScanRequestRef.current) return;
      setQrPreview(dataUrl);
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
      if (requestId === qrScanRequestRef.current) {
        setQrPreview('');
        setQrError(t.samQrDecodeFailed);
      }
    } finally {
      if (requestId === qrScanRequestRef.current) setQrScanning(false);
    }
  };

  const clearQr = () => {
    ++qrScanRequestRef.current;
    setQrPreview('');
    setQrError('');
    setQrScanNote('');
    setQrScanning(false);
  };

  const totalPages = Math.max(1, Math.ceil(transfersTotal / pageSize));
  const currentRecipientKey = recipient.trim().toLowerCase();

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-xl shrink-0 bg-[var(--bg-surface)] text-[var(--accent)]">
            <Send className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-base">{t.samSendTitle}</h3>
            <p className="text-sm text-[var(--text-sec)] mt-0.5">{t.samSendHelp}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => loadTransfers(1)}
          disabled={transfersLoading}
          className="action-chip gap-1.5 text-xs"
        >
          {transfersLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {t.samSendHistoryRefresh}
        </button>
      </div>

      <div ref={setFormRef} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-[var(--border)] text-[var(--text-sec)]">
            <ShieldCheck className="w-3.5 h-3.5" />
            {t.samSendAdminOnly}
          </span>
          {(['shamcash', 'syriatel'].map((key) => (
            <button
              key={key}
              type="button"
               onClick={() => clearCustomer(key)}
              className={`action-chip text-xs !h-9 !min-h-9 px-3 ${
                method === key ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10' : ''
              }`}
            >
              {key === 'syriatel' ? <Smartphone className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
              {key === 'syriatel' ? t.samSendMethodSyriatel : t.samSendMethodShamcash}
            </button>
          )))}
        </div>

        <label className="text-xs space-y-1 block">
          <span className="font-semibold text-[var(--text-sec)]">{t.samSendSource}</span>
          <input
            className="profile-field-input text-sm w-full font-mono disabled:opacity-60"
            value={sourceIdentifier || t.samSendSourceMissing}
            disabled
            dir="ltr"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs space-y-1 block">
            <span className="font-semibold text-[var(--text-sec)]">{t.samSendRecipient}</span>
            <span className="block text-[10px] text-[var(--text-muted)] leading-snug">
              {method === 'syriatel' ? t.samSendRecipientSyriatelHint : t.samSendRecipientHint}
            </span>
            <input
              className={`profile-field-input text-sm w-full font-mono ${recipient ? (recipientValid ? '' : 'border-red-500/60') : ''}`}
              placeholder={method === 'syriatel' ? '0991234567' : '879be352768766cb4acc3c7a'}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value.trim())}
              dir="ltr"
            />
            <input
              ref={qrFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleQrFile}
            />
            <div className="flex items-center gap-2 pt-1.5">
              <button
                type="button"
                onClick={openQrPicker}
                disabled={qrScanning}
                className="action-chip gap-1.5 text-xs !h-8 !min-h-8"
              >
                {qrScanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5" />}
                {qrScanning ? t.samQrScanning : t.samQrScan}
              </button>
              {qrPreview && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <img src={qrPreview} alt={t.samQrPreviewAlt} className="w-8 h-8 rounded-md object-cover border border-[var(--border)] shrink-0" />
                  <button
                    type="button"
                    onClick={clearQr}
                    className="p-1 text-[var(--text-muted)] hover:text-red-400 rounded-md"
                    title={t.samQrClear}
                    aria-label={t.samQrClear}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
            {qrScanNote && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-400 pt-1">
                <CheckCircle className="w-3 h-3" />
                {qrScanNote}
              </span>
            )}
            {qrError && (
              <span className="flex items-start gap-1 text-[11px] text-amber-300 pt-1 leading-snug break-all">
                <AlertCircle className="w-3 h-3 shrink-0 mt-px" />
                {qrError}
              </span>
            )}
            {selectedCustomer && recipient.trim() !== String(selectedCustomer.sam_shamcash_wallet_id || selectedCustomer.sam_syriatel_recipient || '').trim() && (
              <span className="block text-[11px] text-amber-300 pt-1">{t.samCustomerRecipientChanged}</span>
            )}
            {recipient && !recipientValid && (
              <span className="flex items-center gap-1 text-[11px] text-red-400 pt-1">
                <AlertCircle className="w-3 h-3" />
                {t.samSendRecipientInvalid}
              </span>
            )}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs space-y-1 block">
              <span className="font-semibold text-[var(--text-sec)]">{t.samSendAmount}</span>
              <input
                className="profile-field-input text-sm w-full"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                dir="ltr"
              />
            </label>
            <label className="text-xs space-y-1 block">
              <span className="font-semibold text-[var(--text-sec)]">{t.samSendCurrency}</span>
              <select
                className="profile-field-input text-sm w-full"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                dir="ltr"
              >
                {['USD', 'SYP', 'EUR'].map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {method === 'syriatel' && (
          <label className="text-xs space-y-1 block">
            <span className="font-semibold text-[var(--text-sec)]">{t.samSendPinCode}</span>
            <span className="block text-[10px] text-[var(--text-muted)] leading-snug">{t.samSendPinCodeHint}</span>
            <input
              className="profile-field-input text-sm w-full font-mono"
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="0000"
              value={pinCode}
              onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
              dir="ltr"
            />
          </label>
        )}

        <label className="text-xs space-y-1 block">
          <span className="font-semibold text-[var(--text-sec)]">{t.samSendNote}</span>
          <span className="block text-[10px] text-[var(--text-muted)] leading-snug">{t.samSendNoteHint}</span>
          <input
            className="profile-field-input text-sm w-full"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t.samSendNotePlaceholder}
          />
        </label>

        {!sourceIdentifier && (
          <p className="text-xs text-amber-300/90 leading-relaxed">{t.samSendSourceMissing}</p>
        )}

        {recentRecipients.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-[var(--text-muted)]">{t.samSendRecipientRecent}</span>
            <div className="flex flex-wrap gap-2">
              {recentRecipients.map((addr) => (
                <button
                  key={addr}
                  type="button"
                  onClick={() => setRecipient(addr)}
                  className="action-chip text-[11px] font-mono px-2.5 py-1"
                  dir="ltr"
                >
                  {addr.slice(0, 12)}…
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          disabled={!formValid}
          onClick={() => setConfirming(true)}
          className="btn btn-primary text-sm py-2.5 px-4 w-full sm:w-auto inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
          {t.samSendBtn}
        </button>
      </div>

      {confirming && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => { if (!sending) { setConfirming(false); setPinCode(''); } }}>
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-[var(--accent)]/12 text-[var(--accent)]">
                <Send className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-base">{t.samSendConfirmTitle}</h4>
              <button
                type="button"
                 onClick={() => { setConfirming(false); setPinCode(''); }}
                className="ms-auto inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-[var(--bg-elevated)] text-[var(--text-sec)]"
                aria-label={t.samSendCancel}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--text-muted)] leading-relaxed">{t.samSendConfirmHelp}</p>

            <div className="rounded-xl border border-[var(--border)] divide-y divide-[var(--border)] text-sm">
              <ConfirmRow label={t.samSendMethodShamcash} value={method === 'syriatel' ? t.samSendMethodSyriatel : t.samSendMethodShamcash} />
              <ConfirmRow label={t.samSendFrom} value={sourceIdentifier} mono dir="ltr" />
              <ConfirmRow label={t.samSendTo} value={recipient.trim()} mono dir="ltr" />
              <ConfirmRow label={t.samSendAmount} value={formatAmount(currency, amountNumber)} strong dir="ltr" />
              <ConfirmRow label={t.samSendCurrency} value={currency} mono dir="ltr" />
              {note.trim() ? <ConfirmRow label={t.samSendNote} value={note.trim()} /> : null}
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
              <button
                type="button"
                 onClick={() => { setConfirming(false); setPinCode(''); }}
                disabled={sending}
                className="btn btn-secondary text-sm py-2.5 px-4 w-full sm:w-auto justify-center"
              >
                {t.samSendCancel}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={sending}
                className="btn btn-primary text-sm py-2.5 px-4 w-full sm:w-auto justify-center inline-flex items-center gap-2 disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {t.samSendConfirmSend}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="pt-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <History className="w-4 h-4 text-[var(--accent)]" />
          <h4 className="text-sm font-semibold">{t.samSendHistoryTitle}</h4>
          <span className="text-xs font-mono font-bold text-[var(--accent)] bg-[var(--accent)]/12 rounded-full px-2 py-0.5" dir="ltr">
            {transfersTotal}
          </span>
          <span className="text-[11px] text-[var(--text-muted)]">{t.samSendHistorySelectHelp}</span>
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
                className="btn btn-secondary text-xs py-1.5 px-2.5 inline-flex items-center gap-1 border-red-500/40 text-red-400 disabled:opacity-40"
                title={t.samSendHistoryClearTitle}
              >
                {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {t.samSendHistoryClear}
              </button>
            )}
          </span>
        </div>

        {historyError ? (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="min-w-0">{historyError}</span>
            <button type="button" onClick={() => loadTransfers(1)} className="ms-auto shrink-0 btn btn-secondary text-xs py-1 px-2">
              {t.retry || t.samSendHistoryRefresh}
            </button>
          </div>
        ) : transfersLoading && transfers.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-[var(--text-sec)] py-3">
            <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
            {t.samTransferHistoryLoading}
          </div>
        ) : transfers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
            {t.samSendHistoryEmpty}
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--border)] divide-y divide-[var(--border)]">
            {transfers.map((tr) => (
              <TransferRow
                key={tr.id}
                transfer={tr}
                t={t}
                lang={lang}
                selected={String(tr.recipientIdentifier || '').toLowerCase() === currentRecipientKey}
                onSelect={() => selectRecipient(tr)}
                onCopy={copyValue}
              />
            ))}
          </div>
        )}

        {transfersTotal > pageSize && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-xs text-[var(--text-muted)]">
              {formatMessage(t.samSendHistoryPage || 'Page {page} / {total}', { page, total: totalPages })}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || transfersLoading}
                onClick={() => loadTransfers(page - 1)}
                className="btn btn-secondary text-xs py-2 px-3 disabled:opacity-50"
              >
                {t.prev}
              </button>
              <button
                type="button"
                disabled={page >= totalPages || transfersLoading}
                onClick={() => loadTransfers(page + 1)}
                className="btn btn-secondary text-xs py-2 px-3 disabled:opacity-50"
              >
                {t.next}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ConfirmRow({ label, value, mono = false, strong = false, dir }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
      <span className="text-xs text-[var(--text-muted)] shrink-0">{label}</span>
      <span
        className={`text-sm min-w-0 ${strong ? 'font-bold text-[var(--accent)]' : 'font-semibold'} ${mono ? 'font-mono text-xs break-all' : 'break-words'}`}
        dir={dir || undefined}
      >
        {value}
      </span>
    </div>
  );
}

function TransferRow({ transfer: tr, t, lang, selected, onSelect, onCopy }) {
  const failed = tr.status === 'failed';
  return (
    <div
      className={`flex items-stretch gap-1.5 sm:gap-2 p-2.5 sm:px-3 transition-colors ${selected ? 'bg-[var(--accent)]/10' : 'hover:bg-[var(--bg-elevated)]'}`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex-1 min-w-0 text-start flex flex-wrap items-center gap-x-2 gap-y-1 sm:gap-3"
        title={t.samSendToThis}
      >
        <span className={`shrink-0 w-2 h-2 rounded-full self-center ${failed ? 'bg-red-400' : 'bg-emerald-400'}`} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-xs text-[var(--text-primary)] truncate" dir="ltr">
            {tr.recipientIdentifier}
          </span>
          <span className="block text-[11px] text-[var(--text-muted)] truncate">
            {tr.method === 'syriatel' ? t.samSendMethodSyriatel : t.samSendMethodShamcash}
            {tr.admin?.username ? ` · ${t.samSendBy} ${tr.admin.username}` : ''}
            {tr.customer?.name ? ` · ${tr.customer.name}` : ''}
            {tr.createdAt ? ` · ${formatDateTime(tr.createdAt, lang)}` : ''}
          </span>
          {failed && tr.samMessage ? (
            <span className="block text-[10px] text-red-400/90 truncate" dir="auto" title={tr.samMessage}>
              {tr.samMessage}
            </span>
          ) : null}
        </span>
        <span className={`shrink-0 font-mono text-xs font-bold w-full sm:w-auto ${failed ? 'text-[var(--text-sec)]' : 'text-[var(--text-primary)]'}`} dir="ltr">
          {formatAmount(tr.currency, tr.amount)}
        </span>
      </button>

      <button
        type="button"
        onClick={() => onCopy(tr.recipientIdentifier)}
        className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-elevated)]"
        title={t.samSendCopyRecipient}
        aria-label={t.samSendCopyRecipient}
      >
        <Copy className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        onClick={onSelect}
        className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--accent)]/12 text-[var(--accent)] hover:bg-[var(--accent)]/20"
        title={t.samSendToThis}
        aria-label={t.samSendToThis}
      >
        <Send className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
