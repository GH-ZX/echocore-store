import { useState, useEffect, useCallback, useMemo } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { Star, Quote, ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react';
import { getReviewText, pickReviewsForSection } from '../../lib/customerReviews';
import { getSectionLabel } from '../../lib/homeLayout';
import { useEmblaAutoplay } from '../../hooks/useEmblaAutoplay';
import CustomerReviewForm from '../../components/reviews/CustomerReviewForm';

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
  const [tabHidden, setTabHidden] = useState(
    () => typeof document !== 'undefined' && document.hidden,
  );
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    const onVisibility = () => setTabHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

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

  useEmblaAutoplay(emblaApi, {
    intervalMs,
    paused: paused || tabHidden,
    enabled: items.length > 1,
  });

  const goNext = useCallback(() => {
    emblaApi?.scrollNext();
  }, [emblaApi]);

  const goPrev = useCallback(() => {
    emblaApi?.scrollPrev();
  }, [emblaApi]);

  const title = getSectionLabel(section, lang);
  const showForm = section.show_submit_form !== false;

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

      {items.length === 0 ? (
        <div className="reviews-empty card max-w-xl mx-auto p-6 sm:p-8 text-center mb-6">
          <MessageSquare className="w-9 h-9 mx-auto mb-3 text-[var(--accent)] opacity-60" aria-hidden />
          <p className="text-sm text-[var(--text-sec)] leading-relaxed">
            {t.reviewsEmptyHomepage}
          </p>
        </div>
      ) : (
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

      {showForm && (
        <div className="reviews-submit-wrap">
          <button
            type="button"
            className="reviews-submit-toggle"
            onClick={() => setFormOpen((v) => !v)}
          >
            {formOpen ? t.reviewHideForm : t.reviewShareYours}
          </button>

          {formOpen && (
            <div className="reviews-submit-form card p-4 sm:p-5">
              <CustomerReviewForm
                t={t}
                user={user}
                compact
                onSubmitted={onReviewSubmitted}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}