import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Handshake, Loader2 } from 'lucide-react';
import {
  acceptPartnerInvite,
  formatPartnerTierLabel,
  partnerInviteErrorMessage,
} from '../lib/partners';

export default function PartnerJoinView({
  t = {},
  lang = 'ar',
  user,
  navigate,
  onPartnerJoined,
}) {
  const [params] = useSearchParams();
  const token = (params.get('token') || '').trim();
  const [status, setStatus] = useState(token ? 'working' : 'missing');
  const [tier, setTier] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return undefined;
    if (!user?.id) {
      setStatus('login');
      return undefined;
    }

    let cancelled = false;
    (async () => {
      setStatus('working');
      setError('');
      try {
        const result = await acceptPartnerInvite(token);
        if (cancelled) return;
        const joined = result?.tier || null;
        setTier(joined ? {
          id: joined.id,
          slug: joined.slug,
          nameEn: joined.nameEn,
          nameAr: joined.nameAr,
          markupPercent: Number(joined.markupPercent),
        } : null);
        setStatus('ok');
        onPartnerJoined?.(joined);
      } catch (e) {
        if (cancelled) return;
        const code = e?.message || 'invite_invalid';
        setError(partnerInviteErrorMessage(code, t));
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, user?.id, t, onPartnerJoined]);

  if (!user) {
    return (
      <div className="max-w-md mx-auto card p-8 text-center mt-8">
        <Handshake className="w-10 h-10 mx-auto text-[var(--accent)] mb-3" />
        <h1 className="text-xl font-black mb-2">{t.partnerJoinTitle}</h1>
        <p className="text-sm text-[var(--text-sec)] mb-6">{t.partnerJoinLoginRequired}</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => navigate('/login', { state: { from: `/partner/join?token=${token}` } })}
        >
          {t.login}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto card p-8 text-center mt-8 animate-fade-in">
      <Handshake className="w-10 h-10 mx-auto text-[var(--accent)] mb-3" />
      <h1 className="text-xl font-black mb-2">{t.partnerJoinTitle}</h1>

      {status === 'working' && (
        <div className="flex items-center justify-center gap-2 text-[var(--text-muted)] py-6">
          <Loader2 className="w-5 h-5 animate-spin" />
          {t.partnerJoinWorking}
        </div>
      )}

      {status === 'ok' && (
        <>
          <p className="text-emerald-300 font-semibold mb-1">{t.partnerJoinSuccess}</p>
          {tier && (
            <p className="text-sm text-[var(--text-sec)] mb-6">
              {formatPartnerTierLabel(tier, lang)}
              {' · '}
              <span dir="ltr">+{tier.markupPercent}%</span>
              {' '}
              {t.partnerJoinMarkupHint}
            </p>
          )}
          <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>
            {t.backToHome}
          </button>
        </>
      )}

      {(status === 'error' || status === 'missing') && (
        <>
          <p className="text-red-300 text-sm mb-6">{error || t.partnerInviteInvalid}</p>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
            {t.backToHome}
          </button>
        </>
      )}
    </div>
  );
}
