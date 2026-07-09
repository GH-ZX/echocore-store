import { useEffect, useState, lazy, Suspense } from 'react';

const Aurora = lazy(() => import('./Aurora'));
const HexGridBackground = lazy(() => import('./HexGridBackground'));
const ParticleBackground = lazy(() => import('./ParticleBackground'));
const NebulaBackground = lazy(() => import('./NebulaBackground'));
const ScanlineBackground = lazy(() => import('./ScanlineBackground'));
const StarfieldBackground = lazy(() => import('./StarfieldBackground'));
const CircuitBackground = lazy(() => import('./CircuitBackground'));
const Grid3DBackground = lazy(() => import('./Grid3DBackground'));
const Grid3DTunnelBackground = lazy(() => import('./Grid3DTunnelBackground'));
const Grid3DCanyonBackground = lazy(() => import('./Grid3DCanyonBackground'));
const Grid3DRingsBackground = lazy(() => import('./Grid3DRingsBackground'));

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
  if (type === 'grid3d') return <Grid3DBackground />;
  if (type === 'grid3d_tunnel') return <Grid3DTunnelBackground />;
  if (type === 'grid3d_canyon') return <Grid3DCanyonBackground />;
  if (type === 'grid3d_rings') return <Grid3DRingsBackground />;
  return <Aurora />;
}

export default function StoreBackground() {
  const [type, setType] = useState(readBackgroundType);
  const [layerKey, setLayerKey] = useState(0);

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

  if (type === 'none') return null;

  return (
    <Suspense fallback={null}>
      <BackgroundLayer key={`${type}-${layerKey}`} type={type} />
    </Suspense>
  );
}