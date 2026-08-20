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
    /** Official brand mark — public/shamcash-logo.svg (~1.6KB optimized) */
    logoSrc: '/shamcash-logo.svg',
    color: 'text-green-500',
    nameKey: 'shamCash',
    fallbackEn: 'ShamCash',
    fallbackAr: 'ShamCash',
    descEn: 'Pay via ShamCash app',
    descAr: 'ادفع عبر تطبيق ShamCash',
    manualOnlyKey: 'shamcashManualOnly',
  },
  WalletRecharge: {
    id: 'WalletRecharge',
    icon: Wallet,
    color: 'text-green-500',
    nameKey: 'walletRecharge',
    fallbackEn: 'Wallet (ShamCash / Binance)',
    fallbackAr: 'المحفظة (شام كاش / بايننس)',
    descEn: 'Top up your wallet to purchase',
    descAr: 'عبّئ محفظتك لتتمكن من الشراء',
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

/**
 * Human-readable payment method for admin/profile lists (never raw "balance").
 */
export function getOrderPaymentMethodLabel(method, t = {}) {
  const id = String(method || '').trim();
  if (!id) return '—';
  if (id === 'balance') {
    return t.adminOrdersPaymentBalance || t.payFromBalance || t.balance || 'Balance';
  }
  if (id === 'admin_gift') {
    return t.orderPaymentGift || t.adminGiftTitle || 'Admin gift';
  }
  if (id === 'ShamCash' || id.toLowerCase() === 'shamcash') {
    return t.adminOrdersPaymentShamcash || t.shamCash || 'ShamCash';
  }
  if (id === 'SyriatelCash' || id.toLowerCase() === 'syriatelcash') {
    return t.adminOrdersPaymentSyriatel || t.syriatelCash || 'Syriatel Cash';
  }
  if (id === 'binance') return t.binance || 'Binance';
  if (id === 'mastercard') return t.mastercard || 'Card';
  const def = PAYMENT_METHOD_DEFS[id];
  if (def?.nameKey && t[def.nameKey]) return t[def.nameKey];
  return id;
}

export function isApiWalletMethod(methodId, paymentConfig = {}) {
  return isManualWalletMethod(methodId) && isApiWalletMode(paymentConfig);
}

/**
 * Manual approve/reject is disabled store-wide.
 * Fulfillment is automatic (balance + G2Bulk / Sam API). Abandoned checkouts
 * are auto-cancelled after 15 minutes — no admin reject queue.
 */
export function canManuallyApproveWalletOrder(_order, _paymentConfig = {}) {
  return false;
}

export function canManuallyRejectWalletOrder(_order, _paymentConfig = {}) {
  return false;
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

  if (methodId === 'binance') {
    return !!paymentConfig.binance && !!paymentConfig.binanceApiReady;
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

  if (String(methodId).toLowerCase() === 'binance') {
    return {
      merchantName: 'Binance',
      qrImageUrl: '',
      payCode: '',
      methodLabelKey: 'binance',
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
  const { includeBalance = false, currentBalance = 0, isCheckout = false } = options;

  const enabled = {
    shamcash: isPaymentMethodReady('ShamCash', paymentConfig),
    syriatel: isPaymentMethodReady('SyriatelCash', paymentConfig),
    binance: isPaymentMethodReady('binance', paymentConfig),
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

  if (enabled.shamcash || enabled.binance) {
    if (isCheckout) {
      // In checkout, we combine them into a single "Recharge Wallet" option
      // which redirects the user mentally to the recharge flow, but for now we just label it as Wallet.
      const def = PAYMENT_METHOD_DEFS.WalletRecharge;
      methods.push({
        ...def,
        id: 'ShamCash', // Keep id as ShamCash so it triggers the manual flow if they click it, or we can handle it in UI
        name: label(def),
        desc: desc(def),
        disabled: false,
        isMultiLogo: true, // Custom flag for UI to render multiple logos
      });
    } else {
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
    }
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

  if (!isCheckout) {
    if (enabled.binance) {
      const def = PAYMENT_METHOD_DEFS.binance;
      methods.push({ ...def, name: label(def), desc: desc(def), disabled: false, comingSoon: false });
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
  const binance = usable.find((m) => m.id === 'binance');
  if (binance) return 'binance';
  const balance = usable.find((m) => m.id === 'balance');
  if (balance) return 'balance';
  return usable[0]?.id || 'ShamCash';
}