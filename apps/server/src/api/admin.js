import { Router } from 'express';
import { config } from '../config.js';
import { q, tx, getSettings, updateSettings, listPrinters } from '../db.js';
import { createDuplexTestFile, destroyFile, getFile, ingestFile, readPdf } from '../files.js';
import { itemsOf, markPaid, orderStage, paysAtCounter } from '../orders.js';
import { nextOpening, shopStatus } from '../shop.js';
import { printerOnline } from '../routing.js';
import { UserError, hmac, newId, safeEqual } from '../util.js';
import { fileView, upload, uploadName } from './public.js';

const r = Router();
const SESSION_HOURS = 12;

r.post('/login', (req, res) => {
  if (!safeEqual(String(req.body?.password || ''), config.adminPassword)) throw new UserError('Wrong password', 401);
  const exp = Date.now() + SESSION_HOURS * 3600_000;
  res.json({ token: `${exp}.${hmac(config.sessionSecret, `admin:${exp}`)}` });
});

r.use((req, res, next) => {
  const token = (req.get('authorization') || '').replace(/^Bearer /, '');
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now() || !safeEqual(sig, hmac(config.sessionSecret, `admin:${exp}`))) {
    return res.status(401).json({ error: 'Please log in again' });
  }
  next();
});

// ---- queue ----

const printerView = (p) => ({
  id: p.id,
  label: p.label,
  windowsName: p.windows_name,
  color: !!p.color,
  duplex: p.duplex,
  reverseBack: !!p.reverse_back,
  rotateBack: !!p.rotate_back,
  enabled: !!p.enabled,
  status: p.status,
  online: !!printerOnline(p),
  lastSeen: p.last_seen,
});

function adminOrderView(o) {
  const items = itemsOf(o.id);
  return {
    id: o.id,
    code: o.code,
    customerName: o.customer_name,
    phone: o.phone,
    amount: o.amount,
    status: o.status,
    stage: orderStage(o, items),
    payAtCounter: paysAtCounter(o),
    sensitive: !!o.sensitive,
    createdAt: o.created_at,
    paidAt: o.paid_at,
    paidBy: o.payment_ref?.startsWith('counter:') ? o.payment_ref.slice(8) : o.payment_ref ? 'online' : null,
    closedAt: o.closed_at,
    items: items.map((i) => {
      const pages = JSON.parse(i.pages_json);
      return {
        id: i.id,
        fileId: i.file_id,
        fileName: i.file_name,
        pageCount: pages.length,
        copies: i.copies,
        color: !!i.color,
        duplex: !!i.duplex,
        sheets: (i.duplex ? Math.ceil(pages.length / 2) : pages.length) * i.copies,
        status: i.status,
        printerId: i.printer_id,
        error: i.error,
      };
    }),
  };
}

r.get('/queue', (req, res) => {
  const since = Date.now() - 12 * 3600_000;
  // Unpaid orders only matter when customers pay at the counter; online checkouts that were abandoned are noise.
  const unpaid = config.paymentMode === 'razorpay'
    ? "OR (status = 'pending_payment' AND pay_method = 'counter')"
    : "OR status = 'pending_payment'";
  const orders = q(`SELECT * FROM orders WHERE status = 'active' ${unpaid}
                       OR (status IN ('collected', 'cancelled') AND closed_at > ?)
                     ORDER BY CASE status WHEN 'pending_payment' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
                              COALESCE(paid_at, created_at) DESC LIMIT 200`).all(since);
  res.json({
    orders: orders.map(adminOrderView),
    printers: listPrinters().map(printerView),
    shop: shopStatus(),
    paymentMode: config.paymentMode,
  });
});

/** Pay at counter: staff took cash/UPI, start printing. */
r.post('/orders/:id/mark-paid', (req, res) => {
  const o = getOrder(req.params.id);
  if (o.status !== 'pending_payment') throw new UserError(`Order is already ${o.status}`, 409);
  const method = ['cash', 'upi'].includes(req.body?.method) ? req.body.method : 'cash';
  markPaid(o.id, `counter:${method}`);
  res.json(adminOrderView(getOrder(o.id)));
});

// ---- shop open/closed & printing pause ----

r.post('/shop/close', (req, res) => {
  const until = req.body?.reopen === 'manual' ? null : nextOpening(Date.now());
  updateSettings({ closed_override: { message: String(req.body?.message || ''), until } });
  res.json(shopStatus());
});

r.post('/shop/open', (req, res) => {
  updateSettings({ closed_override: null });
  res.json(shopStatus());
});

r.post('/printing', (req, res) => {
  updateSettings({ printing_paused: !!req.body?.paused });
  res.json(shopStatus());
});

