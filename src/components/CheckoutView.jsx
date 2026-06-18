import { useState } from 'react';
import { Bitcoin, CreditCard, Wallet } from 'lucide-react';

export default function CheckoutView({ t, cart, submitOrder, onComplete }) {
  const [selectedMethod, setSelectedMethod] = useState('binance');
  const [isProcessing, setIsProcessing] = useState(false);

  const total = cart.reduce((s, i) => s + parseFloat(i.price), 0).toFixed(2);

  const paymentMethods = [
    { id: 'binance', name: t.binance, icon: Bitcoin, color: 'text-[#FCD535]' },
    { id: 'mastercard', name: t.mastercard, icon: CreditCard, color: 'text-blue-500' },
    { id: 'chamcash', name: t.chamCash, icon: Wallet, color: 'text-green-500' }
  ];

  const handleCheckoutProcess = async () => {
    setIsProcessing(true);
    try {
      const result = await submitOrder(cart, selectedMethod);
      onComplete(result);
    } catch (e) {
      alert('Checkout failed. ' + (e.message || ''));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto mt-6 animate-fade-in">
      <div className="card p-8 md:p-12">
        <h2 className="text-3xl font-black mb-2 text-center">{t.paymentMethod}</h2>
        <div className="text-center text-sm text-[var(--text-sec)] mb-8">Order total: <span className="font-mono font-bold text-[var(--accent)]">${total}</span></div>

        <div className="space-y-3 mb-8">
          {paymentMethods.map(method => {
            const Icon = method.icon;
            const active = selectedMethod === method.id;
            return (
              <div
                key={method.id}
                onClick={() => setSelectedMethod(method.id)}
                className={`flex items-center p-5 rounded-2xl cursor-pointer border transition-all ${active ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] hover:border-[var(--accent)]/70'}`}
              >
                <Icon className={`w-9 h-9 ${method.color} mx-4`} />
                <div className="font-bold text-lg">{method.name}</div>
              </div>
            );
          })}
        </div>

        <button 
          onClick={handleCheckoutProcess} 
          disabled={isProcessing || cart.length === 0} 
          className="btn btn-primary w-full py-5 text-xl font-black disabled:opacity-60"
        >
          {isProcessing ? 'Processing...' : t.payNow}
        </button>

        <div className="text-center text-xs text-[var(--text-muted)] mt-4">
          Instant delivery after payment confirmation
        </div>
      </div>
    </div>
  );
}

