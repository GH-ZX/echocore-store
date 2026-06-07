import React, { useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { Gift, Gamepad2 } from 'lucide-react';
import heroImage from '../assets/hero.png';

export default function ProductCarousel({ products, lang, onSelectProduct }) {
  const gameSlides = products.filter((product) => product.category === 'games');
  const slides = gameSlides.length ? gameSlides : products;
  const placeholderLogo = new URL('../assets/placeholder-logo.png', import.meta.url).href;
  const placeholderCover = new URL('../assets/placeholder-cover.png', import.meta.url).href;
  const [emblaRef, embla] = useEmblaCarousel({ loop: true, skipSnaps: false });
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    if (!embla) return;
    const onSelect = () => setActiveSlide(embla.selectedScrollSnap());
    onSelect();
    embla.on('select', onSelect);
    return () => embla.off('select', onSelect);
  }, [embla, slides.length]);

  useEffect(() => {
    if (!embla) return;
    const autoplay = window.setInterval(() => embla.scrollNext(), 10000);
    return () => window.clearInterval(autoplay);
  }, [embla]);

  return (
    <section className="mt-8 rounded-[2rem] border border-slate-800 bg-[#060b19] p-4 md:p-6 shadow-2xl shadow-cyan-900/20">
      <div className="relative overflow-hidden rounded-[2rem] bg-slate-950 border border-slate-800 shadow-xl">
        <div className="embla__viewport overflow-hidden" ref={emblaRef} dir="ltr">
          <div className="embla__container flex" dir="ltr">
            {slides.map((item) => (
              <div
                key={item.id}
                className="embla__slide relative cursor-pointer h-[36rem] md:h-[44rem] flex-none w-full overflow-hidden"
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
                <img
                  src={
                    item.image || (item.coverFile ? (() => {
                      try { return new URL(`../assets/${item.coverFile}`, import.meta.url).href; } catch { return placeholderCover; }
                    })() : placeholderCover)
                  }
                  alt={lang === 'ar' ? item.name_ar : item.name_en}
                  className="block h-full w-full object-cover brightness-90"
                  onError={(e) => { e.currentTarget.src = placeholderCover; }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
                <div className="absolute left-6 right-6 bottom-24 text-white">
                  <div className="inline-flex items-center gap-3 rounded-full bg-cyan-500/15 px-4 py-2 text-xs uppercase tracking-[0.35em] text-cyan-200">
                    {item.category === 'games'
                      ? lang === 'ar'
                        ? 'ألعاب'
                        : 'Games'
                      : lang === 'ar'
                      ? 'بطاقات رقمية'
                      : 'Digital Cards'}
                  </div>
                  <h2 className="mt-4 text-5xl md:text-6xl font-black leading-tight">
                    {lang === 'ar' ? item.name_ar : item.name_en}
                  </h2>
                  <p className="mt-3 max-w-xl text-slate-200/90 text-sm md:text-base">
                    {lang === 'ar'
                      ? 'عرض منتجات الألعاب المميز مع استعراض سريع للعبة الحالية.'
                      : 'Browse the current featured game product with a clean, rotating carousel.'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 px-4 sm:px-6">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {slides.map((item, index) => {
              let logoSrc = item.logo || (item.image || placeholderLogo);
              if (item.logoFile) {
                try {
                  logoSrc = new URL(`../assets/${item.logoFile}`, import.meta.url).href;
                } catch {
                  logoSrc = item.logo || item.image || placeholderLogo;
                }
              }

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => embla?.scrollTo(index)}
                  className={`group inline-flex items-center justify-center rounded-full border p-1 transition ${
                    index === activeSlide
                      ? 'border-cyan-400 bg-cyan-500/10 text-white'
                      : 'border-slate-700 bg-slate-950/90 text-slate-300 hover:border-cyan-400 hover:text-white'
                  }`}
                  aria-label={lang === 'ar' ? `انتقل الى ${item.name_ar}` : `Switch to ${item.name_en}`}
                >
                  <div className={`flex items-center justify-center rounded-full border border-slate-700 bg-gradient-to-br overflow-hidden p-1`}>
                    {logoSrc ? (
                      <img src={logoSrc} alt={item.name_en} className="h-auto w-auto max-h-12 max-w-[3rem] object-contain" onError={(e) => { e.currentTarget.src = placeholderLogo; }} />
                    ) : item.icon === 'Gift' ? (
                      <Gift className="h-6 w-6 text-white drop-shadow-xl" />
                    ) : (
                      <Gamepad2 className="h-6 w-6 text-white drop-shadow-xl" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => embla?.scrollPrev()}
          className="absolute left-4 top-1/2 z-20 -translate-y-1/2 rounded-full border border-slate-700 bg-slate-950/90 p-3 text-slate-200 shadow-xl shadow-black/20 transition hover:border-cyan-400 hover:text-white"
          aria-label={lang === 'ar' ? 'السابق' : 'Previous'}
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => embla?.scrollNext()}
          className="absolute right-4 top-1/2 z-20 -translate-y-1/2 rounded-full border border-slate-700 bg-slate-950/90 p-3 text-slate-200 shadow-xl shadow-black/20 transition hover:border-cyan-400 hover:text-white"
          aria-label={lang === 'ar' ? 'التالي' : 'Next'}
        >
          ›
        </button>
      </div>
    </section>
  );
}
