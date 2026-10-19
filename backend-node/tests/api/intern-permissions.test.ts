import request from 'supertest';
import app from '../../src/app';
import { mockPrisma } from '../mocks/prisma.mock';
import { setupAuthUser } from '../helpers/auth.helper';

describe('Intern Permissions Management API (/api/users/:id/permissions)', () => {
  const targetIntern = {
    id: 'intern-target-1',
    name: 'Target Intern',
    email: 'target.intern@example.com',
    user_code: 'INT999',
    batch: '2026',
    subbatch: 'A1',
    organization_id: 'org-test-1',
    is_active: true,
    must_change_password: false,
    created_at: new Date(),
    updated_at: new Date(),
    roles: [
      {
        role: {
          id: 'role-intern',
          name: 'INTERN',
          permissions: [
            { permission: { id: 'p-pr', name: 'PROJECT_READ' } },
            { permission: { id: 'p-tr', name: 'TASK_READ' } },
            { permission: { id: 'p-tu', name: 'TASK_UPDATE' } },
            { permission: { id: 'p-fr', name: 'FORM_READ' } },
            { permission: { id: 'p-fs', name: 'FORM_SUBMIT' } },
            { permission: { id: 'p-ar', name: 'ATTENDANCE_READ' } },
            { permission: { id: 'p-ac', name: 'ATTENDANCE_CREATE' } },
          ],
        },
      },
    ],
    user_permissions: [
      {
        id: 'up-1',
        user_id: 'intern-target-1',
        permission_id: 'perm-uc',
        permission: { id: 'perm-uc', name: 'USER_CREATE' },
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/users/:id/permissions', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/users/intern-target-1/permissions');
      expect(res.status).toBe(401);
    });

    it('should reject intern trying to access permissions endpoint with 403', async () => {
      const { authHeader } = setupAuthUser({
        id: 'intern-caller-1',
        role: 'INTERN',
        organization_id: 'org-test-1',
      });

      const res = await request(app)
        .get('/api/users/intern-target-1/permissions')
        .set('Authorization', authHeader);

      expect(res.status).toBe(403);
    });

    it('should reject cross-organization manager with 403', async () => {
      const { authHeader } = setupAuthUser({
        id: 'mgr-other-org',
        role: 'MANAGER',
        organization_id: 'org-DIFFERENT',
      });

      mockPrisma.user.findUnique.mockResolvedValueOnce({
        ...targetIntern,
        organization_id: 'org-test-1',
      });

      const res = await request(app)
        .get('/api/users/intern-target-1/permissions')
        .set('Authorization', authHeader);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });

    it('should load current permissions for authorized manager', async () => {
      const { authHeader } = setupAuthUser({
        id: 'mgr-authorized',
        role: 'MANAGER',
        organization_id: 'org-test-1',
      });

      mockPrisma.user.findUnique.mockResolvedValueOnce(targetIntern);

      const res = await request(app)
        .get('/api/users/intern-target-1/permissions')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('user');
      expect(res.body.user.name).toBe('Target Intern');
      expect(res.body.basePermissions).toContain('PROJECT_READ');
      expect(res.body.basePermissions).toContain('TASK_READ');
      expect(res.body.grantedPermissions).toEqual(['USER_CREATE']);
      expect(res.body.effectivePermissions).toContain('USER_CREATE');
      expect(res.body.effectivePermissions).toContain('PROJECT_READ');
      expect(Array.isArray(res.body.availablePermissions)).toBe(true);
      expect(res.body.availablePermissions.length).toBeGreaterThan(10);
    });
  });

  describe('PUT /api/users/:id/permissions', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app)
        .put('/api/users/intern-target-1/permissions')
        .send({ permissions: ['PROJECT_CREATE'] });
      expect(res.status).toBe(401);
    });

    it('should prevent an intern from granting themselves permissions', async () => {
      const { authHeader } = setupAuthUser({
        id: 'intern-target-1',
        role: 'INTERN',
        organization_id: 'org-test-1',
      });

      const res = await request(app)
        .put('/api/users/intern-target-1/permissions')
        .set('Authorization', authHeader)
        .send({ permissions: ['PROJECT_CREATE'] });

      expect(res.status).toBe(403);
    });

    it('should prevent manager from modifying own permissions', async () => {
      const { authHeader } = setupAuthUser({
        id: 'mgr-self',
        role: 'MANAGER',
        organization_id: 'org-test-1',
      });

      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'mgr-self',
        organization_id: 'org-test-1',
        roles: [{ role: { name: 'MANAGER' } }],
      });

      const res = await request(app)
        .put('/api/users/mgr-self/permissions')
        .set('Authorization', authHeader)
        .send({ permissions: ['PROJECT_CREATE'] });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('cannot modify their own permissions');
    });

    it('should grant delegable manager permissions and persist them', async () => {
      const { authHeader } = setupAuthUser({
        id: 'mgr-authorized',
        role: 'MANAGER',
        organization_id: 'org-test-1',
      });

      mockPrisma.user.findUnique
        .mockResolvedValueOnce(targetIntern) // Target check
        .mockResolvedValueOnce({
          ...targetIntern,
          user_permissions: [
            { permission: { id: 'p-pc', name: 'PROJECT_CREATE' } },
            { permission: { id: 'p-er', name: 'EVALUATION_READ' } },
          ],
        }); // Re-fetch in return

      mockPrisma.permission.findMany.mockResolvedValueOnce([
        { id: 'perm-pc', name: 'PROJECT_CREATE' },
        { id: 'perm-er', name: 'EVALUATION_READ' },
      ]);

      const res = await request(app)
        .put('/api/users/intern-target-1/permissions')
        .set('Authorization', authHeader)
        .send({ permissions: ['PROJECT_CREATE', 'EVALUATION_READ'] });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Permissions updated successfully');
      expect(mockPrisma.userPermission.deleteMany).toHaveBeenCalledWith({
        where: { user_id: 'intern-target-1' },
      });
      expect(mockPrisma.userPermission.createMany).toHaveBeenCalledWith({
        data: [
          { user_id: 'intern-target-1', permission_id: 'perm-pc' },
          { user_id: 'intern-target-1', permission_id: 'perm-er' },
        ],
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'USER_PERMISSIONS_UPDATE',
            target_id: 'intern-target-1',
          }),
        })
      );
    });

    it('should allow revoking permissions by supplying an empty or reduced list', async () => {
      const { authHeader } = setupAuthUser({
        id: 'mgr-authorized',
        role: 'MANAGER',
        organization_id: 'org-test-1',
      });

      mockPrisma.user.findUnique
        .mockResolvedValueOnce(targetIntern)
        .mockResolvedValueOnce({ ...targetIntern, user_permissions: [] });

      mockPrisma.permission.findMany.mockResolvedValueOnce([]);

      const res = await request(app)
        .put('/api/users/intern-target-1/permissions')
        .set('Authorization', authHeader)
        .send({ permissions: [] });

      expect(res.status).toBe(200);
      expect(mockPrisma.userPermission.deleteMany).toHaveBeenCalledWith({
        where: { user_id: 'intern-target-1' },
      });
      expect(mockPrisma.userPermission.createMany).not.toHaveBeenCalled();
    });
  });

  describe('Effective Authorization Verification', () => {
    it('should allow intern with granted USER_CREATE to provision users', async () => {
      const { authHeader } = setupAuthUser({
        id: 'intern-with-create-perm',
        role: 'INTERN',
        organization_id: 'org-test-1',
        direct_permissions: ['USER_CREATE'],
      });

      mockPrisma.role.findUnique.mockResolvedValueOnce({ id: 'role-intern', name: 'INTERN' });
      mockPrisma.user.create.mockResolvedValueOnce({
        id: 'newly-created-intern',
        name: 'Newbie',
        email: 'newbie@example.com',
        user_code: 'INT888',
        organization_id: 'org-test-1',
        type: 'INTERN',
        is_active: true,
        must_change_password: true,
      });

      const res = await request(app)
        .post('/api/users')
        .set('Authorization', authHeader)
        .send({
          name: 'Newbie',
          email: 'newbie@example.com',
          type: 'INTERN',
        });

      expect(res.status).toBe(201);
      expect(res.body.email).toBe('newbie@example.com');
    });

    it('should keep ungranted actions strictly forbidden for intern', async () => {
      const { authHeader } = setupAuthUser({
        id: 'intern-limited',
        role: 'INTERN',
        organization_id: 'org-test-1',
        direct_permissions: ['USER_CREATE'], // Only USER_CREATE, NOT USER_DELETE
      });

      // Attempt to deactivate user (requires USER_DELETE)
      const res = await request(app)
        .post('/api/users/victim-user/deactivate')
        .set('Authorization', authHeader);

      expect(res.status).toBe(403);
    });

    it('should allow intern with granted NOTIFICATION_CREATE to broadcast notifications', async () => {
      const { authHeader } = setupAuthUser({
        id: 'intern-broadcaster',
        role: 'INTERN',
        organization_id: 'org-test-1',
        direct_permissions: ['NOTIFICATION_CREATE'],
      });

      mockPrisma.user.findMany.mockResolvedValueOnce([
        {
          id: 'intern-target-1',
          organization_id: 'org-test-1',
          roles: [{ role: { name: 'INTERN' } }],
        },
      ]);

      mockPrisma.notification.create.mockResolvedValueOnce({
        id: 'notif-1',
        title: 'Team Update',
        message: 'Sprint review tomorrow',
        type: 'BROADCAST',
        created_at: new Date(),
        recipients: [{ id: 'nr-1' }],
        sender: { id: 'intern-broadcaster', name: 'Intern Broadcaster', email: 'b@example.com' },
      });

      const res = await request(app)
        .post('/api/notifications')
        .set('Authorization', authHeader)
        .send({
          title: 'Team Update',
          message: 'Sprint review tomorrow',
          recipient_ids: ['intern-target-1'],
        });

      expect(res.status).toBe(201);
    });

    it('should forbid intern without NOTIFICATION_CREATE from creating notifications', async () => {
      const { authHeader } = setupAuthUser({
        id: 'intern-nobroadcast',
        role: 'INTERN',
        organization_id: 'org-test-1',
        direct_permissions: ['USER_READ'],
      });

      const res = await request(app)
        .post('/api/notifications')
        .set('Authorization', authHeader)
        .send({
          title: 'Team Update',
          message: 'Sprint review tomorrow',
        });

      expect(res.status).toBe(403);
    });

    it('should allow intern with ATTENDANCE_READ to access manager timesheet review', async () => {
      const { authHeader } = setupAuthUser({
        id: 'intern-reviewer',
        role: 'INTERN',
        organization_id: 'org-test-1',
        direct_permissions: ['ATTENDANCE_READ'],
      });

      mockPrisma.organizationWorkPolicy.findMany.mockResolvedValueOnce([]);
      mockPrisma.workSession.findMany.mockResolvedValueOnce([]);
      mockPrisma.user.count.mockResolvedValueOnce(0);
      mockPrisma.user.findMany.mockResolvedValueOnce([]);

      const res = await request(app)
        .get('/api/timesheet/review')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
    });
  });
});

