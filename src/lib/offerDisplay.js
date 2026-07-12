import { brandUserText } from './branding';
import {
  extractCurrencySuffixFromName,
  formatPackNameWithCurrency,
  getScopedOffersForGame,
  isGenericCurrencyLabel,
  isNumericOnlyPackName,
  lookupGameCurrencyLabel,
} from './gameCurrency';
import { getDisplayGameForOffer, getFulfillmentGameForOffer } from './gameRegions';

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

function getRawOfferName(offer, lang = 'ar') {
  const raw = lang === 'ar' ? offer?.name_ar : offer?.name_en;
  return brandUserText(raw || offer?.name_en || offer?.name_ar || '');
}

function collectOfferNameCandidates(offer) {
  return [
    offer?.g2bulk_catalogue_name,
    offer?.name_en,
    offer?.name_ar,
  ].filter(Boolean);
}

export function getOfferPackAmount(offer) {
  if (offer?.amount != null && offer.amount !== '') {
    const parsed = Number.parseFloat(offer.amount);
    if (Number.isFinite(parsed)) return parsed;
  }

  for (const name of collectOfferNameCandidates(offer)) {
    const match = String(name).trim().match(/^([\d,]+(?:\.\d+)?)/);
    if (!match) continue;
    const parsed = Number.parseFloat(match[1].replace(/,/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

export function formatOfferPackLabel(offer, game = null, lang = 'ar', relatedOffers = [], games = []) {
  const rawName = getRawOfferName(offer, lang);
  if (!rawName) return '';

  const suffix = extractCurrencySuffixFromName(rawName);
  if (suffix && !isGenericCurrencyLabel(suffix)) return rawName;

  const fulfillmentGame = game || getFulfillmentGameForOffer(offer, games);
  const currency = lookupGameCurrencyLabel(fulfillmentGame, games, relatedOffers, offer);
  return formatPackNameWithCurrency(rawName, currency);
}

function resolveOfferDisplayContext(context) {
  if (!context) {
    return { game: null, games: [], relatedOffers: [] };
  }
  if (typeof context === 'object' && ('game' in context || 'games' in context || 'relatedOffers' in context)) {
    return {
      game: context.game || null,
      games: context.games || [],
      relatedOffers: context.relatedOffers || [],
    };
  }
  return { game: context, games: [], relatedOffers: [] };
}

export function getOfferDisplayName(offer, lang = 'ar', context = null) {
  const { game, games, relatedOffers } = resolveOfferDisplayContext(context);
  const fulfillmentGame = game || getFulfillmentGameForOffer(offer, games);
  const scopedOffers = getScopedOffersForGame(fulfillmentGame, games, relatedOffers);
  return formatOfferPackLabel(offer, fulfillmentGame, lang, scopedOffers, games);
}

export function getOfferOrderNameSnapshot(offer, lang = 'ar', games = [], offers = []) {
  return getOfferDisplayName(offer, lang, {
    game: getFulfillmentGameForOffer(offer, games),
    games,
    relatedOffers: offers,
  });
}

export function getOfferCatalogOptionLabel(offer, games = [], lang = 'ar', relatedOffers = []) {
  const fulfillmentGame = games.find((row) => row.id === offer?.game_id) || null;
  const storefrontGame = getDisplayGameForOffer(offer, games) || fulfillmentGame;
  const pack = getOfferDisplayName(offer, lang, {
    game: fulfillmentGame,
    games,
    relatedOffers,
  });
  const gameName = getGameDisplayName(storefrontGame || fulfillmentGame, lang);
  return gameName ? `${gameName} — ${pack}` : pack;
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

export { isNumericOnlyPackName, isGenericCurrencyLabel };