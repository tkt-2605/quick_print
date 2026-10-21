import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { describeOpening, formatTime, hoursTable, nextOpeningFromHours, shouldBeOpen } from '../lib/hours.js';
import { useStore } from '../lib/store.jsx';

/** Shown instead of upload/checkout when the shop is closed or the shop PC can't be reached. */
export function ShopClosed() {
  const { config, status, online } = useStore();
  const hours = status?.hours || config?.status?.hours;
  const shop = config?.shop || {};

  let icon = 'moon';
  let title = "We're closed now";
  let detail = null;

  if (online === false) {
    const next = nextOpeningFromHours(hours);
    if (shouldBeOpen(hours)) {
      icon = 'alert';
      title = "We can't reach the shop right now";
      detail = 'Possibly a power cut or internet problem. Please try again in a few minutes.';
    } else if (next) {
      detail = `We open ${describeOpening(next)}.`;
    } else {
      detail = 'Please check back during shop hours.';
    }
  } else if (status && !status.open) {
    const when = describeOpening(status.nextOpen);
    if (status.reason === 'manual') {
      title = 'The shop is closed for now';
      detail = status.message || null;
    }
    const opens = when ? `We open ${when}.` : status.reason === 'manual' ? 'We will reopen soon.' : null;
    detail = [detail, opens].filter(Boolean).join(' ');
  }

  const phone = shop.phone?.replace(/[^\d+]/g, '');
  const wa = phone ? phone.replace(/^\+/, '').replace(/^(\d{10})$/, '91$1') : null;
  const rows = hoursTable(hours);

  return (
    <section className="card shop-closed">
      <div className={`closed-icon${icon === 'alert' ? ' warn' : ''}`}><Icon name={icon} size={28} /></div>
      <h1>{title}</h1>
      {detail ? <p className="closed-detail">{detail}</p> : null}

      {rows.length ? (
        <table className="hours-table">
          <tbody>
            {rows.map(([days, text]) => <tr key={days}><th>{days}</th><td>{text}</td></tr>)}
          </tbody>
        </table>
      ) : null}

      {shop.address ? <p className="closed-address"><Icon name="pin" size={16} /> {shop.address}</p> : null}
      {phone ? (
        <div className="row center">
          <a className="btn btn-ghost btn-sm" href={`tel:${phone}`}><Icon name="phone" size={16} /> Call</a>
          <a className="btn btn-ghost btn-sm" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer"><Icon name="message" size={16} /> WhatsApp</a>
        </div>
      ) : null}
      <p className="muted small">Already ordered? Your order code is in <Link to="/orders">My orders</Link> — show it at the counter.</p>
    </section>
  );
}

/** Small notices while open: last orders soon, or printing paused. */
export function StatusBanner() {
  const { status, canOrder } = useStore();
  if (!canOrder) return null;
  const notes = [];
  if (status.minutesLeft != null && status.minutesLeft <= 30) {
    notes.push(['clock', `Last orders at ${formatTime(status.lastOrderAt)} — we close at ${formatTime(status.closesAt)}.`]);
  }
  if (status.printingPaused) notes.push(['pause', 'Short delay at the shop — orders are accepted and will print shortly.']);
  if (!notes.length) return null;
  return <div className="notice status-banner">{notes.map(([icon, text]) => <div key={text}><Icon name={icon} size={16} /> {text}</div>)}</div>;
}
