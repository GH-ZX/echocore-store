import { useState } from 'react';
import { Loader2, RefreshCw, Undo2 } from 'lucide-react';
import ConfirmDialog from '../ui/ConfirmDialog';
import {
  listOfferPriceSnapshots,
  repriceG2bulkOffers,
  restoreOfferPriceSnapshot,
  saveG2bulkSettings,
} from '../../lib/g2bulk';
import { formatDateTime, formatMessage } from '../../lib/i18n';
import { PRICE_ROUND_STEPS, applyMarkup, normalizeRoundStep } from '../../lib/offerPricing';

const EXAMPLE_COST = 0.96;

function stepText(step) {
  return Number(step).toFixed(2);
}

/**
 * Store-wide "round prices up to the next X" setting, plus an immediate
 * reprice (server snapshots prices first) and one-click undo.
 */
export default function AdminPriceRoundingPanel({
  t = {},
  lang = 'ar',
  roundStep = 0,
  markupPercent = 12,
  onStepSaved,
  onPricesChanged,
}) {
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null);

  const step = normalizeRoundStep(roundStep);
  const rawExample = applyMarkup(EXAMPLE_COST, markupPercent);
  const roundedExample = applyMarkup(EXAMPLE_COST, markupPercent, step);

  const handleSelect = async (next) => {
    if (saving || next === step) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const saved = await saveG2bulkSettings({ priceRoundStep: next });
      onStepSaved?.(normalizeRoundStep(saved?.g2bulk_price_round_step ?? next));
      setMessage(t.priceRoundSaved);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const runReprice = async () => {
    setBusy('reprice');
    setError('');
    setMessage('');
    try {
      const res = await repriceG2bulkOffers();
      setMessage(formatMessage(t.priceRoundApplied, { changed: res?.changed ?? 0, checked: res?.checked ?? 0 }));
      onPricesChanged?.();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy('');
      setConfirm(null);
    }
  };

  const askUndo = async () => {
    setBusy('undo-load');
    setError('');
    setMessage('');
    try {
      const snapshots = await listOfferPriceSnapshots();
      const latest = snapshots[0];
      if (!latest?.label) {
        setMessage(t.priceRoundNoSnapshot);
        return;
      }
      setConfirm({ kind: 'undo', label: latest.label, date: formatDateTime(latest.taken_at, lang) });
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy('');
    }
  };

  const runUndo = async (label) => {
    setBusy('undo');
    try {
      const count = await restoreOfferPriceSnapshot(label);
      setMessage(formatMessage(t.priceRoundUndone, { count }));
      onPricesChanged?.();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy('');
      setConfirm(null);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/40 px-3 py-3 space-y-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-[var(--text-primary)]">{t.priceRoundTitle}</div>
        <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">{t.priceRoundHelp}</p>
      </div>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t.priceRoundTitle}>
        {PRICE_ROUND_STEPS.map((option) => {
          const active = option === step;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={saving}
              onClick={() => handleSelect(option)}
              className={`min-h-[40px] px-3 rounded-lg border text-sm font-semibold transition-colors ${
                active
                  ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text-primary)]'
                  : 'border-[var(--border)] text-[var(--text-sec)] hover:border-[var(--accent)]/50'
              } disabled:opacity-60`}
            >
              {option === 0 ? t.priceRoundOff : formatMessage(t.priceRoundStepLabel, { step: stepText(option) })}
            </button>
          );
        })}
        {saving && <Loader2 className="w-4 h-4 animate-spin self-center text-[var(--text-muted)]" />}
      </div>

      <p className="text-xs text-[var(--text-sec)]" dir="ltr">
        {formatMessage(t.priceRoundExample, { raw: rawExample.toFixed(2), rounded: roundedExample.toFixed(2) })}
      </p>

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          className="btn btn-primary min-h-[44px] w-full sm:w-auto justify-center"
          disabled={!!busy || saving}
          onClick={() => setConfirm({ kind: 'reprice' })}
        >
          {busy === 'reprice' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {t.priceRoundApplyNow}
        </button>
        <button
          type="button"
          className="btn btn-secondary min-h-[44px] w-full sm:w-auto justify-center"
          disabled={!!busy || saving}
          onClick={askUndo}
        >
          {busy === 'undo-load' || busy === 'undo'
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Undo2 className="w-4 h-4" />}
          {t.priceRoundUndo}
        </button>
      </div>

      {message && <p className="text-xs text-green-400" role="status">{message}</p>}
      {error && <p className="text-xs text-red-400" role="alert">{error}</p>}

      <ConfirmDialog
        open={confirm?.kind === 'reprice'}
        variant="primary"
        title={t.priceRoundApplyConfirmTitle}
        message={formatMessage(t.priceRoundApplyConfirmBody, {
          markup: markupPercent,
          step: step === 0 ? t.priceRoundOff : stepText(step),
        })}
        confirmLabel={t.priceRoundApplyNow}
        cancelLabel={t.cancel}
        loading={busy === 'reprice'}
        onConfirm={runReprice}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.kind === 'undo'}
        title={t.priceRoundUndoConfirmTitle}
        message={formatMessage(t.priceRoundUndoConfirmBody, { date: confirm?.date || '' })}
        confirmLabel={t.priceRoundUndo}
        cancelLabel={t.cancel}
        loading={busy === 'undo'}
        onConfirm={() => runUndo(confirm.label)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
