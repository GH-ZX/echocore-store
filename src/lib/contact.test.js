import { describe, expect, it } from 'vitest';
import { contactErrorMessage } from './contact';

describe('contactErrorMessage', () => {
  const t = {
    contactRateLimited: 'Slow down',
    contactInvalidEmail: 'Bad email',
    contactSubmitFailed: 'Failed',
    contactEmailMessageRequired: 'Required',
    contactLoginRequired: 'Please log in',
  };

  it('maps rate limit', () => {
    expect(contactErrorMessage({ code: 'contact_rate_limited' }, t)).toBe('Slow down');
  });

  it('maps login required', () => {
    expect(contactErrorMessage({ code: 'contact_login_required' }, t)).toBe('Please log in');
  });

  it('maps invalid email', () => {
    expect(contactErrorMessage({ code: 'contact_invalid_email' }, t)).toBe('Bad email');
  });

  it('falls back', () => {
    expect(contactErrorMessage(new Error('other'), t)).toBe('Failed');
  });
});
