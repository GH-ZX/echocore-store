import React, { useEffect, useState, useCallback } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight, ShoppingCart, Gamepad2, Gift } from 'lucide-react';

const AUTOPLAY_MS = 6000;
const TICK_MS = 40;

export default function ProductCarousel({ products, t = {}, lang, onSelectProduct }) {
  const gameSlides = products.filter((p) => p.category === 'games');
  const slides = gameSlides.length ? gameSlides : products;

  const placeholderLogo = new URL('../assets/placeholder-logo.png', import.meta.url).href;
  const placeholderCover = new URL('../assets/placeholder-cover.png', import.meta.url).href;

  const [emblaRef, embla] = useEmblaCarousel({ 
    loop: true, 
    skipSnaps: false,
    align: 'start',
    containScroll: 'trimSnaps'
  });
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [accent, setAccent] = useState({ r: 34, g: 211, b: 238 });
  const [logoAccent, setLogoAccent] = useState({ r: 34, g: 211, b: 238 });

  // Single combined timer — resets on slide change or pause toggle
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

  // Track active slide
  useEffect(() => {
    if (!embla) return;
    const onSelect = () => setActiveSlide(embla.selectedScrollSnap());
    onSelect();
    embla.on('select', onSelect);
    return () => embla.off('select', onSelect);
  }, [embla]);

  // Extract dominant color from slide image
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
        // Boost vivid channel
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
        // Boost vivid channel
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
    const src = item.image || (item.coverFile
      ? (() => { try { return new URL(`../assets/${item.coverFile}`, import.meta.url).href; } catch { return placeholderCover; } })()
      : placeholderCover);
    extractColor(src);
    // Extract color from logo for the bottom strip's active indicator line
    const logoSrc = item.logo_url || (item.logoFile
      ? (() => { try { return new URL(`../assets/${item.logoFile}`, import.meta.url).href; } catch { return placeholderLogo; } })()
      : (item.logo || placeholderLogo));
    extractLogoColor(logoSrc);
  }, [activeSlide]);

  const getImg = (item) => {
    if (item.image_url) return item.image_url;
    if (item.image) return item.image;
    if (item.coverFile) try { return new URL(`../assets/${item.coverFile}`, import.meta.url).href; } catch {}
    return placeholderCover;
  };

  const getLogo = (item) => {
    // Bottom carousel strip should ALWAYS prefer a small logo, NEVER the full cover photo.
    if (item.logo_url) return item.logo_url;
    if (item.logoFile) try { return new URL(`../assets/${item.logoFile}`, import.meta.url).href; } catch {}
    // Do NOT fall back to image_url here — that would show the full photo.
    // Use dedicated placeholder instead.
    return item.logo || placeholderLogo;
  };

  const ac = (a) => `rgba(${accent.r},${accent.g},${accent.b},${a})`;
  const acSolid = `rgb(${accent.r},${accent.g},${accent.b})`;
  const logoAcSolid = `rgb(${logoAccent.r},${logoAccent.g},${logoAccent.b})`;
  const isDark = (accent.r * 0.299 + accent.g * 0.587 + accent.b * 0.114) > 160;
  const textOnAccent = isDark ? '#060b19' : '#ffffff';

  const pad = (n) => String(n + 1).padStart(2, '0');

  const currentItem = slides[activeSlide] || slides[0];

  return (
    <section
      className="mt-8 rounded-2xl overflow-hidden"
      style={{
        boxShadow: `0 0 0 1px ${ac(0.2)}, 0 8px 60px ${ac(0.12)}, 0 20px 100px ${ac(0.06)}`,
        transition: 'box-shadow 0.8s ease',
      }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* ── Slide area ── */}
      <div className="relative">
        {/* Progress bar */}
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

        {/* Slide counter */}
        <div
          className="absolute top-5 right-5 z-20 select-none pointer-events-none"
          style={{ fontFamily: 'ui-monospace, monospace' }}
        >
          <span className="text-2xl font-black text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)]">
            {pad(activeSlide)}
          </span>
          <span className="text-white/30 text-sm mx-1.5">/</span>
          <span className="text-white/30 text-sm">{pad(slides.length - 1)}</span>
        </div>

        {/* Embla viewport */}
        <div className="overflow-hidden" ref={emblaRef} dir="ltr">
          <div className="flex" dir="ltr">
            {slides.map((item) => (
              <div
                key={item.id}
                className="relative flex-none w-full overflow-hidden cursor-pointer"
                style={{ 
                  height: 'clamp(380px, 68vh, 780px)',
                  backgroundImage: `url(${getImg(item)})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
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
                {/* Gradient overlays */}
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

                {/* Accent color corner glow */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: lang === 'ar'
                      ? `radial-gradient(ellipse at 95% 80%, ${ac(0.12)} 0%, transparent 55%)`
                      : `radial-gradient(ellipse at 5% 80%, ${ac(0.12)} 0%, transparent 55%)`,
                    transition: 'background 0.8s ease',
                  }}
                />

                {/* Slide content */}
                <div
                  className={`absolute inset-0 flex flex-col justify-end p-5 md:p-10 ${
                    lang === 'ar' ? 'items-end text-right' : 'items-start text-left'
                  }`}
                >
                  {/* Badges */}
                  <div className={`flex items-center gap-2.5 mb-4 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
                    <span
                      className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] rounded-full px-3 py-1.5"
                      style={{
                        background: ac(0.18),
                        border: `1px solid ${ac(0.5)}`,
                        color: acSolid,
                        transition: 'background 0.6s ease, border-color 0.6s ease, color 0.6s ease',
                      }}
                    >
                      {item.category === 'games'
                        ? <Gamepad2 className="w-3 h-3" />
                        : <Gift className="w-3 h-3" />}
                      {item.category === 'games'
                        ? (t.game || (lang === 'ar' ? 'ألعاب' : 'Game'))
                        : (t.digitalCard || (lang === 'ar' ? 'بطاقات رقمية' : 'Digital Card'))}
                    </span>
                    {item.price > 0 && (
                      <span className="text-[11px] font-bold rounded-full px-3 py-1.5 bg-white/[0.12] border border-white/20 text-white backdrop-blur-sm">
                        ${parseFloat(item.price).toFixed(2)}
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h2
                    className="font-black leading-[0.88] tracking-tight text-white mb-4 max-w-[640px]"
                    style={{
                      fontSize: 'clamp(1.9rem, 8vw, 4.5rem)',
                      textShadow: '0 2px 24px rgba(0,0,0,0.6)',
                    }}
                  >
                    {lang === 'ar' ? item.name_ar : item.name_en}
                  </h2>

                  {/* Real per-game description */}
                  <p className="text-white/70 text-sm mb-5 max-w-[420px] leading-relaxed">
                    {(lang === 'ar' ? item.description_ar : item.description_en) || (lang === 'ar' ? 'اكتشف عروض الشحن الحصرية لهذه اللعبة.' : 'Discover exclusive top-up offers for this game.')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Prev / Next */}
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

      {/* ── Thumbnail strip ── */}
      <div
        className="relative"
        style={{
          background: 'transparent',
          boxShadow: '0 1px 0 rgba(255,255,255,0.05), 0 -8px 20px rgba(0,0,0,0.4)',
        }}
      >
        {/* Ambient color wash from above (photo color tint) */}
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

        {/* Black filter + blur on the entire bottom strip (shared photo from section) */}
        <div 
          className="absolute inset-0" 
          style={{ 
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.88) 100%)',
            backdropFilter: 'blur(18px)'
          }} 
        />

        <div className="relative flex overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory">
          {slides.map((item, index) => {
            const isActive = index === activeSlide;
            const logoSrc = getLogo(item);
            return (
              <React.Fragment key={item.id}>
                <button
                  type="button"
                  onClick={() => embla?.scrollTo(index)}
                  className="group relative flex-shrink-0 flex flex-col items-center gap-1 px-4 py-3 sm:px-5 sm:py-4 min-w-[80px] sm:min-w-[96px] transition-all duration-300 snap-start hover:bg-white/[0.03]"
                  style={{
                    borderTopColor: isActive ? logoAcSolid : 'transparent',
                    background: isActive ? 'rgba(255,255,255,0.04)' : 'transparent',
                    boxShadow: isActive ? `0 4px 12px ${ac(0.1)}` : 'none',
                    transition: 'border-top-color 0.4s ease, background 0.3s ease, box-shadow 0.3s ease',
                  }}
                  aria-label={lang === 'ar' ? `انتقل الى ${item.name_ar}` : `Switch to ${item.name_en}`}
                >
                  {/* Logo (bottom strip) — always a logo, never the full cover photo */}
                  <div
                    className="h-8 sm:h-10 flex items-center justify-center px-1.5 transition-all duration-300 group-hover:brightness-110 group-hover:scale-[1.02]"
                    style={{ 
                      opacity: isActive ? 1 : 0.32, 
                      transform: isActive ? 'scale(1.08)' : 'scale(1)'
                    }}
                  >
                    <img
                      src={logoSrc}
                      alt={item.name_en}
                      className="h-full w-auto max-w-[70px] object-contain transition-all duration-300"
                      style={{ 
                        filter: isActive 
                          ? `drop-shadow(0 1px 2px rgba(0,0,0,0.5)) drop-shadow(0 0 2px ${logoAcSolid})` 
                          : 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' 
                      }}
                      onError={(e) => { e.currentTarget.src = placeholderLogo; }}
                    />
                  </div>

                  {/* Active theme-colored underline bar */}
                  {isActive && (
                    <div
                      className="h-[2px] w-8 rounded-full mt-1.5"
                      style={{ 
                        background: logoAcSolid
                      }}
                    />
                  )}

                  {/* Active dot */}
                  {isActive && (
                    <div
                      className="absolute bottom-1.5 rounded-full w-1 h-1"
                      style={{ background: acSolid }}
                    />
                  )}
                </button>

                {/* Separator line between bottom items, colored with active game's theme */}
                {index < slides.length - 1 && (
                  <div 
                    className="flex-shrink-0 self-center w-px h-5 mx-0.5 rounded-full"
                    style={{ 
                      background: `linear-gradient(to bottom, transparent, ${acSolid}, transparent)`, 
                      opacity: 0.4 
                    }} 
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </section>
  );
}
