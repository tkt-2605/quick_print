import { Link } from 'react-router-dom';
import { POLICY_LINKS } from '../pages/Policies.jsx';
import { hoursTable } from '../lib/hours.js';
import { useStore } from '../lib/store.jsx';

export default function Footer() {
  const { config, status } = useStore();
  const shop = config?.shop || {};
  const hours = hoursTable(status?.hours || config?.status?.hours);
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div>
          <b>{config?.shopName || 'QuickPrint'}</b>
          {shop.address ? <div>{shop.address}</div> : null}
          {hours.length ? <div>{hours.map(([d, t]) => `${d}: ${t}`).join(' · ')}</div> : shop.hours ? <div>{shop.hours}</div> : null}
          {shop.phone || shop.email ? <div>{[shop.phone, shop.email].filter(Boolean).join(' · ')}</div> : null}
        </div>
        <nav>
          {POLICY_LINKS.map(([path, label]) => <Link key={path} to={`/${path}`}>{label}</Link>)}
        </nav>
      </div>
    </footer>
  );
}
