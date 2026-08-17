import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  Send,
} from 'lucide-react';
import { Spinner } from '../components/routing/PageLoader';
import AlertBanner from '../components/ui/AlertBanner';
import { contactErrorMessage, submitContactMessage } from '../lib/contact';
import {
  buildContactTimeline,
  fetchContactThread,
  fetchMyContactThreads,
  sendContactReply,
} from '../lib/contactMessages';
import { formatNotificationRelativeTime } from '../lib/notificationTime';
import { formatDateTime } from '../lib/i18n';

export default function ContactView({ t = {}, lang = 'ar', user = null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const chatEndRef = useRef(null);
  const replyInputRef = useRef(null);

  const [tab, setTab] = useState('new');

  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    message: '',
    /** Honeypot — leave empty; bots often fill hidden fields */
    company: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

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

  const tabParam = useMemo(() => {
    const fromQuery = new URLSearchParams(location.search).get('tab');
    return String(fromQuery || '').trim() || null;
  }, [location.search]);

  const emailRef = useRef(user?.email);
  useEffect(() => {
    emailRef.current = user?.email;
  }, [user?.email]);

  const textDir = lang === 'ar' ? 'rtl' : 'ltr';

  const loadThreads = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await fetchMyContactThreads({ limit: 50, email: emailRef.current });
      setThreads(rows);
    } catch (err) {
      setError(err.message || t.supportLoadFailed);
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, [t.supportLoadFailed]);

  useEffect(() => {
    if (user) loadThreads();
  }, [user, loadThreads]);

  // ?tab=my → open the messages tab
  useEffect(() => {
    if (tabParam === 'my' && user) setTab('my');
  }, [tabParam, user]);

  // Deep-link ?message=... → open the threads tab and select the thread
  useEffect(() => {
    if (!highlightId || !user) return;
    if (!threads.length || loading) return;
    if (threads.some((row) => String(row.id) === String(highlightId))) {
      setTab('my');
      setSelectedId(String(highlightId));
    }
  }, [highlightId, threads, loading, user]);

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

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (formError) setFormError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!user) {
      navigate('/login?redirect=/contact');
      return;
    }

    if (!formData.email?.trim() || !formData.message?.trim()) {
      setFormError(t.contactEmailMessageRequired);
      return;
    }

    setIsSubmitting(true);
    setFormError('');

    try {
      await submitContactMessage({
        name: formData.name,
        email: formData.email,
        message: formData.message,
        userId: user?.id,
        honeypot: formData.company,
      });

      setSubmitted(true);
      loadThreads();
      setTimeout(() => {
        setFormData({
          name: user?.name || '',
          email: user?.email || '',
          message: '',
          company: '',
        });
        setSubmitted(false);
      }, 4000);
    } catch (err) {
      setFormError(contactErrorMessage(err, t));
      console.error('Contact form error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectThread = (id) => {
    setSelectedId(id);
    setReplyDraft('');
    navigate(
      {
        pathname: '/contact',
        search: `?message=${encodeURIComponent(id)}`,
      },
      { replace: true },
    );
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
        <h1 className="text-xl font-black mb-2">{t.contactUs}</h1>
        <p className="text-sm text-[var(--text-sec)] mb-4">{t.contactLoginRequired}</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/login?redirect=/contact')}>
          {t.login}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4" dir={textDir}>
      <div className="text-center mb-2">
        <h1 className="text-3xl md:text-4xl font-black mb-2">
          {t.contactUs}
        </h1>
        <p className="text-[var(--text-secondary)]">
          {t.contactSubtitle}
        </p>
      </div>

      <div className="inbox-filter-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'new'}
          onClick={() => setTab('new')}
          className={`inbox-filter-chip ${tab === 'new' ? 'inbox-filter-chip--active' : ''}`}
        >
          <Mail className="w-3.5 h-3.5" />
          {t.supportNewMessage}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'my'}
          onClick={() => setTab('my')}
          className={`inbox-filter-chip ${tab === 'my' ? 'inbox-filter-chip--active' : ''}`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          {t.contactMyMessages}
        </button>
      </div>

      {error && (
        <AlertBanner tone="amber" className="card p-3">
          {error}
        </AlertBanner>
      )}

      {tab === 'new' ? (
        <div className="card p-6 md:p-8 max-w-xl mx-auto">
          {submitted ? (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">✅</div>
              <h3 className="text-xl font-bold mb-2 text-[var(--accent)]">
                {t.messageSent}
              </h3>
              <p className="text-[var(--text-secondary)]">
                {t.contactThankYouBody}
              </p>
              <button
                type="button"
                onClick={() => {
                  setTab('my');
                  loadThreads();
                }}
                className="btn btn-secondary mt-5"
              >
                {t.contactViewMessages}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5" autoComplete="on">
              {/* Honeypot: visually hidden, not tabbable */}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: '-10000px',
                  top: 'auto',
                  width: '1px',
                  height: '1px',
                  overflow: 'hidden',
                }}
              >
                <label htmlFor="contact-company">{t.contactHoneypotLabel || 'Company'}</label>
                <input
                  id="contact-company"
                  type="text"
                  name="company"
                  value={formData.company}
                  onChange={handleChange}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-sec)] mb-1.5">
                  {t.nameOptional}
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className="input w-full"
                  placeholder={t.yourName}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-sec)] mb-1.5">
                  {t.email} <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="input w-full"
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-sec)] mb-1.5">
                  {t.messageLabel} <span className="text-red-400">*</span>
                </label>
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  required
                  rows={6}
                  className="input w-full resize-y min-h-[120px]"
                  placeholder={t.messagePlaceholder}
                />
              </div>

              {formError && (
                <p className="text-sm text-red-400 text-center">{formError}</p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn btn-primary w-full py-3.5 text-base font-bold disabled:opacity-70"
              >
                {isSubmitting ? t.sending : t.sendMessage}
              </button>

              <p className="text-center text-xs text-[var(--text-muted)]">
                {t.replyWithin}
              </p>
            </form>
          )}
        </div>
      ) : (
        <div className="max-w-5xl mx-auto">
          {loading && threads.length === 0 ? (
            <div className="card p-10 text-center">
              <Spinner size="w-7" className="mx-auto text-[var(--accent)]" />
            </div>
          ) : threads.length === 0 ? (
            <div className="card p-10 text-center text-[var(--text-sec)]">
              <MessageSquare className="w-9 h-9 mx-auto mb-3 opacity-35" />
              <p className="mb-4">{t.supportEmpty}</p>
              <button type="button" className="btn btn-primary" onClick={() => setTab('new')}>
                {t.supportNewMessage}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-2 space-y-2">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-sm text-[var(--text-sec)]">
                    {t.contactMyMessages}
                  </p>
                  <button type="button" onClick={loadThreads} className="action-chip gap-1.5 text-xs">
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    {t.refresh}
                  </button>
                </div>
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
                          ? formatDateTime(threadMessage.created_at, lang)
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
                                    ? formatDateTime(item.created_at, lang)
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
      )}

      <div className="mt-6 text-center text-sm text-[var(--text-secondary)]">
        {t.reachDirectly}{' '}
        <a href="mailto:support@echocore.store" className="text-[var(--accent)] hover:underline">
          support@echocore.store
        </a>
      </div>
    </div>
  );
}