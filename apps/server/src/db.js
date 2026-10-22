import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

export const db = new DatabaseSync(path.join(config.dataDir, 'quickprint.db'));

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS files (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL,            -- pdf | image | office
  pages       INTEGER NOT NULL,
  sensitive   INTEGER NOT NULL DEFAULT 0,
  purpose     TEXT NOT NULL,            -- upload | trending | system
  fit         TEXT NOT NULL DEFAULT 'fit',
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);

CREATE TABLE IF NOT EXISTS orders (
  id               TEXT PRIMARY KEY,
  code             TEXT NOT NULL,
  token            TEXT NOT NULL,
  customer_name    TEXT NOT NULL,
  phone            TEXT NOT NULL,
  amount           INTEGER NOT NULL,     -- paise
  status           TEXT NOT NULL,        -- pending_payment | active | collected | cancelled
  sensitive        INTEGER NOT NULL DEFAULT 0,
  pin              TEXT,
  gateway_order_id TEXT,
  payment_ref      TEXT,
  created_at       INTEGER NOT NULL,
  paid_at          INTEGER,
  closed_at        INTEGER
);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS orders_gateway ON orders(gateway_order_id);

CREATE TABLE IF NOT EXISTS items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    TEXT NOT NULL REFERENCES orders(id),
  file_id     TEXT NOT NULL REFERENCES files(id),
  file_name   TEXT NOT NULL,
  pages_json  TEXT NOT NULL,             -- selected 0-based page indices
  copies      INTEGER NOT NULL,
  color       INTEGER NOT NULL,
  duplex      INTEGER NOT NULL,
  price       INTEGER NOT NULL,
  -- pending_payment | held | queued | printing | awaiting_flip | flip_ok | done | failed | cancelled
  status      TEXT NOT NULL,
  printer_id  TEXT,
  pin_printer TEXT,                      -- force a specific printer (test pages)
  pass        TEXT,                      -- all | front | back
  error       TEXT,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS items_status ON items(status);
CREATE INDEX IF NOT EXISTS items_order ON items(order_id);

CREATE TABLE IF NOT EXISTS printers (
  id            TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  windows_name  TEXT NOT NULL,
  color         INTEGER NOT NULL,
  duplex        TEXT NOT NULL,           -- auto | manual | none
  reverse_back  INTEGER NOT NULL DEFAULT 1,
  rotate_back   INTEGER NOT NULL DEFAULT 0,
  enabled       INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'unknown',
  last_seen     INTEGER,
  sort          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trending (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id     TEXT NOT NULL REFERENCES files(id),
  title       TEXT NOT NULL,
  tag         TEXT NOT NULL DEFAULT '',
  color       INTEGER NOT NULL DEFAULT 1,
  active      INTEGER NOT NULL DEFAULT 1,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

const statements = new Map();
/** Cached prepared statement. */
export function q(sql) {
  let s = statements.get(sql);
  if (!s) statements.set(sql, (s = db.prepare(sql)));
  return s;
}

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ---- settings ----

const DAY_HOURS = { open: '09:00', close: '21:00' };

export const DEFAULT_SETTINGS = {
  price_bw: 200, // paise per printed side
  price_color: 1000,
  route_bw_to_mono: true, // send B&W jobs to a mono (laser) printer when one is online
  retention_hours: 24, // delete customer files this long after the order is closed
  // Weekly opening hours in shop-local time; null = closed that day.
  hours: { mon: DAY_HOURS, tue: DAY_HOURS, wed: DAY_HOURS, thu: DAY_HOURS, fri: DAY_HOURS, sat: DAY_HOURS, sun: null },
  order_cutoff_minutes: 15, // stop taking orders this long before closing
  closed_override: null, // { message, until } — "Close shop now"; until = null means until reopened by hand
  printing_paused: false, // printer problem: keep taking orders but don't print
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function sanitizeHours(value) {
  const out = {};
  for (const day of Object.keys(DEFAULT_SETTINGS.hours)) {
    const h = value?.[day];
    out[day] = h && TIME_RE.test(h.open) && TIME_RE.test(h.close) && h.open < h.close ? { open: h.open, close: h.close } : null;
  }
  return out;
}

function sanitize(key, value) {
  if (key === 'hours') return sanitizeHours(value);
  if (key === 'closed_override') {
    if (!value) return null;
    const until = Number(value.until) || null;
    return { message: String(value.message || '').slice(0, 300), until };
  }
  return typeof DEFAULT_SETTINGS[key] === 'number' ? Math.max(0, Math.round(Number(value) || 0)) : !!value;
}

export function getSettings() {
  const s = { ...DEFAULT_SETTINGS };
  for (const row of q('SELECT key, value FROM settings').all()) s[row.key] = JSON.parse(row.value);
  return s;
}

export function updateSettings(patch) {
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!(key in patch)) continue;
    q('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(sanitize(key, patch[key])));
  }
  return getSettings();
}

// ---- printers ----

if (q('SELECT COUNT(*) AS n FROM printers').get().n === 0) {
  const insert = q(`INSERT INTO printers(id, label, windows_name, color, duplex, reverse_back, rotate_back, enabled, sort)
                    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insert.run('epson-l3250', 'Epson EcoTank L3250', 'EPSON L3250 Series', 1, 'manual', 1, 0, 1, 1);
  insert.run('canon-lbp2900', 'Canon LBP2900B (B&W laser)', 'Canon LBP2900', 0, 'manual', 1, 0, 0, 2);
}

export const listPrinters = () => q('SELECT * FROM printers ORDER BY sort, label').all();
