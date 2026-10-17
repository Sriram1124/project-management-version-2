import request from 'supertest';
import app from '../../src/app';
import { mockPrisma } from '../mocks/prisma.mock';
import { setupAuthUser } from '../helpers/auth.helper';

describe('Users API (/api/users)', () => {
  const mockIntern = {
    id: 'user-intern-1',
    name: 'Alice Intern',
    email: 'alice@example.com',
    user_code: 'INT001',
    batch: '2026',
    subbatch: 'A',
    organization_id: 'org-test-1',
    is_active: true,
    must_change_password: true,
    created_at: new Date(),
    updated_at: new Date(),
    cohort: { id: 'c-1', name: 'Cohort 1', code: 'C1' },
    roles: [{ role: { name: 'INTERN' } }],
  };

  it('should reject unauthenticated requests', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  describe('GET /api/users', () => {
    it('should forbid intern without USER_READ permission', async () => {
      const { authHeader } = setupAuthUser({ role: 'INTERN', permissions: [] });
      const res = await request(app).get('/api/users').set('Authorization', authHeader);
      expect(res.status).toBe(403);
    });

    it('should list organization users for authorized manager', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', permissions: ['USER_READ'] });
      mockPrisma.user.findMany.mockResolvedValueOnce([mockIntern]);

      const res = await request(app)
        .get('/api/users?type=INTERN&search=Alice')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('users');
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(res.body.users[0].name).toBe('Alice Intern');
    });
  });

  describe('POST /api/users', () => {
    it('should forbid non-managers from creating users', async () => {
      const { authHeader } = setupAuthUser({ role: 'INTERN' });
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', authHeader)
        .send({ name: 'Bob', email: 'bob@example.com' });

      expect(res.status).toBe(403);
    });

    it('should reject provisioning if organization_id does not match manager context', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });

      const res = await request(app)
        .post('/api/users')
        .set('Authorization', authHeader)
        .send({
          name: 'Bob',
          email: 'bob@example.com',
          organization_id: 'org-DIFFERENT',
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('organization_id does not match');
    });

    it('should reject provisioning if client attempts to supply a password or user_code', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });

      const res = await request(app)
        .post('/api/users')
        .set('Authorization', authHeader)
        .send({
          name: 'Bob',
          email: 'bob@example.com',
          password: 'injected-password',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('passwords cannot be provided during provisioning');
    });

    it('should provision user successfully and return temporary credentials', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });
      mockPrisma.organization.findUnique.mockResolvedValueOnce({ id: 'org-test-1', is_active: true });
      mockPrisma.cohort.findFirst.mockResolvedValueOnce(null);
      mockPrisma.user.findUnique.mockResolvedValueOnce(null); // email not taken
      mockPrisma.role.findUnique.mockResolvedValueOnce({ id: 'role-intern', name: 'INTERN' });
      mockPrisma.user.findFirst.mockResolvedValueOnce(null); // user code collision check
      mockPrisma.user.create.mockResolvedValueOnce(mockIntern);
      mockPrisma.userRole.create.mockResolvedValueOnce({ id: 'ur-1' });

      const res = await request(app)
        .post('/api/users')
        .set('Authorization', authHeader)
        .send({
          name: 'Alice Intern',
          email: 'alice@example.com',
          type: 'INTERN',
          batch: '2026',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('user');
      expect(res.body).toHaveProperty('temporary_password');
    });
  });

  describe('GET /api/users/bulk/template', () => {
    it('should return downloadable CSV template for manager', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER' });
      mockPrisma.cohort.findMany.mockResolvedValueOnce([{ code: 'S26' }]);

      const res = await request(app).get('/api/users/bulk/template').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('name,email,type,batch,subbatch');
    });
  });

  describe('POST /api/users/bulk/validate', () => {
    it('should return 400 when no CSV content is provided', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER' });

      const res = await request(app).post('/api/users/bulk/validate').set('Authorization', authHeader).send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No CSV file or content provided');
    });

    it('should validate CSV preview successfully', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });
      mockPrisma.user.findMany.mockResolvedValueOnce([]); // no existing collisions

      const csv = 'name,email,type,batch,subbatch\nDave User,dave@example.com,INTERN,2026,A';

      const res = await request(app)
        .post('/api/users/bulk/validate')
        .set('Authorization', authHeader)
        .send({ csv });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('validRows');
      expect(res.body).toHaveProperty('toCreateRows');
    });
  });

  describe('POST /api/users/bulk', () => {
    it('should reject bulk import if any row tries to inject organization_id', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });

      const res = await request(app)
        .post('/api/users/bulk')
        .set('Authorization', authHeader)
        .send({
          rows: [{ name: 'Injected', email: 'inj@test.com', organization_id: 'org-other' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.reason).toContain('organization_id cannot be supplied in rows');
    });

    it('should process bulk import and return summary', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });
      mockPrisma.role.findUnique
        .mockResolvedValueOnce({ id: 'role-intern', name: 'INTERN' })
        .mockResolvedValueOnce({ id: 'role-employee', name: 'EMPLOYEE' });
      mockPrisma.cohort.findMany.mockResolvedValueOnce([]);
      mockPrisma.user.findMany
        .mockResolvedValueOnce([]) // existing collisions
        .mockResolvedValueOnce([]); // existingOrgUsers
      mockPrisma.user.findFirst.mockResolvedValueOnce(null); // candidate user code check
      mockPrisma.user.createMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.userRole.createMany.mockResolvedValueOnce({ count: 1 });

      const res = await request(app)
        .post('/api/users/bulk')
        .set('Authorization', authHeader)
        .send({
          rows: [
            {
              name: 'Alice Intern',
              email: 'alice@example.com',
              type: 'INTERN',
              batch: '2026',
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('summary');
      expect(res.body.summary.created).toBe(1);
    });
  });

  describe('PATCH /api/users/profile', () => {
    it('should update authenticated user own profile', async () => {
      const { authHeader } = setupAuthUser({ id: 'user-self' });
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-self',
        name: 'Original Name',
        is_active: true,
        roles: [{ role: { name: 'INTERN' } }],
      });
      mockPrisma.user.update.mockResolvedValueOnce({
        id: 'user-self',
        name: 'Updated Name',
        email: 'self@example.com',
        batch: '2026-B',
        is_active: true,
        roles: [{ role: { name: 'INTERN' } }],
      });

      const res = await request(app)
        .patch('/api/users/profile')
        .set('Authorization', authHeader)
        .send({ name: 'Updated Name', batch: '2026-B' });

      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Updated Name');
    });
  });

  describe('POST /api/users/:id/reset-password', () => {
    it('should allow manager to reset user password', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });
      mockPrisma.user.findUnique.mockResolvedValueOnce(mockIntern);
      mockPrisma.user.update.mockResolvedValueOnce({
        ...mockIntern,
        must_change_password: true,
      });
      mockPrisma.userSession.deleteMany.mockResolvedValueOnce({ count: 1 });

      const res = await request(app)
        .post('/api/users/user-intern-1/reset-password')
        .set('Authorization', authHeader)
        .send({ new_password: 'NewStrongPassword123!' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Password reset successfully');
    });

    it('should return 400 if custom password is too short', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });

      const res = await request(app)
        .post('/api/users/user-intern-1/reset-password')
        .set('Authorization', authHeader)
        .send({ new_password: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('at least 8 characters');
    });
  });

  describe('POST /api/users/:id/deactivate', () => {
    it('should soft-deactivate organization user and revoke sessions', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });
      mockPrisma.user.findUnique.mockResolvedValueOnce(mockIntern);
      mockPrisma.user.update.mockResolvedValueOnce({
        ...mockIntern,
        is_active: false,
      });
      mockPrisma.userSession.deleteMany.mockResolvedValueOnce({ count: 2 });

      const res = await request(app)
        .post('/api/users/user-intern-1/deactivate')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deactivated successfully');
    });
  });

  describe('PATCH /api/users/:id', () => {
    it('should reject attempts to modify forbidden fields like email or role', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });

      const res = await request(app)
        .patch('/api/users/user-intern-1')
        .set('Authorization', authHeader)
        .send({ email: 'hacked@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Security violation');
    });

    it('should update permitted member details like batch and subbatch', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });
      mockPrisma.user.findUnique.mockResolvedValueOnce(mockIntern);
      mockPrisma.user.update.mockResolvedValueOnce({
        ...mockIntern,
        batch: '2026-Batch2',
        subbatch: 'B',
      });

      const res = await request(app)
        .patch('/api/users/user-intern-1')
        .set('Authorization', authHeader)
        .send({ batch: '2026-Batch2', subbatch: 'B' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Intern details updated successfully');
    });
  });
});
