import { useMemo, useState } from 'react';
import {
  ShoppingBag,
  Copy,
  Check,
  ExternalLink,
  ChevronLeft,
  Search,
  KeyRound,
} from 'lucide-react';
import {
  extractDeliveryCodes,
  formatOrderDisplayId,
  getOrderStatusLabel,
  getOrderStatusColorClass,
  getOrderTopupDeliveryDetails,
} from '../../../lib/orderReceipt';
import { isInvoiceReadyForOrder } from '../../../lib/invoices';
import { INVOICE_KIND } from '../../../lib/invoiceBuilder';
import { filterUserOrders, ORDER_STATUS_FILTERS, formatMoney } from '../../../lib/userDashboard';

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function formatDateTime(dateStr, lang) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString(lang === 'ar' ? 'ar-SY-u-nu-latn' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ProfileOrdersPanel({
  t = {},
  lang = 'ar',
  orders = [],
  navigate,
  paymentLabel,
  compact = false,
  onOpenAll,
}) {
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [copied, setCopied] = useState('');

  const filtered = useMemo(
    () => filterUserOrders(orders, { status, query }),
    [orders, status, query],
  );

  const list = compact ? filtered.slice(0, 5) : filtered;
  const selected = selectedId
    ? orders.find((o) => o.id === selectedId) || null
    : null;

  const handleCopy = async (key, text) => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(key);
      window.setTimeout(() => setCopied(''), 1600);
    }
  };

  if (selected && !compact) {
    const items = selected.order_items || [];
    const codes = extractDeliveryCodes(items, selected.g2bulk_metadata);
    const topup = getOrderTopupDeliveryDetails(selected, items);
    const invoiceReady = isInvoiceReadyForOrder(selected, { items });
    const invoicePath = `/invoice/${INVOICE_KIND.ORDER}/${selected.id}`;
    const successPath = `/success?orderId=${selected.id}`;

    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="inline-flex items-center gap-1 text-sm text-[var(--accent)] hover:underline"
        >
          <ChevronLeft className="w-4 h-4" />
          {t.dashBackToOrders}
        </button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-mono text-[var(--text-muted)]">
              #{formatOrderDisplayId(selected)}
            </p>
            <p className={`text-sm font-semibold mt-1 ${getOrderStatusColorClass(selected.status)}`}>
              {getOrderStatusLabel(selected.status, t)}
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {formatDateTime(selected.created_at, lang)}
              {selected.payment_method
                ? ` · ${paymentLabel?.(selected.payment_method) || selected.payment_method}`
                : ''}
            </p>
          </div>
          <p className="text-xl font-black text-[var(--accent)]">
            {formatMoney(selected.total)}
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-bold">{t.dashOrderItems}</h3>
          {items.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">—</p>
          ) : (
            items.map((item) => (
              <div
                key={item.id || `${item.offer_id}-${item.name_snapshot}`}
                className="profile-list-item text-sm flex justify-between gap-2"
              >
                <span className="min-w-0 truncate font-semibold">
                  {item.name_snapshot || '—'}
                  {item.quantity > 1 ? ` ×${item.quantity}` : ''}
                </span>
                <span className="font-mono flex-shrink-0">
                  {formatMoney(item.price)}
                </span>
              </div>
            ))
          )}
        </div>

        {(topup.playerUid || topup.playerServer || topup.playerCharname) && (
          <div className="rounded-xl border border-[var(--border)] p-3 space-y-1 text-sm">
            <h3 className="text-sm font-bold mb-2">{t.dashDeliveryTarget}</h3>
            {topup.playerUid ? (
              <p>
                <span className="text-[var(--text-muted)]">{t.profileDefaultUid}: </span>
                <span className="font-mono" dir="ltr">{topup.playerUid}</span>
              </p>
            ) : null}
            {topup.playerServer ? (
              <p>
                <span className="text-[var(--text-muted)]">{t.dashServerField}: </span>
                <span className="font-mono" dir="ltr">{topup.playerServer}</span>
              </p>
            ) : null}
            {topup.playerCharname ? (
              <p>
                <span className="text-[var(--text-muted)]">{t.dashCharNameField}: </span>
                <span dir="ltr">{topup.playerCharname}</span>
              </p>
            ) : null}
          </div>
        )}

        <div className="rounded-xl border border-[var(--border)] p-3 space-y-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[var(--accent)]" />
            {t.dashRedeemCodes}
          </h3>
          {codes.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">{t.dashNoCodesYet}</p>
          ) : (
            <>
              {codes.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleCopy('all', codes.join('\n'))}
                  className="btn btn-secondary text-xs gap-1.5"
                >
                  {copied === 'all' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied === 'all' ? t.copied : t.copyAllCodes}
                </button>
              )}
              <ul className="space-y-2">
                {codes.map((code, idx) => (
                  <li
                    key={`${code}-${idx}`}
                    className="flex items-center gap-2 rounded-lg bg-[var(--bg-primary)]/50 border border-[var(--border)] px-3 py-2"
                  >
                    <code className="flex-1 font-mono text-sm break-all" dir="ltr">{code}</code>
                    <button
                      type="button"
                      onClick={() => handleCopy(`c-${idx}`, code)}
                      className="btn btn-secondary !p-2"
                      title={t.copyCode}
                    >
                      {copied === `c-${idx}`
                        ? <Check className="w-4 h-4 text-emerald-400" />
                        : <Copy className="w-4 h-4" />}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {invoiceReady && (
            <button
              type="button"
              onClick={() => navigate(invoicePath)}
              className="btn btn-primary gap-2 text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              {t.viewInvoice || t.invoice}
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate(successPath)}
            className="btn btn-secondary gap-2 text-sm"
          >
            {t.dashOpenReceipt}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="input flex items-center gap-2 flex-1 !py-0 !px-2.5">
            <Search className="w-4 h-4 shrink-0 text-[var(--text-muted)] pointer-events-none" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.dashSearchOrders}
              className="flex-1 min-w-0 bg-transparent border-0 outline-none shadow-none py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="input text-sm sm:w-44"
          >
            {ORDER_STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s === 'all' ? t.dashFilterAll : getOrderStatusLabel(s, t)}
              </option>
            ))}
          </select>
        </div>
      )}

      {list.length === 0 ? (
        <div className="text-center py-10 text-[var(--text-sec)]">
          <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{t.noOrdersYet}</p>
          {navigate && (
            <button
              type="button"
              onClick={() => navigate('/games')}
              className="action-chip btn btn-secondary mt-4 !h-11"
            >
              {t.shopNow}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
          {list.map((order) => {
            const items = order.order_items || [];
            const preview = items.map((i) => i.name_snapshot).join(', ') || '—';
            const codes = extractDeliveryCodes(items, order.g2bulk_metadata);
            return (
              <button
                key={order.id}
                type="button"
                onClick={() => {
                  if (compact) {
                    onOpenAll?.();
                    return;
                  }
                  setSelectedId(order.id);
                }}
                className="profile-list-item w-full text-left group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-[var(--text-muted)]">
                      #{formatOrderDisplayId(order)}
                    </p>
                    <p className="text-sm font-semibold mt-0.5 truncate group-hover:text-[var(--accent)] transition-colors">
                      {preview}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">
                      {formatDateTime(order.created_at, lang)}
                      {codes.length > 0 ? ` · ${codes.length} ${t.dashCodesCount || 'codes'}` : ''}
                    </p>
                  </div>
                  <div className="text-end flex-shrink-0">
                    <p className="font-black text-[var(--accent)]">{formatMoney(order.total)}</p>
                    <p className={`text-[10px] mt-0.5 font-semibold ${getOrderStatusColorClass(order.status)}`}>
                      {getOrderStatusLabel(order.status, t)}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {compact && orders.length > 5 && onOpenAll && (
        <button
          type="button"
          onClick={onOpenAll}
          className="text-sm text-[var(--accent)] font-semibold hover:underline"
        >
          {t.dashViewAllOrders}
        </button>
      )}
    </div>
  );
}
