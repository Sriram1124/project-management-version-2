import request from 'supertest';
import app from '../../src/app';
import { mockPrisma, mockEntity } from '../mocks/prisma.mock';
import { setupAuthUser } from '../helpers/auth.helper';

describe('Projects API (/api/projects)', () => {
  const mockProject = {
    id: 'proj-1',
    name: 'InternHub Dashboard',
    description: 'Internal project tracking',
    methodology: 'SCRUM',
    status: 'ACTIVE',
    owner_id: 'user-manager',
    organization_id: 'org-test-1',
    created_at: new Date(),
    updated_at: new Date(),
    owner: { id: 'user-manager', name: 'Manager' },
    members: [],
  };

  const mockMember = {
    id: 'pm-1',
    project_id: 'proj-1',
    user_id: 'user-dev',
    project_role: 'DEVELOPER',
    user: { id: 'user-dev', name: 'Dave Dev', email: 'dave@example.com' },
  };

  const mockDoc = {
    id: 'doc-1',
    project_id: 'proj-1',
    name: 'Architecture Spec',
    document_type: 'ARCHITECTURE',
    url: 'https://example.com/spec',
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    mockEntity('project', mockProject);
  });

  it('should require authentication for all project routes', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
  });

  describe('GET /api/projects/tech-leads & permissions registry', () => {
    it('GET /api/projects/tech-leads should return tech leads overview', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['PROJECT_READ'] });
      mockPrisma.projectMember.findMany.mockResolvedValueOnce([mockMember]);

      const res = await request(app).get('/api/projects/tech-leads').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('tech_leads');
    });

    it('GET /api/projects/permissions/registry should return available project permissions', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', permissions: ['PROJECT_READ'] });

      const res = await request(app).get('/api/projects/permissions/registry').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('permissions');
      expect(res.body.permissions).toHaveProperty('permissions');
      expect(Array.isArray(res.body.permissions.permissions)).toBe(true);
    });
  });

  describe('GET /api/projects/health-overview', () => {
    it('should return portfolio health overview', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['PROJECT_READ'] });
      mockPrisma.project.findMany.mockResolvedValueOnce([mockProject]);

      const res = await request(app).get('/api/projects/health-overview').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toBeDefined();
    });
  });

  describe('Project CRUD: list, create, getById, update, archive', () => {
    it('GET /api/projects should list projects scoped to organization', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['PROJECT_READ'] });
      mockPrisma.project.findMany.mockResolvedValueOnce([mockProject]);

      const res = await request(app).get('/api/projects').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('projects');
      expect(Array.isArray(res.body.projects)).toBe(true);
      expect(res.body.projects[0].name).toBe('InternHub Dashboard');
    });

    it('POST /api/projects should create a new project', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['PROJECT_CREATE'] });
      mockPrisma.user.findMany.mockResolvedValueOnce([
        {
          id: 'user-test-id',
          name: 'Test User',
          organization_id: 'org-test-1',
          is_active: true,
          roles: [{ role: { name: 'MANAGER' } }],
        },
      ]);
      mockPrisma.project.create.mockResolvedValueOnce(mockProject);
      mockPrisma.projectMember.create.mockResolvedValueOnce({ id: 'pm-owner' });

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send({
          name: 'InternHub Dashboard',
          description: 'Internal project tracking',
          methodology: 'SCRUM',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('proj-1');
      expect(res.body.name).toBe('InternHub Dashboard');
    });

    it('GET /api/projects/:id should return 404 for non-existent project', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', permissions: ['PROJECT_READ'] });

      const res = await request(app).get('/api/projects/proj-none').set('Authorization', authHeader);

      expect(res.status).toBe(404);
    });

    it('GET /api/projects/:id should return project details', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['PROJECT_READ'] });

      const res = await request(app).get('/api/projects/proj-1').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('proj-1');
    });

    it('PATCH /api/projects/:id should update project', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['PROJECT_UPDATE'] });
      mockPrisma.project.update.mockResolvedValueOnce({
        ...mockProject,
        description: 'Updated Description',
      });

      const res = await request(app)
        .patch('/api/projects/proj-1')
        .set('Authorization', authHeader)
        .send({ description: 'Updated Description' });

      expect(res.status).toBe(200);
      expect(res.body.description).toBe('Updated Description');
    });

    it('POST /api/projects/:id/archive should archive project', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['PROJECT_UPDATE'] });
      mockPrisma.project.update.mockResolvedValueOnce({
        ...mockProject,
        status: 'ARCHIVED',
      });

      const res = await request(app).post('/api/projects/proj-1/archive').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ARCHIVED');
      expect(res.body.message).toContain('archived successfully');
    });

    it('DELETE /api/projects/:id should delete project and cascade cleanup', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['PROJECT_DELETE'] });
      mockPrisma.project.findFirst.mockResolvedValueOnce({
        ...mockProject,
        owners: [{ user_id: 'user-manager-1' }],
        documents: [],
      });
      mockPrisma.project.delete.mockResolvedValueOnce(mockProject);

      const res = await request(app).delete('/api/projects/proj-1').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('deleted successfully');
    });
  });

  describe('Project Members and Roles', () => {
    it('GET /api/projects/:id/members should list members', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['PROJECT_READ'] });
      mockPrisma.projectMember.findMany.mockResolvedValueOnce([mockMember]);

      const res = await request(app).get('/api/projects/proj-1/members').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('members');
      expect(Array.isArray(res.body.members)).toBe(true);
    });

    it('POST /api/projects/:id/members should add member', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['PROJECT_UPDATE'] });
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        id: 'user-dev',
        name: 'Dave Dev',
        organization_id: 'org-test-1',
      });
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce(null);
      mockPrisma.projectMember.create.mockResolvedValueOnce(mockMember);

      const res = await request(app)
        .post('/api/projects/proj-1/members')
        .set('Authorization', authHeader)
        .send({ userId: 'user-dev', role: 'DEVELOPER' });

      expect(res.status).toBe(201);
      expect(res.body.user_id).toBe('user-dev');
    });

    it('PATCH /api/projects/:id/members/roles should update member project roles', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['PROJECT_UPDATE'] });
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce(mockMember);
      mockPrisma.projectMember.update.mockResolvedValueOnce({
        ...mockMember,
        project_role: 'TECH_LEAD',
      });

      const res = await request(app)
        .patch('/api/projects/proj-1/members/roles')
        .set('Authorization', authHeader)
        .send([{ user_id: 'user-dev', project_role: 'TECH_LEAD' }]);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('members');
    });

    it('PATCH /api/projects/:id/members/:userId/permissions should update permissions', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['PROJECT_UPDATE'] });
      mockPrisma.projectMember.findUnique.mockResolvedValueOnce({
        ...mockMember,
        user: { id: 'user-dev', name: 'Dave Dev' },
      });
      mockPrisma.permission.findMany.mockResolvedValueOnce([
        { id: 'p-1', name: 'TASK_CREATE' },
        { id: 'p-2', name: 'TASK_UPDATE' },
      ]);
      mockPrisma.role.findFirst.mockResolvedValueOnce(null);
      mockPrisma.role.create.mockResolvedValueOnce({ id: 'r-custom' });

      const res = await request(app)
        .patch('/api/projects/proj-1/members/user-dev/permissions')
        .set('Authorization', authHeader)
        .send({ permissions: ['TASK_CREATE', 'TASK_UPDATE'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('DELETE /api/projects/:id/members/:userId should remove member', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['PROJECT_UPDATE'] });
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce(mockMember);
      mockPrisma.projectMember.delete.mockResolvedValueOnce(mockMember);

      const res = await request(app)
        .delete('/api/projects/proj-1/members/user-dev')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('GET /api/projects/:id/roles should list project roles', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['PROJECT_READ'] });
      mockPrisma.projectRole.findMany.mockResolvedValueOnce([{ id: 'pr-1', name: 'Lead Dev' }]);

      const res = await request(app).get('/api/projects/proj-1/roles').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('roles');
    });

    it('POST /api/projects/:id/roles should create custom role', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['PROJECT_UPDATE'] });
      mockPrisma.role.findFirst.mockResolvedValueOnce(null); // role name not already taken
      mockPrisma.permission.findMany.mockResolvedValueOnce([
        { id: 'p-1', name: 'PROJECT_READ' },
        { id: 'p-2', name: 'DOCUMENT_UPLOAD' },
      ]);
      mockPrisma.role.create.mockResolvedValueOnce({
        id: 'pr-custom',
        project_id: 'proj-1',
        name: 'Technical Architect',
        permissions: [],
      });

      const res = await request(app)
        .post('/api/projects/proj-1/roles')
        .set('Authorization', authHeader)
        .send({
          name: 'Technical Architect',
          permissions: ['PROJECT_READ', 'DOCUMENT_UPLOAD'],
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toContain('Custom role created successfully');
    });
  });

  describe('Project Documents', () => {
    beforeEach(() => {
      mockEntity('projectDocument', mockDoc);
    });

    it('GET /api/projects/:id/documents should list documents', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['PROJECT_READ'] });
      mockPrisma.projectDocument.findMany.mockResolvedValueOnce([mockDoc]);

      const res = await request(app).get('/api/projects/proj-1/documents').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('documents');
      expect(Array.isArray(res.body.documents)).toBe(true);
    });

    it('POST /api/projects/:id/documents should create document metadata', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['PROJECT_UPDATE'] });
      mockPrisma.projectDocument.create.mockResolvedValueOnce(mockDoc);

      const res = await request(app)
        .post('/api/projects/proj-1/documents')
        .set('Authorization', authHeader)
        .send({
          name: 'Architecture Spec',
          document_type: 'ARCHITECTURE',
          url: 'https://example.com/spec',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('doc-1');
      expect(res.body.name).toBe('Architecture Spec');
    });

    it('PATCH /api/projects/:id/documents/:documentId should update document metadata', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['PROJECT_UPDATE'] });
      mockPrisma.projectDocument.update.mockResolvedValueOnce({
        ...mockDoc,
        name: 'Updated Spec Name',
      });

      const res = await request(app)
        .patch('/api/projects/proj-1/documents/doc-1')
        .set('Authorization', authHeader)
        .send({ name: 'Updated Spec Name' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Spec Name');
    });

    it('DELETE /api/projects/:id/documents/:documentId should delete document', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['PROJECT_UPDATE'] });
      mockPrisma.projectDocument.delete.mockResolvedValueOnce(mockDoc);

      const res = await request(app)
        .delete('/api/projects/proj-1/documents/doc-1')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
    });
  });
});
