import { useEffect, useRef } from 'react';
import './StoreBackgrounds.css';

function readCssNum(name, fallback) {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const value = parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

export default function ParticleBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let raf = 0;
    let particles = [];
    let accent = '#22d3ee';
    let isVisible = !document.hidden;
    let motionSpeed = 1;
    let sizeScale = 1;

    const readMotion = () => {
      motionSpeed = readCssNum('--particles-speed', 1);
      sizeScale = readCssNum('--particles-size', 1);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const density = readCssNum('--particles-density', 1);
      const baseCount = Math.floor((window.innerWidth * window.innerHeight) / 22000);
      const count = Math.min(120, Math.max(12, Math.floor(baseCount * density)));

      particles = Array.from({ length: count }, () => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: (0.6 + Math.random() * 1.8) * sizeScale,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        pulse: Math.random() * Math.PI * 2,
      }));
    };

    const readAccent = () => {
      accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#22d3ee';
    };

    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!isVisible) return;

      const opacity = readCssNum('--bg-effect-opacity', 0.45);
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      particles.forEach((p) => {
        p.x += p.vx * motionSpeed;
        p.y += p.vy * motionSpeed;
        p.pulse += 0.02 * motionSpeed;

        if (p.x < -8) p.x = w + 8;
        if (p.x > w + 8) p.x = -8;
        if (p.y < -8) p.y = h + 8;
        if (p.y > h + 8) p.y = -8;

        const alpha = (0.25 + Math.sin(p.pulse) * 0.15) * opacity;
        ctx.beginPath();
        ctx.fillStyle = accent;
        ctx.globalAlpha = alpha;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.globalAlpha = 1;
    };

    const onTheme = () => {
      readAccent();
      readMotion();
      resize();
    };
    const onVisibility = () => {
      isVisible = !document.hidden;
    };

    readMotion();
    resize();
    readAccent();
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
    <div className="store-bg store-bg-particles" aria-hidden="true">
      <canvas ref={canvasRef} className="store-bg-particles-canvas" />
      <div className="store-bg-particles-vignette" />
    </div>
  );
}