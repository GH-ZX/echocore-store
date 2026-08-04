import { useEffect, useState, lazy, Suspense } from 'react';

const MeshGradientBackground = lazy(() => import('./MeshGradientBackground'));
const AuroraBackground = lazy(() => import('./AuroraBackground'));
const DotGridBackground = lazy(() => import('./DotGridBackground'));
const WallpaperBackground = lazy(() => import('./WallpaperBackground'));

export const NEW_BACKGROUND_TYPES = new Set(['mesh', 'aurora', 'dots', 'wallpaper', 'none']);

function readBackgroundType() {
  if (typeof window === 'undefined') return 'mesh';
  const raw = (document.documentElement.getAttribute('data-background-type') || '').trim();
  if (raw && NEW_BACKGROUND_TYPES.has(raw)) return raw;
  const cssVar = getComputedStyle(document.documentElement).getPropertyValue('--background-type').trim();
  if (cssVar && NEW_BACKGROUND_TYPES.has(cssVar)) return cssVar;
  return 'mesh';
}

function BackgroundLayer({ type }) {
  if (type === 'none') return null;
  if (type === 'mesh') return <MeshGradientBackground />;
  if (type === 'aurora') return <AuroraBackground />;
  if (type === 'dots') return <DotGridBackground />;
  if (type === 'wallpaper') return <WallpaperBackground />;
  return <MeshGradientBackground />;
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function StoreBackground() {
  const [type, setType] = useState(readBackgroundType);
  const [layerKey, setLayerKey] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(prefersReducedMotion);

  useEffect(() => {
    const sync = () => {
      const nextType = readBackgroundType();
      setType((prev) => {
        if (prev !== nextType) setLayerKey((key) => key + 1);
        return nextType;
      });
    };
    sync();
    window.addEventListener('themechange', sync);
    return () => window.removeEventListener('themechange', sync);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduceMotion(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  if (type === 'none') return null;

  // Reduced-motion handling is done in CSS (`@media (prefers-reduced-motion: reduce)`
  // stops the animation but keeps the static composition visible). Tag the root so the
  // CSS hook `[data-bg-motion='false']` fires the same overrides, then keep rendering
  // — never bail to null, or the user sees a blank screen instead of a calm static bg.
  if (reduceMotion && typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-bg-motion', 'false');
  } else if (typeof document !== 'undefined') {
    document.documentElement.removeAttribute('data-bg-motion');
  }

  return (
    <Suspense fallback={null}>
      <BackgroundLayer key={`${type}-${layerKey}`} type={type} />
    </Suspense>
  );
}