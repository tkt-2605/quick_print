import { config } from './config.js';
import { q } from './db.js';
import { markPaid, paysAtCounter } from './orders.js';
import { hmac, safeEqual, UserError } from './util.js';

const rzpAuth = () => `Basic ${Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString('base64')}`;

/** Create the Razorpay order the checkout popup pays against. */
export async function createGatewayOrder(order) {
  if (config.paymentMode !== 'razorpay') return null;
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: rzpAuth() },
    body: JSON.stringify({ amount: order.amount, currency: 'INR', receipt: order.id, notes: { code: order.code } }),
  });
  if (!res.ok) {
    console.error('[razorpay] order create failed', res.status, await res.text());
    throw new UserError('Payment service is unavailable right now. Please try again.', 502);
  }
  const data = await res.json();
  q('UPDATE orders SET gateway_order_id = ? WHERE id = ?').run(data.id, order.id);
  return data.id;
}

/** Verify the signature the Razorpay checkout hands back to the browser. */
export function confirmCheckout(order, body) {
  if (paysAtCounter(order)) throw new UserError('Please pay at the counter — staff will start your prints.', 400);
  if (config.paymentMode === 'mock') {
    if (!body.mock) throw new UserError('Payment details missing');
    return markPaid(order.id, 'mock');
  }
  const { razorpay_order_id: rzpOrder, razorpay_payment_id: paymentId, razorpay_signature: sig } = body;
  if (!rzpOrder || !paymentId || !sig || rzpOrder !== order.gateway_order_id) throw new UserError('Payment details missing');
  if (!safeEqual(hmac(config.razorpay.keySecret, `${rzpOrder}|${paymentId}`), sig)) {
    throw new UserError('Payment could not be verified', 400);
  }
  return markPaid(order.id, paymentId);
}

/**
 * Ask Razorpay about orders still marked unpaid here. Catches payments whose browser
 * callback and webhook never reached this PC (it was off, or the internet dropped).
 * Razorpay is the record of truth for money; this just brings our queue in line.
 */
export async function reconcilePayments() {
  if (config.paymentMode !== 'razorpay') return;
  const pending = q(`SELECT * FROM orders WHERE status = 'pending_payment' AND gateway_order_id IS NOT NULL
                     AND created_at > ?`).all(Date.now() - 7 * 24 * 3600_000);
  for (const order of pending) {
    try {
      const res = await fetch(`https://api.razorpay.com/v1/orders/${order.gateway_order_id}/payments`, {
        headers: { Authorization: rzpAuth() },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { items = [] } = await res.json();
      const captured = items.find((p) => p.status === 'captured' && p.amount === order.amount);
      if (captured) {
        markPaid(order.id, captured.id);
        console.log(`[razorpay] reconciled order ${order.code}: payment ${captured.id} was captured`);
      }
    } catch (e) {
      console.error(`[razorpay] could not check order ${order.code}:`, e.message);
      return; // probably offline; try again next round
    }
  }
}

/**
 * Razorpay webhook (payment.captured / order.paid). Backup path in case the
 * customer closes the browser before the checkout callback reaches us.
 */
export function razorpayWebhook(req, res) {
  const secret = config.razorpay.webhookSecret;
  const sig = req.get('x-razorpay-signature');
  if (!secret || !sig || !Buffer.isBuffer(req.body) || !safeEqual(hmac(secret, req.body), sig)) {
    return res.status(400).json({ error: 'bad signature' });
  }
  const event = JSON.parse(req.body.toString('utf8'));
  const payment = event.payload?.payment?.entity;
  if ((event.event === 'payment.captured' || event.event === 'order.paid') && payment?.order_id) {
    const order = q('SELECT * FROM orders WHERE gateway_order_id = ?').get(payment.order_id);
    if (order && payment.amount === order.amount) markPaid(order.id, payment.id);
  }
  res.json({ ok: true });
}
