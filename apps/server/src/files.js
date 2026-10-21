import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { config } from './config.js';
import { q } from './db.js';
import { UserError, newId } from './util.js';

const execFileAsync = promisify(execFile);

export const A4 = { w: 595.28, h: 841.89 };
const OFFICE_EXT = ['.doc', '.docx', '.odt', '.rtf', '.ppt', '.pptx', '.odp', '.xls', '.xlsx', '.ods'];

export function acceptedFormats() {
  const f = ['.pdf', '.jpg', '.jpeg', '.png'];
  return config.sofficePath ? [...f, ...OFFICE_EXT] : f;
}

// ---------- blob storage (optionally encrypted at rest) ----------

const blobPath = (id, part, enc) => path.join(config.filesDir, `${id}.${part}${enc ? '.enc' : ''}`);

function writeBlob(id, part, data, encrypt) {
  let buf = Buffer.from(data);
  if (encrypt) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', config.fileKey, iv);
    const ct = Buffer.concat([cipher.update(buf), cipher.final()]);
    buf = Buffer.concat([iv, cipher.getAuthTag(), ct]);
  }
  fs.writeFileSync(blobPath(id, part, encrypt), buf);
}

function readBlob(file, part) {
  const enc = !!file.sensitive;
  const p = blobPath(file.id, part, enc);
  if (file.deleted_at || !fs.existsSync(p)) throw new UserError('This file has been deleted', 410);
  const buf = fs.readFileSync(p);
  if (!enc) return buf;
  const decipher = crypto.createDecipheriv('aes-256-gcm', config.fileKey, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
}

export const readPdf = (file) => readBlob(file, 'pdf');

/** Remove a file's stored data for good (record stays for order history). */
export function destroyFile(id) {
  for (const part of ['pdf', 'orig']) {
    for (const enc of [false, true]) fs.rmSync(blobPath(id, part, enc), { force: true });
  }
  q('UPDATE files SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').run(Date.now(), id);
}

export const getFile = (id) => q('SELECT * FROM files WHERE id = ?').get(id);

// ---------- format detection ----------

function detectKind(buf, filename) {
  const ext = path.extname(filename).toLowerCase();
  if (buf.subarray(0, 1024).includes('%PDF-')) return 'pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (config.sofficePath && OFFICE_EXT.includes(ext)) {
    const zip = buf[0] === 0x50 && buf[1] === 0x4b;
    const ole = buf.length > 4 && buf.readUInt32BE(0) === 0xd0cf11e0;
    const rtf = buf.subarray(0, 5).toString('latin1') === '{\\rtf';
    if (zip || ole || rtf) return 'office';
  }
  return null;
}

/** EXIF orientation of a JPEG (1 = normal, 3 = 180°, 6 = 90° CW, 8 = 90° CCW). */
function jpegOrientation(buf) {
  try {
    let off = 2;
    while (off + 4 < buf.length && buf[off] === 0xff) {
      const marker = buf[off + 1];
      const len = buf.readUInt16BE(off + 2);
      if (marker === 0xda) break; // start of image data
      if (marker === 0xe1 && buf.toString('latin1', off + 4, off + 10) === 'Exif\0\0') {
        const tiff = off + 10;
        const le = buf.toString('latin1', tiff, tiff + 2) === 'II';
        const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
        const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
        const ifd = tiff + u32(tiff + 4);
        for (let i = 0, n = u16(ifd); i < n; i++) {
          const e = ifd + 2 + i * 12;
          if (u16(e) === 0x0112) return u16(e + 8);
        }
        return 1;
      }
      off += 2 + len;
    }
  } catch {
    // malformed EXIF: treat as upright
  }
  return 1;
}

// ---------- A4 normalisation ----------

/**
 * Where to draw a w×h object, rotated `rotCw` degrees clockwise, so that its
 * rotated bounding box lands with its lower-left corner at (bx, by).
 * pdf-lib rotates counter-clockwise around the draw origin.
 */
function placeRotated(rotCw, w, h, bx, by) {
  switch (rotCw) {
    case 90: return { x: bx, y: by + w, rotate: degrees(-90) };
    case 180: return { x: bx + w, y: by + h, rotate: degrees(180) };
    case 270: return { x: bx + h, y: by, rotate: degrees(90) };
    default: return { x: bx, y: by, rotate: degrees(0) };
  }
}

/** Fit a w×h box (already rotated) onto an A4 page of matching orientation. */
function a4Layout(ew, eh, mode, margin) {
  const [pw, ph] = ew > eh ? [A4.h, A4.w] : [A4.w, A4.h];
  const s = mode === 'fill'
    ? Math.max(pw / ew, ph / eh)
    : Math.min((pw - 2 * margin) / ew, (ph - 2 * margin) / eh);
  return { pw, ph, s, bx: (pw - ew * s) / 2, by: (ph - eh * s) / 2 };
}

async function imageToA4(buf, kind, fit) {
  const doc = await PDFDocument.create();
  const img = kind === 'jpg' ? await doc.embedJpg(buf) : await doc.embedPng(buf);
  const rot = { 3: 180, 6: 90, 8: 270 }[kind === 'jpg' ? jpegOrientation(buf) : 1] || 0;
  const [ew, eh] = rot % 180 ? [img.height, img.width] : [img.width, img.height];
  const { pw, ph, s, bx, by } = a4Layout(ew, eh, fit, fit === 'fill' ? 0 : 18);
  const page = doc.addPage([pw, ph]);
  const w = img.width * s;
  const h = img.height * s;
  page.drawImage(img, { width: w, height: h, ...placeRotated(rot, w, h, bx, by) });
  return { bytes: await doc.save(), pages: 1 };
}

