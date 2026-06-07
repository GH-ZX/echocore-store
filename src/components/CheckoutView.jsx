import React, { useState } from 'react';
import { Bitcoin, CreditCard, Wallet } from 'lucide-react';

export default function CheckoutView({ t, cart, submitOrder, onComplete }) {
  const [selectedMethod, setSelectedMethod] = useState('binance');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleCheckoutProcess = async () => {
    setIsProcessing(true);
    await submitOrder(cart, selectedMethod);
    setIsProcessing(false);
    onComplete();
  };

  return (
    <div className="max-w-2xl mx-auto mt-8 animate-fade-in bg-[#0a1329] p-8 md:p-12 rounded-3xl border border-slate-800">
      <h2 className="text-3xl font-black text-white mb-10 text-center">{t.paymentMethod}</h2>
      <div className="space-y-4 mb-10">
        {[
          { id: 'binance', name: t.binance, icon: Bitcoin, color: 'text-[#FCD535]' },
          { id: 'mastercard', name: t.mastercard, icon: CreditCard, color: 'text-blue-500' },
          { id: 'chamcash', name: t.chamCash, icon: Wallet, color: 'text-green-500' }
        ].map(method => {
          const Icon = method.icon;
          return (
            <div
              key={method.id}
              onClick={() => setSelectedMethod(method.id)}
              className={`flex items-center p-6 rounded-2xl cursor-pointer border-2 ${selectedMethod === method.id ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-800'}`}>
              <Icon className={`w-10 h-10 ${method.color} mx-4`} />
              <span className="text-xl font-bold text-white">{method.name}</span>
            </div>
          );
        })}
      </div>
      <button onClick={handleCheckoutProcess} disabled={isProcessing} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white py-5 rounded-2xl font-black text-xl disabled:opacity-50">
        {isProcessing ? '...' : t.payNow}
      </button>
    </div>
  );
}
