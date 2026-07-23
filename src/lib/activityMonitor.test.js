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
