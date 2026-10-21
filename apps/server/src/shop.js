import { config } from './config.js';
import { getSettings } from './db.js';

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const toHHMM = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

// Shop-local time as a shifted UTC timestamp (India has no DST, so a fixed offset is exact).
const shift = (ts) => ts + config.tzOffsetMinutes * MIN;
const unshift = (ts) => ts - config.tzOffsetMinutes * MIN;

function localParts(ts) {
  const d = new Date(shift(ts));
  return { day: DAYS[d.getUTCDay()], mins: d.getUTCHours() * 60 + d.getUTCMinutes(), dayStart: unshift(shift(ts) - (shift(ts) % DAY)) };
}

/** Timestamp of the next regular opening strictly after `ts`, or null if no hours are set. */
export function nextOpening(ts, hours = getSettings().hours) {
  const { dayStart } = localParts(ts);
  for (let d = 0; d <= 7; d++) {
    const start = dayStart + d * DAY;
    const h = hours[localParts(start).day];
    if (!h) continue;
    const openTs = start + toMinutes(h.open) * MIN;
    if (openTs > ts) return openTs;
  }
  return null;
}

/**
 * Is the shop taking orders right now?
 * Closed by hand ("Close shop now") wins over the weekly hours. Orders stop
 * `order_cutoff_minutes` before closing so the last ones can still be printed.
 */
export function shopStatus(ts = Date.now()) {
  const s = getSettings();
  const base = { printingPaused: !!s.printing_paused, hours: s.hours, cutoffMinutes: s.order_cutoff_minutes };
  const ov = s.closed_override;
  if (ov && (!ov.until || ts < ov.until)) {
    return { ...base, open: false, reason: 'manual', message: ov.message || '', nextOpen: ov.until || null };
  }
  const { day, mins } = localParts(ts);
  const today = s.hours[day];
  if (today) {
    const open = toMinutes(today.open);
    const lastOrder = toMinutes(today.close) - s.order_cutoff_minutes;
    if (mins >= open && mins < lastOrder) {
      return { ...base, open: true, closesAt: today.close, lastOrderAt: toHHMM(lastOrder), minutesLeft: lastOrder - mins };
    }
  }
  return { ...base, open: false, reason: 'hours', message: '', nextOpen: nextOpening(ts, s.hours) };
}
