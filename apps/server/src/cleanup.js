import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { q, getSettings } from './db.js';
import { destroyFile } from './files.js';

const HOUR = 3600_000;

/**
 * Housekeeping, run every 15 minutes:
 *  - cancel orders left unpaid for 24h
 *  - delete customer files nobody needs any more (private ones much sooner)
 *  - clear leftovers in the tmp dir
 */
export function runCleanup() {
  const now = Date.now();
  const { retention_hours: retention } = getSettings();

  const stale = q("SELECT id FROM orders WHERE status = 'pending_payment' AND created_at < ?").all(now - 24 * HOUR);
  for (const o of stale) {
    q("UPDATE orders SET status = 'cancelled', closed_at = ? WHERE id = ?").run(now, o.id);
    q("UPDATE items SET status = 'cancelled', updated_at = ? WHERE order_id = ?").run(now, o.id);
  }

  // A customer upload can go once no open order uses it and it has been idle long enough.
  const candidates = q(`
    SELECT f.id, f.sensitive, f.created_at,
           (SELECT COUNT(*) FROM items i JOIN orders o ON o.id = i.order_id
             WHERE i.file_id = f.id AND o.status IN ('pending_payment', 'active')) AS open_orders,
           (SELECT MAX(o.closed_at) FROM items i JOIN orders o ON o.id = i.order_id WHERE i.file_id = f.id) AS last_closed
    FROM files f
    WHERE f.deleted_at IS NULL AND f.purpose IN ('upload', 'system')`).all();
  for (const f of candidates) {
    if (f.open_orders) continue;
    const keepFor = (f.sensitive ? 1 : retention) * HOUR;
    if (now - Math.max(f.created_at, f.last_closed || 0) > keepFor) destroyFile(f.id);
  }

  for (const name of fs.readdirSync(config.tmpDir)) {
    const p = path.join(config.tmpDir, name);
    if (now - fs.statSync(p).mtimeMs > HOUR) fs.rmSync(p, { recursive: true, force: true });
  }
}

export function startCleanup() {
  const run = () => {
    try {
      runCleanup();
    } catch (e) {
      console.error('[cleanup]', e);
    }
  };
  run();
  setInterval(run, 15 * 60_000).unref();
}
