// Keep in sync with apps/web/src/lib/range.js

/**
 * Parse a page range like "1-3, 5, 8-" into 0-based page indices (in the order typed).
 * Empty input means every page. Throws Error with a readable message on bad input.
 */
export function parseRange(input, total) {
  const text = String(input ?? '').trim();
  if (!text) return Array.from({ length: total }, (_, i) => i);
  if (text.length > 200) throw new Error('Page range is too long');

  const out = [];
  for (const raw of text.split(',')) {
    const part = raw.trim();
    if (!part) continue;
    const m = /^(\d*)\s*(-)?\s*(\d*)$/.exec(part);
    if (!m || (!m[1] && !m[3])) throw new Error(`"${part}" is not a valid page range`);
    const from = m[1] ? Number(m[1]) : 1;
    const to = m[2] ? (m[3] ? Number(m[3]) : total) : from;
    if (from < 1 || to > total || from > to) throw new Error(`Pages must be between 1 and ${total}`);
    for (let p = from; p <= to; p++) out.push(p - 1);
  }
  if (!out.length) throw new Error('No pages selected');
  if (out.length > 2000) throw new Error('Too many pages selected');
  return out;
}
