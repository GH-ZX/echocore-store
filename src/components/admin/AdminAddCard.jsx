import { Plus } from 'lucide-react';
import BorderGlow from '../ui/BorderGlow';

const GLOW_PROPS = {
  edgeSensitivity: 25,
  borderRadius: 16,
  glowRadius: 30,
  glowIntensity: 0.8,
  coneSpread: 25,
  fillOpacity: 0.35,
};

function CardShell({ onClick, ariaLabel, className = '', children }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      aria-label={ariaLabel}
      className={className}
    >
      {children}
    </div>
  );
}

function PlusMark({ size = 'md' }) {
  const box = size === 'lg' ? 'h-12 w-12' : 'h-11 w-11 sm:h-12 sm:w-12';
  const icon = size === 'lg' ? 'h-6 w-6' : 'h-5 w-5 sm:h-6 sm:w-6';

  return (
    <span
      className={`relative z-10 flex ${box} items-center justify-center rounded-xl bg-black/35 text-[var(--accent)] backdrop-blur-sm transition-all duration-300 group-hover:scale-110 group-hover:bg-[var(--accent)]/15`}
    >
      <Plus className={icon} strokeWidth={2.25} />
    </span>
  );
}

export default function AdminAddCard({
  onClick,
  variant = 'offer',
  className = '',
  ariaLabel = 'Add',
}) {
  const glowClass = `h-full ${className}`.trim();

  if (variant === 'game') {
    return (
      <BorderGlow {...GLOW_PROPS} className={glowClass}>
        <CardShell
          onClick={onClick}
          ariaLabel={ariaLabel}
          className="games-card group relative flex h-48 sm:h-52 w-full min-w-0 cursor-pointer items-center justify-center transition-all duration-300 active:scale-[0.985] overflow-hidden"
        >
          <div className="absolute inset-0 bg-[var(--bg-elevated)]" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
          <PlusMark size="lg" />
        </CardShell>
      </BorderGlow>
    );
  }

  return (
    <BorderGlow {...GLOW_PROPS} className={glowClass}>
      <CardShell
        onClick={onClick}
        ariaLabel={ariaLabel}
        className="group relative flex h-full min-h-[220px] w-full min-w-0 cursor-pointer items-center justify-center transition-all duration-300 active:scale-[0.99] overflow-hidden"
      >
        <div className="absolute inset-0 bg-[var(--bg-elevated)]" />
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--bg-elevated)] to-[var(--bg-primary)]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        <PlusMark />
      </CardShell>
    </BorderGlow>
  );
}