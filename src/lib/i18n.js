import { translations } from '../data/translations';

export function getT(lang = 'ar') {
  return translations[lang] || translations.ar;
}

export function formatMessage(template = '', vars = {}) {
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value ?? '')),
    String(template),
  );
}

export function followUsOnLabel(lang, platform) {
  return formatMessage(getT(lang).followUsOn, { platform });
}