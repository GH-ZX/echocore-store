import { formatNotification, INBOX_FETCH_LIMIT } from './notifications';

export const INBOX_PAGE_SIZE = 20;
export { INBOX_FETCH_LIMIT };

export function searchInboxNotifications(notifications = [], query = '', t = {}, lang = 'ar') {
  const normalized = String(query || '').trim().toLowerCase();
  if (!normalized) return notifications;

  return notifications.filter((item) => {
    const formatted = formatNotification(item, t, lang);
    const metadata = item?.metadata || {};
    const haystack = [
      formatted.title,
      formatted.body,
      item.type,
      metadata.reference,
      metadata.userName,
      metadata.email,
      metadata.name,
      metadata.offerName,
      metadata.orderId,
      metadata.requestId,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalized);
  });
}

export function paginateInboxItems(items = [], page = 1, pageSize = INBOX_PAGE_SIZE) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    total,
    pageSize,
  };
}