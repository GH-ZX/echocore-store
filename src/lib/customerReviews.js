import { supabase } from './supabase';

export const REVIEW_STATUSES = ['pending', 'approved', 'rejected'];

/** No client-side mock reviews — homepage shows only approved rows from Supabase. */
export async function fetchApprovedReviews() {
  const { data, error } = await supabase.rpc('get_approved_customer_reviews');
  if (error) {
    console.error('get_approved_customer_reviews:', error);
    return [];
  }
  const rows = Array.isArray(data) ? data : [];
  return rows.map((review) => ({ ...review, status: review.status || 'approved' }));
}

export async function fetchAllReviews() {
  const { data, error } = await supabase
    .from('customer_reviews')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    if (error.message?.includes('customer_reviews') || error.code === 'PGRST205') {
      throw new Error('Run add_customer_reviews.sql in Supabase SQL Editor first.');
    }
    throw error;
  }
  return data || [];
}

/**
 * Customer submits a pending review (homepage or post-purchase success).
 * Admin is notified via DB trigger (admin_customer_review).
 */
export async function submitCustomerReview({
  authorName,
  content,
  rating = 5,
  userId,
  orderId = null,
}) {
  const payload = {
    user_id: userId,
    author_name: String(authorName || '').trim(),
    content: String(content || '').trim(),
    rating: Math.max(1, Math.min(5, Number(rating) || 5)),
    status: 'pending',
    is_seed: false,
  };

  if (!payload.author_name || payload.author_name.length < 2) {
    throw new Error('Author name required');
  }
  if (!payload.content || payload.content.length < 8) {
    throw new Error('Review too short');
  }

  // Optional link — ignored by DB if column absent; stored when migration applied
  if (orderId) {
    payload.order_id = orderId;
  }

  const { data, error } = await supabase
    .from('customer_reviews')
    .insert(payload)
    .select()
    .single();

  // Retry without order_id if column not migrated yet
  if (error && orderId && (error.message?.includes('order_id') || error.code === 'PGRST204')) {
    delete payload.order_id;
    const retry = await supabase
      .from('customer_reviews')
      .insert(payload)
      .select()
      .single();
    if (retry.error) throw retry.error;
    return retry.data;
  }

  if (error) throw error;
  return data;
}

export async function updateReviewStatus(id, status) {
  if (!REVIEW_STATUSES.includes(status)) {
    throw new Error('Invalid review status');
  }
  const { data, error } = await supabase
    .from('customer_reviews')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function saveReview(review) {
  const payload = {
    author_name: review.author_name?.trim(),
    content: review.content?.trim(),
    rating: Math.max(1, Math.min(5, Number(review.rating) || 5)),
    status: review.status || 'pending',
    sort_order: Number(review.sort_order) || 0,
    is_seed: !!review.is_seed,
    updated_at: new Date().toISOString(),
  };

  if (review.id) {
    const { data, error } = await supabase
      .from('customer_reviews')
      .update(payload)
      .eq('id', review.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('customer_reviews')
    .insert({ ...payload, is_seed: false, status: review.status || 'approved' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteReview(id) {
  const { error } = await supabase.from('customer_reviews').delete().eq('id', id);
  if (error) throw error;
}

/** Delete seed/mock rows (admin utility). */
export async function deleteSeedReviews() {
  const { error } = await supabase
    .from('customer_reviews')
    .delete()
    .eq('is_seed', true);
  if (error) throw error;
}

export function getReviewText(review) {
  return review.content?.trim() || '';
}

export function isDisplayableReview(review) {
  if (!review) return false;
  const status = review.status || 'approved';
  return status === 'approved';
}

export function pickReviewsForSection(reviews, section) {
  const limit = Math.max(1, Math.min(20, Number(section.limit) || 8));
  const ids = Array.isArray(section.review_ids) ? section.review_ids : [];
  const approved = (reviews || []).filter(isDisplayableReview);

  let picked = ids.length
    ? ids.map((id) => approved.find((r) => r.id === id)).filter(Boolean)
    : approved;

  // Saved picks can go stale after deletes — fall back to all approved reviews.
  if (ids.length > 0 && picked.length === 0) {
    picked = approved;
  }

  return picked.slice(0, limit);
}

export function countDisplayableReviews(reviews, section) {
  return pickReviewsForSection(reviews, section).length;
}

export function pickStableOffers(offers, limit = 8, seed = 'offers') {
  const cap = Math.max(1, Math.min(10, Number(limit) || 8));
  const pool = [...offers];
  let state = 0;

  for (let i = 0; i < seed.length; i += 1) {
    state = ((state << 5) - state + seed.charCodeAt(i)) | 0;
  }

  for (let i = pool.length - 1; i > 0; i -= 1) {
    state = (state * 1103515245 + 12345) | 0;
    const j = Math.abs(state) % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, cap);
}

/**
 * Prefer bestsellers by units sold; fill remainder with stable shuffle of the rest.
 * @param {Array} offers active catalog offers
 * @param {Array<{offer_id?: string, offerId?: string, units?: number}>} rankedRows from get_bestselling_offer_ids
 * @param {number} limit default 10
 */
export function pickTopBoughtOffers(offers = [], rankedRows = [], limit = 10) {
  const cap = Math.max(1, Math.min(20, Number(limit) || 10));
  const byId = new Map((offers || []).map((o) => [o.id, o]));
  const picked = [];
  const used = new Set();

  for (const row of rankedRows || []) {
    const id = row?.offer_id || row?.offerId;
    if (!id || used.has(id)) continue;
    const offer = byId.get(id);
    if (!offer || offer.active === false) continue;
    picked.push(offer);
    used.add(id);
    if (picked.length >= cap) return picked;
  }

  // Fill with remaining active offers (stable order by id for consistency)
  const rest = (offers || [])
    .filter((o) => o && o.active !== false && !used.has(o.id))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  for (const offer of rest) {
    picked.push(offer);
    if (picked.length >= cap) break;
  }
  return picked;
}

/** @deprecated Use pickStableOffers */
export function shuffleOffers(offers, limit = 8, seed = 'offers') {
  return pickStableOffers(offers, limit, seed);
}
