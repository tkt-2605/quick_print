import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Icon from './Icon.jsx';
import { useStore } from '../lib/store.jsx';

/**
 * The order code as a QR "pickup pass". Whoever shows it at the counter can
 * collect, so the customer can forward it to someone collecting for them.
 * We share only the code, never the order link (which would reveal the private-print PIN).
 */
export default function PickupPass({ code, sensitive }) {
  const { config } = useStore();
  const [qr, setQr] = useState('');

  useEffect(() => {
    QRCode.toDataURL(code, { width: 220, margin: 1, color: { dark: '#0f1b3d', light: '#ffffff' } }).then(setQr, () => setQr(''));
  }, [code]);

  const shopName = config?.shopName || 'QuickPrint';
  const text = `Please collect my prints from ${shopName}. Pickup code: ${code}`
    + (sensitive ? ' (you will also need the 4-digit PIN — ask me for it)' : '');

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `${shopName} pickup code`, text });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }

  return (
    <div className="pickup-pass">
      {qr ? <img src={qr} width="180" height="180" alt={`QR code for order ${code}`} /> : null}
      <button className="btn btn-light btn-sm" onClick={share}><Icon name="share" size={16} /> Send pickup pass to someone else</button>
      <small className="muted">Anyone with this code can collect your prints — only share it with someone you trust.</small>
    </div>
  );
}
