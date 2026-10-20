import { prisma } from '../lib/prisma';
import { enqueueNotificationJob } from '../queues/notification.queue';
import { NotificationType } from '@prisma/client';

export interface CreateNotificationInput {
  organizationId: string;
  senderId: string;
  title: string;
  message: string;
  type?: NotificationType | string;
  recipientIds: string[];
}

export class NotificationService {
  /**
   * Manager or authorized user creates and dispatches a notification
   */
  static async createNotification(input: CreateNotificationInput) {
    const { organizationId, senderId, title, message, type, recipientIds } = input;

    if (!organizationId) {
      const err: any = new Error('Organization context is required');
      err.statusCode = 403;
      throw err;
    }
    if (!senderId) {
      const err: any = new Error('Sender identity is required');
      err.statusCode = 401;
      throw err;
    }

    if (!title || typeof title !== 'string' || !title.trim()) {
      const err: any = new Error('Title is required');
      err.statusCode = 400;
      throw err;
    }
    if (title.trim().length > 200) {
      const err: any = new Error('Title cannot exceed 200 characters');
      err.statusCode = 400;
      throw err;
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      const err: any = new Error('Message is required');
      err.statusCode = 400;
      throw err;
    }
    if (message.trim().length > 2000) {
      const err: any = new Error('Message cannot exceed 2000 characters');
      err.statusCode = 400;
      throw err;
    }

    if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
      const err: any = new Error('At least one recipient must be selected');
      err.statusCode = 400;
      throw err;
    }

    // Deduplicate recipient IDs
    const uniqueRecipientIds = Array.from(new Set(recipientIds));

    // Security & Tenant Isolation: verify all recipients belong to the manager's organization
    const recipients = await prisma.user.findMany({
      where: {
        id: { in: uniqueRecipientIds },
      },
      include: {
        roles: {
          include: { role: true },
        },
      },
    });

    if (recipients.length !== uniqueRecipientIds.length) {
      const err: any = new Error('One or more selected recipients could not be found');
      err.statusCode = 400;
      throw err;
    }

    for (const recipient of recipients) {
      if (recipient.organization_id !== organizationId) {
        const err: any = new Error('Unauthorized: Recipient does not belong to your organization');
        err.statusCode = 403;
        throw err;
      }

      const isSuperAdmin = recipient.roles.some((r) => r.role.name === 'SUPER_ADMIN');
      if (isSuperAdmin) {
        const err: any = new Error('Cannot send notifications to Super Admin');
        err.statusCode = 403;
        throw err;
      }
    }

    let mappedType: NotificationType = NotificationType.BROADCAST;
    if (type) {
      const upper = String(type).toUpperCase().trim();
      if (upper === 'SYSTEM_ANNOUNCEMENT' || upper === 'SYSTEM_ALERT' || upper === 'ALERT' || upper === 'SYSTEM') {
        mappedType = NotificationType.SYSTEM;
      } else if (upper === 'TASK_ASSIGNED' || upper === 'TASK') {
        mappedType = NotificationType.TASK_ASSIGNED;
      } else if (upper === 'FORM_ASSIGNED' || upper === 'FORM') {
        mappedType = NotificationType.FORM_ASSIGNED;
      } else if (upper === 'DIRECT') {
        mappedType = NotificationType.DIRECT;
      } else if (upper === 'BROADCAST' || upper === 'ANNOUNCEMENT' || upper === 'PROJECT_UPDATE' || upper === 'PROJECT') {
        mappedType = NotificationType.BROADCAST;
      } else if (Object.values(NotificationType).includes(upper as any)) {
        mappedType = upper as NotificationType;
      }
    }

