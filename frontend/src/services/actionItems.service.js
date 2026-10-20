import api from './api';

export const actionItemsService = {
  async getActionItems(projectId, params = {}) {
    const q = new URLSearchParams();
    if (projectId) q.set('project_id', projectId);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && k !== 'params') {
          q.set(k, String(v));
        }
      });
    }
    const qs = q.toString() ? `?${q.toString()}` : '';
    const res = await api.get(`/action-items${qs}`);
    return res?.data || res || [];
  },

  async getActionItemById(id) {
    const res = await api.get(`/action-items/${encodeURIComponent(id)}`);
    return res?.data || res;
  },

  async createActionItem(data) {
    const res = await api.post('/action-items', data);
    return res?.data || res;
  },

  async updateActionItem(id, data) {
    const res = await api.patch(`/action-items/${encodeURIComponent(id)}`, data);
    return res?.data || res;
  },

  async deleteActionItem(id) {
    const res = await api.delete(`/action-items/${encodeURIComponent(id)}`);
    return res?.data || res;
  },
};
