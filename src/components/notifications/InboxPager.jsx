import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatMessage } from '../../lib/i18n';

export default function InboxPager({
  page = 1,
  totalPages = 1,
  total = 0,
  onPageChange,
  t = {},
  lang = 'ar',
}) {
  if (totalPages <= 1 && total === 0) return null;

  const isRtl = lang === 'ar';
  const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;

  return (
    <nav className="inbox-pager" aria-label={t.inboxPagerLabel}>
      <button
        type="button"
        className="inbox-pager__btn"
        onClick={() => onPageChange?.(page - 1)}
        disabled={page <= 1}
        aria-label={t.inboxPagePrev}
      >
        <PrevIcon className="w-4 h-4" />
      </button>
      <span className="inbox-pager__info">
        {formatMessage(t.inboxPageInfo, { page, pages: totalPages, total })}
      </span>
      <button
        type="button"
        className="inbox-pager__btn"
        onClick={() => onPageChange?.(page + 1)}
        disabled={page >= totalPages}
        aria-label={t.inboxPageNext}
      >
        <NextIcon className="w-4 h-4" />
      </button>
    </nav>
  );
}