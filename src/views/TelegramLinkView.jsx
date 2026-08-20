import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle, AlertCircle, MessageSquare, Link2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const STORAGE_KEY = 'echocore_telegram_chat_id';

export default function TelegramLinkView({ t = {}, lang, user, navigate }) {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('loading'); // loading | success | error | need_login
  const [message, setMessage] = useState('');
  const [linking, setLinking] = useState(false);

  const chatId = searchParams.get('chat_id');

  // Store chat_id in sessionStorage on mount (before any redirect)
  useEffect(() => {
    if (chatId) {
      sessionStorage.setItem(STORAGE_KEY, chatId);
    }
  }, [chatId]);

  // Try to link if user is already logged in
  const doLink = useCallback(async (uid, cid) => {
    setLinking(true);
    try {
      // Use the edge function directly since the RPC needs service_role
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      // Call the edge function to link
      const res = await fetch(
        `${supabase.supabaseUrl}/functions/v1/telegram-bot?action=link&chat_id=${cid}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: supabase.supabaseKey,
          },
        },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Link failed (${res.status})`);
      }

      setStatus('success');
      setMessage(t.telegramLinkSuccess || 'Your Telegram account has been linked! You will now receive order notifications here.');
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Failed to link account');
    } finally {
      setLinking(false);
    }
  }, [t]);

  // Check auth + chat_id on mount / user change
  useEffect(() => {
    const cid = chatId || sessionStorage.getItem(STORAGE_KEY);

    if (!cid) {
      setStatus('error');
      setMessage(t.telegramLinkNoChatId || 'No Telegram chat ID found. Please start the bot and tap "Link My Account".');
      return;
    }

    if (user) {
      doLink(user.id, cid);
    } else if (!user) {
      setStatus('need_login');
      setMessage(t.telegramLinkLoginRequired || 'Please log in to link your Telegram account.');
    }
  }, [user, chatId, doLink, t]);

  const handleLogin = () => {
    // Store chat_id again before redirect
    const cid = chatId || sessionStorage.getItem(STORAGE_KEY);
    if (cid) sessionStorage.setItem(STORAGE_KEY, cid);
    navigate('/login');
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Header icon */}
        <div className="flex justify-center">
          <div className={`p-4 rounded-2xl ${
            status === 'success'
              ? 'bg-green-500/10 text-green-400'
              : status === 'error'
              ? 'bg-red-500/10 text-red-400'
              : 'bg-[var(--accent)]/10 text-[var(--accent)]'
          }`}>
            {status === 'success' ? (
              <CheckCircle className="w-10 h-10" />
            ) : status === 'error' ? (
              <AlertCircle className="w-10 h-10" />
            ) : status === 'need_login' ? (
              <Link2 className="w-10 h-10" />
            ) : (
              <Loader2 className="w-10 h-10 animate-spin" />
            )}
          </div>
        </div>

        {/* Title */}
        <h1 className="text-xl font-bold text-[var(--text-primary)]">
          {status === 'success'
            ? (t.telegramLinkTitleSuccess || 'Account Linked!')
            : status === 'error'
            ? (t.telegramLinkTitleError || 'Linking Failed')
            : status === 'need_login'
            ? (t.telegramLinkTitleLogin || 'Login Required')
            : (t.telegramLinkTitleLoading || 'Linking Your Account...')}
        </h1>

        {/* Message */}
        <p className="text-[var(--text-sec)] text-sm leading-relaxed">
          {message}
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-3 items-center">
          {status === 'need_login' && (
            <button
              type="button"
              onClick={handleLogin}
              className="btn btn-primary gap-2"
            >
              <MessageSquare className="w-4 h-4" />
              {t.login || 'Login'}
            </button>
          )}

          {status === 'success' && (
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="btn btn-primary gap-2"
            >
              {t.goToProfile || 'Go to Profile'}
            </button>
          )}

          {status === 'error' && (
            <button
              type="button"
              onClick={() => navigate('/')}
              className="btn btn-secondary gap-2"
            >
              {t.goHome || 'Go Home'}
            </button>
          )}

          {linking && (
            <div className="flex items-center gap-2 text-sm text-[var(--text-sec)]">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t.telegramLinking || 'Linking...'}
            </div>
          )}
        </div>

        {/* Info */}
        <p className="text-xs text-[var(--text-muted)]">
          {t.telegramLinkInfo || 'You can unlink anytime from your profile settings.'}
        </p>
      </div>
    </div>
  );
}
