import { config } from './config.js';
import { q, tx } from './db.js';

export const ACTIVE_ITEM_STATES = ['printing', 'awaiting_flip', 'flip_ok'];

export const itemsOf = (orderId) => q('SELECT * FROM items WHERE order_id = ? ORDER BY id').all(orderId);

/** Customer-facing stage of an order, derived from its items. */
export function orderStage(order, items) {
  if (order.status !== 'active') return order.status; // pending_payment | collected | cancelled
  const st = items.map((i) => i.status);
  if (st.includes('failed')) return 'attention';
  if (st.includes('held')) return 'awaiting_release';
  if (st.every((s) => s === 'done')) return 'ready';
  if (st.some((s) => ACTIVE_ITEM_STATES.includes(s) || s === 'done')) return 'printing';
  return 'queued';
}

/** Order waits for staff to take cash/UPI at the counter (instead of an online payment). */
export const paysAtCounter = (order) => (order.pay_method ? order.pay_method === 'counter' : config.paymentMode === 'counter');

export function sheetsFor(pageCount, copies, duplex) {
  return (duplex ? Math.ceil(pageCount / 2) : pageCount) * copies;
}

export function itemView(i) {
  const pages = JSON.parse(i.pages_json);
  return {
    id: i.id,
    fileId: i.file_id,
    fileName: i.file_name,
    pageCount: pages.length,
    copies: i.copies,
    color: !!i.color,
    duplex: !!i.duplex,
    sheets: sheetsFor(pages.length, i.copies, !!i.duplex),
    price: i.price,
    status: i.status,
  };
}

export function publicOrderView(order) {
  const items = itemsOf(order.id);
  const paid = order.status !== 'pending_payment' && order.status !== 'cancelled';
  return {
    id: order.id,
    code: order.code,
    customerName: order.customer_name,
    amount: order.amount,
    stage: orderStage(order, items),
    payAtCounter: paysAtCounter(order),
    sensitive: !!order.sensitive,
    pin: paid && order.sensitive && order.status === 'active' ? order.pin : null,
    createdAt: order.created_at,
    paidAt: order.paid_at,
    items: items.map(itemView),
  };
}

/** Idempotently mark an order paid and put its items in the print queue. */
export function markPaid(orderId, paymentRef) {
  return tx(() => {
    const order = q('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order || order.status !== 'pending_payment') return order;
    const now = Date.now();
    q("UPDATE orders SET status = 'active', paid_at = ?, payment_ref = ? WHERE id = ?").run(now, paymentRef, orderId);
    // Private orders wait for the customer to show their PIN at the counter.
    q("UPDATE items SET status = ?, updated_at = ? WHERE order_id = ? AND status = 'pending_payment'")
      .run(order.sensitive ? 'held' : 'queued', now, orderId);
    return q('SELECT * FROM orders WHERE id = ?').get(orderId);
  });
}
