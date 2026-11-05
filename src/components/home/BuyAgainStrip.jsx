import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { fetchRecentPurchasedItems, pickBuyAgainOffers } from '../../lib/userDashboard';
import { getDisplayGameForOffer, getFulfillmentGameForOffer } from '../../lib/gameRegions';
import { getOfferDisplayName } from '../../lib/offerDisplay';
import { getGameCardImageUrl } from '../../lib/gameImages';
import { presetImageUrl } from '../../lib/imageUtils';
import { formatMoney } from '../../lib/i18n';
import OfferPackLabel from '../ui/OfferPackLabel';

/**
 * "Buy again" for returning customers: their latest packs, the player id each
 * went to, and one tap back into checkout (BuyView offers the saved id as a suggestion).
 */
export default function BuyAgainStrip({ user, offers = [], games = [], t = {}, lang = 'ar', onBuyNow }) {
  const userId = user?.role === 'admin' ? null : user?.id;
  const [items, setItems] = useState({ userId: null, rows: [] });

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    fetchRecentPurchasedItems(userId)
      .then((rows) => { if (!cancelled) setItems({ userId, rows }); })
      .catch(() => { /* optional section: hide on failure */ });
    return () => { cancelled = true; };
  }, [userId]);

  const rows = items.userId === userId ? items.rows : [];
  const picks = pickBuyAgainOffers(rows, offers, 4);
  if (!userId || picks.length === 0) return null;

  const isAr = lang === 'ar';

  return (
    <section className="buy-again" aria-labelledby="buy-again-title">
      <div className="buy-again__head">
        <RotateCcw className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
        <h2 id="buy-again-title" className="text-base sm:text-lg font-bold">{t.buyAgainTitle}</h2>
      </div>
      <ul className="buy-again__list">
        {picks.map(({ offer, playerUid, playerServer }) => {
          const game = getDisplayGameForOffer(offer, games);
          if (!game) return null;
          const fulfillmentGame = getFulfillmentGameForOffer(offer, games) || game;
          const image = getGameCardImageUrl(game);
          const playerId = playerServer ? `${playerUid} (${playerServer})` : playerUid;
          return (
            <li key={offer.id} className="buy-again__item">
              {image ? (
                <img src={presetImageUrl(image, 'thumb')} alt="" className="buy-again__thumb" loading="lazy" />
              ) : (
                <span className="buy-again__thumb" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-[var(--text-muted)] truncate">{isAr ? game.name_ar : game.name_en}</p>
                <OfferPackLabel as="p" className="text-sm font-semibold text-[var(--text-primary)] truncate">
                  {getOfferDisplayName(offer, lang, { game: fulfillmentGame, games, relatedOffers: offers })}
                </OfferPackLabel>
                {playerUid && (
                  <p className="text-[11px] text-[var(--text-muted)] truncate">
                    {t.buyAgainPlayer} <span dir="ltr" className="tabular-nums">{playerId}</span>
                  </p>
                )}
              </div>
              <div className="buy-again__actions">
                <span className="text-sm font-black text-[var(--price)] tabular-nums" dir="ltr">
                  {formatMoney(offer.price)}
                </span>
                <button
                  type="button"
                  className="btn btn-primary text-xs py-1.5 px-4 font-semibold whitespace-nowrap"
                  onClick={() => onBuyNow?.(offer)}
                >
                  {t.buyAgainCta}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
