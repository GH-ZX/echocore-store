import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Loader2, Search, CheckSquare, Square, LayoutGrid, Save, X,
  CloudDownload, RefreshCw,
} from 'lucide-react';
import { listG2bulkPullCatalog, peekPullCatalogCache, saveG2bulkPullSelection } from '../../lib/g2bulk';
import {
  CATALOG_NAV_ITEMS,
  VOUCHER_FILTER_ALL,
  VOUCHER_FILTER_GAME,
  VOUCHER_FILTER_PLATFORM,
} from '../../lib/catalogNav';
import {
  alignSelectionSetsToCatalog,
  applySyncedCatalogToSelection,
  hasPullSelection,
  selectionPayloadFromSets,
  selectionSetsFromPayload,
} from '../../lib/pullCatalogUtils';

const TABS = {
  topups: 'topups',
  vouchers: 'vouchers',
};

const PHASE = {
  library: 'library',
  select: 'select',
};

const VOUCHER_FILTER_OPTIONS = [
  { id: VOUCHER_FILTER_ALL, labelKey: 'voucherFilterAll' },
  { id: VOUCHER_FILTER_PLATFORM, labelKey: 'voucherFilterPlatform' },
  { id: VOUCHER_FILTER_GAME, labelKey: 'voucherFilterGame' },
];

function emptySelection() {
  return {
    topupSyncBaseKeys: new Set(),
    topupLiveBaseKeys: new Set(),
    accountSyncCategoryIds: new Set(),
    accountLiveCategoryIds: new Set(),
    giftSyncCategoryIds: new Set(),
    giftLiveCategoryIds: new Set(),
    carouselBaseKeys: new Set(),
  };
}

function SelectionIndicator({ checked, className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center rounded-md border shrink-0 pointer-events-none ${className} ${
        checked
          ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
          : 'border-[var(--border)] bg-[var(--bg-primary)]/40 text-[var(--text-muted)]'
      }`}
    >
      {checked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
    </span>
  );
}

function ModeToggle({ mode, onChange, t = {}, className = '' }) {
  return (
    <div
      className={`inline-flex rounded-lg border border-[var(--border)] overflow-hidden shrink-0 ${className}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => onChange('sync')}
        className={`px-2.5 py-2 min-h-[40px] min-w-[3.25rem] text-[11px] font-semibold touch-manipulation transition-colors ${
          mode === 'sync'
            ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
            : 'bg-[var(--bg-primary)]/40 text-[var(--text-muted)]'
        }`}
      >
        {t.g2bulkPullModeSynced}
      </button>
      <button
        type="button"
        onClick={() => onChange('live')}
        className={`px-2.5 py-2 min-h-[40px] min-w-[3.25rem] text-[11px] font-semibold touch-manipulation transition-colors border-l border-[var(--border)] ${
          mode === 'live'
            ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
            : 'bg-[var(--bg-primary)]/40 text-[var(--text-muted)]'
        }`}
      >
        {t.g2bulkPullModeLive}
      </button>
    </div>
  );
}

function CarouselToggle({ checked, onToggle, label, title, className = '' }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={title || label}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`inline-flex items-center justify-center rounded-lg border transition-colors touch-manipulation active:scale-95 ${className} ${
        checked
          ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
          : 'border-[var(--border)] bg-[var(--bg-primary)]/40 text-[var(--text-muted)]'
      }`}
    >
      <LayoutGrid className="w-4 h-4" />
    </button>
  );
}

function buildSelectionFromCatalog(data, catalog, { preserveUserEdits = false, currentSelection = null } = {}) {
  const effectiveSelection = (
    preserveUserEdits && currentSelection
      ? currentSelection
      : (hasPullSelection(data?.selection) ? data.selection : data?.databaseSelection)
  ) || {};

  const baseSets = preserveUserEdits && currentSelection
    ? alignSelectionSetsToCatalog(currentSelection, catalog)
    : alignSelectionSetsToCatalog(
      selectionSetsFromPayload(effectiveSelection, catalog),
      catalog,
    );

  return preserveUserEdits
    ? baseSets
    : applySyncedCatalogToSelection(catalog, baseSets);
}

