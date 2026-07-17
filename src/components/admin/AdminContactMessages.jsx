import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Archive,
  CheckCircle2,
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  User,
} from 'lucide-react';
import {
  fetchContactMessages,
  updateContactMessageStatus,
} from '../../lib/contactMessages';
import { getAdminDashboardPath } from '../../lib/adminRoutes';
import { formatNotificationRelativeTime } from '../../lib/notificationTime';

function statusTone(status) {
  if (status === 'new') return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
  if (status === 'archived') return 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border)]';
  return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25';
}

export default function AdminContactMessages({
  t = {},
  lang = 'ar',
  onNotify,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);

  const highlightId = location.state?.highlightContactMessageId
    || new URLSearchParams(location.search).get('message')
    || null;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await fetchContactMessages({ limit: 200 });
      setMessages(rows);
    } catch (err) {
      setError(err.message || t.adminContactLoadFailed);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [t.adminContactLoadFailed]);

  useEffect(() => {
    load();
  }, [load]);

  // Open message from notification deep-link
  useEffect(() => {
    if (!highlightId || !messages.length) return;
    const exists = messages.some((row) => String(row.id) === String(highlightId));
    if (exists) {
      setSelectedId(String(highlightId));
      setFilter('all');
    }
  }, [highlightId, messages]);

  // Auto-mark new as read when opened
  useEffect(() => {
    if (!selectedId) return undefined;
    const row = messages.find((item) => String(item.id) === String(selectedId));
    if (!row || row.status !== 'new') return undefined;

    let cancelled = false;
    (async () => {
      try {
        const updated = await updateContactMessageStatus(row.id, 'read');
        if (cancelled) return;
        setMessages((prev) => prev.map((item) => (
          item.id === updated.id ? updated : item
        )));
      } catch {
        /* keep new status if update fails */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId, messages]);

  const filtered = useMemo(() => {
    if (filter === 'all') return messages;
    return messages.filter((row) => row.status === filter);
  }, [messages, filter]);

  const selected = useMemo(
    () => messages.find((row) => String(row.id) === String(selectedId)) || null,
    [messages, selectedId],
  );

  const newCount = useMemo(
    () => messages.filter((row) => row.status === 'new').length,
    [messages],
  );

  const setStatus = async (id, status) => {
    setSavingId(id);
    setError('');
    try {
      const updated = await updateContactMessageStatus(id, status);
      setMessages((prev) => prev.map((item) => (
        item.id === updated.id ? updated : item
      )));
      onNotify?.(
        status === 'archived' ? t.adminContactArchived : t.adminContactMarkedRead,
        'success',
      );
    } catch (err) {
      setError(err.message || t.adminContactUpdateFailed);
      onNotify?.(err.message || t.adminContactUpdateFailed, 'error');
    } finally {
      setSavingId(null);
    }
  };

  const statusLabel = (status) => {
    if (status === 'new') return t.adminContactStatusNew;
    if (status === 'archived') return t.adminContactStatusArchived;
    return t.adminContactStatusRead;
  };

  const textDir = lang === 'ar' ? 'rtl' : 'ltr';

  return (
    <div className="space-y-4" dir={textDir}>
      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/15 flex items-center justify-center text-[var(--accent)] flex-shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black">{t.adminContactTitle}</h2>
              <p className="text-sm text-[var(--text-sec)] mt-1 leading-relaxed">
                {t.adminContactDesc}
              </p>
              {newCount > 0 && (
                <p className="text-xs text-sky-300 mt-2">
                  {t.adminContactNewCount?.replace('{count}', String(newCount))
                    || `${newCount} new`}
                </p>
              )}
            </div>
          </div>
          <button type="button" onClick={load} className="action-chip gap-1.5 text-xs self-start">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t.refresh}
          </button>
        </div>

        <div className="inbox-filter-bar mt-4" role="tablist">
          {[
            { id: 'all', label: t.adminContactFilterAll },
            { id: 'new', label: t.adminContactStatusNew },
            { id: 'read', label: t.adminContactStatusRead },
            { id: 'archived', label: t.adminContactStatusArchived },
          ].map((option) => {
            const active = filter === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(option.id)}
                className={`inbox-filter-chip ${active ? 'inbox-filter-chip--active' : ''}`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="card p-3 text-sm text-amber-300 border border-amber-500/30 bg-amber-500/10">
          {error}
        </div>
      )}

      {loading && messages.length === 0 ? (
        <div className="card p-10 text-center">
          <Loader2 className="w-7 h-7 animate-spin text-[var(--accent)] mx-auto" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center text-[var(--text-sec)]">
          <MessageSquare className="w-9 h-9 mx-auto mb-3 opacity-35" />
          <p>{t.adminContactEmpty}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2 space-y-2">
            {filtered.map((row) => {
              const active = String(row.id) === String(selectedId);
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(row.id);
                    // Clear one-shot highlight from history so re-open still works later
                    if (highlightId) {
                      navigate(getAdminDashboardPath('contact'), { replace: true, state: {} });
                    }
                  }}
                  className={`w-full text-start card p-3.5 border transition-colors ${
                    active
                      ? 'border-[var(--accent)]/50 bg-[var(--accent)]/8'
                      : row.status === 'new'
                        ? 'border-sky-500/25 bg-sky-500/5'
                        : 'border-[var(--border)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold truncate">
                        {row.name?.trim() || t.adminContactAnonymous}
                      </div>
                      <div className="text-xs text-[var(--text-sec)] mt-0.5 truncate" dir="ltr">
                        {row.email}
                      </div>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${statusTone(row.status)}`}>
                      {statusLabel(row.status)}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-2 line-clamp-2 leading-relaxed">
                    {row.message}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-2">
                    {formatNotificationRelativeTime(row.created_at, t)}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-3">
            {!selected ? (
              <div className="card p-10 text-center text-[var(--text-sec)] h-full min-h-[240px] flex flex-col items-center justify-center">
                <Mail className="w-9 h-9 mb-3 opacity-35" />
                <p>{t.adminContactSelectHint}</p>
              </div>
            ) : (
              <div className="card p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black">
                      {selected.name?.trim() || t.adminContactAnonymous}
                    </h3>
                    <a
                      href={`mailto:${selected.email}`}
                      className="text-sm text-[var(--accent)] hover:underline inline-flex items-center gap-1.5 mt-1"
                      dir="ltr"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      {selected.email}
                    </a>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full border ${statusTone(selected.status)}`}>
                    {statusLabel(selected.status)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
                  <span className="inline-flex items-center gap-1">
                    <User className="w-3.5 h-3.5" />
                    {selected.user_id
                      ? t.adminContactRegisteredUser
                      : t.adminContactGuest}
                  </span>
                  <span>
                    {selected.created_at
                      ? new Date(selected.created_at).toLocaleString(
                        lang === 'ar' ? 'ar-SY' : 'en-US',
                      )
                      : ''}
                  </span>
                </div>

                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">
                    {t.messageLabel}
                  </p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--text-primary)]">
                    {selected.message}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {selected.status === 'new' && (
                    <button
                      type="button"
                      disabled={savingId === selected.id}
                      onClick={() => setStatus(selected.id, 'read')}
                      className="btn btn-secondary text-xs py-2 px-3 gap-1.5"
                    >
                      {savingId === selected.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <CheckCircle2 className="w-3.5 h-3.5" />}
                      {t.adminContactMarkRead}
                    </button>
                  )}
                  {selected.status !== 'archived' && (
                    <button
                      type="button"
                      disabled={savingId === selected.id}
                      onClick={() => setStatus(selected.id, 'archived')}
                      className="btn btn-secondary text-xs py-2 px-3 gap-1.5"
                    >
                      {savingId === selected.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Archive className="w-3.5 h-3.5" />}
                      {t.adminContactArchive}
                    </button>
                  )}
                  {selected.status === 'archived' && (
                    <button
                      type="button"
                      disabled={savingId === selected.id}
                      onClick={() => setStatus(selected.id, 'read')}
                      className="btn btn-secondary text-xs py-2 px-3 gap-1.5"
                    >
                      {t.adminContactRestore}
                    </button>
                  )}
                  <a
                    href={`mailto:${selected.email}?subject=${encodeURIComponent(t.adminContactReplySubject || 'ECHOCORE')}`}
                    className="btn btn-primary text-xs py-2 px-3 gap-1.5"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    {t.adminContactReply}
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
