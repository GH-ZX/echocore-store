import { useCallback, useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { formatMessage } from '../../lib/i18n';
import useHomeExpandableMetrics from '../../hooks/useHomeExpandableMetrics';

/**
 * Expandable home grid — same behavior for games + offers.
 * - Default: expand in place
 * - onMoreClick: Show more runs that callback (e.g. navigate)
 * - alwaysShowMore: keep the Show more control even when all items are visible
 * - disablePeek: show full cards only (no teaser row)
 */
export default function HomeExpandableGrid({
  sectionKey,
  items = [],
  sectionTitle = '',
  gridClassName = '',
  layoutId,
  loading = false,
  loadingSkeleton = null,
  renderItem,
  t = {},
  footerSlot = null,
  onMoreClick = null,
  alwaysShowMore = false,
  disablePeek = false,
}) {
  const total = items.length;
  const [activeCount, setActiveCount] = useState(0);
  const [enterFromIndex, setEnterFromIndex] = useState(null);
  const [initialized, setInitialized] = useState(false);

  const metrics = useHomeExpandableMetrics(gridClassName, total, activeCount, layoutId);
  const {
    activeCount: resolvedActive,
    displayCount: rawDisplayCount,
    useOverlay: rawUseOverlay,
    expandChunk,
    initialActive,
    peekFraction,
    columns,
  } = metrics;

  const hasMoreToExpand = resolvedActive < total;
  const displayCount = disablePeek || onMoreClick
    ? Math.min(total, Math.max(resolvedActive, initialActive, total))
    : rawDisplayCount;
  // When navigating on more, show all provided items fully (no teaser)
  const effectiveActive = (disablePeek || onMoreClick)
    ? Math.min(total, displayCount)
    : resolvedActive;
  const useOverlay = !disablePeek && !onMoreClick && rawUseOverlay && hasMoreToExpand;
  const showMoreControl = alwaysShowMore || hasMoreToExpand || !!onMoreClick;

  useEffect(() => {
    setActiveCount(initialActive);
    setEnterFromIndex(null);
    setInitialized(true);
  }, [sectionKey, initialActive]);

  useEffect(() => {
    if (!initialized) return;
    if (onMoreClick || disablePeek) {
      setActiveCount(total);
      return;
    }
    setActiveCount((prev) => {
      if (prev < initialActive) return initialActive;
      const maxFullRows = Math.floor(prev / columns) * columns;
      return Math.min(total, Math.max(initialActive, maxFullRows || initialActive));
    });
  }, [columns, initialActive, total, initialized, onMoreClick, disablePeek]);

  useEffect(() => {
    if (enterFromIndex == null) return undefined;
    const timer = window.setTimeout(() => setEnterFromIndex(null), 520);
    return () => window.clearTimeout(timer);
  }, [enterFromIndex, resolvedActive]);

  const handleMore = useCallback(() => {
    if (typeof onMoreClick === 'function') {
      onMoreClick();
      return;
    }
    setEnterFromIndex(resolvedActive);
    setActiveCount((prev) => Math.min(total, prev + expandChunk));
  }, [onMoreClick, resolvedActive, expandChunk, total]);

  if (loading) {
    return loadingSkeleton;
  }

  if (total === 0 && !footerSlot) {
    return null;
  }

  const expandLabel = t.showMorePlain || formatMessage(t.showMoreSection, {
    title: sectionTitle,
    count: Math.max(0, total - effectiveActive),
  }) || 'Show more';

  const visibleCount = onMoreClick || disablePeek ? total : displayCount;

  return (
    <div className="home-expandable-grid">
      <div
        className={`relative ${useOverlay ? 'home-expandable-grid__stage' : ''}`}
        style={useOverlay ? { '--peek-fraction': String(peekFraction) } : undefined}
      >
        <div className={`home-expandable-grid__items ${gridClassName}`}>
          {items.slice(0, visibleCount).map((item, index) => {
            const isTeaser = useOverlay && index >= effectiveActive;
            const isEntering = enterFromIndex != null
              && index >= enterFromIndex
              && index < effectiveActive;
            const itemKey = item?.id ?? `${sectionKey}-${index}`;

            return (
              <div
                key={itemKey}
                className={`home-expandable-grid__slot${
                  isTeaser ? ' home-expandable-grid__slot--teaser' : ''
                }${isEntering ? ' home-expandable-grid__slot--enter' : ''}`}
                aria-hidden={isTeaser || undefined}
              >
                {renderItem(item, { index, isTeaser })}
              </div>
            );
          })}
          {(!hasMoreToExpand || onMoreClick || disablePeek) && footerSlot}
        </div>

        {useOverlay && (
          <div className="home-expandable-grid__overlay">
            <div className="home-expandable-grid__overlay-fade" aria-hidden="true" />
            <button
              type="button"
              onClick={handleMore}
              className="home-expandable-grid__more-link"
              aria-expanded={false}
            >
              <span>{expandLabel}</span>
              <ArrowRight className="home-expandable-grid__more-arrow w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* When no overlay (full rows shown or navigate mode): still pair Show more under the grid */}
      {showMoreControl && !useOverlay && (
        <div className="home-expandable-grid__more-row">
          <button
            type="button"
            onClick={handleMore}
            className="home-expandable-grid__more-link"
            aria-expanded={hasMoreToExpand && !onMoreClick}
          >
            <span>{expandLabel}</span>
            <ArrowRight className="home-expandable-grid__more-arrow w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