export default function G2bulkPullPanel({
  open,
  onClose,
  t = {},
  initialSelection = null,
  onSaved,
  onLoaded,
  onSaveAndSync,
}) {
  const [phase, setPhase] = useState(PHASE.library);
  const [fetching, setFetching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState(TABS.topups);
  const [voucherFilter, setVoucherFilter] = useState(VOUCHER_FILTER_ALL);
  const [selectionFilter, setSelectionFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState({ games: [], accounts: [], giftCards: [] });
  const [selection, setSelection] = useState(emptySelection());
  const userEditedSelectionRef = useRef(false);
  const selectionRef = useRef(selection);
  const onLoadedRef = useRef(onLoaded);
  const onSavedRef = useRef(onSaved);
  const onSaveAndSyncRef = useRef(onSaveAndSync);
  const initialSelectionRef = useRef(initialSelection);
  const openTokenRef = useRef(0);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  useEffect(() => {
    onSaveAndSyncRef.current = onSaveAndSync;
  }, [onSaveAndSync]);

  useEffect(() => {
    initialSelectionRef.current = initialSelection;
  }, [initialSelection]);

  const applyCatalogPayload = useCallback((data, {
    preserveUserEdits = false,
    notifyParent = false,
  } = {}) => {
    const nextCatalog = {
      games: data.games || [],
      accounts: data.accounts || [],
      giftCards: data.giftCards || [],
    };
    setCatalog(nextCatalog);

    const mergedSets = buildSelectionFromCatalog(data, nextCatalog, {
      preserveUserEdits,
      currentSelection: preserveUserEdits ? selectionRef.current : null,
    });
    setSelection(mergedSets);

    if (notifyParent) {
      onLoadedRef.current?.(selectionPayloadFromSets(mergedSets), data.catalogMode, {
        persisted: !!data.persisted,
        fromDatabase: data.databaseSelection,
      });
    }
  }, []);

  const fetchLibrary = useCallback(async ({
    refresh = false,
    preserveUserEdits = false,
    background = false,
  } = {}) => {
    const token = openTokenRef.current;
    if (background) setRefreshing(true);
    else {
      setFetching(true);
      setPhase(PHASE.library);
    }
    if (!background) setError('');

    try {
      const data = await listG2bulkPullCatalog({ refresh });
      if (token !== openTokenRef.current) return;

      applyCatalogPayload(data, {
        preserveUserEdits: preserveUserEdits || userEditedSelectionRef.current,
        notifyParent: !preserveUserEdits && !background,
      });
      setPhase(PHASE.select);
    } catch (err) {
      if (token !== openTokenRef.current) return;
      if (!background) {
        setError(err.message || t.g2bulkPullLoadFailed);
        setPhase(PHASE.library);
      }
    } finally {
      if (token === openTokenRef.current) {
        if (background) setRefreshing(false);
        else setFetching(false);
      }
    }
  }, [applyCatalogPayload, t.g2bulkPullLoadFailed]);

  useEffect(() => {
    if (!open) return;

    openTokenRef.current += 1;
    const token = openTokenRef.current;
    userEditedSelectionRef.current = false;
    setQuery('');
    setSuccess('');
    setError('');
    setVoucherFilter(VOUCHER_FILTER_ALL);
    setSelectionFilter('all');
    setActiveTab(TABS.topups);

    const cached = peekPullCatalogCache();
    if (cached) {
      applyCatalogPayload(cached, { notifyParent: true });
      setPhase(PHASE.select);
      setFetching(false);
      return;
    }

    fetchLibrary({ refresh: false, preserveUserEdits: false, background: false }).then(() => {
      if (token !== openTokenRef.current) return undefined;
      return undefined;
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- fetch once per open

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const voucherCatalogItems = useMemo(() => [
    ...catalog.accounts.map((item) => ({ ...item, voucherKind: 'account' })),
    ...catalog.giftCards.map((item) => ({ ...item, voucherKind: 'gift' })),
  ], [catalog.accounts, catalog.giftCards]);

  const tabs = useMemo(() => ([
    {
      id: TABS.topups,
      label: t.g2bulkTopupsNav || CATALOG_NAV_ITEMS[0].fallbackEn,
      icon: CATALOG_NAV_ITEMS[0].icon,
      count: catalog.games.length,
    },
    {
      id: TABS.vouchers,
      label: t.g2bulkVouchersNav || CATALOG_NAV_ITEMS[1].fallbackEn,
      icon: CATALOG_NAV_ITEMS[1].icon,
      count: voucherCatalogItems.length,
    },
  ]), [catalog.games.length, voucherCatalogItems.length, t.g2bulkTopupsNav, t.g2bulkVouchersNav]);

  const filteredVoucherItems = useMemo(() => {
    if (voucherFilter === VOUCHER_FILTER_PLATFORM) {
      return voucherCatalogItems.filter((item) => item.voucherKind === 'account');
    }
    if (voucherFilter === VOUCHER_FILTER_GAME) {
      return voucherCatalogItems.filter((item) => item.voucherKind === 'gift');
    }
    return voucherCatalogItems;
  }, [voucherCatalogItems, voucherFilter]);

  const activeItems = useMemo(() => {
    const list = activeTab === TABS.topups ? catalog.games : filteredVoucherItems;
    const q = query.trim().toLowerCase();
    const baseList = !q ? list : list.filter((item) => {
      const name = String(item.baseName || item.title || '').toLowerCase();
      return name.includes(q);
    });

    if (selectionFilter === 'selected') {
      return baseList.filter((item) => isSelected(item));
    }
    if (selectionFilter === 'unselected') {
      return baseList.filter((item) => !isSelected(item));
    }
    return baseList;
  }, [activeTab, catalog.games, filteredVoucherItems, query, selectionFilter]);

  const getVoucherSelectionKeys = (item) => (
    item.voucherKind === 'account'
      ? { sync: 'accountSyncCategoryIds', live: 'accountLiveCategoryIds' }
      : { sync: 'giftSyncCategoryIds', live: 'giftLiveCategoryIds' }
  );

  const getItemKey = (item) => (
    activeTab === TABS.topups ? item.baseKey : item.categoryId
  );

  const cloneSelection = (prev) => ({
    topupSyncBaseKeys: new Set(prev.topupSyncBaseKeys),
    topupLiveBaseKeys: new Set(prev.topupLiveBaseKeys),
    accountSyncCategoryIds: new Set(prev.accountSyncCategoryIds),
    accountLiveCategoryIds: new Set(prev.accountLiveCategoryIds),
    giftSyncCategoryIds: new Set(prev.giftSyncCategoryIds),
    giftLiveCategoryIds: new Set(prev.giftLiveCategoryIds),
    carouselBaseKeys: new Set(prev.carouselBaseKeys),
  });

  const isGameSelectedIn = (state, baseKey) => (
    state.topupSyncBaseKeys.has(baseKey) || state.topupLiveBaseKeys.has(baseKey)
  );

  const isGameSelected = (baseKey) => isGameSelectedIn(selection, baseKey);

  const getGameModeIn = (state, baseKey) => (
    state.topupLiveBaseKeys.has(baseKey) ? 'live' : 'sync'
  );

  const markSelectionEdited = () => {
    userEditedSelectionRef.current = true;
  };

  const isVoucherSelectedIn = (state, item) => {
    const keys = getVoucherSelectionKeys(item);
    const categoryId = getItemKey(item);
    return state[keys.sync].has(categoryId) || state[keys.live].has(categoryId);
  };

  const getVoucherModeIn = (state, item) => {
    const keys = getVoucherSelectionKeys(item);
    return state[keys.live].has(getItemKey(item)) ? 'live' : 'sync';
  };

  const isSelected = (item) => {
    if (activeTab === TABS.topups) return isGameSelected(item.baseKey);
    return isVoucherSelectedIn(selection, item);
  };

  const toggleItem = (item) => {
    markSelectionEdited();
    if (activeTab === TABS.topups) {
      const key = item.baseKey;
      setSelection((prev) => {
        const next = cloneSelection(prev);
        if (isGameSelectedIn(prev, key)) {
          next.topupSyncBaseKeys.delete(key);
          next.topupLiveBaseKeys.delete(key);
          next.carouselBaseKeys.delete(key);
        } else {
          next.topupSyncBaseKeys.add(key);
          next.topupLiveBaseKeys.delete(key);
        }
        return next;
      });
      return;
    }

    const itemKey = getItemKey(item);
    const keys = getVoucherSelectionKeys(item);
    setSelection((prev) => {
      const next = cloneSelection(prev);
      if (isVoucherSelectedIn(prev, item)) {
        next[keys.sync].delete(itemKey);
        next[keys.live].delete(itemKey);
      } else {
        next[keys.sync].add(itemKey);
        next[keys.live].delete(itemKey);
      }
      return next;
    });
  };

  const setVoucherMode = (item, mode) => {
    markSelectionEdited();
    const itemKey = getItemKey(item);
    const keys = getVoucherSelectionKeys(item);
    setSelection((prev) => {
      const next = cloneSelection(prev);
      next[keys.sync].delete(itemKey);
      next[keys.live].delete(itemKey);
      if (mode === 'live') next[keys.live].add(itemKey);
      else next[keys.sync].add(itemKey);
      return next;
    });
  };

  const setGameMode = (item, mode) => {
    markSelectionEdited();
    const key = item.baseKey;
    setSelection((prev) => {
      const next = cloneSelection(prev);
      next.topupSyncBaseKeys.delete(key);
      next.topupLiveBaseKeys.delete(key);
      if (mode === 'live') {
        next.topupLiveBaseKeys.add(key);
        next.carouselBaseKeys.delete(key);
      } else {
        next.topupSyncBaseKeys.add(key);
      }
      return next;
    });
  };

  const toggleCarousel = (item) => {
    markSelectionEdited();
    const key = item.baseKey;
    setSelection((prev) => {
      const next = cloneSelection(prev);
      if (!next.topupSyncBaseKeys.has(key)) {
        next.topupSyncBaseKeys.add(key);
        next.topupLiveBaseKeys.delete(key);
      }
      if (next.carouselBaseKeys.has(key)) next.carouselBaseKeys.delete(key);
      else next.carouselBaseKeys.add(key);
      return next;
    });
  };

  const selectAllActive = () => {
    markSelectionEdited();
    setSelection((prev) => {
      const next = cloneSelection(prev);
      if (activeTab === TABS.topups) {
        activeItems.forEach((item) => {
          next.topupSyncBaseKeys.add(item.baseKey);
          next.topupLiveBaseKeys.delete(item.baseKey);
        });
      } else {
        activeItems.forEach((item) => {
          const keys = getVoucherSelectionKeys(item);
          const itemKey = getItemKey(item);
          next[keys.sync].add(itemKey);
          next[keys.live].delete(itemKey);
        });
      }
      return next;
    });
  };

  const clearActive = () => {
    markSelectionEdited();
    setSelection((prev) => {
      const next = cloneSelection(prev);
      if (activeTab === TABS.topups) {
        activeItems.forEach((item) => {
          next.topupSyncBaseKeys.delete(item.baseKey);
          next.topupLiveBaseKeys.delete(item.baseKey);
          next.carouselBaseKeys.delete(item.baseKey);
        });
      } else {
        activeItems.forEach((item) => {
          const keys = getVoucherSelectionKeys(item);
          const itemKey = getItemKey(item);
          next[keys.sync].delete(itemKey);
          next[keys.live].delete(itemKey);
        });
      }
      return next;
    });
  };

  const selectedCounts = useMemo(() => {
    const games = selection.topupSyncBaseKeys.size + selection.topupLiveBaseKeys.size;
    const platform = selection.accountSyncCategoryIds.size + selection.accountLiveCategoryIds.size;
    const gameVouchers = selection.giftSyncCategoryIds.size + selection.giftLiveCategoryIds.size;
    const vouchers = platform + gameVouchers;
    return {
      games,
      syncGames: selection.topupSyncBaseKeys.size,
      liveGames: selection.topupLiveBaseKeys.size,
      vouchers,
      platformVouchers: platform,
      gameVouchers,
      syncVouchers: selection.accountSyncCategoryIds.size + selection.giftSyncCategoryIds.size,
      liveVouchers: selection.accountLiveCategoryIds.size + selection.giftLiveCategoryIds.size,
      carousel: selection.carouselBaseKeys.size,
    };
  }, [selection]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = selectionPayloadFromSets(selection);
      const result = await saveG2bulkPullSelection(payload);
      setSuccess(t.g2bulkPullSelectionSaved);
      onSavedRef.current?.(result.selection || payload, result.catalogMode);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || t.g2bulkPullSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndSync = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = selectionPayloadFromSets(selection);
      const result = await saveG2bulkPullSelection(payload);
      onSavedRef.current?.(result.selection || payload, result.catalogMode);
      await onSaveAndSyncRef.current?.(result.selection || payload, result.catalogMode);
      setSuccess(t.g2bulkPullSelectionSaved);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || t.g2bulkPullSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshLibrary = () => {
    fetchLibrary({ refresh: true, preserveUserEdits: true, background: true });
  };

  if (!open) return null;

  const showSelectPhase = phase === PHASE.select;

  const panel = (
    <div className="g2bulk-pull-panel fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 touch-manipulation">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px] touch-manipulation"
        aria-label={t.cancel}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="g2bulk-pull-title"
        className="g2bulk-pull-panel__dialog relative w-full max-w-3xl max-h-[min(85dvh,720px)] flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b border-[var(--border)] shrink-0">
          <div className="min-w-0">
            <h3 id="g2bulk-pull-title" className="text-base font-bold truncate">
              {showSelectPhase ? t.g2bulkPullChooseTitle : t.g2bulkPullFromApi}
            </h3>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5 hidden sm:block">
              {showSelectPhase ? t.g2bulkPullDesc : t.g2bulkPullFetchingHint}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {showSelectPhase && (
              <button
                type="button"
                onClick={handleRefreshLibrary}
                disabled={refreshing || fetching}
                className="btn btn-secondary p-2.5 min-w-[44px] min-h-[44px] touch-manipulation"
                title={t.g2bulkPullRefreshLibrary}
                aria-label={t.g2bulkPullRefreshLibrary}
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary p-2.5 min-w-[44px] min-h-[44px] touch-manipulation"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!showSelectPhase ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center gap-4">
            <div className="p-4 rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)]">
              <CloudDownload className="w-8 h-8" />
            </div>
            <div>
              <p className="font-semibold text-[var(--text-primary)]">{t.g2bulkPullFetchingLibrary}</p>
              <p className="text-sm text-[var(--text-muted)] mt-1 max-w-sm">{t.g2bulkPullFetchingHint}</p>
            </div>
            {fetching ? (
              <Loader2 className="w-7 h-7 animate-spin text-[var(--accent)]" />
            ) : null}
            {error && (
              <div className="w-full max-w-md">
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</p>
                <button
                  type="button"
                  onClick={() => fetchLibrary({ refresh: true })}
                  className="btn btn-primary mt-3 min-h-[44px]"
                >
                  {t.g2bulkPullRefreshLibrary}
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="g2bulk-pull-panel__tabs px-3 sm:px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-primary)]/50 shrink-0 space-y-2">
              <div className="grid grid-cols-2 gap-1.5">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const selected = tab.id === TABS.topups
                    ? selectedCounts.games
                    : selectedCounts.vouchers;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      aria-pressed={isActive}
                      className={`g2bulk-pull-panel__tab flex flex-col items-center justify-center gap-0.5 rounded-lg border px-1.5 py-2 min-h-[52px] text-center transition-colors touch-manipulation active:scale-[0.98] ${
                        isActive
                          ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                          : 'border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-sec)] hover:border-[var(--accent)]/35'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`} />
                      <span className="text-xs sm:text-sm font-semibold leading-tight">{tab.label}</span>
                      <span className={`text-[10px] sm:text-xs tabular-nums ${isActive ? 'text-[var(--accent)]/90' : 'text-[var(--text-muted)]'}`}>
                        {selected}/{tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-[var(--text-muted)] hidden sm:block">
                {t.g2bulkPullWorkflowHint}
              </p>
            </div>

            {activeTab === TABS.vouchers && (
              <div className="px-3 sm:px-4 py-2 border-b border-[var(--border)] flex flex-wrap gap-2 shrink-0">
                {VOUCHER_FILTER_OPTIONS.map((option) => {
                  const active = voucherFilter === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setVoucherFilter(option.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors touch-manipulation ${
                        active
                          ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                          : 'border-[var(--border)] text-[var(--text-sec)] hover:border-[var(--accent)]/50'
                      }`}
                    >
                      {t[option.labelKey]}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="px-3 sm:px-4 py-2 border-b border-[var(--border)] flex flex-col gap-2 shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                {['all', 'selected', 'unselected'].map((option) => {
                  const active = selectionFilter === option;
                  const label = option === 'selected'
                    ? (t.g2bulkPullFilterSelected || 'Selected')
                    : option === 'unselected'
                      ? (t.g2bulkPullFilterUnselected || 'Unselected')
                      : (t.g2bulkPullFilterAll || 'All');
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setSelectionFilter(option)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors touch-manipulation ${
                        active
                          ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                          : 'border-[var(--border)] text-[var(--text-sec)] hover:border-[var(--accent)]/50'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
                {selectionFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setSelectionFilter('all')}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold border border-[var(--border)] text-[var(--text-sec)] hover:border-[var(--accent)]/50"
                  >
                    {t.g2bulkPullFilterClear || 'Clear filter'}
                  </button>
                )}
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="relative w-full sm:flex-1 sm:min-w-[12rem]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t.g2bulkPullSearch}
                    className="input w-full pl-9 min-h-[44px]"
                  />
                </div>
                <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={selectAllActive}
                  disabled={refreshing}
                  className="btn btn-secondary text-sm min-h-[44px] touch-manipulation w-full sm:w-auto"
                >
                  {t.g2bulkPullSelectAll}
                </button>
                  <button
                    type="button"
                    onClick={clearActive}
                    disabled={refreshing}
                    className="btn btn-secondary text-sm min-h-[44px] touch-manipulation w-full sm:w-auto"
                  >
                    {t.g2bulkPullClear}
                  </button>
                </div>
              </div>
            </div>

            {(error || success) && (
              <div className="px-3 sm:px-5 pt-2 shrink-0">
                {error && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</p>
                )}
                {success && (
                  <p className="text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2">{success}</p>
                )}
              </div>
            )}

            <div className="g2bulk-pull-panel__list flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 sm:px-5 py-3 [-webkit-overflow-scrolling:touch]">
              {refreshing && (
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-2 px-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
                  {t.g2bulkPullRefreshLibrary}
                </div>
              )}
              {activeItems.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] text-center py-12">
                  {t.g2bulkPullNoItems}
                </p>
              ) : (
                <div className="space-y-1.5">
                  <div className="hidden sm:flex items-center gap-2 px-2 pb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    {activeTab === TABS.topups && (
                      <span className="w-11 text-center shrink-0">{t.g2bulkPullCarousel}</span>
                    )}
                    <span className="flex-1">
                      {activeTab === TABS.topups ? t.g2bulkPullGameCol : t.g2bulkPullCategory}
                    </span>
                    <span className="w-[6.5rem] text-center shrink-0">{t.g2bulkPullModeSynced}</span>
                    <span className="w-9 text-center shrink-0">{t.g2bulkPullPick}</span>
                  </div>
                  {activeItems.map((item) => {
                    const key = getItemKey(item);
                    const selected = isSelected(item);
                    const itemMode = activeTab === TABS.topups
                      ? getGameModeIn(selection, item.baseKey)
                      : getVoucherModeIn(selection, item);
                    const inCarousel = activeTab === TABS.topups && selection.carouselBaseKeys.has(item.baseKey);
                    const title = item.baseName || item.title;
                    const inStore = !!item.synced;
                    const voucherTag = item.voucherKind === 'account'
                      ? t.g2bulkPullPlatformTag
                      : item.voucherKind === 'gift'
                        ? t.g2bulkPullGameTag
                        : '';
                    const meta = activeTab === TABS.topups
                      ? `${item.variantCount} ${t.g2bulkPullRegions}${inStore ? ` · ${t.g2bulkPullStoreBadge}` : ''}${selected && itemMode === 'live' ? ` · ${t.g2bulkPullModeLive}` : ''}${inCarousel ? ` · ${t.g2bulkPullCarousel}` : ''}`
                      : `${item.productCount || 0} ${t.g2bulkPullProducts}${voucherTag ? ` · ${voucherTag}` : ''}${inStore ? ` · ${t.g2bulkPullStoreBadge}` : ''}${selected && itemMode === 'live' ? ` · ${t.g2bulkPullModeLive}` : ''}`;

                    return (
                      <div
                        key={String(key)}
                        role="button"
                        tabIndex={0}
                        aria-pressed={selected}
                        onClick={() => toggleItem(item)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleItem(item);
                          }
                        }}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 min-h-[44px] transition-colors cursor-pointer touch-manipulation select-none active:scale-[0.99] ${
                          selected
                            ? 'border-[var(--accent)]/35 bg-[var(--accent)]/5'
                            : inStore
                              ? 'border-green-500/25 bg-green-500/[0.04]'
                              : 'border-[var(--border)] bg-[var(--bg-primary)]/25 active:bg-[var(--bg-primary)]/40'
                        }`}
                      >
                        {activeTab === TABS.topups && (
                          <div
                            className="w-11 shrink-0 flex justify-center pointer-events-auto"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {selected && itemMode === 'sync' ? (
                              <CarouselToggle
                                checked={inCarousel}
                                onToggle={() => toggleCarousel(item)}
                                label={t.g2bulkPullCarousel}
                                title={t.g2bulkPullCarouselHint}
                                className="w-11 h-11 min-w-[44px] min-h-[44px]"
                              />
                            ) : (
                              <span className="w-11 h-11" aria-hidden="true" />
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-2.5 min-w-0 flex-1 pointer-events-none">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt=""
                              draggable={false}
                              className="w-9 h-9 rounded-md object-cover bg-[var(--bg-elevated)] shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-md bg-[var(--bg-elevated)] shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm truncate flex items-center gap-1.5">
                              <span className="truncate">{title}</span>
                              {inStore && (
                                <span className="shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-green-500/15 text-green-300 border border-green-500/25">
                                  {t.g2bulkPullStoreBadge}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-[var(--text-muted)] truncate">{meta}</div>
                            {selected && (
                              <div className="sm:hidden mt-2 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                                <ModeToggle
                                  mode={itemMode}
                                  onChange={(mode) => (
                                    activeTab === TABS.topups
                                      ? setGameMode(item, mode)
                                      : setVoucherMode(item, mode)
                                  )}
                                  t={t}
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        {selected && (
                          <div
                            className="hidden sm:block shrink-0 pointer-events-auto"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ModeToggle
                              mode={itemMode}
                              onChange={(mode) => (
                                activeTab === TABS.topups
                                  ? setGameMode(item, mode)
                                  : setVoucherMode(item, mode)
                              )}
                              t={t}
                            />
                          </div>
                        )}

                        <SelectionIndicator checked={selected} className="w-9 h-9 shrink-0" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="g2bulk-pull-panel__footer px-3 sm:px-4 py-2.5 border-t border-[var(--border)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-[var(--bg-primary)]/40 shrink-0">
              <div className="text-[11px] sm:text-xs text-[var(--text-muted)] space-y-1 min-w-0">
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <span>
                    <span className="font-semibold text-[var(--text-sec)]">{t.g2bulkLaneTopups}:</span>{' '}
                    {selectedCounts.games}
                  </span>
                  <span>
                    <span className="font-semibold text-[var(--text-sec)]">{t.g2bulkLaneVouchers}:</span>{' '}
                    {selectedCounts.vouchers}
                  </span>
                </div>
                {selectedCounts.carousel > 0 && (
                  <div className="inline-flex items-center gap-1 text-[var(--accent)]">
                    <LayoutGrid className="w-3.5 h-3.5" />
                    {selectedCounts.carousel} {t.g2bulkPullInCarousel}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <button type="button" onClick={onClose} className="btn btn-secondary flex-1 sm:flex-none min-h-[44px] touch-manipulation">
                  {t.cancel}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || refreshing}
                  className="btn btn-secondary inline-flex items-center justify-center gap-2 flex-1 sm:flex-none min-h-[44px] touch-manipulation"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {t.g2bulkPullSave}
                </button>
                {onSaveAndSyncRef.current && (
                  <button
                    type="button"
                    onClick={handleSaveAndSync}
                    disabled={saving || refreshing}
                    className="btn btn-primary inline-flex items-center justify-center gap-2 flex-1 sm:flex-none min-h-[44px] touch-manipulation"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />}
                    {t.g2bulkPullSaveAndSync || 'Save & Sync'}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}