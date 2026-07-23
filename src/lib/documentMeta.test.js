import { describe, expect, it } from 'vitest';
import { resolveRouteMeta } from './documentMeta';

const t = {
  seoSiteName: 'ECHOCORE Store',
  seoDefaultDescription: 'Default desc',
  seoHomeTitle: 'Home',
  seoHomeDescription: 'Home desc',
  seoContactTitle: 'Contact',
  seoContactDescription: 'Contact desc',
  seoGamesTitle: 'Games',
  seoGamesDescription: 'Games desc',
  seoDefaultTitle: 'ECHOCORE Store',
};

describe('resolveRouteMeta', () => {
  it('maps home and contact', () => {
    expect(resolveRouteMeta('/', t, 'en').title).toMatch(/Home/);
    expect(resolveRouteMeta('/contact', t, 'en').description).toBe('Contact desc');
  });

  it('maps game detail path', () => {
    const meta = resolveRouteMeta('/game/valorant', t, 'en');
    expect(meta.description).toBe('Games desc');
  });
});
