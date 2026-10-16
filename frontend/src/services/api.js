const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://localhost:3001/api';
  }
  return 'http://127.0.0.1:3001/api';
};

const API_URL = getApiBaseUrl();

let isRefreshing = false;
let refreshSubscribers = [];

function subscribeTokenRefresh(cb) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

function onRefreshFailed() {
  refreshSubscribers.forEach((cb) => cb(null));
  refreshSubscribers = [];
}

function clearAuthSession() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('sessionId');
  localStorage.removeItem('user');
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

async function tryRefreshToken() {
  try {
    const refreshToken = localStorage.getItem('refreshToken');
    const sessionId = localStorage.getItem('sessionId');

    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken, sessionId }),
      credentials: 'include',
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    if (data?.accessToken) {
      localStorage.setItem('accessToken', data.accessToken);
      if (data.refreshToken) {
        localStorage.setItem('refreshToken', data.refreshToken);
      }
      if (data.sessionId) {
        localStorage.setItem('sessionId', data.sessionId);
      }
      return data.accessToken;
    }
    return null;
  } catch (e) {
    return null;
  }
}

const api = {
  async fetchWithAuth(endpoint, options = {}) {
    let token = localStorage.getItem('accessToken');

    const headers = {
      'Content-Type': 'application/json',
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

    const { timeout: _unusedTimeout, signal: _unusedSignal, ...fetchOptions } = options;

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

    if (response.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
      if (!isRefreshing) {
        isRefreshing = true;
        const newToken = await tryRefreshToken();
        isRefreshing = false;
        if (newToken) {
          onRefreshed(newToken);
          // Retry original request with new token
          headers.Authorization = `Bearer ${newToken}`;
          response = await fetch(`${API_URL}${endpoint}`, {
            ...fetchOptions,
            signal: controller.signal,
            headers,
            credentials: 'include',
          });
        } else {
          onRefreshFailed();
          clearAuthSession();
        }
      } else {
        // Wait for existing refresh to complete
        const retryToken = await new Promise((resolve) => {
          subscribeTokenRefresh((t) => resolve(t));
        });
        if (retryToken) {
          headers.Authorization = `Bearer ${retryToken}`;
          response = await fetch(`${API_URL}${endpoint}`, {
            ...fetchOptions,
            signal: controller.signal,
            headers,
            credentials: 'include',
          });
        }
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || 'API Request Failed');
    }

    return response.json();
  },

  get(endpoint, options = {}) {
    return this.fetchWithAuth(endpoint, { method: 'GET', ...options });
  },

  post(endpoint, body, options = {}) {
    return this.fetchWithAuth(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
      ...options,
    });
  },

  patch(endpoint, body, options = {}) {
    return this.fetchWithAuth(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
      ...options,
    });
  },

  delete(endpoint, options = {}) {
    return this.fetchWithAuth(endpoint, {
      method: 'DELETE',
      ...options,
    });
  },

  async upload(endpoint, formData) {
    let token = localStorage.getItem('accessToken');
    const headers = {
      ...(token && { Authorization: `Bearer ${token}` }),
    };

    let response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include',
    });

    if (response.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
      const newToken = await tryRefreshToken();
      if (newToken) {
        headers.Authorization = `Bearer ${newToken}`;
        response = await fetch(`${API_URL}${endpoint}`, {
          method: 'POST',
          headers,
          body: formData,
          credentials: 'include',
        });
      } else {
        clearAuthSession();
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || 'Upload failed');
    }

    return response.json();
  },

  async getBlob(endpoint) {
    let token = localStorage.getItem('accessToken');
    const headers = {
      ...(token && { Authorization: `Bearer ${token}` }),
    };

    let response = await fetch(`${API_URL}${endpoint}`, {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    if (response.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
      const newToken = await tryRefreshToken();
      if (newToken) {
        headers.Authorization = `Bearer ${newToken}`;
        response = await fetch(`${API_URL}${endpoint}`, {
          method: 'GET',
          headers,
          credentials: 'include',
        });
      } else {
        clearAuthSession();
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || 'Failed to fetch file');
    }

    return response.blob();
  },

  async downloadFile(endpoint, defaultFilename = 'download') {
    const blob = await this.getBlob(endpoint);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => window.URL.revokeObjectURL(url), 1000);
  },
};

export default api;
