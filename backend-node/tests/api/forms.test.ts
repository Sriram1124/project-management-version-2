import request from 'supertest';
import app from '../../src/app';
import { mockPrisma } from '../mocks/prisma.mock';
import { setupAuthUser } from '../helpers/auth.helper';

describe('Forms API (/api/forms)', () => {
  const mockForm = {
    id: 'form-1',
    organization_id: 'org-test-1',
    creator_id: 'user-manager',
    title: 'Weekly Standup Feedback',
    description: 'Provide weekly summary',
    status: 'DRAFT',
    target_roles: ['INTERN'],
    deadline: new Date(Date.now() - 86400000),
    created_at: new Date(),
    updated_at: new Date(),
    creator: { id: 'user-manager', name: 'Manager Bob', email: 'bob@example.com' },
    submissions: [],
    questions: [
      {
        id: 'q-1',
        form_id: 'form-1',
        text: 'What did you accomplish?',
        type: 'SHORT_TEXT',
        is_required: true,
        order_index: 0,
      },
    ],
  };

  it('should require authentication for all form routes', async () => {
    const res = await request(app).get('/api/forms');
    expect(res.status).toBe(401);
  });

  describe('GET /api/forms', () => {
    it('should list forms for user organization', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });
      mockPrisma.form.findMany.mockResolvedValueOnce([mockForm]);

      const res = await request(app).get('/api/forms').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('forms');
      expect(Array.isArray(res.body.forms)).toBe(true);
    });
  });

  describe('POST /api/forms', () => {
    it('should forbid intern without FORM_CREATE permission', async () => {
      const { authHeader } = setupAuthUser({ role: 'INTERN' });

      const res = await request(app)
        .post('/api/forms')
        .set('Authorization', authHeader)
        .send({ title: 'New Form' });

      expect(res.status).toBe(403);
    });

    it('should create form for manager with permissions', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', permissions: ['FORM_CREATE'] });
      mockPrisma.form.create.mockResolvedValueOnce(mockForm);

      const res = await request(app)
        .post('/api/forms')
        .set('Authorization', authHeader)
        .send({
          title: 'Weekly Standup Feedback',
          target_roles: ['INTERN'],
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('form-1');
      expect(res.body.title).toBe('Weekly Standup Feedback');
    });
  });

  describe('GET /api/forms/:id', () => {
    it('should return 404 if form not found', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });
      mockPrisma.form.findFirst.mockResolvedValueOnce(null);

      const res = await request(app).get('/api/forms/form-nonexistent').set('Authorization', authHeader);

      expect(res.status).toBe(404);
    });

    it('should return form by ID', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });
      mockPrisma.form.findFirst.mockResolvedValueOnce(mockForm);

      const res = await request(app).get('/api/forms/form-1').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('form-1');
    });
  });

  describe('PATCH /api/forms/:id', () => {
    it('should update form details', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', permissions: ['FORM_UPDATE'] });
      mockPrisma.form.findUnique.mockResolvedValueOnce(mockForm);
      mockPrisma.form.update.mockResolvedValueOnce({
        ...mockForm,
        title: 'Updated Form Title',
      });

      const res = await request(app)
        .patch('/api/forms/form-1')
        .set('Authorization', authHeader)
        .send({ title: 'Updated Form Title' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated Form Title');
    });
  });

  describe('POST /api/forms/:id/publish and /archive', () => {
    it('should publish form', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', permissions: ['FORM_UPDATE'] });
      mockPrisma.form.findUnique.mockResolvedValueOnce(mockForm);
      mockPrisma.form.update.mockResolvedValueOnce({ ...mockForm, status: 'PUBLISHED' });

      const res = await request(app).post('/api/forms/form-1/publish').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('PUBLISHED');
    });

    it('should archive form', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', permissions: ['FORM_UPDATE'] });
      mockPrisma.form.findUnique.mockResolvedValueOnce(mockForm);
      mockPrisma.form.update.mockResolvedValueOnce({ ...mockForm, status: 'ARCHIVED' });

      const res = await request(app).post('/api/forms/form-1/archive').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ARCHIVED');
    });
  });

  describe('Questions: POST, PATCH, DELETE', () => {
    it('POST /api/forms/:id/questions should add question', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', permissions: ['FORM_UPDATE'] });
      mockPrisma.form.findUnique.mockResolvedValueOnce({ ...mockForm, status: 'DRAFT' });
      mockPrisma.formQuestion.create.mockResolvedValueOnce({
        id: 'q-new',
        form_id: 'form-1',
        title: 'New Question',
        question_type: 'TEXT',
      });

      const res = await request(app)
        .post('/api/forms/form-1/questions')
        .set('Authorization', authHeader)
        .send({
          title: 'New Question',
          question_type: 'TEXT',
          is_required: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('q-new');
    });

    it('PATCH /api/forms/:id/questions/:questionId should update question', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', permissions: ['FORM_UPDATE'] });
      mockPrisma.formQuestion.findUnique.mockResolvedValueOnce({
        id: 'q-1',
        form: { status: 'DRAFT' },
      });
      mockPrisma.formQuestion.update.mockResolvedValueOnce({
        id: 'q-1',
        title: 'Updated Question Title',
      });

      const res = await request(app)
        .patch('/api/forms/form-1/questions/q-1')
        .set('Authorization', authHeader)
        .send({ title: 'Updated Question Title' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated Question Title');
    });

    it('DELETE /api/forms/:id/questions/:questionId should delete question', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', permissions: ['FORM_UPDATE'] });
      mockPrisma.formQuestion.findUnique.mockResolvedValueOnce({
        id: 'q-1',
        form: { status: 'DRAFT' },
      });
      mockPrisma.formQuestion.delete.mockResolvedValueOnce({ id: 'q-1' });

      const res = await request(app)
        .delete('/api/forms/form-1/questions/q-1')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Submissions: POST, GET /my, GET /submissions', () => {
    it('POST /api/forms/:id/submissions should submit responses', async () => {
      const { authHeader } = setupAuthUser({ id: 'u-sub', role: 'INTERN' });
      mockPrisma.form.findUnique.mockResolvedValueOnce({
        ...mockForm,
        status: 'PUBLISHED',
        questions: [{ id: 'q-1', is_required: true }],
      });
      mockPrisma.formSubmission.findFirst.mockResolvedValueOnce(null); // not already submitted
      mockPrisma.formSubmission.create.mockResolvedValueOnce({
        id: 'sub-1',
        form_id: 'form-1',
        user_id: 'u-sub',
        status: 'SUBMITTED',
      });

      const res = await request(app)
        .post('/api/forms/form-1/submissions')
        .set('Authorization', authHeader)
        .send({
          answers: [{ question_id: 'q-1', answer: 'Done with feature' }],
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('sub-1');
    });

    it('GET /api/forms/:id/submissions/my should return user own submission', async () => {
      const { authHeader } = setupAuthUser({ id: 'u-sub', role: 'INTERN' });
      mockPrisma.form.findUnique.mockResolvedValueOnce(mockForm);
      mockPrisma.formSubmission.findFirst.mockResolvedValueOnce({
        id: 'sub-1',
        form_id: 'form-1',
        user_id: 'u-sub',
      });

      const res = await request(app)
        .get('/api/forms/form-1/submissions/my')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.submission).toHaveProperty('id', 'sub-1');
    });

    it('GET /api/forms/:id/submissions should list all submissions for manager', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', permissions: ['FORM_READ'] });
      mockPrisma.form.findUnique.mockResolvedValueOnce(mockForm);
      mockPrisma.formSubmission.findMany.mockResolvedValueOnce([
        { id: 'sub-1', form_id: 'form-1', user: { name: 'Alice' } },
      ]);

      const res = await request(app)
        .get('/api/forms/form-1/submissions')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('submissions');
      expect(Array.isArray(res.body.submissions)).toBe(true);
    });
  });

  describe('Overdue Reporting & Form Deletion', () => {
    it('GET /api/forms/overdue/summary should return overdue stats', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', permissions: ['FORM_READ'] });
      mockPrisma.organizationWorkPolicy.findUnique.mockResolvedValueOnce({ timezone: 'Asia/Kolkata' });
      mockPrisma.form.findMany.mockResolvedValueOnce([mockForm]);
      mockPrisma.user.findMany.mockResolvedValueOnce([]);

      const res = await request(app).get('/api/forms/overdue/summary').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('summary');
      expect(res.body).toHaveProperty('details');
    });

    it('GET /api/forms/overdue/export should return CSV attachment', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', permissions: ['FORM_READ'] });
      mockPrisma.organizationWorkPolicy.findUnique.mockResolvedValueOnce({ timezone: 'Asia/Kolkata' });
      mockPrisma.form.findMany.mockResolvedValueOnce([mockForm]);
      mockPrisma.user.findMany.mockResolvedValueOnce([]);

      const res = await request(app).get('/api/forms/overdue/export').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment');
    });

    it('DELETE /api/forms/:id should delete form', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', permissions: ['FORM_DELETE'] });
      mockPrisma.form.findUnique.mockResolvedValueOnce(mockForm);
      mockPrisma.form.delete.mockResolvedValueOnce(mockForm);

      const res = await request(app).delete('/api/forms/form-1').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
