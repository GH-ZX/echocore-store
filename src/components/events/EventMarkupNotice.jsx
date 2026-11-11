import { useEffect, useState } from 'react';
import { PartyPopper } from 'lucide-react';
import { formatMessage } from '../../lib/i18n';
import { eventText, fetchRunningAdminEvent } from '../../lib/storeEvents';

/**
 * Dashboard notice next to the store markup: while an event with its own margin runs, the value
 * shown there is the event's, and it returns to the saved one when the event ends.
 */
export default function EventMarkupNotice({ t = {}, lang = 'ar' }) {
  const [event, setEvent] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetchRunningAdminEvent().then((row) => {
      if (!cancelled) setEvent(row);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!event || event.saved_markup_percent == null) return null;
  return (
    <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-100">
      <PartyPopper className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
      {formatMessage(t.eventMarkupManagedNote, {
        title: eventText(event, lang, 'title'),
        saved: Number(event.saved_markup_percent),
      })}
    </p>
  );
}
