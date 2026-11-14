// Checks a fulfillOrder call makes on the order row before doing anything with the supplier.
// They run twice: on the row read before taking the per-order lock (cheap early answers) and
// again on the row re-read AFTER the lock is held, because another invocation may have changed
// the order in between (fulfilled it, refunded it, recorded a supplier order id). Decisions are
// only ever made on the copy read under the lock. Pure: no Deno or Supabase imports (unit tested
// from src/lib/fulfillmentGate.test.js).

type Row = Record<string, unknown>;

export type GateResult =
  | { proceed: true }
  | { proceed: false; status: number; body: Record<string, unknown> };

export function fulfillmentGate(
  order: Row | null | undefined,
  caller: { userId: string | null; admin: boolean; serviceAuth: boolean },
): GateResult {
  if (!order) {
    return { proceed: false, status: 404, body: { success: false, message: 'Order not found' } };
  }
  if (!caller.admin && !caller.serviceAuth && order.user_id !== caller.userId) {
    return { proceed: false, status: 403, body: { success: false, message: 'Unauthorized' } };
  }
  if (order.status !== 'completed') {
    return { proceed: false, status: 400, body: { success: false, message: 'Order is not completed' } };
  }
  if (order.fulfillment_status === 'fulfilled') {
    return { proceed: false, status: 200, body: { success: true, skipped: true, fulfillmentStatus: 'fulfilled' } };
  }
  // Manual products are delivered by the store owner from the dashboard (admin_deliver_order).
  // The database marks their paid orders 'awaiting_delivery'; never send them to the supplier.
  if (order.fulfillment_status === 'awaiting_delivery') {
    return {
      proceed: false,
      status: 200,
      body: { success: true, skipped: true, fulfillmentStatus: 'awaiting_delivery' },
    };
  }
  return { proceed: true };
}
