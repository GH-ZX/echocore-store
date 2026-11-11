import { useEffect, useState } from 'react';
import { getEventDecor } from '../../lib/storeEvents';

const COUNT = { balloons: 9, confetti: 28, stars: 18, snow: 30 };
const RUN_MS = 16000;

/** Deterministic spread so the pieces don't reshuffle on re-render. */
function pieces(kind) {
  const n = COUNT[kind] || 0;
  return Array.from({ length: n }, (_, i) => {
    const a = (i * 137.508) % 100; // golden-angle spread across the width
    const b = (i * 61.8) % 100;
    return {
      left: `${a.toFixed(2)}%`,
      delay: `${((b / 100) * (kind === 'balloons' ? 5 : 7)).toFixed(2)}s`,
      duration: `${(kind === 'balloons' ? 9 : 6) + (b % 5)}s`,
      size: 0.7 + ((i * 29) % 60) / 100,
      hue: i % 4,
      top: `${((i * 53) % 70) + 4}%`,
    };
  });
}

/**
 * A short celebration when the home page opens during an event (one run, then it removes
 * itself). Nothing is rendered for people who asked for reduced motion.
 */
export default function EventDecor({ event }) {
  const kind = getEventDecor(event);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!event || kind === 'none' || !COUNT[kind]) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    setShow(true);
    const timer = setTimeout(() => setShow(false), RUN_MS);
    return () => clearTimeout(timer);
  }, [event?.id, kind]); // eslint-disable-line react-hooks/exhaustive-deps -- one run per event/decoration

  if (!show) return null;
  return (
    <div className={`event-decor event-decor--${kind}`} aria-hidden="true">
      {pieces(kind).map((p, i) => (
        <span
          key={i}
          className={`event-decor__piece event-decor__piece--h${p.hue}`}
          style={{
            left: p.left,
            top: kind === 'stars' ? p.top : undefined,
            animationDelay: p.delay,
            animationDuration: p.duration,
            '--piece-scale': p.size,
          }}
        />
      ))}
    </div>
  );
}
