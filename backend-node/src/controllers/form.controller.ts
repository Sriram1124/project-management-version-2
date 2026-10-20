import { Request, Response } from 'express';
import { FormService } from '../services/form.service';

export class FormController {
  private static handleError(res: Response, err: any) {
    const msg = err?.message || 'Internal server error';
    if (msg.includes('not found') || err?.code === 'P2025') {
      res.status(404).json({ error: msg });
      return;
    }
    if (
      msg.includes('required') ||
      msg.includes('Invalid') ||
      msg.includes('already submitted') ||
      msg.includes('archived') ||
      msg.includes('available for submission')
    ) {
      res.status(400).json({ error: msg });
      return;
    }
    if (msg.includes('Forbidden') || msg.includes('permission')) {
      res.status(403).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }

  static async listForms(req: Request, res: Response): Promise<void> {
    try {
      const fullUser = (req as any).fullUser || {};
      const user = (req as any).user || {};
      const orgId = fullUser.organization_id || user.organization_id;
      const role = user.role || fullUser.role || 'INTERN';
      const userId = fullUser.id || user.id;

      const cohortId = (req.query.cohort_id as string) || (req.query.cohortId as string) || (req.query.cohort as string) || undefined;
      const forms = await FormService.listForms(orgId, role, userId, cohortId);
      res.status(200).json({ forms, data: forms });
    } catch (err: any) {
      FormController.handleError(res, err);
    }
  }

  static async getForm(req: Request, res: Response): Promise<void> {
    try {
      const formId = req.params.formId || req.params.id;
      const fullUser = (req as any).fullUser || {};
      const orgId = fullUser.organization_id || (req as any).user?.organization_id;

      const form = await FormService.getForm(formId, orgId);
      if (!form) {
        res.status(404).json({ error: 'Form not found' });
        return;
      }
      res.status(200).json({
        ...form,
        form,
      });
    } catch (err: any) {
      FormController.handleError(res, err);
    }
  }

  static async createForm(req: Request, res: Response): Promise<void> {
    try {
      const fullUser = (req as any).fullUser || {};
      const user = (req as any).user || {};
      const orgId = fullUser.organization_id || user.organization_id;
      const userId = fullUser.id || user.id;

      const form = await FormService.createForm(req.body, orgId, userId);
      res.status(201).json({
        ...form,
        form,
        id: form.id,
        title: form.title,
        description: form.description,
        status: form.status,
        target_roles: form.target_roles,
        deadline: form.deadline,
        organization_id: form.organization_id,
        creator_id: form.creator_id,
        created_at: form.created_at,
        updated_at: form.updated_at,
      });
    } catch (err: any) {
      FormController.handleError(res, err);
    }
  }

  static async updateForm(req: Request, res: Response): Promise<void> {
    try {
      const formId = req.params.formId || req.params.id;
      const orgId = (req as any).fullUser?.organization_id || (req as any).user?.organization_id;
      const form = await FormService.updateForm(formId, req.body, orgId);
      res.status(200).json({
        ...form,
        form,
        id: form.id,
        title: form.title,
        status: form.status,
      });
    } catch (err: any) {
      FormController.handleError(res, err);
    }
  }

  static async publishForm(req: Request, res: Response): Promise<void> {
    try {
      const formId = req.params.formId || req.params.id;
      const orgId = (req as any).fullUser?.organization_id || (req as any).user?.organization_id;
      const form = await FormService.updateStatus(formId, 'PUBLISHED' as any, orgId);
      res.status(200).json({
        ...form,
        form,
        id: form.id,
        status: form.status,
      });
    } catch (err: any) {
      FormController.handleError(res, err);
    }
  }

  static async revertForm(req: Request, res: Response): Promise<void> {
    try {
      const formId = req.params.formId || req.params.id;
      const orgId = (req as any).fullUser?.organization_id || (req as any).user?.organization_id;
      const form = await FormService.revertForm(formId, orgId);
      res.status(200).json({
        ...form,
        form,
        id: form.id,
        status: form.status,
      });
    } catch (err: any) {
      FormController.handleError(res, err);
    }
  }

  static async archiveForm(req: Request, res: Response): Promise<void> {
    try {
      const formId = req.params.formId || req.params.id;
      const orgId = (req as any).fullUser?.organization_id || (req as any).user?.organization_id;
      const form = await FormService.updateStatus(formId, 'ARCHIVED' as any, orgId);
      res.status(200).json({
        ...form,
        form,
        id: form.id,
        status: form.status,
      });
    } catch (err: any) {
      FormController.handleError(res, err);
    }
  }

  static async addQuestion(req: Request, res: Response): Promise<void> {
    try {
      const formId = req.params.formId || req.params.id;
      const question = await FormService.addQuestion(formId, req.body);
      res.status(201).json({
        ...question,
        question,
        id: question.id,
      });
    } catch (err: any) {
      FormController.handleError(res, err);
    }
  }

  static async updateQuestion(req: Request, res: Response): Promise<void> {
    try {
      const questionId = req.params.questionId;
      const question = await FormService.updateQuestion(questionId, req.body);
      res.status(200).json({
        ...question,
        question,
        id: question.id,
      });
    } catch (err: any) {
      FormController.handleError(res, err);
    }
  }

  static async deleteQuestion(req: Request, res: Response): Promise<void> {
    try {
      const questionId = req.params.questionId;
      await FormService.deleteQuestion(questionId);
      res.status(200).json({ success: true, message: 'Question deleted successfully' });
    } catch (err: any) {
      FormController.handleError(res, err);
    }
  }

  static async deleteForm(req: Request, res: Response): Promise<void> {
    try {
      const formId = req.params.formId || req.params.id;
      await FormService.deleteForm(formId);
      res.status(200).json({ success: true, message: 'Form deleted successfully' });
    } catch (err: any) {
      FormController.handleError(res, err);
    }
  }

  static async submitForm(req: Request, res: Response): Promise<void> {
    try {
      const formId = req.params.formId || req.params.id;
      const submitterId = (req as any).fullUser?.id || (req as any).user?.id;
      const answers = req.body?.answers || req.body?.responses || [];
      const submission = await FormService.submitForm(formId, submitterId, answers);
      res.status(201).json({
        ...submission,
        submission,
        id: submission.id,
      });
    } catch (err: any) {
      FormController.handleError(res, err);
    }
  }

  static async listSubmissions(req: Request, res: Response): Promise<void> {
    try {
      const formId = req.params.formId || req.params.id;
      const orgId = (req as any).fullUser?.organization_id || (req as any).user?.organization_id;
      const submissions = await FormService.listSubmissions(formId, orgId);
      res.status(200).json({ submissions, data: submissions });
    } catch (err: any) {
      FormController.handleError(res, err);
    }
  }

  static async getMySubmission(req: Request, res: Response): Promise<void> {
    try {
      const formId = req.params.formId || req.params.id;
      const userId = (req as any).fullUser?.id || (req as any).user?.id;
      const orgId = (req as any).fullUser?.organization_id || (req as any).user?.organization_id;
      const mySubmission = await FormService.getMySubmission(formId, userId, orgId);
      res.status(200).json({
        submission: mySubmission || null,
        data: mySubmission || null,
        ...(mySubmission ? mySubmission : {}),
      });
    } catch (err: any) {
      FormController.handleError(res, err);
    }
  }

  static async getOverdueSummary(req: Request, res: Response): Promise<void> {
    try {
      const fullUser = (req as any).fullUser || {};
      const user = (req as any).user || {};
      const orgId = fullUser.organization_id || user.organization_id;
      const cohortId = (req.query.cohort_id as string) || (req.query.cohortId as string) || undefined;
      const formId = (req.query.form_id as string) || (req.query.formId as string) || undefined;

      const data = await FormService.getOverdueData(orgId, cohortId, formId);
      res.status(200).json(data);
    } catch (err: any) {
      FormController.handleError(res, err);
    }
  }

  static async exportOverdueReport(req: Request, res: Response): Promise<void> {
    try {
      const fullUser = (req as any).fullUser || {};
      const user = (req as any).user || {};
      const orgId = fullUser.organization_id || user.organization_id;
      const cohortId = (req.query.cohort_id as string) || (req.query.cohortId as string) || undefined;
      const formId = (req.query.form_id as string) || (req.query.formId as string) || undefined;
      const format = (req.query.format as string)?.toLowerCase();

      if (format === 'csv') {
        const result = await FormService.generateOverdueCsv(orgId, cohortId, formId);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        res.status(200).send(result.csv);
        return;
      }

      const result = await FormService.generateOverdueExcel(orgId, cohortId, formId);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.status(200).send(result.buffer);
    } catch (err: any) {
      FormController.handleError(res, err);
    }
  }
}

