import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));

import { formatNotification } from './notifications';
import { translations } from '../data/translations';

const LRI = '⁦';
const PDI = '⁩';
const order = { orderId: 'o1', orderRef: 'EC-101', items: '1× 100 Gems', paymentMethod: 'balance', amount: 10, total: 10, newBalance: 5 };

const TYPES = [
  'recharge_payment_sent', 'order_payment_sent', 'admin_recharge_payment_sent', 'admin_recharge_completed',
  'admin_order_payment_sent', 'admin_purchase_completed', 'admin_delivery_ready', 'admin_topup_delivered',
  'admin_order_fulfilled', 'admin_fulfillment_failed', 'recharge_approved', 'admin_balance_debit',
  'recharge_rejected', 'order_completed', 'order_rejected', 'purchase_completed', 'delivery_ready',
  'topup_delivered', 'order_fulfilled', 'fulfillment_failed', 'fulfillment_failed_refunded',
];

const show = (type, metadata, lang = 'ar') => formatNotification({ type, metadata }, translations[lang], lang);

describe('recharge and purchase notifications', () => {
  it.each(TYPES)('%s: a title and a body with every placeholder filled, in both languages', (type) => {
    for (const lang of ['ar', 'en']) {
      const shown = show(type, { ...order, reference: 'R-1', userName: 'Sami', codes: ['AAA'] }, lang);
      expect(shown.title).toBeTruthy();
      expect(shown.body).toBeTruthy();
      expect(shown.body).not.toMatch(/\{[a-zA-Z]+\}/);
      expect(shown.title).not.toMatch(/\{[a-zA-Z]+\}/);
    }
  });

  it('says what was bought, which order and how much, with left-to-right isolates in Arabic', () => {
    const { body } = show('purchase_completed', order);
    expect(body).toContain(`${LRI}EC-101${PDI}`);
    expect(body).toContain(`${LRI}1× 100 Gems${PDI}`);
    expect(body).toContain(`${LRI}$10.00${PDI}`);
    expect(body).toContain(`${LRI}$5.00${PDI}`);
    expect(show('purchase_completed', order, 'en').body).toBe(
      "Order EC-101 (1× 100 Gems). $10.00 was taken from your balance; your balance is now $5.00. We'll tell you when it's delivered.",
    );
  });

  it('old notifications without an order number still read as a sentence', () => {
    const { body } = show('purchase_completed', { amount: 10, newBalance: 5 }, 'en');
    expect(body.startsWith('$10.00 was taken')).toBe(true);
    expect(show('purchase_completed', { amount: 10, newBalance: 5 }).body.startsWith('خُصم')).toBe(true);
  });

  it('names the real payment method (not always ShamCash) for the admin', () => {
    const { body } = show('admin_recharge_payment_sent', { amount: 10, userName: 'Sami', reference: 'R-1', paymentMethod: 'SyriatelCash' }, 'en');
    expect(body).toContain('Syriatel');
    expect(body).not.toContain('ShamCash');
  });

  it('a manual credit by the store is not called a recharge', () => {
    const { title } = show('recharge_approved', { amount: 5, newBalance: 5, manualCredit: true }, 'en');
    expect(title).toBe(translations.en.notifManualCreditTitle);
  });

  it('says so when less was credited than asked (SYP invoice)', () => {
    const { body } = show('recharge_approved', { amount: 7.5, creditedAmount: 7.5, requestedAmount: 10, newBalance: 7.5 }, 'en');
    expect(body).toContain('$7.50 was added');
    expect(body).toContain('you had asked for $10.00');
  });

  it('shows the admin\'s reason when a top-up is refused', () => {
    expect(show('recharge_rejected', { amount: 10, note: 'transfer not found' }, 'en').body).toContain('Reason: transfer not found');
  });

  it('no longer shows the current balance on "top-up request received"', () => {
    const { body } = show('recharge_payment_sent', { amount: 10, reference: 'R-1', currentBalance: 99, paymentMethod: 'ShamCash' }, 'en');
    expect(body).not.toContain('99');
  });
});
