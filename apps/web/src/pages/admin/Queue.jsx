import { useCallback, useEffect, useRef, useState } from 'react';
import { plural, rupees, timeAgo } from '../../lib/format.js';
import QrScanner from './QrScanner.jsx';
import { describeOpening, formatTime } from '../../lib/hours.js';

const STAGE_LABEL = {
  pending_payment: '💰 Waiting for payment',
  queued: 'Queued',
  printing: 'Printing',
  awaiting_release: 'Waiting for customer PIN',
  attention: 'Needs attention',
  ready: 'Ready — call customer',
  collected: 'Collected',
  cancelled: 'Cancelled',
};
const ITEM_LABEL = {
  pending_payment: 'Unpaid',
  held: 'Held (private)',
  queued: 'Queued',
  printing: 'Printing',
  awaiting_flip: 'FLIP NEEDED',
  flip_ok: 'Printing backs',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // audio blocked until the page is clicked once
  }
}

export default function Queue({ api }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const seen = useRef(null);

  const load = useCallback(async () => {
    try {
      const d = await api.queue();
      // Beep for new orders (paid online, or waiting to pay at the counter) and for stacks that need flipping.
      const alerts = new Set(d.orders.flatMap((o) => [['active', 'pending_payment'].includes(o.status) ? o.id : null, ...o.items.filter((i) => i.status === 'awaiting_flip').map((i) => `flip-${i.id}`)]).filter(Boolean));
      if (seen.current && [...alerts].some((k) => !seen.current.has(k))) beep();
      seen.current = alerts;
      setData(d);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [api]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (fn) => {
    try {
      await fn();
    } catch (e) {
      alert(e.message);
    }
    load();
  };

  if (!data) return <p className="muted">{error || 'Loading…'}</p>;
  const printers = Object.fromEntries(data.printers.map((p) => [p.id, p]));
  const unpaid = data.orders.filter((o) => o.status === 'pending_payment');
  const active = data.orders.filter((o) => o.status === 'active');
  const closed = data.orders.filter((o) => o.status === 'collected' || o.status === 'cancelled');

  return (
    <div>
      <ShopPanel shop={data.shop} api={api} act={act} />
      <Handover api={api} printers={printers} act={act} />
      {error ? <p className="notice error">Connection problem: {error}</p> : null}
      <div className="printer-strip">
        {data.printers.filter((p) => p.enabled).map((p) => (
          <span key={p.id} className={`printer-pill ${p.online ? 'ok' : 'bad'}`}>
            {p.online ? '●' : '○'} {p.label} <small>{p.online ? 'online' : p.lastSeen ? p.status : 'agent not running'}</small>
          </span>
        ))}
      </div>

      {unpaid.length ? (
        <>
          <h2 className="queue-heading">Waiting for payment at counter ({unpaid.length})</h2>
          <div className="queue">{unpaid.map((o) => <OrderCard key={o.id} o={o} printers={printers} act={act} api={api} />)}</div>
        </>
      ) : null}

      <h2 className="queue-heading">Open orders ({active.length})</h2>
      {!active.length ? <p className="empty">No open orders. New orders appear here automatically.</p> : null}
      <div className="queue">
        {active.map((o) => <OrderCard key={o.id} o={o} printers={printers} act={act} api={api} />)}
      </div>

      {closed.length ? (
        <>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowClosed(!showClosed)}>
            {showClosed ? 'Hide' : 'Show'} {closed.length} closed orders (last 12h)
          </button>
          {showClosed ? <div className="queue">{closed.map((o) => <OrderCard key={o.id} o={o} printers={printers} act={act} api={api} />)}</div> : null}
        </>
      ) : null}
    </div>
  );
}

/** Counter check: type or scan the customer's pickup code, see if it may be handed over. */
function Handover({ api, printers, act }) {
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null); // { order } | { error }

  const lookup = useCallback(async (c) => {
    setScanning(false);
    setCode(c);
    try {
      setResult({ order: await api.orderByCode(c) });
    } catch (e) {
      setResult({ error: e.message });
    }
  }, [api]);

  const o = result?.order;
  const verdict = !o ? null
    : o.status === 'collected' ? ['bad', `⚠ Already collected ${timeAgo(o.closedAt)} — do not hand over again`]
    : o.status === 'cancelled' ? ['bad', '⚠ This order was cancelled']
    : o.status === 'pending_payment' ? ['warn', `💰 Not paid yet — collect ${rupees(o.amount)} (cash or UPI), then press Paid`]
    : o.stage === 'ready' ? ['ok', `✅ Ready — hand over to the customer (${o.customerName})`]
    : o.stage === 'awaiting_release' ? ['warn', '🔒 Private order — ask for the 4-digit PIN, then release to print']
    : ['warn', '⏳ Not finished printing yet'];

  return (
    <>
      <form className="handover-bar card" onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) lookup(code.trim().toUpperCase());
      }}>
        <input className="input" placeholder="Order code" value={code} maxLength={5}
          onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <button className="btn btn-primary">Check</button>
        <button type="button" className="btn btn-ghost" onClick={() => setScanning(true)}>📷 Scan QR</button>
      </form>

      {scanning ? <QrScanner onCode={lookup} onClose={() => setScanning(false)} /> : null}

      {result ? (
        <div className="modal-backdrop" onClick={() => setResult(null)}>
          <div className="modal handover" onClick={(e) => e.stopPropagation()}>
            <header className="modal-head">
              <strong>Pickup check · {code}</strong>
              <button className="icon-btn" onClick={() => setResult(null)} aria-label="Close">✕</button>
            </header>
            <div className="handover-body">
              {result.error ? <p className="verdict bad">❌ {result.error}</p> : null}
              {verdict ? <p className={`verdict ${verdict[0]}`}>{verdict[1]}</p> : null}
              {o ? (
                <OrderCard o={o} printers={printers} api={api} act={async (fn) => {
                  await act(fn);
                  lookup(o.code);
                }} />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Open/closed and printing controls for the shopkeeper. */
function ShopPanel({ shop, api, act }) {
  const [closing, setClosing] = useState(false);
  const [message, setMessage] = useState('');
  const [reopen, setReopen] = useState('next');
  if (!shop) return null;

  const state = shop.open
    ? ['ok', `🟢 OPEN — taking orders until ${formatTime(shop.lastOrderAt)}`]
    : shop.reason === 'manual'
      ? ['bad', `🔴 CLOSED by you${shop.nextOpen ? ` — reopens ${describeOpening(shop.nextOpen)}` : ' — until you reopen'}`]
      : ['bad', `🌙 CLOSED (shop hours)${shop.nextOpen ? ` — opens ${describeOpening(shop.nextOpen)}` : ''}`];

  return (
    <div className="card shop-panel">
      <div className="row">
        <span className={`verdict ${state[0]}`}>{state[1]}</span>
        {shop.reason === 'manual' ? (
          <button className="btn btn-primary btn-sm" onClick={() => act(() => api.openShop())}>Reopen now</button>
        ) : (
          <button className="btn btn-ghost btn-sm danger" onClick={() => setClosing(!closing)}>Close shop now</button>
        )}
        <button className={`btn btn-sm ${shop.printingPaused ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => act(() => api.setPrintingPaused(!shop.printingPaused))}>
          {shop.printingPaused ? '▶ Resume printing' : '⏸ Pause printing'}
        </button>
      </div>
      {shop.printingPaused ? <p className="notice">Printing is paused. Orders are still accepted and wait in the queue; customers see "short delay".</p> : null}
      {closing ? (
        <form className="close-form" onSubmit={(e) => {
          e.preventDefault();
          setClosing(false);
          act(() => api.closeShop(message, reopen));
        }}>
          <input className="input" placeholder="Message for customers (optional), e.g. Closed due to emergency, back tomorrow" value={message} onChange={(e) => setMessage(e.target.value)} />
          <label className="check"><input type="radio" checked={reopen === 'next'} onChange={() => setReopen('next')} /> Reopen automatically at the next opening time</label>
          <label className="check"><input type="radio" checked={reopen === 'manual'} onChange={() => setReopen('manual')} /> Stay closed until I press Reopen</label>
          <button className="btn btn-primary btn-sm">Close shop</button>
          <small className="muted">Orders already paid stay in the queue and print as normal.</small>
        </form>
      ) : null}
    </div>
  );
}

function OrderCard({ o, printers, act, api }) {
  const [pin, setPin] = useState('');
  return (
    <article className={`card queue-card stage-${o.stage}`}>
      <header>
        <div>
          <span className="order-code sm">{o.code}</span>
          {o.sensitive ? <span className="chip warn">🔒 private</span> : null}
        </div>
        <span className={`stage stage-${o.stage}`}>{STAGE_LABEL[o.stage] || o.stage}</span>
      </header>
      <div className="muted small">
        {o.paidBy ? <span className="chip">paid {o.paidBy}</span> : null} {o.customerName}{o.phone ? <> · <a href={`tel:${o.phone}`}>{o.phone}</a></> : null} · {rupees(o.amount)} · {timeAgo(o.paidAt || o.createdAt)}
      </div>

      {o.stage === 'awaiting_release' ? (
        <form className="row" onSubmit={(e) => {
          e.preventDefault();
          act(() => api.release(o.id, pin));
        }}>
          <input className="input pin-input" inputMode="numeric" maxLength={4} placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value)} />
          <button className="btn btn-primary btn-sm">Release & print</button>
        </form>
      ) : null}

      <ul className="queue-items">
        {o.items.map((i) => {
          const printer = printers[i.printerId];
          return (
            <li key={i.id} className={`qi qi-${i.status}`}>
              <div className="qi-main">
                <strong className="file-name">{i.fileName}</strong>
                <small className="muted">
                  {plural(i.pageCount, 'pg')} · {i.color ? 'Colour' : 'B&W'} · {i.duplex ? 'Both sides' : 'Single'} · {i.copies}× · {plural(i.sheets, 'sheet')}
                  {printer ? ` · ${printer.label}` : ''}
                </small>
                {i.error ? <small className="error-text">{i.error}</small> : null}
              </div>
              <span className={`status status-${i.status}`}>{ITEM_LABEL[i.status] || i.status}</span>

              {i.status === 'awaiting_flip' ? (
                <div className="flip-box">
                  <p>
                    <b>Fronts printed.</b> Take the {plural(Math.ceil(i.sheets), 'sheet')} from the output tray, keep them in order,
                    flip the stack over and load it back into {printer?.label || 'the printer'}. Then press:
                  </p>
                  <button className="btn btn-primary" onClick={() => act(() => api.flipped(i.id))}>Reloaded — print back sides</button>
                </div>
              ) : null}

              <div className="qi-actions">
                {!o.sensitive && o.code !== 'TEST' ? (
                  <button className="btn btn-ghost btn-xs" onClick={() => act(async () => {
                    const blob = await api.filePdf(i.fileId);
                    window.open(URL.createObjectURL(blob), '_blank');
                  })}>View</button>
                ) : null}
                {['failed', 'printing', 'awaiting_flip', 'flip_ok', 'done'].includes(i.status) ? (
                  <button className="btn btn-ghost btn-xs" onClick={() => {
                    if (i.status === 'printing' && !confirm('Only retry if the print agent crashed or the job is stuck. Retry?')) return;
                    act(() => api.retry(i.id));
                  }}>{i.status === 'done' ? 'Reprint' : 'Retry'}</button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {o.status === 'pending_payment' ? (
        <footer className="row">
          <button className="btn btn-primary btn-sm" onClick={() => act(() => api.markPaid(o.id, 'cash'))}>💵 Paid cash {rupees(o.amount)}</button>
          <button className="btn btn-primary btn-sm" onClick={() => act(() => api.markPaid(o.id, 'upi'))}>📱 Paid UPI</button>
          <button className="btn btn-ghost btn-sm danger" onClick={() => confirm(`Cancel unpaid order ${o.code}?`) && act(() => api.cancel(o.id))}>Cancel</button>
        </footer>
      ) : null}
      {o.status === 'active' ? (
        <footer className="row">
          <button className="btn btn-primary btn-sm" disabled={o.stage !== 'ready'} onClick={() => act(() => api.collected(o.id))}>Mark collected</button>
          <button className="btn btn-ghost btn-sm danger" onClick={() => confirm(`Cancel order ${o.code}? Refund it from the Razorpay dashboard.`) && act(() => api.cancel(o.id))}>Cancel</button>
        </footer>
      ) : null}
    </article>
  );
}