/** Counter handover: look up a pickup code (typed or scanned from the customer's QR). */
r.get('/orders/by-code/:code', (req, res) => {
  const code = String(req.params.code).trim().toUpperCase();
  const o = q("SELECT * FROM orders WHERE code = ? AND code != 'TEST' ORDER BY created_at DESC LIMIT 1").get(code);
  if (!o) throw new UserError(`No order with code ${code}`, 404);
  res.json(adminOrderView(o));
});

function getOrder(id) {
  const o = q('SELECT * FROM orders WHERE id = ?').get(id);
  if (!o) throw new UserError('Order not found', 404);
  return o;
}

function getItem(id, allowed) {
  const i = q('SELECT * FROM items WHERE id = ?').get(id);
  if (!i) throw new UserError('Item not found', 404);
  if (allowed && !allowed.includes(i.status)) throw new UserError(`Item is ${i.status}`, 409);
  return i;
}

r.post('/orders/:id/release', (req, res) => {
  const o = getOrder(req.params.id);
  if (!o.pin || !safeEqual(String(req.body?.pin || '').trim(), o.pin)) throw new UserError('PIN does not match', 400);
  q("UPDATE items SET status = 'queued', updated_at = ? WHERE order_id = ? AND status = 'held'").run(Date.now(), o.id);
  res.json(adminOrderView(o));
});

r.post('/orders/:id/collected', (req, res) => {
  const o = getOrder(req.params.id);
  if (o.status !== 'active') throw new UserError(`Order is ${o.status}`, 409);
  q("UPDATE orders SET status = 'collected', closed_at = ? WHERE id = ?").run(Date.now(), o.id);
  res.json(adminOrderView(getOrder(o.id)));
});

r.post('/orders/:id/cancel', (req, res) => {
  const o = getOrder(req.params.id);
  tx(() => {
    const now = Date.now();
    q("UPDATE orders SET status = 'cancelled', closed_at = ? WHERE id = ?").run(now, o.id);
    q("UPDATE items SET status = 'cancelled', updated_at = ? WHERE order_id = ? AND status != 'done'").run(now, o.id);
  });
  res.json(adminOrderView(getOrder(o.id)));
});

/** Shopkeeper has flipped the front-printed stack and reloaded it. */
r.post('/items/:id/flipped', (req, res) => {
  const i = getItem(req.params.id, ['awaiting_flip']);
  q("UPDATE items SET status = 'flip_ok', updated_at = ? WHERE id = ?").run(Date.now(), i.id);
  res.json({ ok: true });
});

/** Re-queue a failed/stuck job (or reprint a finished one) from the start. */
r.post('/items/:id/retry', (req, res) => {
  const i = getItem(req.params.id, ['failed', 'printing', 'awaiting_flip', 'flip_ok', 'done']);
  const file = getFile(i.file_id);
  if (file.deleted_at) throw new UserError('The file was already deleted (private documents are removed after printing)', 410);
  q("UPDATE items SET status = 'queued', printer_id = NULL, pass = NULL, error = NULL, updated_at = ? WHERE id = ?").run(Date.now(), i.id);
  res.json({ ok: true });
});

