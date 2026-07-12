export const HOME_GRID_DENSE = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 items-stretch';
export const HOME_GRID_VOUCHER = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6';

const GRID_LAYOUTS = {
  dense: {
    columns: { default: 2, sm: 3, lg: 4, xl: 5 },
    initialRows: 2,
    expandRows: 2,
  },
  voucher: {
    columns: { default: 1, sm: 2, lg: 3 },
    initialRows: 2,
    expandRows: 2,
  },
};

export function resolveGridLayoutId(gridClassName = '') {
  if (gridClassName.includes('grid-cols-1') && !gridClassName.includes('sm:grid-cols-2')) {
    return 'voucher';
  }
  if (gridClassName.includes('lg:grid-cols-3') && !gridClassName.includes('xl:grid-cols')) {
    return 'voucher';
  }
  return 'dense';
}

export function getColumnsForWidth(width, layoutId = 'dense') {
  const layout = GRID_LAYOUTS[layoutId] || GRID_LAYOUTS.dense;
  const { columns } = layout;
  if (width >= 1280 && columns.xl) return columns.xl;
  if (width >= 1024 && columns.lg) return columns.lg;
  if (width >= 640 && columns.sm) return columns.sm;
  return columns.default;
}

/** How many items to show and peek for the current viewport column count. */
export function computeExpandableSlice({
  total = 0,
  activeCount,
  columns,
  layoutId = 'dense',
  isInitial = false,
}) {
  const layout = GRID_LAYOUTS[layoutId] || GRID_LAYOUTS.dense;
  const safeColumns = Math.max(1, columns || 1);
  const initialActive = Math.min(total, safeColumns * layout.initialRows);
  const active = isInitial
    ? initialActive
    : Math.min(total, Math.max(initialActive, activeCount || initialActive));

  const remaining = Math.max(0, total - active);
  const expandChunk = safeColumns * layout.expandRows;

  if (remaining === 0) {
    return {
      activeCount: active,
      displayCount: total,
      peekCount: 0,
      useOverlay: false,
      expandChunk,
      initialActive,
    };
  }

  const peekCount = Math.min(safeColumns, remaining);
  return {
    activeCount: active,
    displayCount: active + peekCount,
    peekCount,
    useOverlay: peekCount > 0,
    expandChunk,
    initialActive,
  };
}

export function skeletonCountForWidth(width, layoutId = 'dense') {
  const columns = getColumnsForWidth(width, layoutId);
  const layout = GRID_LAYOUTS[layoutId] || GRID_LAYOUTS.dense;
  return columns * (layout.initialRows + 1);
}