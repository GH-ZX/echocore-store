import { Loader2 } from 'lucide-react';

export function Spinner({ size = 'md', className = '' }) {
  const sizeClass = {
    xs: 'w-3.5 h-3.5',
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  }[size] || size;
  return <Loader2 className={`${sizeClass} animate-spin ${className}`} aria-hidden="true" />;
}

export function PageSpinner({ label, className = '' }) {
  return (
    <div className={`py-12 text-center ${className}`}>
      <Spinner size="lg" className="mx-auto text-[var(--accent)]" />
      {label && <p className="mt-3 text-sm text-[var(--text-sec)]">{label}</p>}
    </div>
  );
}

export default function PageLoader({ t }) {
  return (
    <div
      className="page-loader flex min-h-[40vh] items-center justify-center px-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="page-loader-card flex items-center gap-3 rounded-2xl border px-5 py-4 text-sm font-semibold">
        <Spinner size="sm" className="page-loader-spinner shrink-0" />
        <span>{t.openingPage}</span>
      </div>
    </div>
  );
}
