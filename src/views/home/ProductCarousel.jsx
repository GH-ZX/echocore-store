import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight, Settings2, ChevronUp, ChevronDown, Plus } from 'lucide-react';
import AdminEditButton from '../../components/admin/AdminEditButton';

import { brandUserText } from '../../lib/branding';
import { useEmblaAutoplay } from '../../hooks/useEmblaAutoplay';
import { formatMessage } from '../../lib/i18n';
import { presetImageUrl } from '../../lib/imageUtils';
import { getGameCoverUrl } from '../../lib/gameImages';
import { extractDominantLogoColor, isCanvasSafeUrl, sampleLogoColorFromUrl } from '../../lib/logoColor';
import { resolveCarouselBadge } from '../../lib/carouselUtils';

const AUTOPLAY_MS = 6000;

function slideDistance(index, active, total) {
  const direct = Math.abs(index - active);
  return Math.min(direct, total - direct);
}

function shouldLoadSlide(index, active, total) {
  if (total <= 2) return true;
  return slideDistance(index, active, total) <= 1;
}

export default function ProductCarousel({
  products,
  t = {},
  lang,
  onSelectProduct,
  isAdmin = false,
  onManageCarousel,
  onEditGame,
  onMoveCarouselGame,
  onPickCarouselGame,
}) {
  const gameSlides = products.filter((p) => p.category === 'games');
  const slides = gameSlides.length ? gameSlides : products;

  const placeholderCover = new URL('../../assets/placeholder-cover.svg', import.meta.url).href;

  const [emblaRef, embla] = useEmblaCarousel({
    loop: true,
    skipSnaps: false,
    align: 'start',
    containScroll: 'trimSnaps',
  });
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [tabHidden, setTabHidden] = useState(
    () => typeof document !== 'undefined' && document.hidden,
  );
  const [kenBurnsEnabled, setKenBurnsEnabled] = useState(false);
  const [logoLineColor, setLogoLineColor] = useState(null);
  const logoImgRefs = useRef({});
  const colorJobRef = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px) and (prefers-reduced-motion: no-preference)');
    const sync = () => setKenBurnsEnabled(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const onVisibility = () => setTabHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const autoplayPaused = isPaused || tabHidden;

  useEmblaAutoplay(embla, {
    intervalMs: AUTOPLAY_MS,
    paused: autoplayPaused,
    enabled: slides.length > 1,
  });

  useEffect(() => {
    if (!embla) return;
    const onSelect = () => setActiveSlide(embla.selectedScrollSnap());
    onSelect();
    embla.on('select', onSelect);
    return () => embla.off('select', onSelect);
  }, [embla]);

  const getCoverUrl = useCallback(
    (item) => presetImageUrl(getGameCoverUrl(item) || item.image || placeholderCover, 'carouselCover'),
    [placeholderCover],
  );

  // Preload every slide cover up front so a background never pops in (as a
  // light flash at the image's unfilled edge) when it becomes the active
  // slide — especially during the slow first load when the main thread is busy.
  useEffect(() => {
    slides.forEach((item) => {
      const url = getCoverUrl(item);
      if (!url) return;
      const img = new Image();
      img.src = url;
    });
  }, [slides, getCoverUrl]);

  const getLogo = useCallback(
    (item) => item.logo_url || item.logo || null,
    [],
  );

  const resolveActiveLogoColor = useCallback(async (item) => {
    const jobId = ++colorJobRef.current;
    const logoSrc = getLogo(item);

    if (!logoSrc) {
      setLogoLineColor(null);
      return;
    }

    const domImg = logoImgRefs.current[item.id];
    let color = domImg?.complete && domImg.naturalWidth
      ? extractDominantLogoColor(domImg)
      : null;

    if (!color) {
      color = await sampleLogoColorFromUrl(logoSrc);
    }

    if (colorJobRef.current === jobId && color) {
      setLogoLineColor(color);
    }
  }, [getLogo]);

  useEffect(() => {
    const item = slides[activeSlide];
    if (!item) return;
    setLogoLineColor(null);
    resolveActiveLogoColor(item);
  }, [activeSlide, slides, resolveActiveLogoColor]);

  const currentItem = slides[activeSlide] || slides[0];
  const slideCount = slides.length;

  const sectionClassName = useMemo(
    () => 'mt-4 sm:mt-8 relative overflow-hidden rounded-[20px] border border-[var(--border-strong)]/60 shadow-none sm:shadow-[0_8px_32px_rgba(0,0,0,0.4)]',
    [],
  );

  return (
    <section
      className={sectionClassName}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      aria-label={t.featuredGamesCarouselAria}
    >
      {isAdmin && (
        <div className="absolute top-3 left-3 z-40 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onManageCarousel?.(); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/40 bg-[var(--carousel-admin-btn-bg)] backdrop-blur-md px-3 py-1.5 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-all"
          >
            <Settings2 className="w-3.5 h-3.5" />
            {t.manageCarousel}
          </button>
          {currentItem && (
            <AdminEditButton
              label={t.editSlide}
              onClick={() => onEditGame?.(currentItem)}
              className="bg-[var(--carousel-admin-btn-bg)] backdrop-blur-md"
            />
          )}
        </div>
      )}

      {slides.length === 0 && isAdmin && onPickCarouselGame ? (
        <div className="p-6 sm:p-8 text-center space-y-4">
          <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto">
            {t.carouselEmptyAdminHint}
          </p>
          <button
            type="button"
            onClick={onPickCarouselGame}
            className="btn btn-primary inline-flex items-center gap-2 min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            {t.addToCarousel}
          </button>
        </div>
      ) : slides.length > 0 && (
      <div className="relative">
        <div
          className="absolute top-0 left-0 right-0 z-30 h-[3px]"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          <div
            key={activeSlide}
            className={`carousel-progress-bar ${autoplayPaused ? 'paused' : ''}`}
          />
        </div>

        <div
          className="absolute top-3 right-4 z-30 hidden sm:flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold tabular-nums"
          style={{
            color: 'var(--text-secondary)',
            borderColor: 'color-mix(in srgb, var(--border-strong) 70%, transparent)',
            background: 'rgba(13,8,28,0.55)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
          aria-hidden="true"
        >
          <span style={{ color: 'var(--accent-hover)' }}>{String(activeSlide + 1).padStart(2, '0')}</span>
          <span style={{ opacity: 0.6 }}>/</span>
          <span>{String(slideCount).padStart(2, '0')}</span>
        </div>

        <div
          className="overflow-hidden"
          ref={emblaRef}
          dir="ltr"
          role="region"
          aria-roledescription="carousel"
          aria-label={t.carousel || 'Carousel'}
        >
          <div className="flex" dir="ltr">
            {slides.map((item, slideIndex) => {
              const focusX = item.carousel_focus_x ?? 50;
              const focusY = item.carousel_focus_y ?? 50;
              const isActiveSlide = slideIndex === activeSlide;
              const loadImage = shouldLoadSlide(slideIndex, activeSlide, slideCount);
              const imgSrc = getCoverUrl(item);

              return (
                <div
                  key={item.id}
                  className="carousel-slide relative overflow-hidden cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectProduct?.(item)}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && onSelectProduct) {
                      e.preventDefault();
                      onSelectProduct(item);
                    }
                  }}
                >
                  {loadImage ? (
                    <div
                      className={`carousel-slide-media ${
                        kenBurnsEnabled && isActiveSlide ? 'carousel-slide-ken-burns' : ''
                      } ${autoplayPaused ? 'paused' : ''}`}
                      style={{
                        backgroundImage: `url(${imgSrc})`,
                        backgroundPosition: `${focusX}% ${focusY}%`,
                        '--focus-x': `${focusX}%`,
                        '--focus-y': `${focusY}%`,
                      }}
                      aria-hidden="true"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[var(--bg-elevated)]" aria-hidden="true" />
                  )}
                  <div
                    className="absolute inset-0"
                    style={{
                      background: lang === 'ar'
                        ? `linear-gradient(260deg, rgba(18,11,38,0.82) 0%, rgba(18,11,38,0.42) 45%, rgba(18,11,38,0.06) 100%),
                           linear-gradient(0deg, rgba(18,11,38,0.5) 0%, transparent 45%)`
                        : `linear-gradient(100deg, rgba(18,11,38,0.82) 0%, rgba(18,11,38,0.42) 45%, rgba(18,11,38,0.06) 100%),
                           linear-gradient(0deg, rgba(18,11,38,0.5) 0%, transparent 45%)`,
                    }}
                  />

                  <div
                    className={`absolute inset-0 flex flex-col justify-end p-4 sm:p-5 md:p-10 ${
                      lang === 'ar' ? 'items-end text-right' : 'items-start text-left'
                    }`}
                  >
                    {(() => {
                      const badgeText = resolveCarouselBadge(item, lang);
                      if (!badgeText) return null;
                      return (
                        <div
                          className={`inline-flex items-center gap-1.5 mb-3 rounded-full border px-3 py-1 text-[10px] sm:text-[11px] font-bold tracking-wide ${
                            lang === 'ar' ? 'text-right' : 'text-left'
                          }`}
                          style={{
                            color: 'var(--accent-2)',
                            borderColor: 'color-mix(in srgb, var(--accent-2) 35%, transparent)',
                            background: 'color-mix(in srgb, var(--accent-2) 8%, transparent)',
                          }}
                        >
                          <span
                            className="inline-block w-1.5 h-1.5 rounded-full"
                            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))' }}
                            aria-hidden="true"
                          />
                          {badgeText}
                        </div>
                      );
                    })()}
                    <h2
                      className="section-heading font-black leading-[1.05] tracking-tight text-white mb-2 max-w-[min(640px,90vw)]"
                      style={{
                        fontSize: 'clamp(1.75rem, 6.5vw, 3.75rem)',
                        textShadow: '0 2px 24px rgba(0,0,0,0.6)',
                      }}
                    >
                      {lang === 'ar' ? item.name_ar : item.name_en}
                    </h2>
                    {(() => {
                      const description = brandUserText(
                        (lang === 'ar' ? item.description_ar : item.description_en)?.trim(),
                      );
                      if (!description) return null;
                      return (
                        <p className="text-white/80 text-sm sm:text-base max-w-[min(520px,88vw)] leading-relaxed line-clamp-3 sm:line-clamp-4">
                          {description}
                        </p>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => embla?.scrollPrev()}
          className="absolute left-3 sm:left-4 md:left-5 top-1/2 z-20 -translate-y-1/2 flex h-9 w-9 md:h-11 md:w-11 items-center justify-center rounded-full border border-[var(--carousel-nav-border)] bg-[var(--carousel-nav-bg)] backdrop-blur-sm text-[var(--carousel-nav-text)] transition-all duration-200 hover:border-[var(--carousel-nav-border-hover)] hover:bg-[var(--carousel-nav-bg-hover)] hover:scale-110 active:scale-95 shadow-[0_2px_16px_rgba(0,0,0,0.5)]"
          aria-label={t.carouselPreviousAria}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => embla?.scrollNext()}
          className="absolute right-3 sm:right-4 md:right-5 top-1/2 z-20 -translate-y-1/2 flex h-9 w-9 md:h-11 md:w-11 items-center justify-center rounded-full border border-[var(--carousel-nav-border)] bg-[var(--carousel-nav-bg)] backdrop-blur-sm text-[var(--carousel-nav-text)] transition-all duration-200 hover:border-[var(--carousel-nav-border-hover)] hover:bg-[var(--carousel-nav-bg-hover)] hover:scale-110 active:scale-95 shadow-[0_2px_16px_rgba(0,0,0,0.5)]"
          aria-label={t.carouselNextAria}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
      )}

      {slides.length > 0 && (
      <div
        className="carousel-strip relative"
        style={{
          background: 'transparent',
          '--carousel-logo-color': logoLineColor || undefined,
        }}
      >
        <div className="carousel-strip-top-line absolute top-0 left-0 right-0 h-px pointer-events-none" />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'var(--carousel-strip-bg)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
          }}
        />

        <div className="relative flex overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory py-1" dir="ltr">
          {slides.map((item, index) => {
            const isActive = index === activeSlide;
            const logoSrc = getLogo(item);
            const logoPresetSrc = logoSrc ? presetImageUrl(logoSrc, 'carouselLogo') : null;
            const slideLabel = brandUserText(lang === 'ar' ? item.name_ar : item.name_en);
            const initial = slideLabel.trim().charAt(0).toUpperCase() || '?';
            return (
              <React.Fragment key={item.id}>
                <div className="relative flex-shrink-0 flex flex-col items-center">
                  <button
                    type="button"
                    onClick={() => embla?.scrollTo(index)}
                    className={`carousel-thumb group relative flex flex-col items-center gap-1 px-2 py-2 sm:px-3 sm:py-2.5 min-w-[70px] sm:min-w-[84px] max-w-[96px] transition-all duration-300 snap-start hover:bg-[var(--carousel-thumb-hover-bg)] overflow-hidden touch-manipulation ${
                      isActive ? 'carousel-thumb--active' : ''
                    }`}
                    aria-label={formatMessage(t.carouselGoToSlideAria, { name: slideLabel })}
                    aria-current={isActive ? 'true' : undefined}
                  >
                    {isActive && (
                      <div
                        className="absolute top-0 left-0 right-0 h-px transition-colors duration-500"
                        style={{ background: logoLineColor || 'var(--accent)' }}
                      />
                    )}
                    <div
                      className={`carousel-thumb__icon h-9 w-9 sm:h-10 sm:w-10 rounded-xl flex items-center justify-center overflow-hidden transition-all duration-300 ${
                        isActive ? 'scale-105' : 'opacity-40 group-hover:opacity-70'
                      }`}
                      style={{
                        background: isActive ? 'var(--carousel-thumb-icon-bg-active)' : 'var(--carousel-thumb-icon-bg)',
                      }}
                    >
                      {logoPresetSrc ? (
                        <img
                          ref={(el) => {
                            if (el) logoImgRefs.current[item.id] = el;
                            else delete logoImgRefs.current[item.id];
                          }}
                          src={logoPresetSrc}
                          alt=""
                          width={40}
                          height={40}
                          loading="lazy"
                          decoding="async"
                          crossOrigin={isCanvasSafeUrl(logoPresetSrc) ? 'anonymous' : undefined}
                          className="h-full w-full object-contain p-1"
                          onLoad={() => {
                            if (index === activeSlide) resolveActiveLogoColor(item);
                          }}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const fallback = e.currentTarget.nextElementSibling;
                            if (fallback) fallback.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <span
                        className={`carousel-thumb__initial h-full w-full items-center justify-center text-sm font-black text-[var(--carousel-thumb-text)] ${
                          logoPresetSrc ? 'hidden' : 'flex'
                        }`}
                      >
                        {initial}
                      </span>
                    </div>
                    <span
                      className={`carousel-thumb__label text-[10px] sm:text-[11px] font-semibold text-center leading-tight truncate whitespace-nowrap w-full px-0.5 transition-colors duration-300 ${
                        isActive ? 'text-[var(--carousel-thumb-text)]' : 'text-[var(--carousel-thumb-text-muted)] group-hover:text-[var(--carousel-thumb-text-hover)]'
                      }`}
                    >
                      {slideLabel}
                    </span>
                  </button>
                  {isAdmin && (
                    <div className="flex items-center gap-0.5 pb-1">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onMoveCarouselGame?.(item.id, -1); }}
                        disabled={index === 0}
                        className="p-1 rounded text-[var(--carousel-thumb-text-muted)] hover:text-[var(--accent)] disabled:opacity-20"
                        aria-label="Move left"
                      >
                        <ChevronUp className="w-3 h-3 rotate-[-90deg]" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onEditGame?.(item); }}
                        className="p-1 rounded text-[var(--accent)]/70 hover:text-[var(--accent)] text-[9px] font-bold"
                      >
                        {t.edit}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onMoveCarouselGame?.(item.id, 1); }}
                        disabled={index === slides.length - 1}
                        className="p-1 rounded text-[var(--carousel-thumb-text-muted)] hover:text-[var(--accent)] disabled:opacity-20"
                        aria-label="Move right"
                      >
                        <ChevronDown className="w-3 h-3 rotate-[-90deg]" />
                      </button>
                    </div>
                  )}
                </div>
              </React.Fragment>
            );
          })}

          {isAdmin && onPickCarouselGame && (
            <div className="relative flex-shrink-0 flex flex-col items-center snap-start">
              <button
                type="button"
                onClick={onPickCarouselGame}
                className="group relative flex flex-col items-center justify-center gap-1 px-4 py-3 sm:px-5 sm:py-4 min-w-[80px] sm:min-w-[96px] transition-all duration-300 snap-start hover:bg-[var(--carousel-thumb-hover-bg)]"
                aria-label={t.addToCarousel}
              >
                <div className="h-8 sm:h-10 flex items-center justify-center px-1.5 transition-all duration-300 opacity-50 group-hover:opacity-100 group-hover:scale-[1.02]">
                  <Plus
                    className="w-7 h-7 sm:w-8 sm:h-8 text-[var(--accent)] transition-all duration-300"
                    style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}
                    strokeWidth={2.25}
                  />
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
      )}
    </section>
  );
}