import { Link, NavLink } from 'react-router-dom';
import Icon from './Icon.jsx';
import { formatTime, todayHours } from '../lib/hours.js';
import { useStore } from '../lib/store.jsx';
import { rupees } from '../lib/format.js';

export default function Header() {
  const { config, status, cart, total } = useStore();
  const shop = config?.shop || {};
  const today = todayHours(status?.hours || config?.status?.hours);

  return (
    <header className="site-header">
      <div className="infobar">
        <div className="wrap">
          {shop.address ? <span className="info-address"><Icon name="pin" size={14} /> {shop.address}</span> : null}
          {today !== undefined ? (
            <span><Icon name="clock" size={14} /> Today: {today ? `${formatTime(today.open)} – ${formatTime(today.close)}` : 'Closed'}</span>
          ) : null}
          {shop.phone ? <a href={`tel:${shop.phone}`}><Icon name="phone" size={14} /> {shop.phone}</a> : null}
        </div>
      </div>
      <div className="topbar">
        <div className="wrap topbar-inner">
          <Link to="/" className="brand" aria-label="Home">
            <span className="brand-name">{config?.shopName || 'QuickPrint'}</span>
            <span className="brand-sub">Print &amp; Stationery</span>
          </Link>
          <nav className="topnav">
            <NavLink to="/" end>Print</NavLink>
            <NavLink to="/trending">Trending</NavLink>
            <NavLink to="/orders">My orders</NavLink>
          </nav>
          <Link to="/cart" className="cart-btn">
            <Icon name="cart" size={18} />
            <span>Cart{cart.length ? ` (${cart.length})` : ''}</span>
            {cart.length ? <b>{rupees(total)}</b> : null}
          </Link>
        </div>
      </div>
    </header>
  );
}
