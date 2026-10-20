import api from './api';

// In-memory client cache and in-flight request deduplication for analytics
const clientAnalyticsCache = new Map();
const inFlightAnalyticsRequests = new Map();
const CLIENT_CACHE_TTL_MS = 15_000; // 15 seconds

export function clearClientAnalyticsCache(projectId) {
  if (projectId) {
    for (const key of clientAnalyticsCache.keys()) {
      if (key.includes(projectId)) clientAnalyticsCache.delete(key);
    }
  } else {
    clientAnalyticsCache.clear();
  }
}

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
    clearClientAnalyticsCache(cleanPayload.project_id);
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
    clearClientAnalyticsCache();
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
    clearClientAnalyticsCache();
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
    const item = data.work_item || data;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('work-items-updated', { detail: { action: 'update', id, item } }));
    }
    return item;
  },

  /**
   * Remove assignee from work item
   */
  async removeAssignee(id, userId) {
    if (!id || !userId) throw new Error('Work item ID and user ID are required');
    const res = await api.delete(`/work-items/${id}/assignees/${userId}`);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('work-items-updated', { detail: { action: 'update', id, removedUserId: userId } }));
    }
    return res;
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
  getEndOfDueDate(dueDateVal, timeZone = 'Asia/Kolkata') {
    if (!dueDateVal) return null;
    let year, month, day;
    if (typeof dueDateVal === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dueDateVal)) {
      const parts = dueDateVal.slice(0, 10).split('-');
      year = Number(parts[0]);
      month = Number(parts[1]);
      day = Number(parts[2]);
    } else {
      const d = new Date(dueDateVal);
      if (isNaN(d.getTime())) return null;
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      });
      const p = Object.fromEntries(
        formatter.formatToParts(d).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)])
      );
      year = p.year;
      month = p.month;
      day = p.day;
    }
    const approxUtc = Date.UTC(year, month - 1, day, 12, 0, 0);
    const tf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });
    const parts = Object.fromEntries(
      tf.formatToParts(new Date(approxUtc)).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)])
    );
    const offsetMs = (parts.hour * 3600 + parts.minute * 60 + parts.second - 12 * 3600) * 1000;
    const endOfDayUtcMs = Date.UTC(year, month - 1, day, 23, 59, 59, 999) - offsetMs;
    return new Date(endOfDayUtcMs);
  },

  isOverdue(item) {
    if (!item) return false;
    const status = String(item.status || '').toUpperCase();
    if (status === 'COMPLETED' || status === 'DONE' || status === 'CANCELLED') return false;
    const dueDate = item.due_date || item.dueDate;
    if (!dueDate) return false;
    const eod = this.getEndOfDueDate(dueDate);
    if (!eod) return false;
    return new Date() > eod;
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
    const isFresh = Boolean(filters.fresh || options.fresh);
    const params = new URLSearchParams();
    if (filters.project_id) params.append('project_id', filters.project_id);
    if (filters.sprint_id && filters.sprint_id !== 'ALL') params.append('sprint_id', filters.sprint_id);
    if (filters.user_id) params.append('user_id', filters.user_id);
    if (filters.start_date) params.append('start_date', filters.start_date);
    if (filters.end_date) params.append('end_date', filters.end_date);
    if (isFresh) params.append('fresh', 'true');

    const qs = params.toString();
    const endpoint = `/work-items/analytics${qs ? `?${qs}` : ''}`;
    const cacheKey = qs || 'all';

    if (!isFresh) {
      const cached = clientAnalyticsCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CLIENT_CACHE_TTL_MS) {
        return cached.data;
      }
      if (inFlightAnalyticsRequests.has(cacheKey)) {
        return inFlightAnalyticsRequests.get(cacheKey);
      }
    }

    const requestPromise = (async () => {
      try {
        const data = await api.get(endpoint, options);
        const result = data.analytics || null;
        if (result) {
          clientAnalyticsCache.set(cacheKey, { data: result, timestamp: Date.now() });
        }
        return result;
      } finally {
        inFlightAnalyticsRequests.delete(cacheKey);
      }
    })();

    inFlightAnalyticsRequests.set(cacheKey, requestPromise);
    return requestPromise;
  },

  /**
   * Get aggregated Kanban summary metrics for a project
   */
  async getKanbanSummary(projectId, filters = {}, options = {}) {
    if (!projectId) return null;
    const params = new URLSearchParams();
    params.append('project_id', projectId);
    if (filters.sprint_id && filters.sprint_id !== 'ALL' && filters.sprint_id !== 'All Sprints') {
      params.append('sprint_id', filters.sprint_id);
    }
    if (filters.user_id) {
      params.append('user_id', filters.user_id);
    }
    const qs = params.toString();
    const endpoint = '/work-items/kanban-summary' + (qs ? '?' + qs : '');
    try {
      const data = await api.get(endpoint, options);
      return data.kanban_summary || data;
    } catch (err) {
      return null;
    }
  },

  // Backward compatibility alias
  async getWorkItemById(id) {
    return await this.getWorkItem(id);
  },

  /**
   * Fetch comments for a work item, ordered oldest-to-newest
   */
  async getComments(workItemId) {
    if (!workItemId) throw new Error('Work item ID is required');
    const data = await api.get(`/work-items/${workItemId}/comments`);
    return data.comments || [];
  },

  /**
   * Add a comment to a work item
   */
  async addComment(workItemId, content) {
    if (!workItemId) throw new Error('Work item ID is required');
    const data = await api.post(`/work-items/${workItemId}/comments`, { content });
    return data.comment;
  },

  /**
   * Update a comment
   */
  async updateComment(workItemId, commentId, content) {
    if (!workItemId || !commentId) throw new Error('Work item ID and comment ID are required');
    const data = await api.put(`/work-items/${workItemId}/comments/${commentId}`, { content });
    return data.comment;
  },

  /**
   * Delete a comment
   */
  async deleteComment(workItemId, commentId) {
    if (!workItemId || !commentId) throw new Error('Work item ID and comment ID are required');
    return await api.delete(`/work-items/${workItemId}/comments/${commentId}`);
  },

  /**
   * Request due-date extension
   */
  async requestExtension(id, { requested_due_date, reason }) {
    if (!id) throw new Error('Work item ID is required');
    const data = await api.post(`/work-items/${id}/extension-request`, {
      requested_due_date,
      reason,
    });
    clearClientAnalyticsCache();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('work-items-updated', { detail: { action: 'extension-requested', id } }));
    }
    return data.extension_request || data.request || data;
  },

  /**
   * Get all extension requests for a work item
   */
  async getExtensionRequests(id) {
    if (!id) throw new Error('Work item ID is required');
    const data = await api.get(`/work-items/${id}/extension-requests`);
    return data.extension_requests || data.requests || data || [];
  },

  /**
   * Approve or reject an extension request
   */
  async decideExtension(id, requestId, { decision, decision_note }) {
    if (!id || !requestId) throw new Error('Work item ID and Request ID are required');
    const data = await api.post(`/work-items/${id}/extension-requests/${requestId}/decision`, {
      decision,
      decision_note,
    });
    clearClientAnalyticsCache();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('work-items-updated', { detail: { action: 'extension-decided', id, decision } }));
    }
    return data;
  },

  /**
   * Get all extension requests for a project
   */
  async getProjectExtensionRequests(projectId, status) {
    if (!projectId) throw new Error('Project ID is required');
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    const data = await api.get(`/projects/${projectId}/extension-requests${qs}`);
    return data.extension_requests || data.requests || data || [];
  },
};

export default workItemsService;
