import { supabase } from './supabase';

export const REVIEW_STATUSES = ['pending', 'approved', 'rejected'];

export async function fetchApprovedReviews() {
  const { data, error } = await supabase.rpc('get_approved_customer_reviews');
  if (error) {
    if (error.message?.includes('get_approved_customer_reviews')) {
      return [];
    }
    console.error('get_approved_customer_reviews:', error);
    return [];
  }
  return Array.isArray(data) ? data : [];
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

export async function submitCustomerReview({ authorName, content, rating = 5, userId }) {
  const payload = {
    user_id: userId,
    author_name: authorName.trim(),
    content: content.trim(),
    rating: Math.max(1, Math.min(5, Number(rating) || 5)),
    status: 'pending',
    is_seed: false,
  };

  const { data, error } = await supabase
    .from('customer_reviews')
    .insert(payload)
    .select()
    .single();

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
    .insert({ ...payload, is_seed: true, status: review.status || 'approved' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteReview(id) {
  const { error } = await supabase.from('customer_reviews').delete().eq('id', id);
  if (error) throw error;
}

export function getReviewText(review) {
  return review.content?.trim() || '';
}

export function pickReviewsForSection(reviews, section) {
  const limit = Math.max(1, Math.min(20, Number(section.limit) || 8));
  const ids = Array.isArray(section.review_ids) ? section.review_ids : [];

  let picked = ids.length
    ? ids.map((id) => reviews.find((r) => r.id === id)).filter(Boolean)
    : [...reviews];

  return picked.slice(0, limit);
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

/** @deprecated Use pickStableOffers */
export function shuffleOffers(offers, limit = 8, seed = 'offers') {
  return pickStableOffers(offers, limit, seed);
}