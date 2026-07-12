import { useCallback, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { formatMessage } from '../../lib/i18n';
import useHomeExpandableMetrics from '../../hooks/useHomeExpandableMetrics';

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
}) {
  const total = items.length;
  const [activeCount, setActiveCount] = useState(0);
  const [enterFromIndex, setEnterFromIndex] = useState(null);
  const [initialized, setInitialized] = useState(false);

  const metrics = useHomeExpandableMetrics(gridClassName, total, activeCount, layoutId);
  const {
    activeCount: resolvedActive,
    displayCount,
    useOverlay,
    expandChunk,
    initialActive,
    peekFraction,
    columns,
  } = metrics;

  const hasMore = resolvedActive < total;

  useEffect(() => {
    setActiveCount(initialActive);
    setEnterFromIndex(null);
    setInitialized(true);
  }, [sectionKey, initialActive]);

  useEffect(() => {
    if (!initialized) return;
    setActiveCount((prev) => {
      if (prev < initialActive) return initialActive;
      const maxFullRows = Math.floor(prev / columns) * columns;
      return Math.min(total, Math.max(initialActive, maxFullRows || initialActive));
    });
  }, [columns, initialActive, total, initialized]);

  useEffect(() => {
    if (enterFromIndex == null) return undefined;
    const timer = window.setTimeout(() => setEnterFromIndex(null), 520);
    return () => window.clearTimeout(timer);
  }, [enterFromIndex, resolvedActive]);

  const handleExpand = useCallback(() => {
    setEnterFromIndex(resolvedActive);
    setActiveCount((prev) => Math.min(total, prev + expandChunk));
  }, [resolvedActive, expandChunk, total]);

  if (loading) {
    return loadingSkeleton;
  }

  if (total === 0 && !footerSlot) {
    return null;
  }

  const remaining = Math.max(0, total - resolvedActive);
  const expandLabel = formatMessage(t.showMoreSection, {
    title: sectionTitle,
    count: remaining,
  });

  return (
    <div className="home-expandable-grid">
      <div
        className={`relative ${hasMore && useOverlay ? 'home-expandable-grid__stage' : ''}`}
        style={hasMore && useOverlay ? { '--peek-fraction': String(peekFraction) } : undefined}
      >
        <div className={`home-expandable-grid__items ${gridClassName}`}>
          {items.slice(0, displayCount).map((item, index) => {
            const isTeaser = hasMore && useOverlay && index >= resolvedActive;
            const isEntering = enterFromIndex != null
              && index >= enterFromIndex
              && index < resolvedActive;
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
          {!hasMore && footerSlot}
        </div>

        {hasMore && useOverlay && (
          <div className="home-expandable-grid__overlay">
            <div className="home-expandable-grid__overlay-fade" aria-hidden="true" />
            <button
              type="button"
              onClick={handleExpand}
              className="home-expandable-grid__overlay-btn btn btn-secondary inline-flex items-center gap-2"
              aria-expanded={false}
            >
              {expandLabel}
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

    </div>
  );
}