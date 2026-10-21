import { useEffect, useRef, useState } from 'react';
import { renderPage } from '../lib/pdf.js';

/**
 * One PDF page drawn on an A4-shaped "paper" card. Renders lazily when it
 * scrolls into view. `mono` previews it as black & white.
 */
export default function PageThumb({ url, index, width = 160, mono = false, blank = false, label, onClick }) {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const [state, setState] = useState(blank ? 'blank' : 'idle');
  const [landscape, setLandscape] = useState(false);

  useEffect(() => {
    if (blank) return undefined;
    let cancelled = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        setState('loading');
        renderPage(url, index, canvas.current, width * 1.5)
          .then((r) => {
            if (cancelled) return;
            setLandscape(r.landscape);
            setState('ready');
          })
          .catch(() => !cancelled && setState('error'));
      },
      { rootMargin: '300px' },
    );
    io.observe(wrap.current);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [url, index, width, blank]);

  return (
    <figure className={`page-thumb${onClick ? ' clickable' : ''}`} style={{ width }} onClick={onClick}>
      <div ref={wrap} className={`paper${mono ? ' mono' : ''}`} style={{ aspectRatio: landscape ? '297 / 210' : '210 / 297' }}>
        <canvas ref={canvas} style={{ display: state === 'ready' ? 'block' : 'none' }} />
        {state === 'loading' || state === 'idle' ? <div className="paper-skeleton" /> : null}
        {state === 'error' ? <div className="paper-note">Preview unavailable</div> : null}
        {state === 'blank' ? <div className="paper-note">Blank</div> : null}
      </div>
      {label ? <figcaption>{label}</figcaption> : null}
    </figure>
  );
}
