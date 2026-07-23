import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronDown,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  ShoppingBag,
  UserRound,
  X,
  RotateCcw,
} from 'lucide-react';
import {
  ORDER_STATUS_FILTER_IDS,
  canRetryOrderFulfillment,
  countOrdersForFilter,
  filterAdminOrders,
  getAdminOrderOutcome,
  getAdminOrderOutcomeLabel,
  getAdminOrderOutcomeTone,
  getAdminOrdersEmptyMessageKey,
  getOrderStatusFilterOptions,
  isOrderBalanceRefunded,
  isSoftFulfillmentTimeout,
  shouldShowAdminFulfillmentError,
} from '../../lib/adminOrderFilters';
import {
  adminGetUserByUsername,
  adminGetUserProfile,
} from '../../lib/adminModeration';
import { getAdminOrdersPath, getAdminUserPath } from '../../lib/adminRoutes';
import { formatDateTime, formatMessage } from '../../lib/i18n';
import InboxPager from '../notifications/InboxPager';

/** Match recharges / users admin lists */
const PAGE_SIZE = 25;
import {
  formatOrderDisplayId,
  formatOrderItemDisplayName,
  getOrderStatusColorClass,
  getOrderStatusLabel,
  getOrderTopupDeliveryDetails,
} from '../../lib/orderReceipt';
import { isInvoiceReadyForOrder } from '../../lib/invoices';
import { INVOICE_KIND } from '../../lib/invoiceBuilder';
import {
  formatProfileUsername,
  getProfileAdminLabel,
  getProfileDisplayName,
  getProfileUsername,
  isUuidLike,
  profileNamesDiffer,
} from '../../lib/username';

