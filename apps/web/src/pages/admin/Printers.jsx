import { useEffect, useState } from 'react';
import { timeAgo } from '../../lib/format.js';

export default function Printers({ api }) {
  const [printers, setPrinters] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = () => api.printers().then(setPrinters, (e) => alert(e.message));
  useEffect(() => {
    load();
  }, []);

  if (!printers) return <p className="muted">Loading…</p>;
  return (
    <div>
      <p className="muted">
        The <b>Windows name</b> must match exactly what Windows calls the printer. Run <code>npm run printers -w @quickprint/agent</code> on
        the shop PC to list them. B&W jobs go to a B&W-only printer when one is online (see Pricing & settings), and to the colour printer otherwise.
      </p>
      <div className="printer-list">
        {printers.map((p) => <PrinterCard key={p.id} printer={p} api={api} onSaved={load} />)}
      </div>
      {adding ? (
        <PrinterCard printer={{ label: '', windowsName: '', color: false, duplex: 'manual', enabled: true }} api={api} isNew
          onSaved={() => {
            setAdding(false);
            load();
          }} />
      ) : (
        <button className="btn btn-ghost" onClick={() => setAdding(true)}>+ Add printer</button>
      )}
    </div>
  );
}

function PrinterCard({ printer, api, onSaved, isNew }) {
  const [p, setP] = useState(printer);
  const [msg, setMsg] = useState('');
  const set = (patch) => setP({ ...p, ...patch });

  async function save() {
    try {
      await (isNew ? api.addPrinter(p) : api.savePrinter(p));
      setMsg('Saved');
      onSaved();
    } catch (e) {
      setMsg(e.message);
    }
  }

  return (
    <div className="card printer-card">
      {!isNew ? (
        <div className={`printer-pill ${p.online ? 'ok' : 'bad'}`}>
          {p.online ? '● online' : `○ ${p.status}`}{p.lastSeen ? ` · seen ${timeAgo(p.lastSeen)}` : ''}
        </div>
      ) : null}
      <label className="field"><span>Name shown in dashboard</span>
        <input className="input" value={p.label} onChange={(e) => set({ label: e.target.value })} />
      </label>
      <label className="field"><span>Windows printer name</span>
        <input className="input" value={p.windowsName} onChange={(e) => set({ windowsName: e.target.value })} />
      </label>
      <label className="check"><input type="checkbox" checked={p.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Use this printer</label>
      <label className="check"><input type="checkbox" checked={p.color} onChange={(e) => set({ color: e.target.checked })} /> Can print colour</label>
      <label className="field"><span>Double-sided printing</span>
        <select className="input" value={p.duplex} onChange={(e) => set({ duplex: e.target.value })}>
          <option value="manual">Manual — print fronts, I flip the stack, print backs</option>
          <option value="auto">Automatic — printer has a duplex unit</option>
          <option value="none">Not allowed on this printer</option>
        </select>
      </label>
      {p.duplex === 'manual' && !isNew ? (
        <fieldset className="flip-settings">
          <legend>Flip calibration</legend>
          <label className="check"><input type="checkbox" checked={p.reverseBack} onChange={(e) => set({ reverseBack: e.target.checked })} /> Print back sides in reverse order</label>
          <label className="check"><input type="checkbox" checked={p.rotateBack} onChange={(e) => set({ rotateBack: e.target.checked })} /> Rotate back sides 180°</label>
          <small className="muted">
            Print the test, flip the stack the way you normally would, and check that each BACK is behind its FRONT and upright.
            If the order is wrong, toggle "reverse"; if backs are upside-down, toggle "rotate". Repeat until correct.
          </small>
          <button className="btn btn-ghost btn-sm" onClick={async () => {
            try {
              await api.testDuplex(p.id);
              setMsg('Test queued — see the Print queue tab');
            } catch (e) {
              setMsg(e.message);
            }
          }}>Print 3-sheet duplex test</button>
        </fieldset>
      ) : null}
      <div className="row">
        <button className="btn btn-primary btn-sm" onClick={save}>{isNew ? 'Add printer' : 'Save'}</button>
        {msg ? <small className="muted">{msg}</small> : null}
      </div>
    </div>
  );
}
