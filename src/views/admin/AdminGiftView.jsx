import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Gift, Loader2 } from 'lucide-react';
import AdminGiftForm from '../../components/admin/AdminGiftForm';
import { adminGetUserByUsername } from '../../lib/adminModeration';
import { getAdminDashboardPath, getAdminGiftReturnPath } from '../../lib/adminRoutes';
import { getFulfillmentGameForOffer } from '../../lib/gameRegions';

export default function AdminGiftView({
  t = {},
  lang = 'ar',
  offers = [],
  games = [],
  onSubmit,
  onNotify,
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const offerId = searchParams.get('offer') || '';
  const userParam = searchParams.get('user') || '';
  const returnParam = searchParams.get('return') || '';

  const [loadingRecipient, setLoadingRecipient] = useState(!!userParam);
  const [initialRecipient, setInitialRecipient] = useState(null);

  const initialOffer = useMemo(
    () => (offerId ? offers.find((o) => String(o.id) === String(offerId)) || null : null),
    [offers, offerId],
  );

  const initialGame = useMemo(
    () => (initialOffer ? getFulfillmentGameForOffer(initialOffer, games) : null),
    [initialOffer, games],
  );

  const returnPath = getAdminGiftReturnPath(returnParam, getAdminDashboardPath('users'));

  const goBack = useCallback(() => {
    navigate(returnPath);
  }, [navigate, returnPath]);

  useEffect(() => {
    if (!userParam) {
      setInitialRecipient(null);
      setLoadingRecipient(false);
      return undefined;
    }

    let cancelled = false;
    setLoadingRecipient(true);

    (async () => {
      try {
        const profile = await adminGetUserByUsername(userParam);
        if (cancelled) return;
        if (profile?.role === 'admin') {
          setInitialRecipient(null);
        } else {
          setInitialRecipient(profile);
        }
      } catch {
        if (!cancelled) setInitialRecipient(null);
      } finally {
        if (!cancelled) setLoadingRecipient(false);
      }
    })();

    return () => { cancelled = true; };
  }, [userParam]);

  const handleSuccess = useCallback(() => {
    navigate(returnPath);
  }, [navigate, returnPath]);

  return (
    <div className="max-w-xl mx-auto mt-4 sm:mt-6 px-2 pb-12 animate-fade-in">
      <button
        type="button"
        onClick={goBack}
        className="flex items-center gap-2 mb-4 text-sm text-[var(--text-sec)] hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" /> {t.back}
      </button>

      <div className="card p-6 sm:p-8 border border-pink-500/15">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-pink-500/15 text-pink-300 flex items-center justify-center shrink-0">
            <Gift className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-black truncate">{t.adminGiftTitle}</h1>
            <p className="text-sm text-[var(--text-sec)]">{t.adminGiftSubtitle}</p>
          </div>
        </div>

        {loadingRecipient ? (
          <div className="py-12 text-center text-[var(--text-sec)]">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--accent)]" />
            <p className="mt-3">{t.loading}</p>
          </div>
        ) : (
          <AdminGiftForm
            t={t}
            lang={lang}
            offers={offers}
            games={games}
            initialRecipient={initialRecipient}
            initialOffer={initialOffer}
            initialGame={initialGame}
            lockRecipient={!!userParam && !!initialRecipient}
            lockOffer={!!initialOffer}
            onSubmit={onSubmit}
            onNotify={onNotify}
            onSuccess={handleSuccess}
            onCancel={goBack}
          />
        )}
      </div>
    </div>
  );
}