/** Preview a customer file. Private documents are never viewable here. */
r.get('/files/:id/pdf', (req, res) => {
  const f = getFile(req.params.id);
  if (!f || f.deleted_at) throw new UserError('File not found', 404);
  if (f.sensitive) throw new UserError('Private document — not viewable', 403);
  res.set({ 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' });
  res.send(readPdf(f));
});

// ---- printers ----

r.get('/printers', (req, res) => res.json(listPrinters().map(printerView)));

r.put('/printers/:id', (req, res) => {
  const p = q('SELECT * FROM printers WHERE id = ?').get(req.params.id);
  if (!p) throw new UserError('Printer not found', 404);
  const b = req.body || {};
  const duplex = ['auto', 'manual', 'none'].includes(b.duplex) ? b.duplex : p.duplex;
  q(`UPDATE printers SET label = ?, windows_name = ?, color = ?, duplex = ?, reverse_back = ?, rotate_back = ?, enabled = ?
     WHERE id = ?`)
    .run(
      String(b.label ?? p.label).trim() || p.label,
      String(b.windowsName ?? p.windows_name).trim() || p.windows_name,
      (b.color ?? !!p.color) ? 1 : 0,
      duplex,
      (b.reverseBack ?? !!p.reverse_back) ? 1 : 0,
      (b.rotateBack ?? !!p.rotate_back) ? 1 : 0,
      (b.enabled ?? !!p.enabled) ? 1 : 0,
      p.id,
    );
  res.json(printerView(q('SELECT * FROM printers WHERE id = ?').get(p.id)));
});

r.post('/printers', (req, res) => {
  const b = req.body || {};
  const label = String(b.label || '').trim();
  const windowsName = String(b.windowsName || '').trim();
  if (!label || !windowsName) throw new UserError('Label and Windows printer name are required');
  const id = `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}-${newId().slice(0, 4)}`;
  q(`INSERT INTO printers(id, label, windows_name, color, duplex, enabled, sort) VALUES(?, ?, ?, ?, ?, 1, 99)`)
    .run(id, label, windowsName, b.color ? 1 : 0, ['auto', 'manual', 'none'].includes(b.duplex) ? b.duplex : 'none');
  res.status(201).json(printerView(q('SELECT * FROM printers WHERE id = ?').get(id)));
});

/** Queue a 5-page double-sided test so the shopkeeper can calibrate flip settings. */
r.post('/printers/:id/test-duplex', async (req, res) => {
  const p = q('SELECT * FROM printers WHERE id = ?').get(req.params.id);
  if (!p) throw new UserError('Printer not found', 404);
  const file = await createDuplexTestFile();
  const now = Date.now();
  const orderId = newId();
  tx(() => {
    q(`INSERT INTO orders(id, code, token, customer_name, phone, amount, status, created_at, paid_at)
       VALUES(?, 'TEST', ?, ?, '', 0, 'active', ?, ?)`).run(orderId, newId(), `Duplex test · ${p.label}`, now, now);
    q(`INSERT INTO items(order_id, file_id, file_name, pages_json, copies, color, duplex, price, status, pin_printer, updated_at)
       VALUES(?, ?, ?, ?, 1, 0, 1, 0, 'queued', ?, ?)`).run(orderId, file.id, file.name, JSON.stringify([0, 1, 2, 3, 4]), p.id, now);
  });
  res.status(201).json({ ok: true });
});

// ---- trending ----

r.get('/trending', (req, res) => {
  const rows = q(`SELECT t.*, f.pages, f.version FROM trending t JOIN files f ON f.id = t.file_id
                  WHERE f.deleted_at IS NULL ORDER BY t.sort, t.created_at DESC`).all();
  res.json(rows.map((t) => ({
    id: t.id, title: t.title, tag: t.tag, color: !!t.color, active: !!t.active, fileId: t.file_id, pages: t.pages, version: t.version,
  })));
});

r.post('/trending', upload.single('file'), async (req, res) => {
  if (!req.file) throw new UserError('No file received');
  const title = String(req.body.title || '').trim() || uploadName(req.file).replace(/\.[^.]+$/, '');
  const file = await ingestFile(req.file.buffer, uploadName(req.file), { purpose: 'trending', fit: req.body.fit === 'fill' ? 'fill' : 'fit' });
  q('INSERT INTO trending(file_id, title, tag, color, created_at) VALUES(?, ?, ?, ?, ?)')
    .run(file.id, title.slice(0, 100), String(req.body.tag || '').trim().slice(0, 40), req.body.color === '0' ? 0 : 1, Date.now());
  res.status(201).json(fileView(file));
});

r.patch('/trending/:id', (req, res) => {
  const t = q('SELECT * FROM trending WHERE id = ?').get(req.params.id);
  if (!t) throw new UserError('Not found', 404);
  const b = req.body || {};
  q('UPDATE trending SET title = ?, tag = ?, color = ?, active = ? WHERE id = ?').run(
    String(b.title ?? t.title).slice(0, 100),
    String(b.tag ?? t.tag).slice(0, 40),
    (b.color ?? !!t.color) ? 1 : 0,
    (b.active ?? !!t.active) ? 1 : 0,
    t.id,
  );
  res.json({ ok: true });
});

r.delete('/trending/:id', (req, res) => {
  const t = q('SELECT * FROM trending WHERE id = ?').get(req.params.id);
  if (!t) throw new UserError('Not found', 404);
  q('DELETE FROM trending WHERE id = ?').run(t.id);
  // Keep the file while unfinished orders still need it; cleanup removes it later.
  const pending = q("SELECT COUNT(*) AS n FROM items WHERE file_id = ? AND status NOT IN ('done', 'cancelled')").get(t.file_id).n;
  if (!pending) destroyFile(t.file_id);
  else q("UPDATE files SET purpose = 'upload' WHERE id = ?").run(t.file_id);
  res.json({ ok: true });
});

// ---- settings ----

r.get('/settings', (req, res) => res.json(getSettings()));
r.put('/settings', (req, res) => res.json(updateSettings(req.body || {})));

export default r;
