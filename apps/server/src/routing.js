import { q, tx, getSettings, listPrinters } from './db.js';
import { ACTIVE_ITEM_STATES } from './orders.js';

const STALE_MS = 60_000;

export const printerOnline = (p) => p.status === 'ready' && p.last_seen && Date.now() - p.last_seen < STALE_MS;

/**
 * Which jobs can be double-sided right now: any enabled printer that allows it (Admin → Printers →
 * "Double-sided printing"). Colour double-sided needs a colour printer that allows it.
 */
export function duplexSupport() {
  const ok = listPrinters().filter((p) => p.enabled && p.duplex !== 'none');
  return { bw: ok.length > 0, color: ok.some((p) => p.color) };
}

/** Pick the best idle printer for a queued item, or null if it must wait. */
export function pickPrinter(item, idle, settings) {
  let candidates = idle.filter((p) => (!item.color || p.color) && (!item.duplex || p.duplex !== 'none'));
  if (item.pin_printer) candidates = candidates.filter((p) => p.id === item.pin_printer);
  if (!candidates.length) return null;
  if (!item.color && settings.route_bw_to_mono) {
    const mono = candidates.find((p) => !p.color);
    if (mono) return mono;
  }
  // Prefer a printer that can duplex by itself for double-sided jobs.
  if (item.duplex) return candidates.find((p) => p.duplex === 'auto') || candidates[0];
  return candidates[0];
}

/**
 * Hand the next job to the print agent. A printer is "busy" while it has a job
 * printing or a manual-duplex job between its front and back passes.
 */
export function claimNextJob() {
  if (getSettings().printing_paused) return null; // shopkeeper paused printing (paper/ink/jam)
  return tx(() => {
    const online = listPrinters().filter((p) => p.enabled && printerOnline(p));
    if (!online.length) return null;
    const busy = new Set(
      q(`SELECT DISTINCT printer_id FROM items WHERE printer_id IS NOT NULL AND status IN (${ACTIVE_ITEM_STATES.map(() => '?').join(',')})`)
        .all(...ACTIVE_ITEM_STATES).map((r) => r.printer_id),
    );
    const now = Date.now();
    const claim = (item, printer, pass) => {
      q("UPDATE items SET status = 'printing', printer_id = ?, pass = ?, error = NULL, updated_at = ? WHERE id = ?")
        .run(printer.id, pass, now, item.id);
      return { item: { ...item, status: 'printing', printer_id: printer.id, pass }, printer };
    };

    // 1. Back sides the shopkeeper has just flipped and reloaded.
    for (const item of q("SELECT * FROM items WHERE status = 'flip_ok' ORDER BY updated_at").all()) {
      const printer = online.find((p) => p.id === item.printer_id);
      if (printer) return claim(item, printer, 'back');
    }

    // 2. New work, oldest paid first.
    const idle = online.filter((p) => !busy.has(p.id));
    if (!idle.length) return null;
    const settings = getSettings();
    const queued = q(`SELECT items.* FROM items JOIN orders ON orders.id = items.order_id
                      WHERE items.status = 'queued' ORDER BY orders.paid_at, items.id`).all();
    for (const item of queued) {
      const printer = pickPrinter(item, idle, settings);
      if (printer) return claim(item, printer, item.duplex && printer.duplex === 'manual' ? 'front' : 'all');
    }
    return null;
  });
}
