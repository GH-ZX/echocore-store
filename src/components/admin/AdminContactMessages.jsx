import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Archive,
  CheckCircle2,
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  Send,
  User,
} from 'lucide-react';
import {
  buildContactTimeline,
  fetchContactMessages,
  fetchContactThread,
  sendContactReply,
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
  const chatEndRef = useRef(null);
  const replyInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);

  const [threadLoading, setThreadLoading] = useState(false);
  const [replies, setReplies] = useState([]);
  const [replyDraft, setReplyDraft] = useState('');
  const [sending, setSending] = useState(false);

  const highlightId = useMemo(() => {
    const fromQuery = new URLSearchParams(location.search).get('message');
    const fromState = location.state?.highlightContactMessageId;
    return String(fromQuery || fromState || '').trim() || null;
  }, [location.search, location.state]);

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

  // Open message from notification deep-link (?message= or location.state)
  useEffect(() => {
    if (!highlightId) return;
    if (loading) return;
    if (!messages.length) {
      setError((prev) => prev || (t.adminContactNotFound || ''));
      return;
    }
    const exists = messages.some((row) => String(row.id) === String(highlightId));
    if (exists) {
      setSelectedId(String(highlightId));
      setFilter('all');
      setError('');
      window.requestAnimationFrame(() => {
        document.getElementById('admin-contact-detail')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
        replyInputRef.current?.focus();
      });
    } else {
      setError((prev) => prev || (t.adminContactNotFound || ''));
    }
  }, [highlightId, messages, loading, t.adminContactNotFound]);

  const loadThread = useCallback(async (messageId) => {
    if (!messageId) {
      setReplies([]);
      return;
    }
    setThreadLoading(true);
    try {
      const { message, replies: rows } = await fetchContactThread(messageId);
      setReplies(rows);
      if (message) {
        setMessages((prev) => prev.map((item) => (
          item.id === message.id ? { ...item, ...message } : item
        )));
      }
    } catch (err) {
      setError(err.message || t.adminContactThreadFailed);
      setReplies([]);
    } finally {
      setThreadLoading(false);
    }
  }, [t.adminContactThreadFailed]);

  useEffect(() => {
    if (!selectedId) {
      setReplies([]);
      setReplyDraft('');
      return;
    }
    loadThread(selectedId);
  }, [selectedId, loadThread]);

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

  const timeline = useMemo(
    () => buildContactTimeline(selected, replies),
    [selected, replies],
  );

  useEffect(() => {
    if (!timeline.length) return;
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [timeline.length, selectedId]);

  const newCount = useMemo(
    () => messages.filter((row) => row.status === 'new').length,
    [messages],
  );

  const selectMessage = (rowId) => {
    setSelectedId(rowId);
    setReplyDraft('');
    navigate(
      {
        pathname: getAdminDashboardPath('contact'),
        search: `?message=${encodeURIComponent(rowId)}`,
      },
      { replace: true, state: { highlightContactMessageId: rowId } },
    );
    window.requestAnimationFrame(() => {
      replyInputRef.current?.focus();
    });
  };

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

  const handleSendReply = async (event) => {
    event?.preventDefault?.();
    if (!selected || sending) return;
    const text = replyDraft.trim();
    if (!text) return;

    setSending(true);
    setError('');
    try {
      const row = await sendContactReply(selected.id, text);
      setReplies((prev) => [...prev, row]);
      setReplyDraft('');
      setMessages((prev) => prev.map((item) => (
        item.id === selected.id && item.status === 'new'
          ? { ...item, status: 'read' }
          : item
      )));
      onNotify?.(t.adminContactReplySent, 'success');
      window.requestAnimationFrame(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        replyInputRef.current?.focus();
      });
    } catch (err) {
      const msg = err.message || t.adminContactReplyFailed;
      setError(msg);
      onNotify?.(msg, 'error');
    } finally {
      setSending(false);
    }
  };

  const statusLabel = (status) => {
    if (status === 'new') return t.adminContactStatusNew;
    if (status === 'archived') return t.adminContactStatusArchived;
    return t.adminContactStatusRead;
  };

  const textDir = lang === 'ar' ? 'rtl' : 'ltr';
  const locale = lang === 'ar' ? 'ar-SY-u-nu-latn' : 'en-US';

  return (
    <div className="space-y-4" dir={textDir}>
      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/15 flex items-center justify-center text-[var(--accent)] flex-shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black">{t.adminContactTitle}</h2>
              <p className="text-sm text-[var(--text-sec)] mt-1 leading-relaxed">
                {t.adminContactDesc}
              </p>
              {newCount > 0 && (
                <p className="text-xs text-sky-300 mt-2">
                  {t.adminContactNewCount?.replace('{count}', String(newCount))}
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
                  onClick={() => selectMessage(row.id)}
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

          <div className="lg:col-span-3" id="admin-contact-detail">
            {!selected ? (
              <div className="card p-10 text-center text-[var(--text-sec)] h-full min-h-[240px] flex flex-col items-center justify-center">
                <Mail className="w-9 h-9 mb-3 opacity-35" />
                <p>{t.adminContactSelectHint}</p>
              </div>
            ) : (
              <div className="card p-0 overflow-hidden flex flex-col min-h-[420px] max-h-[min(720px,75vh)]">
                {/* Header */}
                <div className="p-4 sm:p-5 border-b border-[var(--border)] space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-black">
                        {selected.name?.trim() || t.adminContactAnonymous}
                      </h3>
                      <p className="text-sm text-[var(--text-sec)] mt-0.5" dir="ltr">
                        {selected.email}
                      </p>
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
                        ? new Date(selected.created_at).toLocaleString(locale)
                        : ''}
                    </span>
                  </div>
                  {!selected.user_id && (
                    <p className="text-xs text-amber-300/90 leading-relaxed">
                      {t.adminContactGuestReplyHint}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {selected.status === 'new' && (
                      <button
                        type="button"
                        disabled={savingId === selected.id}
                        onClick={() => setStatus(selected.id, 'read')}
                        className="btn btn-secondary text-xs py-1.5 px-2.5 gap-1.5"
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
                        className="btn btn-secondary text-xs py-1.5 px-2.5 gap-1.5"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        {t.adminContactArchive}
                      </button>
                    )}
                    {selected.status === 'archived' && (
                      <button
                        type="button"
                        disabled={savingId === selected.id}
                        onClick={() => setStatus(selected.id, 'read')}
                        className="btn btn-secondary text-xs py-1.5 px-2.5 gap-1.5"
                      >
                        {t.adminContactRestore}
                      </button>
                    )}
                    <a
                      href={`mailto:${String(selected.email || '').trim()}?subject=${encodeURIComponent(
                        t.adminContactReplySubject || 'ECHOCORE',
                      )}`}
                      className="btn btn-secondary text-xs py-1.5 px-2.5 gap-1.5"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      {t.adminContactEmailInstead}
                    </a>
                  </div>
                </div>

                {/* Chat timeline */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-[var(--bg-surface)]/40">
                  {threadLoading && replies.length === 0 ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
                    </div>
                  ) : (
                    timeline.map((item) => {
                      const fromAdmin = item.sender_role === 'admin';
                      return (
                        <div
                          key={item.id}
                          className={`flex ${fromAdmin ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[90%] sm:max-w-[80%] rounded-2xl px-3.5 py-2.5 border ${
                              fromAdmin
                                ? 'bg-[var(--accent)]/15 border-[var(--accent)]/30 rounded-ee-md'
                                : 'bg-[var(--bg-elevated)] border-[var(--border)] rounded-es-md'
                            }`}
                          >
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1">
                              {fromAdmin ? t.adminContactYou : (selected.name?.trim() || t.adminContactAnonymous)}
                            </div>
                            <p className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--text-primary)]">
                              {item.body}
                            </p>
                            <div className="text-[10px] text-[var(--text-muted)] mt-1.5">
                              {item.created_at
                                ? new Date(item.created_at).toLocaleString(locale)
                                : ''}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Composer */}
                <form
                  onSubmit={handleSendReply}
                  className="p-3 sm:p-4 border-t border-[var(--border)] bg-[var(--bg-card)]"
                >
                  <label className="sr-only" htmlFor="admin-contact-reply">
                    {t.adminContactReplyPlaceholder}
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <textarea
                      id="admin-contact-reply"
                      ref={replyInputRef}
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendReply(e);
                        }
                      }}
                      rows={2}
                      maxLength={4000}
                      disabled={sending || selected.status === 'archived'}
                      placeholder={
                        selected.status === 'archived'
                          ? t.adminContactArchivedComposer
                          : t.adminContactReplyPlaceholder
                      }
                      className="flex-1 min-h-[72px] resize-y rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                    />
                    <button
                      type="submit"
                      disabled={sending || !replyDraft.trim() || selected.status === 'archived'}
                      className="btn btn-primary text-sm py-2.5 px-4 gap-1.5 self-stretch sm:self-end shrink-0"
                    >
                      {sending
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Send className="w-4 h-4" />}
                      {t.adminContactSendReply}
                    </button>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-2">
                    {t.adminContactReplyHint}
                  </p>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
