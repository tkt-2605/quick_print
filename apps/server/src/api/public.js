import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { q, tx, getSettings } from '../db.js';
import { acceptedFormats, getFile, ingestFile, readPdf, refitImage } from '../files.js';
import { parseRange } from '../lib/range.js';
import { publicOrderView } from '../orders.js';
import { confirmCheckout, createGatewayOrder } from '../payments.js';
import { shopStatus } from '../shop.js';
import { UserError, newId, newOrderCode, newPin, safeEqual } from '../util.js';

const r = Router();

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
});

/** Browsers send UTF-8 filenames but busboy reads them as latin1. */
export function uploadName(file) {
  const utf8 = Buffer.from(file.originalname, 'latin1').toString('utf8');
  return utf8.includes('�') ? file.originalname : utf8;
}

export const fileView = (f) => ({
  id: f.id, name: f.name, kind: f.kind, pages: f.pages, sensitive: !!f.sensitive, fit: f.fit, version: f.version,
});

function uniqueOrderCode() {
  for (;;) {
    const code = newOrderCode();
    if (!q('SELECT 1 FROM orders WHERE code = ?').get(code)) return code;
  }
}

function liveFile(id, { allowTrending = true } = {}) {
  const f = getFile(id);
  if (!f || f.deleted_at || f.purpose === 'system') throw new UserError('File not found or expired. Please upload it again.', 404);
  if (!allowTrending && f.purpose !== 'upload') throw new UserError('This file cannot be changed', 403);
  return f;
}

r.get('/config', (req, res) => {
  const s = getSettings();
  res.json({
    shopName: config.shopName,
    shop: config.shop,
    retentionHours: s.retention_hours,
    prices: { bw: s.price_bw, color: s.price_color },
    formats: acceptedFormats(),
    maxUploadMb: config.maxUploadMb,
    paymentMode: config.paymentMode,
    payAtCounter: config.paymentMode === 'counter' || s.counter_payment,
    razorpayKeyId: config.paymentMode === 'razorpay' ? config.razorpay.keyId : null,
    status: shopStatus(),
  });
});

/** Polled by the site so it can switch to the "closed" page without a reload. */
r.get('/status', (req, res) => res.json(shopStatus()));

/** New uploads and orders are only taken while the shop is open. */
function requireOpen(req, res, next) {
  const st = shopStatus();
  if (!st.open) throw new UserError(st.message || 'Sorry, the shop is not taking orders right now. Please order during shop hours.', 403);
  next();
}

// ---- files ----

r.post('/files', requireOpen, upload.single('file'), async (req, res) => {
  if (!req.file) throw new UserError('No file received');
  const file = await ingestFile(req.file.buffer, uploadName(req.file), { fit: req.body.fit === 'fill' ? 'fill' : 'fit' });
  res.status(201).json(fileView(file));
});

r.get('/files/:id/pdf', (req, res) => {
  const f = liveFile(req.params.id);
  res.set({
    'Content-Type': 'application/pdf',
    'Cache-Control': f.sensitive ? 'no-store' : 'private, max-age=3600',
  });
  res.send(readPdf(f));
});

r.post('/files/:id/fit', async (req, res) => {
  const f = liveFile(req.params.id, { allowTrending: false });
  res.json(fileView(await refitImage(f, req.body.fit === 'fill' ? 'fill' : 'fit')));
});

// ---- trending ----

r.get('/trending', (req, res) => {
  const rows = q(`SELECT t.id, t.title, t.tag, t.color, f.id AS file_id, f.pages, f.version FROM trending t
                  JOIN files f ON f.id = t.file_id
                  WHERE t.active = 1 AND f.deleted_at IS NULL ORDER BY t.sort, t.created_at DESC`).all();
  res.json(rows.map((t) => ({ id: t.id, title: t.title, tag: t.tag, color: !!t.color, fileId: t.file_id, pages: t.pages, version: t.version })));
});

// ---- orders ----

r.post('/orders', requireOpen, async (req, res) => {
  const { customer = {}, items = [], payMethod } = req.body || {};
  const name = String(customer.name || '').trim().slice(0, 80);
  const phone = String(customer.phone || '').replace(/\D/g, '').slice(-10);
  if (!name) throw new UserError('Please enter your name');
  if (phone.length !== 10) throw new UserError('Please enter a valid 10-digit mobile number');
  if (!Array.isArray(items) || !items.length) throw new UserError('Your cart is empty');
  if (items.length > 50) throw new UserError('Too many files in one order (max 50)');

  const s = getSettings();
  const lines = items.map((it) => {
    const file = liveFile(it.fileId);
    let pages;
    try {
      pages = parseRange(it.range, file.pages);
    } catch (e) {
      throw new UserError(`${file.name}: ${e.message}`);
    }
    const copies = Math.min(100, Math.max(1, Math.floor(Number(it.copies) || 1)));
    const color = it.color ? 1 : 0;
    const duplex = it.duplex && pages.length > 1 ? 1 : 0;
    const price = pages.length * copies * (color ? s.price_color : s.price_bw);
    return { file, pages, copies, color, duplex, price };
  });

  const payAtCounter = config.paymentMode === 'counter' || (payMethod === 'counter' && s.counter_payment);
  const sensitive = lines.some((l) => l.file.sensitive) ? 1 : 0;
  const order = {
    id: newId(),
    code: uniqueOrderCode(),
    token: crypto.randomBytes(16).toString('base64url'),
    amount: lines.reduce((a, l) => a + l.price, 0),
  };

  tx(() => {
    const now = Date.now();
    q(`INSERT INTO orders(id, code, token, customer_name, phone, amount, status, pay_method, sensitive, pin, created_at)
       VALUES(?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?, ?, ?)`)
      .run(order.id, order.code, order.token, name, phone, order.amount, payAtCounter ? 'counter' : 'online',
        sensitive, sensitive ? newPin() : null, now);
    const ins = q(`INSERT INTO items(order_id, file_id, file_name, pages_json, copies, color, duplex, price, status, updated_at)
                   VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?)`);
    for (const l of lines) ins.run(order.id, l.file.id, l.file.name, JSON.stringify(l.pages), l.copies, l.color, l.duplex, l.price, now);
  });

  const gatewayOrderId = payAtCounter ? null : await createGatewayOrder(order);
  res.status(201).json({
    id: order.id,
    token: order.token,
    code: order.code,
    amount: order.amount,
    payment: { mode: payAtCounter ? 'counter' : config.paymentMode, gatewayOrderId, keyId: config.razorpay.keyId || null },
  });
});

function ownedOrder(req) {
  const order = q('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  const token = req.query.t || req.body?.token;
  if (!order || !token || !safeEqual(order.token, token)) throw new UserError('Order not found', 404);
  return order;
}

r.get('/orders/:id', (req, res) => res.json(publicOrderView(ownedOrder(req))));

r.post('/orders/:id/pay', (req, res) => {
  const order = ownedOrder(req);
  if (order.status === 'pending_payment') confirmCheckout(order, req.body);
  res.json(publicOrderView(q('SELECT * FROM orders WHERE id = ?').get(order.id)));
});

export default r;
