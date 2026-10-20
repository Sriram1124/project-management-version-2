import request from 'supertest';
import app from '../../src/app';
import { mockPrisma } from '../mocks/prisma.mock';
import { setupAuthUser } from '../helpers/auth.helper';
import { UserService } from '../../src/services/user.service';

describe('Project Creation Rules & Canonical Intern Counting Suite', () => {
  const managerUser = {
    id: 'user-mgr-alice',
    name: 'Alice Manager',
    email: 'alice.manager@example.com',
    role: 'MANAGER',
    organization_id: 'org-test-canonical',
  };

  const techLeadUser = {
    id: 'user-lead-krish',
    name: 'Krish Jain',
    email: 'krish.jain@example.com',
    role: 'INTERN',
    organization_id: 'org-test-canonical',
  };

  const internUser = {
    id: 'user-intern-bob',
    name: 'Bob Intern',
    email: 'bob.intern@example.com',
    role: 'INTERN',
    organization_id: 'org-test-canonical',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Mandatory Project Description Enforcement', () => {
    it('should reject project creation when description is missing', async () => {
      const { authHeader } = setupAuthUser({
        id: managerUser.id,
        role: 'MANAGER',
        organization_id: managerUser.organization_id,
      });

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send({
          name: 'Missing Description Project',
          methodology: 'SCRUM',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Project description is required/i);
    });

    it('should reject project creation when description is whitespace only', async () => {
      const { authHeader } = setupAuthUser({
        id: managerUser.id,
        role: 'MANAGER',
        organization_id: managerUser.organization_id,
      });

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send({
          name: 'Whitespace Description Project',
          methodology: 'SCRUM',
          description: '   \n\t   ',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Project description is required/i);
    });

    it('should reject project update when description is set to empty string', async () => {
      const { authHeader } = setupAuthUser({
        id: managerUser.id,
        role: 'MANAGER',
        organization_id: managerUser.organization_id,
      });

      mockPrisma.project.findFirst.mockResolvedValueOnce({
        id: 'proj-123',
        name: 'Existing Project',
        description: 'Existing Description',
        organization_id: managerUser.organization_id,
        owner_id: managerUser.id,
        methodology: 'SCRUM',
      });

      const res = await request(app)
        .patch('/api/projects/proj-123')
        .set('Authorization', authHeader)
        .send({
          description: '   ',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Project description cannot be empty/i);
    });
  });

  describe('2. Project Owner Restriction to Managers Only', () => {
    it('should reject assigning an intern as a project owner', async () => {
      const { authHeader } = setupAuthUser({
        id: managerUser.id,
        role: 'MANAGER',
        organization_id: managerUser.organization_id,
      });

      mockPrisma.user.findMany.mockResolvedValueOnce([
        {
          id: internUser.id,
          name: internUser.name,
          email: internUser.email,
          organization_id: managerUser.organization_id,
          is_active: true,
          roles: [{ role: { name: 'INTERN' } }],
        },
      ]);

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send({
          name: 'Intern Owned Project',
          description: 'A valid project description for an invalid owner',
          methodology: 'SCRUM',
          owner_id: internUser.id,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/is an intern and cannot be assigned as a project owner/i);
    });

    it('should reject assigning a Tech Lead as a project owner', async () => {
      const { authHeader } = setupAuthUser({
        id: managerUser.id,
        role: 'MANAGER',
        organization_id: managerUser.organization_id,
      });

      mockPrisma.user.findMany.mockResolvedValueOnce([
        {
          id: techLeadUser.id,
          name: techLeadUser.name,
          email: techLeadUser.email,
          organization_id: managerUser.organization_id,
          is_active: true,
          roles: [{ role: { name: 'TECH_LEAD' } }],
        },
      ]);

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send({
          name: 'Tech Lead Owned Project',
          description: 'A valid description attempting Tech Lead owner',
          methodology: 'SCRUM',
          owner_id: techLeadUser.id,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/is a Tech Lead and cannot be assigned as a project owner/i);
    });

    it('should allow an eligible manager to be a project owner', async () => {
      const { authHeader } = setupAuthUser({
        id: managerUser.id,
        role: 'MANAGER',
        organization_id: managerUser.organization_id,
      });

      mockPrisma.user.findMany.mockImplementation(({ where }: any) => {
        if (where?.id?.in?.includes(managerUser.id)) {
          return Promise.resolve([
            {
              id: managerUser.id,
              name: managerUser.name,
              email: managerUser.email,
              organization_id: managerUser.organization_id,
              is_active: true,
              roles: [{ role: { name: 'MANAGER' } }],
            },
          ]);
        }
        return Promise.resolve([]);
      });

      mockPrisma.project.create.mockResolvedValueOnce({
        id: 'proj-valid-manager',
        name: 'Manager Owned Project',
        description: 'Properly described project with a valid manager owner',
        methodology: 'SCRUM',
        status: 'PLANNED',
        owner_id: managerUser.id,
        organization_id: managerUser.organization_id,
        owner: { id: managerUser.id, name: managerUser.name, email: managerUser.email },
        owners: [{ user_id: managerUser.id, user: { id: managerUser.id, name: managerUser.name, email: managerUser.email } }],
        members: [],
        documents: [],
      });

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send({
          name: 'Manager Owned Project',
          description: 'Properly described project with a valid manager owner',
          methodology: 'SCRUM',
          owner_id: managerUser.id,
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Manager Owned Project');
    });
  });

  describe('3. Tech Lead Multiproject Membership & Selector Availability', () => {
    it('should allow adding a Tech Lead already in Project A to Project B as a member', async () => {
      const { authHeader } = setupAuthUser({
        id: managerUser.id,
        role: 'MANAGER',
        organization_id: managerUser.organization_id,
      });

      mockPrisma.project.findFirst.mockResolvedValueOnce({
        id: 'proj-b',
        name: 'Project B',
        organization_id: managerUser.organization_id,
        owner_id: managerUser.id,
      });

      // User exists in organization
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        id: techLeadUser.id,
        name: techLeadUser.name,
        email: techLeadUser.email,
        organization_id: managerUser.organization_id,
        is_active: true,
        roles: [{ role: { name: 'INTERN' } }],
      });

      mockPrisma.projectMember.findUnique.mockResolvedValueOnce(null); // not yet in Project B
      mockPrisma.projectMember.create.mockResolvedValueOnce({
        id: 'pm-lead-proj-b',
        project_id: 'proj-b',
        user_id: techLeadUser.id,
        project_role: 'DEVELOPER',
        user: { id: techLeadUser.id, name: techLeadUser.name, email: techLeadUser.email },
      });

      const res = await request(app)
        .post('/api/projects/proj-b/members')
        .set('Authorization', authHeader)
        .send({
          user_id: techLeadUser.id,
        });

      expect(res.status).toBe(201);
      expect(mockPrisma.projectMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            project_id: 'proj-b',
            user_id: techLeadUser.id,
          }),
        })
      );
    });
  });

  describe('4. Canonical Intern Counting Logic', () => {
    it('should generate canonical where clause with distinct intern role and active status', () => {
      const clause = UserService.getCanonicalInternWhereClause({
        organizationId: 'org-test-canonical',
        cohortId: 'cohort-1',
        isActive: true,
      });

      expect(clause.organization_id).toBe('org-test-canonical');
      expect(clause.is_active).toBe(true);
      expect(clause.roles).toBeDefined();
      expect(clause.roles.some.role.name).toBe('INTERN');
      expect(clause.roles.none.role.name).toBe('SUPER_ADMIN');
      expect(clause.AND).toBeDefined();
      expect(clause.AND[0].OR).toEqual(
        expect.arrayContaining([
          { cohort_id: 'cohort-1' },
          { cohort: { id: 'cohort-1' } },
        ])
      );
    });

    it('should count distinct users and include interns who have Tech Lead responsibilities', async () => {
      mockPrisma.user.count.mockResolvedValueOnce(81);

      const count = await UserService.getCanonicalInternCount({
        organizationId: 'org-test-canonical',
      });

      expect(count).toBe(81);
      expect(mockPrisma.user.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organization_id: 'org-test-canonical',
          }),
        })
      );
    });
  });
});
