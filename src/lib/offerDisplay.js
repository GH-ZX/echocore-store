import { brandUserText } from './branding';

export function formatPrice(value) {
  const num = Number.parseFloat(value);
  if (!Number.isFinite(num)) return '0.00';
  return num.toFixed(2);
}

export function getOfferDiscount(offer) {
  const price = Number.parseFloat(offer?.price);
  const original = Number.parseFloat(offer?.original_price);
  if (!Number.isFinite(price) || !Number.isFinite(original) || original <= price) return null;
  return Math.round((1 - price / original) * 100);
}

export function getOfferDisplayName(offer, lang = 'ar') {
  const raw = lang === 'ar' ? offer?.name_ar : offer?.name_en;
  return brandUserText(raw || offer?.name_en || offer?.name_ar || '');
}

export function getGameDisplayName(game, lang = 'ar') {
  const raw = lang === 'ar' ? game?.name_ar : game?.name_en;
  return brandUserText(raw || game?.name_en || game?.name_ar || '');
}

export function sortOffersByPrice(offers = []) {
  return [...offers].sort((a, b) => Number.parseFloat(a.price) - Number.parseFloat(b.price));
}

export function getRedemptionSteps(game, _t = {}, lang = 'ar') {
  const isAr = lang === 'ar';
  const slug = String(game?.slug || '').toLowerCase();

  const slugSteps = {
    valorant: isAr
      ? ['ادخل متجر Valorant داخل اللعبة', 'اختر شراء VP', 'اختر نفس المنطقة والمبلغ', 'استخدم الكود أو UID بعد الشراء']
      : ['Open the Valorant in-game store', 'Choose VP purchase', 'Match the region and amount', 'Use the code or UID we send after payment'],
    'league-of-legends': isAr
      ? ['سجّل دخولك إلى حساب Riot', 'افتح صفحة شراء RP', 'أدخل الكود الذي نرسله لك']
      : ['Log into your Riot account', 'Open the RP purchase page', 'Enter the code we provide'],
    'pubg-mobile': isAr
      ? ['افتح PUBG Mobile', 'اذهب إلى المتجر ثم UC', 'استخدم كود الشحن أو اربط UID']
      : ['Open PUBG Mobile', 'Go to Store → UC', 'Redeem the code or link your UID'],
    'mobile-legends': isAr
      ? ['افتح Mobile Legends', 'اذهب إلى Redeem من الملف الشخصي', 'أدخل الكود أو UID + Server ID']
      : ['Open Mobile Legends', 'Go to Redeem from your profile', 'Enter the code or UID + Server ID'],
  };

  if (slugSteps[slug]) {
    return slugSteps[slug];
  }

  if (game?.redemption_method === 'redeem_code') {
    return isAr
      ? ['أكمل الدفع', 'انسخ الكود من إيصال الطلب', 'فعّله داخل اللعبة أو المنصة']
      : ['Complete payment', 'Copy the code from your order receipt', 'Redeem it in-game or on the platform'];
  }

  if (game?.redemption_method === 'uid') {
    return isAr
      ? ['أدخل UID/معرف اللاعب عند الشراء', 'أكمل الدفع', 'يصل الشحن تلقائياً إلى حسابك']
      : ['Enter your player UID at checkout', 'Complete payment', 'Top-up is delivered automatically to your account'];
  }

  return isAr
    ? ['أكمل الشراء', 'استخدم الكود أو UID من إيصال الطلب', 'استلم الشحن فوراً بعد التأكيد']
    : ['Complete your purchase', 'Use the code or UID from your order receipt', 'Receive delivery right after confirmation'];
}