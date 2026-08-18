import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ShoppingBag, X, Trash2, ArrowRight } from 'lucide-react';
import { getCartLineKey, getCartItemImageUrl } from '../../lib/cartUtils';
import { getOfferDisplayName, getGameDisplayName, formatPrice } from '../../lib/offerDisplay';
import { brandUserText } from '../../lib/branding';

function CartDrawerItem({ item, games, offers, lang, t, onRemove }) {
  const name = brandUserText(getOfferDisplayName(item, lang, { games, relatedOffers: offers }));
  const game = games.find((g) => String(g.id) === String(item.game_id));
  const gameName = game ? brandUserText(getGameDisplayName(game, lang)) : null;
  const imageUrl = getCartItemImageUrl(item, games, offers);
  const price = formatPrice(item.price);

  return (
    <div className="flex items-stretch gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/60 p-2.5">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="w-14 h-14 rounded-lg object-cover bg-[var(--bg-elevated)] shrink-0"
          loading="lazy"
        />
      ) : (
        <div className="w-14 h-14 rounded-lg bg-[var(--bg-elevated)] shrink-0" aria-hidden="true" />
      )}
      <div className="flex-1 min-w-0 flex flex-col justify-center py-0.5">
        {gameName && (
          <div className="text-[10px] text-[var(--text-muted)] truncate font-medium">{gameName}</div>
        )}
        <div className="text-xs font-semibold leading-snug line-clamp-2">{name}</div>
      </div>
      <div className="flex flex-col items-end justify-between gap-1 shrink-0 py-0.5">
        <button
          type="button"
          onClick={() => onRemove(getCartLineKey(item))}
          className="p-1.5 text-red-400/80 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
          aria-label={t.delete}
          title={t.delete}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <div className="font-mono font-black text-sm text-[var(--accent)] tabular-nums" dir="ltr">
          ${price}
        </div>
      </div>
    </div>
  );
}

export default function CartDrawer({
  open = false,
  onClose,
  cart = [],
  games = [],
  offers = [],
  lang = 'ar',
  t = {},
  getCartTotal,
  onRemoveItem,
  onCheckout,
}) {
  const isAr = lang === 'ar';
  const total = getCartTotal?.() ?? '0.00';
  const count = cart.length;

  // Lock body scroll while the drawer is open
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="cart-backdrop"
            className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            key="cart-panel"
            role="dialog"
            aria-modal="true"
            aria-label={t.cartDrawerTitle || t.cart}
            className="fixed top-0 bottom-0 end-0 z-[131] w-full max-w-sm flex flex-col border-s border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
            initial={{ opacity: 0, x: isAr ? -32 : 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: isAr ? -32 : 32 }}
            transition={{ type: 'tween', duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-[var(--border)]">
              <h2 className="font-bold text-base flex items-center gap-2">
                <ShoppingBag className="w-4.5 h-4.5 text-[var(--accent)]" aria-hidden="true" />
                {t.cartDrawerTitle || t.cart}
                {count > 0 && (
                  <span className="text-xs font-semibold text-[var(--text-muted)]">
                    {count} {t.cartItemsCount || t.itemsPurchased}
                  </span>
                )}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg text-[var(--text-sec)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
                aria-label={t.closeMenu || t.close}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {count === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)]">
                  <ShoppingBag className="w-7 h-7" aria-hidden="true" />
                </div>
                <p className="text-sm font-semibold text-[var(--text-sec)]">{t.cartDrawerEmpty}</p>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-secondary text-sm py-2 px-4"
                >
                  {t.cartDrawerContinue || t.continueShopping}
                </button>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                  {cart.map((item) => (
                    <CartDrawerItem
                      key={getCartLineKey(item)}
                      item={item}
                      games={games}
                      offers={offers}
                      lang={lang}
                      t={t}
                      onRemove={onRemoveItem}
                    />
                  ))}
                </div>
                <div className="px-4 py-4 border-t border-[var(--border)] space-y-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-[var(--text-sec)]">{t.cartDrawerSubtotal || t.total}</span>
                    <span className="font-mono font-black text-lg text-[var(--accent)] tabular-nums" dir="ltr">
                      ${total}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={onCheckout}
                    className="btn btn-primary w-full py-3 text-sm font-black inline-flex items-center justify-center gap-2"
                  >
                    {t.cartDrawerCheckout || t.checkout}
                    <ArrowRight className={`w-4 h-4 ${isAr ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="btn btn-secondary w-full py-2.5 text-xs"
                  >
                    {t.cartDrawerContinue || t.continueShopping}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
