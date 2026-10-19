import { describe, expect, it } from 'vitest';
import { matchSamTransferCounterparties, samRecipientKey } from './samApi';

const ID_A = 'A'.repeat(32);
const ID_B = 'b'.repeat(32);

describe('samRecipientKey', () => {
  it('lower-cases ShamCash ids only', () => {
    expect(samRecipientKey('shamcash', ` ${ID_A} `)).toBe(`shamcash:${'a'.repeat(32)}`);
    expect(samRecipientKey('syriatel', '0991234567')).toBe('syriatel:0991234567');
  });
});

describe('matchSamTransferCounterparties', () => {
  const transfers = [
    { method: 'shamcash', status: 'completed', recipientIdentifier: ID_A, amount: 31.8, currency: 'USD', createdAt: '2026-10-18T21:20:10Z' },
    { method: 'shamcash', status: 'completed', recipientIdentifier: ID_B, amount: 600, currency: 'SYP', createdAt: '2026-10-16T20:59:19Z' },
    { method: 'shamcash', status: 'failed', recipientIdentifier: 'c'.repeat(32), amount: 80, currency: 'USD', createdAt: '2026-10-16T06:19:26Z' },
  ];

  it('matches by amount, currency and Syria-time timestamp', () => {
    const txs = [
      { type: 'debit', amount: 31.8, currency: 'USD', counterparty: 'سامر علي', occurredAt: '2026-10-19T00:20:14' },
      { type: 'debit', amount: -600, currency: 'SYP', counterparty: 'ليث محمد', occurredAt: '2026-10-16T20:59:30' },
      { type: 'debit', amount: 80, currency: 'USD', counterparty: 'Nobody', occurredAt: '2026-10-16T09:19:30' },
    ];
    const names = matchSamTransferCounterparties(transfers, txs);
    expect(names.get(samRecipientKey('shamcash', ID_A))).toBe('سامر علي');
    expect(names.get(samRecipientKey('shamcash', ID_B))).toBe('ليث محمد');
    expect(names.size).toBe(2);
  });

  it('ignores incoming money, other amounts and far-off times', () => {
    const txs = [
      { type: 'credit', amount: 31.8, currency: 'USD', counterparty: 'In', occurredAt: '2026-10-19T00:20:14' },
      { type: 'debit', amount: 31.9, currency: 'USD', counterparty: 'Other', occurredAt: '2026-10-19T00:20:14' },
      { type: 'debit', amount: 600, currency: 'SYP', counterparty: 'Late', occurredAt: '2026-10-17T05:00:00' },
    ];
    expect(matchSamTransferCounterparties(transfers, txs).size).toBe(0);
  });
});
