import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../ui/Modal';
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
  catalogModeSelectionKeys,
  hasPullSelection,
  normalizeCatalogMode,
  selectionPayloadForCatalogMode,
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

const REGION_LABELS_AR = {
  'Global': 'عالمي',
  'Turkey': 'تركيا',
  'SEA': 'جنوب شرق آسيا',
  'Europe': 'أوروبا',
  'North America': 'أمريكا الشمالية',
  'Latin America': 'أمريكا اللاتينية',
  'Middle East': 'الشرق الأوسط',
  'MENA': 'الشرق الأوسط',
  'Korea': 'كوريا',
  'Japan': 'اليابان',
  'India': 'الهند',
  'Indonesia': 'إندونيسيا',
  'Russia': 'روسيا',
  'China': 'الصين',
  'Brazil': 'البرازيل',
  'Oceania': 'أوقيانوسيا',
  'Taiwan': 'تايوان',
  'Hong Kong': 'هونغ كونغ',
  'Singapore': 'سنغافورة',
  'Philippines': 'الفلبين',
  'Malaysia': 'ماليزيا',
  'Thailand': 'تايلاند',
  'Vietnam': 'فيتنام',
  'Cambodia': 'كمبوديا',
  'UAE': 'الإمارات',
  'Saudi Arabia': 'السعودية',
  'Pakistan': 'باكستان',
  'United Kingdom': 'المملكة المتحدة',
  'Germany': 'ألمانيا',
  'France': 'فرنسا',
  'Italy': 'إيطاليا',
  'Spain': 'إسبانيا',
  'Mexico': 'المكسيك',
  'Argentina': 'الأرجنتين',
  'Egypt': 'مصر',
  'Iraq': 'العراق',
  'Syria': 'سوريا',
  'Jordan': 'الأردن',
  'Lebanon': 'لبنان',
  'Morocco': 'المغرب',
  'Algeria': 'الجزائر',
  'Tunisia': 'تونس',
  'Qatar': 'قطر',
  'Kuwait': 'الكويت',
  'Bahrain': 'البحرين',
  'Oman': 'عمان',
  'Bangladesh': 'بنغلاديش',
  'Nepal': 'نيبال',
  'Sri Lanka': 'سريلانكا',
  'Australia': 'أستراليا',
  'New Zealand': 'نيوزيلندا',
  'Canada': 'كندا',
};

function translateRegion(name, lang) {
  if (lang !== 'ar' || !name) return name;
  const match = name.match(/^(.+)\s*\(([^)]+)\)\s*$/);
  if (match) {
    const base = match[1].trim();
    const region = match[2].trim();
    const translated = REGION_LABELS_AR[region];
    return translated ? `${base} (${translated})` : name;
  }
  return name;
}

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

function buildSelectionFromCatalog(data, catalog, {
  preserveUserEdits = false,
  currentSelection = null,
  catalogMode: _catalogMode = 'sync',
} = {}) {
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

  return baseSets;
}

