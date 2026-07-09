import { useEffect, useMemo, useState } from 'react';
import './StoreBackgrounds.css';

const PULSE_POSITIONS = [
  { top: '18%', left: '12%', delay: '0s' },
  { top: '42%', left: '68%', delay: '-1.4s' },
  { top: '72%', left: '28%', delay: '-2.8s' },
  { top: '55%', left: '88%', delay: '-0.6s' },
  { top: '85%', left: '52%', delay: '-2.1s' },
  { top: '28%', left: '44%', delay: '-1.8s' },
  { top: '62%', left: '8%', delay: '-3.2s' },
  { top: '12%', left: '78%', delay: '-0.9s' },
  { top: '48%', left: '32%', delay: '-2.5s' },
  { top: '78%', left: '72%', delay: '-1.1s' },
  { top: '35%', left: '92%', delay: '-3.6s' },
  { top: '88%', left: '18%', delay: '-1.6s' },
];

function readPulseCount() {
  if (typeof window === 'undefined') return 5;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--circuit-pulses').trim();
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(12, Math.max(1, parsed));
}

export default function CircuitBackground() {
  const [pulseCount, setPulseCount] = useState(readPulseCount);

  useEffect(() => {
    const sync = () => setPulseCount(readPulseCount());
    sync();
    window.addEventListener('themechange', sync);
    return () => window.removeEventListener('themechange', sync);
  }, []);

  const pulses = useMemo(
    () => PULSE_POSITIONS.slice(0, pulseCount),
    [pulseCount],
  );

  return (
    <div className="store-bg store-bg-circuit" aria-hidden="true">
      <div className="store-bg-circuit-grid" />
      <div className="store-bg-circuit-traces" />
      <div className="store-bg-circuit-traces store-bg-circuit-traces--alt" />
      {pulses.map((pulse) => (
        <span
          key={`${pulse.top}-${pulse.left}`}
          className="store-bg-circuit-pulse"
          style={{ top: pulse.top, left: pulse.left, animationDelay: pulse.delay }}
        />
      ))}
      <div className="store-bg-circuit-glow" />
    </div>
  );
}