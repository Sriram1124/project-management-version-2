import { Request, Response } from 'express';
import { ProjectService } from '../services/project.service';

export class ProjectController {
  private static handleError(res: Response, error: any) {
    const msg = error?.message || 'Internal server error';

    if (
      msg.includes('not found') ||
      msg === 'Project not found' ||
      msg === 'Member not found in project' ||
      msg === 'Document not found in project'
    ) {
      res.status(404).json({ error: msg });
      return;
    }

    if (
      msg.includes('required') ||
      msg.includes('Invalid') ||
      msg.includes('already a member') ||
      msg.includes('cannot be') ||
      msg.includes('does not exist in your organization') ||
      msg.includes('not found in your organization')
    ) {
      res.status(400).json({ error: msg });
      return;
    }

    if (
      msg.includes('Forbidden') ||
      msg.includes('forbidden') ||
      msg.includes('permission') ||
      msg.includes('organization')
    ) {
      res.status(403).json({ error: msg });
      return;
    }

    res.status(500).json({ error: msg });
  }

  static async list(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { status, my } = req.query;

      const projects = await ProjectService.listProjects(user, {
        status: status as string,
        my: my === 'true',
      });

      res.status(200).json({ projects });
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id } = req.params;

      const project = await ProjectService.getProjectById(id, user);
      res.status(200).json({ project });
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const project = await ProjectService.createProject(req.body, user);
      res.status(201).json({ project });
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id } = req.params;

      const project = await ProjectService.updateProject(id, req.body, user);
      res.status(200).json({ project });
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }

  static async archive(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id } = req.params;

      const project = await ProjectService.archiveProject(id, user);
      res.status(200).json({ project, message: 'Project archived successfully' });
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }

  static async getMembers(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id } = req.params;
      const search = (req.query.search || req.query.q) as string | undefined;

      const members = await ProjectService.getProjectMembers(id, user, search);
      res.status(200).json({ members });
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }

  static async addMember(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id } = req.params;
      const userId = req.body.userId || req.body.user_id;

      const member = await ProjectService.addProjectMember(id, userId, user);
      res.status(201).json({ member });
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }

  static async removeMember(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id, userId } = req.params;

      const result = await ProjectService.removeProjectMember(id, userId, user);
      res.status(200).json(result);
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }

  static async getDocuments(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id } = req.params;

      const documents = await ProjectService.getProjectDocuments(id, user);
      res.status(200).json({ documents });
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }

  static async createDocument(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id } = req.params;

      let document;
      if (req.file) {
        document = await ProjectService.uploadProjectDocumentWithFile(id, req.file, user);
      } else {
        document = await ProjectService.createProjectDocument(id, req.body, user);
      }
      res.status(201).json({ document });
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }

  static async downloadDocument(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id, documentId } = req.params;

      const { filePath, document, mimeType } = await ProjectService.getProjectDocumentFile(id, documentId, user);
      res.setHeader('Content-Type', mimeType);
      res.download(filePath, document.name);
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }

  static async previewDocument(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id, documentId } = req.params;

      const { filePath, document, mimeType } = await ProjectService.getProjectDocumentFile(id, documentId, user);
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(document.name)}"`);
      res.sendFile(filePath);
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }

  static async updateDocument(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id, documentId } = req.params;

      const document = await ProjectService.updateProjectDocument(id, documentId, req.body, user);
      res.status(200).json({ document });
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }

  static async deleteDocument(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id, documentId } = req.params;

      const result = await ProjectService.deleteProjectDocument(id, documentId, user);
      res.status(200).json(result);
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }
}
