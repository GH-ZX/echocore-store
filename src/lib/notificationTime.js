import { formatMessage } from './i18n';

export function formatNotificationRelativeTime(dateStr, t = {}) {
  if (!dateStr) return '';

  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);

  if (mins < 1) return t.timeJustNow || '';
  if (mins < 60) return formatMessage(t.timeMinutesAgo, { count: mins });

  const hours = Math.floor(mins / 60);
  if (hours < 24) return formatMessage(t.timeHoursAgo, { count: hours });

  const days = Math.floor(hours / 24);
  return formatMessage(t.timeDaysAgo, { count: days });
}