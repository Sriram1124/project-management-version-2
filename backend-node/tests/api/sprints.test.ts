import request from 'supertest';
import app from '../../src/app';
import { mockPrisma, mockEntity } from '../mocks/prisma.mock';
import { setupAuthUser } from '../helpers/auth.helper';

describe('Project Sprints/Cycles API (/api/projects/:id/sprints)', () => {
  const mockProject = {
    id: 'proj-1',
    name: 'InternHub Platform',
    owner_id: 'user-manager',
    organization_id: 'org-test-1',
  };

  const mockSprint = {
    id: 'sprint-1',
    project_id: 'proj-1',
    name: 'Cycle 1: MVP Core',
    goal: 'Ship core features',
    status: 'PLANNING',
    start_date: new Date('2026-10-01'),
    end_date: new Date('2026-10-15'),
    created_at: new Date(),
    updated_at: new Date(),
    work_items: [],
  };

  beforeEach(() => {
    mockEntity('project', mockProject);
    mockEntity('sprint', mockSprint);
  });

  it('should require authentication', async () => {
    const res = await request(app).get('/api/projects/proj-1/sprints');
    expect(res.status).toBe(401);
  });

  describe('GET /api/projects/:id/sprints', () => {
    it('should list all sprints for a project', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });
      mockPrisma.sprint.findMany.mockResolvedValueOnce([mockSprint]);

      const res = await request(app)
        .get('/api/projects/proj-1/sprints')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('sprints');
      expect(Array.isArray(res.body.sprints)).toBe(true);
      expect(res.body.sprints[0].name).toBe('Cycle 1: MVP Core');
    });
  });

  describe('POST /api/projects/:id/sprints', () => {
    it('should return 400 if sprint name is missing', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['SPRINT_CREATE'] });

      const res = await request(app)
        .post('/api/projects/proj-1/sprints')
        .set('Authorization', authHeader)
        .send({ goal: 'No name provided' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('name is required');
    });

    it('should create new sprint in PLANNING status', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['SPRINT_CREATE'] });
      mockPrisma.sprint.create.mockResolvedValueOnce(mockSprint);

      const res = await request(app)
        .post('/api/projects/proj-1/sprints')
        .set('Authorization', authHeader)
        .send({
          name: 'Cycle 1: MVP Core',
          goal: 'Ship core features',
          start_date: '2026-10-01',
          end_date: '2026-10-15',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('sprint-1');
      expect(res.body.status).toBe('PLANNING');
    });
  });

  describe('GET /api/projects/:id/sprints/:sprintId', () => {
    it('should return 404 if sprint not found', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });

      const res = await request(app)
        .get('/api/projects/proj-1/sprints/nonexistent')
        .set('Authorization', authHeader);

      expect(res.status).toBe(404);
    });

    it('should return sprint details by ID', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });

      const res = await request(app)
        .get('/api/projects/proj-1/sprints/sprint-1')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('sprint-1');
      expect(res.body.name).toBe('Cycle 1: MVP Core');
    });
  });

  describe('POST /api/projects/:id/sprints/:sprintId/start', () => {
    it('should reject starting a sprint if another sprint is already ACTIVE', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['SPRINT_ACTIVATE'] });
      mockPrisma.sprint.findFirst.mockImplementation((args: any) => {
        if (args?.where?.id?.not) {
          return Promise.resolve({
            id: 'sprint-active-other',
            name: 'Another Active Cycle',
            status: 'ACTIVE',
          });
        }
        return Promise.resolve(mockSprint);
      });

      const res = await request(app)
        .post('/api/projects/proj-1/sprints/sprint-1/start')
        .set('Authorization', authHeader);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('currently active');
    });

    it('should start sprint successfully when no other sprint is active', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['SPRINT_ACTIVATE'] });
      mockPrisma.sprint.findFirst.mockImplementation((args: any) => {
        if (args?.where?.id?.not) {
          return Promise.resolve(null); // no active sprint
        }
        return Promise.resolve(mockSprint);
      });
      mockPrisma.sprint.update.mockResolvedValueOnce({
        ...mockSprint,
        status: 'ACTIVE',
      });

      const res = await request(app)
        .post('/api/projects/proj-1/sprints/sprint-1/start')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.message).toContain('Sprint started successfully');
    });
  });

  describe('POST /api/projects/:id/sprints/:sprintId/complete', () => {
    it('should complete active sprint and move unfinished tasks to backlog', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['SPRINT_UPDATE'] });
      mockPrisma.sprint.findFirst.mockResolvedValueOnce({
        ...mockSprint,
        status: 'ACTIVE',
        work_items: [
          { id: 'wi-1', status: 'COMPLETED' },
          { id: 'wi-2', status: 'IN_PROGRESS' },
        ],
      });
      mockPrisma.sprint.update.mockResolvedValueOnce({
        ...mockSprint,
        status: 'COMPLETED',
      });
      mockPrisma.workItem.updateMany.mockResolvedValueOnce({ count: 1 });

      const res = await request(app)
        .post('/api/projects/proj-1/sprints/sprint-1/complete')
        .set('Authorization', authHeader)
        .send({ unfinished_action: 'BACKLOG' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.message).toContain('Sprint completed successfully');
    });
  });

  describe('PATCH /api/projects/:id/sprints/:sprintId', () => {
    it('should update sprint metadata', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['SPRINT_UPDATE'] });
      mockPrisma.sprint.update.mockResolvedValueOnce({
        ...mockSprint,
        goal: 'Updated cycle goal',
      });

      const res = await request(app)
        .patch('/api/projects/proj-1/sprints/sprint-1')
        .set('Authorization', authHeader)
        .send({ goal: 'Updated cycle goal' });

      expect(res.status).toBe(200);
      expect(res.body.goal).toBe('Updated cycle goal');
    });
  });

  describe('DELETE /api/projects/:id/sprints/:sprintId', () => {
    it('should delete sprint and unassign work items', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['PROJECT_UPDATE'] });
      mockPrisma.workItem.updateMany.mockResolvedValueOnce({ count: 2 });
      mockPrisma.sprint.delete.mockResolvedValueOnce(mockSprint);

      const res = await request(app)
        .delete('/api/projects/proj-1/sprints/sprint-1')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Sprint deleted successfully');
    });
  });

  describe('Kanban project restrictions', () => {
    const mockKanbanProject = {
      id: 'proj-kanban-1',
      name: 'Kanban Continuous Flow',
      owner_id: 'user-manager',
      organization_id: 'org-test-1',
      methodology: 'KANBAN',
    };

    it('should return empty sprints array [] when listing sprints for Kanban project', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockKanbanProject);

      const res = await request(app)
        .get('/api/projects/proj-kanban-1/sprints')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.sprints).toEqual([]);
    });

    it('should return 400 when attempting to create a sprint on a Kanban project', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['SPRINT_CREATE'] });
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockKanbanProject);

      const res = await request(app)
        .post('/api/projects/proj-kanban-1/sprints')
        .set('Authorization', authHeader)
        .send({
          name: 'Sprint 1',
          goal: 'Kanban sprint should fail',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('not supported for Kanban');
    });

    it('should return 400 when attempting to update a sprint on a Kanban project', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['SPRINT_UPDATE'] });
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockKanbanProject);

      const res = await request(app)
        .patch('/api/projects/proj-kanban-1/sprints/sprint-1')
        .set('Authorization', authHeader)
        .send({ goal: 'Updated goal' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('not supported for Kanban');
    });

    it('should return 400 when attempting to delete a sprint on a Kanban project', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1', permissions: ['PROJECT_UPDATE'] });
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockKanbanProject);

      const res = await request(app)
        .delete('/api/projects/proj-kanban-1/sprints/sprint-1')
        .set('Authorization', authHeader);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('not supported for Kanban');
    });
  });
});

