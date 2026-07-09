import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Quote, Send, Loader2, CheckCircle } from 'lucide-react';
import { getReviewText, pickReviewsForSection, submitCustomerReview } from '../../lib/customerReviews';
import { getSectionLabel } from '../../lib/homeLayout';

function StarRating({ rating, size = 'sm' }) {
  const iconClass = size === 'lg' ? 'w-5 h-5' : 'w-3.5 h-3.5';
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`${iconClass} ${i < rating ? 'text-amber-400 fill-amber-400' : 'text-[var(--text-muted)]/35'}`}
        />
      ))}
    </div>
  );
}

function ReviewCard({ review, variant = 'active' }) {
  const text = getReviewText(review);
  const initials = (review.author_name || '?').trim().slice(0, 2).toUpperCase();
  const isActive = variant === 'active';

  return (
    <article className={`card reviews-card reviews-card--${variant}`}>
      <div className="reviews-card-accent" aria-hidden="true" />
      {isActive && <div className="reviews-card-glow" aria-hidden="true" />}
      <div className="reviews-card-body">
        <Quote className="reviews-quote-icon" aria-hidden="true" />
        <blockquote className="reviews-card-text">{text}</blockquote>
        <footer className="reviews-card-footer">
          <div className="reviews-avatar" aria-hidden="true">{initials}</div>
          <div className="min-w-0">
            <cite className="reviews-author not-italic">{review.author_name}</cite>
            <StarRating rating={review.rating || 5} size={isActive ? 'lg' : 'sm'} />
          </div>
        </footer>
      </div>
    </article>
  );
}

export default function CustomerReviewsSection({
  section,
  reviews = [],
  lang = 'ar',
  t = {},
  user,
  onReviewSubmitted,
}) {
  const isAr = lang === 'ar';
  const items = useMemo(() => pickReviewsForSection(reviews, section), [reviews, section]);
  const intervalMs = (Number(section.interval_seconds) || 6) * 1000;

  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [form, setForm] = useState({ authorName: '', content: '', rating: 5 });

  useEffect(() => {
    setActiveIndex(0);
  }, [items.length, section.id]);

  useEffect(() => {
    if (items.length <= 1 || paused) return undefined;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % items.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [items.length, intervalMs, paused]);

  useEffect(() => {
    if (user?.name && !form.authorName) {
      setForm((prev) => ({ ...prev, authorName: user.name }));
    }
  }, [user?.name, form.authorName]);

  const goNext = useCallback(() => {
    if (items.length === 0) return;
    setActiveIndex((prev) => (prev + 1) % items.length);
  }, [items.length]);

  const goPrev = useCallback(() => {
    if (items.length === 0) return;
    setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
  }, [items.length]);

  const active = items[activeIndex];
  const prev = items.length > 1 ? items[(activeIndex - 1 + items.length) % items.length] : null;
  const next = items.length > 1 ? items[(activeIndex + 1) % items.length] : null;
  const enterX = isAr ? -48 : 48;
  const exitX = isAr ? 48 : -48;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user?.id) return;
    setSubmitting(true);
    setSubmitError('');
    setSubmitSuccess(false);
    try {
      await submitCustomerReview({
        authorName: form.authorName,
        content: form.content,
        rating: form.rating,
        userId: user.id,
      });
      setSubmitSuccess(true);
      setForm((prev) => ({ ...prev, content: '' }));
      onReviewSubmitted?.();
      setTimeout(() => setSubmitSuccess(false), 4000);
    } catch (err) {
      setSubmitError(err.message || t.reviewSubmitFailed);
    } finally {
      setSubmitting(false);
    }
  };

  if (items.length === 0 && !section.show_submit_form) return null;

  const title = getSectionLabel(section, lang);

  return (
    <section
      className="customer-reviews-section"
      dir={isAr ? 'rtl' : 'ltr'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="text-center mb-6 sm:mb-8">
        <h2 className="section-heading mb-2">
          <span className="reviews-section-title text-xl md:text-2xl font-bold">{title}</span>
        </h2>
        <div className="reviews-section-divider h-px w-10 mx-auto" />
        <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-3 max-w-xl mx-auto">
          {t.reviewsSectionSubtitle}
        </p>
      </div>

      {items.length > 0 && (
        <div className={`reviews-carousel ${items.length === 1 ? 'reviews-carousel--single' : ''}`}>
          {items.length > 1 && prev && (
            <button
              type="button"
              className="reviews-carousel-side reviews-carousel-side--prev"
              onClick={goPrev}
              aria-label={t.reviewsPrevious}
            >
              <ReviewCard review={prev} variant="side" />
            </button>
          )}

          <div className="reviews-carousel-main">
            <AnimatePresence mode="wait" initial={false}>
              {active && (
                <motion.div
                  key={active.id}
                  className="reviews-carousel-slide"
                  initial={{ x: enterX, opacity: 0, scale: 0.94 }}
                  animate={{ x: 0, opacity: 1, scale: 1 }}
                  exit={{ x: exitX, opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                >
                  <ReviewCard review={active} variant="active" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {items.length > 1 && next && (
            <button
              type="button"
              className="reviews-carousel-side reviews-carousel-side--next"
              onClick={goNext}
              aria-label={t.reviewsNext}
            >
              <ReviewCard review={next} variant="side" />
            </button>
          )}
        </div>
      )}

      {items.length > 1 && (
        <div className="reviews-dots" role="tablist" aria-label={title}>
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              className={`reviews-dot ${index === activeIndex ? 'reviews-dot--active' : ''}`}
              onClick={() => setActiveIndex(index)}
            />
          ))}
        </div>
      )}

      {section.show_submit_form && (
        <div className="reviews-submit-wrap">
          {!user ? (
            <p className="text-sm text-[var(--text-sec)] text-center">{t.reviewLoginToSubmit}</p>
          ) : (
            <>
              <button
                type="button"
                className="reviews-submit-toggle"
                onClick={() => setFormOpen((v) => !v)}
              >
                {formOpen ? t.reviewHideForm : t.reviewShareYours}
              </button>

              {formOpen && (
                <form onSubmit={handleSubmit} className="reviews-submit-form card p-4 sm:p-5">
                  <div className="grid sm:grid-cols-2 gap-3 mb-3">
                    <input
                      required
                      value={form.authorName}
                      onChange={(e) => setForm((prev) => ({ ...prev, authorName: e.target.value }))}
                      placeholder={t.reviewYourName}
                      className="input"
                      maxLength={60}
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-muted)]">{t.reviewRating}</span>
                      <select
                        value={form.rating}
                        onChange={(e) => setForm((prev) => ({ ...prev, rating: Number(e.target.value) }))}
                        className="input flex-1"
                      >
                        {[5, 4, 3, 2, 1].map((n) => (
                          <option key={n} value={n}>{n} ★</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <textarea
                    required
                    value={form.content}
                    onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                    placeholder={t.reviewYourOpinion}
                    className="input w-full min-h-[100px] resize-y mb-3"
                    maxLength={500}
                  />
                  {submitError && <p className="text-xs text-red-400 mb-2">{submitError}</p>}
                  {submitSuccess && (
                    <p className="text-xs text-emerald-400 mb-2 flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5" />
                      {t.reviewSubmitPending}
                    </p>
                  )}
                  <button type="submit" disabled={submitting} className="btn btn-primary gap-2">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {t.reviewSubmit}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}