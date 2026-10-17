import api from './api';

export const timesheetService = {
  getPolicy() {
    return api.get('/timesheet/organization-policy');
  },

  updatePolicy(payload) {
    return api.put('/timesheet/organization-policy', payload);
  },

  startSession(payload = {}) {
    return api.post('/timesheet/work-sessions/start', payload);
  },

  endSession(payload = {}) {
    return api.post('/timesheet/work-sessions/end', payload);
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

  getWeekly(userId = null, date = null) {
    const params = new URLSearchParams();
    if (userId) params.set('user_id', userId);
    if (date) params.set('date', date);
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
};
