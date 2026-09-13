function getBaseApiUrl() {
  let url = (import.meta.env.VITE_API_URL || '').trim();
  if (!url) {
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return '/api';
    }
    return 'https://practical-miracle-production-003d.up.railway.app/api';
  }
  url = url.replace(/\/+$/, '');
  if (!url.endsWith('/api') && !url.includes('/api/')) {
    url += '/api';
  }
  return url;
}

const API_URL = getBaseApiUrl();

export function getToken() {
  return localStorage.getItem('lifeRpgToken') || sessionStorage.getItem('lifeRpgToken') || null;
}

export function setToken(token) {
  if (token) {
    localStorage.setItem('lifeRpgToken', token);
    sessionStorage.setItem('lifeRpgToken', token);
  } else {
    clearToken();
  }
}

export function clearToken() {
  localStorage.removeItem('lifeRpgToken');
  sessionStorage.removeItem('lifeRpgToken');
  localStorage.removeItem('lifeRpgUsername');
  sessionStorage.removeItem('lifeRpgUsername');
}

export function isAuthenticated() {
  return Boolean(getToken());
}

export async function apiRequest(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  let res;
  try {
    res = await fetch(`${API_URL}${cleanPath}`, {
      ...options,
      headers
    });
  } catch (networkErr) {
    throw new Error('Unable to connect to the server. Please check your internet connection.');
  }

  const contentType = res.headers.get('content-type') || '';
  let body = null;
  if (contentType.includes('application/json')) {
    try {
      body = await res.json();
    } catch {
      body = null;
    }
  } else {
    try {
      const text = await res.text();
      body = { raw: text };
    } catch {
      body = null;
    }
  }

  if (res.status === 401) {
    // If not on an auth page, redirect to page1.html
    clearToken();
    if (typeof window !== 'undefined' &&
        !window.location.pathname.includes('page1.html') &&
        !window.location.pathname.includes('page2.html') &&
        !window.location.pathname.includes('page3.html')) {
      window.location.href = '/page1.html';
    }
    const msg = (body && typeof body === 'object' && body.error)
      ? body.error
      : 'Authentication required. Please log in again.';
    throw new Error(msg);
  }

  if (!res.ok) {
    let errorMsg = '';
    if (body && typeof body === 'object' && body.error) {
      errorMsg = body.error;
    } else if (!contentType.includes('application/json')) {
      errorMsg = 'Server returned an unexpected response. Please try again.';
    } else {
      errorMsg = `API request failed (${res.status})`;
    }
    throw new Error(errorMsg);
  }

  return body;
}

export const apiGet = path => apiRequest(path);
export const apiPost = (path, body) => apiRequest(path, { method: 'POST', body: JSON.stringify(body) });
export const apiPut = (path, body) => apiRequest(path, { method: 'PUT', body: JSON.stringify(body) });
export const apiPatch = (path, body) => apiRequest(path, { method: 'PATCH', body: JSON.stringify(body) });
export const apiDelete = (path, body) => apiRequest(path, {
  method: 'DELETE',
  ...(body !== undefined ? { body: JSON.stringify(body) } : {})
});

export { API_URL };
