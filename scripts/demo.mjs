// Local demo with sample data, for trying out the UI without touching real data.
//   npm run demo   →  site http://localhost:5180   admin http://localhost:5180/admin (password: demo)
// Uses its own data folder (data-demo), port 4100, always open, pay at counter, no real printing.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'apps/server/package.json'));
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const API = 'http://localhost:4100';
const env = {
  ...process.env,
  PORT: '4100',
  DATA_DIR: path.join(ROOT, 'data-demo'),
  ADMIN_PASSWORD: 'demo',
  AGENT_TOKEN: 'demo-agent',
  PAYMENT_MODE: 'counter',
  SERVER_URL: API,
  AGENT_DRY_RUN: '1',
  SHOP_NAME: 'QuickPrint',
  SHOP_LEGAL_NAME: 'QuickPrint Stationery (demo)',
  SHOP_ADDRESS: '12 Main Road, Your Town 600001',
  SHOP_PHONE: '9876543210',
  SHOP_EMAIL: 'hello@example.com',
  API_PROXY: API,
};

const children = [];
function run(name, cmd, args) {
  const child = spawn(cmd, args, { cwd: ROOT, env, shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = `[${name}]`.padEnd(9);
  const out = (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => console.log(prefix, l));
  child.stdout.on('data', out);
  child.stderr.on('data', out);
  children.push(child);
  return child;
}
const stopAll = () => {
  for (const c of children) {
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
    else c.kill();
  }
  process.exit(0);
};
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

async function waitFor(url) {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} did not come up`);
}

async function samplePdf(title, pages, color) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const p = doc.addPage([595.28, 841.89]);
    p.drawRectangle({ x: 48, y: 260, width: 499, height: 500, color: rgb(...color), opacity: 0.85 });
    p.drawCircle({ x: 297, y: 510, size: 120, color: rgb(1, 1, 1), opacity: 0.25 });
    p.drawText(`${title}`, { x: 48, y: 200, size: 26, font: bold, color: rgb(0.05, 0.09, 0.2) });
    p.drawText(`Sheet ${i} of ${pages} · sample printable`, { x: 48, y: 168, size: 13, font, color: rgb(0.35, 0.4, 0.5) });
  }
  return doc.save();
}

async function seed() {
  const { token } = await (await fetch(`${API}/api/admin/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'demo' }),
  })).json();
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const allDay = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, { open: '00:00', close: '23:59' }]));
  await fetch(`${API}/api/admin/settings`, { method: 'PUT', headers: auth, body: JSON.stringify({ hours: allDay, order_cutoff_minutes: 0 }) });

  const existing = await (await fetch(`${API}/api/admin/trending`, { headers: auth })).json();
  if (existing.length) return;
  const samples = [
    ['Wild animals — 10 pictures', 'Class 3 project', 10, [0.85, 0.45, 0.1]],
    ['India political map', 'Maps', 1, [0.1, 0.55, 0.35]],
    ['Solar system chart', 'Science', 2, [0.12, 0.2, 0.55]],
    ['Parts of a plant', 'Science', 1, [0.2, 0.6, 0.2]],
    ['Tamil alphabet chart', 'Language', 1, [0.6, 0.15, 0.35]],
    ['Monthly planner 2026', 'Stationery', 12, [0.2, 0.35, 0.8]],
  ];
  for (const [title, tag, pages, color] of samples) {
    const form = new FormData();
    form.append('title', title);
    form.append('tag', tag);
    form.append('color', '1');
    form.append('file', new Blob([await samplePdf(title, pages, color)]), `${title}.pdf`);
    await fetch(`${API}/api/admin/trending`, { method: 'POST', headers: { Authorization: auth.Authorization }, body: form });
  }
}

run('server', 'node', ['--disable-warning=ExperimentalWarning', 'apps/server/src/index.js']);
await waitFor(`${API}/api/status`);
await seed();
run('agent', 'node', ['apps/agent/src/index.js']);
run('web', 'npm', ['run', 'dev', '-w', '@quickprint/web', '--', '--port', '5180', '--strictPort']);

console.log('\n  QuickPrint demo');
console.log('  Site:  http://localhost:5180');
console.log('  Admin: http://localhost:5180/admin   (password: demo)');
console.log('  Data:  data-demo/  (delete it to start fresh)   Stop: Ctrl+C\n');
