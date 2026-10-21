import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;
const dataDir = path.resolve(ROOT, env.DATA_DIR || 'data');
const filesDir = path.join(dataDir, 'files');
const tmpDir = path.join(dataDir, 'tmp');
for (const d of [filesDir, tmpDir]) fs.mkdirSync(d, { recursive: true });

// Secrets come from env, or are generated once and kept in the data dir.
function persistentSecret(name) {
  if (env[name]) return env[name];
  const file = path.join(dataDir, `${name.toLowerCase()}.secret`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'));
  return fs.readFileSync(file, 'utf8').trim();
}

function findSoffice() {
  const candidates = [
    env.SOFFICE_PATH,
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    '/usr/bin/soffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  ];
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

// counter = customer pays at the shop and staff marks it paid (default until a gateway is set up)
// razorpay = online payment; mock = developer testing (fake "pay" button)
function paymentMode() {
  const wanted = (env.PAYMENT_MODE || '').toLowerCase();
  if (wanted === 'mock' || wanted === 'counter') return wanted;
  if (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) return 'razorpay';
  if (wanted === 'razorpay') console.warn('[config] PAYMENT_MODE=razorpay but keys are missing — using pay at counter.');
  return 'counter';
}

const razorpay = {
  keyId: env.RAZORPAY_KEY_ID || '',
  keySecret: env.RAZORPAY_KEY_SECRET || '',
  webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || '',
};

export const config = {
  root: ROOT,
  dataDir,
  filesDir,
  tmpDir,
  webDist: path.join(ROOT, 'apps/web/dist'),
  port: Number(env.PORT || 4000),
  shopName: env.SHOP_NAME || 'QuickPrint',
  adminPassword: env.ADMIN_PASSWORD || 'admin',
  agentToken: env.AGENT_TOKEN || 'dev-agent-token',
  fileKey: Buffer.from(persistentSecret('FILE_KEY'), 'hex'),
  sessionSecret: persistentSecret('SESSION_SECRET'),
  razorpay,
  paymentMode: paymentMode(),
  // Browser origins allowed to call the API (the GitHub Pages site), comma-separated.
  corsOrigins: (env.CORS_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),
  tzOffsetMinutes: Number(env.SHOP_TZ_OFFSET_MINUTES ?? 330), // IST = UTC+5:30
  sofficePath: findSoffice(),
  maxUploadMb: 50,
  maxPages: 500,
  // Public business details for the policy/contact pages (required by payment gateways).
  shop: {
    legalName: env.SHOP_LEGAL_NAME || '',
    address: env.SHOP_ADDRESS || '',
    phone: env.SHOP_PHONE || '',
    email: env.SHOP_EMAIL || '',
    hours: env.SHOP_HOURS || '',
    pickupHoldDays: Number(env.PICKUP_HOLD_DAYS || 7),
  },
};

if (!env.ADMIN_PASSWORD) console.warn('[config] ADMIN_PASSWORD not set — using "admin". Set it in .env before going live.');
if (!env.AGENT_TOKEN) console.warn('[config] AGENT_TOKEN not set — using a dev token. Set it in .env before going live.');
if (!config.shop.legalName || !config.shop.address || !config.shop.phone || !config.shop.email) {
  console.warn('[config] SHOP_LEGAL_NAME / SHOP_ADDRESS / SHOP_PHONE / SHOP_EMAIL missing — policy pages will show placeholders.');
}
if (config.paymentMode === 'mock') console.warn('[config] PAYMENT_MODE=mock — fake payments for testing only.');
if (config.paymentMode === 'counter') console.warn('[config] No payment gateway — customers pay at the counter.');
