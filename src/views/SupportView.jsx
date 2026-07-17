import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
} from 'lucide-react';
import {
  buildContactTimeline,
  fetchContactThread,
  fetchMyContactThreads,
  sendContactReply,
} from '../lib/contactMessages';
import { formatNotificationRelativeTime } from '../lib/notificationTime';

export default function SupportView({ t = {}, lang = 'ar', user = null }) {
  const location = useLocation();
  const navigate = useNavigate();
  const chatEndRef = useRef(null);
  const replyInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [threads, setThreads] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [threadMessage, setThreadMessage] = useState(null);
  const [replies, setReplies] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [replyDraft, setReplyDraft] = useState('');
  const [sending, setSending] = useState(false);

  const highlightId = useMemo(() => {
    const fromQuery = new URLSearchParams(location.search).get('message');
    return String(fromQuery || '').trim() || null;
  }, [location.search]);

  const textDir = lang === 'ar' ? 'rtl' : 'ltr';
  const locale = lang === 'ar' ? 'ar-SY-u-nu-latn' : 'en-US';

  const loadThreads = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await fetchMyContactThreads({ limit: 50 });
      setThreads(rows);
    } catch (err) {
      setError(err.message || t.supportLoadFailed);
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, [t.supportLoadFailed]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!highlightId || !threads.length) return;
    const exists = threads.some((row) => String(row.id) === String(highlightId));
    if (exists) setSelectedId(String(highlightId));
  }, [highlightId, threads]);

  const loadThread = useCallback(async (messageId) => {
    if (!messageId) {
      setThreadMessage(null);
      setReplies([]);
      return;
    }
    setThreadLoading(true);
    setError('');
    try {
      const { message, replies: rows } = await fetchContactThread(messageId);
      setThreadMessage(message);
      setReplies(rows);
    } catch (err) {
      setError(err.message || t.supportThreadFailed);
      setThreadMessage(null);
      setReplies([]);
    } finally {
      setThreadLoading(false);
    }
  }, [t.supportThreadFailed]);

  useEffect(() => {
    if (!selectedId) {
      setThreadMessage(null);
      setReplies([]);
      setReplyDraft('');
      return;
    }
    loadThread(selectedId);
  }, [selectedId, loadThread]);

  const timeline = useMemo(
    () => buildContactTimeline(threadMessage, replies),
    [threadMessage, replies],
  );

  useEffect(() => {
    if (!timeline.length) return;
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [timeline.length, selectedId]);

  const selectThread = (id) => {
    setSelectedId(id);
    setReplyDraft('');
    navigate(`/support?message=${encodeURIComponent(id)}`, { replace: true });
    window.requestAnimationFrame(() => replyInputRef.current?.focus());
  };

  const handleSend = async (event) => {
    event?.preventDefault?.();
    if (!selectedId || sending) return;
    const text = replyDraft.trim();
    if (!text) return;

    setSending(true);
    setError('');
    try {
      const row = await sendContactReply(selectedId, text);
      setReplies((prev) => [...prev, row]);
      setReplyDraft('');
      loadThreads();
    } catch (err) {
      setError(err.message || t.supportReplyFailed);
    } finally {
      setSending(false);
    }
  };

  if (!user) {
    return (
      <div className="max-w-lg mx-auto card p-8 text-center" dir={textDir}>
        <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <h1 className="text-xl font-black mb-2">{t.supportTitle}</h1>
        <p className="text-sm text-[var(--text-sec)] mb-4">{t.supportLoginRequired}</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/login?redirect=/support')}>
          {t.login}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4" dir={textDir}>
      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-black">{t.supportTitle}</h1>
            <p className="text-sm text-[var(--text-sec)] mt-1">{t.supportDesc}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={loadThreads} className="action-chip gap-1.5 text-xs">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              {t.refresh}
            </button>
            <button type="button" onClick={() => navigate('/contact')} className="btn btn-secondary text-xs py-2 px-3">
              {t.supportNewMessage}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="card p-3 text-sm text-amber-300 border border-amber-500/30 bg-amber-500/10">
          {error}
        </div>
      )}

      {loading && threads.length === 0 ? (
        <div className="card p-10 text-center">
          <Loader2 className="w-7 h-7 animate-spin text-[var(--accent)] mx-auto" />
        </div>
      ) : threads.length === 0 ? (
        <div className="card p-10 text-center text-[var(--text-sec)]">
          <MessageSquare className="w-9 h-9 mx-auto mb-3 opacity-35" />
          <p className="mb-4">{t.supportEmpty}</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/contact')}>
            {t.supportNewMessage}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2 space-y-2">
            {threads.map((row) => {
              const active = String(row.id) === String(selectedId);
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => selectThread(row.id)}
                  className={`w-full text-start card p-3.5 border transition-colors ${
                    active
                      ? 'border-[var(--accent)]/50 bg-[var(--accent)]/8'
                      : 'border-[var(--border)]'
                  }`}
                >
                  <div className="text-sm font-bold line-clamp-2">{row.message}</div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-2 flex flex-wrap gap-2">
                    <span>{formatNotificationRelativeTime(row.last_reply_at || row.created_at, t)}</span>
                    {row.reply_count > 0 && (
                      <span>
                        {t.supportReplyCount?.replace('{count}', String(row.reply_count))}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-3">
            {!selectedId || !threadMessage ? (
              <div className="card p-10 text-center text-[var(--text-sec)] min-h-[280px] flex flex-col items-center justify-center">
                <MessageSquare className="w-9 h-9 mb-3 opacity-35" />
                <p>{t.supportSelectHint}</p>
              </div>
            ) : (
              <div className="card p-0 overflow-hidden flex flex-col min-h-[400px] max-h-[min(700px,75vh)]">
                <div className="p-4 border-b border-[var(--border)]">
                  <h2 className="font-black text-base">{t.supportConversation}</h2>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {threadMessage.created_at
                      ? new Date(threadMessage.created_at).toLocaleString(locale)
                      : ''}
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[var(--bg-surface)]/40">
                  {threadLoading && replies.length === 0 ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
                    </div>
                  ) : (
                    timeline.map((item) => {
                      const fromUser = item.sender_role === 'user';
                      return (
                        <div
                          key={item.id}
                          className={`flex ${fromUser ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[90%] sm:max-w-[80%] rounded-2xl px-3.5 py-2.5 border ${
                              fromUser
                                ? 'bg-[var(--accent)]/15 border-[var(--accent)]/30 rounded-ee-md'
                                : 'bg-[var(--bg-elevated)] border-[var(--border)] rounded-es-md'
                            }`}
                          >
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1">
                              {fromUser ? t.supportYou : t.supportTeam}
                            </div>
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">
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

                <form onSubmit={handleSend} className="p-3 sm:p-4 border-t border-[var(--border)]">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <textarea
                      ref={replyInputRef}
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend(e);
                        }
                      }}
                      rows={2}
                      maxLength={4000}
                      disabled={sending || threadMessage.status === 'archived'}
                      placeholder={
                        threadMessage.status === 'archived'
                          ? t.supportClosedComposer
                          : t.supportReplyPlaceholder
                      }
                      className="flex-1 min-h-[72px] resize-y rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                    />
                    <button
                      type="submit"
                      disabled={sending || !replyDraft.trim() || threadMessage.status === 'archived'}
                      className="btn btn-primary text-sm py-2.5 px-4 gap-1.5 self-stretch sm:self-end"
                    >
                      {sending
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Send className="w-4 h-4" />}
                      {t.supportSend}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
