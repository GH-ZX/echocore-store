import { useState } from 'react';
import { Bitcoin, CreditCard, Wallet, WalletCards } from 'lucide-react';

export default function CheckoutView({ t, lang = 'ar', cart, submitOrder, onComplete, currentBalance = 0 }) {
  const [selectedMethod, setSelectedMethod] = useState('binance');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSimModal, setShowSimModal] = useState(false);
  const [simRef, setSimRef] = useState('');

  const totalNum = cart.reduce((s, i) => s + parseFloat(i.price), 0);
  const total = totalNum.toFixed(2);
  const hasEnoughBalance = currentBalance >= totalNum;

  const paymentMethods = [
    { id: 'binance', name: t.binance, icon: Bitcoin, color: 'text-[#FCD535]' },
    { id: 'mastercard', name: t.mastercard, icon: CreditCard, color: 'text-blue-500' },
    { id: 'ShamCash', name: t.shamCash, icon: Wallet, color: 'text-green-500' }
  ];

  // Balance option
  const balanceOption = {
    id: 'balance',
    name: t.payFromBalance || (t.balance ? `${t.balance} (${currentBalance.toFixed(2)})` : 'Pay from Balance'),
    icon: WalletCards,
    color: 'text-emerald-400'
  };

  const allMethods = hasEnoughBalance 
    ? [balanceOption, ...paymentMethods] 
    : paymentMethods;

  const handleCheckoutProcess = async () => {
    if (selectedMethod === 'balance') {
      setIsProcessing(true);
      try {
        const result = await submitOrder(cart, selectedMethod);
        onComplete(result);
      } catch (e) {
        alert('Checkout failed. ' + (e.message || ''));
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // External payment method → simulate first (fixes "only balance works" issue)
    setShowSimModal(true);
    setSimRef('');
  };

  const confirmExternalCheckout = async () => {
    setIsProcessing(true);
    try {
      // fake API delay + reference
      await new Promise(r => setTimeout(r, 1300));
      const ref = selectedMethod.toUpperCase().slice(0,4) + '-' + Date.now().toString().slice(-7);

      const result = await submitOrder(cart, selectedMethod);
      setSimRef(ref);

      setTimeout(() => {
        setShowSimModal(false);
        setIsProcessing(false);
        onComplete(result);
      }, 700);
    } catch (e) {
      alert('Payment failed. ' + (e.message || ''));
      setIsProcessing(false);
      setShowSimModal(false);
    }
  };

  const selectBalance = () => {
    if (hasEnoughBalance) setSelectedMethod('balance');
  };

  return (
    <div className="max-w-xl mx-auto mt-4 sm:mt-6 px-2 animate-fade-in">
      <div className="card p-8 md:p-12">
        <h2 className="text-3xl font-black mb-2 text-center">{t.paymentMethod}</h2>
        <div className="text-center text-sm text-[var(--text-sec)] mb-3">
          Order total: <span className="font-mono font-bold text-[var(--accent)]">${total}</span>
        </div>
        <div className="text-center text-xs mb-6 text-[var(--text-muted)]">
          {t.currentBalance ? `${t.currentBalance}: ` : 'Your balance: '}<span className="font-mono">${currentBalance.toFixed(2)}</span>
        </div>

        <div className="space-y-3 mb-8">
          {allMethods.map(method => {
            const Icon = method.icon;
            const active = selectedMethod === method.id;
            const isBalance = method.id === 'balance';
            return (
              <div
                key={method.id}
                onClick={() => {
                  if (isBalance) selectBalance();
                  else setSelectedMethod(method.id);
                }}
                className={`flex items-center p-5 rounded-2xl cursor-pointer border transition-all ${active ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] hover:border-[var(--accent)]/70'} ${isBalance ? 'ring-1 ring-emerald-500/30' : ''}`}
              >
                <Icon className={`w-9 h-9 ${method.color} mx-4`} />
                <div className="flex-1">
                  <div className="font-bold text-lg">{method.name}</div>
                  {isBalance && (
                    <div className="text-[10px] text-emerald-400">{t.useBalance || 'Deduct directly from your account balance'}</div>
                  )}
                </div>
                {isBalance && !hasEnoughBalance && (
                  <div className="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-400">{t.insufficientBalance || 'Not enough'}</div>
                )}
              </div>
            );
          })}
        </div>

        <button 
          onClick={handleCheckoutProcess} 
          disabled={isProcessing || cart.length === 0 || (selectedMethod === 'balance' && !hasEnoughBalance)} 
          className="btn btn-primary w-full py-5 text-xl font-black disabled:opacity-60"
        >
          {isProcessing ? 'Processing...' : (selectedMethod === 'balance' ? (t.payFromBalance || 'Pay from Balance') : t.payNow)}
        </button>

        <div className="text-center text-xs text-[var(--text-muted)] mt-4">
          {selectedMethod === 'balance' ? (t.balanceUsed || 'Instant deduction from balance') : 'Instant delivery after payment confirmation'}
        </div>

        {hasEnoughBalance && (
          <div className="mt-3 text-[10px] text-center text-emerald-400/70">{t.useBalance || 'You can also pay directly using your balance above'}</div>
        )}
      </div>

      {/* Payment simulation modal for direct methods (Binance etc) */}
      {showSimModal && (
        <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4" onClick={() => !isProcessing && setShowSimModal(false)}>
          <div className="card w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-2 text-center">{t.confirmPayment || (lang === 'ar' ? 'تأكيد الدفع' : 'Confirm Payment')}</h3>
            <p className="text-center text-sm mb-5 text-[var(--text-sec)]">Total ${total} via {selectedMethod}</p>

            {selectedMethod === 'binance' && <div className="bg-black/60 rounded-2xl p-4 mb-4 text-center text-xs">Scan QR with Binance app (simulated)</div>}
            {selectedMethod === 'ShamCash' && <div className="bg-black/60 rounded-2xl p-4 mb-4 text-center"><div className="text-green-400">SHAMCASH REF</div><div className="font-mono">INV-{Date.now().toString().slice(-7)}</div></div>}
            {selectedMethod === 'mastercard' && <div className="bg-black/60 rounded-2xl p-4 mb-4 text-xs text-center">Card payment simulated — real version uses Stripe</div>}

            {!simRef ? (
              <button onClick={confirmExternalCheckout} disabled={isProcessing} className="btn btn-primary w-full py-4">
                {isProcessing ? 'Processing...' : (t.payNow || 'Pay Now')}
              </button>
            ) : (
              <div className="text-center text-emerald-400 py-2 font-bold">Payment successful! Redirecting...</div>
            )}

            {!isProcessing && <button onClick={() => setShowSimModal(false)} className="text-xs mt-3 text-[var(--text-sec)] w-full">Cancel</button>}
          </div>
        </div>
      )}
    </div>
  );
}

