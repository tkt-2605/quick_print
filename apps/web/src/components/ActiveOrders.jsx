import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { OPEN_STAGES, stageLabel, stageTone } from '../lib/stages.js';
import { useOrderRefresh } from '../lib/useOrderRefresh.js';
import { useStore } from '../lib/store.jsx';

/** Home-page banner for this device's unfinished orders, so customers can always find their code. */
export default function ActiveOrders() {
  const { orders, config } = useStore();
  const counter = config?.paymentMode === 'counter';
  useOrderRefresh();
  const open = orders.filter((o) => OPEN_STAGES.includes(o.stage));
  if (!open.length) return null;

  return (
    <div className="active-orders">
      {open.slice(0, 3).map((o) => (
        <Link key={o.id} to={`/order/${o.id}?t=${o.token}`} className={`active-order tone-${stageTone(o.stage)}`}>
          <span className="active-left"><Icon name="file" size={18} /> Your order <b>{o.code}</b></span>
          <span className="active-stage">{stageLabel(o.stage, counter)} <Icon name="chevronRight" size={16} /></span>
        </Link>
      ))}
    </div>
  );
}
