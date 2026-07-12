import { Bitcoin, CreditCard, Smartphone, Wallet, WalletCards } from 'lucide-react';

export const MANUAL_WALLET_METHODS = ['ShamCash', 'SyriatelCash'];

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
    manualOnlyKey: 'shamcashManualOnly',
  },
  SyriatelCash: {
    id: 'SyriatelCash',
    icon: Smartphone,
    color: 'text-red-400',
    nameKey: 'syriatelCash',
    fallbackEn: 'Syriatel Cash',
    fallbackAr: 'Syriatel Cash',
    descEn: 'Pay via Syriatel Cash app',
    descAr: 'ادفع عبر تطبيق Syriatel Cash',
    manualOnlyKey: 'syriatelManualOnly',
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

export function getWalletMode(paymentConfig = {}) {
  return paymentConfig.walletMode === 'api' ? 'api' : 'manual';
}

function walletMode(paymentConfig) {
  return getWalletMode(paymentConfig);
}

export function isApiWalletMode(paymentConfig = {}) {
  return getWalletMode(paymentConfig) === 'api';
}

export function isManualWalletMethod(methodId) {
  return MANUAL_WALLET_METHODS.includes(methodId);
}

export function isApiWalletMethod(methodId, paymentConfig = {}) {
  return isManualWalletMethod(methodId) && isApiWalletMode(paymentConfig);
}

export function isPaymentMethodReady(methodId, paymentConfig = {}) {
  const mode = walletMode(paymentConfig);

  if (methodId === 'ShamCash') {
    const enabled = paymentConfig.shamcash !== false && paymentConfig.shamcash !== undefined
      ? !!paymentConfig.shamcash
      : true;
    if (!enabled) return false;
    return mode === 'api' ? !!paymentConfig.samShamcashApiReady : !!paymentConfig.shamcashManualReady;
  }

  if (methodId === 'SyriatelCash') {
    if (!paymentConfig.syriatel) return false;
    return mode === 'api' ? !!paymentConfig.samSyriatelApiReady : !!paymentConfig.syriatelManualReady;
  }

  return true;
}

export function getManualPaymentDisplay(paymentConfig = {}, methodId = 'ShamCash') {
  const merchantName = paymentConfig.shamcashMerchantName || 'ECHOCORE Store';

  if (methodId === 'SyriatelCash') {
    return {
      merchantName,
      qrImageUrl: paymentConfig.syriatelQrImageUrl || '',
      payCode: paymentConfig.syriatelPayCode || '',
      methodLabelKey: 'syriatelCash',
    };
  }

  return {
    merchantName,
    qrImageUrl: paymentConfig.shamcashQrImageUrl || '',
    payCode: paymentConfig.shamcashPayCode || '',
    methodLabelKey: 'shamCash',
  };
}

export function hasAnyManualWalletReady(paymentConfig = {}) {
  return isPaymentMethodReady('ShamCash', paymentConfig)
    || isPaymentMethodReady('SyriatelCash', paymentConfig);
}

export function buildPaymentMethods(t, lang, paymentConfig = {}, options = {}) {
  const isAr = lang === 'ar';
  const { includeBalance = false, currentBalance = 0 } = options;

  const enabled = {
    shamcash: isPaymentMethodReady('ShamCash', paymentConfig),
    syriatel: isPaymentMethodReady('SyriatelCash', paymentConfig),
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

  const isApiMode = isApiWalletMode(paymentConfig);

  if (enabled.shamcash) {
    const def = PAYMENT_METHOD_DEFS.ShamCash;
    methods.push({
      ...def,
      name: label(def),
      desc: desc(def),
      disabled: false,
      manualOnlyKey: isApiMode ? null : def.manualOnlyKey,
    });
  }

  if (enabled.syriatel) {
    const def = PAYMENT_METHOD_DEFS.SyriatelCash;
    methods.push({
      ...def,
      name: label(def),
      desc: desc(def),
      disabled: false,
      manualOnlyKey: isApiMode ? null : def.manualOnlyKey,
    });
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
  const syriatel = usable.find((m) => m.id === 'SyriatelCash');
  if (syriatel) return 'SyriatelCash';
  const balance = usable.find((m) => m.id === 'balance');
  if (balance) return 'balance';
  return usable[0]?.id || 'ShamCash';
}