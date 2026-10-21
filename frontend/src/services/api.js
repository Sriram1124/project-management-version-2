import {
  getSafeToken,
  getSafeSessionId,
  setAuthSessionTokens,
  clearSafeAuthStorage,
} from '../utils/storageSecurity.js';

const getApiBaseUrl = () => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  if (typeof window !== 'undefined' && window.location && window.location.hostname === 'localhost') {
    return 'http://localhost:3001/api';
  }
  return 'http://127.0.0.1:3001/api';
};

const API_URL = getApiBaseUrl();

// Safe JWT parser handling base64url encoding and UTF-8 characters without throwing
export function parseJwt(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const binary = typeof atob === 'function'
      ? atob(padded)
      : (typeof Buffer !== 'undefined' ? Buffer.from(padded, 'base64').toString('binary') : null);
    if (!binary) return null;
    const jsonStr = decodeURIComponent(
      Array.prototype.map
        .call(binary, (c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonStr);
  } catch {
    try {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const binary = typeof atob === 'function'
        ? atob(base64)
        : (typeof Buffer !== 'undefined' ? Buffer.from(base64, 'base64').toString('utf8') : null);
      return binary ? JSON.parse(binary) : null;
    } catch {
      return null;
    }
  }
}

// Check if JWT token is expired, with a safety buffer (default 15 seconds)
export function isJwtExpired(token, bufferSeconds = 15) {
  if (!token) return true;
  const payload = parseJwt(token);
  if (!payload || !payload.exp) return true;
  return Date.now() >= (payload.exp * 1000) - (bufferSeconds * 1000);
}

// Identify public endpoints that must not require auth or block on token refresh
export function isPublicEndpoint(endpoint, options = {}) {
  if (options.isPublic || options.skipAuth) return true;
  if (!endpoint || typeof endpoint !== 'string') return false;
  const cleanEndpoint = endpoint.split('?')[0];
  return (
    cleanEndpoint.endsWith('/auth/login') ||
    cleanEndpoint.endsWith('/auth/organizations') ||
    cleanEndpoint.endsWith('/auth/refresh')
  );
}

// Single in-flight refresh promise to guarantee all concurrent requests share one refresh operation
let refreshPromise = null;

// In-flight GET request deduplication: avoids duplicate concurrent roundtrips
const inFlightGetRequests = new Map();

export function clearAuthSession() {
  inFlightGetRequests.clear();
  clearSafeAuthStorage();

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    } catch (e) {
      // Ignore event dispatch failure in non-browser env
    }
  }

  if (typeof window !== 'undefined' && window.location && window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

export function refreshAccessToken() {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const refreshToken = getSafeToken('refreshToken');
      const sessionId = getSafeSessionId();

      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken, sessionId }),
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(`Token refresh failed with status ${res.status}`);
      }

      const data = await res.json();
      if (!data?.accessToken) {
        throw new Error('Refresh response missing access token');
      }

      setAuthSessionTokens(data);

      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        try {
          window.dispatchEvent(
            new CustomEvent('auth:token-refreshed', { detail: { accessToken: data.accessToken } })
          );
        } catch (e) {
          // Ignore
        }
      }

      return data.accessToken;
    } catch (err) {
      clearAuthSession();
      throw err;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// Ensures an access token is valid before sending an authenticated request
async function ensureValidAccessToken() {
  // If a refresh is already in-flight, await it so we don't send stale tokens
  if (refreshPromise) {
    try {
      const newToken = await refreshPromise;
      if (newToken) return newToken;
    } catch {
      return null;
    }
  }

  const token = getSafeToken('accessToken');
  const refreshToken = getSafeToken('refreshToken');

  // If token is missing or expired, attempt proactive refresh if refreshToken exists
  if (!token || isJwtExpired(token)) {
    if (refreshToken) {
      try {
        const refreshedToken = await refreshAccessToken();
        return refreshedToken;
      } catch {
        return null;
      }
    }
    return null;
  }

  return token;
}

const api = {
  async fetchWithAuth(endpoint, options = {}) {
    const isPublic = isPublicEndpoint(endpoint, options);

    // 1. Proactive token validation for authenticated requests
    let token = null;
    if (!isPublic) {
      token = await ensureValidAccessToken();
      const hasRefreshToken = !!getSafeToken('refreshToken');

      // If we cannot obtain a valid token and no refresh token exists, fail cleanly
      if (!token && !hasRefreshToken) {
        clearAuthSession();
        throw new Error('Authentication required');
      }
    }

    const headers = {
      ...(options.body && !(options.body instanceof FormData) && { 'Content-Type': 'application/json' }),
      ...(!options.body && options.method && options.method !== 'GET' && options.method !== 'HEAD' && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    // Timeout & AbortController handling
    const controller = new AbortController();
    const timeoutMs = options.timeout !== undefined ? options.timeout : 25000;
    let timeoutId = null;
    let didTimeout = false;

    if (timeoutMs && timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        didTimeout = true;
        controller.abort(new Error(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }

    let onExternalAbort = null;
    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort(options.signal.reason);
      } else {
        onExternalAbort = () => controller.abort(options.signal.reason);
        options.signal.addEventListener('abort', onExternalAbort);
      }
    }

    const {
      timeout: _unusedTimeout,
      signal: _unusedSignal,
      isPublic: _unusedPublic,
      skipAuth: _unusedSkipAuth,
      responseType,
      _retry,
      ...fetchOptions
    } = options;

    let response;
    try {
      response = await fetch(`${API_URL}${endpoint}`, {
        ...fetchOptions,
        signal: controller.signal,
        headers,
        credentials: 'include',
      });
    } catch (err) {
      if (didTimeout) {
        throw new Error('Request timed out. The server took too long to respond. Please try again.');
      }
      throw err;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (options.signal && onExternalAbort) {
        options.signal.removeEventListener('abort', onExternalAbort);
      }
    }

    // 2. Reactive 401 handling: retry at most once using refreshed token
    if (response.status === 401 && !isPublic) {
      if (!_retry) {
        try {
          const newToken = await refreshAccessToken();
          if (newToken) {
            headers.Authorization = `Bearer ${newToken}`;
            response = await fetch(`${API_URL}${endpoint}`, {
              ...fetchOptions,
              signal: controller.signal,
              headers,
              credentials: 'include',
            });
          }
        } catch (refreshErr) {
          clearAuthSession();
          throw refreshErr;
        }
      }

      // If still 401 after retry (or was already a retry attempt)
      if (response.status === 401) {
        clearAuthSession();
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Unauthorized');
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || 'API Request Failed');
    }

    if (response.status === 204) {
      return null;
    }

    if (responseType === 'blob') {
      return response.blob();
    }

    return response.json();
  },

  get(endpoint, options = {}) {
    // Deduplicate identical concurrent in-flight GET requests
    const cacheKey = endpoint;
    if (inFlightGetRequests.has(cacheKey)) {
      return inFlightGetRequests.get(cacheKey);
    }
    const p = this.fetchWithAuth(endpoint, { method: 'GET', ...options })
      .finally(() => {
        inFlightGetRequests.delete(cacheKey);
      });
    inFlightGetRequests.set(cacheKey, p);
    return p;
  },

  post(endpoint, body, options = {}) {
    return this.fetchWithAuth(endpoint, {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      ...options,
    });
  },

  patch(endpoint, body, options = {}) {
    return this.fetchWithAuth(endpoint, {
      method: 'PATCH',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      ...options,
    });
  },

  put(endpoint, body, options = {}) {
    return this.fetchWithAuth(endpoint, {
      method: 'PUT',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      ...options,
    });
  },

  delete(endpoint, options = {}) {
    return this.fetchWithAuth(endpoint, {
      method: 'DELETE',
      ...options,
    });
  },

  async upload(endpoint, formData, options = {}) {
    return this.fetchWithAuth(endpoint, {
      method: 'POST',
      body: formData,
      ...options,
    });
  },

  async getBlob(endpoint, options = {}) {
    return this.fetchWithAuth(endpoint, {
      method: 'GET',
      responseType: 'blob',
      ...options,
    });
  },

  async downloadFile(endpoint, defaultFilename = 'download', options = {}) {
    const blob = await this.getBlob(endpoint, options);
    if (typeof window !== 'undefined' && window.URL && document) {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    }
    return blob;
  },
};

export default api;
