import { Request, Response } from 'express';
import { WorkItemType, WorkItemStatus, WorkItemPriority } from '@prisma/client';
import { WorkItemService } from '../services/work-item.service';

export class WorkItemController {
  private static handleError(res: Response, error: any) {
    const msg = error?.message || 'Internal server error';

    if (error?.statusCode && typeof error.statusCode === 'number') {
      res.status(error.statusCode).json({ error: msg, work_item: {} });
      return;
    }

    if (
      msg.includes('not found') ||
      msg === 'Work item not found' ||
      msg === 'Project not found' ||
      msg === 'Assignee not found on this work item'
    ) {
      res.status(404).json({ error: msg });
      return;
    }

    if (
      msg.includes('required') ||
      msg.includes('mandatory') ||
      msg.includes('Story points') ||
      msg.includes('Invalid') ||
      msg.includes('must have') ||
      msg.includes('cannot have') ||
      msg.includes('cannot be') ||
      msg.includes('Cannot assign') ||
      msg.includes('Cannot change') ||
      msg.includes('Cannot create') ||
      msg.includes('cannot create') ||
      msg.includes('can only contain') ||
      msg.includes('Circular') ||
      msg.includes('leaf') ||
      msg.includes('Cross-project') ||
      msg.includes('Cannot delete') ||
      msg.includes('is not a member') ||
      msg.includes('standalone') ||
      msg.includes('must be of type TASK')
    ) {
      res.status(400).json({ error: msg, work_item: {} });
      return;
    }

    if (
      msg.includes('Forbidden') ||
      msg.includes('forbidden') ||
      msg.includes('permission') ||
      msg.includes('cannot modify') ||
      msg.includes('only the creator')
    ) {
      res.status(403).json({ error: msg, work_item: {} });
      return;
    }

    res.status(500).json({ error: msg });
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const { type, status, priority } = req.body || {};
      if (type && !Object.values(WorkItemType).includes(type)) {
        res.status(400).json({
          error: `Invalid work item type: ${type}. Must be one of: ${Object.values(WorkItemType).join(', ')}`,
          work_item: {},
        });
        return;
      }
      if (status && !Object.values(WorkItemStatus).includes(status)) {
        res.status(400).json({ error: `Invalid status: ${status}` });
        return;
      }
      if (priority && !Object.values(WorkItemPriority).includes(priority)) {
        res.status(400).json({ error: `Invalid priority: ${priority}` });
        return;
      }

      const user = (req as any).fullUser;
      const workItem = await WorkItemService.createWorkItem(user, req.body);
      res.status(201).json({ work_item: workItem });
    } catch (error) {
      WorkItemController.handleError(res, error);
    }
  }

  static async list(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { project_id, sprint_id, type, status, priority, assigned_to_me, my_personal, overdue_only, limit } = req.query;

      let validatedLimit: number | undefined = undefined;
      if (limit !== undefined && limit !== null && limit !== '') {
        const parsed = Number(limit);
        if (Number.isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
          res.status(400).json({ error: 'Invalid limit: must be a positive integer greater than 0' });
          return;
        }
        if (parsed > 1000) {
          res.status(400).json({ error: 'Invalid limit: maximum allowed limit is 1000' });
          return;
        }
        validatedLimit = parsed;
      }

      const workItems = await WorkItemService.listWorkItems(user, {
        project_id: project_id as string,
        sprint_id: sprint_id as string,
        type: type as string,
        status: status as string,
        priority: priority as string,
        assigned_to_me: assigned_to_me === 'true',
        my_personal: my_personal === 'true',
        overdue_only: overdue_only === 'true',
        limit: validatedLimit,
      });

      res.status(200).json({ work_items: workItems });
    } catch (error) {
      WorkItemController.handleError(res, error);
    }
  }

  static async getKanbanSummary(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { project_id, sprint_id, user_id } = req.query;

      const summary = await WorkItemService.getKanbanSummary(user, {
        project_id: project_id as string | undefined,
        sprint_id: sprint_id as string | undefined,
        user_id: user_id as string | undefined,
      });

      res.status(200).json({ kanban_summary: summary, ...summary });
    } catch (error) {
      WorkItemController.handleError(res, error);
    }
  }

  static async getAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { user_id, project_id, sprint_id, start_date, end_date, fresh } = req.query;

      const analytics = await WorkItemService.getAnalytics(user, {
        user_id: user_id as string | undefined,
        project_id: project_id as string | undefined,
        sprint_id: sprint_id as string | undefined,
        start_date: start_date as string | undefined,
        end_date: end_date as string | undefined,
        fresh: fresh as string | boolean | undefined,
      });

      res.status(200).json({ analytics, ...(analytics || {}) });
    } catch (error) {
      WorkItemController.handleError(res, error);
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id } = req.params;

      const workItem = await WorkItemService.getWorkItemById(id, user);
      res.status(200).json({ work_item: workItem });
    } catch (error) {
      WorkItemController.handleError(res, error);
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id } = req.params;

      const workItem = await WorkItemService.updateWorkItem(id, user, req.body);
      res.status(200).json({ work_item: workItem, ...workItem });
    } catch (error) {
      WorkItemController.handleError(res, error);
    }
  }

  static async delete(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id } = req.params;

      const result = await WorkItemService.deleteWorkItem(id, user);
      res.status(200).json(result);
    } catch (error) {
      WorkItemController.handleError(res, error);
    }
  }

  static async addAssignees(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id } = req.params;

      const userIds = Array.isArray(req.body.user_ids)
        ? req.body.user_ids
        : req.body.user_id
        ? [req.body.user_id]
        : Array.isArray(req.body.assignee_ids)
        ? req.body.assignee_ids
        : req.body.assignee_id
        ? [req.body.assignee_id]
        : [];

      const workItem = await WorkItemService.addAssignees(id, user, userIds);
      res.status(200).json({ work_item: workItem, ...workItem });
    } catch (error) {
      WorkItemController.handleError(res, error);
    }
  }

  static async removeAssignee(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const id = req.params.id;
      const userId = req.params.userId || (req.params as any).internId;

      const result = await WorkItemService.removeAssignee(id, user, userId);
      res.status(200).json({ ...result, success: true });
    } catch (error) {
      WorkItemController.handleError(res, error);
    }
  }

  static async getComments(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id } = req.params;
      const comments = await WorkItemService.listComments(id, user);
      res.status(200).json({ comments });
    } catch (error) {
      WorkItemController.handleError(res, error);
    }
  }

  static async addComment(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id } = req.params;
      const { content } = req.body || {};
      const comment = await WorkItemService.createComment(id, content, user);
      res.status(201).json({ comment });
    } catch (error) {
      WorkItemController.handleError(res, error);
    }
  }

  static async updateComment(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id, commentId } = req.params;
      const { content } = req.body || {};
      const comment = await WorkItemService.updateComment(id, commentId, content, user);
      res.status(200).json({ comment });
    } catch (error) {
      WorkItemController.handleError(res, error);
    }
  }

  static async deleteComment(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id, commentId } = req.params;
      const result = await WorkItemService.deleteComment(id, commentId, user);
      res.status(200).json(result);
    } catch (error) {
      WorkItemController.handleError(res, error);
    }
  }

  static async requestExtension(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id } = req.params;
      const { requested_due_date, reason } = req.body || {};
      const request = await WorkItemService.requestExtension(id, user, { requested_due_date, reason });
      res.status(201).json({ extension_request: request, request, data: request });
    } catch (error) {
      WorkItemController.handleError(res, error);
    }
  }

  static async getExtensionRequests(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id } = req.params;
      const requests = await WorkItemService.getExtensionRequests(id, user);
      res.status(200).json({ extension_requests: requests, requests, data: requests });
    } catch (error) {
      WorkItemController.handleError(res, error);
    }
  }

  static async decideExtension(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id, requestId } = req.params;
      const { decision, decision_note } = req.body || {};
      const result = await WorkItemService.decideExtension(id, requestId, user, { decision, decision_note });
      res.status(200).json(result);
    } catch (error) {
      WorkItemController.handleError(res, error);
    }
  }
}
