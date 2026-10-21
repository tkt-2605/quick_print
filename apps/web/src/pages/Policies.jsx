import { Link, useParams } from 'react-router-dom';
import { rupees } from '../lib/format.js';
import { hoursTable } from '../lib/hours.js';
import { useStore } from '../lib/store.jsx';

// Plain-language policies, filled in from the shop details in .env.
// Payment gateways (Razorpay, Cashfree) check these pages before approving the account.
// Have them reviewed for your situation — this is a sensible starting point, not legal advice.

const UPDATED = '22 October 2026';

function useShop() {
  const { config, status } = useStore();
  const s = config?.shop || {};
  const weekly = hoursTable(status?.hours || config?.status?.hours).map(([days, text]) => `${days} ${text}`).join(', ');
  const missing = (label) => <mark>[{label} — set in .env]</mark>;
  return {
    name: config?.shopName || 'QuickPrint',
    legal: s.legalName || missing('legal name'),
    address: s.address || missing('shop address'),
    phone: s.phone || missing('phone'),
    email: s.email || missing('email'),
    hours: weekly || s.hours || missing('shop hours'),
    holdDays: s.pickupHoldDays || 7,
    retention: config?.retentionHours || 24,
    prices: config?.prices,
  };
}

const PAGES = {
  contact: {
    title: 'Contact us',
    body: (s) => (
      <>
        <p><b>{s.name}</b> is operated by {s.legal}.</p>
        <dl className="contact-list">
          <dt>Shop address</dt><dd>{s.address}</dd>
          <dt>Phone / WhatsApp</dt><dd>{s.phone}</dd>
          <dt>Email</dt><dd>{s.email}</dd>
          <dt>Shop hours</dt><dd>{s.hours}</dd>
        </dl>
        <p>For a problem with an order, please mention your <b>order code</b> (e.g. K7M2Q). We reply within one working day.</p>
      </>
    ),
  },

  terms: {
    title: 'Terms & conditions',
    body: (s) => (
      <>
        <p>These terms apply to printing orders placed on this website, operated by {s.legal} ("we", "the shop").</p>
        <h2>The service</h2>
        <ul>
          <li>You upload documents or photos, choose print options, pay online, and collect the prints at our shop at {s.address}.</li>
          <li>All prints are on A4 paper. Pages are scaled to fit A4 with the printer's normal margins (about 3 mm).</li>
          <li>The on-screen preview is a close guide. Printed colours can differ slightly from your screen.</li>
          <li>Orders are printed during shop hours ({s.hours}).</li>
        </ul>
        <h2>Prices and payment</h2>
        <ul>
          <li>Prices are per printed side{s.prices ? ` (currently ${rupees(s.prices.bw)} black & white, ${rupees(s.prices.color)} colour)` : ''} and are shown before you pay. The amount at checkout is final.</li>
          <li>Payments are processed securely by our payment partner. We never see or store your card or UPI details.</li>
        </ul>
        <h2>Your content</h2>
        <ul>
          <li>You must have the right to print what you upload. Do not upload illegal, obscene or copyright-infringing material, or another person's identity documents without their permission.</li>
          <li>We may refuse or cancel an order that breaks these rules; in that case we refund the full amount.</li>
        </ul>
        <h2>Collection</h2>
        <p>Anyone who shows the order code or QR can collect a normal order. Private-document orders also need the PIN. Keep both safe. See our <Link to="/pickup-policy">pickup policy</Link>.</p>
        <h2>Contact</h2>
        <p>Questions: {s.phone} · {s.email}. These terms are governed by the laws of India. Last updated {UPDATED}.</p>
      </>
    ),
  },

  'refund-policy': {
    title: 'Refund & cancellation policy',
    body: (s) => (
      <>
        <h2>Before printing starts</h2>
        <p>Contact us with your order code before printing begins and we will cancel the order and refund the full amount.</p>
        <h2>After printing</h2>
        <p>Because every print is made to order, we cannot refund printed orders that came out as previewed. If a print is faulty because of us (smudged, misaligned, wrong options, missing pages), tell us when you collect it and we will <b>reprint it free or refund</b> that part of the order.</p>
        <h2>If we cannot complete your order</h2>
        <p>If we cancel an order (for example, a printer breakdown or the shop closing unexpectedly) and you do not want to wait, we refund the full amount.</p>
        <h2>How refunds are paid</h2>
        <ul>
          <li>Refunds go back to the original payment method (UPI, card, net banking or wallet).</li>
          <li>They are started within 2 working days and usually reach you in <b>5–7 working days</b>, depending on your bank.</li>
          <li>If money was deducted but the order shows as unpaid, it is normally reversed automatically by your bank within 5–7 working days. Contact us with the details if it is not.</li>
        </ul>
        <p>Refund requests: {s.phone} · {s.email}. Last updated {UPDATED}.</p>
      </>
    ),
  },

  'pickup-policy': {
    title: 'Pickup & delivery policy',
    body: (s) => (
      <>
        <p><b>We do not ship or deliver.</b> All orders are collected in person at our shop:</p>
        <p className="address-block">{s.address}<br />{s.hours}</p>
        <ul>
          <li>Most orders are ready within minutes of payment during shop hours. The order page shows live status.</li>
          <li>Show your order code or QR at the counter. Someone else can collect for you if you share the code with them.</li>
          <li>Private-document orders are printed only when the PIN is given at the counter.</li>
          <li>Uncollected prints are kept for <b>{s.holdDays} days</b>, then securely shredded. No refund is given for prints that are not collected.</li>
        </ul>
        <p>Last updated {UPDATED}.</p>
      </>
    ),
  },

  privacy: {
    title: 'Privacy policy',
    body: (s) => (
      <>
        <p>{s.legal} ("we") runs this website. This explains what we collect and what we do with it.</p>
        <h2>What we collect</h2>
        <ul>
          <li><b>Your name and mobile number</b> — to identify your order and contact you about it.</li>
          <li><b>The files you upload</b> — only to print them.</li>
          <li><b>Payment confirmation</b> from our payment partner. We never receive your card or UPI details.</li>
          <li>Your order history is stored <b>on your own device</b> (browser storage), not in an account.</li>
        </ul>
        <h2>How long we keep your files</h2>
        <ul>
          <li>Normal files are deleted automatically <b>{s.retention} hours</b> after the order is completed or cancelled.</li>
          <li><b>Private documents</b> (e.g. Aadhaar, PAN, bank statements, when you turn on "Private documents") are stored encrypted, cannot be opened by shop staff, and are deleted immediately after printing — or within 1 hour if they are never printed.</li>
          <li>Unpaid orders are cancelled after 24 hours and their files deleted.</li>
          <li>We keep basic order records (code, amount, date, name, phone) for our accounts.</li>
        </ul>
        <h2>Sharing</h2>
        <p>We do not sell or share your information, except with our payment partner to process payments, or when the law requires it.</p>
        <h2>Your choices</h2>
        <p>To have your details or files deleted sooner, contact {s.email} or {s.phone} with your order code. Last updated {UPDATED}.</p>
      </>
    ),
  },
};

export const POLICY_LINKS = [
  ['contact', 'Contact us'],
  ['terms', 'Terms'],
  ['privacy', 'Privacy'],
  ['refund-policy', 'Refunds & cancellation'],
  ['pickup-policy', 'Pickup & delivery'],
];

export default function Policy({ page: fixed }) {
  const params = useParams();
  const shop = useShop();
  const page = PAGES[fixed || params.page];
  if (!page) return <p className="empty">Page not found. <Link to="/">Go home</Link></p>;
  return (
    <article className="policy card">
      <h1>{page.title}</h1>
      {page.body(shop)}
    </article>
  );
}
