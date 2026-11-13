import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));

const {
  cleanCustomerInputs,
  describeCustomerInputs,
  invalidCustomerFields,
  manualCheckoutErrorMessage,
  missingCustomerFields,
  normalizeCustomerFields,
  slugify,
} = await import('./manualProducts');
const { getStorefrontGames, getStorefrontManualProducts, getStorefrontVoucherGames } = await import('./gameRegions');
const { isCartEligibleOffer } = await import('./catalogUtils');
const { filterGamesByPullSelection } = await import('./pullCatalogUtils');
const { getAdminOrderOutcome, matchesOrderStatus, canRetryOrderFulfillment } = await import('./adminOrderFilters');

const fields = [
  { label_ar: 'الإيميل', label_en: 'Email', type: 'email', required: true },
  { label_ar: 'ملاحظة', required: false },
  { label_ar: '', label_en: '' },
];

describe('customer fields', () => {
  it('drops empty questions and gives every question a unique key', () => {
    const clean = normalizeCustomerFields([...fields, { label_en: 'Email', required: true }]);
    expect(clean).toHaveLength(3);
    expect(clean.map((f) => f.key)).toEqual(['email', 'field_2', 'email_3']);
    expect(clean[1].label_en).toBe('ملاحظة');
  });

  it('keeps only answers to the product questions, trimmed', () => {
    const clean = normalizeCustomerFields(fields);
    expect(cleanCustomerInputs(clean, { email: '  a@b.co ', hack: 'x', field_2: '   ' })).toEqual({ email: 'a@b.co' });
  });

  it('reports missing required and malformed answers', () => {
    const clean = normalizeCustomerFields(fields);
    expect(missingCustomerFields(clean, {}).map((f) => f.key)).toEqual(['email']);
    expect(invalidCustomerFields(clean, { email: 'nope' }).map((f) => f.key)).toEqual(['email']);
    expect(invalidCustomerFields(clean, { email: 'me@x.io' })).toEqual([]);
  });

  it('labels the stored answers for the order screens', () => {
    const item = { redemption_info: { inputs: { email: 'me@x.io' } }, offers: { games: { customer_fields: normalizeCustomerFields(fields) } } };
    expect(describeCustomerInputs(item, 'ar')).toEqual([{ key: 'email', label: 'الإيميل', value: 'me@x.io' }]);
    expect(describeCustomerInputs({ redemption_info: null }, 'ar')).toEqual([]);
  });

  it('maps checkout errors from the database', () => {
    const t = { manualProductsSeparately: 'SEP', manualInputRequired: 'FILL' };
    expect(manualCheckoutErrorMessage(new Error('manual_products_separately'), t)).toBe('SEP');
    expect(manualCheckoutErrorMessage(new Error('manual_input_required: الإيميل'), t)).toBe('FILL: الإيميل');
    expect(manualCheckoutErrorMessage(new Error('other'), t)).toBeNull();
  });

  it('slugifies names', () => {
    expect(slugify('Netflix Premium 4K!')).toBe('netflix-premium-4k');
    expect(slugify('نتفليكس')).toBe('');
  });
});

describe('storefront lanes', () => {
  const manual = { id: 'm', delivery_mode: 'manual', redemption_method: 'redeem_code', active: true };
  const voucher = { id: 'v', redemption_method: 'redeem_code', active: true };
  const topup = { id: 't', redemption_method: 'uid', active: true, g2bulk_game_code: 'pubgm' };

  it('keeps manual products out of the G2Bulk lanes and in their own', () => {
    const games = [manual, voucher, topup];
    expect(getStorefrontVoucherGames(games).map((g) => g.id)).toEqual(['v']);
    expect(getStorefrontGames(games).map((g) => g.id)).toEqual(['t']);
    expect(getStorefrontManualProducts(games).map((g) => g.id)).toEqual(['m']);
  });

  it('never puts manual products in the cart', () => {
    expect(isCartEligibleOffer({ id: 'o', game_id: 'm', price: 5 }, [manual])).toBe(false);
    expect(isCartEligibleOffer({ id: 'o', game_id: 'v', price: 5 }, [voucher])).toBe(true);
  });

  it('shows manual products whatever the G2Bulk pull selection is', () => {
    const kept = filterGamesByPullSelection([manual, topup], { topupBaseKeys: ['other'] });
    expect(kept.map((g) => g.id)).toEqual(['m']);
  });
});

describe('orders waiting for the owner', () => {
  const order = { status: 'completed', fulfillment_status: 'awaiting_delivery', created_at: '2026-01-01T00:00:00Z' };

  it('is processing, has its own filter and no supplier retry', () => {
    expect(getAdminOrderOutcome(order)).toBe('processing');
    expect(matchesOrderStatus(order, 'awaiting_delivery')).toBe(true);
    expect(matchesOrderStatus({ ...order, fulfillment_status: 'pending' }, 'awaiting_delivery')).toBe(false);
    expect(canRetryOrderFulfillment(order)).toBe(false);
  });
});

describe('orders waiting for a G2Bulk top-up', () => {
  const order = { status: 'completed', fulfillment_status: 'awaiting_supplier_funds', created_at: '2026-01-01T00:00:00Z' };

  it('is processing (never failed), has its own filter and can be sent by hand', async () => {
    const { getAdminDeliveryStatusDisplay } = await import('./adminOrderFilters');
    expect(getAdminOrderOutcome(order)).toBe('processing');
    expect(matchesOrderStatus(order, 'awaiting_supplier_funds')).toBe(true);
    expect(matchesOrderStatus(order, 'failed')).toBe(false);
    expect(canRetryOrderFulfillment(order)).toBe(true);
    expect(getAdminDeliveryStatusDisplay(order, { awaitingSupplierFundsAdmin: 'X' }).label).toBe('X');
  });

  it('reads as "being prepared" for the customer', async () => {
    const { getOrderReceiptPresentation } = await import('./orderReceipt');
    const p = getOrderReceiptPresentation(order, { orderBeingPrepared: 'P' });
    expect(p.title).toBe('P');
    expect(p.tone).not.toBe('danger');
  });
});
