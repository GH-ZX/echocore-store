import { Send } from 'lucide-react';
import { formatMessage, formatMoney } from '../../lib/i18n';
import { percentOff, splitNoteLinks } from '../../lib/storeEvents';
import { useEventComparePrice, useEventTimeLeft } from '../../hooks/useActiveEvent';

/** The event's small note; "@handle" becomes a Telegram link. */
export function EventNote({ text, className = '' }) {
  const note = String(text || '').trim();
  if (!note) return null;
  return (
    <p className={`event-note ${className}`} dir="auto">
      <Send className="event-note__icon" aria-hidden="true" />
      <span>
        {splitNoteLinks(note).map((part, index) => (part.href ? (
          <a key={index} href={part.href} target="_blank" rel="noopener noreferrer" dir="ltr" className="event-note__link">
            {part.text}
          </a>
        ) : (
          <span key={index}>{part.text}</span>
        )))}
      </span>
    </p>
  );
}

/** Days / hours / minutes / seconds until the event ends. */
export function EventCountdown({ event, t = {}, compact = false }) {
  const left = useEventTimeLeft(event);
  if (!left || left.ms <= 0) return null;
  const units = [
    [left.days, t.eventUnitDays],
    [left.hours, t.eventUnitHours],
    [left.minutes, t.eventUnitMinutes],
    [left.seconds, t.eventUnitSeconds],
  ];
  return (
    <div className={`event-countdown ${compact ? 'event-countdown--compact' : ''}`} role="timer" aria-label={t.eventEndsIn}>
      <span className="event-countdown__label">{t.eventEndsIn}</span>
      <span className="event-countdown__units" dir="ltr">
        {units.map(([value, label]) => (
          <span key={label} className="event-countdown__unit">
            <span className="event-countdown__value">{String(value).padStart(2, '0')}</span>
            <span className="event-countdown__name">{label}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

/** A pack's price from before the event, struck through, with the percent saved. */
export function EventComparePrice({ offer, price = null, t = {}, className = '', showPercent = true }) {
  const compare = useEventComparePrice(offer, price);
  // Partner / coupon prices already show the public price struck through.
  if (!compare || offer?._partnerPriced || offer?._influencerPriced) return null;
  const shown = Number(price ?? offer?.price);
  const percent = percentOff(compare, shown);
  return (
    <span className={`event-compare ${className}`}>
      <s className="event-compare__old" dir="ltr" title={t.eventPriceBefore}>{formatMoney(compare)}</s>
      {showPercent && percent >= 1 && (
        <span className="event-compare__off">{formatMessage(t.eventPercentOff, { percent })}</span>
      )}
    </span>
  );
}
