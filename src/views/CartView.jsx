import { ShoppingBag, Trash2, ArrowRight, Package, ShieldCheck, Zap } from 'lucide-react';
import { getCartLineKey, getCartItemImageUrl } from '../lib/cartUtils';
import { brandUserText } from '../lib/branding';
import { getOfferDisplayName, getGameDisplayName, formatPrice } from '../lib/offerDisplay';
import { cartRequiresPlayerUid } from '../lib/catalogUtils';
import { presetImageUrl } from '../lib/imageUtils';
import { isCommerceBlockedDuringMaintenance } from '../lib/siteStatus';

function CartItemThumb({ src, name, color }) {
  const placeholder = new URL('../assets/placeholder-cover.svg', import.meta.url).href;
  const img = src ? presetImageUrl(src, 'cardCover') : null;

  return (
    <div
      className={`relative w-16 h-16 sm:w-20 sm:h-20 flex-none rounded-xl overflow-hidden border border-[var(--border)] bg-gradient-to-br ${color || 'from-slate-700 to-slate-900'}`}
    >
      {img ? (
        <img
          src={img}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          onError={(e) => {
            e.currentTarget.src = placeholder;
          }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white font-black text-xl opacity-90">
          {(name || '?')[0]}
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
    </div>
  );
}

export default function CartView({
  t,
  lang,
  cart,
  games = [],
  offers = [],
  getCartTotal,
  onRemoveItem,
  onCheckout,
  onContinueShopping,
  priceUpdated = false,
  siteStatus = null,
  user = null,
}) {
  const uidBlocked = cartRequiresPlayerUid(cart, games);
  const maintenanceBlocked = isCommerceBlockedDuringMaintenance(siteStatus, user);
  const total = getCartTotal?.() ?? '0.00';
  const count = cart.length;

  return (
    <div className="max-w-5xl mx-auto mt-4 sm:mt-6 px-2 sm:px-3 animate-fade-in pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2.5">
            <span className="inline-flex w-10 h-10 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)] items-center justify-center">
              <ShoppingBag className="w-5 h-5" />
            </span>
            {t.cart}
          </h1>
          {count > 0 && (
            <p className="text-sm text-[var(--text-muted)] mt-1.5 ps-12">
              {count} {t.cartItemsCount || t.itemsPurchased}
            </p>
          )}
        </div>
        {onContinueShopping && count > 0 && (
          <button
            type="button"
            onClick={onContinueShopping}
            className="btn btn-secondary text-sm py-2 px-4"
          >
            {t.continueShopping || t.backToHome}
          </button>
        )}
      </div>

      {priceUpdated && count > 0 && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {t.cartPricesUpdated}
        </div>
      )}

      {count === 0 ? (
        <div className="card py-16 sm:py-20 px-6 text-center max-w-lg mx-auto">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)]">
            <Package className="w-8 h-8" />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-[var(--text-sec)] mb-2">{t.emptyCart}</p>
          <p className="text-sm text-[var(--text-muted)] mb-6 max-w-sm mx-auto leading-relaxed">
            {t.cartEmptyHint}
          </p>
          {onContinueShopping && (
            <button type="button" onClick={onContinueShopping} className="btn btn-primary px-6 py-3">
              {t.continueShopping || t.backToHome}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
          <div className="lg:col-span-2 space-y-3">
            {cart.map((item) => {
              const name = brandUserText(
                getOfferDisplayName(item, lang, { games, relatedOffers: offers }),
              );
              const game = games.find((g) => String(g.id) === String(item.game_id));
              const gameName = game
                ? brandUserText(getGameDisplayName(game, lang))
                : null;
              const imageUrl = getCartItemImageUrl(item, games, offers);
              const price = formatPrice(item.price);
              const original = item.is_sale && item.original_price
                ? formatPrice(item.original_price)
                : null;

              return (
                <div
                  key={getCartLineKey(item)}
                  className="card flex items-stretch gap-3 sm:gap-4 p-3 sm:p-4 hover:border-[var(--accent)]/30 transition-colors"
                >
                  <CartItemThumb src={imageUrl} name={name} color={item.color} />

                  <div className="flex-1 min-w-0 flex flex-col justify-center py-0.5">
                    {gameName && (
                      <div className="text-[11px] sm:text-xs text-[var(--text-muted)] truncate mb-0.5 font-medium">
                        {gameName}
                      </div>
                    )}
                    <div className="font-semibold text-sm sm:text-base leading-snug line-clamp-2">
                      {name}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-[var(--text-muted)]">
                      <Zap className="w-3 h-3 text-[var(--accent)] shrink-0" />
                      <span>{t.cartLineQtyDelivery}</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end justify-between gap-2 shrink-0 py-0.5">
                    <button
                      type="button"
                      onClick={() => onRemoveItem(getCartLineKey(item))}
                      className="p-2 text-red-400/80 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                      aria-label={t.delete}
                      title={t.delete}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="text-end">
                      {original && (
                        <div className="text-[11px] line-through text-[var(--text-muted)]">
                          ${original}
                        </div>
                      )}
                      <div className="font-mono font-black text-lg sm:text-xl text-[var(--accent)] tabular-nums" dir="ltr">
                        ${price}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <aside className="card p-5 sm:p-7 h-fit lg:sticky lg:top-24 border-[var(--accent)]/15">
            <h2 className="font-bold text-lg mb-4">{t.orderSummary || t.orderInfo || t.total}</h2>

            <div className="space-y-3 text-sm mb-5">
              <div className="flex justify-between text-[var(--text-sec)]">
                <span>{t.cartItemsCount || t.itemsPurchased}</span>
                <span className="font-mono font-semibold text-[var(--text-primary)]">{count}</span>
              </div>
              <div className="h-px bg-[var(--border)]" />
              <div className="flex justify-between items-baseline gap-3">
                <span className="font-bold text-base">{t.total}</span>
                <span className="text-2xl sm:text-3xl font-black text-[var(--accent)] tabular-nums" dir="ltr">
                  ${total}
                </span>
              </div>
            </div>

            {maintenanceBlocked && (
              <p className="text-sm text-amber-200/90 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2.5 mb-3 leading-relaxed">
                {t.maintenanceCommerceBlocked}
              </p>
            )}
            {uidBlocked && !maintenanceBlocked && (
              <p className="text-sm text-amber-200/90 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2.5 mb-3 leading-relaxed">
                {t.cartUidCheckoutBlocked}
              </p>
            )}
            {!uidBlocked && !maintenanceBlocked && (
              <p className="text-xs text-[var(--text-muted)] mb-4 leading-relaxed">
                {t.cartVoucherOnlyHint}
              </p>
            )}

            <button
              type="button"
              onClick={onCheckout}
              disabled={uidBlocked || maintenanceBlocked || count === 0}
              className="btn btn-primary w-full py-3.5 sm:py-4 text-base sm:text-lg font-bold disabled:opacity-50 disabled:pointer-events-none inline-flex items-center justify-center gap-2"
            >
              {t.checkout}
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </button>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--text-muted)] mt-3.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400/80" />
              <span>{t.secureCheckoutNote}</span>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
