import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { plural, rupees } from '../lib/format.js';
import Icon from '../components/Icon.jsx';
import PickupPass from '../components/PickupPass.jsx';
import { useStore } from '../lib/store.jsx';

const STEPS = [
  ['queued', 'Paid & queued'],
  ['printing', 'Printing'],
  ['ready', 'Ready to collect'],
  ['collected', 'Collected'],
];
const STEP_INDEX = { pending_payment: -1, queued: 0, attention: 1, printing: 1, ready: 2, collected: 3 };
const PASS_STAGES = ['pending_payment', 'queued', 'printing', 'ready', 'attention'];
const FINAL = ['collected', 'cancelled'];

const ITEM_STATUS = {
  pending_payment: 'Awaiting payment',
  queued: 'In queue',
  printing: 'Printing',
  awaiting_flip: 'Printing back sides',
  flip_ok: 'Printing back sides',
  done: 'Printed',
  failed: 'Needs staff attention',
  cancelled: 'Cancelled',
};

export default function Order() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t');
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [unreachable, setUnreachable] = useState(false);
  const { config, status, orders, updateOrder } = useStore();
  const counter = config?.paymentMode === 'counter';

  useEffect(() => {
    let timer;
    let stopped = false;
    const load = async () => {
      try {
        const o = await api.getOrder(id, token);
        if (stopped) return;
        setOrder(o);
        setUnreachable(false);
        updateOrder(id, { stage: o.stage });
        if (!FINAL.includes(o.stage)) timer = setTimeout(load, 4000);
      } catch (e) {
        if (stopped) return;
        if (e.status === 404) return setError(e.message);
        setUnreachable(true); // shop PC off or network down: keep trying
        timer = setTimeout(load, 10000);
      }
    };
    load();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id, token, updateOrder]);

  if (error) return <p className="empty">{error}</p>;
  if (!order) {
    const saved = orders.find((o) => o.id === id);
    if (unreachable && saved) {
      return (
        <section className="order-page">
          <div className="card order-hero">
            <span className="muted">Order code</span>
            <div className="order-code">{saved.code}</div>
            <PickupPass code={saved.code} />
          </div>
          <p className="notice">Can't reach the shop right now, so live status isn't available. Your order is safe — show this code at the counter.</p>
        </section>
      );
    }
    return <p className="muted">{unreachable ? "Can't reach the shop right now — retrying…" : 'Loading…'}</p>;
  }

  // With pay at counter, paying is the first visible step.
  const unpaid = order.stage === 'pending_payment';
  const steps = counter ? [['pay', unpaid ? 'Pay at counter' : 'Paid at counter'], ...STEPS.map(([k, l]) => [k, k === 'queued' ? 'In print queue' : l])] : STEPS;
  const step = (STEP_INDEX[order.stage] ?? -1) + (counter ? 1 : 0);

  return (
    <section className="order-page">
      <div className="card order-hero">
        <span className="muted">Order code</span>
        <div className="order-code">{order.code}</div>
        <span className="muted">
          Show this code or QR at the counter · {rupees(order.amount)} {unpaid ? (counter ? 'to pay' : 'unpaid') : 'paid'}
        </span>
        {PASS_STAGES.includes(order.stage) && (!unpaid || counter) ? (
          <PickupPass code={order.code} />
        ) : null}
      </div>

      {order.stage === 'cancelled' ? <p className="notice error">This order was cancelled.</p> : null}
      {unpaid && counter ? (
        <div className="card pay-counter">
          <div className="pay-amount"><Icon name="banknote" size={24} /> Pay {rupees(order.amount)} at the counter</div>
          <p>Show your code to the shopkeeper and pay by cash or UPI. Printing starts right away.</p>
        </div>
      ) : null}
      {unpaid && !counter ? <p className="notice">Payment not completed yet. If money was deducted, it will update in a minute.</p> : null}
      {status?.printingPaused && ['queued', 'printing'].includes(order.stage) ? (
        <p className="notice"><Icon name="pause" size={16} /> Short delay at the shop — your prints are next in line.</p>
      ) : null}


      {step >= 0 ? (
        <ol className="timeline">
          {steps.map(([key, label], i) => (
            <li key={key} className={i < step ? 'done' : i === step ? 'current' : ''}>
              <span className="dot" />
              {label}
              {i === step && order.stage === 'attention' ? <small> — a staff member is checking your prints</small> : null}
            </li>
          ))}
        </ol>
      ) : null}

      <div className="card">
        <h2>Items</h2>
        <ul className="order-items">
          {order.items.map((i) => (
            <li key={i.id}>
              <div>
                <strong className="file-name">{i.fileName}</strong>
                <small className="muted">
                  {plural(i.pageCount, 'page')} · {i.color ? 'Colour' : 'B&W'} · {i.duplex ? 'Both sides' : 'Single side'} · {plural(i.copies, 'copy', 'copies')}
                </small>
              </div>
              <span className={`status status-${i.status}`}>{ITEM_STATUS[i.status] || i.status}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="center"><Link to="/">Print something else</Link></p>
    </section>
  );
}
