import { Request, Response } from 'express';
import { SprintService } from '../services/sprint.service';

export class SprintController {
  private static handleError(res: Response, error: any) {
    const msg = error?.message || 'Internal server error';

    if (msg.includes('not found') || msg.includes('Not found')) {
      res.status(404).json({ error: msg });
      return;
    }

    if (msg.includes('Forbidden') || msg.includes('forbidden') || msg.includes('permission')) {
      res.status(403).json({ error: msg });
      return;
    }

    if (
      msg.includes('required') ||
      msg.includes('Invalid') ||
      msg.includes('Cannot') ||
      msg.includes('cannot') ||
      msg.includes('already active') ||
      msg.includes('currently active')
    ) {
      res.status(400).json({ error: msg });
      return;
    }

    res.status(500).json({ error: msg });
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id: projectId } = req.params;
      const sprint = await SprintService.createSprint(projectId, req.body, user);
      res.status(201).json({ sprint });
    } catch (error) {
      SprintController.handleError(res, error);
    }
  }

  static async list(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id: projectId } = req.params;
      const sprints = await SprintService.listSprints(projectId, user);
      res.status(200).json({ sprints });
    } catch (error) {
      SprintController.handleError(res, error);
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id: projectId, sprintId } = req.params;
      const sprint = await SprintService.getSprintById(projectId, sprintId, user);
      res.status(200).json({ sprint });
    } catch (error) {
      SprintController.handleError(res, error);
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id: projectId, sprintId } = req.params;
      const sprint = await SprintService.updateSprint(projectId, sprintId, req.body, user);
      res.status(200).json({ sprint });
    } catch (error) {
      SprintController.handleError(res, error);
    }
  }

  static async start(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id: projectId, sprintId } = req.params;
      const sprint = await SprintService.startSprint(projectId, sprintId, user);
      res.status(200).json({ sprint, message: 'Sprint started successfully' });
    } catch (error) {
      SprintController.handleError(res, error);
    }
  }

  static async complete(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id: projectId, sprintId } = req.params;
      const { unfinished_action, target_sprint_id } = req.body;
      const sprint = await SprintService.completeSprint(
        projectId,
        sprintId,
        { unfinished_action, target_sprint_id },
        user
      );
      res.status(200).json({ sprint, message: 'Sprint completed successfully' });
    } catch (error) {
      SprintController.handleError(res, error);
    }
  }

  static async delete(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id: projectId, sprintId } = req.params;
      const result = await SprintService.deleteSprint(projectId, sprintId, user);
      res.status(200).json(result);
    } catch (error) {
      SprintController.handleError(res, error);
    }
  }
}

