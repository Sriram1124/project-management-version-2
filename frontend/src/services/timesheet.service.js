import api from './api';

export const timesheetService = {
  getPolicy() {
    return api.get('/timesheet/organization-policy');
  },

  updatePolicy(payload) {
    return api.put('/timesheet/organization-policy', payload);
  },

  async startSession(payload = {}) {
    const res = await api.post('/timesheet/work-sessions/start', payload);
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent('timer-session-updated', {
          detail: { action: 'start', session: res?.session || null, taskId: payload.task_id },
        })
      );
      window.dispatchEvent(
        new CustomEvent('work-items-updated', {
          detail: { action: 'timer-sync' },
        })
      );
    }
    return res;
  },

  async endSession(payload = {}) {
    const res = await api.post('/timesheet/work-sessions/end', payload);
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent('timer-session-updated', {
          detail: { action: 'stop', session: res?.session || null, taskId: payload.task_id },
        })
      );
      window.dispatchEvent(
        new CustomEvent('work-items-updated', {
          detail: { action: 'timer-sync' },
        })
      );
    }
    return res;
  },

  getActiveTaskSession(taskId = null) {
    const qs = taskId ? `?task_id=${encodeURIComponent(taskId)}` : '';
    return api.get(`/timesheet/work-sessions/active${qs}`);
  },

  getTaskEntries(taskId) {
    return api.get(`/timesheet/tasks/${encodeURIComponent(taskId)}/entries`);
  },

  getToday() {
    return api.get('/timesheet/today');
  },

  getWeekly(userId = null, date = null, filters = {}) {
    const params = new URLSearchParams();
    if (userId) params.set('user_id', userId);
    if (date) params.set('date', date);
    if (filters.status && filters.status !== 'ALL') params.set('status', filters.status);
    if (filters.time_filter && filters.time_filter !== 'ALL') params.set('time_filter', filters.time_filter);
    if (filters.search && filters.search.trim()) params.set('search', filters.search.trim());
    const qs = params.toString();
    return api.get(`/timesheet/weekly${qs ? `?${qs}` : ''}`);
  },

  getMonthly(userId = null) {
    return api.get(`/timesheet/monthly${userId ? `?user_id=${encodeURIComponent(userId)}` : ''}`);
  },

  getTaskTime(userId = null) {
    return api.get(`/timesheet/task-time${userId ? `?user_id=${encodeURIComponent(userId)}` : ''}`);
  },

  createEntry(payload) {
    return api.post('/timesheet/time-entries', payload);
  },

  updateEntry(id, payload) {
    return api.patch(`/timesheet/time-entries/${id}`, payload);
  },

  deleteEntry(id) {
    return api.delete(`/timesheet/time-entries/${id}`);
  },

  getInternReport(userId = null) {
    return api.get(`/timesheet/intern-report${userId ? `?user_id=${encodeURIComponent(userId)}` : ''}`);
  },

  getManagerReport() {
    return api.get('/timesheet/manager-report');
  },

  getUserReport(userId, { period = 'day', date, startDate, endDate } = {}) {
    const params = new URLSearchParams({ period });
    if (date) params.set('date', date);
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    return api.get(`/users/${encodeURIComponent(userId)}/timesheet/report?${params.toString()}`);
  },

  getManagerReview(filters = {}) {
    const params = new URLSearchParams();
    if (filters.date) params.set('date', filters.date);
    if (filters.search) params.set('search', filters.search);
    if (filters.cohort_id && filters.cohort_id !== 'ALL') params.set('cohort_id', filters.cohort_id);
    if (filters.project_id && filters.project_id !== 'ALL') params.set('project_id', filters.project_id);
    if (filters.page) params.set('page', String(filters.page));
    if (filters.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();
    return api.get(`/timesheet/review${qs ? `?${qs}` : ''}`);
  },

  // Time Correction Request APIs
  requestTimeCorrection(payload) {
    return api.post('/timesheet/corrections/request', payload);
  },

  getTimeCorrections(filters = {}) {
    const params = new URLSearchParams();
    if (filters.status && filters.status !== 'ALL') params.set('status', filters.status);
    if (filters.user_id) params.set('user_id', filters.user_id);
    const qs = params.toString();
    return api.get(`/timesheet/corrections${qs ? `?${qs}` : ''}`);
  },

  reviewTimeCorrection(requestId, payload) {
    return api.post(`/timesheet/corrections/${encodeURIComponent(requestId)}/review`, payload);
  },
};
