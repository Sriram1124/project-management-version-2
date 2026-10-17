import request from 'supertest';
import app from '../../src/app';
import { mockPrisma } from '../mocks/prisma.mock';
import { setupAuthUser } from '../helpers/auth.helper';

describe('Notifications API (/api/notifications)', () => {
  const mockNotif = {
    id: 'notif-1',
    organization_id: 'org-test-1',
    sender_id: 'user-manager',
    title: 'Sprint Demo Tomorrow',
    message: 'Please have slides ready by 10 AM.',
    type: 'BROADCAST',
    created_at: new Date(),
    recipients: [
      {
        id: 'recip-1',
        user_id: 'user-intern',
        is_read: false,
        read_at: null,
      },
    ],
  };

  it('should require authentication', async () => {
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(401);
  });

  describe('GET /api/notifications', () => {
    it('should list notifications for the logged in user', async () => {
      const { authHeader } = setupAuthUser({ id: 'user-intern', role: 'INTERN' });
      mockPrisma.notificationRecipient.findMany.mockResolvedValueOnce([
        {
          id: 'recip-1',
          notification_id: 'notif-1',
          user_id: 'user-intern',
          is_read: false,
          read_at: null,
          created_at: new Date(),
          notification: mockNotif,
        },
      ]);

      const res = await request(app).get('/api/notifications').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('notifications');
      expect(Array.isArray(res.body.notifications)).toBe(true);
    });
  });

  describe('GET /api/notifications/unread-count', () => {
    it('should return unread count for the authenticated user', async () => {
      const { authHeader } = setupAuthUser({ id: 'user-intern', role: 'INTERN' });
      mockPrisma.notificationRecipient.count.mockResolvedValueOnce(3);

      const res = await request(app).get('/api/notifications/unread-count').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('unread_count', 3);
    });
  });

  describe('PATCH /api/notifications/read-all', () => {
    it('should mark all notifications as read for current user', async () => {
      const { authHeader } = setupAuthUser({ id: 'user-intern', role: 'INTERN' });
      mockPrisma.notificationRecipient.updateMany.mockResolvedValueOnce({ count: 5 });

      const res = await request(app).patch('/api/notifications/read-all').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(mockPrisma.notificationRecipient.updateMany).toHaveBeenCalledWith({
        where: {
          user_id: 'user-intern',
          read_at: null,
        },
        data: {
          read_at: expect.any(Date),
        },
      });
    });
  });

  describe('PATCH /api/notifications/:id/read and PATCH /api/notifications/:id', () => {
    it('should mark a specific notification as read', async () => {
      const { authHeader } = setupAuthUser({ id: 'user-intern', role: 'INTERN' });
      mockPrisma.notificationRecipient.findFirst.mockResolvedValueOnce({
        id: 'recip-1',
        is_read: false,
      });
      mockPrisma.notificationRecipient.update.mockResolvedValueOnce({
        id: 'recip-1',
        is_read: true,
        read_at: new Date(),
      });

      const res = await request(app).patch('/api/notifications/notif-1/read').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Notification marked as read');
    });

    it('should support alternative route PATCH /api/notifications/:id', async () => {
      const { authHeader } = setupAuthUser({ id: 'user-intern', role: 'INTERN' });
      mockPrisma.notificationRecipient.findFirst.mockResolvedValueOnce({
        id: 'recip-1',
        is_read: false,
      });
      mockPrisma.notificationRecipient.update.mockResolvedValueOnce({
        id: 'recip-1',
        is_read: true,
        read_at: new Date(),
      });

      const res = await request(app).patch('/api/notifications/notif-1').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Notification marked as read');
    });
  });

  describe('POST /api/notifications', () => {
    it('should forbid intern from broadcasting notifications', async () => {
      const { authHeader } = setupAuthUser({ role: 'INTERN' });

      const res = await request(app)
        .post('/api/notifications')
        .set('Authorization', authHeader)
        .send({ title: 'Alert', message: 'Test' });

      expect(res.status).toBe(403);
    });

    it('should return 400 if title or message is missing', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER' });

      const res = await request(app)
        .post('/api/notifications')
        .set('Authorization', authHeader)
        .send({ title: '' });

      expect(res.status).toBe(400);
    });

    it('should prevent cross-organization notification dispatch', async () => {
      const { authHeader } = setupAuthUser({
        id: 'mgr-1',
        role: 'MANAGER',
        organization_id: 'org-test-1',
      });

      mockPrisma.user.findMany.mockResolvedValueOnce([
        {
          id: 'other-user',
          organization_id: 'org-DIFFERENT',
          roles: [{ role: { name: 'INTERN' } }],
        },
      ]);

      const res = await request(app)
        .post('/api/notifications')
        .set('Authorization', authHeader)
        .send({
          title: 'Welcome',
          message: 'Hello team',
          recipient_ids: ['other-user'],
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Recipient does not belong to your organization');
    });

    it('should create and dispatch broadcast notification successfully', async () => {
      const { authHeader } = setupAuthUser({
        id: 'mgr-1',
        role: 'MANAGER',
        organization_id: 'org-test-1',
      });

      mockPrisma.user.findMany.mockResolvedValueOnce([
        {
          id: 'intern-1',
          organization_id: 'org-test-1',
          roles: [{ role: { name: 'INTERN' } }],
        },
      ]);
      mockPrisma.notification.create.mockResolvedValueOnce({
        id: 'notif-new',
        organization_id: 'org-test-1',
        sender_id: 'mgr-1',
        title: 'Standup in 5 mins',
        message: 'Join the Google Meet link.',
        type: 'BROADCAST',
        created_at: new Date(),
        recipients: [{ id: 'rec-1', user_id: 'intern-1', is_read: false }],
      });

      const res = await request(app)
        .post('/api/notifications')
        .set('Authorization', authHeader)
        .send({
          title: 'Standup in 5 mins',
          message: 'Join the Google Meet link.',
          recipient_ids: ['intern-1'],
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('notification');
      expect(res.body.notification.title).toBe('Standup in 5 mins');
    });
  });
});
