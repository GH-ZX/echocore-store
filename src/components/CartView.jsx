import React from 'react';
import { Gift, Gamepad2, Trash2 } from 'lucide-react';

export default function CartView({ t, lang, cart, getCartTotal, onRemoveItem, onCheckout }) {
  return (
    <div className="max-w-5xl mx-auto mt-8 animate-fade-in">
      <h2 className="text-3xl font-black text-white mb-8 flex items-center gap-3"><Gift className="text-cyan-400 w-8 h-8" /> {t.cart}</h2>
      {cart.length === 0 ? (
        <div className="text-center py-32 bg-[#0a1329] rounded-3xl border border-slate-800">
          <p className="text-2xl font-bold text-slate-300 mb-4">{t.emptyCart}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {cart.map((item, index) => (
              <div key={index} className="flex items-center gap-6 bg-[#0a1329] p-5 rounded-2xl border border-slate-800">
                <div className={`w-20 h-20 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center`}>
                  {item.icon === 'Gift' ? <Gift className="text-white w-8 h-8" /> : <Gamepad2 className="text-white w-8 h-8" />}
                </div>
                <div className="flex-1">
                  <h4 className="text-lg text-white font-bold">{lang === 'ar' ? item.name_ar : item.name_en}</h4>
                </div>
                <div className="text-xl font-black text-white">${item.price}</div>
                <button onClick={() => onRemoveItem(index)} className="p-3 text-red-400 hover:bg-red-400/10 rounded-xl"><Trash2 className="w-6 h-6" /></button>
              </div>
            ))}
          </div>
          <div className="bg-[#0a1329] p-8 rounded-3xl border border-slate-800 h-fit sticky top-28">
            <h3 className="text-xl font-bold text-white mb-6 border-b border-slate-800 pb-4">{t.total}</h3>
            <div className="flex justify-between items-center mb-8">
              <span className="text-lg text-white font-bold">{t.total}</span>
              <span className="text-3xl font-black text-cyan-400">${getCartTotal()}</span>
            </div>
            <button onClick={onCheckout} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white py-4 rounded-xl font-bold text-lg">
              {t.checkout}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
