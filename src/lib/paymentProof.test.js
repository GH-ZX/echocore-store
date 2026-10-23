import { describe, expect, it } from 'vitest';
import { isValidTxnRef, normalizeTxnRef, proofErrorKey } from './paymentProof';

describe('normalizeTxnRef', () => {
  it('adds the # when only digits are pasted and strips spaces', () => {
    expect(normalizeTxnRef('324065688')).toBe('#324065688');
    expect(normalizeTxnRef('  # 324065688 ')).toBe('#324065688');
    expect(normalizeTxnRef('#324065688')).toBe('#324065688');
  });

  it('returns empty for empty input and leaves junk alone (so validation rejects it)', () => {
    expect(normalizeTxnRef('')).toBe('');
    expect(normalizeTxnRef(null)).toBe('');
    expect(normalizeTxnRef('abc123')).toBe('abc123');
  });
});

describe('isValidTxnRef', () => {
  it('matches the server rule: # followed by 3-20 digits', () => {
    expect(isValidTxnRef('#324065688')).toBe(true);
    expect(isValidTxnRef('324065688')).toBe(true);
    expect(isValidTxnRef('12')).toBe(false);
    expect(isValidTxnRef('#12')).toBe(false);
    expect(isValidTxnRef('#12a45')).toBe(false);
    expect(isValidTxnRef('#' + '1'.repeat(21))).toBe(false);
    expect(isValidTxnRef('')).toBe(false);
  });
});

describe('proofErrorKey', () => {
  it('maps server error codes to translation keys', () => {
    expect(proofErrorKey('proof_required')).toBe('rechargeProofNeedOne');
    expect(proofErrorKey('invalid_txn_ref')).toBe('rechargeTxnInvalid');
    expect(proofErrorKey('Error: txn_ref_used')).toBe('rechargeTxnUsed');
    expect(proofErrorKey('proof_not_found')).toBe('rechargeProofUploadFailed');
    expect(proofErrorKey('something else')).toBeUndefined();
  });
});
