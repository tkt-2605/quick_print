export const rupees = (paise) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: paise % 100 ? 2 : 0 })}`;

export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

export const sheetsFor = (pageCount, copies, duplex) => (duplex && pageCount > 1 ? Math.ceil(pageCount / 2) : pageCount) * copies;

export const timeAgo = (ts) => {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString();
};
