import { translations } from '../data/translations';

export function getT(lang = 'ar') {
  return translations[lang] || translations.ar;
}

/** Safe `{key}` substitution (no String.replaceAll — missing on some older WebViews). */
export function formatMessage(template = '', vars = {}) {
  let text = String(template ?? '');
  for (const [key, value] of Object.entries(vars || {})) {
    const token = `{${key}}`;
    const replacement = String(value ?? '');
    // split/join works everywhere; avoids replaceAll
    if (text.includes(token)) {
      text = text.split(token).join(replacement);
    }
  }
  return text;
}

export function followUsOnLabel(lang, platform) {
  return formatMessage(getT(lang).followUsOn, { platform });
}

/**
 * BCP 47 locale for dates/numbers.
 * Arabic UI keeps Arabic month/day names when possible, but ALWAYS Latin digits (0–9)
 * via Unicode extension `nu-latn` so prices, counts, and dates match English numerals.
 */
export function getLocale(lang = 'ar') {
  return lang === 'ar' || lang === 'ar-SY' || lang === 'ar-EG'
    ? 'ar-SY-u-nu-latn'
    : 'en-US';
}

/** Locale that always forces Western digits (for pure number formatting). */
export const LATIN_DIGITS_LOCALE = 'en-US';

export function formatDateTime(value, lang = 'ar', options = {}) {
  if (value == null || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString(getLocale(lang), options);
}

export function formatDate(value, lang = 'ar', options = {}) {
  if (value == null || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleDateString(getLocale(lang), options);
}

export function formatTime(value, lang = 'ar', options = {}) {
  if (value == null || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleTimeString(getLocale(lang), options);
}

export function formatNumber(value, lang = 'ar', options = {}) {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value ?? '');
  // Always Latin digits for counts/prices even when UI language is Arabic
  return new Intl.NumberFormat(getLocale(lang), options).format(num);
}

const AR_PLURAL_RULES = typeof Intl !== 'undefined' && Intl.PluralRules
  ? new Intl.PluralRules('ar')
  : null;

/**
 * Count + noun with correct Arabic agreement (باقة/باقتان/باقات/باقة).
 * Looks up `${keyBase}One|Two|Few|Many` in `t` and fills `{count}`.
 * Arabic: 1→One, 2→Two, 3–10→Few, 11+→Many. English: 1→One, else→Many.
 */
export function formatCountNoun(t = {}, lang = 'ar', count = 0, keyBase = '') {
  const n = Math.abs(Number(count) || 0);
  let suffix = 'Many';
  if (lang === 'ar' && AR_PLURAL_RULES) {
    const category = AR_PLURAL_RULES.select(n);
    if (category === 'one') suffix = 'One';
    else if (category === 'two') suffix = 'Two';
    else if (category === 'few') suffix = 'Few';
  } else if (n === 1) {
    suffix = 'One';
  }
  const template = t[`${keyBase}${suffix}`]
    || t[`${keyBase}Many`]
    || t[`${keyBase}One`]
    || '{count}';
  return formatMessage(template, { count: n });
}