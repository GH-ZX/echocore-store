import { describe, expect, it } from 'vitest';
import {
  canRetryOrderFulfillment,
  getAdminDeliveryStatusDisplay,
  getAdminOrderOutcome,
  getAdminPaymentStatusLabel,
} from './adminOrderFilters';

const t = {
  adminOrderPaid: 'Paid',
  adminOrdersOutcomeFailed: 'Failed',
  fulfillmentDone: 'Delivered',
  fulfillmentFailed: 'Delivery failed',
  fulfillmentStuck: 'Delivery stuck',
  fulfillmentStuckHint: 'Stuck hint',
  fulfillmentInProgress: 'Delivering',
  fulfillmentPending: 'Awaiting delivery',
  adminOrdersSoftTimeoutHint: 'Soft timeout',
  adminOrdersRefundedHint: 'Refunded',
};

describe('admin order status display', () => {
  it('treats completed payment as Paid, not Delivered', () => {
    const order = {
      status: 'completed',
      fulfillment_status: 'failed',
      created_at: '2020-01-01T00:00:00Z',
      g2bulk_metadata: { last_error: 'supplier reject' },
    };
    expect(getAdminPaymentStatusLabel(order, t)).toBe('Paid');
    expect(getAdminOrderOutcome(order)).toBe('failed');
    const delivery = getAdminDeliveryStatusDisplay(order, t);
    expect(delivery.label).toBe('Delivery failed');
    expect(delivery.tone).toBe('danger');
  });

  it('shows stuck instead of delivering for old fulfilling rows', () => {
    const order = {
      status: 'completed',
      fulfillment_status: 'fulfilling',
      created_at: '2020-01-01T00:00:00Z',
    };
    expect(getAdminOrderOutcome(order)).toBe('failed');
    const delivery = getAdminDeliveryStatusDisplay(order, t);
    expect(delivery.label).toBe('Delivery stuck');
    expect(delivery.tone).toBe('danger');
    expect(delivery.hint).toBe('Stuck hint');
  });

  it('keeps delivering for recent fulfilling', () => {
    const order = {
      status: 'completed',
      fulfillment_status: 'fulfilling',
      created_at: new Date().toISOString(),
    };
    expect(getAdminOrderOutcome(order)).toBe('processing');
    const delivery = getAdminDeliveryStatusDisplay(order, t);
    expect(delivery.label).toBe('Delivering');
    expect(delivery.tone).toBe('pending');
  });

  it('allows re-check when supplier order id exists even if stuck old', () => {
    const order = {
      status: 'completed',
      fulfillment_status: 'fulfilling',
      g2bulk_order_id: '1224697',
      created_at: '2020-01-01T00:00:00Z',
    };
    expect(getAdminOrderOutcome(order)).toBe('failed');
    expect(canRetryOrderFulfillment(order)).toBe(true);
  });

  it('does not allow new purchase retry on ancient pending without supplier id', () => {
    const order = {
      status: 'completed',
      fulfillment_status: 'pending',
      created_at: '2020-01-01T00:00:00Z',
    };
    expect(canRetryOrderFulfillment(order)).toBe(false);
  });
});
