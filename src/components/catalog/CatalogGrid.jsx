import { Gamepad2 } from 'lucide-react';

export default function CatalogGrid({
  loading = false,
  count = 0,
  skeletonCount = 8,
  skeletonHeight = 'h-52',
  emptyIcon = Gamepad2,
  emptyTitle = '',
  emptyHint = '',
  variant = 'games',
  children,
}) {
  const EmptyIcon = emptyIcon;

  if (loading) {
    return (
      <div className={variant === 'offers' ? 'grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6'}>
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <div key={index} className={`card ${skeletonHeight} animate-pulse bg-[var(--bg-surface)]`} />
        ))}
      </div>
    );
  }

  if (count === 0) {
    return (
      <div className="card p-10 sm:p-12 text-center">
        <EmptyIcon className="w-10 h-10 mx-auto text-[var(--text-muted)] mb-3" strokeWidth={1.75} />
        <p className="text-[var(--text-sec)] font-medium">{emptyTitle}</p>
        {emptyHint ? (
          <p className="text-sm text-[var(--text-muted)] mt-1.5 max-w-sm mx-auto">{emptyHint}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={variant === 'offers' ? 'grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6'}>
      {children}
    </div>
  );
}
