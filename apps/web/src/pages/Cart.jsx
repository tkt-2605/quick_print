import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import PageThumb from '../components/PageThumb.jsx';
import PreviewModal, { Segmented } from '../components/PreviewModal.jsx';
import { api, fileUrl } from '../lib/api.js';
import { plural, rupees, sheetsFor } from '../lib/format.js';
import { trySelection } from '../lib/range.js';
import { useStore } from '../lib/store.jsx';

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the payment page. Check your connection.'));
    document.body.appendChild(s);
  });
}

function CartItem({ item, onPreview }) {
  const { updateItem, removeItem, priceOf, canDuplex } = useStore();
  const [customRange, setCustomRange] = useState(!!item.range);
  const [fitBusy, setFitBusy] = useState(false);
  const { pages, error } = trySelection(item);
  const first = pages?.[0] ?? 0;

  async function changeFit(fit) {
    setFitBusy(true);
    try {
      const f = await api.setFit(item.fileId, fit);
      updateItem(item.key, { fit: f.fit, version: f.version });
    } catch (e) {
      alert(e.message);
    } finally {
      setFitBusy(false);
    }
  }

  return (
    <article className="cart-item card">
      <div className="cart-thumb">
        <PageThumb url={fileUrl(item.fileId, item.version)} index={first} width={104} mono={!item.color} onClick={onPreview} />
        <button className="btn btn-light btn-sm" onClick={onPreview}><Icon name="eye" size={16} /> Preview</button>
      </div>

      <div className="cart-opts">
        <div className="cart-item-head">
          <div>
            <strong className="file-name">{item.name}</strong>
            <span className="file-meta">
              <Icon name={item.kind === 'image' ? 'image' : 'file'} size={14} /> {plural(item.pages, 'page')}{item.kind === 'image' ? ' · photo' : ''}
            </span>
          </div>
          <button className="icon-btn danger" onClick={() => removeItem(item.key)} aria-label="Remove" title="Remove"><Icon name="trash" size={18} /></button>
        </div>

        <div className="opt-grid">
          <div className="opt">
            <span className="opt-label">Print</span>
            <Segmented value={item.color ? 'color' : 'bw'} onChange={(v) => updateItem(item.key, { color: v === 'color' })}
              options={[['bw', 'B&W'], ['color', 'Colour']]} />
          </div>
          {item.pages > 1 && canDuplex(item.color) ? (
            <div className="opt">
              <span className="opt-label">Sides</span>
              <Segmented value={item.duplex ? 'double' : 'single'} onChange={(v) => updateItem(item.key, { duplex: v === 'double' })}
                options={[['single', 'Single'], ['double', 'Both sides']]} />
            </div>
          ) : null}
          {item.kind === 'image' && !item.trending ? (
            <div className="opt">
              <span className="opt-label">Photo</span>
              <Segmented value={item.fit} onChange={(v) => !fitBusy && changeFit(v)}
                options={[['fit', 'Whole photo'], ['fill', 'Fill page']]} />
            </div>
          ) : null}
          <div className="opt">
            <span className="opt-label">Copies</span>
            <div className="stepper" aria-label="Copies">
              <button onClick={() => updateItem(item.key, { copies: Math.max(1, item.copies - 1) })} aria-label="Fewer copies"><Icon name="minus" size={16} /></button>
              <span>{item.copies}</span>
              <button onClick={() => updateItem(item.key, { copies: Math.min(100, item.copies + 1) })} aria-label="More copies"><Icon name="plus" size={16} /></button>
            </div>
          </div>
        </div>

        <div className="row">
          {item.pages > 1 ? (
            <label className="check">
              <input type="checkbox" checked={customRange} onChange={(e) => {
                setCustomRange(e.target.checked);
                if (!e.target.checked) updateItem(item.key, { range: '' });
              }} />
              Only some pages
            </label>
          ) : null}
        </div>

        {customRange ? (
          <div className="field">
            <input className={`input${error ? ' invalid' : ''}`} placeholder={`e.g. 1-3, 5 (of ${item.pages})`} value={item.range}
              onChange={(e) => updateItem(item.key, { range: e.target.value })} />
            {error ? <small className="error-text">{error}</small> : null}
          </div>
        ) : null}

        <div className="cart-item-foot">
          <span className="muted small">
            {pages ? `${plural(pages.length, 'page')} · ${plural(sheetsFor(pages.length, item.copies, item.duplex), 'sheet')} of A4` : '—'}
          </span>
          <b>{rupees(priceOf(item))}</b>
        </div>
      </div>
    </article>
  );
}

