import { useEffect, useState } from 'react';
import { CheckCircle, Loader2, Send, Star } from 'lucide-react';
import { submitCustomerReview } from '../../lib/customerReviews';

/**
 * Shared review submit form — homepage section + post-purchase success page.
 * Submissions are always pending until an admin approves them for the homepage.
 */
export default function CustomerReviewForm({
  t = {},
  user,
  orderId = null,
  compact = false,
  onSubmitted,
  className = '',
}) {
  const [authorName, setAuthorName] = useState(user?.name || user?.username || '');
  const [content, setContent] = useState('');
  const [rating, setRating] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (user?.name && !authorName) {
      setAuthorName(user.name);
    } else if (user?.username && !authorName) {
      setAuthorName(user.username);
    }
  }, [user?.name, user?.username, authorName]);

  if (!user?.id) {
    return (
      <p className={`text-sm text-[var(--text-sec)] text-center ${className}`.trim()}>
        {t.reviewLoginToSubmit}
      </p>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess(false);
    try {
      await submitCustomerReview({
        authorName,
        content,
        rating,
        userId: user.id,
        orderId,
      });
      setSuccess(true);
      setContent('');
      onSubmitted?.();
      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      const msg = err?.message || '';
      if (msg.includes('too short') || msg.includes('Author')) {
        setError(t.reviewSubmitValidation || t.reviewSubmitFailed);
      } else {
        setError(msg || t.reviewSubmitFailed);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`customer-review-form ${compact ? 'customer-review-form--compact' : ''} ${className}`.trim()}
    >
      {!compact && (
        <p className="text-sm text-[var(--text-sec)] mb-3 leading-relaxed">
          {t.reviewAfterPurchaseHint || t.reviewShareYours}
        </p>
      )}

      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <input
          required
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          placeholder={t.reviewYourName}
          className="input"
          maxLength={60}
          autoComplete="nickname"
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">{t.reviewRating}</span>
          <div className="flex items-center gap-1 flex-1" role="group" aria-label={t.reviewRating}>
            {[1, 2, 3, 4, 5].map((n) => {
              const active = n <= rating;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  className="customer-review-form__star-btn"
                  aria-label={`${n}`}
                  aria-pressed={active}
                >
                  <Star
                    className={`w-5 h-5 ${active ? 'text-amber-400 fill-amber-400' : 'text-[var(--text-muted)]/40'}`}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <textarea
        required
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={t.reviewYourOpinion}
        className="input w-full min-h-[100px] resize-y mb-3"
        maxLength={500}
      />

      {error ? <p className="text-xs text-red-400 mb-2">{error}</p> : null}
      {success ? (
        <p className="text-xs text-emerald-400 mb-2 flex items-center gap-1.5">
          <CheckCircle className="w-3.5 h-3.5 shrink-0" />
          {t.reviewSubmitPending}
        </p>
      ) : null}

      <button type="submit" disabled={submitting || success} className="btn btn-primary gap-2">
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {t.reviewSubmit}
      </button>
    </form>
  );
}