export default function G2bulkPullPanel({
  open,
  onClose,
  t = {},
  lang = 'en',
  catalogMode = 'sync',
  initialSelection = null,
  onSaved,
  onLoaded,
  onSaveAndSync,
}) {
  const resolvedCatalogMode = normalizeCatalogMode(catalogMode);
  const modeKeys = useMemo(
    () => catalogModeSelectionKeys(resolvedCatalogMode),
    [resolvedCatalogMode],
  );
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
      catalogMode: resolvedCatalogMode,
    });
    setSelection(mergedSets);

    if (notifyParent) {
      onLoadedRef.current?.(
        selectionPayloadForCatalogMode(mergedSets, resolvedCatalogMode),
        resolvedCatalogMode,
        {
          persisted: !!data.persisted,
          fromDatabase: data.databaseSelection,
        },
      );
    }
  }, [resolvedCatalogMode]);

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

  const voucherCatalogItems = useMemo(() => [
    ...catalog.accounts.map((item) => ({ ...item, voucherKind: 'account' })),
    ...catalog.giftCards.map((item) => ({ ...item, voucherKind: 'gift' })),
  ], [catalog.accounts, catalog.giftCards]);

  const tabs = useMemo(() => ([
    {
      id: TABS.topups,
      label: t.g2bulkTopupsNav,
      icon: CATALOG_NAV_ITEMS[0].icon,
      count: catalog.games.length,
    },
    {
      id: TABS.vouchers,
      label: t.g2bulkVouchersNav,
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

  const getVoucherLaneKey = (item) => (
    item.voucherKind === 'account' ? modeKeys.account : modeKeys.gift
  );

  const getItemKey = (item) => {
    if (activeTab === TABS.topups) return String(item.code || '').trim();
    const categoryId = Number(item.categoryId);
    return Number.isFinite(categoryId) ? categoryId : null;
  };

  const cloneSelection = (prev) => ({
    topupSyncBaseKeys: new Set(prev.topupSyncBaseKeys),
    topupLiveBaseKeys: new Set(prev.topupLiveBaseKeys),
    accountSyncCategoryIds: new Set(prev.accountSyncCategoryIds),
    accountLiveCategoryIds: new Set(prev.accountLiveCategoryIds),
    giftSyncCategoryIds: new Set(prev.giftSyncCategoryIds),
    giftLiveCategoryIds: new Set(prev.giftLiveCategoryIds),
    carouselBaseKeys: new Set(prev.carouselBaseKeys),
  });

  const isGameSelectedIn = (state, code) => state[modeKeys.topup].has(code);

  const isVoucherSelectedIn = (state, item) => {
    const laneKey = getVoucherLaneKey(item);
    const categoryId = Number(item.categoryId);
    return Number.isFinite(categoryId) && state[laneKey].has(categoryId);
  };

  const isItemSelectedIn = (state, item) => (
    activeTab === TABS.topups
      ? isGameSelectedIn(state, item.code)
      : isVoucherSelectedIn(state, item)
  );

  const isSelected = (item) => isItemSelectedIn(selection, item);

  const activeItems = useMemo(() => {
    const list = activeTab === TABS.topups ? catalog.games : filteredVoucherItems;
    const q = query.trim().toLowerCase();
    const baseList = !q ? list : list.filter((item) => {
      const name = String(item.name || item.title || '').toLowerCase();
      return name.includes(q);
    });

    const isSelectedInList = (item) => {
      if (activeTab === TABS.topups) {
        const key = String(item.code || '').trim();
        return key ? selection[modeKeys.topup].has(key) : false;
      }
      const laneKey = item.voucherKind === 'account' ? modeKeys.account : modeKeys.gift;
      const categoryId = Number(item.categoryId);
      return Number.isFinite(categoryId) && selection[laneKey].has(categoryId);
    };

    if (selectionFilter === 'selected') {
      return baseList.filter(isSelectedInList);
    }
    if (selectionFilter === 'unselected') {
      return baseList.filter((item) => !isSelectedInList(item));
    }
    return baseList;
  }, [activeTab, catalog.games, filteredVoucherItems, query, selectionFilter, selection, modeKeys]);

  const markSelectionEdited = () => {
    userEditedSelectionRef.current = true;
  };

  const toggleItem = (item) => {
    markSelectionEdited();
    if (activeTab === TABS.topups) {
      const key = item.code;
      setSelection((prev) => {
        const next = cloneSelection(prev);
        if (isGameSelectedIn(prev, key)) {
          next[modeKeys.topup].delete(key);
          next.carouselBaseKeys.delete(key);
        } else {
          next[modeKeys.topup].add(key);
        }
        return next;
      });
      return;
    }

    const itemKey = getItemKey(item);
    if (itemKey == null) return;
    const laneKey = getVoucherLaneKey(item);
    setSelection((prev) => {
      const next = cloneSelection(prev);
      if (isVoucherSelectedIn(prev, item)) {
        next[laneKey].delete(itemKey);
      } else {
        next[laneKey].add(itemKey);
      }
      return next;
    });
  };

  const toggleCarousel = (item) => {
    if (resolvedCatalogMode !== 'sync') return;
    markSelectionEdited();
    const key = item.code;
    setSelection((prev) => {
      const next = cloneSelection(prev);
      if (!next[modeKeys.topup].has(key)) {
        next[modeKeys.topup].add(key);
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
          next[modeKeys.topup].add(item.code);
        });
      } else {
        activeItems.forEach((item) => {
          next[getVoucherLaneKey(item)].add(getItemKey(item));
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
          next[modeKeys.topup].delete(item.code);
          next.carouselBaseKeys.delete(item.code);
        });
      } else {
        activeItems.forEach((item) => {
          next[getVoucherLaneKey(item)].delete(getItemKey(item));
        });
      }
      return next;
    });
  };

  const selectedCounts = useMemo(() => {
    const games = selection[modeKeys.topup].size;
    const platform = selection[modeKeys.account].size;
    const gameVouchers = selection[modeKeys.gift].size;
    return {
      games,
      vouchers: platform + gameVouchers,
      platformVouchers: platform,
      gameVouchers,
      carousel: resolvedCatalogMode === 'sync' ? selection.carouselBaseKeys.size : 0,
    };
  }, [selection, modeKeys, resolvedCatalogMode]);

  const saveSelection = async () => {
    const payload = selectionPayloadForCatalogMode(selection, resolvedCatalogMode);
    const result = await saveG2bulkPullSelection(payload, resolvedCatalogMode);
    onSavedRef.current?.(result.selection || payload, resolvedCatalogMode);
    return result;
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await saveSelection();
      setSuccess(t.g2bulkPullSelectionSaved);
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
      const result = await saveSelection();
      await onSaveAndSyncRef.current?.(result.selection || selectionPayloadForCatalogMode(selection, resolvedCatalogMode), resolvedCatalogMode);
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      zIndex={200}
      ariaLabelledBy="g2bulk-pull-title"
      panelClassName="g2bulk-pull-panel__dialog flex flex-col overflow-hidden max-h-[min(85dvh,720px)] touch-manipulation"
      scrollable={false}
    >
        <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b border-[var(--border)] shrink-0">
          <div className="min-w-0">
            <h3 id="g2bulk-pull-title" className="text-base font-bold truncate">
              {showSelectPhase ? t.g2bulkPullChooseTitle : t.g2bulkPullFromApi}
            </h3>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5 hidden sm:block">
              {showSelectPhase
                ? (resolvedCatalogMode === 'live' ? t.g2bulkCatalogModeLiveHelp : t.g2bulkCatalogModeSyncHelp)
                : t.g2bulkPullFetchingHint}
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
                    ? t.g2bulkPullFilterSelected
                    : option === 'unselected'
                      ? t.g2bulkPullFilterUnselected
                      : t.g2bulkPullFilterAll;
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
                    {t.g2bulkPullFilterClear}
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
                    {activeTab === TABS.topups && resolvedCatalogMode === 'sync' && (
                      <span className="w-11 text-center shrink-0">{t.g2bulkPullCarousel}</span>
                    )}
                    <span className="flex-1">
                      {activeTab === TABS.topups ? t.g2bulkPullGameCol : t.g2bulkPullCategory}
                    </span>
                    <span className="w-9 text-center shrink-0">{t.g2bulkPullPick}</span>
                  </div>
                  {activeItems.map((item) => {
                    const key = getItemKey(item);
                    const selected = isSelected(item);
                    const inCarousel = activeTab === TABS.topups
                      && resolvedCatalogMode === 'sync'
                      && selection.carouselBaseKeys.has(item.code);
                    const title = translateRegion(item.name || item.title, lang);
                    const inStore = !!item.synced;
                    const voucherTag = item.voucherKind === 'account'
                      ? t.g2bulkPullPlatformTag
                      : item.voucherKind === 'gift'
                        ? t.g2bulkPullGameTag
                        : '';
                    const meta = activeTab === TABS.topups
                      ? `${item.code || ''}${inStore ? ` · ${t.g2bulkPullStoreBadge}` : ''}${inCarousel ? ` · ${t.g2bulkPullCarousel}` : ''}`
                      : `${item.productCount || 0} ${t.g2bulkPullProducts}${voucherTag ? ` · ${voucherTag}` : ''}${inStore ? ` · ${t.g2bulkPullStoreBadge}` : ''}`;

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
                        {activeTab === TABS.topups && resolvedCatalogMode === 'sync' && (
                          <div
                            className="w-11 shrink-0 flex justify-center pointer-events-auto"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {selected ? (
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
                          </div>
                        </div>

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
                {onSaveAndSync && resolvedCatalogMode === 'sync' && (
                  <button
                    type="button"
                    onClick={handleSaveAndSync}
                    disabled={saving || refreshing}
                    className="btn btn-primary inline-flex items-center justify-center gap-2 flex-1 sm:flex-none min-h-[44px] touch-manipulation"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />}
                    {t.g2bulkPullSaveAndSync}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
    </Modal>
  );
}