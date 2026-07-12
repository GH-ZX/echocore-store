import { useEffect, useMemo, useState } from 'react';
import {
  computeExpandableSlice,
  getColumnsForWidth,
  resolveGridLayoutId,
} from '../lib/homeExpandableGrid';

export default function useHomeExpandableMetrics(gridClassName, total, activeCount, layoutIdProp) {
  const layoutId = layoutIdProp || resolveGridLayoutId(gridClassName);
  const [viewportWidth, setViewportWidth] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth : 1280
  ));

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const columns = getColumnsForWidth(viewportWidth, layoutId);

  const slice = useMemo(
    () => computeExpandableSlice({
      total,
      activeCount,
      columns,
      layoutId,
      isInitial: false,
    }),
    [total, activeCount, columns, layoutId],
  );

  const initialSlice = useMemo(
    () => computeExpandableSlice({
      total,
      activeCount: 0,
      columns,
      layoutId,
      isInitial: true,
    }),
    [total, columns, layoutId],
  );

  return {
    layoutId,
    columns,
    ...slice,
    initialActive: initialSlice.activeCount,
    peekFraction: slice.displayCount > 0
      ? Math.max(0.3, slice.peekCount / slice.displayCount)
      : 0,
  };
}