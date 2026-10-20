import { Request, Response } from 'express';
import { TimesheetService } from '../services/timesheet.service';

export class TimesheetController {
  private static handleError(res: Response, error: any) {
    const message = error?.message || 'Internal server error';
    if (message.includes('Forbidden')) {
      res.status(403).json({ error: message });
      return;
    }
    if (message.includes('not found') || message.includes('required')) {
      res.status(404).json({ error: message });
      return;
    }
    if (message.includes('Invalid') || message.includes('must be') || message.includes('overlap')) {
      res.status(400).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }

  static async getOrganizationPolicy(req: Request, res: Response) {
    try {
      const user = (req as any).fullUser || (req as any).user;
      const organizationId =
        (req.query.organization_id as string) ||
        (req.query.organizationId as string) ||
        user?.organization_id;
      const policy = await TimesheetService.getOrganizationWorkPolicy(user, organizationId || null);
      res.status(200).json({
        ...policy,
        policy,
      });
    } catch (error) {
      TimesheetController.handleError(res, error);
    }
  }

  static async upsertOrganizationPolicy(req: Request, res: Response) {
    try {
      const user = (req as any).fullUser;
      const organizationId = req.body.organization_id as string | undefined;
      const policy = await TimesheetService.upsertOrganizationPolicy(user, req.body, organizationId || null);
      res.status(200).json({ policy, message: 'Organization work policy updated' });
    } catch (error) {
      TimesheetController.handleError(res, error);
    }
  }

  static async startSession(req: Request, res: Response) {
    try {
      const user = (req as any).fullUser;
      const session = await TimesheetService.startSession(user, req.body || {});
      res.status(201).json({ session });
    } catch (error) {
      TimesheetController.handleError(res, error);
    }
  }

  static async getActiveTaskSession(req: Request, res: Response) {
    try {
      const user = (req as any).fullUser;
      const taskId = (req.query.task_id as string) || null;
      const session = await TimesheetService.getActiveTaskSession(user, taskId);
      res.status(200).json({ session: session || null });
    } catch (error) {
      TimesheetController.handleError(res, error);
    }
  }

  static async endSession(req: Request, res: Response) {
    try {
      const user = (req as any).fullUser;
      const session = await TimesheetService.endSession(user, req.body || {});
      res.status(200).json({ session });
    } catch (error) {
      TimesheetController.handleError(res, error);
    }
  }

  static async createTimeEntry(req: Request, res: Response) {
    try {
      const user = (req as any).fullUser;
      const entry = await TimesheetService.createTimeEntry(user, req.body || {});
      res.status(201).json({ entry });
    } catch (error) {
      TimesheetController.handleError(res, error);
    }
  }

  static async updateTimeEntry(req: Request, res: Response) {
    try {
      const user = (req as any).fullUser;
      const { id } = req.params;
      const entry = await TimesheetService.updateTimeEntry(user, id, req.body || {});
      res.status(200).json({ entry });
    } catch (error) {
      TimesheetController.handleError(res, error);
    }
  }

  static async deleteTimeEntry(req: Request, res: Response) {
    try {
      const user = (req as any).fullUser;
      const { id } = req.params;
      const result = await TimesheetService.deleteTimeEntry(user, id);
      res.status(200).json(result);
    } catch (error) {
      TimesheetController.handleError(res, error);
    }
  }

  static async getTaskTimeEntries(req: Request, res: Response) {
    try {
      const user = (req as any).fullUser;
      const { taskId } = req.params;
      const result = await TimesheetService.getTaskTimeEntries(user, taskId);
      res.status(200).json(result);
    } catch (error) {
      TimesheetController.handleError(res, error);
    }
  }

  static async getTodayTimesheet(req: Request, res: Response) {
    try {
      const user = (req as any).fullUser;
      const summary = await TimesheetService.getDailyTimesheet(user, user.id, new Date());
      res.status(200).json({ timesheet: summary });
    } catch (error) {
      TimesheetController.handleError(res, error);
    }
  }

  static async getWeeklyTimesheet(req: Request, res: Response) {
    try {
      const user = (req as any).fullUser;
      const targetUserId = req.query.user_id as string | undefined;
      const dateParam = req.query.date as string | undefined;
      const statusParam = req.query.status as string | undefined;
      const priorityParam = req.query.priority as string | undefined;
      const timeFilterParam = req.query.time_filter as string | undefined;
      const searchParam = req.query.search as string | undefined;

      const summary = await TimesheetService.getWeeklyTimesheet(
        user,
        targetUserId || user.id,
        dateParam ? new Date(dateParam) : new Date(),
        {
          status: statusParam,
          priority: priorityParam,
          time_filter: timeFilterParam,
          search: searchParam,
        }
      );
      res.status(200).json({ timesheet: summary });
    } catch (error) {
      TimesheetController.handleError(res, error);
    }
  }

  static async getMonthlyTimesheet(req: Request, res: Response) {
    try {
      const user = (req as any).fullUser;
      const targetUserId = req.query.user_id as string | undefined;
      const dateParam = req.query.date as string | undefined;
      const statusParam = req.query.status as string | undefined;
      const priorityParam = req.query.priority as string | undefined;
      const timeFilterParam = req.query.time_filter as string | undefined;
      const searchParam = req.query.search as string | undefined;

      const summary = await TimesheetService.getMonthlyTimesheet(
        user,
        targetUserId || user.id,
        dateParam ? new Date(dateParam) : new Date(),
        {
          status: statusParam,
          priority: priorityParam,
          time_filter: timeFilterParam,
          search: searchParam,
        }
      );
      res.status(200).json({ timesheet: summary });
    } catch (error) {
      TimesheetController.handleError(res, error);
    }
  }

  static async getTaskTime(req: Request, res: Response) {
    try {
      const user = (req as any).fullUser;
      const targetUserId = req.query.user_id as string | undefined;
      const summary = await TimesheetService.getTaskTime(user, targetUserId || user.id, new Date());
      res.status(200).json({ timesheet: summary });
    } catch (error) {
      TimesheetController.handleError(res, error);
    }
  }

  static async getInternReport(req: Request, res: Response) {
    try {
      const user = (req as any).fullUser;
      const targetUserId = req.query.user_id as string | undefined;
      const summary = await TimesheetService.getInternReport(user, targetUserId || user.id, new Date());
      res.status(200).json({ report: summary });
    } catch (error) {
      TimesheetController.handleError(res, error);
    }
  }

  static async getManagerReport(req: Request, res: Response) {
    try {
      const user = (req as any).fullUser;
      const summary = await TimesheetService.getManagerReport(user, new Date());
      res.status(200).json({ report: summary });
    } catch (error) {
      TimesheetController.handleError(res, error);
    }
  }

  static async getIndividualReport(req: Request, res: Response) {
    try {
      const user = (req as any).fullUser;
      const period = (req.query.period as 'day' | 'week' | 'month' | undefined) || 'day';
      if (!['day', 'week', 'month'].includes(period)) {
        res.status(400).json({ error: 'period must be day, week, or month' });
        return;
      }
      const report = await TimesheetService.getIndividualReport(
        user,
        req.params.userId,
        period,
        req.query.date as string | undefined,
        req.query.start_date as string | undefined,
        req.query.end_date as string | undefined
      );
      res.status(200).json({ report });
    } catch (error) {
      TimesheetController.handleError(res, error);
    }
  }

  static async getManagerTimesheetsReview(req: Request, res: Response) {
    try {
      const user = (req as any).fullUser;
      const { date, search, page, limit, period } = req.query as Record<string, string | undefined>;
      const cohort_id = (req.query.cohort_id || req.query.cohortId || req.query.cohort) as string | undefined;
      const project_id = (req.query.project_id || req.query.projectId || req.query.project) as string | undefined;
      const review = await TimesheetService.getManagerTimesheetsReview(user, {
        date,
        period: (period as any) || 'WEEK',
        search,
        cohort_id,
        project_id,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      });
      res.status(200).json(review);
    } catch (error) {
      TimesheetController.handleError(res, error);
    }
  }

  static async requestTimeCorrection(req: Request, res: Response) {
    try {
      const user = (req as any).fullUser;
      const result = await TimesheetService.requestTimeCorrection(user, req.body || {});
      res.status(201).json(result);
    } catch (error) {
      TimesheetController.handleError(res, error);
    }
  }

  static async getTimeCorrections(req: Request, res: Response) {
    try {
      const user = (req as any).fullUser;
      const { status, user_id } = req.query as Record<string, string | undefined>;
      const result = await TimesheetService.getTimeCorrections(user, { status, user_id });
      res.status(200).json(result);
    } catch (error) {
      TimesheetController.handleError(res, error);
    }
  }

  static async reviewTimeCorrection(req: Request, res: Response) {
    try {
      const user = (req as any).fullUser;
      const { requestId } = req.params;
      const { decision, decision_note } = req.body || {};
      const result = await TimesheetService.reviewTimeCorrection(user, requestId, decision, decision_note);
      res.status(200).json(result);
    } catch (error) {
      TimesheetController.handleError(res, error);
    }
  }
}
