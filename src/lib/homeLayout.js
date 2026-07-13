import { supabase } from './supabase';
import { countDisplayableReviews } from './customerReviews';

export const HOME_SECTION_TYPES = {
  carousel: {
    labelEn: 'Hero Carousel',
    labelAr: 'السلايدر الرئيسي',
    descriptionEn: 'Large featured games carousel at the top',
    descriptionAr: 'سلايدر الألعاب المميزة في الأعلى',
    singleton: true,
  },
  sale_offers: {
    labelEn: 'Sale Offers Cards',
    labelAr: 'بطاقات عروض الخصم',
    descriptionEn: 'Horizontal row of discounted offers',
    descriptionAr: 'صف بطاقات العروض المخفّضة',
    singleton: false,
  },
  games: {
    labelEn: 'Games',
    labelAr: 'الألعاب',
    descriptionEn: 'Grid of every game in the store',
    descriptionAr: 'شبكة بكل الألعاب في المتجر',
    singleton: true,
  },
  gift_cards: {
    labelEn: 'Gift Cards & Vouchers',
    labelAr: 'بطاقات الهدايا والقسائم',
    descriptionEn: 'Platform gift cards and in-game voucher codes (single G2Bulk lane)',
    descriptionAr: 'بطاقات المنصات وقسائم الألعاب — مسار G2Bulk الموحّد',
    singleton: true,
  },
  gaming_accounts: {
    labelEn: 'Gaming Accounts (legacy)',
    labelAr: 'حسابات الألعاب (قديم)',
    descriptionEn: 'Merged into Gift Cards & Vouchers — remove this section if still present',
    descriptionAr: 'مُدمج في بطاقات الهدايا والقسائم — احذف هذا القسم إن وُجد',
    singleton: true,
    deprecated: true,
  },
  game_picks: {
    labelEn: 'Custom Game Cards',
    labelAr: 'بطاقات ألعاب مخصصة',
    descriptionEn: 'Hand-picked games you choose',
    descriptionAr: 'ألعاب تختارها يدوياً',
    singleton: false,
  },
  offer_picks: {
    labelEn: 'Custom Offer Cards',
    labelAr: 'بطاقات عروض مخصصة',
    descriptionEn: 'Hand-picked offers you choose',
    descriptionAr: 'عروض تختارها يدوياً',
    singleton: false,
  },
  suggested_offers: {
    labelEn: 'Suggested Offers',
    labelAr: 'عروض مقترحة',
    descriptionEn: 'Random offer suggestions refreshed on each visit',
    descriptionAr: 'عروض مقترحة عشوائية تتغير في كل زيارة',
    singleton: false,
  },
  customer_reviews: {
    labelEn: 'Customer Reviews',
    labelAr: 'آراء الزبائن',
    descriptionEn: 'Rotating customer testimonials with optional submit form',
    descriptionAr: 'آراء العملاء المتحركة مع نموذج إرسال اختياري',
    singleton: false,
  },
  social_links: {
    labelEn: 'Social Links Hub',
    labelAr: 'روابط التواصل',
    descriptionEn: 'Button linking to your Linktree-style social page',
    descriptionAr: 'زر يوجّه لصفحة روابط التواصل (يوتيوب، تيك توك، وغيرها)',
    singleton: true,
  },
};

export const HOME_SECTION_LIMIT_MAX = 10;

export const DEFAULT_HOME_LAYOUT = [
  {
    id: 'carousel',
    type: 'carousel',
    enabled: true,
  },
  {
    id: 'games',
    type: 'games',
    enabled: true,
    title_en: 'Choose a Game',
    title_ar: 'اختر لعبتك',
  },
  {
    id: 'sale_offers',
    type: 'sale_offers',
    enabled: true,
    title_en: 'Sale Offers',
    title_ar: 'خصومات',
    limit: 8,
  },
  {
    id: 'suggested_offers',
    type: 'suggested_offers',
    enabled: true,
    title_en: 'Suggested Offers',
    title_ar: 'عروض مقترحة',
    limit: 8,
  },
  {
    id: 'gift_cards',
    type: 'gift_cards',
    enabled: true,
    title_en: 'Gift Cards & Vouchers',
    title_ar: 'بطاقات الهدايا والقسائم',
    limit: 6,
  },
  {
    id: 'customer_reviews',
    type: 'customer_reviews',
    enabled: true,
    title_en: 'Customer Reviews',
    title_ar: 'آراء الزبائن',
    limit: 8,
    interval_seconds: 6,
    show_submit_form: true,
    review_ids: [],
  },
];

const VALID_TYPES = new Set(Object.keys(HOME_SECTION_TYPES));

function defaultSectionConfig(type, id) {
  const meta = HOME_SECTION_TYPES[type];
  if (!meta) return null;

  const base = { id, type, enabled: true };

  if (type === 'sale_offers') {
    return { ...base, title_en: 'Sale Offers', title_ar: 'خصومات', limit: 8 };
  }
  if (type === 'games') {
    return { ...base, title_en: 'Choose a Game', title_ar: 'اختر لعبتك' };
  }
  if (type === 'gift_cards') {
    return { ...base, title_en: 'Gift Cards & Vouchers', title_ar: 'بطاقات الهدايا والقسائم', limit: 6 };
  }
  if (type === 'gaming_accounts') {
    return { ...base, title_en: 'Gaming Accounts', title_ar: 'حسابات الألعاب', limit: 6, enabled: false };
  }
  if (type === 'game_picks') {
    return {
      ...base,
      title_en: 'Featured Games',
      title_ar: 'ألعاب مميزة',
      game_ids: [],
    };
  }
  if (type === 'offer_picks') {
    return {
      ...base,
      title_en: 'Featured Offers',
      title_ar: 'عروض مميزة',
      offer_ids: [],
    };
  }
  if (type === 'suggested_offers') {
    return { ...base, title_en: 'Suggested Offers', title_ar: 'عروض مقترحة', limit: 8 };
  }
  if (type === 'customer_reviews') {
    return {
      ...base,
      title_en: 'Customer Reviews',
      title_ar: 'آراء الزبائن',
      limit: 8,
      interval_seconds: 6,
      show_submit_form: true,
      review_ids: [],
    };
  }
  if (type === 'social_links') {
    return {
      ...base,
      title_en: 'Follow Us',
      title_ar: 'تابعنا',
      subtitle_en: 'YouTube, TikTok, and all our platforms',
      subtitle_ar: 'يوتيوب، تيك توك، وكل منصاتنا',
      button_text_en: 'All our links',
      button_text_ar: 'روابطنا',
    };
  }

  return base;
}

