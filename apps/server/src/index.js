import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import adminApi from './api/admin.js';
import agentApi from './api/agent.js';
import publicApi from './api/public.js';
import { startCleanup } from './cleanup.js';
import { razorpayWebhook, reconcilePayments } from './payments.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');

// The customer site is hosted separately (GitHub Pages), so it calls this API cross-origin.
const allowedOrigins = new Set(config.corsOrigins);
app.use('/api', (req, res, next) => {
  const origin = req.get('origin');
  if (origin && allowedOrigins.has(origin)) {
    res.set({
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    });
  }
  if (req.method === 'OPTIONS') return res.sendStatus(origin && allowedOrigins.has(origin) ? 204 : 403);
  next();
});

// Webhook needs the raw body for signature verification, so it goes before express.json().
app.post('/api/payments/razorpay/webhook', express.raw({ type: 'application/json' }), razorpayWebhook);
app.use(express.json({ limit: '1mb' }));

app.use('/api/admin', adminApi);
app.use('/api/agent', agentApi);
app.use('/api', publicApi);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built web app (npm run build) with SPA fallback.
if (fs.existsSync(config.webDist)) {
  app.use(express.static(config.webDist, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(config.webDist, 'index.html')) : next()));
}

app.use((err, req, res, next) => {
  let status = err.status || err.statusCode || 500;
  let message = err.expose ? err.message : 'Something went wrong. Please try again.';
  if (err.code === 'LIMIT_FILE_SIZE') {
    status = 413;
    message = `File is too large (max ${config.maxUploadMb} MB)`;
  }
  if (status >= 500) console.error(err);
  res.status(status).json({ error: message });
});

startCleanup();
// Pick up payments Razorpay received while this PC was off, then keep checking.
reconcilePayments();
setInterval(reconcilePayments, 5 * 60_000).unref();
app.listen(config.port, () => {
  console.log(`[quickprint] server on http://localhost:${config.port} (payments: ${config.paymentMode}, office files: ${config.sofficePath ? 'yes' : 'no'})`);
});
