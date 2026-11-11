import { Eye } from 'lucide-react';
import { useActiveEvent } from '../../hooks/useActiveEvent';
import { setEventPreview } from '../../lib/storeEvents';

/** Shown to the admin while a dashboard event preview is on in this tab. */
export default function EventPreviewBar({ t = {} }) {
  const event = useActiveEvent();
  if (!event?._preview) return null;
  return (
    <div className="event-preview-bar" role="status">
      <span className="inline-flex items-center gap-2">
        <Eye className="w-4 h-4 text-[var(--accent)] shrink-0" aria-hidden="true" />
        {t.eventPreviewBar}
      </span>
      <button type="button" className="btn btn-secondary text-xs py-1.5 px-3" onClick={() => setEventPreview(null)}>
        {t.eventPreviewExit}
      </button>
    </div>
  );
}
