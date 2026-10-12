import { Request, Response } from 'express';
import { ActionItemPriority, ActionItemStatus } from '@prisma/client';
import { ActionItemService } from '../services/action-item.service';
import { prisma } from '../lib/prisma';

export class ActionItemController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const fullUser = (req as any).fullUser;
      const organization_id = fullUser?.organization_id;
      if (!organization_id) {
        res.status(400).json({ error: 'Organization context required' });
        return;
      }

      const { project_id, assignee_id, status } = req.query as {
        project_id?: string;
        assignee_id?: string;
        status?: ActionItemStatus;
      };

      const items = await ActionItemService.list({
        organization_id,
        project_id,
        assignee_id,
        status,
      });

      res.status(200).json(items);
    } catch (error: any) {
      console.error('[ActionItemController.list] Error:', error);
      res.status(500).json({ error: error.message || 'Failed to list action items' });
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const fullUser = (req as any).fullUser;
      const organization_id = fullUser?.organization_id;
      if (!organization_id) {
        res.status(400).json({ error: 'Organization context required' });
        return;
      }

      const { id } = req.params;
      const item = await ActionItemService.getById(id, organization_id);
      res.status(200).json(item);
    } catch (error: any) {
      console.error('[ActionItemController.getById] Error:', error);
      if (error.message === 'Action item not found') {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message || 'Failed to fetch action item' });
      }
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const fullUser = (req as any).fullUser || {};
      const user = (req as any).user || {};
      let organization_id = fullUser.organization_id || user.organization_id;
      let user_id = fullUser.id || user.id;

      if (!organization_id) {
        const org = await prisma.organization.findFirst({ where: { is_active: true } });
        organization_id = org?.id;
      }

      if (!organization_id || !user_id) {
        res.status(400).json({ error: 'User and organization context required' });
        return;
      }

      const title = req.body.title;
      if (!title || !title.trim()) {
        res.status(400).json({ error: 'Title is required' });
        return;
      }

      let project_id = req.body.project_id || req.body.projectId;
      if (!project_id) {
        const defaultProj = await prisma.project.findFirst({
          where: { organization_id },
          select: { id: true },
        });
        project_id = defaultProj?.id;
      }

      if (!project_id) {
        res.status(400).json({ error: 'Project ID is required' });
        return;
      }

      const assignee_id = req.body.assignee_id || req.body.assigneeId || null;
      const statusRaw = req.body.status;
      const priorityRaw = req.body.priority;
      const due_date = req.body.due_date || req.body.dueDate || null;

      let resolvedStatus: ActionItemStatus = ActionItemStatus.OPEN;
      if (statusRaw) {
        const s = statusRaw.toUpperCase();
        if (['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(s)) {
          resolvedStatus = s as ActionItemStatus;
        }
      }

      let resolvedPriority: ActionItemPriority = ActionItemPriority.MEDIUM;
      if (priorityRaw) {
        const p = priorityRaw.toUpperCase();
        if (['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(p)) {
          resolvedPriority = p as ActionItemPriority;
        }
      }

      const item = await ActionItemService.create({
        title: title.trim(),
        description: req.body.description || null,
        project_id,
        assignee_id,
        status: resolvedStatus,
        priority: resolvedPriority,
        due_date,
        organization_id,
        creator_id: user_id,
      }, fullUser);

      res.status(201).json({
        ...item,
        item,
        id: item.id,
      });
    } catch (error: any) {
      console.error('[ActionItemController.create] Error:', error);
      if (error.message?.includes('Forbidden')) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message || 'Failed to create action item' });
      }
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const fullUser = (req as any).fullUser || {};
      const user = (req as any).user || {};
      let organization_id = fullUser.organization_id || user.organization_id;

      const id = req.params.actionItemId || req.params.id;
      if (!organization_id) {
        const existing = await prisma.actionItem.findUnique({ where: { id } });
        organization_id = existing?.organization_id;
      }

      if (!organization_id) {
        res.status(400).json({ error: 'Organization context required' });
        return;
      }

      const { title, description } = req.body;
      const assignee_id = req.body.assignee_id || req.body.assigneeId;
      const statusRaw = req.body.status;
      const priorityRaw = req.body.priority;
      const due_date = req.body.due_date || req.body.dueDate;

      let resolvedStatus: ActionItemStatus | undefined = undefined;
      if (statusRaw) {
        const s = statusRaw.toUpperCase();
        if (['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(s)) {
          resolvedStatus = s as ActionItemStatus;
        }
      }

      let resolvedPriority: ActionItemPriority | undefined = undefined;
      if (priorityRaw) {
        const p = priorityRaw.toUpperCase();
        if (['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(p)) {
          resolvedPriority = p as ActionItemPriority;
        }
      }

      const item = await ActionItemService.update(id, organization_id, {
        title: title ? title.trim() : undefined,
        description,
        assignee_id,
        status: resolvedStatus,
        priority: resolvedPriority,
        due_date,
      }, fullUser);

      res.status(200).json({
        ...item,
        item,
        id: item.id,
      });
    } catch (error: any) {
      console.error('[ActionItemController.update] Error:', error);
      if (error.message === 'Action item not found') {
        res.status(404).json({ error: error.message });
      } else if (error.message?.includes('Forbidden')) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message || 'Failed to update action item' });
      }
    }
  }

  static async delete(req: Request, res: Response): Promise<void> {
    try {
      const fullUser = (req as any).fullUser || {};
      const user = (req as any).user || {};
      let organization_id = fullUser.organization_id || user.organization_id;

      const id = req.params.actionItemId || req.params.id;
      if (!organization_id) {
        const existing = await prisma.actionItem.findUnique({ where: { id } });
        organization_id = existing?.organization_id;
      }

      if (!organization_id) {
        res.status(400).json({ error: 'Organization context required' });
        return;
      }

      await ActionItemService.delete(id, organization_id, fullUser);
      res.status(204).send();
    } catch (error: any) {
      console.error('[ActionItemController.delete] Error:', error);
      if (error.message === 'Action item not found') {
        res.status(404).json({ error: error.message });
      } else if (error.message?.includes('Forbidden')) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message || 'Failed to delete action item' });
      }
    }
  }
}
