import { Router } from 'express';
import { config } from '../config.js';
import { q, listPrinters } from '../db.js';
import { destroyFile, getFile, readPdf } from '../files.js';
import { claimNextJob } from '../routing.js';
import { UserError, safeEqual } from '../util.js';

const r = Router();

r.use((req, res, next) => {
  const token = (req.get('authorization') || '').replace(/^Bearer /, '');
  if (!safeEqual(token, config.agentToken)) return res.status(401).json({ error: 'bad agent token' });
  next();
});

/**
 * The agent calls this every few seconds with the printers Windows reports.
 * We record their health and hand back the next job, if any.
 * Body: { printers: [{ name, status }], wantJob: boolean }
 */
r.post('/poll', (req, res) => {
  const reported = Array.isArray(req.body?.printers) ? req.body.printers : [];
  const now = Date.now();
  for (const p of listPrinters()) {
    const seen = req.body?.dryRun
      ? { status: 'ready' } // agent in dry-run mode: treat every printer as present
      : reported.find((x) => String(x.name).toLowerCase() === p.windows_name.toLowerCase());
    q('UPDATE printers SET status = ?, last_seen = ? WHERE id = ?')
      .run(seen ? String(seen.status) : 'not found', seen ? now : p.last_seen, p.id);
  }
  if (req.body?.wantJob === false) return res.json({ job: null });

  const claimed = claimNextJob();
  if (!claimed) return res.json({ job: null });
  const { item, printer } = claimed;
  const order = q('SELECT code FROM orders WHERE id = ?').get(item.order_id);
  res.json({
    job: {
      id: item.id,
      orderCode: order.code,
      fileName: item.file_name,
      pass: item.pass,
      pages: JSON.parse(item.pages_json),
      copies: item.copies,
      color: !!item.color,
      duplex: !!item.duplex,
      printer: {
        id: printer.id,
        windowsName: printer.windows_name,
        duplex: printer.duplex,
        reverseBack: !!printer.reverse_back,
        rotateBack: !!printer.rotate_back,
      },
    },
  });
});

function printingItem(id) {
  const item = q('SELECT * FROM items WHERE id = ?').get(id);
  if (!item || item.status !== 'printing') throw new UserError('Job is not printing', 409);
  return item;
}

r.get('/items/:id/file', (req, res) => {
  const item = printingItem(req.params.id);
  res.set({ 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' });
  res.send(readPdf(getFile(item.file_id)));
});

/** Body: { ok: boolean, error?: string } */
r.post('/items/:id/result', (req, res) => {
  const item = printingItem(req.params.id);
  const now = Date.now();
  if (!req.body?.ok) {
    q("UPDATE items SET status = 'failed', error = ?, updated_at = ? WHERE id = ?")
      .run(String(req.body?.error || 'Print failed').slice(0, 500), now, item.id);
    return res.json({ ok: true });
  }
  const next = item.pass === 'front' ? 'awaiting_flip' : 'done';
  q('UPDATE items SET status = ?, updated_at = ? WHERE id = ?').run(next, now, item.id);

  // Private documents are destroyed as soon as they are printed.
  const file = getFile(item.file_id);
  if (next === 'done' && file.sensitive) {
    const pending = q("SELECT COUNT(*) AS n FROM items WHERE file_id = ? AND status NOT IN ('done', 'cancelled')").get(file.id).n;
    if (!pending) destroyFile(file.id);
  }
  res.json({ ok: true });
});

export default r;
