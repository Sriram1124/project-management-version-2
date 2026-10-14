import { Request, Response } from 'express';
import { ProjectService } from '../services/project.service';
import { ProjectHealthService } from '../services/project-health.service';

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
      res.status(403).json({ error: msg, project: {} });
      return;
    }

    res.status(500).json({ error: msg });
  }

  static async getHealthOverview(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { cohort_id } = req.query as { cohort_id?: string };

      const healthOverview = await ProjectHealthService.getPortfolioHealth(user, {
        cohort_id,
      });

      res.status(200).json(healthOverview);
    } catch (error) {
      ProjectController.handleError(res, error);
    }
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
      res.status(200).json({
        ...project,
        project,
        id: project.id,
        name: project.name,
        status: project.status,
        organization_id: project.organization_id,
        owner_id: project.owner_id,
        created_at: project.created_at,
        updated_at: project.updated_at,
      });
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const project = await ProjectService.createProject(req.body, user);
      res.status(201).json({
        ...project,
        project,
        id: project.id,
        name: project.name,
        status: project.status,
        organization_id: project.organization_id,
        owner_id: project.owner_id,
        created_at: project.created_at,
        updated_at: project.updated_at,
      });
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id } = req.params;

      const project = await ProjectService.updateProject(id, req.body, user);
      res.status(200).json({
        ...project,
        project,
        id: project.id,
        name: project.name,
        status: project.status,
        organization_id: project.organization_id,
        owner_id: project.owner_id,
        created_at: project.created_at,
        updated_at: project.updated_at,
      });
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }

  static async archive(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const id = req.params.projectId || req.params.id;

      const project = await ProjectService.archiveProject(id, user);
      res.status(200).json({
        ...project,
        project,
        id: project.id,
        status: project.status,
        message: 'Project archived successfully',
      });
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
      res.status(200).json({ members, data: members });
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }

  static async addMember(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id } = req.params;
      const userId = req.body.userId || req.body.user_id || req.body.id;
      const role = req.body.role || req.body.project_role || req.body.projectRole;

      const member = await ProjectService.addProjectMember(id, userId, user, role);
      res.status(201).json({
        ...member,
        member,
        id: member.user_id,
        project_id: member.project_id,
        user_id: member.user_id,
        userId: member.user_id,
        role: member.role || member.project_role,
        user: member.user,
      });
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }

  static async removeMember(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const id = req.params.id || (req.params as any).projectId;
      const userId = req.params.userId || (req.params as any).testUserId;

      const result = await ProjectService.removeProjectMember(id, userId, user);
      res.status(200).json({
        ...result,
        message: result?.message || 'Member removed successfully',
        success: true,
      });
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }

  static async updateMemberRoles(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const { id } = req.params;
      let rawRoles = req.body?.roles || req.body?.memberRoles || req.body;

      if (!Array.isArray(rawRoles)) {
        if (rawRoles && typeof rawRoles === 'object' && (rawRoles.user_id || rawRoles.userId || rawRoles.id)) {
          rawRoles = [rawRoles];
        } else {
          res.status(400).json({ error: 'Roles must be an array of { user_id, project_role }' });
          return;
        }
      }

      const normalizedAssignments = rawRoles.map((r: any) => ({
        user_id: r.user_id || r.userId || r.id,
        project_role: r.project_role || r.role || r.projectRole,
      }));

      const members = await ProjectService.updateProjectMemberRoles(id, normalizedAssignments, user);
      res.status(200).json({
        members,
        data: members,
        roles: normalizedAssignments,
      });
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }


  static async getDocuments(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const projectId = req.params.id || (req.params as any).projectId;

      const documents = await ProjectService.getProjectDocuments(projectId, user);
      res.status(200).json({
        documents,
        data: documents,
      });
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }

  static async createDocument(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const projectId = req.params.id || (req.params as any).projectId;

      let document;
      if (req.file) {
        document = await ProjectService.uploadProjectDocumentWithFile(projectId, req.file, user);
      } else {
        document = await ProjectService.createProjectDocument(projectId, req.body, user);
      }
      res.status(201).json({
        ...document,
        document,
        id: document.id,
        documentId: document.id,
        metadataDocumentId: document.id,
        name: document.name,
      });
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }

  static async downloadDocument(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const projectId = req.params.id || (req.params as any).projectId;
      const documentId = req.params.documentId || (req.params as any).metadataDocumentId;

      const { filePath, document, mimeType } = await ProjectService.getProjectDocumentFile(projectId, documentId, user);
      res.setHeader('Content-Type', mimeType);
      res.download(filePath, document.name);
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }

  static async previewDocument(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const projectId = req.params.id || (req.params as any).projectId;
      const documentId = req.params.documentId || (req.params as any).metadataDocumentId;

      const { filePath, document, mimeType } = await ProjectService.getProjectDocumentFile(projectId, documentId, user);
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
      const projectId = req.params.id || (req.params as any).projectId;
      const documentId = req.params.documentId || (req.params as any).metadataDocumentId;

      const document = await ProjectService.updateProjectDocument(projectId, documentId, req.body, user);
      res.status(200).json({
        ...document,
        document,
        id: document.id,
        name: document.name,
        document_type: document.document_type,
      });
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }

  static async deleteDocument(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const projectId = req.params.id || (req.params as any).projectId;
      const documentId = req.params.documentId || (req.params as any).metadataDocumentId;

      const result = await ProjectService.deleteProjectDocument(projectId, documentId, user);
      res.status(200).json(result);
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }

  static async updateRequirement(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const id = req.params.id || (req.params as any).projectId;
      const documentId = req.params.documentId || (req.params as any).metadataDocumentId;
      const requirementId = req.params.requirementId;

      const requirement = await ProjectService.updateRequirement(
        id,
        documentId,
        requirementId,
        req.body,
        user
      );
      res.status(200).json({
        requirement,
        ...requirement,
        success: true,
      });
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }

  static async reparseDocument(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const id = req.params.id || (req.params as any).projectId;
      const documentId = req.params.documentId || (req.params as any).metadataDocumentId;

      const document = await ProjectService.reparseDocumentRequirements(id, documentId, user);
      res.status(200).json({
        document,
        requirements: (document as any)?.requirements || [],
        ...document,
        success: true,
      });
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }

  static async getTechLeads(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).fullUser;
      const tech_leads = await ProjectService.getTechLeadsOverview(user);
      res.status(200).json({
        tech_leads,
        techLeads: tech_leads,
        data: tech_leads,
      });
    } catch (error) {
      ProjectController.handleError(res, error);
    }
  }
}

