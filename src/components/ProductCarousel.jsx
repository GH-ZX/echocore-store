import React, { useEffect, useState, useCallback } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight, Gamepad2, Gift, Settings2, ChevronUp, ChevronDown, Plus } from 'lucide-react';
import AdminEditButton from './AdminEditButton';
import AdminAddCard from './AdminAddCard';
import BorderGlow from './BorderGlow';

const AUTOPLAY_MS = 6000;
const TICK_MS = 40;

export default function ProductCarousel({
  products,
  t = {},
  lang,
  onSelectProduct,
  isAdmin = false,
  onManageCarousel,
  onEditGame,
  onMoveCarouselGame,
  onAddGame,
}) {
  const gameSlides = products.filter((p) => p.category === 'games');
  const slides = gameSlides.length ? gameSlides : products;

  const placeholderLogo = new URL('../assets/placeholder-logo.png', import.meta.url).href;
  const placeholderCover = new URL('../assets/placeholder-cover.svg', import.meta.url).href;

  const [emblaRef, embla] = useEmblaCarousel({
    loop: true,
    skipSnaps: false,
    align: 'start',
    containScroll: 'trimSnaps',
  });
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [accent, setAccent] = useState({ r: 34, g: 211, b: 238 });
  const [logoAccent, setLogoAccent] = useState({ r: 34, g: 211, b: 238 });

  useEffect(() => {
    if (!embla) return;
    setProgress(0);
    if (isPaused) return;
    const totalTicks = AUTOPLAY_MS / TICK_MS;
    let tick = 0;
    const id = setInterval(() => {
      tick++;
      setProgress(Math.min((tick / totalTicks) * 100, 100));
      if (tick >= totalTicks) embla.scrollNext();
    }, TICK_MS);
    return () => clearInterval(id);
  }, [embla, activeSlide, isPaused]);

  useEffect(() => {
    if (!embla) return;
    const onSelect = () => setActiveSlide(embla.selectedScrollSnap());
    onSelect();
    embla.on('select', onSelect);
    return () => embla.off('select', onSelect);
  }, [embla]);

  const extractColor = useCallback((src) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 48;
        canvas.height = 48;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 48, 48);
        const d = ctx.getImageData(0, 0, 48, 48).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        const raw = { r: r / n, g: g / n, b: b / n };
        const mx = Math.max(raw.r, raw.g, raw.b);
        const boost = mx > 30 ? Math.min(255 / mx, 2.2) : 1;
        setAccent({
          r: Math.min(255, Math.round(raw.r * boost)),
          g: Math.min(255, Math.round(raw.g * boost)),
          b: Math.min(255, Math.round(raw.b * boost)),
        });
      } catch {
        setAccent({ r: 34, g: 211, b: 238 });
      }
    };
    img.onerror = () => setAccent({ r: 34, g: 211, b: 238 });
    img.src = src;
  }, []);

  const extractLogoColor = useCallback((src) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 48;
        canvas.height = 48;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 48, 48);
        const d = ctx.getImageData(0, 0, 48, 48).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        const raw = { r: r / n, g: g / n, b: b / n };
        const mx = Math.max(raw.r, raw.g, raw.b);
        const boost = mx > 30 ? Math.min(255 / mx, 2.2) : 1;
        setLogoAccent({
          r: Math.min(255, Math.round(raw.r * boost)),
          g: Math.min(255, Math.round(raw.g * boost)),
          b: Math.min(255, Math.round(raw.b * boost)),
        });
      } catch {
        setLogoAccent({ r: 34, g: 211, b: 238 });
      }
    };
    img.onerror = () => setLogoAccent({ r: 34, g: 211, b: 238 });
    img.src = src;
  }, []);

  useEffect(() => {
    const item = slides[activeSlide];
    if (!item) return;
    const src = item.image_url || item.image || placeholderCover;
    extractColor(src);
    const logoSrc = item.logo_url || item.logo || placeholderLogo;
    extractLogoColor(logoSrc);
  }, [activeSlide, slides, extractColor, extractLogoColor, placeholderCover, placeholderLogo]);

  const getImg = (item) => item.image_url || item.image || placeholderCover;

  const getLogo = (item) => {
    if (item.logo_url) return item.logo_url;
    return item.logo || placeholderLogo;
  };

  const ac = (a) => `rgba(${accent.r},${accent.g},${accent.b},${a})`;
  const acSolid = `rgb(${accent.r},${accent.g},${accent.b})`;
  const logoAcSolid = `rgb(${logoAccent.r},${logoAccent.g},${logoAccent.b})`;

  const currentItem = slides[activeSlide] || slides[0];

  return (
    <BorderGlow
      className="mt-4 sm:mt-8"
      edgeSensitivity={22}
      borderRadius={20}
      glowRadius={40}
      glowIntensity={0.9}
      coneSpread={28}
      fillOpacity={0.4}
    >
    <section
      className="relative overflow-hidden rounded-[inherit]"
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

      {slides.length === 0 && isAdmin && onAddGame ? (
        <div className="p-4 sm:p-6 md:p-8">
          <div className="max-w-sm mx-auto">
            <AdminAddCard
              variant="game"
              className="w-full"
              ariaLabel={t.addGame || (lang === 'ar' ? 'إضافة لعبة' : 'Add game')}
              onClick={() => onAddGame({ showInCarousel: true })}
            />
          </div>
        </div>
      ) : slides.length > 0 && (
      <div className="relative">
        <div
          className="absolute top-0 left-0 right-0 z-30 h-[3px]"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
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
              const imgSrc = getImg(item);

              return (
                <div
                  key={item.id}
                  className="carousel-slide relative flex-none w-full overflow-hidden cursor-pointer"
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
                  <div
                    className={`absolute inset-[-6%] ${isActiveSlide ? 'carousel-slide-ken-burns' : ''} ${isPaused ? 'paused' : ''}`}
                    style={{
                      backgroundImage: `url(${imgSrc})`,
                      backgroundSize: 'cover',
                      backgroundPosition: `${focusX}% ${focusY}%`,
                      backgroundRepeat: 'no-repeat',
                      '--focus-x': `${focusX}%`,
                      '--focus-y': `${focusY}%`,
                    }}
                    aria-hidden="true"
                  />
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
                    <div className={`flex items-center gap-2.5 mb-4 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5"
                        style={{
                          background: ac(0.18),
                          border: `1px solid ${ac(0.5)}`,
                          color: acSolid,
                          transition: 'background 0.6s ease, border-color 0.6s ease, color 0.6s ease',
                        }}
                      >
                        {item.category === 'games'
                          ? <Gamepad2 className="w-3.5 h-3.5" strokeWidth={2} />
                          : <Gift className="w-3.5 h-3.5" strokeWidth={2} />}
                        {item.category === 'games'
                          ? (t.game || (lang === 'ar' ? 'ألعاب' : 'Games'))
                          : (t.digitalCard || (lang === 'ar' ? 'بطاقات رقمية' : 'Digital cards'))}
                      </span>
                      {item.price > 0 && (
                        <span className="text-[11px] font-bold rounded-full px-3 py-1.5 bg-white/[0.12] border border-white/20 text-white backdrop-blur-sm">
                          ${parseFloat(item.price).toFixed(2)}
                        </span>
                      )}
                    </div>
                    <h2
                      className="section-heading font-black leading-[1.05] tracking-tight text-white mb-3 max-w-[min(640px,90vw)]"
                      style={{
                        fontSize: 'clamp(1.75rem, 6.5vw, 3.75rem)',
                        textShadow: '0 2px 24px rgba(0,0,0,0.6)',
                      }}
                    >
                      {lang === 'ar' ? item.name_ar : item.name_en}
                    </h2>
                    <p className="text-white/75 text-sm sm:text-base max-w-[min(420px,85vw)] leading-relaxed line-clamp-2 sm:line-clamp-3">
                      {(lang === 'ar' ? item.description_ar : item.description_en) || (lang === 'ar' ? 'عروض شحن فورية وآمنة لهذه اللعبة.' : 'Instant, secure top-up offers for this game.')}
                    </p>
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
          className="absolute top-0 left-0 right-0 h-[1px] opacity-40"
          style={{ background: `linear-gradient(90deg, transparent, ${acSolid}, transparent)`, transition: 'background 0.6s ease' }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-[1px] opacity-25"
          style={{ background: `linear-gradient(90deg, transparent, ${acSolid}, transparent)`, transition: 'background 0.6s ease' }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.88) 100%)',
            backdropFilter: 'blur(18px)',
          }}
        />

        <div className="relative flex overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory" dir="ltr">
          {slides.map((item, index) => {
            const isActive = index === activeSlide;
            const logoSrc = getLogo(item);
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
                      <img
                        src={logoSrc}
                        alt={item.name_en}
                        className="h-full w-auto max-w-[70px] object-contain transition-all duration-300"
                        style={{
                          filter: isActive
                            ? `drop-shadow(0 1px 2px rgba(0,0,0,0.5)) drop-shadow(0 0 2px ${logoAcSolid})`
                            : 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))',
                        }}
                        onError={(e) => { e.currentTarget.src = placeholderLogo; }}
                      />
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

          {isAdmin && onAddGame && (
            <div className="relative flex-shrink-0 flex flex-col items-center snap-start">
              <button
                type="button"
                onClick={() => onAddGame({ showInCarousel: true })}
                className="group relative flex flex-col items-center justify-center gap-1 px-4 py-3 sm:px-5 sm:py-4 min-w-[80px] sm:min-w-[96px] transition-all duration-300 snap-start hover:bg-white/[0.03]"
                aria-label={t.addGame || (lang === 'ar' ? 'إضافة لعبة' : 'Add game')}
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
    </section>
    </BorderGlow>
  );
}