export function normalizeHomeLayout(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return DEFAULT_HOME_LAYOUT.map((section) => ({ ...section }));
  }

  const seen = new Set();
  const normalized = [];

  value.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;
    const type = raw.type;
    if (!VALID_TYPES.has(type)) return;
    if (type === 'gaming_accounts') return;

    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `${type}_${index}`;
    if (seen.has(id)) return;
    seen.add(id);

    const defaults = defaultSectionConfig(type, id);
    if (!defaults) return;

    let limit = Number.isFinite(Number(raw.limit))
      ? Math.max(1, Math.min(HOME_SECTION_LIMIT_MAX, Number(raw.limit)))
      : defaults.limit;

    if ((type === 'sale_offers' || type === 'suggested_offers') && limit < 8) {
      limit = 8;
    }

    normalized.push({
      ...defaults,
      ...raw,
      id,
      type,
      enabled: raw.enabled !== false,
      title_en: raw.title_en || defaults.title_en || '',
      title_ar: raw.title_ar || defaults.title_ar || '',
      limit,
      game_ids: Array.isArray(raw.game_ids) ? raw.game_ids.filter(Boolean) : (defaults.game_ids || []),
      offer_ids: Array.isArray(raw.offer_ids) ? raw.offer_ids.filter(Boolean) : (defaults.offer_ids || []),
      review_ids: Array.isArray(raw.review_ids) ? raw.review_ids.filter(Boolean) : (defaults.review_ids || []),
      interval_seconds: Number.isFinite(Number(raw.interval_seconds))
        ? Math.max(3, Math.min(30, Number(raw.interval_seconds)))
        : (defaults.interval_seconds ?? 6),
      show_submit_form: raw.show_submit_form !== false,
      subtitle_en: raw.subtitle_en || defaults.subtitle_en || '',
      subtitle_ar: raw.subtitle_ar || defaults.subtitle_ar || '',
      button_text_en: raw.button_text_en || defaults.button_text_en || '',
      button_text_ar: raw.button_text_ar || defaults.button_text_ar || '',
    });
  });

  if (normalized.length === 0 || normalized.every((section) => !section.enabled)) {
    return DEFAULT_HOME_LAYOUT.map((section) => ({ ...section }));
  }

  return normalized;
}

/** Whether a section is hidden or would render empty on the live home page. */
export function evaluateHomeSectionStatus(section, context = {}) {
  if (!section) return { hidden: true, empty: true };

  if (!section.enabled) {
    return { hidden: true, empty: false };
  }

  const {
    carouselCount = 0,
    gamesCount = 0,
    giftCardCount = 0,
    voucherCount = 0,
    saleOfferCount = 0,
    offerCount = 0,
    games = [],
    offers = [],
    reviews = [],
  } = context;

  switch (section.type) {
    case 'carousel':
      return { hidden: false, empty: carouselCount === 0 };
    case 'games':
      return { hidden: false, empty: gamesCount === 0 };
    case 'gift_cards':
      return { hidden: false, empty: (voucherCount || giftCardCount) === 0 };
    case 'gaming_accounts':
      return { hidden: true, empty: true };
    case 'sale_offers':
      return { hidden: false, empty: saleOfferCount === 0 };
    case 'suggested_offers':
      return { hidden: false, empty: offerCount === 0 };
    case 'game_picks': {
      const valid = (section.game_ids || []).filter((id) => (
        games.some((game) => game.id === id)
      ));
      return { hidden: false, empty: valid.length === 0 };
    }
    case 'offer_picks': {
      const valid = (section.offer_ids || []).filter((id) => (
        offers.some((offer) => offer.id === id && offer.active !== false)
      ));
      return { hidden: false, empty: valid.length === 0 };
    }
    case 'customer_reviews': {
      const displayCount = countDisplayableReviews(reviews, section);
      return { hidden: false, empty: displayCount === 0 };
    }
    case 'social_links':
      return { hidden: false, empty: false };
    default:
      return { hidden: false, empty: false };
  }
}

export function isDeprecatedHomeSectionType(type) {
  return !!HOME_SECTION_TYPES[type]?.deprecated;
}

export function createHomeSection(type) {
  if (!VALID_TYPES.has(type) || isDeprecatedHomeSectionType(type)) return null;
  const id = `${type}_${Date.now().toString(36)}`;
  return defaultSectionConfig(type, id);
}

export function getSectionLabel(section, lang = 'en') {
  const meta = HOME_SECTION_TYPES[section.type];
  if (!meta) return section.type;
  if (lang === 'ar') {
    return section.title_ar || meta.labelAr;
  }
  return section.title_en || meta.labelEn;
}

export async function fetchHomeLayout() {
  const { data, error } = await supabase.rpc('get_home_layout');
  if (error) {
    if (error.message?.includes('get_home_layout')) {
      return null;
    }
    console.error('get_home_layout:', error);
    return null;
  }

  return normalizeHomeLayout(data);
}