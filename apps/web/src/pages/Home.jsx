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

  const steps = [
    ['Upload', 'PDF or photos from your phone'],
    ['Check the preview', 'Every A4 sheet, exactly as it will print'],
    counter ? ['Pay at the counter', 'Cash or UPI — we print right away'] : ['Pay online', 'UPI, cards or wallets'],
    ['Collect', 'Show your order code'],
  ];

  return (
    <>
      <ActiveOrders />

      {online !== null && !canOrder ? <ShopClosed /> : (
        <section className="intro">
          <div className="intro-text">
            <p className="kicker">Printing · Photocopy · A4</p>
            <h1>Send your prints from your phone. Pick them up at the counter.</h1>
            <p className="lead">
              No pen drives, no WhatsApp forwarding, no waiting while we find your file.
              Upload here, check how it will look, and your prints are ready when you reach the counter.
            </p>
          </div>
          <Uploader />
          <div className="intro-prices">
            {config ? (
              <table className="price-list">
                <caption>Price list</caption>
                <tbody>
                  <tr><th>Black &amp; white</th><td><b>{rupees(config.prices.bw)}</b> per side</td></tr>
                  <tr><th>Colour</th><td><b>{rupees(config.prices.color)}</b> per side</td></tr>
                  <tr><th>Both sides</th><td>charged per printed side</td></tr>
                  <tr><th>Private documents</th><td>no extra charge</td></tr>
                </tbody>
              </table>
            ) : null}
          </div>
        </section>
      )}

      <section className="how">
        <h2 className="rule-title">How it works</h2>
        <ol className="steps-strip">
          {steps.map(([title, text], i) => (
            <li key={title}>
              <span className="num">{i + 1}</span>
              <div><b>{title}</b><span>{text}</span></div>
            </li>
          ))}
        </ol>
      </section>

      {trending.length ? (
        <section>
          <div className="rule-head">
            <h2 className="rule-title">Trending prints</h2>
            <Link to="/trending">See all →</Link>
          </div>
          <p className="muted section-note">School projects and printables we print often — no upload needed.</p>
          <div className="trend-row">
            {trending.slice(0, 8).map((t) => <TrendingCard key={t.id} t={t} />)}
          </div>
        </section>
      ) : null}
    </>
  );
}
