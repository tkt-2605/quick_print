import { useMemo, useState } from 'react';
import { adminApi, adminLogin } from '../../lib/api.js';
import Queue from './Queue.jsx';
import Printers from './Printers.jsx';
import TrendingAdmin from './TrendingAdmin.jsx';
import Settings from './Settings.jsx';

const TABS = [
  ['queue', 'Print queue', Queue],
  ['printers', 'Printers', Printers],
  ['trending', 'Trending', TrendingAdmin],
  ['settings', 'Pricing & settings', Settings],
];

function readToken() {
  try {
    return sessionStorage.getItem('qp.admin') || '';
  } catch {
    return '';
  }
}

export default function Admin() {
  const [token, setToken] = useState(readToken);
  const [tab, setTab] = useState('queue');
  const client = useMemo(() => {
    const raw = adminApi(token);
    // Any 401 sends us back to the login screen.
    return Object.fromEntries(Object.entries(raw).map(([k, fn]) => [k, async (...a) => {
      try {
        return await fn(...a);
      } catch (e) {
        if (e.status === 401) logout();
        throw e;
      }
    }]));
  }, [token]);

  function logout() {
    sessionStorage.removeItem('qp.admin');
    setToken('');
  }

  if (!token) return <Login onToken={(t) => {
    sessionStorage.setItem('qp.admin', t);
    setToken(t);
  }} />;

  const Current = TABS.find(([k]) => k === tab)[2];
  return (
    <div className="admin">
      <nav className="admin-tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
        <button className="logout" onClick={logout}>Log out</button>
      </nav>
      <Current api={client} />
    </div>
  );
}

function Login({ onToken }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  return (
    <form className="card login" onSubmit={async (e) => {
      e.preventDefault();
      setError('');
      try {
        onToken((await adminLogin(password)).token);
      } catch (err) {
        setError(err.message);
      }
    }}>
      <h1>Shop admin</h1>
      <input className="input" type="password" placeholder="Password" value={password} autoFocus onChange={(e) => setPassword(e.target.value)} />
      {error ? <p className="error-text">{error}</p> : null}
      <button className="btn btn-primary btn-block">Log in</button>
    </form>
  );
}
