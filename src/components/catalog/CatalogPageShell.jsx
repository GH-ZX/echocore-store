import { ChevronLeft, Home } from 'lucide-react';

export default function CatalogPageShell({
  lang = 'ar',
  backLabel,
  onBack,
  breadcrumb = [],
  adminActions = null,
  wide = false,
  children,
}) {
  const isAr = lang === 'ar';
  const widthClass = wide ? 'max-w-7xl' : 'max-w-6xl';

  return (
    <div className={`catalog-page ${widthClass} mx-auto pb-24 sm:pb-8`}>
      <div className="catalog-page__toolbar mb-4 sm:mb-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="catalog-page__toolbar-main flex flex-1 min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="catalog-page__back btn btn-secondary text-sm py-2 px-3 sm:px-4 shrink-0 touch-manipulation"
          >
            <ChevronLeft className={`w-4 h-4 shrink-0 ${isAr ? 'rotate-180' : ''}`} />
            <span className="truncate max-w-[10rem] sm:max-w-[14rem]">{backLabel}</span>
          </button>

          {breadcrumb.length > 0 && (
            <nav
              aria-label="Breadcrumb"
              className="catalog-page__breadcrumb flex flex-1 min-w-0 flex-wrap items-center justify-end gap-1.5 text-[11px] sm:text-xs text-[var(--text-muted)]"
            >
              <Home className="w-3 h-3 shrink-0" />
              {breadcrumb.map((item, index) => (
                <span key={`${item.label}-${index}`} className="inline-flex items-center gap-1.5 min-w-0">
                  <span className="opacity-40">/</span>
                  {item.onClick ? (
                    <button type="button" onClick={item.onClick} className="hover:text-[var(--accent)] truncate max-w-[8rem] sm:max-w-[12rem]">
                      {item.label}
                    </button>
                  ) : (
                    <span className="truncate max-w-[9rem] sm:max-w-[14rem] text-[var(--text-sec)]">{item.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
        </div>

        {adminActions && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {adminActions}
          </div>
        )}
      </div>

      {children}
    </div>
  );
}