import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle, AlertCircle, MessageSquare, Link2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const STORAGE_KEY = 'echocore_telegram_link_token';

export default function TelegramLinkView({ t = {}, lang, user, navigate }) {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('loading'); // loading | success | error | need_login
  const [message, setMessage] = useState('');
  const [linking, setLinking] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [pendingToken, setPendingToken] = useState('');

  const linkToken = searchParams.get('token');
  const attempted = useRef(false);

  // Store token in sessionStorage on mount (before any redirect)
  useEffect(() => {
    if (linkToken) {
      sessionStorage.setItem(STORAGE_KEY, linkToken);
    }
  }, [linkToken]);

  // Try to link if user is already logged in
  const doLink = useCallback(async (tokenValue) => {
    setLinking(true);
    try {
      // The edge function verifies the session JWT and consumes the single-use token
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      // Call the edge function to link
      const res = await fetch(
        `${supabase.supabaseUrl}/functions/v1/telegram-bot?action=link&token=${encodeURIComponent(tokenValue)}`,
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

  // Check auth + token on mount / user change
  useEffect(() => {
    const tokenValue = linkToken || sessionStorage.getItem(STORAGE_KEY);

    if (!tokenValue) {
      setStatus('error');
      setMessage(t.telegramLinkNoChatId || 'No Telegram chat ID found. Please start the bot and tap "Link My Account".');
      return;
    }

    if (user) {
      // Never link on page load: show which Telegram account this is and ask first.
      // (Otherwise a crafted link could attach an attacker's Telegram to a logged-in user.)
      if (attempted.current) return;
      attempted.current = true;
      (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const res = await fetch(
            `${supabase.supabaseUrl}/functions/v1/telegram-bot?action=link-preview&token=${encodeURIComponent(tokenValue)}`,
            { headers: { Authorization: `Bearer ${session?.access_token}`, apikey: supabase.supabaseKey } },
          );
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error || `Link failed (${res.status})`);
          setDisplayName(body.display_name || '');
          setPendingToken(tokenValue);
          setStatus('confirm');
        } catch (err) {
          setStatus('error');
          setMessage(err.message || 'Failed to link account');
        }
      })();
    } else if (!user) {
      setStatus('need_login');
      setMessage(t.telegramLinkLoginRequired || 'Please log in to link your Telegram account.');
    }
  }, [user, linkToken, t]);

  const handleLogin = () => {
    // Store token again before redirect
    const tokenValue = linkToken || sessionStorage.getItem(STORAGE_KEY);
    if (tokenValue) sessionStorage.setItem(STORAGE_KEY, tokenValue);
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
            : status === 'confirm'
            ? (t.telegramLinkConfirmTitle || 'Link this Telegram account?')
            : status === 'need_login'
            ? (t.telegramLinkTitleLogin || 'Login Required')
            : (t.telegramLinkTitleLoading || 'Linking Your Account...')}
        </h1>

        {/* Message */}
        <p className="text-[var(--text-sec)] text-sm leading-relaxed">
          {status === 'confirm'
            ? (t.telegramLinkConfirmBody || 'This Telegram account will be linked to your store account and will be able to see your orders and balance. Continue only if it is yours.')
            : message}
        </p>

        {status === 'confirm' && displayName && (
          <p dir="auto" className="rounded-xl border border-[var(--border)] px-4 py-3 font-semibold text-[var(--text-primary)]">
            {displayName}
          </p>
        )}

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

          {status === 'confirm' && (
            <>
              <button
                type="button"
                onClick={() => doLink(pendingToken)}
                className="btn btn-primary gap-2"
              >
                <Link2 className="w-4 h-4" />
                {t.telegramLinkConfirmBtn || 'Yes, link this account'}
              </button>
              <button
                type="button"
                onClick={() => {
                  sessionStorage.removeItem(STORAGE_KEY);
                  navigate('/');
                }}
                className="btn btn-secondary gap-2"
              >
                {t.telegramLinkCancelBtn || 'Cancel'}
              </button>
            </>
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
