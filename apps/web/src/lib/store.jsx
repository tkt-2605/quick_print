import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { trySelection } from './range.js';
import shopInfo from '../shop-info.json';

const StoreContext = createContext(null);

const filled = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v !== '' && v != null));

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked: cart just won't survive a reload
  }
}

let keySeq = 0;
const newKey = () => `${Date.now().toString(36)}-${keySeq++}`;

export function StoreProvider({ children }) {
  // Last config seen, kept so the "closed" page can show hours and contact even when the shop PC is off.
  const [config, setConfig] = useState(() => readJson('qp.config', null));
  const [status, setStatus] = useState(null);
  const [online, setOnline] = useState(null); // null = still checking
  const [cart, setCart] = useState(() => readJson('qp.cart', []));
  const [orders, setOrders] = useState(() => readJson('qp.orders', []));

  // Load config, then keep polling shop status. If the shop PC is unreachable, keep retrying.
  useEffect(() => {
    let timer;
    let stopped = false;
    let loaded = false;
    const tick = async () => {
      try {
        if (!loaded) {
          const c = await api.config();
          loaded = true;
          setConfig(c);
          setStatus(c.status);
          writeJson('qp.config', c);
        } else {
          setStatus(await api.status());
        }
        if (!stopped) setOnline(true);
      } catch {
        if (!stopped) setOnline(false);
      }
      if (!stopped) timer = setTimeout(tick, loaded ? 30_000 : 10_000);
    };
    tick();
    const onFocus = () => {
      clearTimeout(timer);
      tick();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, []);
  useEffect(() => writeJson('qp.cart', cart), [cart]);
  useEffect(() => writeJson('qp.orders', orders), [orders]);

  const addToCart = useCallback((file, defaults = {}) => {
    setCart((c) => [
      ...c,
      {
        key: newKey(),
        fileId: file.id,
        name: defaults.title || file.name,
        kind: file.kind,
        pages: file.pages,
        version: file.version ?? 1,
        fit: file.fit || 'fit',
        trending: !!defaults.trending,
        color: defaults.color ?? false,
        duplex: false,
        copies: 1,
        range: '',
      },
    ]);
  }, []);

  const updateItem = useCallback((key, patch) => setCart((c) => c.map((i) => (i.key === key ? { ...i, ...patch } : i))), []);
  const removeItem = useCallback((key) => setCart((c) => c.filter((i) => i.key !== key)), []);
  const clearCart = useCallback(() => setCart([]), []);
  // Order history lives on this device only (no accounts). Newest first, last 50.
  const rememberOrder = useCallback((o) => setOrders((list) => [o, ...list.filter((x) => x.id !== o.id)].slice(0, 50)), []);
  const updateOrder = useCallback((id, patch) => setOrders((list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o))), []);
  const forgetOrder = useCallback((id) => setOrders((list) => list.filter((o) => o.id !== id)), []);

  const priceOf = useCallback(
    (item) => {
      if (!config) return 0;
      const { pages } = trySelection(item);
      return pages ? pages.length * item.copies * (item.color ? config.prices.color : config.prices.bw) : 0;
    },
    [config],
  );
  const total = useMemo(() => cart.reduce((a, i) => a + priceOf(i), 0), [cart, priceOf]);

  // "Both sides" is only offered when a printer allows it (colour needs a colour printer that does).
  const canDuplex = useCallback((color) => !!config?.duplex?.[color ? 'color' : 'bw'], [config]);
  useEffect(() => {
    if (cart.some((i) => i.duplex && !canDuplex(i.color))) {
      setCart((c) => c.map((i) => (i.duplex && !canDuplex(i.color) ? { ...i, duplex: false } : i)));
    }
  }, [cart, canDuplex]);

  const canOrder = online === true && !!status?.open;
  // Shop details are built into the site (shop-info.json) so contact/policy pages work even
  // when the shop PC is off; live values from the server win when available.
  const shop = useMemo(() => ({
    ...shopInfo,
    ...filled(config?.shop),
    name: config?.shopName || shopInfo.name,
    hours: status?.hours || config?.status?.hours || shopInfo.hours,
  }), [config, status]);
  const value = {
    config, status, online, canOrder, shop, cart, addToCart, updateItem, removeItem, clearCart, priceOf, total, canDuplex,
    orders, rememberOrder, updateOrder, forgetOrder,
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => useContext(StoreContext);
