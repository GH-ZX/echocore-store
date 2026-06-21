import { supabase } from './supabase';

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
    labelEn: 'All Games Grid',
    labelAr: 'شبكة جميع الألعاب',
    descriptionEn: 'Grid of every game in the store',
    descriptionAr: 'شبكة بكل الألعاب في المتجر',
    singleton: true,
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
};

export const DEFAULT_HOME_LAYOUT = [
  {
    id: 'carousel',
    type: 'carousel',
    enabled: true,
  },
  {
    id: 'sale_offers',
    type: 'sale_offers',
    enabled: true,
    title_en: 'Sale Offers',
    title_ar: 'خصومات',
    limit: 4,
  },
  {
    id: 'games',
    type: 'games',
    enabled: true,
    title_en: 'Choose a Game',
    title_ar: 'اختر لعبتك',
  },
];

const VALID_TYPES = new Set(Object.keys(HOME_SECTION_TYPES));

function defaultSectionConfig(type, id) {
  const meta = HOME_SECTION_TYPES[type];
  if (!meta) return null;

  const base = { id, type, enabled: true };

  if (type === 'sale_offers') {
    return { ...base, title_en: 'Sale Offers', title_ar: 'خصومات', limit: 4 };
  }
  if (type === 'games') {
    return { ...base, title_en: 'Choose a Game', title_ar: 'اختر لعبتك' };
  }
  if (type === 'game_picks' || type === 'offer_picks') {
    return {
      ...base,
      title_en: type === 'game_picks' ? 'Featured Games' : 'Featured Offers',
      title_ar: type === 'game_picks' ? 'ألعاب مميزة' : 'عروض مميزة',
      game_ids: [],
      offer_ids: [],
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

    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `${type}_${index}`;
    if (seen.has(id)) return;
    seen.add(id);

    const defaults = defaultSectionConfig(type, id);
    if (!defaults) return;

    normalized.push({
      ...defaults,
      ...raw,
      id,
      type,
      enabled: raw.enabled !== false,
      title_en: raw.title_en || defaults.title_en || '',
      title_ar: raw.title_ar || defaults.title_ar || '',
      limit: Number.isFinite(Number(raw.limit)) ? Math.max(1, Math.min(12, Number(raw.limit))) : defaults.limit,
      game_ids: Array.isArray(raw.game_ids) ? raw.game_ids.filter(Boolean) : (defaults.game_ids || []),
      offer_ids: Array.isArray(raw.offer_ids) ? raw.offer_ids.filter(Boolean) : (defaults.offer_ids || []),
    });
  });

  return normalized.length > 0 ? normalized : DEFAULT_HOME_LAYOUT.map((section) => ({ ...section }));
}

export function createHomeSection(type) {
  if (!VALID_TYPES.has(type)) return null;
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