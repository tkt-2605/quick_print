// Where the API lives. Empty = same origin (dev server proxy, or the shop PC serving the site itself).
// The GitHub Pages build sets VITE_API_BASE=https://quickprint-api.thiruvengadam.me
export const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API_BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** multipart upload with progress (fetch can't report upload progress). */
function uploadForm(path, form, { token, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', API_BASE + path);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON error page
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data?.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Network error — check your connection'));
    xhr.send(form);
  });
}

export const fileUrl = (fileId, version = 1) => `${API_BASE}/api/files/${fileId}/pdf?v=${version}`;

export const api = {
  config: () => request('/api/config'),
  status: () => request('/api/status'),
  trending: () => request('/api/trending'),
  uploadFile(file, { sensitive, fit }, onProgress) {
    const form = new FormData();
    form.append('sensitive', sensitive ? '1' : '0');
    form.append('fit', fit);
    form.append('file', file);
    return uploadForm('/api/files', form, { onProgress });
  },
  setFit: (fileId, fit) => request(`/api/files/${fileId}/fit`, { method: 'POST', body: { fit } }),
  createOrder: (body) => request('/api/orders', { method: 'POST', body }),
  getOrder: (id, token) => request(`/api/orders/${id}?t=${encodeURIComponent(token)}`),
  payOrder: (id, token, body) => request(`/api/orders/${id}/pay`, { method: 'POST', body: { ...body, token } }),
};

export function adminApi(token) {
  const call = (path, opts = {}) => request(`/api/admin${path}`, { ...opts, token });
  return {
    queue: () => call('/queue'),
    orderByCode: (code) => call(`/orders/by-code/${encodeURIComponent(code)}`),
    release: (orderId, pin) => call(`/orders/${orderId}/release`, { method: 'POST', body: { pin } }),
    markPaid: (orderId, method) => call(`/orders/${orderId}/mark-paid`, { method: 'POST', body: { method } }),
    closeShop: (message, reopen) => call('/shop/close', { method: 'POST', body: { message, reopen } }),
    openShop: () => call('/shop/open', { method: 'POST', body: {} }),
    setPrintingPaused: (paused) => call('/printing', { method: 'POST', body: { paused } }),
    collected: (orderId) => call(`/orders/${orderId}/collected`, { method: 'POST', body: {} }),
    cancel: (orderId) => call(`/orders/${orderId}/cancel`, { method: 'POST', body: {} }),
    flipped: (itemId) => call(`/items/${itemId}/flipped`, { method: 'POST', body: {} }),
    retry: (itemId) => call(`/items/${itemId}/retry`, { method: 'POST', body: {} }),
    printers: () => call('/printers'),
    savePrinter: (p) => call(`/printers/${p.id}`, { method: 'PUT', body: p }),
    addPrinter: (p) => call('/printers', { method: 'POST', body: p }),
    testDuplex: (id) => call(`/printers/${id}/test-duplex`, { method: 'POST', body: {} }),
    trending: () => call('/trending'),
    addTrending: (form, onProgress) => uploadForm('/api/admin/trending', form, { token, onProgress }),
    updateTrending: (id, patch) => call(`/trending/${id}`, { method: 'PATCH', body: patch }),
    deleteTrending: (id) => call(`/trending/${id}`, { method: 'DELETE' }),
    settings: () => call('/settings'),
    saveSettings: (s) => call('/settings', { method: 'PUT', body: s }),
    async filePdf(fileId) {
      const res = await fetch(`${API_BASE}/api/admin/files/${fileId}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Cannot open file');
      return res.blob();
    },
  };
}

export const adminLogin = (password) => request('/api/admin/login', { method: 'POST', body: { password } });
