import { Trash2 } from 'lucide-react';
import { getCartLineKey } from '../lib/cartUtils';
import { brandUserText } from '../lib/branding';
import { getOfferDisplayName } from '../lib/offerDisplay';
import { cartRequiresPlayerUid } from '../lib/catalogUtils';

export default function CartView({
  t,
  lang,
  cart,
  games = [],
  offers = [],
  getCartTotal,
  onRemoveItem,
  onCheckout,
  priceUpdated = false,
}) {
  const isAr = lang === 'ar';
  const uidBlocked = cartRequiresPlayerUid(cart, games);

  return (
    <div className="max-w-5xl mx-auto mt-4 sm:mt-6 px-2 animate-fade-in">
      <h2 className="text-3xl font-black mb-6 flex items-center gap-3">{t.cart}</h2>

      {priceUpdated && cart.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {t.cartPricesUpdated || (isAr ? 'تم تحديث أسعار بعض العناصر في سلتك.' : 'Some item prices in your cart were updated.')}
        </div>
      )}

      {cart.length === 0 ? (
        <div className="card py-20 text-center">
          <p className="text-2xl font-bold text-[var(--text-sec)] mb-2">{t.emptyCart}</p>
          <p className="text-sm text-[var(--text-muted)]">
            {t.cartEmptyHint || (isAr ? 'ابدأ التسوق من الصفحة الرئيسية' : 'Start shopping from the homepage')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            {cart.map((item) => {
              const name = brandUserText(getOfferDisplayName(item, lang, { games, relatedOffers: offers }));
              return (
                <div key={getCartLineKey(item)} className="card flex items-center gap-5 p-4">
                  <div className={`w-16 h-16 flex-none rounded-xl bg-gradient-to-br ${item.color || 'from-slate-600 to-slate-800'} flex items-center justify-center text-white font-bold text-xl`}>
                    {name?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{name}</div>
                    <div className="text-xs text-[var(--text-sec)]">Qty 1 • Digital delivery</div>
                  </div>
                  <div className="font-mono font-black text-xl">${parseFloat(item.price).toFixed(2)}</div>
                  <button
                    onClick={() => onRemoveItem(getCartLineKey(item))}
                    className="p-3 text-red-400 hover:bg-red-500/10 rounded-xl"
                    aria-label={t.delete}
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="card p-7 h-fit lg:sticky lg:top-20">
            <div className="flex justify-between mb-6">
              <div className="font-bold text-lg">{t.total}</div>
              <div className="text-3xl font-black text-[var(--accent)]">${getCartTotal()}</div>
            </div>

            {uidBlocked && (
              <p className="text-sm text-amber-200/90 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2 mb-3">
                {t.cartUidCheckoutBlocked}
              </p>
            )}
            <button
              onClick={onCheckout}
              disabled={uidBlocked}
              className="btn btn-primary w-full py-4 text-lg disabled:opacity-50 disabled:pointer-events-none"
            >
              {t.checkout}
            </button>
            <div className="text-xs text-center text-[var(--text-muted)] mt-3">
              {t.secureCheckoutNote || (isAr ? 'دفع آمن • تسليم فوري' : 'Secure checkout • Instant delivery')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}