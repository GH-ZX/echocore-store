import { supabase } from './supabase';

export const REVIEW_STATUSES = ['pending', 'approved', 'rejected'];

export const FALLBACK_CUSTOMER_REVIEWS = [
  {
    id: 'fallback-review-1',
    author_name: 'Khaled M.',
    content: 'توصيل سريع وأسعار ممتازة. شحنت VP لفالورانت خلال أقل من دقيقة.',
    rating: 5,
    status: 'approved',
    sort_order: 1,
  },
  {
    id: 'fallback-review-2',
    author_name: 'Sara A.',
    content: 'واجهة المتجر جميلة والدفع سلس. ShamCash اشتغل بدون أي مشكلة.',
    rating: 5,
    status: 'approved',
    sort_order: 2,
  },
  {
    id: 'fallback-review-3',
    author_name: 'Omar H.',
    content: 'أفضل أسعار لقيتها لشحن الألعاب. الدعم رد بسرعة على الديسكورد.',
    rating: 5,
    status: 'approved',
    sort_order: 3,
  },
  {
    id: 'fallback-review-4',
    author_name: 'Layla R.',
    content: 'موثوق كل مرة. أستخدم المتجر لشراء RP في لول أسبوعياً.',
    rating: 5,
    status: 'approved',
    sort_order: 4,
  },
  {
    id: 'fallback-review-5',
    author_name: 'Youssef K.',
    content: 'Fast delivery and fair prices. PUBG UC arrived in under a minute.',
    rating: 5,
    status: 'approved',
    sort_order: 5,
  },
  {
    id: 'fallback-review-6',
    author_name: 'Nour T.',
    content: 'Clean checkout, clear prices, and instant top-ups. Highly recommend.',
    rating: 5,
    status: 'approved',
    sort_order: 6,
  },
  {
    id: 'fallback-review-7',
    author_name: 'Rami S.',
    content: 'اشتريت بطاقة Xbox ووصل الكود فوراً. تجربة ممتازة من البداية للنهاية.',
    rating: 5,
    status: 'approved',
    sort_order: 7,
  },
  {
    id: 'fallback-review-8',
    author_name: 'Maya L.',
    content: 'Great support when I had a question about my order. Will buy again.',
    rating: 5,
    status: 'approved',
    sort_order: 8,
  },
];

export async function fetchApprovedReviews() {
  const { data, error } = await supabase.rpc('get_approved_customer_reviews');
  if (error) {
    if (error.message?.includes('get_approved_customer_reviews')) {
      return [...FALLBACK_CUSTOMER_REVIEWS];
    }
    console.error('get_approved_customer_reviews:', error);
    return [...FALLBACK_CUSTOMER_REVIEWS];
  }
  const rows = Array.isArray(data) ? data : [];
  return rows.length > 0 ? rows : [...FALLBACK_CUSTOMER_REVIEWS];
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