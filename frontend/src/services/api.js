const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3001/api';

let isRefreshing = false;
let refreshSubscribers = [];

function subscribeTokenRefresh(cb) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

async function tryRefreshToken() {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    if (data?.accessToken) {
      localStorage.setItem('accessToken', data.accessToken);
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

    let response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
    });

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
            ...options,
            headers,
            credentials: 'include',
          });
        } else {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('user');
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        }
      } else {
        // Wait for existing refresh to complete
        const retryToken = await new Promise((resolve) => {
          subscribeTokenRefresh((t) => resolve(t));
        });
        if (retryToken) {
          headers.Authorization = `Bearer ${retryToken}`;
          response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
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

  get(endpoint) {
    return this.fetchWithAuth(endpoint, { method: 'GET' });
  },

  post(endpoint, body) {
    return this.fetchWithAuth(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  patch(endpoint, body) {
    return this.fetchWithAuth(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  delete(endpoint) {
    return this.fetchWithAuth(endpoint, {
      method: 'DELETE',
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
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
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
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
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
