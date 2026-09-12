const API_URL = import.meta.env.VITE_API_URL || '/api';

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

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers
  });

  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }

  if (res.status === 401) {
    // If not on an auth page, redirect to page1.html
    clearToken();
    if (!window.location.pathname.includes('page1.html') &&
        !window.location.pathname.includes('page2.html') &&
        !window.location.pathname.includes('page3.html')) {
      window.location.href = '/page1.html';
    }
    throw new Error(body?.error || 'Authentication required');
  }

  if (!res.ok) {
    throw new Error(body?.error || `API request failed (${res.status})`);
  }

  return body;
}

export const apiGet = path => apiRequest(path);
export const apiPost = (path, body) => apiRequest(path, { method: 'POST', body: JSON.stringify(body) });
export const apiPut = (path, body) => apiRequest(path, { method: 'PUT', body: JSON.stringify(body) });
export const apiPatch = (path, body) => apiRequest(path, { method: 'PATCH', body: JSON.stringify(body) });
export const apiDelete = (path) => apiRequest(path, { method: 'DELETE' });

export { API_URL };
