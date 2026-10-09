import api from './api';

export const sprintsService = {
  /**
   * List all sprints for a project
   */
  async getSprints(projectId) {
    if (!projectId) return [];
    const res = await api.get(`/projects/${projectId}/sprints`);
    return res.sprints || [];
  },

  /**
   * Get single sprint with work items
   */
  async getSprintById(projectId, sprintId) {
    if (!projectId || !sprintId) return null;
    const res = await api.get(`/projects/${projectId}/sprints/${sprintId}`);
    return res.sprint;
  },

  /**
   * Create a new sprint in a project
   */
  async createSprint(projectId, data) {
    const res = await api.post(`/projects/${projectId}/sprints`, data);
    return res.sprint;
  },

  /**
   * Update sprint details (name, goal, dates)
   */
  async updateSprint(projectId, sprintId, data) {
    const res = await api.patch(`/projects/${projectId}/sprints/${sprintId}`, data);
    return res.sprint;
  },

  /**
   * Start sprint (transitions PLANNED -> ACTIVE)
   */
  async startSprint(projectId, sprintId) {
    const res = await api.post(`/projects/${projectId}/sprints/${sprintId}/start`);
    return res.sprint;
  },

  /**
   * Complete sprint (transitions ACTIVE -> COMPLETED)
   */
  async completeSprint(projectId, sprintId, options = {}) {
    const res = await api.post(`/projects/${projectId}/sprints/${sprintId}/complete`, options);
    return res.sprint;
  },

  /**
   * Delete sprint (disassociates work items safely back to backlog)
   */
  async deleteSprint(projectId, sprintId) {
    return await api.delete(`/projects/${projectId}/sprints/${sprintId}`);
  },
};

