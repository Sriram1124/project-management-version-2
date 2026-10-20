import api from './api';

export const actionItemsService = {
  async getActionItems(projectId, params = {}) {
    const res = await api.get('/api/action-items', {
      params: {
        project_id: projectId,
        ...params,
      },
    });
    return res.data;
  },

  async getActionItemById(id) {
    const res = await api.get(`/api/action-items/${id}`);
    return res.data;
  },

  async createActionItem(data) {
    const res = await api.post('/api/action-items', data);
    return res.data;
  },

  async updateActionItem(id, data) {
    const res = await api.patch(`/api/action-items/${id}`, data);
    return res.data;
  },

  async deleteActionItem(id) {
    const res = await api.delete(`/api/action-items/${id}`);
    return res.data;
  },
};

