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
} from 'lucide-react';
import {
  ORDER_STATUS_FILTER_IDS,
  countOrdersForFilter,
  filterAdminOrders,
  getAdminOrdersEmptyMessageKey,
  getOrderStatusFilterOptions,
} from '../../lib/adminOrderFilters';
import {
  adminGetUserByUsername,
  adminGetUserProfile,
} from '../../lib/adminModeration';
import { getAdminOrdersPath, getAdminUserPath } from '../../lib/adminRoutes';
import { formatMessage } from '../../lib/i18n';
import {
  formatOrderDisplayId,
  getOrderStatusColorClass,
  getOrderStatusLabel,
  getOrderStatusTone,
} from '../../lib/orderReceipt';
import { isInvoiceReadyForOrder } from '../../lib/invoices';
import { canManuallyApproveWalletOrder } from '../../lib/paymentMethods';
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
  return new Date(value).toLocaleString(lang === 'ar' ? 'ar-SY' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function OrderStatusBadge({ status, t }) {
  const tone = getOrderStatusTone(status);
  return (
    <span className={`admin-order-status admin-order-status--${tone}`}>
      {getOrderStatusLabel(status || 'completed', t)}
    </span>
  );
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
  onApproveOrder,
  onRejectOrder,
  onNotify,
  paymentConfig = {},
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const notifyError = useCallback((message) => onNotify?.(message, 'error'), [onNotify]);
  const notifySuccess = useCallback((message) => onNotify?.(message, 'success'), [onNotify]);

  const userFilterParam = searchParams.get('user') || '';
  const highlightOrderId = searchParams.get('order') || '';

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(ORDER_STATUS_FILTER_IDS.ALL);
  const [expandedOrderId, setExpandedOrderId] = useState(highlightOrderId || null);
  const [processingOrderId, setProcessingOrderId] = useState(null);
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

  useEffect(() => {
    if (highlightOrderId) {
      setExpandedOrderId(highlightOrderId);
    }
  }, [highlightOrderId]);

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

  const isAwaitingWalletPayment = (order) => (
    (order.payment_method === 'ShamCash' || order.payment_method === 'SyriatelCash')
    && (order.status === 'pending_payment' || order.status === 'payment_sent')
  );

  const canApproveOrder = (order) => (
    canManuallyApproveWalletOrder(order, paymentConfig) && onApproveOrder
  );

  const canRejectOrder = (order) => (
    isAwaitingWalletPayment(order) && onRejectOrder
  );

  const handleApproveOrder = async (orderId) => {
    if (!onApproveOrder) return;
    setProcessingOrderId(orderId);
    try {
      await onApproveOrder(orderId);
      notifySuccess(t.orderApproved);
    } catch (err) {
      notifyError(err.message);
    } finally {
      setProcessingOrderId(null);
    }
  };

  const handleRejectOrder = async (orderId) => {
    if (!onRejectOrder) return;
    setProcessingOrderId(orderId);
    try {
      await onRejectOrder(orderId);
      notifySuccess(t.orderRejected);
    } catch (err) {
      notifyError(err.message);
    } finally {
      setProcessingOrderId(null);
    }
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    setSearch(searchInput.trim());
  };

  const openUserOrders = (profile) => {
    const username = getProfileUsername(profile);
    if (username) navigate(getAdminOrdersPath({ username }));
  };

  const renderExpandedDetails = (order) => {
    const items = order.order_items || [];
    const profile = order.profiles;

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
            <div className={`admin-order-expanded-value ${getOrderStatusColorClass(order.status)}`}>
              {getOrderStatusLabel(order.status || 'completed', t)}
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
        </div>

        {order.payment_reference && (
          <div className="text-xs mt-3">
            <span className="text-[var(--text-muted)]">{t.paymentReference}:</span>{' '}
            <span className="font-mono break-all">{order.payment_reference}</span>
          </div>
        )}

        {(canApproveOrder(order) || canRejectOrder(order)) && (
          <div className="flex flex-wrap gap-2 mt-4">
            {canApproveOrder(order) && (
              <button
                type="button"
                onClick={() => handleApproveOrder(order.id)}
                disabled={processingOrderId === order.id}
                className="btn btn-primary text-xs py-2 px-3"
              >
                {processingOrderId === order.id ? t.sending : t.approveShort}
              </button>
            )}
            {canRejectOrder(order) && (
              <button
                type="button"
                onClick={() => handleRejectOrder(order.id)}
                disabled={processingOrderId === order.id}
                className="btn btn-secondary text-xs py-2 px-3"
              >
                {t.rejectShort}
              </button>
            )}
          </div>
        )}

        <div className="text-[var(--text-sec)] mt-4 mb-2 text-xs font-semibold uppercase tracking-wider">
          {t.itemsLabel}
        </div>
        <div className="space-y-2">
          {items.length > 0 ? items.map((item, idx) => (
            <div key={idx} className="admin-order-item-row">
              <span className="min-w-0 break-words">{item.name_snapshot}</span>
              <span className="font-mono text-[var(--accent)] flex-shrink-0">
                ${parseFloat(item.price).toFixed(2)} × {item.quantity || 1}
              </span>
            </div>
          )) : (
            <div className="text-[var(--text-muted)] text-xs">{t.noItemsRecorded}</div>
          )}
        </div>

        {isInvoiceReadyForOrder(order, { isAdmin: true }) && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => navigate(`/invoice/${INVOICE_KIND.ORDER}/${order.id}`)}
              className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t.viewInvoice}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="card p-4 sm:p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex items-start gap-3">
          <ShoppingBag className="w-5 h-5 text-[var(--accent)] mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-bold text-lg sm:text-xl">
              {t.ordersTab}
              {' '}
              <span className="text-[var(--text-muted)] font-semibold">
                ({filteredOrders.length}{filteredOrders.length !== orders.length ? ` / ${orders.length}` : ''})
              </span>
            </h3>
            <p className="text-xs text-[var(--text-sec)] mt-0.5">{t.adminOrdersDesc}</p>
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
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-[var(--text-muted)]" />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="input w-full ps-9"
            placeholder={t.adminOrdersSearchPlaceholder}
          />
        </div>
        <button type="submit" className="btn btn-secondary">{t.adminOrdersSearch}</button>
      </form>

      <div className="space-y-2">
        <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          {t.adminOrdersFilterStatus}
        </div>
        <div className="inbox-filter-bar">
          {statusOptions.map((option) => {
            const count = option.id === ORDER_STATUS_FILTER_IDS.ALL
              ? userScopedOrders.length
              : countOrdersForFilter(userScopedOrders, option.id);
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setStatusFilter(option.id)}
                className={`inbox-filter-chip ${statusFilter === option.id ? 'inbox-filter-chip--active' : ''}`}
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
      ) : filteredOrders.length === 0 ? (
        <div className="py-12 text-center space-y-3">
          <p className="text-[var(--text-sec)]">{t[emptyMessageKey] || t.noOrdersYet}</p>
          {hasActiveFilters && (
            <button type="button" onClick={clearAllFilters} className="btn btn-secondary text-xs py-2 px-3">
              {t.adminOrdersClearFilters}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const isExpanded = expandedOrderId === order.id;
            const items = order.order_items || [];
            const previewItem = items[0]?.name_snapshot;
            const isFilteredUserOrder = resolvedUserId && order.user_id === resolvedUserId;

            return (
              <div
                key={order.id}
                className={`admin-order-row ${isExpanded ? 'admin-order-row--expanded' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                  className="admin-order-row-main"
                >
                  <div className="admin-order-row-leading">
                    <div className="admin-order-ref">{formatOrderDisplayId(order)}</div>
                    <OrderStatusBadge status={order.status} t={t} />
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
                      {isFilteredUserOrder && !previewItem ? '' : ''}
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
          }          )}
        </div>
      )}

    </div>
  );
}