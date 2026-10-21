import { useState } from 'react';
import Icon from './Icon.jsx';
import PageThumb from './PageThumb.jsx';
import { fileUrl } from '../lib/api.js';
import { plural, rupees } from '../lib/format.js';
import { useStore } from '../lib/store.jsx';

export default function TrendingCard({ t }) {
  const { config, addToCart } = useStore();
  const [added, setAdded] = useState(false);
  const perPage = config ? (t.color ? config.prices.color : config.prices.bw) : 0;

  return (
    <article className="trend-card card">
      <div className="trend-thumb">
        <PageThumb url={fileUrl(t.fileId, t.version)} index={0} width={128} />
        {t.tag ? <span className="trend-tag">{t.tag}</span> : null}
      </div>
      <div className="trend-body">
        <strong className="trend-title">{t.title}</strong>
        <span className="muted small">{plural(t.pages, 'page')} · {t.color ? 'Colour' : 'B&W'}</span>
        <div className="trend-foot">
          <b>{rupees(perPage * t.pages)}</b>
          <button className={`btn btn-sm ${added ? 'btn-success' : 'btn-primary'}`}
            onClick={() => {
              addToCart({ id: t.fileId, name: t.title, kind: 'pdf', pages: t.pages, version: t.version }, { title: t.title, color: t.color, trending: true });
              setAdded(true);
              setTimeout(() => setAdded(false), 1500);
            }}>
            {added ? <><Icon name="check" size={16} /> Added</> : <><Icon name="plus" size={16} /> Add</>}
          </button>
        </div>
      </div>
    </article>
  );
}
