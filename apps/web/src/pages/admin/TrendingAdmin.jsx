import { useEffect, useRef, useState } from 'react';
import PageThumb from '../../components/PageThumb.jsx';
import { fileUrl } from '../../lib/api.js';
import { plural } from '../../lib/format.js';

export default function TrendingAdmin({ api }) {
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState('');
  const fileInput = useRef(null);
  const [form, setForm] = useState({ title: '', tag: '', color: true });

  const load = () => api.trending().then(setItems, (e) => alert(e.message));
  useEffect(() => {
    load();
  }, []);

  async function add(e) {
    e.preventDefault();
    const file = fileInput.current.files[0];
    if (!file) return alert('Choose a file');
    const body = new FormData();
    body.append('title', form.title);
    body.append('tag', form.tag);
    body.append('color', form.color ? '1' : '0');
    body.append('file', file);
    setBusy('Uploading…');
    try {
      await api.addTrending(body, (p) => setBusy(`Uploading ${Math.round(p * 100)}%`));
      setForm({ title: '', tag: form.tag, color: form.color });
      fileInput.current.value = '';
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy('');
    }
  }

  const update = async (id, patch) => {
    try {
      await api.updateTrending(id, patch);
    } catch (e) {
      alert(e.message);
    }
    load();
  };

  return (
    <div>
      <form className="card trend-form" onSubmit={add}>
        <h2>Add a trending print</h2>
        <p className="muted small">E.g. when a school asks every student for "10 wild animals" pictures — upload once, customers just tap Add.</p>
        <input ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png" className="input" />
        <input className="input" placeholder="Title, e.g. Wild animals (10 pictures)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <input className="input" placeholder="Tag, e.g. Class 3 project" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} />
        <label className="check"><input type="checkbox" checked={form.color} onChange={(e) => setForm({ ...form, color: e.target.checked })} /> Default to colour</label>
        <button className="btn btn-primary" disabled={!!busy}>{busy || 'Add'}</button>
      </form>

      {!items ? <p className="muted">Loading…</p> : null}
      <div className="trend-admin-list">
        {items?.map((t) => (
          <div key={t.id} className={`card trend-admin${t.active ? '' : ' inactive'}`}>
            <PageThumb url={fileUrl(t.fileId, t.version)} index={0} width={90} />
            <div className="grow">
              <input className="input" defaultValue={t.title} onBlur={(e) => e.target.value !== t.title && update(t.id, { title: e.target.value })} />
              <input className="input" defaultValue={t.tag} placeholder="Tag" onBlur={(e) => e.target.value !== t.tag && update(t.id, { tag: e.target.value })} />
              <div className="row">
                <span className="muted small">{plural(t.pages, 'page')}</span>
                <label className="check"><input type="checkbox" checked={t.color} onChange={(e) => update(t.id, { color: e.target.checked })} /> Colour</label>
                <label className="check"><input type="checkbox" checked={t.active} onChange={(e) => update(t.id, { active: e.target.checked })} /> Visible</label>
                <button className="btn btn-ghost btn-xs danger" onClick={async () => {
                  if (!confirm(`Delete "${t.title}"?`)) return;
                  await api.deleteTrending(t.id).catch((e) => alert(e.message));
                  load();
                }}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
