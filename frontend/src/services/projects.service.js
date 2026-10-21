import api from './api';

// In-memory client cache and deduplication for /projects?my=true
let cachedMyProjects = null;
let lastMyProjectsFetchAt = 0;
let inFlightMyProjectsPromise = null;
const MY_PROJECTS_CACHE_TTL_MS = 30_000; // 30 seconds

export function invalidateCentralProjectsCache() {
  cachedMyProjects = null;
  lastMyProjectsFetchAt = 0;
  inFlightMyProjectsPromise = null;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('project-updated'));
  }
}

export const projectsService = {
  async getProjects(params = {}, options = {}) {
    const isMyOnly = params.my === true && !params.status && !options.forceRefresh;
    if (isMyOnly) {
      const isFresh = cachedMyProjects !== null && (Date.now() - lastMyProjectsFetchAt) < MY_PROJECTS_CACHE_TTL_MS;
      if (isFresh) return cachedMyProjects;
      if (inFlightMyProjectsPromise) return inFlightMyProjectsPromise;
    }

    const query = new URLSearchParams();
    if (params.status) query.append('status', params.status);
    if (params.my) query.append('my', 'true');
    const qs = query.toString() ? `?${query.toString()}` : '';

    const fetchPromise = api.get(`/projects${qs}`)
      .then((res) => {
        const list = res.projects || [];
        if (isMyOnly) {
          cachedMyProjects = list;
          lastMyProjectsFetchAt = Date.now();
        }
        return list;
      })
      .finally(() => {
        if (isMyOnly) inFlightMyProjectsPromise = null;
      });

    if (isMyOnly) inFlightMyProjectsPromise = fetchPromise;
    return await fetchPromise;
  },

  async getHealthOverview(params = {}) {
    const query = new URLSearchParams();
    if (params.cohort_id) query.append('cohort_id', params.cohort_id);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await api.get(`/projects/health-overview${qs}`);
    return res;
  },

  async getTechLeads() {
    const res = await api.get('/projects/tech-leads');
    return res.tech_leads || [];
  },

  async getProjectById(id) {
    const res = await api.get(`/projects/${id}`);
    return res.project;
  },

  async createProject(data) {
    const res = await api.post('/projects', data);
    invalidateCentralProjectsCache();
    return res.project;
  },

  async updateProject(id, data) {
    const res = await api.patch(`/projects/${id}`, data);
    invalidateCentralProjectsCache();
    return res.project;
  },

  async archiveProject(id) {
    const res = await api.post(`/projects/${id}/archive`);
    invalidateCentralProjectsCache();
    return res.project;
  },

  async deleteProject(id) {
    const res = await api.delete(`/projects/${id}`);
    invalidateCentralProjectsCache();
    return res;
  },

  async getMembers(id) {
    const res = await api.get(`/projects/${id}/members`);
    const members = res.members || [];
    return members.slice().sort((a, b) => {
      const aIsLead = a.project_role === 'TECH_LEAD' || a.role === 'TECH_LEAD';
      const bIsLead = b.project_role === 'TECH_LEAD' || b.role === 'TECH_LEAD';
      if (aIsLead && !bIsLead) return -1;
      if (!aIsLead && bIsLead) return 1;
      const nameA = a.name || a.email || '';
      const nameB = b.name || b.email || '';
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });
  },

  async addMember(id, userId, role) {
    const res = await api.post(`/projects/${id}/members`, { userId, role });
    invalidateCentralProjectsCache();
    return res.member || res;
  },

  async addMembers(id, userIds, role) {
    const res = await api.post(`/projects/${id}/members`, { userIds, role });
    invalidateCentralProjectsCache();
    return res.members || (res.member ? [res.member] : []);
  },

  async removeMember(id, userId) {
    const res = await api.delete(`/projects/${id}/members/${userId}`);
    invalidateCentralProjectsCache();
    return res;
  },

  async updateMemberRoles(id, roles) {
    const res = await api.patch(`/projects/${id}/members/roles`, { roles });
    invalidateCentralProjectsCache();
    const members = res.members || [];
    return members.slice().sort((a, b) => {
      const aIsLead = a.project_role === 'TECH_LEAD' || a.role === 'TECH_LEAD';
      const bIsLead = b.project_role === 'TECH_LEAD' || b.role === 'TECH_LEAD';
      if (aIsLead && !bIsLead) return -1;
      if (!aIsLead && bIsLead) return 1;
      const nameA = a.name || a.email || '';
      const nameB = b.name || b.email || '';
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });
  },

  async updateMemberPermissions(id, userId, permissions) {
    const res = await api.patch(`/projects/${id}/members/${userId}/permissions`, { permissions });
    invalidateCentralProjectsCache();
    const members = res.members || [];
    return members.slice().sort((a, b) => {
      const aIsLead = a.project_role === 'TECH_LEAD' || a.role === 'TECH_LEAD';
      const bIsLead = b.project_role === 'TECH_LEAD' || b.role === 'TECH_LEAD';
      if (aIsLead && !bIsLead) return -1;
      if (!aIsLead && bIsLead) return 1;
      const nameA = a.name || a.email || '';
      const nameB = b.name || b.email || '';
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });
  },

  async getDocuments(id) {
    const res = await api.get(`/projects/${id}/documents`);
    return res.documents || [];
  },

  async uploadDocument(id, file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.upload(`/projects/${id}/documents`, formData);
    return res.document;
  },

  async createDocument(id, data) {
    const res = await api.post(`/projects/${id}/documents`, data);
    return res.document;
  },

  async downloadDocument(id, documentId, filename) {
    return await api.downloadFile(`/projects/${id}/documents/${documentId}/download`, filename);
  },

  async getDocumentBlobUrl(id, documentId) {
    const blob = await api.getBlob(`/projects/${id}/documents/${documentId}/preview`);
    return URL.createObjectURL(blob);
  },

  async updateDocument(id, documentId, data) {
    const res = await api.patch(`/projects/${id}/documents/${documentId}`, data);
    return res.document;
  },

  async deleteDocument(id, documentId) {
    return await api.delete(`/projects/${id}/documents/${documentId}`);
  },

  async getUsers(params = {}) {
    const query = new URLSearchParams();
    if (params.cohort_id) query.append('cohort_id', params.cohort_id);
    if (params.batch) query.append('batch', params.batch);
    if (params.type) query.append('type', params.type);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await api.get(`/users${qs}`);
    return res.users || [];
  },

  async getAvailablePermissions(params = {}) {
    const query = new URLSearchParams();
    if (params.scope) query.append('scope', params.scope);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await api.get(`/projects/permissions/registry${qs}`);
    return res.data || res.permissions || res;
  },

  async getProjectRoles(id) {
    const res = await api.get(`/projects/${id}/roles`);
    return res.roles || res.data || [];
  },

  async createCustomRole(id, data) {
    const res = await api.post(`/projects/${id}/roles`, data);
    return res.role || res.data || res;
  },

  async getExtensionRequests(id, status) {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    const res = await api.get(`/projects/${id}/extension-requests${qs}`);
    return res.extension_requests || res.requests || res.data || [];
  },

  invalidateCache: invalidateCentralProjectsCache,
};
