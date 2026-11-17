import { describe, expect, it } from 'vitest';
import { localizeImageUrl } from './localImages';
import { getGameCurrency } from './gameCurrency';
import { isKnownRegionLabel } from './regionMeta';

describe('localizeImageUrl', () => {
  it('maps supplier art we mirrored to the local WebP', () => {
    expect(localizeImageUrl('https://api.g2bulk.com/images/pubgm.png')).toBe('/game-thumbs/pubgm.webp');
    expect(localizeImageUrl('https://api.g2bulk.com/images/nte.PNG')).toBe('/game-thumbs/nte.webp');
  });
  it('keeps supplier art we do not have', () => {
    const url = 'https://api.g2bulk.com/images/unknown_game.png';
    expect(localizeImageUrl(url)).toBe(url);
  });
  it('serves our own static art from the current origin', () => {
    expect(localizeImageUrl('https://www.echocore412.com/game-covers/pubgm.webp')).toBe('/game-covers/pubgm.webp');
  });
  it('leaves other URLs alone', () => {
    const url = 'https://x.supabase.co/storage/v1/object/public/product-images/a.jpg';
    expect(localizeImageUrl(url)).toBe(url);
    expect(localizeImageUrl(null)).toBe(null);
  });
});

describe('getGameCurrency', () => {
  const game = (slug, points_name = 'Top-up') => ({ slug, g2bulk_game_code: slug.replace(/-/g, '_'), points_name });
  it('prefers the known-game map over a wrong synced name', () => {
    expect(getGameCurrency(game('pubgm', 'WOW Coins'))).toBe('UC');
    expect(getGameCurrency(game('magic-chess-gogo', 'Genesis Crystals'))).toBe('Diamonds');
    expect(getGameCurrency(game('mlbb-tr'))).toBe('Diamonds');
  });
  it('falls back to a cleaned points_name, or empty for generic', () => {
    expect(getGameCurrency(game('kingshot'))).toBe('');
    expect(getGameCurrency(game('somegame', '+ 2 Gems'))).toBe('Gems');
  });
});

describe('isKnownRegionLabel', () => {
  it('accepts regions and rejects durations', () => {
    expect(isKnownRegionLabel('Turkey')).toBe(true);
    expect(isKnownRegionLabel('Middle East')).toBe(true);
    expect(isKnownRegionLabel('1 Month')).toBe(false);
    expect(isKnownRegionLabel('')).toBe(false);
  });
});
