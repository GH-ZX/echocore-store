import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight, Settings2, ChevronUp, ChevronDown, Plus } from 'lucide-react';
import AdminEditButton from '../../components/admin/AdminEditButton';

import { brandUserText } from '../../lib/branding';
import { presetImageUrl } from '../../lib/imageUtils';

const AUTOPLAY_MS = 6000;
const DEFAULT_ACCENT = { r: 34, g: 211, b: 238 };

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
  const [accent, setAccent] = useState(DEFAULT_ACCENT);
  const [logoAccent, setLogoAccent] = useState(DEFAULT_ACCENT);
  const [kenBurnsEnabled, setKenBurnsEnabled] = useState(false);
  const colorJobRef = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px) and (prefers-reduced-motion: no-preference)');
    const sync = () => setKenBurnsEnabled(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!embla || isPaused) return;
    const timer = setTimeout(() => {
      embla.scrollNext();
    }, AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [embla, activeSlide, isPaused]);

  useEffect(() => {
    if (!embla) return;
    const onSelect = () => setActiveSlide(embla.selectedScrollSnap());
    onSelect();
    embla.on('select', onSelect);
    return () => embla.off('select', onSelect);
  }, [embla]);

  const extractAverageColor = useCallback((src, setter) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 24;
        canvas.height = 24;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 24, 24);
        const d = ctx.getImageData(0, 0, 24, 24).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        const raw = { r: r / n, g: g / n, b: b / n };
        const mx = Math.max(raw.r, raw.g, raw.b);
        const boost = mx > 30 ? Math.min(255 / mx, 2.2) : 1;
        setter({
          r: Math.min(255, Math.round(raw.r * boost)),
          g: Math.min(255, Math.round(raw.g * boost)),
          b: Math.min(255, Math.round(raw.b * boost)),
        });
      } catch {
        setter(DEFAULT_ACCENT);
      }
    };
    img.onerror = () => setter(DEFAULT_ACCENT);
    img.src = src;
  }, []);

  useEffect(() => {
    const item = slides[activeSlide];
    if (!item) return;

    const jobId = ++colorJobRef.current;
    const timer = window.setTimeout(() => {
      if (colorJobRef.current !== jobId) return;
      const coverSrc = presetImageUrl(
        item.image_url || item.image || placeholderCover,
        'colorSample',
      );
      const logoSrc = item.logo_url || item.logo;
      extractAverageColor(coverSrc, setAccent);
      if (logoSrc) {
        extractAverageColor(presetImageUrl(logoSrc, 'colorSample'), setLogoAccent);
      } else {
        setLogoAccent(DEFAULT_ACCENT);
      }
    }, 120);

    return () => window.clearTimeout(timer);
  }, [activeSlide, slides, extractAverageColor, placeholderCover]);

  const getCoverUrl = useCallback(
    (item) => presetImageUrl(item.image_url || item.image || placeholderCover, 'carouselCover'),
    [placeholderCover],
  );

  const getLogo = useCallback(
    (item) => item.logo_url || item.logo || null,
    [],
  );

  const ac = (a) => `rgba(${accent.r},${accent.g},${accent.b},${a})`;
  const acSolid = `rgb(${accent.r},${accent.g},${accent.b})`;
  const logoAcSolid = `rgb(${logoAccent.r},${logoAccent.g},${logoAccent.b})`;

  const currentItem = slides[activeSlide] || slides[0];
  const slideCount = slides.length;

  const sectionClassName = useMemo(
    () => 'mt-4 sm:mt-8 relative overflow-hidden rounded-[20px] border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.35)]',
    [],
  );

  return (
    <section
      className={sectionClassName}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      aria-label={lang === 'ar' ? 'سلايدر الألعاب المميزة' : 'Featured games carousel'}
    >
      {isAdmin && (
        <div className="absolute top-3 left-3 z-40 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onManageCarousel?.(); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/40 bg-black/60 backdrop-blur-md px-3 py-1.5 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-all"
          >
            <Settings2 className="w-3.5 h-3.5" />
            {t.manageCarousel || 'Manage Carousel'}
          </button>
          {currentItem && (
            <AdminEditButton
              label={t.editSlide || 'Edit Slide'}
              onClick={() => onEditGame?.(currentItem)}
              className="bg-black/60 backdrop-blur-md"
            />
          )}
        </div>
      )}

      {slides.length === 0 && isAdmin && onPickCarouselGame ? (
        <div className="p-6 sm:p-8 text-center space-y-4">
          <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto">
            {lang === 'ar'
              ? 'لا توجد شرائح في الكاروسيل. اختر من الألعاب الموجودة في المتجر.'
              : 'No carousel slides yet. Pick from games already in your store.'}
          </p>
          <button
            type="button"
            onClick={onPickCarouselGame}
            className="btn btn-primary inline-flex items-center gap-2 min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            {t.addToCarousel || (lang === 'ar' ? 'إضافة إلى الكاروسيل' : 'Add to carousel')}
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
            className={`carousel-progress-bar ${isPaused ? 'paused' : ''}`}
            style={{
              background: acSolid,
              boxShadow: `0 0 12px ${acSolid}`,
              transition: 'background 0.6s ease, box-shadow 0.6s ease',
            }}
          />
        </div>

        <div className="overflow-hidden" ref={emblaRef} dir="ltr">
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
                      } ${isPaused ? 'paused' : ''}`}
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
                        ? `linear-gradient(260deg, rgba(6,11,25,0.75) 0%, rgba(6,11,25,0.35) 45%, rgba(6,11,25,0.05) 100%),
                           linear-gradient(0deg, rgba(6,11,25,0.45) 0%, transparent 45%)`
                        : `linear-gradient(100deg, rgba(6,11,25,0.75) 0%, rgba(6,11,25,0.35) 45%, rgba(6,11,25,0.05) 100%),
                           linear-gradient(0deg, rgba(6,11,25,0.45) 0%, transparent 45%)`,
                    }}
                  />
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: lang === 'ar'
                        ? `radial-gradient(ellipse at 95% 80%, ${ac(0.12)} 0%, transparent 55%)`
                        : `radial-gradient(ellipse at 5% 80%, ${ac(0.12)} 0%, transparent 55%)`,
                      transition: 'background 0.8s ease',
                    }}
                  />
                  <div
                    className={`absolute inset-0 flex flex-col justify-end p-4 sm:p-5 md:p-10 ${
                      lang === 'ar' ? 'items-end text-right' : 'items-start text-left'
                    }`}
                  >
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
          className="absolute left-3 sm:left-4 md:left-5 top-1/2 z-20 -translate-y-1/2 flex h-9 w-9 md:h-11 md:w-11 items-center justify-center rounded-full border border-white/20 bg-black/50 backdrop-blur-sm text-white transition-all duration-200 hover:border-white/50 hover:bg-black/70 hover:scale-110 active:scale-95 shadow-[0_2px_16px_rgba(0,0,0,0.5)]"
          aria-label={lang === 'ar' ? 'السابق' : 'Previous'}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => embla?.scrollNext()}
          className="absolute right-3 sm:right-4 md:right-5 top-1/2 z-20 -translate-y-1/2 flex h-9 w-9 md:h-11 md:w-11 items-center justify-center rounded-full border border-white/20 bg-black/50 backdrop-blur-sm text-white transition-all duration-200 hover:border-white/50 hover:bg-black/70 hover:scale-110 active:scale-95 shadow-[0_2px_16px_rgba(0,0,0,0.5)]"
          aria-label={lang === 'ar' ? 'التالي' : 'Next'}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
      )}

      {slides.length > 0 && (
      <div
        className="relative"
        style={{
          background: 'transparent',
          boxShadow: '0 1px 0 rgba(255,255,255,0.05), 0 -8px 20px rgba(0,0,0,0.4)',
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at 50% 0%, ${ac(0.3)} 0%, transparent 50%)`,
            transition: 'background 0.8s ease',
          }}
        />
        <div
          className="absolute top-0 left-0 right-0 h-[1px] opacity-40 pointer-events-none"
          style={{ background: `linear-gradient(90deg, transparent, ${acSolid}, transparent)`, transition: 'background 0.6s ease' }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-[1px] opacity-25 pointer-events-none"
          style={{ background: `linear-gradient(90deg, transparent, ${acSolid}, transparent)`, transition: 'background 0.6s ease' }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.88) 100%)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
          }}
        />

        <div className="relative flex overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory" dir="ltr">
          {slides.map((item, index) => {
            const isActive = index === activeSlide;
            const logoSrc = getLogo(item);
            const logoPresetSrc = logoSrc ? presetImageUrl(logoSrc, 'carouselLogo') : null;
            const slideLabel = lang === 'ar' ? item.name_ar : item.name_en;
            return (
              <React.Fragment key={item.id}>
                <div className="relative flex-shrink-0 flex flex-col items-center">
                  <button
                    type="button"
                    onClick={() => embla?.scrollTo(index)}
                    className="group relative flex flex-col items-center gap-1 px-4 py-3 sm:px-5 sm:py-4 min-w-[80px] sm:min-w-[96px] transition-all duration-300 snap-start hover:bg-white/[0.03] overflow-hidden"
                    style={{
                      background: isActive ? 'rgba(255,255,255,0.04)' : 'transparent',
                      boxShadow: isActive ? `0 4px 12px ${ac(0.1)}` : 'none',
                      transition: 'background 0.3s ease, box-shadow 0.3s ease',
                    }}
                    aria-label={lang === 'ar' ? `انتقل الى ${item.name_ar}` : `Switch to ${item.name_en}`}
                  >
                    {isActive && (
                      <div
                        className="absolute top-0 left-0 right-0 h-px"
                        style={{
                          background: logoAcSolid,
                          boxShadow: `0 0 6px ${logoAcSolid}`,
                        }}
                      />
                    )}
                    <div
                      className="h-8 sm:h-10 flex items-center justify-center px-1.5 transition-all duration-300 group-hover:brightness-110 group-hover:scale-[1.02]"
                      style={{
                        opacity: isActive ? 1 : 0.32,
                        transform: isActive ? 'scale(1.08)' : 'scale(1)',
                      }}
                    >
                      {logoPresetSrc ? (
                        <img
                          src={logoPresetSrc}
                          alt=""
                          width={70}
                          height={40}
                          loading="lazy"
                          decoding="async"
                          className="block h-8 sm:h-10 w-auto max-w-[70px] object-contain transition-all duration-300"
                          style={{
                            filter: isActive
                              ? `drop-shadow(0 1px 2px rgba(0,0,0,0.5)) drop-shadow(0 0 2px ${logoAcSolid})`
                              : 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))',
                          }}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const fallback = e.currentTarget.nextElementSibling;
                            if (fallback) fallback.style.display = 'block';
                          }}
                        />
                      ) : null}
                      <span
                        className={`carousel-slide-logo-fallback text-[10px] sm:text-[11px] font-bold text-white/90 text-center leading-tight line-clamp-2 max-w-[72px] ${
                          logoPresetSrc ? 'hidden' : 'block'
                        }`}
                      >
                        {slideLabel}
                      </span>
                    </div>
                  </button>
                  {isAdmin && (
                    <div className="flex items-center gap-0.5 pb-1">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onMoveCarouselGame?.(item.id, -1); }}
                        disabled={index === 0}
                        className="p-1 rounded text-white/50 hover:text-[var(--accent)] disabled:opacity-20"
                        aria-label="Move left"
                      >
                        <ChevronUp className="w-3 h-3 rotate-[-90deg]" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onEditGame?.(item); }}
                        className="p-1 rounded text-[var(--accent)]/70 hover:text-[var(--accent)] text-[9px] font-bold"
                      >
                        {t.edit || 'Edit'}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onMoveCarouselGame?.(item.id, 1); }}
                        disabled={index === slides.length - 1}
                        className="p-1 rounded text-white/50 hover:text-[var(--accent)] disabled:opacity-20"
                        aria-label="Move right"
                      >
                        <ChevronDown className="w-3 h-3 rotate-[-90deg]" />
                      </button>
                    </div>
                  )}
                </div>

                {index < slides.length - 1 && (
                  <div
                    className="flex-shrink-0 self-center w-px h-5 mx-0.5 rounded-full"
                    style={{
                      background: `linear-gradient(to bottom, transparent, ${acSolid}, transparent)`,
                      opacity: 0.4,
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}

          {isAdmin && onPickCarouselGame && (
            <div className="relative flex-shrink-0 flex flex-col items-center snap-start">
              <button
                type="button"
                onClick={onPickCarouselGame}
                className="group relative flex flex-col items-center justify-center gap-1 px-4 py-3 sm:px-5 sm:py-4 min-w-[80px] sm:min-w-[96px] transition-all duration-300 snap-start hover:bg-white/[0.03]"
                aria-label={t.addToCarousel || (lang === 'ar' ? 'إضافة إلى الكاروسيل' : 'Add to carousel')}
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