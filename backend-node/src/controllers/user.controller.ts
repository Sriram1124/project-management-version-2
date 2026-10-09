import { Request, Response } from 'express';
import { UserService } from '../services/user.service';

export class UserController {
  /**
   * POST /api/users
   * Manager provisions a single organization user (Intern or Employee)
   */
  static async create(req: Request, res: Response): Promise<void> {
    try {
      const fullUser = (req as any).fullUser;
      const managerOrgId = fullUser?.organization_id;

      if (!managerOrgId) {
        res.status(403).json({ error: 'Only organization managers can provision users' });
        return;
      }

      // MULTI-TENANT SECURITY RULE:
      // Reject if client tries to inject organization_id, password, or user IDs
      if (req.body.organization_id !== undefined) {
        res.status(400).json({ error: 'Security violation: organization_id cannot be specified' });
        return;
      }
      if (req.body.password !== undefined || req.body.password_hash !== undefined) {
        res.status(400).json({ error: 'Security violation: passwords cannot be provided during provisioning' });
        return;
      }
      if (req.body.user_id !== undefined || req.body.user_code !== undefined) {
        res.status(400).json({ error: 'Security violation: user IDs are automatically generated' });
        return;
      }

      const { name, email, type } = req.body;

      const result = await UserService.createUser({
        name,
        email,
        type,
        managerOrgId,
      });

      res.status(201).json(result);
    } catch (error: any) {
      const msg = error.message?.toLowerCase() || '';
      if (error.statusCode === 409 || msg.includes('already exists')) {
        res.status(409).json({ error: error.message });
      } else if (
        msg.includes('required') ||
        msg.includes('invalid') ||
        msg.includes('exceed') ||
        msg.includes('must be') ||
        msg.includes('type')
      ) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message || 'Failed to create user' });
      }
    }
  }

  /**
   * POST /api/users/bulk/validate
   * Validates CSV for bulk import preview
   */
  static async validateCsv(req: Request, res: Response): Promise<void> {
    try {
      const fullUser = (req as any).fullUser;
      const managerOrgId = fullUser?.organization_id;

      if (!managerOrgId) {
        res.status(403).json({ error: 'Manager organization context required' });
        return;
      }

      let csvText = '';
      if (req.file) {
        csvText = req.file.buffer.toString('utf-8');
      } else if (req.body?.csv) {
        csvText = req.body.csv;
      } else {
        res.status(400).json({ error: 'No CSV file or content provided' });
        return;
      }

      const validation = await UserService.validateBulkCsv(csvText, managerOrgId);
      res.status(200).json(validation);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to validate CSV' });
    }
  }

  /**
   * POST /api/users/bulk
   * Confirms bulk creation of users in an all-or-nothing transaction
   */
  static async createBulk(req: Request, res: Response): Promise<void> {
    try {
      const fullUser = (req as any).fullUser;
      const managerOrgId = fullUser?.organization_id;

      if (!managerOrgId) {
        res.status(403).json({ error: 'Manager organization context required' });
        return;
      }

      let rowsToCreate = req.body?.rows;

      // Also support direct CSV upload and create
      if (!rowsToCreate && req.file) {
        const csvText = req.file.buffer.toString('utf-8');
        const validation = await UserService.validateBulkCsv(csvText, managerOrgId);
        if (!validation.isValid) {
          res.status(400).json({
            error: 'Bulk import could not be completed.',
            reason: 'CSV validation failed. Please resolve errors before creating users.',
            errors: validation.errors,
          });
          return;
        }
        rowsToCreate = validation.validRows;
      }

      if (!rowsToCreate || !Array.isArray(rowsToCreate) || rowsToCreate.length === 0) {
        res.status(400).json({
          error: 'Bulk import could not be completed.',
          reason: 'No valid candidate rows confirmed for bulk creation.',
        });
        return;
      }

      // Extra multi-tenant security verification: ensure no row attempts to inject organization_id
      for (const row of rowsToCreate) {
        if ((row as any).organization_id) {
          res.status(400).json({
            error: 'Bulk import could not be completed.',
            reason: 'Security violation: organization_id cannot be supplied in rows.',
          });
          return;
        }
      }

      const result = await UserService.createUsersBulk(rowsToCreate, managerOrgId);
      res.status(201).json(result);
    } catch (error: any) {
      const statusCode =
        error.statusCode ||
        (error.message?.includes('already exist') ||
        error.message?.includes('unavailable') ||
        error.message?.includes('conflict')
          ? 409
          : 500);

      res.status(statusCode).json({
        error: 'Bulk import could not be completed.',
        reason:
          error.message ||
          'One or more users already exist or could not be assigned a unique User ID. Please review the validation results and try again.',
        conflicts: error.conflicts || [],
      });
    }
  }

  /**
   * GET /api/users
   * Lists users in the authenticated Manager's organization with optional ?type=INTERN|EMPLOYEE&search=...&batch=...
   */
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const fullUser = (req as any).fullUser;
      const managerOrgId = fullUser?.organization_id;

      if (!managerOrgId) {
        res.status(400).json({ error: 'User does not belong to any organization' });
        return;
      }

      const typeFilter = req.query.type as string | undefined;
      const search = (req.query.search || req.query.q) as string | undefined;
      const batch = req.query.batch as string | undefined;
      const cohort = (req.query.cohort_id || req.query.cohort) as string | undefined;
      const users = await UserService.listUsers(managerOrgId, typeFilter, search, batch, cohort);

      res.status(200).json({ users });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to list organization users' });
    }
  }

  /**
   * PATCH /api/users/profile
   * Authenticated user updates their own profile
   */
  static async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { name, batch } = req.body;
      const updated = await UserService.updateProfile(userId, { name, batch });
      res.status(200).json({ user: updated, message: 'Profile updated successfully' });
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({ error: error.message || 'Failed to update profile' });
    }
  }

  /**
   * POST /api/users/:id/reset-password
   * Manager resets an organization user's password, generating a new temporary password
   */
  static async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const fullUser = (req as any).fullUser;
      const managerOrgId = fullUser?.organization_id;

      if (!managerOrgId) {
        res.status(403).json({ error: 'Manager organization context required' });
        return;
      }

      const targetUserId = req.params.id;
      const result = await UserService.resetUserPassword(managerOrgId, targetUserId);

      res.status(200).json(result);
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({ error: error.message || 'Failed to reset user password' });
    }
  }

  /**
   * POST /api/users/:id/deactivate
   * Manager deactivates an organization user (soft deactivation)
   */
  static async deactivate(req: Request, res: Response): Promise<void> {
    try {
      const fullUser = (req as any).fullUser;
      const managerOrgId = fullUser?.organization_id;

      if (!managerOrgId) {
        res.status(403).json({ error: 'Manager organization context required' });
        return;
      }

      const targetUserId = req.params.id;
      const result = await UserService.deactivateUser(managerOrgId, targetUserId);

      res.status(200).json(result);
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({ error: error.message || 'Failed to deactivate user' });
    }
  }

  /**
   * PATCH /api/users/:id
   * Manager updates an organization member's permitted details (name, batch, subbatch)
   */
  static async updateMember(req: Request, res: Response): Promise<void> {
    try {
      const fullUser = (req as any).fullUser;
      const managerOrgId = fullUser?.organization_id;

      if (!managerOrgId) {
        res.status(403).json({ error: 'Manager organization context required' });
        return;
      }

      // Security check: reject attempts to modify forbidden fields
      if (
        req.body.organization_id !== undefined ||
        req.body.password !== undefined ||
        req.body.password_hash !== undefined ||
        req.body.email !== undefined ||
        req.body.role !== undefined ||
        req.body.roles !== undefined ||
        req.body.cohort_id !== undefined
      ) {
        res.status(400).json({ error: 'Security violation: Only name, batch, and subbatch may be updated' });
        return;
      }

      const targetUserId = req.params.id;
      const { name, batch, subbatch } = req.body;

      const updatedUser = await UserService.updateMember(managerOrgId, targetUserId, {
        name,
        batch,
        subbatch,
      });

      res.status(200).json({
        user: updatedUser,
        message: 'Intern details updated successfully.',
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({ error: error.message || 'Failed to update member details' });
    }
  }
}