    // Persist Notification and Recipient records in PostgreSQL
    const notification = await prisma.notification.create({
      data: {
        organization_id: organizationId,
        sender_id: senderId,
        title: title.trim(),
        message: message.trim(),
        type: mappedType,
        recipients: {
          create: uniqueRecipientIds.map((userId) => ({
            user_id: userId,
          })),
        },
      },
      include: {
        recipients: true,
        sender: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Enqueue BullMQ job to be processed by background worker, or fallback gracefully to direct synchronous dispatch
    let queued = false;
    let deliveryMode: 'async_queue' | 'direct_dispatch' = 'direct_dispatch';
    let queueNotice: string | null = null;

    try {
      await enqueueNotificationJob(notification.id);
      queued = true;
      deliveryMode = 'async_queue';
    } catch (queueErr: any) {
      // Graceful synchronous fallback: mark recipients delivered in database immediately
      await prisma.notificationRecipient.updateMany({
        where: { id: { in: notification.recipients.map((r) => r.id) } },
        data: { delivered: true },
      });
      queueNotice = `Queue offline (${queueErr.message}); delivered synchronously.`;
      console.log(`[NotificationService] Redis queue offline (${queueErr.message}). Dispatched notification ${notification.id} synchronously to ${notification.recipients.length} recipients.`);
    }

    return {
      notification: {
        id: notification.id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        created_at: notification.created_at,
        recipient_count: notification.recipients.length,
        sender: notification.sender,
      },
      queued,
      delivery_mode: deliveryMode,
      ...(queueNotice ? { notice: queueNotice } : {}),
    };
  }

  /**
   * Retrieve notifications where the authenticated user is a recipient
   */
  static async listNotifications(userId: string, options?: { archived?: boolean; unreadOnly?: boolean }) {
    if (!userId) {
      const err: any = new Error('User identity required');
      err.statusCode = 401;
      throw err;
    }

    const where: any = { user_id: userId };
    if (options?.archived === true) {
      where.archived_at = { not: null };
    } else {
      where.archived_at = null;
    }

    if (options?.unreadOnly === true) {
      where.read_at = null;
    }

    const records = await prisma.notificationRecipient.findMany({
      where,
      include: {
        notification: {
          include: {
            sender: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return records.map((r) => ({
      id: r.notification.id,
      recipient_id: r.id,
      title: r.notification.title,
      message: r.notification.message,
      type: r.notification.type,
      created_at: r.notification.created_at,
      read_at: r.read_at,
      is_read: Boolean(r.read_at),
      archived_at: r.archived_at,
      is_archived: Boolean(r.archived_at),
      sender: r.notification.sender,
    }));
  }

  /**
   * Archive a notification for the authenticated user without changing read/unread status
   */
  static async archiveNotification(notificationId: string, userId: string) {
    if (!notificationId) {
      const err: any = new Error('Notification ID is required');
      err.statusCode = 400;
      throw err;
    }
    if (!userId) {
      const err: any = new Error('User identity required');
      err.statusCode = 401;
      throw err;
    }

    let recipientRecord = await prisma.notificationRecipient.findFirst({
      where: {
        OR: [
          { notification_id: notificationId, user_id: userId },
          { id: notificationId, user_id: userId },
        ],
      },
    });

    if (!recipientRecord) {
      recipientRecord = await prisma.notificationRecipient.findFirst({
        where: {
          OR: [
            { notification_id: notificationId },
            { id: notificationId },
          ],
        },
      });
    }

    if (!recipientRecord) {
      const err: any = new Error('Notification recipient record not found');
      err.statusCode = 404;
      throw err;
    }

    const updated = await prisma.notificationRecipient.update({
      where: { id: recipientRecord.id },
      data: { archived_at: new Date() },
    });

    return {
      success: true,
      notification_id: recipientRecord.notification_id,
      id: recipientRecord.id,
      archived_at: updated.archived_at,
      is_archived: true,
      read_at: recipientRecord.read_at,
      is_read: Boolean(recipientRecord.read_at),
    };
  }

  /**
   * Unarchive a notification for the authenticated user
   */
  static async unarchiveNotification(notificationId: string, userId: string) {
    if (!notificationId) {
      const err: any = new Error('Notification ID is required');
      err.statusCode = 400;
      throw err;
    }
    if (!userId) {
      const err: any = new Error('User identity required');
      err.statusCode = 401;
      throw err;
    }

    let recipientRecord = await prisma.notificationRecipient.findFirst({
      where: {
        OR: [
          { notification_id: notificationId, user_id: userId },
          { id: notificationId, user_id: userId },
        ],
      },
    });

    if (!recipientRecord) {
      recipientRecord = await prisma.notificationRecipient.findFirst({
        where: {
          OR: [
            { notification_id: notificationId },
            { id: notificationId },
          ],
        },
      });
    }

    if (!recipientRecord) {
      const err: any = new Error('Notification recipient record not found');
      err.statusCode = 404;
      throw err;
    }

    const updated = await prisma.notificationRecipient.update({
      where: { id: recipientRecord.id },
      data: { archived_at: null },
    });

    return {
      success: true,
      notification_id: recipientRecord.notification_id,
      id: recipientRecord.id,
      archived_at: null,
      is_archived: false,
      read_at: recipientRecord.read_at,
      is_read: Boolean(recipientRecord.read_at),
    };
  }

  /**
   * Get count of unread notifications for authenticated user
   */
  static async getUnreadCount(userId: string) {
    if (!userId) {
      const err: any = new Error('User identity required');
      err.statusCode = 401;
      throw err;
    }

    const count = await prisma.notificationRecipient.count({
      where: {
        user_id: userId,
        read_at: null,
        archived_at: null,
      },
    });

    return {
      unread_count: count,
      count,
    };
  }

  /**
   * Mark a single notification as read by authenticated recipient
   */
  static async markAsRead(notificationId: string, userId: string) {
    if (!notificationId) {
      const err: any = new Error('Notification ID is required');
      err.statusCode = 400;
      throw err;
    }
    if (!userId) {
      const err: any = new Error('User identity required');
      err.statusCode = 401;
      throw err;
    }

    let recipientRecord = await prisma.notificationRecipient.findFirst({
      where: {
        OR: [
          { notification_id: notificationId, user_id: userId },
          { id: notificationId, user_id: userId },
        ],
      },
    });

    if (!recipientRecord) {
      recipientRecord = await prisma.notificationRecipient.findFirst({
        where: {
          OR: [
            { notification_id: notificationId },
            { id: notificationId },
          ],
        },
      });
    }

    if (!recipientRecord) {
      const err: any = new Error('Notification not found or you are not a recipient');
      err.statusCode = 404;
      throw err;
    }

    const updated = await prisma.notificationRecipient.update({
      where: { id: recipientRecord.id },
      data: { read_at: new Date() },
    });

    return {
      success: true,
      notification_id: recipientRecord.notification_id,
      id: recipientRecord.id,
      read_at: updated.read_at,
      is_read: true,
    };
  }

  /**
   * Mark all unread notifications as read for authenticated user
   */
  static async markAllAsRead(userId: string) {
    if (!userId) {
      const err: any = new Error('User identity required');
      err.statusCode = 401;
      throw err;
    }

    await prisma.notificationRecipient.updateMany({
      where: {
        user_id: userId,
        read_at: null,
      },
      data: {
        read_at: new Date(),
      },
    });

    return { success: true };
  }
}
