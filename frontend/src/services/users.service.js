import api from './api';

export const usersService = {
  /**
   * Get organization users with optional type filter (INTERN | EMPLOYEE) and cohort filter
   */
  async getUsers(type, cohort) {
    const params = new URLSearchParams();
    if (type && type !== 'ALL') params.append('type', type);
    if (cohort) params.append('cohort_id', cohort);
    const queryString = params.toString();
    const url = queryString ? `/users?${queryString}` : '/users';
    return await api.get(url);
  },

  /**
   * Manager provisions individual user
   */
  async createUser({ name, email, type, batch, subbatch, cohort_id }) {
    return await api.post('/users', { name, email, type, batch, subbatch, cohort_id });
  },

  /**
   * Download schema-aware CSV template for bulk user provisioning
   */
  async getBulkTemplate() {
    return await api.get('/users/bulk/template', { responseType: 'text' });
  },

  /**
   * Validate CSV text for bulk import preview
   */
  async validateBulkCsv(csvContent) {
    return await api.post('/users/bulk/validate', { csv: csvContent });
  },

  /**
   * Confirm bulk creation with validated rows and optional update confirmation
   */
  async confirmBulkImport(rows, updateExisting = false) {
    return await api.post('/users/bulk', { rows, update_existing: updateExisting });
  },

  /**
   * Manager resets user password, generating new temporary password
   */
  async resetPassword(userId) {
    return await api.post(`/users/${encodeURIComponent(userId)}/reset-password`);
  },

  /**
   * Manager deactivates organization user
   */
  async deactivateUser(userId) {
    return await api.post(`/users/${encodeURIComponent(userId)}/deactivate`);
  },

  /**
   * Manager updates member's details (name, batch, subbatch)
   */
  async updateMember(userId, data) {
    return await api.patch(`/users/${encodeURIComponent(userId)}`, data);
  },

  /**
   * Manager fetches user's assigned and available permissions
   */
  async getUserPermissions(userId) {
    return await api.get(`/users/${encodeURIComponent(userId)}/permissions`);
  },

  /**
   * Manager updates an intern's explicitly granted permissions
   */
  async updateUserPermissions(userId, permissions) {
    return await api.put(`/users/${encodeURIComponent(userId)}/permissions`, { permissions });
  },

  /**
   * Manager bulk deletes selected organization members with password verification
   */
  async deleteUsersBulk({ userIds, password }) {
    return await api.post('/users/bulk/delete', { userIds, password });
  },
};
