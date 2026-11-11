import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CatalogCategoryHeader from '../components/catalog/CatalogCategoryHeader';
import CatalogPageShell from '../components/catalog/CatalogPageShell';
import EmptyState from '../components/ui/EmptyState';
import EventBanner from '../components/events/EventBanner';
import { EventNote } from '../components/events/EventParts';
import { Spinner } from '../components/routing/PageLoader';
import { useActiveEvent } from '../hooks/useActiveEvent';
import { formatDateTime, formatMessage } from '../lib/i18n';
import { eventText, fetchPublicEvents, getEventArt, isEventLive } from '../lib/storeEvents';

function EventCard({ event, t, lang }) {
  const status = event.status === 'scheduled' ? 'scheduled' : 'ended';
  const from = event.starts_at ? formatDateTime(event.starts_at, lang) : '';
  const to = event.ends_at ? formatDateTime(event.ends_at, lang) : '';
  return (
    <article className={`event-card event-card--${status}`}>
      <div className="event-card__art" style={{ backgroundImage: `url(${getEventArt(event)})` }} aria-hidden="true" />
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold text-base">{eventText(event, lang, 'title')}</h3>
          <span className={`event-chip event-chip--${status}`}>
            {status === 'scheduled' ? t.eventUpcoming : t.eventEnded}
          </span>
        </div>
        {eventText(event, lang, 'description') && (
          <p className="text-sm text-[var(--text-sec)] leading-relaxed line-clamp-3">{eventText(event, lang, 'description')}</p>
        )}
        <p className="text-xs text-[var(--text-muted)]">
          {status === 'scheduled'
            ? formatMessage(t.eventStartsOn, { date: from })
            : formatMessage(t.eventRanFromTo, { from, to })}
        </p>
        {status === 'scheduled' && <EventNote text={eventText(event, lang, 'note')} />}
      </div>
    </article>
  );
}

/** /events: the running event, what is coming, and past events. */
export default function EventsView({ t = {}, lang = 'ar' }) {
  const navigate = useNavigate();
  const active = useActiveEvent();
  const [events, setEvents] = useState([]);
  const [state, setState] = useState('loading'); // loading | ready | error

  useEffect(() => {
    let cancelled = false;
    fetchPublicEvents()
      .then((rows) => {
        if (cancelled) return;
        setEvents(rows);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [active?.id]);

  const others = events.filter((event) => event.id !== active?.id && !isEventLive(event));
  const upcoming = others.filter((event) => event.status === 'scheduled');
  const past = others.filter((event) => event.status !== 'scheduled');
  const nothing = state === 'ready' && !active && upcoming.length === 0 && past.length === 0;

  return (
    <CatalogPageShell
      wide
      lang={lang}
      backLabel={t.backToHome}
      onBack={() => navigate('/')}
      breadcrumb={[{ label: t.eventsTitle }]}
    >
      <CatalogCategoryHeader title={t.eventsTitle} subtitle={t.eventsSubtitle} />

      <div className="space-y-8">
        {active && <EventBanner event={active} t={t} lang={lang} variant="hero" />}

        {state === 'loading' && !active && (
          <div className="flex justify-center py-16"><Spinner /></div>
        )}

        {state === 'error' && (
          <EmptyState
            title={t.eventsLoadFailed}
            action={(
              <button type="button" className="btn btn-secondary mt-4" onClick={() => window.location.reload()}>
                {t.refresh}
              </button>
            )}
          />
        )}

        {nothing && <EmptyState title={t.eventsEmpty} />}

        {upcoming.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-bold text-lg">{t.eventsComing}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {upcoming.map((event) => <EventCard key={event.id} event={event} t={t} lang={lang} />)}
            </div>
          </section>
        )}

        {past.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-bold text-lg">{t.eventsPast}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {past.map((event) => <EventCard key={event.id} event={event} t={t} lang={lang} />)}
            </div>
          </section>
        )}
      </div>
    </CatalogPageShell>
  );
}
