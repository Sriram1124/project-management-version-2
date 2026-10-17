import api from './api';

export const workItemsService = {
  /**
   * List work items with optional filters:
   * project_id, type, status, priority, assigned_to_me, my_personal
   */
  async listWorkItems(filters = {}, options = {}) {
    const params = new URLSearchParams();
    if (filters.project_id) params.append('project_id', filters.project_id);
    if (filters.type) params.append('type', filters.type);
    if (filters.status) params.append('status', filters.status);
    if (filters.priority) params.append('priority', filters.priority);
    if (filters.sprint_id !== undefined && filters.sprint_id !== null) {
      params.append('sprint_id', filters.sprint_id);
    }
    if (filters.assigned_to_me) params.append('assigned_to_me', 'true');
    if (filters.my_personal) params.append('my_personal', 'true');
    if (filters.overdue_only) params.append('overdue_only', 'true');
    if (filters.limit) params.append('limit', String(filters.limit));

    const qs = params.toString();
    const endpoint = `/work-items${qs ? `?${qs}` : ''}`;
    const data = await api.get(endpoint, options);
    return data.work_items || [];
  },

  /**
   * Get single work item details by ID
   */
  async getWorkItem(id) {
    if (!id) throw new Error('Work item ID is required');
    const data = await api.get(`/work-items/${id}`);
    return data.work_item;
  },

  /**
   * Create a new work item (personal or project)
   */
  async createWorkItem(payload) {
    const cleanPayload = { ...payload };
    // Sanitize empty strings to null
    if (cleanPayload.project_id === '' || cleanPayload.project_id === undefined) {
      cleanPayload.project_id = null;
    }
    if (cleanPayload.parent_id === '' || cleanPayload.parent_id === undefined) {
      cleanPayload.parent_id = null;
    }
    if (cleanPayload.sprint_id === '' || cleanPayload.sprint_id === undefined) {
      cleanPayload.sprint_id = null;
    }
    if (cleanPayload.due_date === '') {
      cleanPayload.due_date = null;
    }
    if (cleanPayload.start_date === '') {
      cleanPayload.start_date = null;
    }

    const data = await api.post('/work-items', cleanPayload);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('work-items-updated', { detail: { action: 'create', item: data.work_item } }));
    }
    return data.work_item;
  },

  /**
   * Update work item fields (title, description, status, priority, start_date, due_date, sprint_id, parent_id)
   */
  async updateWorkItem(id, payload) {
    if (!id) throw new Error('Work item ID is required');
    const cleanPayload = { ...payload };
    if (cleanPayload.due_date === '') cleanPayload.due_date = null;
    if (cleanPayload.start_date === '') cleanPayload.start_date = null;
    if (cleanPayload.description === '') cleanPayload.description = null;
    if (cleanPayload.sprint_id === '') cleanPayload.sprint_id = null;
    if (cleanPayload.parent_id === '') cleanPayload.parent_id = null;

    const data = await api.patch(`/work-items/${id}`, cleanPayload);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('work-items-updated', { detail: { action: 'update', id, item: data.work_item } }));
    }
    return data.work_item;
  },

  /**
   * Safe delete work item
   */
  async deleteWorkItem(id) {
    if (!id) throw new Error('Work item ID is required');
    const res = await api.delete(`/work-items/${id}`);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('work-items-updated', { detail: { action: 'delete', id } }));
    }
    return res;
  },

  /**
   * Add assignee to work item
   */
  async addAssignee(id, userId) {
    if (!id || !userId) throw new Error('Work item ID and user ID are required');
    const data = await api.post(`/work-items/${id}/assignees`, { user_id: userId });
    return data.work_item;
  },

  /**
   * Remove assignee from work item
   */
  async removeAssignee(id, userId) {
    if (!id || !userId) throw new Error('Work item ID and user ID are required');
    return await api.delete(`/work-items/${id}/assignees/${userId}`);
  },

  /**
   * Convenience helper for personal task creation
   */
  async createPersonalTask({ title, description, priority = 'MEDIUM', dueDate, story_points = 1 }) {
    return await this.createWorkItem({
      title,
      description: description || null,
      priority,
      due_date: dueDate || null,
      story_points: Number(story_points) || 1,
      type: 'TASK',
      project_id: null,
    });
  },

  /**
   * Toggle task completed / in progress
   */
  async toggleComplete(taskOrId) {
    if (!taskOrId) return null;
    let task = taskOrId;
    if (typeof taskOrId === 'string') {
      task = await this.getWorkItem(taskOrId);
    }
    if (!task) return null;
    const nextStatus = task.status === 'COMPLETED' ? 'IN_PROGRESS' : 'COMPLETED';
    return await this.updateWorkItem(task.id, { status: nextStatus });
  },

  /**
   * Helper: check if task is overdue using backend derived field or calculation
   */
  isOverdue(item) {
    if (!item) return false;
    if (item.is_overdue !== undefined) return Boolean(item.is_overdue);
    if (!item.due_date || item.status === 'COMPLETED') return false;
    return new Date(item.due_date) < new Date();
  },

  /**
   * Helper: check if task is due today
   */
  isDueToday(item) {
    if (!item || !item.due_date || item.status === 'COMPLETED') return false;
    const due = new Date(item.due_date);
    const curr = new Date();
    return (
      due.getFullYear() === curr.getFullYear() &&
      due.getMonth() === curr.getMonth() &&
      due.getDate() === curr.getDate()
    );
  },

  /**
   * Get server-calculated analytics scoped to user / filters
   */
  async getAnalytics(filters = {}, options = {}) {
    const params = new URLSearchParams();
    if (filters.project_id) params.append('project_id', filters.project_id);
    if (filters.sprint_id && filters.sprint_id !== 'ALL') params.append('sprint_id', filters.sprint_id);
    if (filters.user_id) params.append('user_id', filters.user_id);
    if (filters.start_date) params.append('start_date', filters.start_date);
    if (filters.end_date) params.append('end_date', filters.end_date);

    const qs = params.toString();
    const endpoint = `/work-items/analytics${qs ? `?${qs}` : ''}`;
    const data = await api.get(endpoint, options);
    return data.analytics || null;
  },

  // Backward compatibility alias
  async getWorkItemById(id) {
    return await this.getWorkItem(id);
  },
};

export default workItemsService;
