import { useState } from 'react';
import { Bitcoin, CreditCard, Wallet, ArrowLeft, Loader2, CheckCircle } from 'lucide-react';

export default function RechargeView({ t, lang, navigate, user, currentBalance, onRechargeComplete }) {
  const [selectedAmount, setSelectedAmount] = useState(10);
  const [customAmount, setCustomAmount] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('binance');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSimModal, setShowSimModal] = useState(false);
  const [simRef, setSimRef] = useState('');

  const balance = typeof currentBalance === 'number' ? currentBalance : (user?.balance || 0);

  const presetAmounts = [5, 10, 25, 50, 100];

  const paymentMethods = [
    { id: 'binance', name: t.binance || 'Binance Pay (USDT)', icon: Bitcoin, color: 'text-[#FCD535]', desc: lang === 'ar' ? 'مسح QR في تطبيق Binance' : 'Scan QR in Binance app' },
    { id: 'ShamCash', name: t.shamCash || 'ShamCash', icon: Wallet, color: 'text-green-500', desc: lang === 'ar' ? 'ادفع عبر تطبيق ShamCash' : 'Pay via ShamCash app' },
    { id: 'mastercard', name: t.mastercard || 'MasterCard / Visa', icon: CreditCard, color: 'text-blue-500', desc: lang === 'ar' ? 'بطاقة ائتمان / خصم' : 'Credit / Debit Card' }
  ];

  const effectiveAmount = customAmount ? parseFloat(customAmount) : selectedAmount;
  const isValidAmount = effectiveAmount > 0 && effectiveAmount <= 1000; // reasonable cap

  const handleAmountPreset = (amt) => {
    setSelectedAmount(amt);
    setCustomAmount('');
  };

  const handleCustomChange = (e) => {
    const val = e.target.value.replace(/[^0-9.]/g, '');
    setCustomAmount(val);
    if (val) setSelectedAmount(0);
  };

  const startRecharge = () => {
    if (!isValidAmount) return;
    setShowSimModal(true);
    setSimRef('');
  };

  // Simulated "API call" per method (research notes in comments)
  const simulateApiCall = async (method, amount) => {
    // Simulate network + payment confirmation delay
    await new Promise(r => setTimeout(r, 1400));

    const refBase = method.toUpperCase().slice(0, 4) + '-' + Date.now().toString().slice(-8);

    if (method === 'binance') {
      // REAL IMPLEMENTATION NOTES (Binance Pay):
      // 1. On your server (or Supabase Edge Function): POST https://api.binance.com/binancepay/openapi/v2/order
      //    Headers: with API key + signature (HMAC)
      //    Body: { merchantTradeNo, orderAmount: amount, currency: "USDT", ... }
      // 2. Get back qrContent + prepayId. Show the QR.
      // 3. User scans & pays in Binance.
      // 4. Listen to webhook at your configured URL (Merchant Portal > Webhooks). Verify signature using Binance public key.
      // 5. On status=PAID, call credit_user_balance RPC with reference=prepayId.
      return { success: true, reference: 'BIN-' + refBase, note: 'Binance order simulated' };
    }

    if (method === 'ShamCash') {
      // REAL IMPLEMENTATION NOTES (ShamCash):
      // ShamCash recently launched merchant APIs (2026). 
      // 1. Request access: https://shamcash.sy/ar/apiRequest  (or their merchant portal)
      // 2. Once approved you will receive API token + instructions (likely create invoice + status check or webhook).
      // 3. Flow usually: create invoice on their side, user pays with ShamCash app using invoice/ref number.
      // 4. Poll status or receive callback, then credit balance.
      // NOTE: No fully public docs found as of research. Contact them directly.
      return { success: true, reference: 'SHAM-' + refBase, note: 'ShamCash invoice simulated' };
    }

    // mastercard / cards -> Stripe
    // REAL IMPLEMENTATION (Stripe):
    // 1. Backend: stripe.paymentIntents.create({ amount: amount*100, currency: 'usd', ... })
    //    return { clientSecret }
    // 2. On frontend use Stripe Elements / PaymentElement + confirmCardPayment(clientSecret)
    // 3. On success OR better on webhook payment_intent.succeeded -> credit balance via RPC.
    // Use @stripe/stripe-js + react-stripe-js in future when backend ready.
    return { success: true, reference: 'CARD-' + refBase, note: 'Card payment simulated' };
  };

  const confirmSimulatedPayment = async () => {
    if (!isValidAmount || !user?.id) {
      alert('Invalid amount or not logged in');
      return;
    }

    setIsProcessing(true);
    try {
      const result = await simulateApiCall(selectedMethod, effectiveAmount);
      
      // Record the recharge (calls parent's handler that updates DB + local state)
      await onRechargeComplete(effectiveAmount, selectedMethod, result.reference);

      setSimRef(result.reference);
      
      // Close modal after short success display
      setTimeout(() => {
        setShowSimModal(false);
        setIsProcessing(false);
        setSimRef('');
        // Optional: auto navigate or toast already handled by parent
      }, 900);
    } catch (err) {
      alert('Recharge failed: ' + (err.message || 'Unknown error'));
      setIsProcessing(false);
    }
  };

  const MethodIcon = ({ id, ...props }) => {
    const m = paymentMethods.find(x => x.id === id);
    const Icon = m ? m.icon : Wallet;
    return <Icon {...props} />;
  };

  return (
    <div className="max-w-2xl mx-auto">
      <button 
        onClick={() => navigate('/')} 
        className="mb-6 flex items-center gap-2 text-sm text-[var(--text-sec)] hover:text-[var(--accent)]"
      >
        <ArrowLeft className="w-4 h-4" /> {t.backToHome || (lang === 'ar' ? 'العودة للرئيسية' : 'Back to Home')}
      </button>

      <div className="card p-8 md:p-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] mb-4">
            <Wallet className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-black mb-2">{t.rechargeTitle || (lang==='ar' ? 'شحن الرصيد' : 'Recharge Balance')}</h1>
          <p className="text-[var(--text-sec)]">{t.rechargeSubtitle || (lang==='ar' ? 'اشحن رصيد حسابك لاستخدامه في الشراء الفوري من المتجر' : 'Top up your account balance to use for instant purchases')}</p>
        </div>

        {/* Current Balance */}
        <div className="mb-8 p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] text-center">
          <div className="text-sm text-[var(--text-muted)] mb-1">{t.currentBalance || (lang==='ar' ? 'رصيدك الحالي' : 'Current Balance')}</div>
          <div className="text-5xl font-black font-mono text-[var(--accent)]">${balance.toFixed(2)}</div>
        </div>

        {/* Amount Selection */}
        <div className="mb-8">
          <div className="text-sm font-semibold mb-3 text-[var(--text-sec)]">{t.chooseAmount || (lang==='ar' ? 'اختر المبلغ' : 'Choose Amount')}</div>
          
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-4">
            {presetAmounts.map(amt => (
              <button
                key={amt}
                onClick={() => handleAmountPreset(amt)}
                className={`py-3 rounded-2xl border font-bold transition-all ${(!customAmount && selectedAmount === amt) ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]' : 'border-[var(--border)] hover:border-[var(--accent)]/60'}`}
              >
                ${amt}
              </button>
            ))}
          </div>

          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1.5">{t.customAmount || (lang==='ar' ? 'مبلغ مخصص (USD)' : 'Custom amount (USD)')}</label>
            <input
              type="text"
              value={customAmount}
              onChange={handleCustomChange}
              placeholder={lang === 'ar' ? 'أدخل مبلغاً' : 'Enter amount'}
              className="w-full bg-[var(--bg-surface)] border border-[var(--border)] focus:border-[var(--accent)] rounded-2xl px-4 py-3 text-xl font-mono outline-none"
            />
          </div>
        </div>

        {/* Payment Method (same as checkout) */}
        <div className="mb-8">
          <div className="text-sm font-semibold mb-3 text-[var(--text-sec)]">{t.paymentMethod || 'Payment Method'}</div>
          <div className="space-y-3">
            {paymentMethods.map(method => {
              const Icon = method.icon;
              const active = selectedMethod === method.id;
              return (
                <div
                  key={method.id}
                  onClick={() => setSelectedMethod(method.id)}
                  className={`flex items-center p-4 rounded-2xl cursor-pointer border transition-all ${active ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] hover:border-[var(--accent)]/60'}`}
                >
                  <Icon className={`w-8 h-8 ${method.color} mx-4 flex-shrink-0`} />
                  <div>
                    <div className="font-bold">{method.name}</div>
                    <div className="text-xs text-[var(--text-muted)]">{method.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={startRecharge}
          disabled={!isValidAmount || isProcessing || !user}
          className="btn btn-primary w-full py-4 text-lg font-black disabled:opacity-60"
        >
          {t.rechargeNow || (lang === 'ar' ? 'شحن الرصيد الآن' : 'Recharge Now')} — ${effectiveAmount.toFixed(2)}
        </button>

        <div className="mt-4 text-center text-[10px] text-[var(--text-muted)]">
          {t.rechargeNote || (lang==='ar' ? 'الرصيد يُضاف فوراً بعد تأكيد الدفع. يمكن استخدامه لشراء أي عرض في المتجر.' : 'Balance is added instantly after payment confirmation. Usable for any store purchase.')}
        </div>
      </div>

      {/* Simulated Payment Modal */}
      {showSimModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={() => !isProcessing && setShowSimModal(false)}>
          <div className="card w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-xl mb-1 text-center">{lang === 'ar' ? 'تأكيد الدفع' : 'Confirm Payment'}</h3>
            <p className="text-center text-sm mb-6 text-[var(--text-sec)]">${effectiveAmount.toFixed(2)} via {paymentMethods.find(m => m.id === selectedMethod)?.name}</p>

            {selectedMethod === 'binance' && (
              <div className="bg-black/60 p-4 rounded-2xl mb-5 text-center">
                <div className="font-mono text-xs mb-2 opacity-70">SIMULATED BINANCE QR</div>
                <div className="mx-auto w-40 h-40 bg-white rounded flex items-center justify-center text-black text-[10px] tracking-widest">SCAN WITH BINANCE APP<br/>USDT PAYMENT</div>
                <p className="text-xs mt-3 text-[var(--text-muted)]">In production: create real order via Binance Pay API and render qrContent</p>
              </div>
            )}

            {selectedMethod === 'ShamCash' && (
              <div className="bg-black/60 p-4 rounded-2xl mb-5 text-center">
                <div className="text-green-400 text-sm mb-1">SHAMCASH INVOICE</div>
                <div className="font-mono text-lg tracking-[3px] mb-2">INV-{Date.now().toString().slice(-7)}</div>
                <p className="text-xs text-[var(--text-muted)]">Open ShamCash app → Pay to merchant using reference above (simulated)</p>
              </div>
            )}

            {selectedMethod === 'mastercard' && (
              <div className="bg-black/60 p-4 rounded-2xl mb-5">
                <div className="text-xs mb-3 text-[var(--text-muted)] text-center">CARD DETAILS (SIMULATED)</div>
                <div className="space-y-2 text-xs">
                  <div className="bg-white/10 h-9 rounded px-3 flex items-center">4242 4242 4242 4242</div>
                  <div className="flex gap-2">
                    <div className="bg-white/10 flex-1 h-9 rounded px-3 flex items-center">12/29</div>
                    <div className="bg-white/10 flex-1 h-9 rounded px-3 flex items-center">424</div>
                  </div>
                </div>
                <p className="text-[10px] text-center mt-3 text-[var(--text-muted)]">Real: Use Stripe Payment Element + PaymentIntent</p>
              </div>
            )}

            {!simRef && (
              <button
                onClick={confirmSimulatedPayment}
                disabled={isProcessing}
                className="btn btn-primary w-full py-4 font-bold flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {lang === 'ar' ? 'جاري المعالجة...' : 'Processing...'}</>
                ) : (
                  t.confirmPayment || (lang === 'ar' ? 'تأكيد الدفع وشحن الرصيد' : 'Confirm & Credit Balance')
                )}
              </button>
            )}

            {simRef && (
              <div className="text-center py-3">
                <CheckCircle className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
                <div className="font-bold">{lang === 'ar' ? 'تمت عملية الشحن بنجاح!' : 'Recharge Successful!'}</div>
                <div className="text-xs text-[var(--text-muted)] mt-1 font-mono">{simRef}</div>
              </div>
            )}

            {!isProcessing && (
              <button onClick={() => setShowSimModal(false)} className="mt-4 w-full text-xs text-[var(--text-sec)] hover:text-white">
                {t.cancel || 'Cancel'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
