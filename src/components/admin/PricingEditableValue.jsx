import { useEffect, useId, useRef, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';

/**
 * Read-only display of a price/margin value with a pencil to unlock editing.
 * Used anywhere admin edits markup % or customer price.
 */
export default function PricingEditableValue({
  label,
  value,
  displayValue,
  onChange,
  onCommit,
  type = 'number',
  min,
  max,
  step,
  suffix = '',
  prefix = '',
  inputClassName = '',
  t = {},
  disabled = false,
  className = '',
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const inputRef = useRef(null);
  const fieldId = useId();

  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select?.();
    }
  }, [editing]);

  const shown = displayValue != null && displayValue !== ''
    ? displayValue
    : (value === '' || value == null ? '—' : `${prefix}${value}${suffix}`);

  const startEdit = () => {
    if (disabled) return;
    setDraft(value ?? '');
    setEditing(true);
  };

  const cancel = () => {
    setDraft(value ?? '');
    setEditing(false);
  };

  const commit = () => {
    let next = draft;
    if (type === 'number') {
      const n = parseFloat(String(draft).replace(',', '.'));
      if (!Number.isFinite(n)) {
        cancel();
        return;
      }
      const lo = min != null && min !== '' ? Number(min) : null;
      const hi = max != null && max !== '' ? Number(max) : null;
      let clamped = n;
      if (Number.isFinite(lo) && clamped < lo) clamped = lo;
      if (Number.isFinite(hi) && clamped > hi) clamped = hi;
      next = clamped;
    }
    onChange?.(next);
    onCommit?.(next);
    setEditing(false);
  };

  const editLabel = t.pricingEdit || t.edit || 'Edit';
  // Short "Save" after pencil edit — same as dashboard primary action wording
  const doneLabel = t.save || t.pricingEditDone || 'Save';
  const cancelLabel = t.cancel || 'Cancel';

  return (
    <div className={`space-y-1.5 ${className}`.trim()}>
      {label && (
        <label htmlFor={fieldId} className="text-xs font-semibold text-[var(--text-sec)] block">
          {label}
        </label>
      )}

      {!editing ? (
        <div className="flex items-center gap-2 min-h-[44px]">
          <div
            className="flex-1 min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/50 px-3 py-2.5 font-mono text-base font-semibold text-[var(--text-primary)] tabular-nums"
            dir="ltr"
          >
            {shown}
          </div>
          <button
            type="button"
            onClick={startEdit}
            disabled={disabled}
            className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-40 touch-manipulation"
            aria-label={editLabel}
            title={editLabel}
          >
            <Pencil className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 min-h-[44px]">
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            {prefix ? <span className="text-sm text-[var(--text-muted)] font-mono">{prefix}</span> : null}
            <input
              id={fieldId}
              ref={inputRef}
              type={type}
              min={min}
              max={max}
              step={step}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commit();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  cancel();
                }
              }}
              className={`input flex-1 min-w-0 font-mono text-base font-semibold ${inputClassName}`.trim()}
              dir="ltr"
            />
            {suffix ? <span className="text-sm text-[var(--text-muted)] font-mono shrink-0">{suffix}</span> : null}
          </div>
          <button
            type="button"
            onClick={commit}
            className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl border border-green-500/40 bg-green-500/10 text-green-300 hover:bg-green-500/20 touch-manipulation"
            aria-label={doneLabel}
            title={doneLabel}
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={cancel}
            className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-sec)] hover:bg-white/5 touch-manipulation"
            aria-label={cancelLabel}
            title={cancelLabel}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
