import { Trash2 } from 'lucide-react';

export default function CartView({ t, lang, cart, getCartTotal, onRemoveItem, onCheckout }) {
  return (
    <div className="max-w-5xl mx-auto mt-4 sm:mt-6 px-2 animate-fade-in">
      <h2 className="text-3xl font-black mb-6 flex items-center gap-3">{t.cart}</h2>

      {cart.length === 0 ? (
        <div className="card py-20 text-center">
          <p className="text-2xl font-bold text-[var(--text-sec)] mb-2">{t.emptyCart}</p>
          <p className="text-sm text-[var(--text-muted)]">Start shopping from the homepage</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            {cart.map((item, index) => {
              const name = lang === 'ar' ? item.name_ar : item.name_en;
              return (
                <div key={index} className="card flex items-center gap-5 p-4">
                  <div className={`w-16 h-16 flex-none rounded-xl bg-gradient-to-br ${item.color || 'from-slate-600 to-slate-800'} flex items-center justify-center text-white font-bold text-xl`}>
                    {name?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{name}</div>
                    <div className="text-xs text-[var(--text-sec)]">Qty 1 • Digital delivery</div>
                  </div>
                  <div className="font-mono font-black text-xl">${parseFloat(item.price).toFixed(2)}</div>
                  <button onClick={() => onRemoveItem(index)} className="p-3 text-red-400 hover:bg-red-500/10 rounded-xl">
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

            <button onClick={onCheckout} className="btn btn-primary w-full py-4 text-lg">
              {t.checkout}
            </button>
            <div className="text-xs text-center text-[var(--text-muted)] mt-3">Secure checkout • Instant delivery</div>
          </div>
        </div>
      )}
    </div>
  );
}

