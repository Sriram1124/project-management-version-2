import api from './api';
import { setSafeToken, isValidSessionId, clearSafeAuthStorage } from '../utils/storageSecurity.js';

export const authService = {
  async login(identifier, password, organization_id = null) {
    const payload = { email: identifier, password };
    if (organization_id) {
      payload.organization_id = organization_id;
    }
    const data = await api.post('/auth/login', payload);
    if (data.accessToken) {
      setSafeToken('accessToken', data.accessToken);
    }
    if (data.refreshToken) {
      setSafeToken('refreshToken', data.refreshToken);
    }
    if (data.sessionId && isValidSessionId(data.sessionId)) {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('sessionId', data.sessionId);
      }
    }
    return data;
  },

  async getOrganizations() {
    return await api.get('/auth/organizations');
  },

  async logout() {
    try {
      const sessionId = localStorage.getItem('sessionId');
      await api.post('/auth/logout', { sessionId });
    } catch (e) {
      // Ignore errors on logout
    }
    clearSafeAuthStorage();
  },

  async getCurrentUser() {
    try {
      return await api.get('/auth/me');
    } catch (error) {
      return null;
    }
  },

  async changePassword(current_password, new_password) {
    return await api.post('/auth/change-password', { current_password, new_password });
  },

  async updateProfile(profileData) {
    return await api.patch('/users/profile', profileData);
  }
};
