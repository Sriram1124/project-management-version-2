import request from 'supertest';
import app from '../../src/app';
import { mockPrisma } from '../mocks/prisma.mock';
import { setupAuthUser } from '../helpers/auth.helper';

describe('Multiple Project Owners API & Authorization', () => {
  const managerUser = {
    id: 'user-mgr-primary',
    name: 'Primary Manager',
    email: 'primary.mgr@example.com',
    role: 'MANAGER',
    organization_id: 'org-test-1',
  };

  const coOwnerUser = {
    id: 'user-mgr-secondary',
    name: 'Secondary Manager',
    email: 'secondary.mgr@example.com',
    role: 'MANAGER',
    organization_id: 'org-test-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/projects with Multiple Owners', () => {
    it('should create a project with a single owner', async () => {
      const { authHeader } = setupAuthUser({
        id: managerUser.id,
        role: 'MANAGER',
        organization_id: 'org-test-1',
      });

      mockPrisma.user.findFirst.mockResolvedValueOnce({
        id: managerUser.id,
        name: managerUser.name,
        email: managerUser.email,
        organization_id: 'org-test-1',
      });

      mockPrisma.project.create.mockResolvedValueOnce({
        id: 'proj-single-owner',
        name: 'Single Owner Project',
        methodology: 'SCRUM',
        status: 'PLANNED',
        owner_id: managerUser.id,
        organization_id: 'org-test-1',
        owner: { id: managerUser.id, name: managerUser.name, email: managerUser.email },
        owners: [{ user_id: managerUser.id, user: { id: managerUser.id, name: managerUser.name, email: managerUser.email } }],
        members: [],
        documents: [],
      });

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send({
          name: 'Single Owner Project',
          methodology: 'SCRUM',
          owner_id: managerUser.id,
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Single Owner Project');
      expect(res.body.owner_ids).toContain(managerUser.id);
      expect(mockPrisma.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            owner_id: managerUser.id,
            owners: {
              create: [{ user_id: managerUser.id }],
            },
          }),
        })
      );
    });

    it('should create a project with multiple distinct owners', async () => {
      const { authHeader } = setupAuthUser({
        id: managerUser.id,
        role: 'MANAGER',
        organization_id: 'org-test-1',
      });

      mockPrisma.user.findMany.mockResolvedValueOnce([
        {
          id: managerUser.id,
          name: managerUser.name,
          email: managerUser.email,
          organization_id: 'org-test-1',
          roles: [{ role: { name: 'MANAGER' } }],
        },
        {
          id: coOwnerUser.id,
          name: coOwnerUser.name,
          email: coOwnerUser.email,
          organization_id: 'org-test-1',
          roles: [{ role: { name: 'MANAGER' } }],
        },
      ]);

      mockPrisma.project.create.mockResolvedValueOnce({
        id: 'proj-multi-owner',
        name: 'Multi Owner Project',
        methodology: 'SCRUM',
        status: 'PLANNED',
        owner_id: managerUser.id,
        organization_id: 'org-test-1',
        owner: { id: managerUser.id, name: managerUser.name, email: managerUser.email },
        owners: [
          { user_id: managerUser.id, user: { id: managerUser.id, name: managerUser.name, email: managerUser.email } },
          { user_id: coOwnerUser.id, user: { id: coOwnerUser.id, name: coOwnerUser.name, email: coOwnerUser.email } },
        ],
        members: [],
        documents: [],
      });

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send({
          name: 'Multi Owner Project',
          methodology: 'SCRUM',
          owner_ids: [managerUser.id, coOwnerUser.id],
        });

      expect(res.status).toBe(201);
      expect(res.body.owner_ids).toEqual([managerUser.id, coOwnerUser.id]);
      expect(mockPrisma.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            owner_id: managerUser.id,
            owners: {
              create: [
                { user_id: managerUser.id },
                { user_id: coOwnerUser.id },
              ],
            },
          }),
        })
      );
    });

    it('should reject assigning pure intern without management role as project owner', async () => {
      const { authHeader } = setupAuthUser({
        id: managerUser.id,
        role: 'MANAGER',
        organization_id: 'org-test-1',
      });

      mockPrisma.user.findMany.mockResolvedValueOnce([
        {
          id: 'intern-sole',
          name: 'Intern Sole',
          email: 'intern@example.com',
          organization_id: 'org-test-1',
          roles: [{ role: { name: 'INTERN' } }],
        },
      ]);

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send({
          name: 'Invalid Project',
          methodology: 'SCRUM',
          owner_ids: ['intern-sole'],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('is an intern and cannot be assigned as a project owner');
    });

    it('should reject owners from outside the manager organization', async () => {
      const { authHeader } = setupAuthUser({
        id: managerUser.id,
        role: 'MANAGER',
        organization_id: 'org-test-1',
      });

      // Returns 1 user instead of 2 because candidate is in another org
      mockPrisma.user.findMany.mockResolvedValueOnce([
        {
          id: managerUser.id,
          name: managerUser.name,
          email: managerUser.email,
          organization_id: 'org-test-1',
          roles: [{ role: { name: 'MANAGER' } }],
        },
      ]);

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send({
          name: 'Cross Org Project',
          methodology: 'SCRUM',
          owner_ids: [managerUser.id, 'foreign-user-id'],
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('do not exist in your organization');
    });
  });

  describe('PATCH /api/projects/:id with Multiple Owners', () => {
    it('should update project owners and sync project_owners table', async () => {
      const { authHeader } = setupAuthUser({
        id: managerUser.id,
        role: 'MANAGER',
        organization_id: 'org-test-1',
      });

      mockPrisma.project.findFirst.mockResolvedValueOnce({
        id: 'proj-existing',
        name: 'Existing Project',
        methodology: 'SCRUM',
        status: 'PLANNED',
        owner_id: managerUser.id,
        organization_id: 'org-test-1',
      });

      mockPrisma.user.findMany.mockResolvedValueOnce([
        {
          id: managerUser.id,
          name: managerUser.name,
          email: managerUser.email,
          roles: [{ role: { name: 'MANAGER' } }],
        },
        {
          id: coOwnerUser.id,
          name: coOwnerUser.name,
          email: coOwnerUser.email,
          roles: [{ role: { name: 'MANAGER' } }],
        },
      ]);

      mockPrisma.project.update.mockResolvedValueOnce({
        id: 'proj-existing',
        name: 'Existing Project',
        methodology: 'SCRUM',
        status: 'PLANNED',
        owner_id: managerUser.id,
        organization_id: 'org-test-1',
        owner: { id: managerUser.id, name: managerUser.name, email: managerUser.email },
        owners: [
          { user_id: managerUser.id, user: { id: managerUser.id, name: managerUser.name, email: managerUser.email } },
          { user_id: coOwnerUser.id, user: { id: coOwnerUser.id, name: coOwnerUser.name, email: coOwnerUser.email } },
        ],
        members: [],
        documents: [],
      });

      const res = await request(app)
        .patch('/api/projects/proj-existing')
        .set('Authorization', authHeader)
        .send({
          owner_ids: [managerUser.id, coOwnerUser.id],
        });

      expect(res.status).toBe(200);
      expect(res.body.owner_ids).toEqual([managerUser.id, coOwnerUser.id]);
      expect(mockPrisma.project.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'proj-existing' },
          data: expect.objectContaining({
            owners: {
              deleteMany: {},
              create: [
                { user_id: managerUser.id },
                { user_id: coOwnerUser.id },
              ],
            },
          }),
        })
      );
    });

    it('should allow removing an owner while keeping remaining owners', async () => {
      const { authHeader } = setupAuthUser({
        id: managerUser.id,
        role: 'MANAGER',
        organization_id: 'org-test-1',
      });

      mockPrisma.project.findFirst.mockResolvedValueOnce({
        id: 'proj-existing',
        name: 'Existing Project',
        methodology: 'SCRUM',
        status: 'PLANNED',
        owner_id: managerUser.id,
        organization_id: 'org-test-1',
      });

      mockPrisma.user.findMany.mockResolvedValueOnce([
        {
          id: coOwnerUser.id,
          name: coOwnerUser.name,
          email: coOwnerUser.email,
          roles: [{ role: { name: 'MANAGER' } }],
        },
      ]);

      mockPrisma.project.update.mockResolvedValueOnce({
        id: 'proj-existing',
        name: 'Existing Project',
        methodology: 'SCRUM',
        status: 'PLANNED',
        owner_id: coOwnerUser.id,
        organization_id: 'org-test-1',
        owner: { id: coOwnerUser.id, name: coOwnerUser.name, email: coOwnerUser.email },
        owners: [
          { user_id: coOwnerUser.id, user: { id: coOwnerUser.id, name: coOwnerUser.name, email: coOwnerUser.email } },
        ],
        members: [],
        documents: [],
      });

      const res = await request(app)
        .patch('/api/projects/proj-existing')
        .set('Authorization', authHeader)
        .send({
          owner_ids: [coOwnerUser.id],
        });

      expect(res.status).toBe(200);
      expect(res.body.owner_ids).toEqual([coOwnerUser.id]);
    });
  });

  describe('Authorization: Co-Owners Access Checks', () => {
    it('should grant project access to co-owner recognized via project_owners', async () => {
      const { authHeader } = setupAuthUser({
        id: coOwnerUser.id,
        role: 'TECH_LEAD',
        organization_id: 'org-test-1',
      });

      // Mock for checkProjectMemberPermission middleware
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'proj-co-owned',
        owner_id: managerUser.id,
        organization_id: 'org-test-1',
        owners: [{ user_id: managerUser.id }, { user_id: coOwnerUser.id }],
      });

      // Mock for ProjectService.getProjectById
      mockPrisma.project.findFirst.mockResolvedValueOnce({
        id: 'proj-co-owned',
        name: 'Co-Owned Project',
        methodology: 'SCRUM',
        status: 'ACTIVE',
        owner_id: managerUser.id,
        organization_id: 'org-test-1',
        owner: { id: managerUser.id, name: managerUser.name, email: managerUser.email },
        owners: [
          { user_id: managerUser.id, user: { id: managerUser.id, name: managerUser.name, email: managerUser.email } },
          { user_id: coOwnerUser.id, user: { id: coOwnerUser.id, name: coOwnerUser.name, email: coOwnerUser.email } },
        ],
        members: [],
        documents: [],
      });

      const res = await request(app)
        .get('/api/projects/proj-co-owned')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('proj-co-owned');
      expect(res.body.owner_ids).toContain(coOwnerUser.id);
    });
  });
});
