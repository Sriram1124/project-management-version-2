import { NotificationService } from '../../src/services/notification.service';
import { mockPrisma, resetPrismaMock } from '../mocks/prisma.mock';
import { NotificationType } from '@prisma/client';
import * as queueModule from '../../src/queues/notification.queue';

describe('NotificationService Unit Tests', () => {
  const mockOrgId = 'org-notif-1';
  const mockSenderId = 'user-mgr-1';
  const mockRecipientId = 'user-intern-1';

  const mockRecipientUser = {
    id: mockRecipientId,
    name: 'Intern Recipient',
    email: 'intern@example.com',
    organization_id: mockOrgId,
    roles: [{ role: { name: 'INTERN' } }],
  };

  const mockCreatedNotification = {
    id: 'notif-1',
    organization_id: mockOrgId,
    sender_id: mockSenderId,
    title: 'Sprint Planning',
    message: 'Sprint starts tomorrow',
    type: NotificationType.BROADCAST,
    created_at: new Date(),
    recipients: [{ id: 'recip-1', user_id: mockRecipientId, delivered: false }],
    sender: { id: mockSenderId, name: 'Manager', email: 'mgr@example.com' },
  };

  beforeEach(() => {
    resetPrismaMock();
  });

  describe('createNotification validation & authorization', () => {
    it('throws 403 when organizationId is missing', async () => {
      await expect(
        NotificationService.createNotification({
          organizationId: '',
          senderId: mockSenderId,
          title: 'Hello',
          message: 'World',
          recipientIds: [mockRecipientId],
        })
      ).rejects.toThrow('Organization context is required');
    });

    it('throws 401 when senderId is missing', async () => {
      await expect(
        NotificationService.createNotification({
          organizationId: mockOrgId,
          senderId: '',
          title: 'Hello',
          message: 'World',
          recipientIds: [mockRecipientId],
        })
      ).rejects.toThrow('Sender identity is required');
    });

    it('throws 400 when title is missing or blank', async () => {
      await expect(
        NotificationService.createNotification({
          organizationId: mockOrgId,
          senderId: mockSenderId,
          title: '   ',
          message: 'World',
          recipientIds: [mockRecipientId],
        })
      ).rejects.toThrow('Title is required');
    });

    it('throws 400 when title exceeds 200 characters', async () => {
      await expect(
        NotificationService.createNotification({
          organizationId: mockOrgId,
          senderId: mockSenderId,
          title: 'A'.repeat(201),
          message: 'World',
          recipientIds: [mockRecipientId],
        })
      ).rejects.toThrow('Title cannot exceed 200 characters');
    });

    it('throws 400 when message is missing or blank', async () => {
      await expect(
        NotificationService.createNotification({
          organizationId: mockOrgId,
          senderId: mockSenderId,
          title: 'Hello',
          message: '   ',
          recipientIds: [mockRecipientId],
        })
      ).rejects.toThrow('Message is required');
    });

    it('throws 400 when message exceeds 2000 characters', async () => {
      await expect(
        NotificationService.createNotification({
          organizationId: mockOrgId,
          senderId: mockSenderId,
          title: 'Hello',
          message: 'A'.repeat(2001),
          recipientIds: [mockRecipientId],
        })
      ).rejects.toThrow('Message cannot exceed 2000 characters');
    });

    it('throws 400 when recipientIds is empty or not an array', async () => {
      await expect(
        NotificationService.createNotification({
          organizationId: mockOrgId,
          senderId: mockSenderId,
          title: 'Hello',
          message: 'World',
          recipientIds: [],
        })
      ).rejects.toThrow('At least one recipient must be selected');
    });

    it('throws 400 when one or more recipients cannot be found in database', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([]); // Found 0 of 1

      await expect(
        NotificationService.createNotification({
          organizationId: mockOrgId,
          senderId: mockSenderId,
          title: 'Hello',
          message: 'World',
          recipientIds: [mockRecipientId],
        })
      ).rejects.toThrow('One or more selected recipients could not be found');
    });

    it('throws 403 when a recipient belongs to a different organization', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([
        { ...mockRecipientUser, organization_id: 'org-other' },
      ]);

      await expect(
        NotificationService.createNotification({
          organizationId: mockOrgId,
          senderId: mockSenderId,
          title: 'Hello',
          message: 'World',
          recipientIds: [mockRecipientId],
        })
      ).rejects.toThrow('Unauthorized: Recipient does not belong to your organization');
    });

    it('throws 403 when attempting to send notification to Super Admin', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([
        {
          ...mockRecipientUser,
          roles: [{ role: { name: 'SUPER_ADMIN' } }],
        },
      ]);

      await expect(
        NotificationService.createNotification({
          organizationId: mockOrgId,
          senderId: mockSenderId,
          title: 'Hello',
          message: 'World',
          recipientIds: [mockRecipientId],
        })
      ).rejects.toThrow('Cannot send notifications to Super Admin');
    });
  });

  describe('type mappings and delivery modes', () => {
    it.each([
      ['SYSTEM_ALERT', NotificationType.SYSTEM],
      ['TASK', NotificationType.TASK_ASSIGNED],
      ['FORM', NotificationType.FORM_ASSIGNED],
      ['DIRECT', NotificationType.DIRECT],
      ['PROJECT_UPDATE', NotificationType.BROADCAST],
      ['SYSTEM', NotificationType.SYSTEM],
    ])('maps input type %s to Prisma enum %s', async (inputType, expectedEnum) => {
      mockPrisma.user.findMany.mockResolvedValueOnce([mockRecipientUser]);
      mockPrisma.notification.create.mockResolvedValueOnce({
        ...mockCreatedNotification,
        type: expectedEnum,
      });

      const result = await NotificationService.createNotification({
        organizationId: mockOrgId,
        senderId: mockSenderId,
        title: 'Mapped Type Test',
        message: 'Testing type mappings',
        type: inputType as any,
        recipientIds: [mockRecipientId],
      });

      expect(result.notification.type).toBe(expectedEnum);
    });

    it('dispatches async queue delivery when queue is available', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([mockRecipientUser]);
      mockPrisma.notification.create.mockResolvedValueOnce(mockCreatedNotification);
      jest.spyOn(queueModule, 'enqueueNotificationJob').mockResolvedValueOnce({ id: 'job-123' } as any);

      const result = await NotificationService.createNotification({
        organizationId: mockOrgId,
        senderId: mockSenderId,
        title: 'Queue Test',
        message: 'Async queue delivery',
        recipientIds: [mockRecipientId],
      });

      expect(result.queued).toBe(true);
      expect(result.delivery_mode).toBe('async_queue');
    });

    it('falls back to synchronous dispatch when queue is offline', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([mockRecipientUser]);
      mockPrisma.notification.create.mockResolvedValueOnce(mockCreatedNotification);
      mockPrisma.notificationRecipient.updateMany.mockResolvedValueOnce({ count: 1 });
      jest
        .spyOn(queueModule, 'enqueueNotificationJob')
        .mockRejectedValueOnce(new Error('Connection refused'));

      const result = await NotificationService.createNotification({
        organizationId: mockOrgId,
        senderId: mockSenderId,
        title: 'Queue Offline Test',
        message: 'Synchronous fallback delivery',
        recipientIds: [mockRecipientId],
      });

      expect(result.queued).toBe(false);
      expect(result.delivery_mode).toBe('direct_dispatch');
      expect(result.notice).toContain('Queue offline');
      expect(mockPrisma.notificationRecipient.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['recip-1'] } },
        data: { delivered: true },
      });
    });
  });

  describe('listNotifications, getUnreadCount, and read markers', () => {
    it('listNotifications throws 401 if userId is missing', async () => {
      await expect(NotificationService.listNotifications('')).rejects.toThrow('User identity required');
    });

    it('listNotifications returns formatted notification items with read flags', async () => {
      mockPrisma.notificationRecipient.findMany.mockResolvedValueOnce([
        {
          id: 'recip-1',
          read_at: new Date(),
          notification: {
            id: 'notif-1',
            title: 'Task Assigned',
            message: 'Check dashboard',
            type: NotificationType.TASK_ASSIGNED,
            created_at: new Date(),
            sender: { id: 'mgr-1', name: 'Lead', email: 'lead@example.com' },
          },
        },
      ]);

      const list = await NotificationService.listNotifications(mockRecipientId);
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('notif-1');
      expect(list[0].is_read).toBe(true);
    });

    it('getUnreadCount throws 401 if userId is missing', async () => {
      await expect(NotificationService.getUnreadCount('')).rejects.toThrow('User identity required');
    });

    it('getUnreadCount returns correct unread count', async () => {
      mockPrisma.notificationRecipient.count.mockResolvedValueOnce(4);

      const res = await NotificationService.getUnreadCount(mockRecipientId);
      expect(res.count).toBe(4);
      expect(res.unread_count).toBe(4);
    });

    it('markAsRead validates notificationId and userId', async () => {
      await expect(NotificationService.markAsRead('', mockRecipientId)).rejects.toThrow(
        'Notification ID is required'
      );
      await expect(NotificationService.markAsRead('notif-1', '')).rejects.toThrow(
        'User identity required'
      );
    });

    it('markAsRead throws 404 when recipient record is not found', async () => {
      mockPrisma.notificationRecipient.findFirst.mockResolvedValue(null);

      await expect(NotificationService.markAsRead('notif-999', mockRecipientId)).rejects.toThrow(
        'Notification not found or you are not a recipient'
      );
    });

    it('markAsRead marks notification as read successfully', async () => {
      const recipientRecord = {
        id: 'recip-1',
        notification_id: 'notif-1',
        user_id: mockRecipientId,
        read_at: null,
      };
      mockPrisma.notificationRecipient.findFirst.mockResolvedValueOnce(recipientRecord);
      const readDate = new Date();
      mockPrisma.notificationRecipient.update.mockResolvedValueOnce({
        ...recipientRecord,
        read_at: readDate,
      });

      const res = await NotificationService.markAsRead('notif-1', mockRecipientId);
      expect(res.success).toBe(true);
      expect(res.is_read).toBe(true);
      expect(res.notification_id).toBe('notif-1');
    });

    it('markAllAsRead validates userId and marks all user notifications as read', async () => {
      await expect(NotificationService.markAllAsRead('')).rejects.toThrow('User identity required');

      mockPrisma.notificationRecipient.updateMany.mockResolvedValueOnce({ count: 5 });
      const res = await NotificationService.markAllAsRead(mockRecipientId);

      expect(res.success).toBe(true);
      expect(mockPrisma.notificationRecipient.updateMany).toHaveBeenCalledWith({
        where: { user_id: mockRecipientId, read_at: null },
        data: { read_at: expect.any(Date) },
      });
    });
  });
});

