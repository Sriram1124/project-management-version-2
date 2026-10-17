import request from 'supertest';
import app from '../../src/app';
import { mockPrisma, mockEntity } from '../mocks/prisma.mock';
import { setupAuthUser } from '../helpers/auth.helper';

describe('Work Items API (/api/work-items)', () => {
  const mockProject = {
    id: 'proj-1',
    name: 'Dashboard',
    organization_id: 'org-test-1',
    owner_id: 'user-manager',
    status: 'ACTIVE',
  };

  const mockWorkItem = {
    id: 'wi-1',
    project_id: 'proj-1',
    organization_id: 'org-test-1',
    sprint_id: 'sprint-1',
    creator_id: 'user-manager',
    title: 'Implement Authentication',
    description: 'Set up JWT',
    type: 'STORY',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    story_points: 5,
    order: 1,
    parent_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    assignees: [],
    time_entries: [],
    children: [],
    project: { id: 'proj-1', name: 'Dashboard', status: 'ACTIVE', owner_id: 'user-manager' },
    sprint: { id: 'sprint-1', name: 'Sprint 1', status: 'ACTIVE' },
  };

  const mockComment = {
    id: 'com-1',
    work_item_id: 'wi-1',
    author_id: 'user-manager',
    content: 'Looking great, let us merge it.',
    created_at: new Date(),
    updated_at: new Date(),
    author: {
      id: 'user-manager',
      name: 'Manager',
      email: 'mgr@example.com',
      roles: [{ role: { name: 'MANAGER' } }],
    },
  };

  beforeEach(() => {
    mockEntity('project', mockProject);
    mockEntity('workItem', mockWorkItem);
  });

  it('should require authentication for all work item endpoints', async () => {
    const res = await request(app).get('/api/work-items');
    expect(res.status).toBe(401);
  });

  describe('POST /api/work-items', () => {
    it('should reject invalid work item type', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER' });

      const res = await request(app)
        .post('/api/work-items')
        .set('Authorization', authHeader)
        .send({ title: 'Task', type: 'INVALID_TYPE' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid work item type');
    });

    it('should reject invalid status or priority', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER' });

      const res = await request(app)
        .post('/api/work-items')
        .set('Authorization', authHeader)
        .send({ title: 'Task', status: 'NON_EXISTENT_STATUS' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid status');
    });

    it('should create work item successfully', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });
      mockPrisma.workItem.create.mockResolvedValueOnce(mockWorkItem);
      mockPrisma.workItem.findUnique.mockResolvedValueOnce(mockWorkItem);

      const res = await request(app)
        .post('/api/work-items')
        .set('Authorization', authHeader)
        .send({
          project_id: 'proj-1',
          title: 'Implement Authentication',
          type: 'STORY',
          priority: 'HIGH',
          story_points: 5,
        });

      expect(res.status).toBe(201);
      expect(res.body.work_item.id).toBe('wi-1');
      expect(res.body.work_item.title).toBe('Implement Authentication');
    });
  });

  describe('GET /api/work-items', () => {
    it('should reject invalid limit parameter', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER' });

      const res = await request(app)
        .get('/api/work-items?limit=-5')
        .set('Authorization', authHeader);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid limit');
    });

    it('should list work items with filters', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });
      mockPrisma.workItem.findMany.mockResolvedValueOnce([mockWorkItem]);

      const res = await request(app)
        .get('/api/work-items?project_id=proj-1&status=IN_PROGRESS')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('work_items');
      expect(Array.isArray(res.body.work_items)).toBe(true);
    });
  });

  describe('GET /api/work-items/analytics', () => {
    it('should return analytics metrics', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });
      mockPrisma.workItem.findMany.mockResolvedValueOnce([mockWorkItem]);
      mockPrisma.timeEntry.findMany.mockResolvedValueOnce([]);
      mockPrisma.sprint.findMany.mockResolvedValueOnce([]);
      mockPrisma.project.findMany.mockResolvedValueOnce([mockProject]);
      mockPrisma.projectMember.findMany.mockResolvedValueOnce([]);

      const res = await request(app)
        .get('/api/work-items/analytics?project_id=proj-1')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toBeDefined();
    });
  });

  describe('GET /api/work-items/:id', () => {
    it('should return 404 if work item not found', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER' });
      mockPrisma.workItem.findFirst.mockResolvedValueOnce(null);

      const res = await request(app).get('/api/work-items/wi-nonexistent').set('Authorization', authHeader);

      expect(res.status).toBe(404);
    });

    it('should return work item details by ID', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });

      const res = await request(app).get('/api/work-items/wi-1').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.work_item.id).toBe('wi-1');
    });
  });

  describe('PATCH /api/work-items/:id', () => {
    it('should update task details in place without full page reload', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });
      mockPrisma.workItem.update.mockResolvedValueOnce({
        ...mockWorkItem,
        status: 'COMPLETED',
        story_points: 8,
      });

      const res = await request(app)
        .patch('/api/work-items/wi-1')
        .set('Authorization', authHeader)
        .send({ status: 'COMPLETED', story_points: 8 });

      expect(res.status).toBe(200);
      expect(res.body.work_item.status).toBe('COMPLETED');
    });
  });

  describe('Assignees: POST & DELETE', () => {
    it('POST /api/work-items/:id/assignees should assign user to task', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });
      mockPrisma.user.findMany.mockResolvedValueOnce([{ id: 'u-assigned' }]);
      mockPrisma.projectMember.findMany.mockResolvedValueOnce([{ user_id: 'u-assigned' }]);
      mockPrisma.workItemAssignee.upsert.mockResolvedValueOnce({ id: 'wia-1' });

      const res = await request(app)
        .post('/api/work-items/wi-1/assignees')
        .set('Authorization', authHeader)
        .send({ user_id: 'u-assigned' });

      expect(res.status).toBe(200);
      expect(res.body.work_item).toBeDefined();
    });

    it('DELETE /api/work-items/:id/assignees/:userId should remove assignee from task', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });
      mockPrisma.workItemAssignee.findUnique.mockResolvedValueOnce({
        id: 'wia-1',
        work_item_id: 'wi-1',
        user_id: 'u-assigned',
      });
      mockPrisma.workItemAssignee.delete.mockResolvedValueOnce({ id: 'wia-1' });

      const res = await request(app)
        .delete('/api/work-items/wi-1/assignees/u-assigned')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Comments: CRUD', () => {
    it('GET /api/work-items/:id/comments should list comments', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });
      mockPrisma.workItemComment.findMany.mockResolvedValueOnce([mockComment]);

      const res = await request(app).get('/api/work-items/wi-1/comments').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('comments');
      expect(Array.isArray(res.body.comments)).toBe(true);
    });

    it('POST /api/work-items/:id/comments should add comment', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });
      mockPrisma.workItemComment.create.mockResolvedValueOnce(mockComment);

      const res = await request(app)
        .post('/api/work-items/wi-1/comments')
        .set('Authorization', authHeader)
        .send({ content: 'Looking great, let us merge it.' });

      expect(res.status).toBe(201);
      expect(res.body.comment.content).toBe('Looking great, let us merge it.');
    });

    it('PUT /api/work-items/:id/comments/:commentId should update comment', async () => {
      const { authHeader } = setupAuthUser({ id: 'user-manager', role: 'MANAGER', organization_id: 'org-test-1' });
      mockPrisma.workItemComment.findFirst.mockResolvedValueOnce(mockComment);
      mockPrisma.workItemComment.update.mockResolvedValueOnce({
        ...mockComment,
        content: 'Updated comment text',
      });

      const res = await request(app)
        .put('/api/work-items/wi-1/comments/com-1')
        .set('Authorization', authHeader)
        .send({ content: 'Updated comment text' });

      expect(res.status).toBe(200);
      expect(res.body.comment.content).toBe('Updated comment text');
    });

    it('DELETE /api/work-items/:id/comments/:commentId should delete comment', async () => {
      const { authHeader } = setupAuthUser({ id: 'user-manager', role: 'MANAGER', organization_id: 'org-test-1' });
      mockPrisma.workItemComment.findFirst.mockResolvedValueOnce(mockComment);
      mockPrisma.workItemComment.delete.mockResolvedValueOnce(mockComment);

      const res = await request(app).delete('/api/work-items/wi-1/comments/com-1').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('DELETE /api/work-items/:id', () => {
    it('should delete work item', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });
      mockPrisma.workItem.delete.mockResolvedValueOnce(mockWorkItem);

      const res = await request(app).delete('/api/work-items/wi-1').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Work item deleted successfully');
    });
  });
});
