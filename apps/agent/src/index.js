import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPass } from './passes.js';
import { findSumatra, listWindowsPrinters, printPdf } from './windows.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
if (fs.existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'));

const SERVER = (process.env.SERVER_URL || 'http://localhost:4000').replace(/\/$/, '');
const TOKEN = process.env.AGENT_TOKEN || 'dev-agent-token';
const DRY_RUN = process.env.AGENT_DRY_RUN === '1';
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || 'data');
const OUT_DIR = path.join(DATA_DIR, DRY_RUN ? 'agent-out' : 'agent-tmp');
const POLL_MS = 3000;
const PRINTER_SCAN_MS = 15_000;

const sumatra = findSumatra();
if (!sumatra && !DRY_RUN) {
  console.error('SumatraPDF not found. Install it from https://www.sumatrapdfreader.org or set SUMATRA_PATH in .env');
  process.exit(1);
}
fs.mkdirSync(OUT_DIR, { recursive: true });

const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);

async function api(pathname, { method = 'GET', body } = {}) {
  const res = await fetch(SERVER + pathname, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${pathname} → ${res.status} ${await res.text()}`);
  return res.headers.get('content-type')?.includes('json') ? res.json() : Buffer.from(await res.arrayBuffer());
}

let printers = [];
let scannedAt = 0;
async function currentPrinters() {
  if (Date.now() - scannedAt > PRINTER_SCAN_MS) {
    try {
      printers = await listWindowsPrinters();
    } catch (e) {
      log('printer scan failed:', e.message);
    }
    scannedAt = Date.now();
  }
  // In dry-run, pretend every configured printer is present and ready.
  return DRY_RUN ? null : printers;
}

async function handle(job) {
  const label = `#${job.id} [${job.orderCode}] ${job.fileName} (${job.pass}, ${job.color ? 'colour' : 'B&W'}, ${job.copies}x) → ${job.printer.windowsName}`;
  log('printing', label);
  const file = path.join(OUT_DIR, `${job.orderCode}-${job.id}-${job.pass}.pdf`);
  try {
    const pdf = await buildPass(await api(`/api/agent/items/${job.id}/file`), job);
    if (pdf) {
      fs.writeFileSync(file, pdf);
      if (!DRY_RUN) {
        await printPdf(sumatra, file, {
          printerName: job.printer.windowsName,
          color: job.color,
          autoDuplex: job.pass === 'all' && job.duplex && job.printer.duplex === 'auto',
        });
      }
    }
    await api(`/api/agent/items/${job.id}/result`, { method: 'POST', body: { ok: true } });
    log('done', label, job.pass === 'front' ? '— waiting for the stack to be flipped' : '');
  } catch (e) {
    log('FAILED', label, e.message);
    await api(`/api/agent/items/${job.id}/result`, { method: 'POST', body: { ok: false, error: e.message } }).catch(() => {});
  } finally {
    if (!DRY_RUN) fs.rmSync(file, { force: true }); // never leave customer documents lying around
  }
}

async function main() {
  log(`QuickPrint agent → ${SERVER}${DRY_RUN ? ' (DRY RUN: PDFs go to ' + OUT_DIR + ')' : ''}`);
  for (;;) {
    try {
      const reported = await currentPrinters();
      const { job } = await api('/api/agent/poll', { method: 'POST', body: reported ? { printers: reported } : { dryRun: true } });
      if (job) {
        await handle(job);
        continue; // check straight away for more work
      }
    } catch (e) {
      log('server unreachable:', e.message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main();
