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
  const either = !counter && config?.payAtCounter;

  useEffect(() => {
    api.trending().then(setTrending, () => {});
  }, []);

  const steps = [
    ['Upload', 'PDF or photos from your phone'],
    ['Check the preview', 'Every A4 sheet, exactly as it will print'],
    counter ? ['Pay at the counter', 'Cash or UPI — then we print']
      : either ? ['Pay online or at the counter', 'UPI and cards online, or cash at the shop']
      : ['Pay online', 'UPI, cards or wallets'],
    ['Collect', 'Show your order code'],
  ];

  return (
    <>
      <ActiveOrders />

      {online !== null && !canOrder ? <ShopClosed /> : (
        <section className="intro">
          <div className="intro-text">
            <p className="kicker">Printing · Photocopy · A4</p>
            <h1>Print from your phone. Collect at the counter.</h1>
            <p className="lead">Upload, check the preview, and your prints are ready when you arrive.</p>
          </div>
          <Uploader />
          <div className="intro-prices">
            {config ? (
              <table className="price-list">
                <caption>Price list</caption>
                <tbody>
                  <tr><th>Black &amp; white</th><td><b>{rupees(config.prices.bw)}</b> per side</td></tr>
                  <tr><th>Colour</th><td><b>{rupees(config.prices.color)}</b> per side</td></tr>
                  <tr><th>Both sides</th><td>same price per side</td></tr>
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
