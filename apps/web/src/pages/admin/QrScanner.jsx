import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import Icon from '../../components/Icon.jsx';

const CODE_RE = /[A-HJ-NP-Z2-9]{5}/;

/** Camera view that reads a pickup QR and returns the order code. */
export default function QrScanner({ onCode, onClose }) {
  const video = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stream;
    let timer;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const tick = () => {
      const v = video.current;
      if (stopped || !v) return;
      if (v.readyState >= 2 && v.videoWidth) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0);
        const hit = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        const code = hit?.data.toUpperCase().match(CODE_RE)?.[0];
        if (code) return onCode(code);
      }
      timer = setTimeout(tick, 200);
    };

    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s;
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        video.current.srcObject = s;
        video.current.play();
        tick();
      })
      .catch(() => setError('Camera not available. Allow camera access (needs https or localhost), or type the code instead.'));
    if (!navigator.mediaDevices) setError('This browser cannot use the camera here. Type the code instead.');

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal scanner" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <strong>Scan pickup QR</strong>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={20} /></button>
        </header>
        {error ? <p className="notice error">{error}</p> : <video ref={video} playsInline muted />}
      </div>
    </div>
  );
}
