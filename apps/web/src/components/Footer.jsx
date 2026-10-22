import { Link } from 'react-router-dom';
import { POLICY_LINKS } from '../pages/Policies.jsx';
import { hoursTable } from '../lib/hours.js';
import { useStore } from '../lib/store.jsx';

export default function Footer() {
  const { shop } = useStore();
  const hours = hoursTable(shop.hours);
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div>
          <b>{shop.name}</b>
          {shop.address ? <div>{shop.address}</div> : null}
          {hours.length ? <div>{hours.map(([d, t]) => `${d}: ${t}`).join(' · ')}</div> : null}
          {shop.phone || shop.email ? <div>{[shop.phone, shop.email].filter(Boolean).join(' · ')}</div> : null}
        </div>
        <nav>
          {POLICY_LINKS.map(([path, label]) => <Link key={path} to={`/${path}`}>{label}</Link>)}
        </nav>
      </div>
    </footer>
  );
}
