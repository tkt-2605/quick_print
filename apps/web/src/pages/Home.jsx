import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ActiveOrders from '../components/ActiveOrders.jsx';
import Uploader from '../components/Uploader.jsx';
import { ShopClosed } from '../components/ShopStatus.jsx';
import TrendingCard from '../components/TrendingCard.jsx';
import { api } from '../lib/api.js';
import { rupees } from '../lib/format.js';
import { useStore } from '../lib/store.jsx';

export default function Home() {
  const { config, online, canOrder } = useStore();
  const [trending, setTrending] = useState([]);
  // Until the shop has been reached once, assume pay at counter (no gateway yet).
  const counter = (config?.paymentMode || 'counter') === 'counter';

  useEffect(() => {
    api.trending().then(setTrending, () => {});
  }, []);

  return (
    <>
      <ActiveOrders />
      {online !== null && !canOrder ? <ShopClosed /> : (
      <section className="hero">
        <div className="hero-text">
          <h1>Print in minutes.</h1>
          <p>{counter
            ? 'Upload and preview on your phone, pay at the counter — we print it right away.'
            : 'Upload, preview, pay — your prints start the moment you pay. Collect at the counter.'}</p>
          {config ? (
            <div className="price-pills">
              <span>B&W <b>{rupees(config.prices.bw)}</b>/side</span>
              <span>Colour <b>{rupees(config.prices.color)}</b>/side</span>
            </div>
          ) : null}
        </div>
        <Uploader />
      </section>
      )}

      <section className="steps">
        {[
          ['1', 'Upload', 'PDF or photos from your phone'],
          ['2', 'Preview', 'Exactly how each A4 sheet will look'],
          counter ? ['3', 'Pay at counter', 'Cash or UPI — printing starts instantly'] : ['3', 'Pay', 'UPI, cards, wallets'],
          ['4', 'Collect', 'Show your order code at the counter'],
        ].map(([n, t, d]) => (
          <div className="step" key={n}>
            <span className="step-n">{n}</span>
            <div>
              <b>{t}</b>
              <small>{d}</small>
            </div>
          </div>
        ))}
      </section>

      {trending.length ? (
        <section>
          <div className="section-head">
            <h2>🔥 Trending prints</h2>
            <Link to="/trending">See all</Link>
          </div>
          <div className="trend-row">
            {trending.slice(0, 8).map((t) => <TrendingCard key={t.id} t={t} />)}
          </div>
        </section>
      ) : null}
    </>
  );
}
