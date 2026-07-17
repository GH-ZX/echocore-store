import { useEffect, useId, useRef, useState } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { persistOfferPricing } from '../../lib/adminOfferPricing';
import { formatPrice } from '../../lib/offerDisplay';

/**
 * Admin-only: customer price with pencil → edit → save to DB (locks pack as fixed).
 */
export default function AdminInlinePriceEdit({
  offer,
  t = {},
  onSaved,
  onNotify,
  size = 'lg',
  className = '',
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);
  const fieldId = useId();

  const price = Number(offer?.price);
  const display = Number.isFinite(price) ? formatPrice(price) : '—';

  useEffect(() => {
    if (!editing) setDraft(Number.isFinite(price) ? String(price) : '');
  }, [price, editing, offer?.id]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select?.();
    }
  }, [editing]);

  if (!offer?.id) return null;

  const startEdit = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    setDraft(Number.isFinite(price) ? String(price) : '');
    setEditing(true);
  };

  const cancel = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    setDraft(Number.isFinite(price) ? String(price) : '');
    setEditing(false);
  };

  const commit = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const n = parseFloat(String(draft).replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) {
      onNotify?.(t.pricingInvalidPrice || t.gameNameEnglishAndPriceRequired || 'Invalid price', 'error');
      return;
    }
    if (Number.isFinite(price) && Math.abs(n - price) < 0.0001) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      const saved = await persistOfferPricing(offer.id, {
        pricing_mode: 'fixed',
        price: n,
        is_sale: !!offer.is_sale,
        pricing_margin_percent: null,
      });
      onSaved?.(saved);
      onNotify?.(t.pricingSavedToDb || t.saved || 'Saved', 'success');
      setEditing(false);
    } catch (err) {
      onNotify?.(err.message || t.pricingSaveFailed || 'Could not save price', 'error');
    } finally {
      setSaving(false);
    }
  };

  const priceClass = size === 'sm'
    ? 'text-2xl font-black text-[var(--accent)]'
    : size === 'md'
      ? 'text-3xl font-black text-[var(--accent)]'
      : 'text-4xl sm:text-5xl font-black text-[var(--accent)]';

  const btnSize = size === 'sm' ? 'w-8 h-8' : 'w-9 h-9';
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  if (!editing) {
    return (
      <div className={`inline-flex items-center gap-1.5 min-w-0 ${className}`.trim()} dir="ltr">
        <span className={`${priceClass} tabular-nums`}>${display}</span>
        <button
          type="button"
          onClick={startEdit}
          className={`${btnSize} shrink-0 inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--accent)] hover:bg-[var(--accent)]/15 touch-manipulation`}
          aria-label={t.pricingEdit || t.edit || 'Edit price'}
          title={t.pricingEdit || t.editPrice || t.edit || 'Edit price'}
        >
          <Pencil className={iconSize} />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 min-w-0 ${className}`.trim()}
      dir="ltr"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <span className="text-[var(--text-muted)] font-mono text-sm">$</span>
      <input
        id={fieldId}
        ref={inputRef}
        type="number"
        min="0.01"
        step="0.01"
        inputMode="decimal"
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(e);
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            cancel(e);
          }
        }}
        className={`input font-mono font-bold tabular-nums min-w-0 ${
          size === 'sm' ? 'w-24 py-1.5 text-base' : 'w-28 sm:w-32 py-2 text-lg'
        }`}
        aria-label={t.price || 'Price'}
      />
      <button
        type="button"
        onClick={commit}
        disabled={saving}
        className={`${btnSize} shrink-0 inline-flex items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50`}
        aria-label={t.save || 'Save'}
        title={t.save || 'Save'}
      >
        {saving ? <Loader2 className={`${iconSize} animate-spin`} /> : <Check className={iconSize} />}
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={saving}
        className={`${btnSize} shrink-0 inline-flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-sec)] hover:bg-white/5 disabled:opacity-50`}
        aria-label={t.cancel || 'Cancel'}
        title={t.cancel || 'Cancel'}
      >
        <X className={iconSize} />
      </button>
    </div>
  );
}
