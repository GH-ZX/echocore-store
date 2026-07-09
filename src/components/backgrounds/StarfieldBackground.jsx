import { useEffect, useRef } from 'react';
import './StoreBackgrounds.css';

function readCssNum(name, fallback) {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const value = parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

function readAccentRgb() {
  if (typeof document === 'undefined') return { r: 34, g: 211, b: 238 };
  const hex = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  if (!hex.startsWith('#') || hex.length < 7) return { r: 34, g: 211, b: 238 };
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

export default function StarfieldBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let raf = 0;
    let stars = [];
    let accent = readAccentRgb();
    let isVisible = !document.hidden;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const area = window.innerWidth * window.innerHeight;
      const count = Math.min(220, Math.floor(area / 9000) + 40);

      stars = Array.from({ length: count }, () => {
        const depth = 0.25 + Math.random() * 0.75;
        return {
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          depth,
          r: (0.4 + Math.random() * 1.6) * depth,
          vy: (0.15 + Math.random() * 0.55) * depth,
          twinkle: Math.random() * Math.PI * 2,
          twinkleSpeed: 0.015 + Math.random() * 0.03,
          tinted: Math.random() < 0.22,
        };
      });
    };

    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!isVisible) return;

      const opacity = readCssNum('--bg-effect-opacity', 0.55);
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      stars.forEach((star) => {
        star.y += star.vy;
        star.twinkle += star.twinkleSpeed;
        if (star.y > h + 4) {
          star.y = -4;
          star.x = Math.random() * w;
        }

        const twinkle = 0.55 + Math.sin(star.twinkle) * 0.35;
        const alpha = twinkle * opacity * (0.35 + star.depth * 0.65);

        if (star.tinted) {
          ctx.fillStyle = `rgba(${accent.r},${accent.g},${accent.b},${alpha})`;
        } else {
          ctx.fillStyle = `rgba(255,255,255,${alpha * 0.85})`;
        }

        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();

        if (star.depth > 0.7 && star.r > 1.1) {
          ctx.globalAlpha = alpha * 0.35;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.r * 2.8, 0, Math.PI * 2);
          ctx.fillStyle = star.tinted
            ? `rgba(${accent.r},${accent.g},${accent.b},0.5)`
            : 'rgba(255,255,255,0.4)';
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      });
    };

    const onTheme = () => { accent = readAccentRgb(); };
    const onVisibility = () => { isVisible = !document.hidden; };

    resize();
    draw();
    window.addEventListener('resize', resize);
    window.addEventListener('themechange', onTheme);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('themechange', onTheme);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div className="store-bg store-bg-starfield" aria-hidden="true">
      <canvas ref={canvasRef} className="store-bg-starfield-canvas" />
      <div className="store-bg-starfield-glow" />
      <div className="store-bg-starfield-vignette" />
    </div>
  );
}