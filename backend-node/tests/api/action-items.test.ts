import request from 'supertest';
import app from '../../src/app';
import { mockPrisma } from '../mocks/prisma.mock';
import { setupAuthUser } from '../helpers/auth.helper';

describe('Action Items API (/api/action-items)', () => {
  const mockItem = {
    id: 'ai-1',
    title: 'Review PR #42',
    description: 'Ensure code coverage',
    status: 'OPEN',
    priority: 'HIGH',
    project_id: 'proj-1',
    assignee_id: 'user-1',
    creator_id: 'user-creator',
    organization_id: 'org-test-1',
    created_at: new Date(),
    updated_at: new Date(),
  };

  it('should require authentication', async () => {
    const res = await request(app).get('/api/action-items');
    expect(res.status).toBe(401);
  });

  describe('GET /api/action-items', () => {
    it('should return 400 if user has no organization context', async () => {
      const { authHeader } = setupAuthUser({ organization_id: null });
      const res = await request(app).get('/api/action-items').set('Authorization', authHeader);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Organization context required');
    });

    it('should list action items with filters', async () => {
      const { authHeader } = setupAuthUser({ organization_id: 'org-test-1' });
      mockPrisma.actionItem.findMany.mockResolvedValueOnce([mockItem]);

      const res = await request(app)
        .get('/api/action-items?project_id=proj-1&status=OPEN')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe('Review PR #42');
    });
  });

  describe('GET /api/action-items/:id', () => {
    it('should return 404 if item not found', async () => {
      const { authHeader } = setupAuthUser({ organization_id: 'org-test-1' });
      mockPrisma.actionItem.findFirst.mockResolvedValueOnce(null);

      const res = await request(app).get('/api/action-items/ai-nonexistent').set('Authorization', authHeader);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Action item not found');
    });

    it('should return action item details by ID', async () => {
      const { authHeader } = setupAuthUser({ organization_id: 'org-test-1' });
      mockPrisma.actionItem.findFirst.mockResolvedValueOnce(mockItem);

      const res = await request(app).get('/api/action-items/ai-1').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('ai-1');
      expect(res.body.title).toBe('Review PR #42');
    });
  });

  describe('POST /api/action-items', () => {
    it('should return 400 if title is missing', async () => {
      const { authHeader } = setupAuthUser({ organization_id: 'org-test-1' });
      const res = await request(app)
        .post('/api/action-items')
        .set('Authorization', authHeader)
        .send({ project_id: 'proj-1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Title is required');
    });

    it('should create action item and return 201', async () => {
      const { authHeader } = setupAuthUser({ organization_id: 'org-test-1', role: 'MANAGER' });
      mockPrisma.project.findFirst.mockResolvedValueOnce({ id: 'proj-1' });
      mockPrisma.actionItem.create.mockResolvedValueOnce(mockItem);

      const res = await request(app)
        .post('/api/action-items')
        .set('Authorization', authHeader)
        .send({
          title: 'Review PR #42',
          project_id: 'proj-1',
          priority: 'HIGH',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('ai-1');
      expect(res.body.title).toBe('Review PR #42');
    });
  });

  describe('PATCH /api/action-items/:id', () => {
    it('should return 404 when updating non-existent item', async () => {
      const { authHeader } = setupAuthUser({ organization_id: 'org-test-1' });
      mockPrisma.actionItem.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .patch('/api/action-items/ai-notfound')
        .set('Authorization', authHeader)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(404);
    });

    it('should update action item and return 200', async () => {
      const { authHeader } = setupAuthUser({ organization_id: 'org-test-1', role: 'MANAGER' });
      mockPrisma.actionItem.findFirst.mockResolvedValueOnce(mockItem);
      mockPrisma.actionItem.update.mockResolvedValueOnce({
        ...mockItem,
        title: 'Updated Title',
        status: 'COMPLETED',
      });

      const res = await request(app)
        .patch('/api/action-items/ai-1')
        .set('Authorization', authHeader)
        .send({ title: 'Updated Title', status: 'COMPLETED' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated Title');
      expect(res.body.status).toBe('COMPLETED');
    });
  });

  describe('DELETE /api/action-items/:id', () => {
    it('should return 404 if item does not exist', async () => {
      const { authHeader } = setupAuthUser({ organization_id: 'org-test-1' });
      mockPrisma.actionItem.findFirst.mockResolvedValueOnce(null);

      const res = await request(app).delete('/api/action-items/ai-notfound').set('Authorization', authHeader);

      expect(res.status).toBe(404);
    });

    it('should delete action item and return 204', async () => {
      const { authHeader } = setupAuthUser({ organization_id: 'org-test-1', role: 'MANAGER' });
      mockPrisma.actionItem.findFirst.mockResolvedValueOnce(mockItem);
      mockPrisma.actionItem.delete.mockResolvedValueOnce(mockItem);

      const res = await request(app).delete('/api/action-items/ai-1').set('Authorization', authHeader);

      expect(res.status).toBe(204);
    });
  });
});

