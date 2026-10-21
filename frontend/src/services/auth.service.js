import api from './api';
import { setAuthSessionTokens, getSafeSessionId, clearSafeAuthStorage } from '../utils/storageSecurity.js';

export const authService = {
  async login(identifier, password, organization_id = null) {
    const payload = { email: identifier, password };
    if (organization_id) {
      payload.organization_id = organization_id;
    }
    const data = await api.post('/auth/login', payload);
    setAuthSessionTokens(data);
    return data;
  },

  async getOrganizations() {
    return await api.get('/auth/organizations');
  },

  async logout() {
    try {
      const sessionId = getSafeSessionId();
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
