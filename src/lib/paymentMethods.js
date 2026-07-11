import { Bitcoin, CreditCard, Wallet, WalletCards } from 'lucide-react';

export const PAYMENT_METHOD_DEFS = {
  balance: {
    id: 'balance',
    icon: WalletCards,
    color: 'text-emerald-400',
    nameKey: 'payFromBalance',
    fallbackEn: 'Pay from Balance',
    fallbackAr: 'الدفع من الرصيد',
    descEn: 'Deduct directly from your account balance',
    descAr: 'خصم مباشر من رصيد حسابك',
    requiresBalance: true,
  },
  ShamCash: {
    id: 'ShamCash',
    icon: Wallet,
    color: 'text-green-500',
    nameKey: 'shamCash',
    fallbackEn: 'ShamCash',
    fallbackAr: 'ShamCash',
    descEn: 'Pay via ShamCash app',
    descAr: 'ادفع عبر تطبيق ShamCash',
  },
  binance: {
    id: 'binance',
    icon: Bitcoin,
    color: 'text-[#FCD535]',
    nameKey: 'binance',
    fallbackEn: 'Binance Pay (USDT)',
    fallbackAr: 'بايننس باي (USDT)',
    descEn: 'Scan QR in Binance app',
    descAr: 'مسح QR في تطبيق Binance',
    disabled: true,
    comingSoon: true,
  },
  mastercard: {
    id: 'mastercard',
    icon: CreditCard,
    color: 'text-blue-500',
    nameKey: 'mastercard',
    fallbackEn: 'MasterCard / Visa',
    fallbackAr: 'ماستر كارد / فيزا',
    descEn: 'Credit / Debit Card',
    descAr: 'بطاقة ائتمان / خصم',
    disabled: true,
    comingSoon: true,
  },
};

export function buildPaymentMethods(t, lang, paymentConfig = {}, options = {}) {
  const isAr = lang === 'ar';
  const { includeBalance = false, currentBalance = 0 } = options;

  const walletMode = paymentConfig.walletMode === 'api' ? 'api' : 'manual';
  const manualReady = !!paymentConfig.shamcashManualReady;
  const apiReady = !!paymentConfig.samApiReady;
  const shamcashFlag = paymentConfig.shamcash !== false && paymentConfig.shamcash !== undefined
    ? !!paymentConfig.shamcash
    : true;
  const shamcashPaymentReady = walletMode === 'api' ? apiReady : manualReady;

  const enabled = {
    shamcash: shamcashFlag && shamcashPaymentReady,
    binance: !!paymentConfig.binance,
    mastercard: !!paymentConfig.mastercard,
  };

  const label = (def) => (t[def.nameKey] || (isAr ? def.fallbackAr : def.fallbackEn));
  const desc = (def) => (isAr ? def.descAr : def.descEn);

  const methods = [];

  if (includeBalance) {
    const def = PAYMENT_METHOD_DEFS.balance;
    methods.push({
      ...def,
      name: label(def),
      desc: desc(def),
      disabled: currentBalance <= 0,
    });
  }

  if (enabled.shamcash) {
    const def = PAYMENT_METHOD_DEFS.ShamCash;
    methods.push({ ...def, name: label(def), desc: desc(def), disabled: false });
  }

  if (enabled.binance) {
    const def = PAYMENT_METHOD_DEFS.binance;
    methods.push({ ...def, name: label(def), desc: desc(def), disabled: false });
  } else {
    const def = PAYMENT_METHOD_DEFS.binance;
    methods.push({
      ...def,
      name: label(def),
      desc: isAr ? 'قريباً' : 'Coming soon',
      disabled: true,
      comingSoon: true,
    });
  }

  if (enabled.mastercard) {
    const def = PAYMENT_METHOD_DEFS.mastercard;
    methods.push({ ...def, name: label(def), desc: desc(def), disabled: false });
  } else {
    const def = PAYMENT_METHOD_DEFS.mastercard;
    methods.push({
      ...def,
      name: label(def),
      desc: isAr ? 'قريباً' : 'Coming soon',
      disabled: true,
      comingSoon: true,
    });
  }

  return methods;
}

export function getDefaultPaymentMethod(methods) {
  const usable = methods.filter((m) => !m.disabled && !m.comingSoon);
  const shamcash = usable.find((m) => m.id === 'ShamCash');
  if (shamcash) return 'ShamCash';
  const balance = usable.find((m) => m.id === 'balance');
  if (balance) return 'balance';
  return usable[0]?.id || 'ShamCash';
}