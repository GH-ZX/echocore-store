import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Loader2, Search, Gamepad2, UserCircle, Ticket, CheckSquare, Square,
  LayoutGrid, Save, X,
} from 'lucide-react';
import { listG2bulkPullCatalog, saveG2bulkPullSelection } from '../../lib/g2bulk';
import {
  alignSelectionSetsToCatalog,
  applySyncedCatalogToSelection,
  selectionPayloadFromSets,
  selectionSetsFromPayload,
} from '../../lib/pullCatalogUtils';

const TABS = {
  games: 'games',
  accounts: 'accounts',
  giftCards: 'giftCards',
};

function emptySelection() {
  return {
    topupSyncBaseKeys: new Set(),
    topupLiveBaseKeys: new Set(),
    accountCategoryIds: new Set(),
    giftCategoryIds: new Set(),
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

function ModeToggle({ mode, onChange, isAr, className = '' }) {
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
        {isAr ? 'مزامَن' : 'Synced'}
      </button>
      <button
        type="button"
        onClick={() => onChange('live')}
        className={`px-2.5 py-2 min-h-[40px] min-w-[3.25rem] text-[11px] font-semibold touch-manipulation transition-colors border-l border-[var(--border)] ${
          mode === 'live'
            ? 'bg-cyan-500/15 text-cyan-300'
            : 'bg-[var(--bg-primary)]/40 text-[var(--text-muted)]'
        }`}
      >
        {isAr ? 'مباشر' : 'Live'}
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

export default function G2bulkPullPanel({
  open,
  onClose,
  lang = 'ar',
  includeGiftCards = true,
  initialSelection = null,
  onSaved,
  onLoaded,
}) {
  const isAr = lang === 'ar';
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState(TABS.games);
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState({ games: [], accounts: [], giftCards: [] });
  const [selection, setSelection] = useState(emptySelection());
  const userEditedSelectionRef = useRef(false);

  const applyCatalogData = useCallback((data, { preserveUserEdits = false } = {}) => {
    const nextCatalog = {
      games: data.games || [],
      accounts: data.accounts || [],
      giftCards: data.giftCards || [],
    };
    setCatalog(nextCatalog);
    const effectiveSelection = data.selection || data.databaseSelection || {};

    setSelection((current) => {
      const baseSets = preserveUserEdits && userEditedSelectionRef.current
        ? alignSelectionSetsToCatalog(current, nextCatalog)
        : alignSelectionSetsToCatalog(
          selectionSetsFromPayload(effectiveSelection, nextCatalog),
          nextCatalog,
        );
      const mergedSets = applySyncedCatalogToSelection(nextCatalog, baseSets);
      onLoaded?.(selectionPayloadFromSets(mergedSets), data.catalogMode, {
        persisted: !!data.persisted,
        fromDatabase: data.databaseSelection,
      });
      return mergedSets;
    });
  }, [onLoaded]);

  const loadCatalog = useCallback(async ({ background = false } = {}) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    if (!background) setError('');
    try {
      const data = await listG2bulkPullCatalog({ refresh: background });
      applyCatalogData(data, { preserveUserEdits: background });
    } catch (err) {
      if (!background) {
        setError(err.message || (isAr ? 'تعذر تحميل الكتالوج' : 'Failed to load catalog'));
      }
    } finally {
      if (background) setRefreshing(false);
      else setLoading(false);
    }
  }, [applyCatalogData, isAr]);

  useEffect(() => {
    if (!open) return;
    userEditedSelectionRef.current = false;
    setQuery('');
    setSuccess('');
    setActiveTab(TABS.games);
    if (initialSelection) {
      setSelection(selectionSetsFromPayload(initialSelection, catalog));
    }
    const hasCatalog = catalog.games.length > 0
      || catalog.accounts.length > 0
      || catalog.giftCards.length > 0;
    if (hasCatalog) {
      loadCatalog({ background: true });
    } else {
      loadCatalog({ background: false });
    }
  }, [open, loadCatalog, catalog, initialSelection]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const tabs = useMemo(() => {
    const items = [
      { id: TABS.games, label: isAr ? 'الألعاب' : 'Games', icon: Gamepad2, count: catalog.games.length },
      { id: TABS.accounts, label: isAr ? 'الحسابات' : 'Accounts', icon: UserCircle, count: catalog.accounts.length },
    ];
    if (includeGiftCards) {
      items.push({
        id: TABS.giftCards,
        label: isAr ? 'بطاقات' : 'Gifts',
        icon: Ticket,
        count: catalog.giftCards.length,
      });
    }
    return items;
  }, [catalog, includeGiftCards, isAr]);

  const activeItems = useMemo(() => {
    const list = activeTab === TABS.games
      ? catalog.games
      : activeTab === TABS.accounts
        ? catalog.accounts
        : catalog.giftCards;
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((item) => {
      const name = String(item.baseName || item.title || '').toLowerCase();
      return name.includes(q);
    });
  }, [activeTab, catalog, query]);

  const activeKey = activeTab === TABS.games
    ? 'topupBaseKeys'
    : activeTab === TABS.accounts
      ? 'accountCategoryIds'
      : 'giftCategoryIds';

  const getItemKey = (item) => (
    activeTab === TABS.games ? item.baseKey : item.categoryId
  );

  const cloneSelection = (prev) => ({
    topupSyncBaseKeys: new Set(prev.topupSyncBaseKeys),
    topupLiveBaseKeys: new Set(prev.topupLiveBaseKeys),
    accountCategoryIds: new Set(prev.accountCategoryIds),
    giftCategoryIds: new Set(prev.giftCategoryIds),
    carouselBaseKeys: new Set(prev.carouselBaseKeys),
  });

  const isGameSelectedIn = (state, baseKey) => (
    state.topupSyncBaseKeys.has(baseKey) || state.topupLiveBaseKeys.has(baseKey)
  );

  const isGameSelected = (baseKey) => isGameSelectedIn(selection, baseKey);

  const getGameModeIn = (state, baseKey) => (
    state.topupLiveBaseKeys.has(baseKey) ? 'live' : 'sync'
  );

  const getGameMode = (baseKey) => getGameModeIn(selection, baseKey);

  const markSelectionEdited = () => {
    userEditedSelectionRef.current = true;
  };

  const isSelected = (item) => {
    if (activeTab === TABS.games) return isGameSelected(item.baseKey);
    return selection[activeKey].has(getItemKey(item));
  };

  const toggleItem = (item) => {
    markSelectionEdited();
    if (activeTab === TABS.games) {
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

    const key = getItemKey(item);
    setSelection((prev) => {
      const next = cloneSelection(prev);
      if (next[activeKey].has(key)) next[activeKey].delete(key);
      else next[activeKey].add(key);
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
      if (activeTab === TABS.games) {
        activeItems.forEach((item) => {
          next.topupSyncBaseKeys.add(item.baseKey);
          next.topupLiveBaseKeys.delete(item.baseKey);
        });
      } else {
        activeItems.forEach((item) => next[activeKey].add(getItemKey(item)));
      }
      return next;
    });
  };

  const clearActive = () => {
    markSelectionEdited();
    setSelection((prev) => {
      const next = cloneSelection(prev);
      if (activeTab === TABS.games) {
        activeItems.forEach((item) => {
          next.topupSyncBaseKeys.delete(item.baseKey);
          next.topupLiveBaseKeys.delete(item.baseKey);
          next.carouselBaseKeys.delete(item.baseKey);
        });
      } else {
        activeItems.forEach((item) => next[activeKey].delete(getItemKey(item)));
      }
      return next;
    });
  };

  const selectedCounts = useMemo(() => ({
    games: selection.topupSyncBaseKeys.size + selection.topupLiveBaseKeys.size,
    syncGames: selection.topupSyncBaseKeys.size,
    liveGames: selection.topupLiveBaseKeys.size,
    accounts: selection.accountCategoryIds.size,
    giftCards: selection.giftCategoryIds.size,
    carousel: selection.carouselBaseKeys.size,
  }), [selection]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = selectionPayloadFromSets(selection);
      const result = await saveG2bulkPullSelection(payload);
      setSuccess(isAr ? 'تم حفظ الاختيار' : 'Selection saved');
      onSaved?.(result.selection || payload, result.catalogMode);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || (isAr ? 'فشل الحفظ' : 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const tabGridClass = tabs.length >= 3 ? 'grid-cols-3' : 'grid-cols-2';

  const panel = (
    <div className="g2bulk-pull-panel fixed inset-0 z-[200] flex items-stretch sm:items-center justify-center p-0 sm:p-2 lg:p-3 touch-manipulation overscroll-none">
      <button
        type="button"
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px] touch-manipulation"
        aria-label={isAr ? 'إغلاق' : 'Close'}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="g2bulk-pull-title"
        className="g2bulk-pull-panel__dialog relative w-full h-full sm:h-[98dvh] sm:max-w-[min(96rem,calc(100vw-1rem))] lg:max-w-7xl flex flex-col rounded-none sm:rounded-2xl border-0 sm:border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b border-[var(--border)] shrink-0">
          <div className="min-w-0">
            <h3 id="g2bulk-pull-title" className="text-base font-bold truncate flex items-center gap-2">
              <span className="truncate">{isAr ? 'سحب من API' : 'Pull from API'}</span>
              {refreshing && <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-muted)] shrink-0" />}
            </h3>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5 hidden sm:block">
              {isAr
                ? 'العناصر الموجودة في المتجر تظهر محددة تلقائياً.'
                : 'Items already in your store are pre-selected.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary p-2.5 min-w-[44px] min-h-[44px] shrink-0 touch-manipulation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="g2bulk-pull-panel__tabs px-3 sm:px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-primary)]/50 shrink-0">
          <div className={`grid ${tabGridClass} gap-1.5`}>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const selected = tab.id === TABS.games
                ? selectedCounts.games
                : tab.id === TABS.accounts
                  ? selectedCounts.accounts
                  : selectedCounts.giftCards;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-pressed={isActive}
                  className={`g2bulk-pull-panel__tab flex flex-col items-center justify-center gap-0.5 rounded-lg border px-1.5 py-2 min-h-[52px] text-center transition-colors touch-manipulation active:scale-[0.98] ${
                    isActive
                      ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_35%,transparent)]'
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
        </div>

        <div className="px-3 sm:px-4 py-2 border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-center gap-2 shrink-0">
          <div className="relative w-full sm:flex-1 sm:min-w-[12rem]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isAr ? 'بحث…' : 'Search…'}
              className="input w-full pl-9 min-h-[44px]"
            />
          </div>
          <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto">
            <button type="button" onClick={selectAllActive} className="btn btn-secondary text-sm min-h-[44px] touch-manipulation w-full sm:w-auto">
              {isAr ? 'تحديد الكل' : 'Select all'}
            </button>
            <button type="button" onClick={clearActive} className="btn btn-secondary text-sm min-h-[44px] touch-manipulation w-full sm:w-auto">
              {isAr ? 'إلغاء التحديد' : 'Clear'}
            </button>
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
          {loading ? (
            <div className="flex items-center justify-center py-16 text-[var(--text-sec)]">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
            </div>
          ) : activeItems.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] text-center py-12">
              {isAr ? 'لا توجد عناصر مطابقة.' : 'No matching items.'}
            </p>
          ) : (
            <div className="space-y-1.5 xl:grid xl:grid-cols-2 xl:gap-x-3 xl:gap-y-1.5 xl:space-y-0">
              {activeTab === TABS.games && (
                <div className="hidden sm:flex xl:col-span-2 items-center gap-2 px-2 pb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                  <span className="w-11 text-center shrink-0">{isAr ? 'كاروسيل' : 'Carousel'}</span>
                  <span className="flex-1">{isAr ? 'اللعبة' : 'Game'}</span>
                  <span className="w-[6.5rem] text-center shrink-0">{isAr ? 'الوضع' : 'Mode'}</span>
                  <span className="w-9 text-center shrink-0">{isAr ? 'اختيار' : 'Pick'}</span>
                </div>
              )}
              {activeItems.map((item) => {
                const key = getItemKey(item);
                const selected = isSelected(item);
                const gameMode = activeTab === TABS.games ? getGameMode(item.baseKey) : 'sync';
                const inCarousel = activeTab === TABS.games && selection.carouselBaseKeys.has(item.baseKey);
                const title = item.baseName || item.title;
                const inStore = !!item.synced;
                const meta = activeTab === TABS.games
                  ? `${item.variantCount} ${isAr ? 'منطقة' : 'regions'}${inStore ? ` · ${isAr ? 'في المتجر' : 'in store'}` : ''}${selected && gameMode === 'live' ? ` · ${isAr ? 'مباشر' : 'live'}` : ''}${inCarousel ? ` · ${isAr ? 'كاروسيل' : 'carousel'}` : ''}`
                  : `${item.productCount || 0} ${isAr ? 'منتج' : 'products'}${inStore ? ` · ${isAr ? 'في المتجر' : 'in store'}` : ''}`;

                return (
                  <div
                    key={String(key)}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                    aria-label={`${title}${selected ? (isAr ? '، محدد' : ', selected') : ''}`}
                    onClick={() => toggleItem(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleItem(item);
                      }
                    }}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 min-h-[44px] transition-colors cursor-pointer touch-manipulation select-none active:scale-[0.99] ${
                      selected
                        ? gameMode === 'live'
                          ? 'border-cyan-500/35 bg-cyan-500/5'
                          : 'border-[var(--accent)]/35 bg-[var(--accent)]/5'
                        : inStore
                          ? 'border-green-500/25 bg-green-500/[0.04]'
                          : 'border-[var(--border)] bg-[var(--bg-primary)]/25 active:bg-[var(--bg-primary)]/40'
                    }`}
                  >
                    {activeTab === TABS.games && (
                      <div
                        className="w-11 shrink-0 flex justify-center pointer-events-auto"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {selected && gameMode === 'sync' ? (
                          <CarouselToggle
                            checked={inCarousel}
                            onToggle={() => toggleCarousel(item)}
                            label={isAr ? 'كاروسيل' : 'Carousel'}
                            title={isAr ? 'عرض في السلايدر الرئيسي' : 'Show in hero carousel'}
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
                              {isAr ? 'متجر' : 'Store'}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[var(--text-muted)] truncate">{meta}</div>
                        {activeTab === TABS.games && selected && (
                          <div className="sm:hidden mt-2 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                            <ModeToggle
                              mode={gameMode}
                              onChange={(mode) => setGameMode(item, mode)}
                              isAr={isAr}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {activeTab === TABS.games && selected && (
                      <div
                        className="hidden sm:block shrink-0 pointer-events-auto"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ModeToggle
                          mode={gameMode}
                          onChange={(mode) => setGameMode(item, mode)}
                          isAr={isAr}
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
          <div className="text-[11px] sm:text-xs text-[var(--text-muted)] space-y-0.5 min-w-0">
            <div>
              {isAr ? 'المحدد:' : 'Selected:'}{' '}
              {selectedCounts.games} {isAr ? 'لعبة' : 'games'}
              {selectedCounts.games > 0 && (
                <>
                  {' ('}
                  {selectedCounts.syncGames} {isAr ? 'مزامَن' : 'synced'}
                  {' · '}
                  {selectedCounts.liveGames} {isAr ? 'مباشر' : 'live'}
                  {')'}
                </>
              )}
              {' · '}
              {selectedCounts.accounts} {isAr ? 'حساب' : 'accounts'}
              {includeGiftCards && (
                <>
                  {' · '}
                  {selectedCounts.giftCards} {isAr ? 'بطاقة' : 'gift cards'}
                </>
              )}
            </div>
            {selectedCounts.carousel > 0 && (
              <div className="inline-flex items-center gap-1 text-[var(--accent)]">
                <LayoutGrid className="w-3.5 h-3.5" />
                {selectedCounts.carousel} {isAr ? 'في الكاروسيل' : 'in carousel'}
              </div>
            )}
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1 sm:flex-none min-h-[44px] touch-manipulation">
              {isAr ? 'إغلاق' : 'Close'}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="btn btn-primary inline-flex items-center justify-center gap-2 flex-1 sm:flex-none min-h-[44px] touch-manipulation"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isAr ? 'حفظ الاختيار' : 'Save selection'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}