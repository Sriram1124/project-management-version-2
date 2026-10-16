import api from './api';

export const formsService = {
  getForms: async () => {
    const res = await api.get('/forms');
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

  downloadOverdueReport: async (cohortId, defaultFilename = 'Overdue_Members_Report.csv', formId) => {
    const q = new URLSearchParams();
    if (cohortId && cohortId !== 'ALL') q.set('cohort_id', cohortId);
    if (formId) q.set('form_id', formId);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return await api.downloadFile(`/forms/overdue/export${qs}`, defaultFilename);
  }
};
