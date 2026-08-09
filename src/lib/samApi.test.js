import { describe, expect, it } from 'vitest';
import {
  buildSamRechargeHistoryPayload,
  buildSamTransferPayload,
  isValidSamRecipient,
} from './samApi';

describe('buildSamRechargeHistoryPayload', () => {
  it('keeps audit filters and pagination in the edge request', () => {
    expect(buildSamRechargeHistoryPayload({
      page: 2,
      pageSize: 25,
      search: 'customer',
      status: 'approved',
      method: 'manual',
    })).toEqual({
      action: 'listRechargeHistory',
      page: 2,
      pageSize: 25,
      search: 'customer',
      status: 'approved',
      method: 'manual',
    });
  });
});

describe('isValidSamRecipient', () => {
  it('accepts the supported recipient formats', () => {
    expect(isValidSamRecipient('shamcash', '879be352768766cb4acc3c7a12345678')).toBe(true);
    expect(isValidSamRecipient('syriatel', '0991234567')).toBe(true);
    expect(isValidSamRecipient('syriatel', '12345678')).toBe(true);
  });

  it('rejects malformed recipient values', () => {
    expect(isValidSamRecipient('shamcash', 'not-a-wallet')).toBe(false);
    expect(isValidSamRecipient('syriatel', '12345')).toBe(false);
    expect(isValidSamRecipient('unknown', '12345678')).toBe(false);
  });

  it('keeps the selected customer id in the transfer payload without exposing other customer data', () => {
    expect(buildSamTransferPayload({
      method: 'shamcash',
      recipient: '879be352768766cb4acc3c7a12345678',
      amount: 10,
      customerId: '12345678-1234-1234-8123-123456789012',
    })).toMatchObject({ action: 'transfer', customerId: '12345678-1234-1234-8123-123456789012' });
  });
});
