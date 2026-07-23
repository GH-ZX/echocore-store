import { describe, expect, it } from 'vitest';
import {
  buildCustomerActivityFeed,
  summarizeAdminActivity,
  activityTone,
} from './activityMonitor';

describe('summarizeAdminActivity', () => {
  const now = Date.parse('2026-07-24T12:00:00Z');

  it('counts categories in last 24h', () => {
    const logs = [
      { created_at: '2026-07-24T11:00:00Z', category: 'order', event_type: 'placed', severity: 'info' },
      { created_at: '2026-07-24T11:30:00Z', category: 'recharge', event_type: 'approved', severity: 'success' },
      { created_at: '2026-07-24T11:45:00Z', category: 'error', event_type: 'client', severity: 'danger' },
      { created_at: '2026-07-20T11:00:00Z', category: 'order', event_type: 'placed', severity: 'info' },
    ];
    const s = summarizeAdminActivity(logs, { now });
    expect(s.orders24h).toBe(1);
    expect(s.recharges24h).toBe(1);
    expect(s.errors24h).toBe(1);
    expect(s.health).toBe('degraded');
  });

  it('does not mark health degraded for stale chunk / deploy noise', () => {
    const logs = [
      {
        created_at: '2026-07-24T11:00:00Z',
        category: 'error',
        event_type: 'react_error_boundary',
        severity: 'danger',
        metadata: {
          message: 'Failed to fetch dynamically imported module: https://www.echocore412.com/assets/AdminView-xxx.js',
        },
      },
      {
        created_at: '2026-07-24T11:05:00Z',
        category: 'error',
        event_type: 'chunk_load_failed',
        severity: 'warning',
        metadata: { message: 'Failed to fetch dynamically imported module' },
      },
    ];
    const s = summarizeAdminActivity(logs, { now });
    expect(s.criticalOpen).toBe(0);
    expect(s.health).toBe('ok');
  });

  it('ignores criticals at or before ackedAt for health (still counts errors24h)', () => {
    const logs = [
      {
        created_at: '2026-07-24T10:00:00Z',
        category: 'error',
        event_type: 'client',
        severity: 'danger',
      },
      {
        created_at: '2026-07-24T11:30:00Z',
        category: 'error',
        event_type: 'client',
        severity: 'danger',
      },
    ];
    const ackedAt = Date.parse('2026-07-24T11:00:00Z');
    const s = summarizeAdminActivity(logs, { now, ackedAt });
    expect(s.errors24h).toBe(2);
    expect(s.criticalOpen).toBe(1);
    expect(s.health).toBe('degraded');

    const allAcked = summarizeAdminActivity(logs, {
      now,
      ackedAt: Date.parse('2026-07-24T12:00:00Z'),
    });
    expect(allAcked.errors24h).toBe(2);
    expect(allAcked.criticalOpen).toBe(0);
    expect(allAcked.health).toBe('ok');
  });
});

describe('buildCustomerActivityFeed', () => {
  it('merges and sorts newest first', () => {
    const feed = buildCustomerActivityFeed({
      orders: [{ id: 'o1', status: 'completed', total: 1, created_at: '2026-07-24T10:00:00Z' }],
      recharges: [{ id: 'r1', status: 'approved', amount: 5, created_at: '2026-07-24T11:00:00Z' }],
      transactions: [{ id: 't1', type: 'recharge', amount: 5, created_at: '2026-07-24T11:01:00Z' }],
      limit: 10,
    });
    expect(feed[0].kind).toBe('transaction');
    expect(feed.some((x) => x.kind === 'order')).toBe(true);
  });
});

describe('activityTone', () => {
  it('maps statuses', () => {
    expect(activityTone('order', 'cancelled')).toBe('danger');
    expect(activityTone('order', 'completed')).toBe('success');
    expect(activityTone('order', 'pending_payment')).toBe('warning');
  });
});
