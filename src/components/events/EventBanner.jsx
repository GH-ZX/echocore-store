import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, PartyPopper } from 'lucide-react';
import { eventText, getEventArt, getEventLook, getEventOptions } from '../../lib/storeEvents';
import { EventCountdown, EventNote } from './EventParts';

/**
 * The running event on the home page and at the top of /events: badge, title, text, note,
 * countdown. `variant="hero"` is the larger /events version (no "details" link). `compact` drops
 * the description (used on the home page when the event already has the first carousel slide).
 */
export default function EventBanner({ event, t = {}, lang = 'ar', variant = 'home', compact = false }) {
  if (!event) return null;
  const options = getEventOptions(event);
  const title = eventText(event, lang, 'title');
  const description = eventText(event, lang, 'description');
  const badge = eventText(event, lang, 'badge') || t.eventLiveNow;
  const Arrow = lang === 'ar' ? ArrowLeft : ArrowRight;

  return (
    <section
      className={`event-banner event-banner--${variant} ${compact ? 'event-banner--compact' : ''}`}
      data-look={getEventLook(event).id}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      aria-label={title}
    >
      <div className="event-banner__art" style={{ backgroundImage: `url(${getEventArt(event)})` }} aria-hidden="true" />
      <div className="event-banner__shade" aria-hidden="true" />
      <div className="event-banner__body">
        <span className="event-banner__badge">
          <PartyPopper className="w-3.5 h-3.5" aria-hidden="true" />
          {badge}
        </span>
        <h2 className="event-banner__title">{title}</h2>
        {description && !compact && <p className="event-banner__desc">{description}</p>}
        {event.has_discount && <p className="event-banner__discount">{t.eventDiscountOnAll}</p>}
        <EventNote text={eventText(event, lang, 'note')} />
        <div className="event-banner__actions">
          {options.countdown !== false && <EventCountdown event={event} t={t} />}
          {variant === 'home' ? (
            <Link to="/events" className="event-banner__link">
              {t.eventDetails}
              <Arrow className="w-4 h-4" aria-hidden="true" />
            </Link>
          ) : (
            <Link to="/" className="btn btn-primary event-banner__cta">
              {t.eventShopNow}
              <Arrow className="w-4 h-4" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
