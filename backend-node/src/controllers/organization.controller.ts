import { Request, Response } from 'express';
import { OrganizationService } from '../services/organization.service';
import { AuditService } from '../services/audit.service';

export class OrganizationController {
  /**
   * POST /api/organizations
   * Super Admin creates Organization (standalone or with initial manager)
   */
  static async create(req: Request, res: Response): Promise<void> {
    try {
      const { organizationName, name, managerName, managerEmail } = req.body;
      const targetOrgName = (organizationName || name || '').trim();
      const actorId = (req as any).user?.userId;

      if (!targetOrgName) {
        res.status(400).json({
          error: 'Organization name is required',
        });
        return;
      }

      // If manager details provided, create organization + manager atomically
      if (managerName && managerEmail) {
        const result = await OrganizationService.createOrganizationWithManager({
          organizationName: targetOrgName,
          managerName,
          managerEmail,
          actorId,
        });
        res.status(201).json(result);
        return;
      }

      // Standalone organization creation
      const result = await OrganizationService.createOrganizationOnly({
        name: targetOrgName,
        actorId,
      });

      res.status(201).json(result);
    } catch (error: any) {
      const statusCode = error.statusCode || (error.message?.includes('already exists') ? 409 : 500);
      res.status(statusCode).json({ error: error.message || 'Failed to create organization' });
    }
  }

  /**
   * GET /api/organizations/:id/managers/template
   * Download CSV template for bulk manager provisioning
   */
  static async getManagerTemplate(req: Request, res: Response): Promise<void> {
    try {
      const csvTemplate = 'name,email\nJohn Doe,john@example.com\nJane Smith,jane@example.com\n';
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="manager-import-template.csv"');
      res.status(200).send(csvTemplate);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to generate template' });
    }
  }

  /**
   * POST /api/organizations/:id/managers/validate-csv
   * Validate CSV content for bulk manager provisioning
   */
  static async validateBulkCsv(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.params.id;
      const { csvText } = req.body;

      if (!csvText || typeof csvText !== 'string') {
        res.status(400).json({ error: 'csvText string is required' });
        return;
      }

      const result = await OrganizationService.validateBulkManagerCsv(csvText, organizationId);
      res.status(200).json(result);
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({ error: error.message || 'Failed to validate CSV' });
    }
  }

  /**
   * POST /api/organizations/:id/managers/bulk
   * Execute bulk manager provisioning
   */
  static async importManagersBulk(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.params.id;
      const { rows } = req.body;
      const actorId = (req as any).user?.userId;

      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        res.status(400).json({ error: 'Valid rows array is required' });
        return;
      }

      const result = await OrganizationService.importManagersBulk({
        organizationId,
        rows,
        actorId,
      });

      res.status(201).json(result);
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({ error: error.message || 'Failed to import managers' });
    }
  }

  /**
   * POST /api/organizations/:id/managers
   * Super Admin provisions an additional manager into an existing organization
   */
  static async addManager(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.params.id;
      const { managerName, managerEmail } = req.body;
      const actorId = (req as any).user?.userId;

      if (!managerName || !managerEmail) {
        res.status(400).json({ error: 'managerName and managerEmail are required' });
        return;
      }

      const result = await OrganizationService.addManagerToOrganization({
        organizationId,
        managerName,
        managerEmail,
        actorId,
      });

      res.status(201).json(result);
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({ error: error.message || 'Failed to add manager' });
    }
  }

  /**
   * POST /api/organizations/:id/managers/:managerId/reset-password
   * Super Admin securely resets an organization manager's password
   */
  static async resetManagerPassword(req: Request, res: Response): Promise<void> {
    try {
      const { id: organizationId, managerId } = req.params;
      const actorId = (req as any).user?.userId;

      const result = await OrganizationService.resetManagerPassword({
        organizationId,
        managerId,
        actorId,
      });

      res.status(200).json(result);
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({ error: error.message || 'Failed to reset manager password' });
    }
  }

  /**
   * PATCH /api/organizations/:id
   * Super Admin updates organization details
   */
  static async update(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.params.id;
      const { name } = req.body;
      const actorId = (req as any).user?.userId;

      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: 'name is required' });
        return;
      }

      const result = await OrganizationService.updateOrganization({
        organizationId,
        name,
        actorId,
      });

      res.status(200).json(result);
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({ error: error.message || 'Failed to update organization' });
    }
  }

  /**
   * POST /api/organizations/:id/toggle-status
   * Super Admin suspends or reactivates an organization
   */
  static async toggleStatus(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.params.id;
      const { is_active, reason } = req.body;
      const actorId = (req as any).user?.userId;

      if (typeof is_active !== 'boolean') {
        res.status(400).json({ error: 'is_active boolean is required' });
        return;
      }

      const result = await OrganizationService.toggleOrganizationStatus({
        organizationId,
        isActive: is_active,
        reason,
        actorId,
      });

      res.status(200).json(result);
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({ error: error.message || 'Failed to toggle organization status' });
    }
  }

  /**
   * GET /api/organizations/platform-overview
   * Super Admin retrieves global overview KPIs, status distribution, and recent activity
   */
  static async getPlatformOverview(req: Request, res: Response): Promise<void> {
    try {
      const overview = await OrganizationService.getPlatformOverview();
      res.status(200).json(overview);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch platform overview' });
    }
  }

  /**
   * GET /api/organizations
   * Super Admin lists all organizations with metrics, search, sorting, and pagination
   */
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const search = req.query.search as string | undefined;
      const status = req.query.status as 'all' | 'active' | 'suspended' | undefined;
      const sortBy = req.query.sortBy as 'created_at' | 'name' | 'users' | 'projects' | undefined;
      const sortOrder = req.query.sortOrder as 'asc' | 'desc' | undefined;
      const page = req.query.page ? Number(req.query.page) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;

      const result = await OrganizationService.listOrganizations({
        search,
        status,
        sortBy,
        sortOrder,
        page,
        limit,
      });

      // Maintain backward compatibility for existing frontend clients expecting { organizations: [...] }
      res.status(200).json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to list organizations' });
    }
  }

  /**
   * GET /api/organizations/:id
   * Super Admin gets details of a single organization
   */
  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const organization = await OrganizationService.getOrganizationById(id);
      res.status(200).json({ organization });
    } catch (error: any) {
      const statusCode = error.statusCode || (error.message === 'Organization not found' ? 404 : 500);
      res.status(statusCode).json({ error: error.message || 'Failed to fetch organization details' });
    }
  }

  /**
   * GET /api/organizations/:id/members
   * Super Admin gets paginated members of an organization
   */
  static async getMembers(req: Request, res: Response): Promise<void> {
    try {
      const { id: organizationId } = req.params;
      const search = req.query.search as string | undefined;
      const role = req.query.role as string | undefined;
      const page = req.query.page ? Number(req.query.page) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;

      const result = await OrganizationService.getOrganizationMembers({
        organizationId,
        search,
        role,
        page,
        limit,
      });

      res.status(200).json(result);
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({ error: error.message || 'Failed to list organization members' });
    }
  }

  /**
   * GET /api/organizations/audit-logs
   * Super Admin lists platform audit logs
   */
  static async getAuditLogs(req: Request, res: Response): Promise<void> {
    try {
      const page = req.query.page ? Number(req.query.page) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const action = req.query.action as string | undefined;
      const targetType = req.query.targetType as string | undefined;
      const organizationId = req.query.organizationId as string | undefined;

      const result = await AuditService.listLogs({
        page,
        limit,
        action,
        targetType,
        organizationId,
      });

      res.status(200).json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch audit logs' });
    }
  }
}
