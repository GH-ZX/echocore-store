import './StoreBackgrounds.css';

const PULSES = [
  { top: '18%', left: '12%', delay: '0s' },
  { top: '42%', left: '68%', delay: '-1.4s' },
  { top: '72%', left: '28%', delay: '-2.8s' },
  { top: '55%', left: '88%', delay: '-0.6s' },
  { top: '85%', left: '52%', delay: '-2.1s' },
];

export default function CircuitBackground() {
  return (
    <div className="store-bg store-bg-circuit" aria-hidden="true">
      <div className="store-bg-circuit-grid" />
      <div className="store-bg-circuit-traces" />
      <div className="store-bg-circuit-traces store-bg-circuit-traces--alt" />
      {PULSES.map((pulse) => (
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