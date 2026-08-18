import { Fragment } from 'react';
import { isOrderPaid } from '../../lib/orderReceipt';

/**
 * 3-step progress for paid orders: Paid → Fulfilling → Delivered.
 * Awaiting-payment orders show "Awaiting payment" on step 1.
 * Failed/cancelled orders render nothing (status label already covers it).
 */
export default function OrderStatusStepper({ order, t = {} }) {
  if (!order || !isOrderPaid(order)) return null;
  if (order.status === 'failed' || order.status === 'cancelled') return null;

  const fs = order.fulfillment_status || 'pending';
  const awaitingPayment = order.status === 'pending_payment' || order.status === 'payment_sent';
  const delivered = fs === 'fulfilled' || fs === 'skipped';

  const steps = [
    { key: 'paid', label: awaitingPayment ? (t.orderStepAwaitingPayment || 'Awaiting payment') : (t.orderStepPaid || 'Paid'), done: !awaitingPayment },
    { key: 'fulfilling', label: t.orderStepFulfilling || 'Fulfilling', done: delivered },
    { key: 'delivered', label: t.orderStepDelivered || 'Delivered', done: delivered },
  ];

  return (
    <div className="flex items-center py-1" aria-label={t.orderStepDelivered || 'Order progress'}>
      {steps.map((step, i) => (
        <Fragment key={step.key}>
          {i > 0 && (
            <div
              className={`h-0.5 flex-1 mx-1.5 rounded-full ${step.done ? 'bg-emerald-400/60' : 'bg-[var(--border-strong)]'}`}
              aria-hidden="true"
            />
          )}
          <div className="flex flex-col items-center gap-1 w-16 sm:w-24 min-w-0">
            <span
              className={`w-2.5 h-2.5 rounded-full ring-2 shrink-0 ${
                step.done
                  ? 'bg-emerald-400 ring-emerald-400/30'
                  : 'bg-[var(--border-strong)] ring-transparent'
              }`}
              aria-hidden="true"
            />
            <span
              className={`text-[10px] leading-tight text-center truncate w-full ${
                step.done ? 'text-emerald-300 font-semibold' : 'text-[var(--text-muted)]'
              }`}
            >
              {step.label}
            </span>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
