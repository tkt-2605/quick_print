import { Link } from 'react-router-dom';
import { rupees } from '../lib/format.js';
import { OPEN_STAGES, stageLabel, stageTone } from '../lib/stages.js';
import { useOrderRefresh } from '../lib/useOrderRefresh.js';
import { useStore } from '../lib/store.jsx';

const dateTime = (ts) => new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function MyOrders() {
  const { orders, forgetOrder } = useStore();
  useOrderRefresh();

  const open = orders.filter((o) => OPEN_STAGES.includes(o.stage));
  const past = orders.filter((o) => !OPEN_STAGES.includes(o.stage));

  return (
    <section className="history">
      <h1 className="page-title">My orders</h1>
      <p className="muted small">Saved on this device only. Clearing your browser data removes this list.</p>

      {!orders.length ? (
        <div className="empty-state">
          <p className="muted">No orders yet.</p>
          <Link to="/" className="btn btn-primary">Print something</Link>
        </div>
      ) : null}

      {open.length ? <h2>In progress</h2> : null}
      {open.map((o) => <OrderRow key={o.id} o={o} />)}

      {past.length ? <h2>Past orders</h2> : null}
      {past.map((o) => <OrderRow key={o.id} o={o} onRemove={() => forgetOrder(o.id)} />)}
    </section>
  );
}

function OrderRow({ o, onRemove }) {
  const { config } = useStore();
  const files = o.files || [];
  const body = (
    <>
      <div className="history-top">
        <b className="history-code">{o.code}</b>
        <span className={`badge badge-${stageTone(o.stage)}`}>{stageLabel(o.stage || 'queued', o.payAtCounter ?? config?.paymentMode === 'counter')}</span>
      </div>
      {files.length ? (
        <div className="history-files">
          {files.slice(0, 3).join(', ')}{files.length > 3 ? ` +${files.length - 3} more` : ''}
        </div>
      ) : null}
      <div className="history-meta muted">
        <span>{dateTime(o.createdAt)}</span>
        {o.amount != null ? <b>{rupees(o.amount)}</b> : null}
      </div>
    </>
  );

  if (o.stage === 'expired') {
    return (
      <div className="card history-row">
        {body}
        <button className="btn btn-ghost btn-xs" onClick={onRemove}>Remove from list</button>
      </div>
    );
  }
  return <Link to={`/order/${o.id}?t=${o.token}`} className="card history-row">{body}</Link>;
}
