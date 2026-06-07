import React from 'react';
import { Gift, Gamepad2, ArrowRight, ArrowLeft, ShoppingCart } from 'lucide-react';

export default function ProductView({ t, lang, selectedProduct, onBack, addToCart }) {
  if (!selectedProduct) return null;

  return (
    <div className="max-w-5xl mx-auto mt-8 animate-fade-in">
      <button onClick={onBack} className="mb-8 text-slate-400 flex items-center gap-2 hover:text-cyan-400 font-bold bg-[#0a1329] px-4 py-2 rounded-xl border border-slate-800">
        {lang === 'ar' ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />} {t.back}
      </button>
      <div className="bg-[#0a1329] rounded-3xl border border-cyan-900/40 overflow-hidden flex flex-col md:flex-row relative">
        <div className={`w-full md:w-2/5 h-80 md:h-auto bg-gradient-to-br ${selectedProduct.color} flex items-center justify-center relative overflow-hidden`}>
          {selectedProduct.icon === 'Gift' ? <Gift className="w-40 h-40 text-white drop-shadow-2xl z-10" /> : <Gamepad2 className="w-40 h-40 text-white drop-shadow-2xl z-10" />}
        </div>
        <div className="p-8 md:p-12 flex-1 flex flex-col justify-center z-10">
          <h2 className="text-4xl md:text-5xl font-black text-white mb-6 leading-tight">{lang === 'ar' ? selectedProduct.name_ar : selectedProduct.name_en}</h2>
          <p className="text-slate-300 text-lg mb-8 leading-relaxed">{t.instantDelivery}</p>
          <div className="flex flex-col sm:flex-row items-center justify-between mt-auto pt-8 border-t border-slate-800/80 gap-6">
            <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">${parseFloat(selectedProduct.price).toFixed(2)}</span>
            <button onClick={() => addToCart(selectedProduct)} className="w-full sm:w-auto bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 text-white px-10 py-5 rounded-2xl font-black text-xl transition-all shadow-[0_0_30px_rgba(34,211,238,0.3)] flex items-center justify-center gap-3">
              <ShoppingCart className="w-6 h-6" /> {t.addToCart}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
