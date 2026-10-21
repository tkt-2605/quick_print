const TZ = 'Asia/Kolkata';
export const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

/** "20:30" → "8:30 PM" */
export function formatTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const dayKey = (ts) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ts);

/** "today at 9:00 AM" / "tomorrow at 9:00 AM" / "on Monday at 9:00 AM" */
export function describeOpening(ts) {
  if (!ts) return null;
  const time = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(ts).toUpperCase();
  const days = Math.round((Date.parse(dayKey(ts)) - Date.parse(dayKey(Date.now()))) / 86_400_000);
  if (days === 0) return `today at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  if (days < 7) return `on ${new Intl.DateTimeFormat('en-IN', { timeZone: TZ, weekday: 'long' }).format(ts)} at ${time}`;
  return `on ${new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: 'numeric', month: 'short' }).format(ts)} at ${time}`;
}

// Offline fallbacks (shop PC unreachable): work out open/next-opening from the cached weekly hours.
const IST_MS = 330 * 60_000;
const JS_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const mins = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

export function shouldBeOpen(hours, now = Date.now()) {
  if (!hours) return false;
  const d = new Date(now + IST_MS);
  const h = hours[JS_DAYS[d.getUTCDay()]];
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  return !!h && m >= mins(h.open) && m < mins(h.close);
}

export function nextOpeningFromHours(hours, now = Date.now()) {
  if (!hours) return null;
  const shifted = now + IST_MS;
  const dayStart = shifted - (shifted % 86_400_000);
  for (let i = 0; i <= 7; i++) {
    const start = dayStart + i * 86_400_000;
    const h = hours[JS_DAYS[new Date(start).getUTCDay()]];
    if (!h) continue;
    const ts = start + mins(h.open) * 60_000 - IST_MS;
    if (ts > now) return ts;
  }
  return null;
}

/** Today's opening hours in shop time, e.g. { open: '09:00', close: '20:30' }, or null if closed today. */
export function todayHours(hours, now = Date.now()) {
  if (!hours) return undefined;
  return hours[JS_DAYS[new Date(now + IST_MS).getUTCDay()]] || null;
}

/** Group days with identical hours: [["Mon – Sat", "9:00 AM – 8:30 PM"], ["Sun", "Closed"]] */
export function hoursTable(hours) {
  if (!hours) return [];
  const label = (h) => (h ? `${formatTime(h.open)} – ${formatTime(h.close)}` : 'Closed');
  const rows = [];
  for (const day of DAY_ORDER) {
    const text = label(hours[day]);
    const last = rows[rows.length - 1];
    if (last && last.text === text) last.to = day;
    else rows.push({ from: day, to: day, text });
  }
  const short = (d) => DAY_NAMES[d].slice(0, 3);
  return rows.map((r) => [r.from === r.to ? short(r.from) : `${short(r.from)} – ${short(r.to)}`, r.text]);
}
