import { supabase } from './supabase';

/** Private bucket for payment receipt images (created by the shamcash_manual_fallback migration). */
export const PAYMENT_PROOF_BUCKET = 'payment-proofs';
export const PAYMENT_PROOF_MAX_BYTES = 5 * 1024 * 1024;

const TXN_RE = /^#[0-9]{3,20}$/;

/**
 * ShamCash transaction ids look like "#324065688". Customers often paste only the digits,
 * so a bare number gets its "#" added. Returns '' for empty input.
 */
export function normalizeTxnRef(value) {
  const raw = String(value ?? '').trim().replace(/\s+/g, '');
  if (!raw) return '';
  if (/^[0-9]+$/.test(raw)) return `#${raw}`;
  return raw;
}

export function isValidTxnRef(value) {
  return TXN_RE.test(normalizeTxnRef(value));
}

/** Maps a server error to a translation key (undefined = unknown, show the raw message). */
export function proofErrorKey(message = '') {
  const m = String(message);
  if (m.includes('proof_required')) return 'rechargeProofNeedOne';
  if (m.includes('invalid_txn_ref')) return 'rechargeTxnInvalid';
  if (m.includes('txn_ref_used')) return 'rechargeTxnUsed';
  if (m.includes('proof_not_found') || m.includes('invalid_proof_path')) return 'rechargeProofUploadFailed';
  return undefined;
}

/**
 * Shrinks a phone photo before upload (Syrian mobile links are slow/expensive):
 * longest side <= 1600px, JPEG ~0.82. Falls back to the original file if the browser can't decode it.
 */
export async function compressReceiptImage(file, { maxSide = 1600, quality = 0.82 } = {}) {
  if (!file || typeof document === 'undefined' || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size === 0) return file;
    // Keep the smaller one — but always take the shrunk copy when the original is over the upload limit.
    return blob.size < file.size || file.size > PAYMENT_PROOF_MAX_BYTES ? blob : file;
  } catch {
    return file;
  }
}

/** Uploads into the caller's own folder: `<userId>/<requestId>-<time>.<ext>`. Returns the storage path. */
export async function uploadPaymentProof({ userId, requestId, file }) {
  if (!userId || !requestId || !file) throw new Error('proof_upload_invalid');
  const prepared = await compressReceiptImage(file);
  if (prepared.size > PAYMENT_PROOF_MAX_BYTES) throw new Error('proof_too_big');

  const type = prepared.type === 'image/png' || prepared.type === 'image/webp' ? prepared.type : 'image/jpeg';
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/${requestId}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(PAYMENT_PROOF_BUCKET)
    .upload(path, prepared, { contentType: type, upsert: false });
  if (error) throw new Error(error.message || 'proof_upload_failed');
  return path;
}

/** Admin: short-lived link to view a receipt (the bucket is private). */
export async function getPaymentProofUrl(path, expiresInSeconds = 3600) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(PAYMENT_PROOF_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl || null;
}
