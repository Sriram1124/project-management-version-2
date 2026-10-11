import api from './api';

export const organizationService = {
  /**
   * Get Platform Overview (KPIs, status distribution, and recent activity)
   */
  async getPlatformOverview() {
    return await api.get('/organizations/platform-overview');
  },

  /**
   * List platform organizations with optional search, status filtering, sorting, and pagination
   */
  async getOrganizations(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.status) query.append('status', params.status);
    if (params.sortBy) query.append('sortBy', params.sortBy);
    if (params.sortOrder) query.append('sortOrder', params.sortOrder);
    if (params.page) query.append('page', params.page);
    if (params.limit) query.append('limit', params.limit);

    const queryString = query.toString();
    const url = queryString ? `/organizations?${queryString}` : '/organizations';
    const res = await api.get(url);
    return res;
  },

  /**
   * Get single organization details (Super Admin only)
   */
  async getOrganizationById(id) {
    const res = await api.get(`/organizations/${id}`);
    return res.organization || null;
  },

  /**
   * Create Organization standalone without manager (Super Admin only)
   */
  async createOrganizationOnly(name) {
    return await api.post('/organizations', { name });
  },

  /**
   * Create Organization and Initial Manager atomically (Super Admin only)
   */
  async createOrganization(data) {
    return await api.post('/organizations', data);
  },

  /**
   * Add additional Manager to an existing Organization (Super Admin only)
   */
  async addManager(organizationId, data) {
    return await api.post(`/organizations/${organizationId}/managers`, data);
  },

  /**
   * Download sample CSV template for bulk manager provisioning
   */
  async downloadManagerTemplate(organizationId) {
    return await api.downloadFile(`/organizations/${organizationId}/managers/template`, 'manager-import-template.csv');
  },

  /**
   * Validate CSV content for bulk manager provisioning
   */
  async validateManagerCsv(organizationId, csvText) {
    return await api.post(`/organizations/${organizationId}/managers/validate-csv`, { csvText });
  },

  /**
   * Bulk import validated managers
   */
  async importManagersBulk(organizationId, rows) {
    return await api.post(`/organizations/${organizationId}/managers/bulk`, { rows });
  },

  /**
   * Reset Manager Password (Super Admin only)
   */
  async resetManagerPassword(organizationId, managerId) {
    return await api.post(`/organizations/${organizationId}/managers/${managerId}/reset-password`);
  },

  /**
   * Update Organization details (e.g. rename)
   */
  async updateOrganization(organizationId, data) {
    return await api.patch(`/organizations/${organizationId}`, data);
  },

  /**
   * Suspend or Reactivate an Organization
   */
  async toggleStatus(organizationId, isActive, reason = '') {
    return await api.post(`/organizations/${organizationId}/toggle-status`, {
      is_active: isActive,
      reason,
    });
  },

  /**
   * Get paginated members of an organization
   */
  async getOrganizationMembers(organizationId, params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.role) query.append('role', params.role);
    if (params.page) query.append('page', params.page);
    if (params.limit) query.append('limit', params.limit);

    const queryString = query.toString();
    const url = `/organizations/${organizationId}/members${queryString ? `?${queryString}` : ''}`;
    return await api.get(url);
  },

  /**
   * Fetch platform audit logs (Super Admin only)
   */
  async getAuditLogs(params = {}) {
    const query = new URLSearchParams();
    if (params.page) query.append('page', params.page);
    if (params.limit) query.append('limit', params.limit);
    if (params.action) query.append('action', params.action);
    if (params.targetType) query.append('targetType', params.targetType);
    if (params.organizationId) query.append('organizationId', params.organizationId);

    const queryString = query.toString();
    const url = `/organizations/audit-logs${queryString ? `?${queryString}` : ''}`;
    return await api.get(url);
  },
};