export default function Cart() {
  const { config, shop, cart, total, clearCart, rememberOrder, canOrder, online } = useStore();
  // Online payments on + counter allowed → the customer chooses.
  const canChoose = !!config && config.paymentMode !== 'counter' && config.payAtCounter;
  const [payMethod, setPayMethod] = useState('online');
  const counter = config?.paymentMode === 'counter' || (canChoose && payMethod === 'counter');
  const navigate = useNavigate();
  const [preview, setPreview] = useState(null);
  const [name, setName] = useState(() => localStorage.getItem('qp.name') || '');
  const [phone, setPhone] = useState(() => localStorage.getItem('qp.phone') || '');
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  const invalid = cart.some((i) => trySelection(i).error);
  const sheets = cart.reduce((a, i) => {
    const { pages } = trySelection(i);
    return a + (pages ? sheetsFor(pages.length, i.copies, i.duplex) : 0);
  }, 0);
  const previewItem = cart.find((i) => i.key === preview);

  async function checkout(e) {
    e.preventDefault();
    setError('');
    setPaying(true);
    try {
      localStorage.setItem('qp.name', name);
      localStorage.setItem('qp.phone', phone);
      const order = await api.createOrder({
        customer: { name, phone },
        payMethod: counter ? 'counter' : 'online',
        items: cart.map((i) => ({ fileId: i.fileId, copies: i.copies, color: i.color, duplex: i.duplex, range: i.range })),
      });
      rememberOrder({
        id: order.id,
        token: order.token,
        code: order.code,
        createdAt: Date.now(),
        amount: order.amount,
        stage: 'pending_payment',
        payAtCounter: order.payment.mode === 'counter',
        files: cart.map((i) => i.name),
      });

      const finish = () => {
        clearCart();
        navigate(`/order/${order.id}?t=${order.token}`);
      };

      // Pay at counter: the order waits until staff marks it paid.
      if (order.payment.mode === 'counter') return finish();

      if (order.payment.mode === 'mock') {
        if (!window.confirm(`TEST MODE — no real payment.\n\nPretend to pay ${rupees(order.amount)}?`)) return;
        await api.payOrder(order.id, order.token, { mock: true });
        return finish();
      }

      await loadRazorpay();
      await new Promise((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: order.payment.keyId,
          order_id: order.payment.gatewayOrderId,
          amount: order.amount,
          currency: 'INR',
          name: shop.name,
          description: `Print order ${order.code}`,
          prefill: { name, contact: phone },
          theme: { color: '#1a4fd6' },
          handler: (resp) => api.payOrder(order.id, order.token, resp).then(resolve, reject),
          modal: { ondismiss: () => reject(new Error('Payment cancelled — your cart is still here.')) },
        });
        rzp.on('payment.failed', (r) => reject(new Error(r.error?.description || 'Payment failed')));
        rzp.open();
      });
      finish();
    } catch (err) {
      setError(err.message);
    } finally {
      setPaying(false);
    }
  }

  if (!cart.length) {
    return (
      <section className="empty-state">
        <h1>Your cart is empty</h1>
        <p className="muted">Upload a file or pick something from Trending.</p>
        <div className="row center">
          <Link to="/" className="btn btn-primary">Upload files</Link>
          <Link to="/trending" className="btn btn-ghost">Trending</Link>
        </div>
      </section>
    );
  }

  return (
    <div className="cart-layout">
      <section>
        <div className="section-head">
          <h1 className="page-title">Your prints</h1>
          <Link to="/" className="btn btn-light btn-sm"><Icon name="plus" size={16} /> Add files</Link>
        </div>
        {cart.map((item) => <CartItem key={item.key} item={item} onPreview={() => setPreview(item.key)} />)}
      </section>

      <aside className="checkout card">
        <h2>Checkout</h2>
        <dl className="summary">
          <dt>Files</dt><dd>{cart.length}</dd>
          <dt>A4 sheets</dt><dd>{sheets}</dd>
          <dt>Total</dt><dd className="total">{rupees(total)}</dd>
        </dl>
        {online !== null && !canOrder ? (
          <p className="notice error">The shop isn't taking orders right now. Your cart is saved — place the order when we're open.</p>
        ) : null}
        <form onSubmit={checkout}>
          <label className="field">
            <span>Your name</span>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
          <label className="field">
            <span>Mobile number</span>
            <input className="input" required inputMode="numeric" pattern="[0-9+ ]{10,14}" value={phone}
              onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="10-digit mobile" />
          </label>
          {canChoose ? (
            <fieldset className="pay-choice">
              <legend>Payment</legend>
              <label className={payMethod === 'online' ? 'on' : ''}>
                <input type="radio" name="pay" value="online" checked={payMethod === 'online'} onChange={() => setPayMethod('online')} />
                <span><b>Pay online now</b><small>UPI, cards, net banking — printing starts right away</small></span>
              </label>
              <label className={payMethod === 'counter' ? 'on' : ''}>
                <input type="radio" name="pay" value="counter" checked={payMethod === 'counter'} onChange={() => setPayMethod('counter')} />
                <span><b>Pay at the counter</b><small>Cash or UPI at the shop — we print once you've paid</small></span>
              </label>
            </fieldset>
          ) : null}
          {error ? <p className="error-text">{error}</p> : null}
          <button className="btn btn-primary btn-block btn-lg" disabled={paying || invalid || !config || !canOrder}>
            {paying ? 'Processing…' : counter ? `Place order · pay ${rupees(total)} at counter` : `Pay ${rupees(total)}`}
          </button>
          <p className="muted small center">
            By ordering you agree to our <Link to="/terms">Terms</Link> and <Link to="/refund-policy">Refund policy</Link>. Collect at the shop — no delivery.
          </p>
          {counter ? <p className="muted small center">You'll get an order code. Pay by cash or UPI at the counter and we'll print it then.</p> : null}
          {config?.paymentMode === 'mock' ? <p className="muted small center">Test mode: no real payment is taken.</p> : null}
        </form>
      </aside>

      <div className="mobile-paybar">
        <span><b>{rupees(total)}</b><small>{plural(sheets, 'sheet')}</small></span>
        <a href="#checkout" className="btn btn-primary" onClick={(e) => {
          e.preventDefault();
          document.querySelector('.checkout')?.scrollIntoView({ behavior: 'smooth' });
        }}>Checkout</a>
      </div>

      {previewItem ? <PreviewModal item={previewItem} onClose={() => setPreview(null)} /> : null}
    </div>
  );
}
