const STORAGE_KEY_TOKEN = 'absensi_jwt_token';
const STORAGE_KEY_USER = 'absensi_user_info';

export function getApiBaseUrl() {
  if (typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null' && !window.location.origin.startsWith('file:')) {
    return window.location.origin;
  }
  return 'http://localhost:8080';
}

export function getAuthToken() {
  return localStorage.getItem(STORAGE_KEY_TOKEN);
}

export function getUserInfo() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_USER) || '{}');
  } catch {
    return {};
  }
}

export function setAuth(token, user) {
  localStorage.setItem(STORAGE_KEY_TOKEN, token);
  localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(STORAGE_KEY_TOKEN);
  localStorage.removeItem(STORAGE_KEY_USER);
}

export async function apiFetch(endpoint, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = endpoint.startsWith('http') ? endpoint : `${getApiBaseUrl()}${endpoint}`;
  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    clearAuth();
    window.location.reload();
    throw new Error('Sesi telah berakhir, silakan login kembali.');
  }

  return response;
}
