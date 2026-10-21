import { useEffect } from 'react';
import { api } from './api.js';
import { useStore } from './store.jsx';

const FINAL = ['collected', 'cancelled', 'expired'];

/** Refresh the live status of this device's unfinished orders (every 15 s while mounted). */
export function useOrderRefresh() {
  const { orders, updateOrder } = useStore();
  const pending = orders.filter((o) => !FINAL.includes(o.stage)).map((o) => `${o.id}:${o.token}`).join(',');

  useEffect(() => {
    if (!pending) return undefined;
    let stopped = false;
    const refresh = () => Promise.all(pending.split(',').map(async (pair) => {
      const [id, token] = pair.split(':');
      try {
        const o = await api.getOrder(id, token);
        if (!stopped) updateOrder(id, { stage: o.stage, amount: o.amount, files: o.items.map((i) => i.fileName) });
      } catch (e) {
        if (!stopped && e.status === 404) updateOrder(id, { stage: 'expired' });
      }
    }));
    refresh();
    const t = setInterval(refresh, 15000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [pending, updateOrder]);
}
