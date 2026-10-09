import api from './api';

export const projectsService = {
  async getProjects(params = {}) {
    const query = new URLSearchParams();
    if (params.status) query.append('status', params.status);
    if (params.my) query.append('my', 'true');
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await api.get(`/projects${qs}`);
    return res.projects || [];
  },

  async getProjectById(id) {
    const res = await api.get(`/projects/${id}`);
    return res.project;
  },

  async createProject(data) {
    const res = await api.post('/projects', data);
    return res.project;
  },

  async updateProject(id, data) {
    const res = await api.patch(`/projects/${id}`, data);
    return res.project;
  },

  async archiveProject(id) {
    const res = await api.post(`/projects/${id}/archive`);
    return res.project;
  },

  async getMembers(id) {
    const res = await api.get(`/projects/${id}/members`);
    return res.members || [];
  },

  async addMember(id, userId) {
    const res = await api.post(`/projects/${id}/members`, { userId });
    return res.member;
  },

  async removeMember(id, userId) {
    return await api.delete(`/projects/${id}/members/${userId}`);
  },

  async updateMemberRoles(id, roles) {
    const res = await api.patch(`/projects/${id}/members/roles`, { roles });
    return res.members || [];
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
};
