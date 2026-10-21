import { PDFDocument, degrees } from 'pdf-lib';

/**
 * Build the exact PDF to send to the printer for one pass of a job.
 *
 *  pass "all"   – everything in one go (single-sided, or the printer duplexes by itself)
 *  pass "front" – manual duplex, first run: front side of every sheet
 *  pass "back"  – manual duplex, second run after the stack is flipped and reloaded
 *
 * Copies are baked in (collated) so every printer behaves the same, and odd page
 * counts get a blank back so copies never share a sheet.
 * Returns null if the pass has nothing to print.
 */
export async function buildPass(pdfBytes, job) {
  const src = await PDFDocument.load(pdfBytes);
  const padded = job.duplex && job.pages.length % 2 ? [...job.pages, null] : job.pages;

  let seq = [];
  if (job.pass === 'all') {
    for (let c = 0; c < job.copies; c++) seq.push(...padded);
  } else {
    const fronts = [];
    const backs = [];
    for (let c = 0; c < job.copies; c++) {
      for (let i = 0; i < padded.length; i += 2) {
        fronts.push(padded[i]);
        backs.push(padded[i + 1]);
      }
    }
    // The flipped stack usually feeds last-printed-first, so backs go in reverse.
    seq = job.pass === 'front' ? fronts : job.printer.reverseBack ? backs.reverse() : backs;
  }
  if (!seq.some((p) => p !== null)) return null;

  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, seq.filter((p) => p !== null));
  let k = 0;
  let lastSize = [595.28, 841.89];
  for (const p of seq) {
    if (p === null) {
      out.addPage(lastSize); // blank back
      continue;
    }
    const page = out.addPage(copied[k++]);
    const { width, height } = page.getSize();
    lastSize = [width, height];
    if (job.pass === 'back' && job.printer.rotateBack) page.setRotation(degrees((page.getRotation().angle + 180) % 360));
  }
  return out.save();
}
