import { describe, it, expect } from 'vitest';
import { resolveCarouselBadge } from './carouselUtils';

describe('resolveCarouselBadge', () => {
  it('shows EN badge in EN view', () => {
    expect(resolveCarouselBadge({ carousel_badge_en: 'HOT', carousel_badge_ar: 'ساخن' }, 'en')).toBe('HOT');
  });

  it('shows AR badge in AR view', () => {
    expect(resolveCarouselBadge({ carousel_badge_en: 'HOT', carousel_badge_ar: 'ساخن' }, 'ar')).toBe('ساخن');
  });

  it('falls back to EN badge when AR empty in AR view', () => {
    expect(resolveCarouselBadge({ carousel_badge_en: 'HOT', carousel_badge_ar: null }, 'ar')).toBe('HOT');
  });

  it('falls back to AR badge when EN empty in EN view', () => {
    expect(resolveCarouselBadge({ carousel_badge_en: '', carousel_badge_ar: 'ساخن' }, 'en')).toBe('ساخن');
  });

  it('returns empty string when both badges empty (hidden state)', () => {
    expect(resolveCarouselBadge({ carousel_badge_en: null, carousel_badge_ar: '' }, 'en')).toBe('');
    expect(resolveCarouselBadge({}, 'ar')).toBe('');
    expect(resolveCarouselBadge(null, 'en')).toBe('');
  });
});
