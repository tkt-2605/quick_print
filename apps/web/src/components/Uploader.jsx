import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import { api } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';

/** Drop zone + private-mode switch. Uploaded files go straight to the cart. */
export default function Uploader() {
  const { config, addToCart } = useStore();
  const navigate = useNavigate();
  const input = useRef(null);
  const [sensitive, setSensitive] = useState(false);
  const [uploads, setUploads] = useState([]); // {id, name, progress, error}
  const [dragging, setDragging] = useState(false);

  const formats = config?.formats || ['.pdf', '.jpg', '.jpeg', '.png'];
  const busy = uploads.some((u) => !u.error && u.progress < 1);

  async function handleFiles(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    const entries = files.map((f, i) => ({ id: `${Date.now()}-${i}`, name: f.name, progress: 0, error: null }));
    setUploads((u) => [...u.filter((x) => x.error), ...entries]);
    const set = (id, patch) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, ...patch } : x)));

    const results = await Promise.all(
      files.map(async (file, i) => {
        const { id } = entries[i];
        if (config && file.size > config.maxUploadMb * 1024 * 1024) {
          set(id, { error: `Too large (max ${config.maxUploadMb} MB)` });
          return false;
        }
        try {
          const saved = await api.uploadFile(file, { sensitive, fit: 'fit' }, (p) => set(id, { progress: Math.min(p, 0.95) }));
          addToCart(saved);
          set(id, { progress: 1 });
          return true;
        } catch (e) {
          set(id, { error: e.message });
          return false;
        }
      }),
    );
    if (results.every(Boolean)) navigate('/cart');
  }

  return (
    <div className="uploader card">
      <div className="uploader-head">
        <b>Start a print order</b>
        <span>A4 · {formats.map((f) => f.replace('.', '').toUpperCase()).filter((f) => f !== 'JPEG').join(', ')}</span>
      </div>
      <div
        className={`dropzone${dragging ? ' dragging' : ''}`}
        onClick={() => input.current.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current.click()}
      >
        <span className="btn btn-primary btn-lg dropzone-btn"><Icon name="upload" size={18} /> {busy ? 'Uploading…' : 'Choose files'}</span>
        <span className="muted small">or drag &amp; drop them here · up to {config?.maxUploadMb || 50} MB each</span>
        <input ref={input} type="file" multiple hidden accept={formats.join(',')}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }} />
      </div>

      <label className={`private-toggle${sensitive ? ' on' : ''}`}>
        <input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} />
        <span className="switch" aria-hidden />
        <span>
          <b><Icon name="lock" size={15} /> Private documents</b>
          <small>For Aadhaar, PAN, bank statements. Encrypted, hidden from staff, printed only after you give your PIN at the counter, then deleted.</small>
        </span>
      </label>

      {uploads.length ? (
        <ul className="upload-list">
          {uploads.map((u) => (
            <li key={u.id} className={u.error ? 'error' : ''}>
              <span className="upload-name"><Icon name={u.error ? 'alert' : u.progress >= 1 ? 'checkCircle' : 'file'} size={16} /> {u.name}</span>
              {u.error ? <span className="upload-error">{u.error}</span> : (
                <span className="progress"><span style={{ width: `${Math.round(u.progress * 100)}%` }} /></span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
