import { describe, expect, it } from 'vitest';
import {
  buildPaymentMethods,
  getManualPaymentDisplay,
  getOrderPaymentMethodLabel,
  hasAnyManualWalletReady,
  isApiWalletMethod,
  isPaymentMethodReady,
} from './paymentMethods';

const t = {};
const apiConfig = {
  walletMode: 'api',
  shamcash: true,
  samShamcashApiReady: true,
  shamcashPayCode: 'abcdef0123456789abcdef0123456789',
  shamcashQrImageUrl: '',
};

describe('manual ShamCash fallback', () => {
  it('is ready only when the server says the toggle and wallet id are set', () => {
    expect(isPaymentMethodReady('ShamCashManual', { ...apiConfig, shamcashManualFallback: true })).toBe(true);
    expect(isPaymentMethodReady('ShamCashManual', { ...apiConfig, shamcashManualFallback: false })).toBe(false);
    expect(isPaymentMethodReady('ShamCashManual', apiConfig)).toBe(false);
  });

  it('works even when the automatic provider is not ready', () => {
    const cfg = { walletMode: 'api', shamcash: false, samShamcashApiReady: false, shamcashManualFallback: true };
    expect(isPaymentMethodReady('ShamCash', cfg)).toBe(false);
    expect(isPaymentMethodReady('ShamCashManual', cfg)).toBe(true);
    expect(hasAnyManualWalletReady(cfg)).toBe(true);
  });

  it('is offered next to automatic ShamCash on the recharge page in API mode', () => {
    const ids = buildPaymentMethods(t, 'en', { ...apiConfig, shamcashManualFallback: true }, { isCheckout: false }).map((m) => m.id);
    expect(ids).toContain('ShamCash');
    expect(ids).toContain('ShamCashManual');
  });

  it('is offered even if automatic ShamCash is unavailable', () => {
    const cfg = { walletMode: 'api', shamcash: false, shamcashManualFallback: true };
    const methods = buildPaymentMethods(t, 'ar', cfg, { isCheckout: false });
    const manual = methods.find((m) => m.id === 'ShamCashManual');
    expect(manual).toBeTruthy();
    expect(manual.disabled).toBe(false);
  });

  it('is never offered at checkout, when disabled, or in store-wide manual mode', () => {
    const on = { ...apiConfig, shamcashManualFallback: true };
    expect(buildPaymentMethods(t, 'en', on, { isCheckout: true }).some((m) => m.id === 'ShamCashManual')).toBe(false);
    expect(buildPaymentMethods(t, 'en', apiConfig, { isCheckout: false }).some((m) => m.id === 'ShamCashManual')).toBe(false);
    expect(buildPaymentMethods(t, 'en', { ...on, walletMode: 'manual' }, { isCheckout: false }).some((m) => m.id === 'ShamCashManual')).toBe(false);
  });

  it('is a manual flow (not a Sam invoice) even in API mode', () => {
    expect(isApiWalletMethod('ShamCashManual', apiConfig)).toBe(false);
    expect(isApiWalletMethod('ShamCash', apiConfig)).toBe(true);
  });

  it('shows the wallet id (QR optional) and a readable label', () => {
    const display = getManualPaymentDisplay({ ...apiConfig, shamcashManualFallback: true }, 'ShamCashManual');
    expect(display.payCode).toBe(apiConfig.shamcashPayCode);
    expect(display.qrImageUrl).toBe('');
    expect(display.methodLabelKey).toBe('shamcashManualMethod');
    expect(getOrderPaymentMethodLabel('ShamCashManual', { shamcashManualMethod: 'ShamCash (manual)' })).toBe('ShamCash (manual)');
    expect(getOrderPaymentMethodLabel('ShamCashManual', {})).toBe('ShamCash (manual)');
  });
});
