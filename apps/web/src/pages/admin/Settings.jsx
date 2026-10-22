import { useEffect, useState } from 'react';
import { DAY_NAMES, DAY_ORDER } from '../../lib/hours.js';

export default function Settings({ api }) {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.settings().then(setS, (e) => setMsg(e.message));
  }, []);
  if (!s) return <p className="muted">{msg || 'Loading…'}</p>;

  const rupeeField = (key, label) => (
    <label className="field"><span>{label}</span>
      <div className="input-prefix">
        <span>₹</span>
        <input className="input" type="number" min="0" step="0.5" value={s[key] / 100} onChange={(e) => setS({ ...s, [key]: Math.round(Number(e.target.value) * 100) })} />
      </div>
    </label>
  );

  return (
    <form className="card settings" onSubmit={async (e) => {
      e.preventDefault();
      try {
        // Only the fields edited here — open/closed and pause are controlled from the queue.
        const { price_bw, price_color, counter_payment, route_bw_to_mono, retention_hours, hours, order_cutoff_minutes } = s;
        setS(await api.saveSettings({ price_bw, price_color, counter_payment, route_bw_to_mono, retention_hours, hours, order_cutoff_minutes }));
        setMsg('Saved');
      } catch (err) {
        setMsg(err.message);
      }
    }}>
      <h2>Pricing (per printed side)</h2>
      {rupeeField('price_bw', 'Black & white')}
      {rupeeField('price_color', 'Colour')}

      <h2>Payment</h2>
      <label className="check">
        <input type="checkbox" checked={s.counter_payment} onChange={(e) => setS({ ...s, counter_payment: e.target.checked })} />
        Let customers choose "Pay at the counter" — their order prints only after you press Paid on the Print queue
      </label>

      <h2>Routing</h2>
      <label className="check">
        <input type="checkbox" checked={s.route_bw_to_mono} onChange={(e) => setS({ ...s, route_bw_to_mono: e.target.checked })} />
        Send B&W jobs to the B&W laser printer when it's online (saves Epson ink)
      </label>

      <h2>Shop hours</h2>
      <small className="muted">Customers can only upload and order inside these hours. Use "Close shop now" on the Print queue tab for emergencies.</small>
      <table className="hours-edit">
        <tbody>
          {DAY_ORDER.map((day) => {
            const h = s.hours?.[day];
            const setDay = (v) => setS({ ...s, hours: { ...s.hours, [day]: v } });
            return (
              <tr key={day}>
                <th>{DAY_NAMES[day]}</th>
                <td>
                  <label className="check">
                    <input type="checkbox" checked={!!h} onChange={(e) => setDay(e.target.checked ? { open: '09:00', close: '20:30' } : null)} /> Open
                  </label>
                </td>
                <td>{h ? <input className="input" type="time" value={h.open} onChange={(e) => setDay({ ...h, open: e.target.value })} /> : null}</td>
                <td>{h ? <input className="input" type="time" value={h.close} onChange={(e) => setDay({ ...h, close: e.target.value })} /> : <span className="muted">Closed</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <label className="field"><span>Stop taking orders this many minutes before closing</span>
        <input className="input" type="number" min="0" max="120" value={s.order_cutoff_minutes} onChange={(e) => setS({ ...s, order_cutoff_minutes: Number(e.target.value) })} />
      </label>

      <h2>Privacy</h2>
      <label className="field"><span>Delete customer files this many hours after the order closes</span>
        <input className="input" type="number" min="1" value={s.retention_hours} onChange={(e) => setS({ ...s, retention_hours: Number(e.target.value) })} />
      </label>

      <div className="row">
        <button className="btn btn-primary">Save</button>
        {msg ? <small className="muted">{msg}</small> : null}
      </div>
    </form>
  );
}
