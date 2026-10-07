import api from './api';

export const authService = {
  async login(identifier, password, organization_id = null) {
    const payload = { email: identifier, password };
    if (organization_id) {
      payload.organization_id = organization_id;
    }
    const data = await api.post('/auth/login', payload);
    if (data.accessToken) {
      localStorage.setItem('accessToken', data.accessToken);
    }
    return data;
  },

  async getOrganizations() {
    return await api.get('/auth/organizations');
  },

  async logout() {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      // Ignore errors on logout
    }
    localStorage.removeItem('accessToken');
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
