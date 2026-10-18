import { describe, expect, it } from 'vitest';
import {
  applyMarkup,
  normalizeRoundStep,
  normalizePricingMode,
  pricingModeLabel,
  priceFromCost,
  resolveOfferPrice,
  roundUpToStep,
} from './offerPricing';

describe('applyMarkup', () => {
  it('applies percent markup and ceils to cents', () => {
    expect(applyMarkup(10, 10)).toBe(11);
    expect(applyMarkup(1.005, 0)).toBe(1.01);
    expect(applyMarkup(3.333, 15)).toBe(3.84);
  });

  it('returns floor price for invalid or non-positive cost', () => {
    expect(applyMarkup(0, 20)).toBe(0.01);
    expect(applyMarkup(-5, 20)).toBe(0.01);
    expect(applyMarkup('abc', 20)).toBe(0.01);
    expect(applyMarkup(null, 20)).toBe(0.01);
  });

  it('priceFromCost is an alias of applyMarkup', () => {
    expect(priceFromCost(10, 10)).toBe(applyMarkup(10, 10));
  });
});

describe('normalizePricingMode', () => {
  it('accepts known modes case-insensitively', () => {
    expect(normalizePricingMode('auto')).toBe('auto');
    expect(normalizePricingMode('MARGIN')).toBe('margin');
    expect(normalizePricingMode('Fixed')).toBe('fixed');
  });

  it('falls back to auto for unknown or empty input', () => {
    expect(normalizePricingMode('wholesale')).toBe('auto');
    expect(normalizePricingMode('')).toBe('auto');
    expect(normalizePricingMode(null)).toBe('auto');
  });
});

describe('resolveOfferPrice', () => {
  it('auto mode uses store default markup on supplier cost', () => {
    const offer = { pricing_mode: 'auto', g2bulk_cost_usd: 10 };
    expect(resolveOfferPrice(offer, 10, 20)).toBe(12);
  });

  it('reads cost from offer.g2bulk_cost_usd when cost arg is nullish', () => {
    const offer = { pricing_mode: 'auto', g2bulk_cost_usd: 5 };
    expect(resolveOfferPrice(offer, null, 100)).toBe(10);
  });

  it('margin mode prefers offer margin over store markup', () => {
    const offer = { pricing_mode: 'margin', pricing_margin_percent: 50 };
    expect(resolveOfferPrice(offer, 10, 20)).toBe(15);
  });

  it('margin mode falls back to store markup when offer margin is invalid', () => {
    const offer = { pricing_mode: 'margin', pricing_margin_percent: 'n/a' };
    expect(resolveOfferPrice(offer, 10, 20)).toBe(12);
  });

  it('fixed mode returns the locked price', () => {
    const offer = { pricing_mode: 'fixed', price: 7.5 };
    expect(resolveOfferPrice(offer, 10, 20)).toBe(7.5);
  });

  it('sale offers keep their locked price regardless of mode', () => {
    const offer = { pricing_mode: 'auto', is_sale: true, price: 4.99 };
    expect(resolveOfferPrice(offer, 10, 20)).toBe(4.99);
  });

  it('fixed mode without a valid locked price falls back to markup', () => {
    const offer = { pricing_mode: 'fixed', price: 0 };
    expect(resolveOfferPrice(offer, 10, 20)).toBe(12);
  });
});

describe('pricingModeLabel', () => {
  const t = {
    pricingModeFixed: 'ثابت',
    pricingModeMargin: 'هامش',
    pricingModeAuto: 'افتراضي',
  };

  it('uses translation keys when provided', () => {
    expect(pricingModeLabel('fixed', t)).toBe('ثابت');
    expect(pricingModeLabel('margin', t)).toBe('هامش');
    expect(pricingModeLabel('auto', t)).toBe('افتراضي');
  });

  it('falls back to English defaults', () => {
    expect(pricingModeLabel('fixed')).toBe('Fixed price');
    expect(pricingModeLabel('unknown')).toBe('Store default');
  });
});

describe('markup float safety', () => {
  it('does not overcharge a cent on exact results', () => {
    expect(applyMarkup(1, 10)).toBe(1.1);
    expect(applyMarkup(1.1, 0)).toBe(1.1);
    expect(applyMarkup(2.2, 0)).toBe(2.2);
  });
});

describe('price round step', () => {
  it('rounds up to the next step', () => {
    expect(roundUpToStep(1.08, 0.05)).toBe(1.1);
    expect(roundUpToStep(1.08, 0.1)).toBe(1.1);
    expect(roundUpToStep(1.01, 0.05)).toBe(1.05);
    expect(roundUpToStep(1.1, 0.05)).toBe(1.1);
    expect(roundUpToStep(3.84, 0.25)).toBe(4);
    expect(roundUpToStep(3.84, 1)).toBe(4);
  });

  it('is a no-op when off or invalid', () => {
    expect(roundUpToStep(1.08, 0)).toBe(1.08);
    expect(roundUpToStep(1.08, 0.07)).toBe(1.08);
    expect(normalizeRoundStep('0.10')).toBe(0.1);
    expect(normalizeRoundStep('abc')).toBe(0);
  });

  it('applies after markup and never lowers the price', () => {
    expect(applyMarkup(0.96, 12, 0.05)).toBe(1.1);
    expect(applyMarkup(0.96, 12)).toBe(1.08);
    for (let c = 1; c <= 2000; c += 1) {
      const cost = c / 100;
      expect(applyMarkup(cost, 12, 0.05)).toBeGreaterThanOrEqual(applyMarkup(cost, 12));
    }
  });
});
