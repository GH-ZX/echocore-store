import { isApiWalletMode } from './paymentMethods';

const SAM_INVOICE_RECOVERABLE = new Set(['expired', 'failed', 'cancelled']);

function hasSamInvoice(req) {
  return !!req?.sam_invoice_id;
}

/** Legacy manual flow: user marked payment sent — admin approves or rejects. */
export function needsLegacyManualReview(req, paymentConfig = {}) {
  if (isApiWalletMode(paymentConfig)) return false;
  return req?.status === 'payment_sent';
}

/** Sam API: customer has an active invoice window (up to ~15 minutes). */
export function isSamApiAwaitingPayment(req) {
  if (req?.status !== 'pending' || !hasSamInvoice(req)) return false;
  if (req.sam_invoice_status !== 'pending') return false;
  if (!req.sam_invoice_expires_at) return true;
  return new Date(req.sam_invoice_expires_at).getTime() > Date.now();
}

/** Sam API invoice expired/failed — admin may grant balance manually. */
export function canGrantExpiredSamBalance(req) {
  if (req?.status !== 'cancelled' || !hasSamInvoice(req)) return false;
  if (SAM_INVOICE_RECOVERABLE.has(req.sam_invoice_status)) return true;
  if (
    req.sam_invoice_status === 'pending'
    && req.sam_invoice_expires_at
    && new Date(req.sam_invoice_expires_at).getTime() <= Date.now()
  ) {
    return true;
  }
  return false;
}

export function getAdminRechargeDisplayStatus(req) {
  if (isSamApiAwaitingPayment(req)) return 'sam_awaiting';
  return req?.status || 'pending';
}

export function getAdminRechargeStatusTone(displayStatus) {
  if (displayStatus === 'sam_awaiting') return 'warning';
  const tones = {
    pending: 'pending',
    payment_sent: 'warning',
    approved: 'success',
    rejected: 'danger',
    cancelled: 'neutral',
  };
  return tones[displayStatus] || 'muted';
}