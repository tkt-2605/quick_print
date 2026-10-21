import { Link, NavLink } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { rupees } from '../lib/format.js';

export default function Header() {
  const { config, cart, total } = useStore();
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className="brand">
          <img src="/favicon.svg" alt="" width="32" height="32" />
          <span>{config?.shopName || 'QuickPrint'}</span>
        </Link>
        <nav className="topnav">
          <NavLink to="/trending">Trending</NavLink>
          <NavLink to="/orders">My orders</NavLink>
        </nav>
        <Link to="/cart" className="cart-btn">
          <span className="cart-icon" aria-hidden>🛒</span>
          {cart.length ? (
            <span>
              <b>{cart.length} {cart.length === 1 ? 'file' : 'files'}</b>
              <small>{rupees(total)}</small>
            </span>
          ) : (
            <span>Cart</span>
          )}
        </Link>
      </div>
    </header>
  );
}
