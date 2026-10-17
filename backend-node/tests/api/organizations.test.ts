import request from 'supertest';
import app from '../../src/app';
import { mockPrisma } from '../mocks/prisma.mock';
import { setupAuthUser } from '../helpers/auth.helper';

describe('Organizations API (/api/organizations)', () => {
  const mockOrg = {
    id: 'org-test-1',
    name: 'Acme Technologies',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    _count: { users: 10, projects: 4, work_items: 2, forms: 1 },
    users: [
      {
        id: 'u-mgr-1',
        name: 'Manager Alice',
        email: 'alice@acme.com',
        user_code: 'MGR-1001',
        is_active: true,
        created_at: new Date(),
        roles: [{ role: { name: 'MANAGER' } }],
      },
    ],
  };

  it('should require authentication for all organization routes', async () => {
    const res = await request(app).get('/api/organizations');
    expect(res.status).toBe(401);
  });

  it('should forbid non-SUPER_ADMIN users (e.g. MANAGER)', async () => {
    const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });

    const res = await request(app).get('/api/organizations').set('Authorization', authHeader);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Forbidden');
  });

  describe('Super Admin Operations', () => {
    describe('GET /api/organizations/platform-overview', () => {
      it('should return platform overview metrics', async () => {
        const { authHeader } = setupAuthUser({ role: 'SUPER_ADMIN', organization_id: null });
        mockPrisma.organization.count.mockResolvedValueOnce(5);
        mockPrisma.user.count.mockResolvedValueOnce(50);
        mockPrisma.project.count.mockResolvedValueOnce(12);

        const res = await request(app)
          .get('/api/organizations/platform-overview')
          .set('Authorization', authHeader);

        expect(res.status).toBe(200);
        expect(res.body).toBeDefined();
      });
    });

    describe('GET /api/organizations/audit-logs', () => {
      it('should list platform audit logs', async () => {
        const { authHeader } = setupAuthUser({ role: 'SUPER_ADMIN', organization_id: null });
        mockPrisma.auditLog.findMany.mockResolvedValueOnce([
          {
            id: 'audit-1',
            action: 'USER_CREATED',
            created_at: new Date(),
            user: { name: 'Admin' },
          },
        ]);
        mockPrisma.auditLog.count.mockResolvedValueOnce(1);

        const res = await request(app).get('/api/organizations/audit-logs').set('Authorization', authHeader);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('logs');
      });
    });

    describe('GET /api/organizations (list)', () => {
      it('should list all organizations with pagination', async () => {
        const { authHeader } = setupAuthUser({ role: 'SUPER_ADMIN', organization_id: null });
        mockPrisma.organization.findMany.mockResolvedValueOnce([mockOrg]);
        mockPrisma.organization.count.mockResolvedValueOnce(1);

        const res = await request(app).get('/api/organizations').set('Authorization', authHeader);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('organizations');
        expect(Array.isArray(res.body.organizations)).toBe(true);
      });
    });

    describe('POST /api/organizations', () => {
      it('should return 400 if organization name is missing', async () => {
        const { authHeader } = setupAuthUser({ role: 'SUPER_ADMIN', organization_id: null });

        const res = await request(app)
          .post('/api/organizations')
          .set('Authorization', authHeader)
          .send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Organization name is required');
      });

      it('should create organization with manager atomically', async () => {
        const { authHeader } = setupAuthUser({ role: 'SUPER_ADMIN', organization_id: null });
        mockPrisma.organization.findFirst.mockResolvedValueOnce(null);
        mockPrisma.user.findUnique.mockResolvedValueOnce(null);
        mockPrisma.role.findUnique.mockResolvedValueOnce({ id: 'r-mgr', name: 'MANAGER' });
        mockPrisma.organization.create.mockResolvedValueOnce(mockOrg);
        mockPrisma.user.create.mockResolvedValueOnce({
          id: 'mgr-new',
          name: 'Manager Bob',
          email: 'bob@acme.com',
          user_code: 'MGR-1002',
          must_change_password: true,
          roles: [{ role: { name: 'MANAGER' } }],
        });

        const res = await request(app)
          .post('/api/organizations')
          .set('Authorization', authHeader)
          .send({
            name: 'Acme Technologies',
            managerName: 'Manager Bob',
            managerEmail: 'bob@acme.com',
          });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('organization');
        expect(res.body).toHaveProperty('manager');
      });
    });

    describe('GET /api/organizations/:id', () => {
      it('should return 404 for non-existent organization', async () => {
        const { authHeader } = setupAuthUser({ role: 'SUPER_ADMIN', organization_id: null });
        mockPrisma.organization.findUnique.mockResolvedValueOnce(null);

        const res = await request(app).get('/api/organizations/org-none').set('Authorization', authHeader);

        expect(res.status).toBe(404);
      });

      it('should return organization details by ID', async () => {
        const { authHeader } = setupAuthUser({ role: 'SUPER_ADMIN', organization_id: null });
        mockPrisma.organization.findUnique.mockResolvedValueOnce(mockOrg);

        const res = await request(app).get('/api/organizations/org-test-1').set('Authorization', authHeader);

        expect(res.status).toBe(200);
        expect(res.body.organization.id).toBe('org-test-1');
      });
    });

    describe('PATCH /api/organizations/:id', () => {
      it('should update organization name', async () => {
        const { authHeader } = setupAuthUser({ role: 'SUPER_ADMIN', organization_id: null });
        mockPrisma.organization.findUnique.mockResolvedValueOnce(mockOrg);
        mockPrisma.organization.update.mockResolvedValueOnce({
          ...mockOrg,
          name: 'Acme International',
        });

        const res = await request(app)
          .patch('/api/organizations/org-test-1')
          .set('Authorization', authHeader)
          .send({ name: 'Acme International' });

        expect(res.status).toBe(200);
        expect(res.body.organization.name).toBe('Acme International');
      });
    });

    describe('POST /api/organizations/:id/toggle-status', () => {
      it('should toggle organization active status', async () => {
        const { authHeader } = setupAuthUser({ role: 'SUPER_ADMIN', organization_id: null });
        mockPrisma.organization.findUnique.mockResolvedValueOnce(mockOrg);
        mockPrisma.organization.update.mockResolvedValueOnce({
          ...mockOrg,
          is_active: false,
        });

        const res = await request(app)
          .post('/api/organizations/org-test-1/toggle-status')
          .set('Authorization', authHeader)
          .send({ is_active: false, reason: 'Payment pending' });

        expect(res.status).toBe(200);
        expect(res.body.organization.is_active).toBe(false);
      });
    });

    describe('POST /api/organizations/:id/managers', () => {
      it('should provision additional manager to organization', async () => {
        const { authHeader } = setupAuthUser({ role: 'SUPER_ADMIN', organization_id: null });
        mockPrisma.organization.findUnique.mockResolvedValueOnce(mockOrg);
        mockPrisma.user.findUnique.mockResolvedValueOnce(null);
        mockPrisma.role.findUnique.mockResolvedValueOnce({ id: 'r-mgr', name: 'MANAGER' });
        mockPrisma.user.create.mockResolvedValueOnce({
          id: 'mgr-2',
          name: 'Manager Carol',
          email: 'carol@acme.com',
          user_code: 'MGR-1003',
          must_change_password: true,
          roles: [{ role: { name: 'MANAGER' } }],
        });

        const res = await request(app)
          .post('/api/organizations/org-test-1/managers')
          .set('Authorization', authHeader)
          .send({
            managerName: 'Manager Carol',
            managerEmail: 'carol@acme.com',
          });

        expect(res.status).toBe(201);
        expect(res.body.manager.name).toBe('Manager Carol');
      });
    });

    describe('POST /api/organizations/:id/managers/:managerId/reset-password', () => {
      it('should reset manager password', async () => {
        const { authHeader } = setupAuthUser({ role: 'SUPER_ADMIN', organization_id: null });
        mockPrisma.organization.findUnique.mockResolvedValueOnce(mockOrg);
        mockPrisma.user.findUnique.mockResolvedValueOnce({
          id: 'mgr-2',
          name: 'Manager Carol',
          email: 'carol@acme.com',
          organization_id: 'org-test-1',
          roles: [{ role: { name: 'MANAGER' } }],
        });
        mockPrisma.user.update.mockResolvedValueOnce({
          id: 'mgr-2',
          must_change_password: true,
        });

        const res = await request(app)
          .post('/api/organizations/org-test-1/managers/mgr-2/reset-password')
          .set('Authorization', authHeader);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('temporary_password');
      });
    });

    describe('Bulk Managers: template, validate-csv, bulk', () => {
      it('GET /api/organizations/:id/managers/template should return CSV template', async () => {
        const { authHeader } = setupAuthUser({ role: 'SUPER_ADMIN', organization_id: null });

        const res = await request(app)
          .get('/api/organizations/org-test-1/managers/template')
          .set('Authorization', authHeader);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/csv');
      });

      it('POST /api/organizations/:id/managers/validate-csv should validate CSV content', async () => {
        const { authHeader } = setupAuthUser({ role: 'SUPER_ADMIN', organization_id: null });
        mockPrisma.organization.findUnique.mockResolvedValueOnce(mockOrg);
        mockPrisma.user.findMany.mockResolvedValueOnce([]);

        const res = await request(app)
          .post('/api/organizations/org-test-1/managers/validate-csv')
          .set('Authorization', authHeader)
          .send({ csvText: 'name,email\nJohn Doe,john@acme.com' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('validRows');
      });

      it('POST /api/organizations/:id/managers/bulk should import managers', async () => {
        const { authHeader } = setupAuthUser({ role: 'SUPER_ADMIN', organization_id: null });
        mockPrisma.organization.findUnique.mockResolvedValueOnce(mockOrg);
        mockPrisma.user.findMany.mockResolvedValueOnce([]);
        mockPrisma.user.findUnique.mockResolvedValueOnce(null);
        mockPrisma.role.findUnique.mockResolvedValueOnce({ id: 'r-mgr', name: 'MANAGER' });
        mockPrisma.user.create.mockResolvedValueOnce({
          id: 'mgr-bulk-1',
          name: 'John Doe',
          email: 'john@acme.com',
          user_code: 'MGR-1004',
        });

        const res = await request(app)
          .post('/api/organizations/org-test-1/managers/bulk')
          .set('Authorization', authHeader)
          .send({
            rows: [{ name: 'John Doe', email: 'john@acme.com' }],
          });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('summary');
      });
    });
  });
});
