import { describe, expect, it } from 'vitest';
import { countdownTone, formatCountdown, msUntil } from './countdown';

describe('msUntil', () => {
  const now = Date.parse('2026-11-05T12:00:00Z');

  it('counts down to the expiry', () => {
    expect(msUntil('2026-11-05T12:15:00Z', now)).toBe(15 * 60_000);
  });

  it('never goes negative', () => {
    expect(msUntil('2026-11-05T11:59:00Z', now)).toBe(0);
  });

  it('is null for a missing or bad date', () => {
    expect(msUntil(undefined, now)).toBeNull();
    expect(msUntil('not a date', now)).toBeNull();
  });
});

describe('formatCountdown', () => {
  it('formats minutes and seconds', () => {
    expect(formatCountdown(15 * 60_000)).toBe('15:00');
    expect(formatCountdown(65_000)).toBe('01:05');
  });

  it('rounds up so it shows 00:00 only at the end', () => {
    expect(formatCountdown(400)).toBe('00:01');
    expect(formatCountdown(0)).toBe('00:00');
  });

  it('is empty when unknown', () => {
    expect(formatCountdown(null)).toBe('');
  });
});

describe('countdownTone', () => {
  it('warns under 3 minutes and alerts under 1', () => {
    expect(countdownTone(10 * 60_000)).toBe('ok');
    expect(countdownTone(2 * 60_000)).toBe('soon');
    expect(countdownTone(30_000)).toBe('last');
  });
});
