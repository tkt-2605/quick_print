import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import TrendingCard from '../components/TrendingCard.jsx';
import { api } from '../lib/api.js';

export default function Trending() {
  const [items, setItems] = useState(null);
  const [tag, setTag] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    api.trending().then(setItems, () => setItems([]));
  }, []);

  const tags = useMemo(() => [...new Set((items || []).map((t) => t.tag).filter(Boolean))], [items]);
  const shown = (items || []).filter(
    (t) => (!tag || t.tag === tag) && (!query || t.title.toLowerCase().includes(query.toLowerCase())),
  );

  return (
    <section>
      <div className="page-head">
        <h1 className="page-title">Trending prints</h1>
        <p className="muted">Popular school projects and printables, ready to print — no upload needed.</p>
      </div>

      <div className="search">
        <Icon name="search" size={18} />
        <input className="input" placeholder="Search animals, maps, charts…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {tags.length ? (
        <div className="chips">
          <button className={`chip${!tag ? ' on' : ''}`} onClick={() => setTag('')}>All</button>
          {tags.map((t) => (
            <button key={t} className={`chip${tag === t ? ' on' : ''}`} onClick={() => setTag(t)}>{t}</button>
          ))}
        </div>
      ) : null}

      {items === null ? <p className="muted">Loading…</p> : null}
      {items && !shown.length ? <p className="empty">Nothing here yet. Check back soon!</p> : null}
      <div className="trend-grid">
        {shown.map((t) => <TrendingCard key={t.id} t={t} />)}
      </div>
    </section>
  );
}
