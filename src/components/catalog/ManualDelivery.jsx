import { Truck, Clock, ClipboardList } from 'lucide-react';
import { formatMessage } from '../../lib/i18n';
import { renderRichTextLinks } from '../../lib/richText';
import {
  customerFieldLabel,
  customerFieldPlaceholder,
  deliveryEta,
  deliveryNote,
  normalizeCustomerFields,
} from '../../lib/manualProducts';

const INPUT_TYPE = { email: 'email', phone: 'tel', number: 'text', text: 'text' };
const INPUT_MODE = { email: 'email', phone: 'tel', number: 'decimal' };
const LTR_TYPES = new Set(['email', 'phone', 'number']);

/** "Delivered by the store" box: delivery time + how it's delivered. Product page and buy page. */
export function ManualDeliveryInfo({ game, lang, t = {}, className = '' }) {
  const eta = deliveryEta(game, lang) || t.manualDeliveryDefaultEta;
  const note = deliveryNote(game, lang);
  return (
    <div className={`rounded-2xl border border-[var(--accent)]/25 bg-[var(--accent)]/5 p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)] shrink-0">
          <Truck className="w-5 h-5" />
        </div>
        <div className="min-w-0 space-y-1.5">
          <div className="font-semibold">{t.manualDeliveryTitle}</div>
          <p className="text-sm text-[var(--text-sec)] inline-flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-[var(--accent)] shrink-0" />
            {formatMessage(t.manualDeliveryEta, { eta })}
          </p>
          {note ? (
            <div className="text-sm text-[var(--text-sec)] whitespace-pre-wrap leading-relaxed">{renderRichTextLinks(note)}</div>
          ) : (
            <p className="text-sm text-[var(--text-sec)] leading-relaxed">{t.manualDeliveryExplain}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** The product's own questions, answered at checkout. */
export function ManualCustomerFields({ game, lang, t = {}, values = {}, onChange, invalidKeys = new Set() }) {
  const fields = normalizeCustomerFields(game?.customer_fields);
  if (fields.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="font-semibold flex items-center gap-2">
        <ClipboardList className="w-4 h-4" />
        {t.manualFieldsTitle}
      </div>
      {fields.map((field) => {
        const id = `manual-field-${field.key}`;
        const common = {
          id,
          value: values[field.key] || '',
          onChange: (e) => onChange?.({ ...values, [field.key]: e.target.value }),
          placeholder: customerFieldPlaceholder(field, lang),
          maxLength: 1000,
          dir: LTR_TYPES.has(field.type) ? 'ltr' : undefined,
          'aria-invalid': invalidKeys.has(field.key) || undefined,
          className: `input w-full ${invalidKeys.has(field.key) ? 'border-red-500/70' : ''}`,
        };
        return (
          <div key={field.key}>
            <label htmlFor={id} className="text-xs text-[var(--text-muted)] block mb-1">
              {customerFieldLabel(field, lang)}
              {field.required && <span className="text-red-400"> *</span>}
            </label>
            {field.type === 'textarea' ? (
              <textarea {...common} className={`${common.className} h-24 resize-y`} />
            ) : (
              <input {...common} type={INPUT_TYPE[field.type] || 'text'} inputMode={INPUT_MODE[field.type]} autoComplete="off" />
            )}
          </div>
        );
      })}
    </div>
  );
}
