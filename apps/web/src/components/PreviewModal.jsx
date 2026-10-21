import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import PageThumb from './PageThumb.jsx';
import { fileUrl } from '../lib/api.js';
import { trySelection } from '../lib/range.js';
import { plural } from '../lib/format.js';
import { useStore } from '../lib/store.jsx';

/** Full-screen preview of how a cart item will come out of the printer, sheet by sheet. */
export default function PreviewModal({ item, onClose }) {
  const { updateItem } = useStore();
  const url = fileUrl(item.fileId, item.version);
  const { pages } = trySelection(item);
  const selected = pages || [];
  const duplex = item.duplex && selected.length > 1;
  const [zoom, setZoom] = useState(null); // position in `selected`

  const sheets = useMemo(() => {
    if (!duplex) return selected.map((p) => [p]);
    const out = [];
    for (let i = 0; i < selected.length; i += 2) out.push([selected[i], selected[i + 1] ?? null]);
    return out;
  }, [selected.join(','), duplex]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') (zoom !== null ? setZoom(null) : onClose());
      if (zoom === null) return;
      if (e.key === 'ArrowRight') setZoom((z) => Math.min(selected.length - 1, z + 1));
      if (e.key === 'ArrowLeft') setZoom((z) => Math.max(0, z - 1));
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [zoom, selected.length, onClose]);

  const thumbW = Math.min(170, Math.floor((window.innerWidth - 72) / 2));
  const bigW = Math.min(620, window.innerWidth - 40);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal preview-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Print preview">
        <header className="modal-head">
          <div className="modal-title">
            <strong>{item.name}</strong>
            <span className="muted">
              {plural(selected.length, 'page')} · {plural(sheets.length * item.copies, 'sheet')} of A4
              {item.copies > 1 ? ` (${item.copies} copies)` : ''}
            </span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={20} /></button>
        </header>

        <div className="modal-toolbar">
          <Segmented value={item.color ? 'color' : 'bw'} onChange={(v) => updateItem(item.key, { color: v === 'color' })}
            options={[['bw', 'Black & white'], ['color', 'Colour']]} />
          <Segmented value={item.duplex ? 'double' : 'single'} onChange={(v) => updateItem(item.key, { duplex: v === 'double' })}
            options={[['single', 'Single side'], ['double', 'Both sides']]} />
        </div>

        {zoom === null ? (
          <div className="sheet-grid">
            {sheets.map((sheet, si) => (
              <div className="sheet" key={si}>
                <div className="sheet-label">Sheet {si + 1}</div>
                <div className="sheet-sides">
                  {sheet.map((p, side) => (
                    <PageThumb key={side} url={url} index={p ?? 0} blank={p === null} width={thumbW} mono={!item.color}
                      label={duplex ? (side ? 'Back' : 'Front') + (p !== null ? ` · p${p + 1}` : '') : `Page ${p + 1}`}
                      onClick={p !== null ? () => setZoom(si * sheet.length + side) : undefined} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="zoom-view">
            <button className="zoom-nav" disabled={zoom === 0} onClick={() => setZoom(zoom - 1)} aria-label="Previous page"><Icon name="chevronLeft" size={22} /></button>
            <PageThumb key={zoom} url={url} index={selected[zoom]} width={bigW} mono={!item.color}
              label={`Page ${selected[zoom] + 1} · ${zoom + 1} of ${selected.length} — tap to go back`} onClick={() => setZoom(null)} />
            <button className="zoom-nav" disabled={zoom === selected.length - 1} onClick={() => setZoom(zoom + 1)} aria-label="Next page"><Icon name="chevronRight" size={22} /></button>
          </div>
        )}

        <footer className="modal-foot muted">
          Printed on A4 paper. Pages are scaled to fit inside the printer's margins (about 3 mm).
          {!item.color ? ' Black & white preview is approximate — colours print as shades of grey.' : ''}
        </footer>
      </div>
    </div>
  );
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map(([v, label]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}
