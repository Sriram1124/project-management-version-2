import { Request, Response } from 'express';
import { ActionItemPriority, ActionItemStatus } from '@prisma/client';
import { ActionItemService } from '../services/action-item.service';

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
      const fullUser = (req as any).fullUser;
      const organization_id = fullUser?.organization_id;
      const user_id = fullUser?.id;
      if (!organization_id || !user_id) {
        res.status(400).json({ error: 'User and organization context required' });
        return;
      }

      const { title, description, project_id, assignee_id, status, priority, due_date } = req.body;
      if (!title || !title.trim()) {
        res.status(400).json({ error: 'Title is required' });
        return;
      }

      if (!project_id) {
        res.status(400).json({ error: 'Project ID is required' });
        return;
      }

      const item = await ActionItemService.create({
        title: title.trim(),
        description,
        project_id,
        assignee_id,
        status: status ? (status.toUpperCase() as ActionItemStatus) : ActionItemStatus.OPEN,
        priority: priority ? (priority.toUpperCase() as ActionItemPriority) : ActionItemPriority.MEDIUM,
        due_date,
        organization_id,
        creator_id: user_id,
      });

      res.status(201).json(item);
    } catch (error: any) {
      console.error('[ActionItemController.create] Error:', error);
      res.status(500).json({ error: error.message || 'Failed to create action item' });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const fullUser = (req as any).fullUser;
      const organization_id = fullUser?.organization_id;
      if (!organization_id) {
        res.status(400).json({ error: 'Organization context required' });
        return;
      }

      const { id } = req.params;
      const { title, description, assignee_id, status, priority, due_date } = req.body;

      const item = await ActionItemService.update(id, organization_id, {
        title: title ? title.trim() : undefined,
        description,
        assignee_id,
        status: status ? (status.toUpperCase() as ActionItemStatus) : undefined,
        priority: priority ? (priority.toUpperCase() as ActionItemPriority) : undefined,
        due_date,
      });

      res.status(200).json(item);
    } catch (error: any) {
      console.error('[ActionItemController.update] Error:', error);
      if (error.message === 'Action item not found') {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message || 'Failed to update action item' });
      }
    }
  }

  static async delete(req: Request, res: Response): Promise<void> {
    try {
      const fullUser = (req as any).fullUser;
      const organization_id = fullUser?.organization_id;
      if (!organization_id) {
        res.status(400).json({ error: 'Organization context required' });
        return;
      }

      const { id } = req.params;
      await ActionItemService.delete(id, organization_id);
      res.status(204).send();
    } catch (error: any) {
      console.error('[ActionItemController.delete] Error:', error);
      if (error.message === 'Action item not found') {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message || 'Failed to delete action item' });
      }
    }
  }
}
