import api from './api';

export function formatFormDeadline(deadline, timeZone = 'Asia/Kolkata') {
  if (!deadline) return 'No deadline';
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return 'No deadline';

  const formatted = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  }).format(d);

  return formatted.replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
}

export const formsService = {
  formatDeadline: formatFormDeadline,
  getForms: async (cohortId) => {
    const params = cohortId && cohortId !== 'ALL' ? `?cohort_id=${encodeURIComponent(cohortId)}` : '';
    const res = await api.get(`/forms${params}`);
    return (res.forms || []).map(f => ({
      ...f,
      submission_status: f.submissions?.length > 0 ? 'SUBMITTED' : 'PENDING',
      submitted_at: f.submissions?.[0]?.created_at || null
    }));
  },

  getFormById: async (id) => {
    const res = await api.get(`/forms/${id}`);
    return res.form;
  },

  createForm: async (data) => {
    const res = await api.post('/forms', data);
    return res.form;
  },

  updateForm: async (id, data) => {
    const res = await api.patch(`/forms/${id}`, data);
    return res.form;
  },

  publishForm: async (id) => {
    const res = await api.post(`/forms/${id}/publish`);
    return res.form;
  },

  revertForm: async (id) => {
    try {
      const res = await api.post(`/forms/${id}/revert`);
      return res.form || res;
    } catch (e) {
      const res = await api.patch(`/forms/${id}`, { status: 'DRAFT' });
      return res.form || res;
    }
  },

  archiveForm: async (id) => {
    const res = await api.post(`/forms/${id}/archive`);
    return res.form;
  },

  addQuestion: async (formId, data) => {
    const res = await api.post(`/forms/${formId}/questions`, data);
    return res.question;
  },

  updateQuestion: async (formId, questionId, data) => {
    const res = await api.patch(`/forms/${formId}/questions/${questionId}`, data);
    return res.question;
  },

  deleteQuestion: async (formId, questionId) => {
    await api.delete(`/forms/${formId}/questions/${questionId}`);
  },

  submitForm: async (formId, answers) => {
    const res = await api.post(`/forms/${formId}/submissions`, { answers });
    return res.submission;
  },

  getSubmissions: async (formId) => {
    const res = await api.get(`/forms/${formId}/submissions`);
    return res.submissions;
  },
  
  getMySubmission: async (formId) => {
    const res = await api.get(`/forms/${formId}/submissions/my`);
    return res.submission;
  },

  isOverdue: (form) => {
    if (!form.deadline) return false;
    return new Date(form.deadline) < new Date() && form.status !== 'SUBMITTED';
  },

  getOverdueSummary: async (cohortId, formId) => {
    const q = new URLSearchParams();
    if (cohortId && cohortId !== 'ALL') q.set('cohort_id', cohortId);
    if (formId) q.set('form_id', formId);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return await api.get(`/forms/overdue/summary${qs}`);
  },

  downloadOverdueReport: async (cohortId, defaultFilename = 'overdue_forms.xlsx', formId, format) => {
    const q = new URLSearchParams();
    if (cohortId && cohortId !== 'ALL') q.set('cohort_id', cohortId);
    if (formId) q.set('form_id', formId);
    if (format === 'csv' || (defaultFilename && defaultFilename.toLowerCase().endsWith('.csv'))) {
      q.set('format', 'csv');
    }
    const qs = q.toString() ? `?${q.toString()}` : '';
    return await api.downloadFile(`/forms/overdue/export${qs}`, defaultFilename);
  }
};
