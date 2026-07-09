import { useState, useEffect, useCallback, useMemo } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { Star, Quote, Send, Loader2, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
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
        <blockquote className="reviews-card-text" dir="auto">{text}</blockquote>
        <footer className="reviews-card-footer">
          <div className="reviews-avatar" aria-hidden="true">{initials}</div>
          <div className="min-w-0">
            <cite className="reviews-author not-italic" dir="auto">{review.author_name}</cite>
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
  const items = useMemo(() => pickReviewsForSection(reviews, section), [reviews, section]);
  const intervalMs = (Number(section.interval_seconds) || 6) * 1000;

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: items.length > 1,
    align: 'center',
    containScroll: 'trimSnaps',
    dragFree: false,
  });

  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [form, setForm] = useState({ authorName: '', content: '', rating: 5 });

  useEffect(() => {
    if (!emblaApi) return undefined;
    const onSelect = () => setActiveIndex(emblaApi.selectedScrollSnap());
    const onPointerDown = () => setPaused(true);
    const onPointerUp = () => setPaused(false);
    onSelect();
    emblaApi.on('select', onSelect);
    emblaApi.on('pointerDown', onPointerDown);
    emblaApi.on('pointerUp', onPointerUp);
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('pointerDown', onPointerDown);
      emblaApi.off('pointerUp', onPointerUp);
    };
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.reInit({ loop: items.length > 1 });
    setActiveIndex(0);
    emblaApi.scrollTo(0);
  }, [emblaApi, items.length]);

  useEffect(() => {
    if (!emblaApi || items.length <= 1 || paused) return undefined;
    const timer = setInterval(() => emblaApi.scrollNext(), intervalMs);
    return () => clearInterval(timer);
  }, [emblaApi, items.length, intervalMs, paused]);

  useEffect(() => {
    if (user?.name && !form.authorName) {
      setForm((prev) => ({ ...prev, authorName: user.name }));
    }
  }, [user?.name, form.authorName]);

  const goNext = useCallback(() => {
    emblaApi?.scrollNext();
  }, [emblaApi]);

  const goPrev = useCallback(() => {
    emblaApi?.scrollPrev();
  }, [emblaApi]);

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
      className="customer-reviews-section touch-manipulation"
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
        <div className="reviews-embla relative max-w-5xl mx-auto px-1 sm:px-2" dir="ltr">
          {items.length > 1 && (
            <>
              <button
                type="button"
                className="reviews-embla-nav reviews-embla-nav--prev"
                onClick={goPrev}
                aria-label={t.reviewsPrevious}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                className="reviews-embla-nav reviews-embla-nav--next"
                onClick={goNext}
                aria-label={t.reviewsNext}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          <div
            ref={emblaRef}
            dir="ltr"
            className="reviews-embla__viewport overflow-hidden overscroll-x-contain [-webkit-overflow-scrolling:touch]"
            onWheel={(e) => {
              if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                e.preventDefault();
              }
            }}
          >
            <div className="reviews-embla__container flex">
              {items.map((review, index) => (
                <div
                  key={review.id}
                  className={`reviews-embla__slide min-w-0 shrink-0 ${
                    index === activeIndex ? 'reviews-embla__slide--active' : ''
                  }`}
                >
                  <ReviewCard review={review} variant="active" />
                </div>
              ))}
            </div>
          </div>

          {items.length > 1 && (
            <p className="reviews-swipe-hint text-center text-[11px] text-[var(--text-muted)] mt-3 sm:hidden">
              {t.reviewsSwipeHint}
            </p>
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
              onClick={() => emblaApi?.scrollTo(index)}
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