function formatOrderDate(value, lang) {
  if (!value) return '—';
  return formatDateTime(value, lang, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function OrderOutcomeBadge({ order, t }) {
  const outcome = getAdminOrderOutcome(order);
  const tone = getAdminOrderOutcomeTone(outcome);
  return (
    <span className={`admin-order-status admin-order-status--${tone}`}>
      {getAdminOrderOutcomeLabel(outcome, t)}
    </span>
  );
}

function fulfillmentLabel(order, t) {
  const fs = order?.fulfillment_status;
  if (!fs || fs === 'pending') return t.fulfillmentPending || '—';
  if (fs === 'fulfilling') return t.fulfillmentInProgress || fs;
  if (fs === 'fulfilled') return t.fulfillmentDone || fs;
  if (fs === 'failed') return t.fulfillmentFailed || fs;
  if (fs === 'skipped') return t.fulfillmentSkipped || fs;
  return fs;
}

function OrderCustomerBlock({ profile, t, compact = false }) {
  if (!profile) return null;

  const usernameLabel = getProfileAdminLabel(profile, '');
  const showDisplayName = profileNamesDiffer(profile);

  return (
    <div className={compact ? 'min-w-0' : ''}>
      <div className={`font-semibold truncate font-mono text-[var(--accent)] ${compact ? 'text-sm' : ''}`}>
        {usernameLabel || t.adminOrdersUnknownCustomer}
      </div>
      {showDisplayName && (
        <div className="text-xs text-[var(--text-sec)] truncate">{getProfileDisplayName(profile)}</div>
      )}
      {profile.email && (
        <div className="text-xs text-[var(--text-muted)] mt-0.5 break-all">{profile.email}</div>
      )}
    </div>
  );
}

export default function AdminOrdersManager({
  t = {},
  lang = 'ar',
  orders = [],
  loadingOrders = false,
  refreshOrders,
  onNotify,
  onFulfillOrder,
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const notifyError = useCallback((message) => onNotify?.(message, 'error'), [onNotify]);
  const [fulfillingId, setFulfillingId] = useState(null);

  const userFilterParam = searchParams.get('user') || '';
  const highlightOrderId = searchParams.get('order') || '';

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(ORDER_STATUS_FILTER_IDS.ALL);
  const [expandedOrderId, setExpandedOrderId] = useState(highlightOrderId || null);
  const [page, setPage] = useState(1);
  const [resolvedUserId, setResolvedUserId] = useState('');
  const [userFilterProfile, setUserFilterProfile] = useState(null);
  const [userFilterLoading, setUserFilterLoading] = useState(false);

  const statusOptions = useMemo(() => getOrderStatusFilterOptions(t), [t]);

  const userScopedOrders = useMemo(
    () => (resolvedUserId ? orders.filter((order) => order.user_id === resolvedUserId) : orders),
    [orders, resolvedUserId],
  );

  const filteredOrders = useMemo(() => filterAdminOrders(orders, {
    search,
    statusFilter,
    userId: resolvedUserId,
  }), [orders, search, statusFilter, resolvedUserId]);

  const emptyMessageKey = getAdminOrdersEmptyMessageKey({
    search,
    statusFilter,
    userId: resolvedUserId,
  });

  const totalFiltered = filteredOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const rangeStart = totalFiltered === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(totalFiltered, safePage * PAGE_SIZE);
  const pagedOrders = useMemo(
    () => filteredOrders.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredOrders, safePage],
  );

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, resolvedUserId]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    if (!highlightOrderId) return;
    setExpandedOrderId(highlightOrderId);
    const idx = filteredOrders.findIndex((order) => order.id === highlightOrderId);
    if (idx >= 0) {
      setPage(Math.floor(idx / PAGE_SIZE) + 1);
    }
  }, [highlightOrderId, filteredOrders]);

  useEffect(() => {
    if (!userFilterParam) {
      setResolvedUserId('');
      setUserFilterProfile(null);
      return undefined;
    }

    let cancelled = false;
    setUserFilterLoading(true);

    (async () => {
      try {
        let profile;
        if (isUuidLike(userFilterParam)) {
          profile = await adminGetUserProfile(userFilterParam);
          const username = getProfileUsername(profile);
          if (!cancelled && username) {
            navigate(getAdminOrdersPath({
              username,
              orderId: highlightOrderId,
            }), { replace: true });
            return;
          }
        } else {
          profile = await adminGetUserByUsername(userFilterParam);
        }

        if (!cancelled) {
          setResolvedUserId(profile?.id || '');
          setUserFilterProfile(profile);
        }
      } catch (err) {
        if (!cancelled) {
          notifyError(err.message);
          setResolvedUserId('');
          setUserFilterProfile(null);
        }
      } finally {
        if (!cancelled) setUserFilterLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [highlightOrderId, navigate, notifyError, userFilterParam]);

  const clearUserFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('user');
    next.delete('order');
    setSearchParams(next, { replace: true });
  };

  const clearAllFilters = () => {
    setSearch('');
    setSearchInput('');
    setStatusFilter(ORDER_STATUS_FILTER_IDS.ALL);
    clearUserFilter();
  };

  const hasActiveFilters = !!(
    userFilterParam
    || search
    || statusFilter !== ORDER_STATUS_FILTER_IDS.ALL
  );

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    setSearch(searchInput.trim());
  };

  const openUserOrders = (profile) => {
    const username = getProfileUsername(profile);
    if (username) navigate(getAdminOrdersPath({ username }));
  };

  const handleRetryFulfill = async (order) => {
    if (!onFulfillOrder || !order?.id || fulfillingId) return;
    if (isOrderBalanceRefunded(order)) {
      onNotify?.(t.adminOrdersRetryBlockedRefunded || 'Blocked: customer was refunded — re-fulfill would be a free top-up.', 'error');
      return;
    }
    const total = Number(order.total);
    const totalLabel = Number.isFinite(total) ? `$${total.toFixed(2)}` : '—';
    const ref = formatOrderDisplayId(order);
    const hasSupplierId = !!order.g2bulk_order_id;
    const confirmMsg = hasSupplierId
      ? formatMessage(
        t.adminOrdersRetryFulfillConfirmPoll
          || 'Re-check supplier status for {ref}?\n\nOnly polls G2Bulk (no new purchase). Customer paid: {total}.',
        { ref, total: totalLabel },
      )
      : formatMessage(
        t.adminOrdersRetryFulfillConfirmPurchase
          || 'Place a NEW supplier order for {ref}?\n\nThis charges YOUR G2Bulk wallet.\nCustomer paid: {total} (no second wallet charge).\nOnly continue if delivery never arrived.',
        { ref, total: totalLabel },
      );
    if (typeof window !== 'undefined' && !window.confirm(confirmMsg)) return;

    setFulfillingId(order.id);
    try {
      await onFulfillOrder(order.id);
      onNotify?.(t.adminOrdersFulfillRetryStarted, 'success');
      await refreshOrders?.();
    } catch (err) {
      onNotify?.(err?.message || t.adminOrdersFulfillRetryFailed, 'error');
    } finally {
      setFulfillingId(null);
    }
  };

  const renderExpandedDetails = (order) => {
    const items = order.order_items || [];
    const profile = order.profiles;
    const outcome = getAdminOrderOutcome(order);
    const softTimeout = isSoftFulfillmentTimeout(order);
    const refunded = isOrderBalanceRefunded(order);
    const canRetry = canRetryOrderFulfillment(order) && typeof onFulfillOrder === 'function';
    const topup = getOrderTopupDeliveryDetails(order, items);

    return (
      <div className="admin-order-expanded">
        <div className="admin-order-expanded-grid">
          <div>
            <div className="admin-order-expanded-label">{t.adminUserUsernameLabel}</div>
            <div className="admin-order-expanded-value font-mono text-[var(--accent)]">
              {profile ? formatProfileUsername(profile.username) || getProfileAdminLabel(profile) : '—'}
            </div>
          </div>
          <div>
            <div className="admin-order-expanded-label">{t.customerLabel}</div>
            <div className="admin-order-expanded-value">
              {profile ? getProfileDisplayName(profile, t.adminOrdersUnknownCustomer) : t.adminOrdersUnknownCustomer}
            </div>
            {profile?.email && (
              <div className="text-xs text-[var(--text-muted)] mt-0.5 break-all">{profile.email}</div>
            )}
          </div>
          <div>
            <div className="admin-order-expanded-label">{t.orderStatusLabel}</div>
            <div className={`admin-order-expanded-value ${getOrderStatusColorClass(
              outcome === 'success'
                ? 'completed'
                : outcome === 'failed' || outcome === 'cancelled'
                  ? 'cancelled'
                  : 'pending_payment',
            )}`}>
              {getAdminOrderOutcomeLabel(outcome, t)}
            </div>
            <div className="text-[10px] text-[var(--text-muted)] mt-1">
              {getOrderStatusLabel(order.status || 'completed', t)}
              {order.fulfillment_status ? ` · ${fulfillmentLabel(order, t)}` : ''}
            </div>
          </div>
          <div>
            <div className="admin-order-expanded-label">{t.payment}</div>
            <div className="admin-order-expanded-value capitalize">{order.payment_method || '—'}</div>
          </div>
          <div>
            <div className="admin-order-expanded-label">{t.orderId}</div>
            <div className="admin-order-expanded-value font-mono text-xs break-all">{formatOrderDisplayId(order)}</div>
          </div>
          {topup.g2bulkOrderId && (
            <div>
              <div className="admin-order-expanded-label">{t.supplierOrderIdLabel}</div>
              <div className="admin-order-expanded-value font-mono text-xs" dir="ltr">
                #{topup.g2bulkOrderId}
              </div>
            </div>
          )}
        </div>

        {order.payment_reference && (
          <div className="text-xs mt-3">
            <span className="text-[var(--text-muted)]">{t.paymentReference}:</span>{' '}
            <span className="font-mono break-all">{order.payment_reference}</span>
          </div>
        )}

        {topup.hasTopupTarget && (
          <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]/40 px-3 py-2.5 text-xs space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              {t.adminOrderTopupTarget || t.invoiceDeliveryDetailsLabel || 'Top-up target'}
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {topup.gameLabel && (
                <div>
                  <span className="text-[var(--text-muted)]">{t.gameLabel || 'Game'}: </span>
                  <span className="font-medium">{topup.gameLabel}</span>
                  {topup.product ? <span className="text-[var(--text-sec)]"> — {topup.product}</span> : null}
                </div>
              )}
              {topup.playerUid && (
                <div>
                  <span className="text-[var(--text-muted)]">{t.playerUidLabel || 'UID'}: </span>
                  <span className="font-mono" dir="ltr">{topup.playerUid}</span>
                </div>
              )}
              {topup.playerCharname && (
                <div>
                  <span className="text-[var(--text-muted)]">{t.playerNicknameLabel || t.charnameLabel}: </span>
                  <span className="font-medium break-all">{topup.playerCharname}</span>
                </div>
              )}
              {topup.playerServer && (
                <div>
                  <span className="text-[var(--text-muted)]">{t.serverLabel}: </span>
                  <span className="font-mono" dir="ltr">{topup.playerServer}</span>
                </div>
              )}
              {topup.supplierAmount != null && (
                <div>
                  <span className="text-[var(--text-muted)]">{t.adminSupplierCostLabel || 'Supplier cost'}: </span>
                  <span className="font-mono">${Number(topup.supplierAmount).toFixed(3)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {shouldShowAdminFulfillmentError(order) && (
          <div className={`mt-3 text-xs rounded-lg border px-3 py-2 ${
            softTimeout && !refunded
              ? 'text-amber-200/95 border-amber-500/30 bg-amber-500/10'
              : 'text-red-300/90 border-red-500/25 bg-red-500/10'
          }`}
          >
            {String(order.g2bulk_metadata.last_error)}
            {softTimeout && !refunded && (
              <div className="mt-1 opacity-90">{t.adminOrdersSoftTimeoutHint}</div>
            )}
            {refunded && (
              <div className="mt-1 opacity-90">{t.adminOrdersRefundedHint}</div>
            )}
          </div>
        )}

        <div className="text-[var(--text-sec)] mt-4 mb-2 text-xs font-semibold uppercase tracking-wider">
          {t.itemsLabel}
        </div>
        <div className="space-y-2">
          {items.length > 0 ? items.map((item, idx) => (
            <div key={item.id || idx} className="admin-order-item-row">
              <div className="min-w-0">
                <div className="break-words font-medium">
                  {formatOrderItemDisplayName(item, { lang, order })}
                </div>
                {item.player_uid && (
                  <div className="text-[10px] text-[var(--text-muted)] mt-0.5 font-mono" dir="ltr">
                    UID {item.player_uid}
                    {item.player_charname ? ` · ${item.player_charname}` : ''}
                  </div>
                )}
              </div>
              <span className="font-mono text-[var(--accent)] flex-shrink-0">
                ${parseFloat(item.price).toFixed(2)} × {item.quantity || 1}
              </span>
            </div>
          )) : (
            <div className="text-[var(--text-muted)] text-xs">{t.noItemsRecorded}</div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {canRetry && (
            <button
              type="button"
              disabled={fulfillingId === order.id}
              onClick={() => handleRetryFulfill(order)}
              className="btn btn-primary text-xs py-2 px-3 inline-flex items-center gap-1.5"
            >
              {fulfillingId === order.id
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <RotateCcw className="w-3.5 h-3.5" />}
              {t.adminOrdersRetryFulfill}
            </button>
          )}
          {isInvoiceReadyForOrder(order, {
            isAdmin: true,
            items: order.order_items || [],
          }) && (
            <button
              type="button"
              onClick={() => navigate(`/invoice/${INVOICE_KIND.ORDER}/${order.id}`)}
              className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t.viewInvoice}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="card p-4 sm:p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex items-start gap-3">
          <span className="admin-list-head-badge" aria-hidden>
            <ShoppingBag className="w-5 h-5" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h3 className="font-bold text-lg sm:text-xl">
              {t.ordersTab}
            </h3>
            <p className="text-xs sm:text-sm text-[var(--text-sec)] mt-0.5 leading-relaxed">
              {t.adminOrdersDesc}
            </p>
            {totalFiltered > 0 && (
              <p className="text-xs text-[var(--text-muted)] mt-1.5" dir="ltr">
                {formatMessage(t.adminListRange, {
                  from: rangeStart,
                  to: rangeEnd,
                  total: totalFiltered,
                })}
                {totalFiltered !== orders.length
                  ? ` · ${formatMessage(t.adminOrdersFilteredOfTotal, { total: orders.length })}`
                  : ''}
              </p>
            )}
          </div>
        </div>
        {refreshOrders && (
          <button
            type="button"
            onClick={refreshOrders}
            className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5 self-start"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t.refresh}
          </button>
        )}
      </div>

      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <div className="input flex items-center gap-2 flex-1 !py-0 !px-2.5">
          <Search className="w-4 h-4 shrink-0 text-[var(--text-muted)] pointer-events-none" aria-hidden />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="flex-1 min-w-0 bg-transparent border-0 outline-none shadow-none py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            placeholder={t.adminOrdersSearchPlaceholder}
          />
        </div>
        <button type="submit" className="btn btn-secondary">{t.adminOrdersSearch}</button>
      </form>

      <div className="space-y-2">
        <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          {t.adminOrdersFilterStatus}
        </div>
        <div className="inbox-filter-bar" role="tablist" aria-label={t.adminOrdersFilterStatus}>
          {statusOptions.map((option) => {
            const count = option.id === ORDER_STATUS_FILTER_IDS.ALL
              ? userScopedOrders.length
              : countOrdersForFilter(userScopedOrders, option.id);
            const active = statusFilter === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStatusFilter(option.id)}
                className={`inbox-filter-chip ${active ? 'inbox-filter-chip--active' : ''}`}
              >
                {option.label}
                <span className="inbox-filter-chip-count">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {userFilterParam && (
        <div className="admin-orders-user-banner">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <UserRound className="w-4 h-4 text-sky-400 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              {userFilterLoading ? (
                <div className="text-sm font-semibold">{t.loading}</div>
              ) : (
                <>
                  <div className="text-sm font-semibold">
                    {formatMessage(t.adminOrdersFilteredUser, {
                      name: getProfileAdminLabel(userFilterProfile || {}, userFilterParam),
                    })}
                  </div>
                  {profileNamesDiffer(userFilterProfile) && (
                    <div className="text-xs text-[var(--text-sec)] mt-0.5">{getProfileDisplayName(userFilterProfile)}</div>
                  )}
                  {userFilterProfile?.email && (
                    <div className="text-xs text-[var(--text-muted)] mt-0.5 break-all">{userFilterProfile.email}</div>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => navigate(getAdminUserPath(getProfileUsername(userFilterProfile)))}
              className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t.adminOrdersViewUserProfile}
            </button>
            <button
              type="button"
              onClick={clearUserFilter}
              className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              {t.adminOrdersClearUserFilter}
            </button>
          </div>
        </div>
      )}

      {hasActiveFilters && !userFilterParam && (
        <div className="flex justify-end">
          <button type="button" onClick={clearAllFilters} className="text-xs text-[var(--accent)] hover:underline">
            {t.adminOrdersClearFilters}
          </button>
        </div>
      )}

      {loadingOrders ? (
        <div className="py-12 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-[var(--accent)]" />
        </div>
      ) : totalFiltered === 0 ? (
        <div className="py-12 text-center space-y-3">
          <p className="text-[var(--text-sec)]">{t[emptyMessageKey] || t.noOrdersYet}</p>
          {hasActiveFilters && (
            <button type="button" onClick={clearAllFilters} className="btn btn-secondary text-xs py-2 px-3">
              {t.adminOrdersClearFilters}
            </button>
          )}
        </div>
      ) : (
        <>
        <div className="space-y-3">
          {pagedOrders.map((order) => {
            const isExpanded = expandedOrderId === order.id;
            const items = order.order_items || [];
            const previewItem = items[0]
              ? formatOrderItemDisplayName(items[0], { lang, order })
              : '';
            const previewUid = items[0]?.player_uid;
            const isFilteredUserOrder = resolvedUserId && order.user_id === resolvedUserId;
            const isHighlight = highlightOrderId && order.id === highlightOrderId;

            return (
              <div
                key={order.id}
                id={isHighlight ? `admin-order-${order.id}` : undefined}
                className={`admin-order-row ${isExpanded ? 'admin-order-row--expanded' : ''}${isHighlight ? ' admin-order-row--highlight' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                  className="admin-order-row-main"
                >
                  <div className="admin-order-row-leading">
                    <div className="admin-order-ref">{formatOrderDisplayId(order)}</div>
                    <OrderOutcomeBadge order={order} t={t} />
                  </div>

                  <div className="admin-order-row-body min-w-0">
                    {!isFilteredUserOrder && (
                      <OrderCustomerBlock profile={order.profiles} t={t} compact />
                    )}
                    {isFilteredUserOrder && previewItem && (
                      <div className="text-sm font-medium truncate">{previewItem}</div>
                    )}
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">
                      {formatOrderDate(order.created_at, lang)}
                      {!isFilteredUserOrder && previewItem ? ` · ${previewItem}` : ''}
                      {previewUid ? ` · UID ${previewUid}` : ''}
                    </div>
                  </div>

                  <div className="admin-order-row-trailing">
                    <div className="font-black text-[var(--accent)]">${parseFloat(order.total || 0).toFixed(2)}</div>
                    <div className="text-[10px] text-[var(--text-sec)] mt-1 capitalize">{order.payment_method || '—'}</div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                      {items.length} {t.items}
                    </div>
                  </div>

                  <ChevronDown className={`admin-order-row-chevron ${isExpanded ? 'admin-order-row-chevron--open' : ''}`} />
                </button>

                {order.user_id && !isFilteredUserOrder && (
                  <div className="admin-order-row-actions">
                    <button
                      type="button"
                      onClick={() => openUserOrders(order.profiles)}
                      className="text-xs text-[var(--accent)] hover:underline inline-flex items-center gap-1"
                    >
                      <UserRound className="w-3 h-3" />
                      {t.adminOrdersViewUserOrders}
                    </button>
                  </div>
                )}

                {isExpanded && renderExpandedDetails(order)}
              </div>
            );
          })}
        </div>
        <InboxPager
          page={safePage}
          totalPages={totalPages}
          total={totalFiltered}
          onPageChange={setPage}
          t={t}
          lang={lang}
          infoKey="adminOrdersPageInfo"
        />
        </>
      )}

    </div>
  );
}