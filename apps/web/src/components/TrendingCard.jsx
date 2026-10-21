import { useState } from 'react';
import PageThumb from './PageThumb.jsx';
import { fileUrl } from '../lib/api.js';
import { plural, rupees } from '../lib/format.js';
import { useStore } from '../lib/store.jsx';

export default function TrendingCard({ t }) {
  const { config, addToCart } = useStore();
  const [added, setAdded] = useState(false);
  const perPage = config ? (t.color ? config.prices.color : config.prices.bw) : 0;

  return (
    <div className="trend-card card">
      <PageThumb url={fileUrl(t.fileId, t.version)} index={0} width={150} />
      <div className="trend-body">
        {t.tag ? <span className="chip">{t.tag}</span> : null}
        <strong>{t.title}</strong>
        <span className="muted">{plural(t.pages, 'page')} · {rupees(perPage * t.pages)}</span>
        <button className={`btn ${added ? 'btn-ghost' : 'btn-primary'} btn-sm`}
          onClick={() => {
            addToCart({ id: t.fileId, name: t.title, kind: 'pdf', pages: t.pages, version: t.version }, { title: t.title, color: t.color, trending: true });
            setAdded(true);
            setTimeout(() => setAdded(false), 1500);
          }}>
          {added ? '✓ Added' : 'Add'}
        </button>
      </div>
    </div>
  );
}
