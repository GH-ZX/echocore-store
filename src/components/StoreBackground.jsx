import { useEffect, useState, lazy, Suspense } from 'react';

const Aurora = lazy(() => import('./Aurora'));
const HexGridBackground = lazy(() => import('./HexGridBackground'));
const ParticleBackground = lazy(() => import('./ParticleBackground'));
const NebulaBackground = lazy(() => import('./NebulaBackground'));
const ScanlineBackground = lazy(() => import('./ScanlineBackground'));
const StarfieldBackground = lazy(() => import('./StarfieldBackground'));
const CircuitBackground = lazy(() => import('./CircuitBackground'));

function readBackgroundType() {
  if (typeof window === 'undefined') return 'aurora';
  return document.documentElement.getAttribute('data-background-type')
    || getComputedStyle(document.documentElement).getPropertyValue('--background-type').trim()
    || 'aurora';
}

function BackgroundLayer({ type }) {
  if (type === 'none') return null;
  if (type === 'hexgrid') return <HexGridBackground />;
  if (type === 'particles') return <ParticleBackground />;
  if (type === 'nebula') return <NebulaBackground />;
  if (type === 'scanlines') return <ScanlineBackground />;
  if (type === 'starfield') return <StarfieldBackground />;
  if (type === 'circuit') return <CircuitBackground />;
  return <Aurora />;
}

export default function StoreBackground() {
  const [type, setType] = useState(readBackgroundType);

  useEffect(() => {
    const sync = () => setType(readBackgroundType());
    sync();
    window.addEventListener('themechange', sync);
    return () => window.removeEventListener('themechange', sync);
  }, []);

  if (type === 'none') return null;

  return (
    <Suspense fallback={null}>
      <BackgroundLayer type={type} />
    </Suspense>
  );
}