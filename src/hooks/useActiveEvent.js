import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  eventTimeLeft,
  getEventComparePrice,
  getEventOptions,
  getStableActiveEvent,
  subscribeActiveEvent,
} from '../lib/storeEvents';

/** The event running right now (or the dashboard preview), or null. */
export function useActiveEvent() {
  return useSyncExternalStore(subscribeActiveEvent, getStableActiveEvent, () => null);
}

/** Time left until the event ends, refreshed every second while mounted. */
export function useEventTimeLeft(event) {
  const [now, setNow] = useState(() => Date.now());
  const endsAt = event?.ends_at || null;
  useEffect(() => {
    if (!endsAt) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [endsAt]);
  return eventTimeLeft(event, now);
}

/** A pack's pre-event price to strike through, when an event with "show old prices" is running. */
export function useEventComparePrice(offer, shownPrice = null) {
  const event = useActiveEvent();
  if (!event || getEventOptions(event).comparePrices === false) return null;
  return getEventComparePrice(offer, shownPrice);
}
