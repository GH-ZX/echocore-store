import { INVOICE_KIND } from './invoiceBuilder';
import { getRedeemInstructions, getTopupSteps } from './redeemInstructions';

const NOW = '2026-07-14T15:30:00.000Z';

const MOCK_CUSTOMER = {
  name: 'أحمد غاوي',
  username: '@ahmed_echo',
  email: 'ahmed@example.com',
};

export const INVOICE_PREVIEW_SAMPLES = {
  redeem: {
    kind: INVOICE_KIND.ORDER,
    subtype: 'redeem',
    invoiceNumber: 'EC7A9F2B',
    orderId: '00000000-0000-4000-8000-000000000001',
    issuedAt: NOW,
    customerName: MOCK_CUSTOMER.name,
    customerUsername: MOCK_CUSTOMER.username,
    customerEmail: MOCK_CUSTOMER.email,
    paymentMethod: 'balance',
    paymentReference: null,
    status: 'completed',
    fulfillmentStatus: 'fulfilled',
    total: '$24.99',
    totalRaw: 24.99,
    giftMessage: null,
    notes: null,
    lines: [{
      id: 'mock-line-1',
      name: '1000 VP',
      price: '$24.99',
      quantity: 1,
      lineTotal: '$24.99',
      codes: ['VALO-XXXX-YYYY-ZZZZ-1234'],
      hasCodes: true,
      playerUid: null,
      playerServer: null,
      playerCharname: null,
      redemptionExtras: [],
      gameName: 'Valorant',
      gameSlug: 'valorant',
      redeemSteps: getRedeemInstructions('valorant', 'ar'),
      deliveryType: 'redeem',
    }],
  },
  topup: {
    kind: INVOICE_KIND.ORDER,
    subtype: 'topup',
    invoiceNumber: 'EC4B8C1D',
    orderId: '00000000-0000-4000-8000-000000000002',
    issuedAt: NOW,
    customerName: MOCK_CUSTOMER.name,
    customerUsername: MOCK_CUSTOMER.username,
    customerEmail: MOCK_CUSTOMER.email,
    paymentMethod: 'balance',
    paymentReference: null,
    status: 'completed',
    fulfillmentStatus: 'fulfilled',
    total: '$9.99',
    totalRaw: 9.99,
    giftMessage: null,
    notes: null,
    lines: [{
      id: 'mock-line-2',
      name: '86 Diamonds',
      price: '$9.99',
      quantity: 1,
      lineTotal: '$9.99',
      codes: [],
      hasCodes: false,
      playerUid: '1234567890',
      playerServer: 'Asia / 1234',
      playerCharname: 'ShadowWolf',
      redemptionExtras: [
        { key: 'zone_id', value: '1234' },
      ],
      gameName: 'Mobile Legends',
      gameSlug: 'mobile-legends',
      redeemSteps: getTopupSteps('ar'),
      deliveryType: 'topup',
    }],
  },
  recharge: {
    kind: INVOICE_KIND.RECHARGE,
    subtype: 'wallet_recharge',
    invoiceNumber: 'RCH-SHAM-88421',
    rechargeId: '00000000-0000-4000-8000-000000000003',
    issuedAt: NOW,
    customerName: MOCK_CUSTOMER.name,
    customerUsername: MOCK_CUSTOMER.username,
    customerEmail: MOCK_CUSTOMER.email,
    paymentMethod: 'ShamCash',
    paymentReference: 'SC-20260714-88421',
    samInvoiceId: 'sam_inv_preview_001',
    transactionRef: 'SC-20260714-88421',
    status: 'approved',
    amount: '$10.00',
    amountRaw: 10,
    balanceAfter: '$10.00',
    currency: 'USD',
    giftMessage: null,
    notes: null,
    lines: [],
  },
};

export const INVOICE_PREVIEW_OPTIONS = [
  { id: 'redeem', labelAr: 'شراء ريديم كود', labelEn: 'Redeem code purchase' },
  { id: 'topup', labelAr: 'شحن UID', labelEn: 'UID top-up' },
  { id: 'recharge', labelAr: 'شحن ShamCash', labelEn: 'ShamCash recharge' },
];

export function getInvoicePreviewSample(sampleId, lang = 'ar') {
  const base = INVOICE_PREVIEW_SAMPLES[sampleId] || INVOICE_PREVIEW_SAMPLES.redeem;
  const invoice = structuredClone(base);

  if (sampleId === 'redeem') {
    invoice.lines[0].redeemSteps = getRedeemInstructions('valorant', lang);
  }
  if (sampleId === 'topup') {
    invoice.lines[0].redeemSteps = getTopupSteps(lang);
  }

  return invoice;
}