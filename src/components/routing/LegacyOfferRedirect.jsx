import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getGameOfferBuyPath, getGameOfferPath, resolveOfferRoute } from '../../lib/offerRoutes';

export default function LegacyOfferRedirect({
  offers,
  games,
  loading = false,
  lang = 'ar',
  target = 'offer',
}) {
  const { id, offerId } = useParams();
  const navigate = useNavigate();
  const token = id || offerId;
  const { offer, game } = resolveOfferRoute(offers, games, { id: token, offerId: token });

  useEffect(() => {
    if (loading || !token) return;
    if (offer && game) {
      const path = target === 'buy'
        ? getGameOfferBuyPath(offer, games)
        : getGameOfferPath(offer, games);
      navigate(path, { replace: true });
    }
  }, [loading, token, offer, game, navigate, target]);

  if (loading || (!offer && offers.length === 0)) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-[var(--text-sec)] animate-pulse">
        {lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}
      </div>
    );
  }

  if (!offer) {
    return (
      <div className="max-w-md mx-auto text-center py-20 text-[var(--text-sec)]">
        {lang === 'ar' ? 'العرض غير موجود' : 'Offer not found'}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[40vh] text-[var(--text-sec)] animate-pulse">
      {lang === 'ar' ? 'جاري التحويل...' : 'Redirecting...'}
    </div>
  );
}