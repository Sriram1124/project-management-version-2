import { Request, Response } from 'express';
import { NotificationService } from '../services/notification.service';
import { prisma } from '../lib/prisma';

export class NotificationController {
  /**
   * Manager sends notification to organization users
   */
  static async create(req: Request, res: Response) {
    try {
      const { title, message, type } = req.body;
      let organizationId = (req as any).fullUser?.organization_id || (req as any).user?.organization_id;
      const senderId = (req as any).fullUser?.id || (req as any).user?.id;

      if (!organizationId) {
        const org = await prisma.organization.findFirst({ where: { is_active: true } });
        organizationId = org?.id;
      }

      let rawRecipients = req.body.recipient_ids || req.body.recipientIds || req.body.recipients;
      let recipientList: string[] = [];

      if (Array.isArray(rawRecipients)) {
        recipientList = rawRecipients;
      } else if (typeof rawRecipients === 'string' && rawRecipients.trim()) {
        recipientList = [rawRecipients.trim()];
      }

      // If recipients empty or contains ALL_INTERNS / ALL, resolve to active organization users
      if (recipientList.length === 0 || recipientList.includes('ALL_INTERNS') || recipientList.includes('ALL')) {
        const orgUsers = await prisma.user.findMany({
          where: {
            organization_id: organizationId,
            is_active: true,
            id: { not: senderId },
          },
          select: { id: true },
        });
        recipientList = orgUsers.map((u) => u.id);
        if (recipientList.length === 0 && senderId) {
          recipientList = [senderId];
        }
      }

      const result = await NotificationService.createNotification({
        organizationId: organizationId!,
        senderId,
        title,
        message,
        type,
        recipientIds: recipientList,
      });

      res.status(201).json({
        ...result,
        notification: result.notification,
        queued: result.queued,
      });
    } catch (err: any) {
      const status = err.statusCode || 500;
      res.status(status).json({ error: err.message || 'Failed to create notification' });
    }
  }

  /**
   * List notifications received by the authenticated user
   */
  static async list(req: Request, res: Response) {
    try {
      const userId = (req as any).fullUser?.id || (req as any).user?.id;
      const notifications = await NotificationService.listNotifications(userId);
      res.status(200).json({ notifications, data: notifications });
    } catch (err: any) {
      const status = err.statusCode || 500;
      res.status(status).json({ error: err.message || 'Failed to list notifications' });
    }
  }

  /**
   * Get unread notifications count for authenticated user
   */
  static async unreadCount(req: Request, res: Response) {
    try {
      const userId = (req as any).fullUser?.id || (req as any).user?.id;
      const result = await NotificationService.getUnreadCount(userId);
      res.status(200).json(result);
    } catch (err: any) {
      const status = err.statusCode || 500;
      res.status(status).json({ error: err.message || 'Failed to get unread count' });
    }
  }

  /**
   * Mark a notification as read
   */
  static async markRead(req: Request, res: Response) {
    try {
      const userId = (req as any).fullUser?.id || (req as any).user?.id;
      const id = req.params.notificationId || req.params.id;
      const result = await NotificationService.markAsRead(id, userId);
      res.status(200).json({
        ...result,
        message: 'Notification marked as read',
      });
    } catch (err: any) {
      const status = err.statusCode || 500;
      res.status(status).json({ error: err.message || 'Failed to mark notification as read' });
    }
  }

  /**
   * Mark all unread notifications as read
   */
  static async markAllRead(req: Request, res: Response) {
    try {
      const userId = (req as any).fullUser?.id || (req as any).user?.id;
      const result = await NotificationService.markAllAsRead(userId);
      res.status(200).json(result);
    } catch (err: any) {
      const status = err.statusCode || 500;
      res.status(status).json({ error: err.message || 'Failed to mark notifications as read' });
    }
  }
}