async function normalizePdf(buf) {
  let src;
  try {
    src = await PDFDocument.load(buf, { updateMetadata: false });
  } catch (e) {
    if (/encrypt/i.test(e.message)) {
      throw new UserError('This PDF is password-protected. Open it, use "Print → Save as PDF", and upload that copy.');
    }
    throw new UserError('We could not read this PDF. Please check the file and try again.');
  }
  const count = src.getPageCount();
  if (count === 0) throw new UserError('This PDF has no pages');
  if (count > config.maxPages) throw new UserError(`Too many pages (max ${config.maxPages} per file)`);

  const out = await PDFDocument.create();
  const srcPages = src.getPages();
  const boxes = srcPages.map((p) => {
    const c = p.getCropBox();
    return { left: c.x, bottom: c.y, right: c.x + c.width, top: c.y + c.height };
  });
  const embedded = await out.embedPages(srcPages, boxes);

  embedded.forEach((emb, i) => {
    const rot = (((srcPages[i].getRotation().angle % 360) + 360) % 360);
    const [ew, eh] = rot % 180 ? [emb.height, emb.width] : [emb.width, emb.height];
    const { pw, ph, s, bx, by } = a4Layout(ew, eh, 'fit', 0);
    const w = emb.width * s;
    const h = emb.height * s;
    out.addPage([pw, ph]).drawPage(emb, { width: w, height: h, ...placeRotated(rot, w, h, bx, by) });
  });
  return { bytes: await out.save(), pages: count };
}

async function officeToPdf(buf, originalName) {
  const dir = fs.mkdtempSync(path.join(config.tmpDir, 'office-'));
  try {
    const input = path.join(dir, `input${path.extname(originalName).toLowerCase()}`);
    fs.writeFileSync(input, buf);
    // Separate profile dir per conversion so parallel conversions don't fight over a lock.
    const profile = pathToFileURL(path.join(dir, 'profile')).href;
    await execFileAsync(config.sofficePath, [`-env:UserInstallation=${profile}`, '--headless', '--convert-to', 'pdf', '--outdir', dir, input], { timeout: 120_000 });
    return fs.readFileSync(path.join(dir, 'input.pdf'));
  } catch {
    throw new UserError('We could not convert this document. Please upload it as a PDF instead.');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Convert any supported upload to an A4 PDF and store it. */
export async function ingestFile(buf, originalName, { sensitive = false, fit = 'fit', purpose = 'upload' } = {}) {
  const kind = detectKind(buf, originalName);
  if (!kind) throw new UserError(`Unsupported file type. We accept ${acceptedFormats().join(', ')}`);

  let result;
  if (kind === 'pdf') result = await normalizePdf(buf);
  else if (kind === 'office') result = await normalizePdf(await officeToPdf(buf, originalName));
  else result = await imageToA4(buf, kind, fit);

  const id = newId();
  writeBlob(id, 'pdf', result.bytes, sensitive);
  if (kind === 'jpg' || kind === 'png') writeBlob(id, 'orig', buf, sensitive); // kept so fit/fill can be changed

  q(`INSERT INTO files(id, name, kind, pages, sensitive, purpose, fit, created_at)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, originalName.slice(0, 200), kind === 'jpg' || kind === 'png' ? 'image' : kind, result.pages, sensitive ? 1 : 0, purpose, fit, Date.now());
  return getFile(id);
}

/** Re-render an image upload as "fit" (whole image, with margin) or "fill" (edge to edge, cropped). */
export async function refitImage(file, fit) {
  if (file.kind !== 'image') throw new UserError('Only photos can be re-fitted');
  const orig = readBlob(file, 'orig');
  const kind = orig[0] === 0xff ? 'jpg' : 'png';
  const { bytes } = await imageToA4(orig, kind, fit);
  writeBlob(file.id, 'pdf', bytes, !!file.sensitive);
  q('UPDATE files SET fit = ?, version = version + 1 WHERE id = ?').run(fit, file.id);
  return getFile(file.id);
}

/** Calibration page set for printers without automatic duplex. */
export async function createDuplexTestFile() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const labels = ['FRONT of sheet 1', 'BACK of sheet 1', 'FRONT of sheet 2', 'BACK of sheet 2', 'FRONT of sheet 3'];
  for (const label of labels) {
    const page = doc.addPage([A4.w, A4.h]);
    page.drawText('TOP ^', { x: 250, y: 790, size: 28, font, color: rgb(0.09, 0.28, 0.84) });
    page.drawText(label, { x: 70, y: 420, size: 40, font });
    page.drawText('Text should be upright and on the correct side.', { x: 70, y: 370, size: 14, font });
  }
  const id = newId();
  writeBlob(id, 'pdf', await doc.save(), false);
  q(`INSERT INTO files(id, name, kind, pages, sensitive, purpose, created_at) VALUES(?, ?, 'pdf', ?, 0, 'system', ?)`)
    .run(id, 'Duplex test.pdf', labels.length, Date.now());
  return getFile(id);
}
