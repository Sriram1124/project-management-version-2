import { Request, Response } from 'express';
import { UserService } from '../services/user.service';
import { prisma } from '../lib/prisma';

export class UserController {
  /**
   * POST /api/users
   * Manager provisions a single organization user (Intern or Employee)
   */
  static async create(req: Request, res: Response): Promise<void> {
    try {
      const fullUser = (req as any).fullUser;
      let managerOrgId = fullUser?.organization_id;

      if (!managerOrgId && (fullUser?.roles?.some((r: any) => (r.role?.name || r.name) === 'SUPER_ADMIN') || (req as any).user?.role === 'SUPER_ADMIN')) {
        if (req.body.organization_id) {
          managerOrgId = req.body.organization_id;
        } else {
          const firstOrg = await prisma.organization.findFirst({ where: { is_active: true } });
          managerOrgId = firstOrg?.id;
        }
      }

      if (!managerOrgId) {
        res.status(403).json({ error: 'Only organization managers can provision users' });
        return;
      }

      // MULTI-TENANT SECURITY RULE:
      // Reject if client tries to inject non-matching organization_id, password, or user IDs
      if (req.body.organization_id && req.body.organization_id !== managerOrgId) {
        res.status(403).json({ error: 'Security violation: organization_id does not match authorized organization context' });
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

      const { name, email, type, role, batch, subbatch, cohort_id } = req.body;
      const userType = (type || role || 'INTERN').toString().toUpperCase();

      const result = await UserService.createUser({
        name,
        email,
        type: userType,
        managerOrgId,
        batch,
        subbatch,
        cohort_id,
      });

      res.status(201).json({
        ...result,
        ...result.user,
        id: result.user.id,
        user_code: result.user.user_code,
        name: result.user.name,
        email: result.user.email,
        role: result.user.type,
        type: result.user.type,
        organization_id: managerOrgId,
        must_change_password: result.user.must_change_password,
        created_at: result.user.created_at,
        temporary_password: result.temporary_password,
        temporaryPassword: result.temporary_password,
        user: result.user,
      });
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
      } else if (msg.includes('forbidden') || msg.includes('permission') || error.statusCode === 403) {
        res.status(403).json({ error: error.message, user: {} });
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
      let managerOrgId = fullUser?.organization_id;

      if (!managerOrgId && (fullUser?.roles?.some((r: any) => (r.role?.name || r.name) === 'SUPER_ADMIN') || (req as any).user?.role === 'SUPER_ADMIN')) {
        const firstOrg = await prisma.organization.findFirst({ where: { is_active: true } });
        managerOrgId = firstOrg?.id;
      }

      if (!managerOrgId) {
        res.status(403).json({ error: 'Manager organization context required' });
        return;
      }

      let csvText = '';
      if (req.file) {
        csvText = req.file.buffer.toString('utf-8');
      } else if (Array.isArray(req.files) && (req.files as any).length > 0) {
        csvText = ((req.files as any)[0] as Express.Multer.File).buffer.toString('utf-8');
      } else if (req.body?.csv) {
        csvText = req.body.csv;
      } else if (req.body?.content) {
        csvText = req.body.content;
      } else if (req.body?.file && typeof req.body.file === 'string') {
        csvText = req.body.file;
      } else if (typeof req.body === 'string') {
        csvText = req.body;
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
   * GET /api/users/bulk/template
   * Returns schema-aware CSV template for bulk user provisioning
   */
  static async getTemplate(req: Request, res: Response): Promise<void> {
    try {
      const fullUser = (req as any).fullUser;
      let managerOrgId = fullUser?.organization_id;

      if (!managerOrgId && (fullUser?.roles?.some((r: any) => (r.role?.name || r.name) === 'SUPER_ADMIN') || (req as any).user?.role === 'SUPER_ADMIN')) {
        const firstOrg = await prisma.organization.findFirst({ where: { is_active: true } });
        managerOrgId = firstOrg?.id;
      }

      if (!managerOrgId) {
        res.status(403).json({ error: 'Manager organization context required' });
        return;
      }

      const templateCsv = await UserService.generateBulkCsvTemplate(managerOrgId);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="members_import_template.csv"');
      res.status(200).send(templateCsv);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to generate template' });
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
      console.error('createBulk error occurred:', error);
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
      let managerOrgId = fullUser?.organization_id || (req.query.organization_id as string);

      if (!managerOrgId && (fullUser?.roles?.some((r: any) => (r.role?.name || r.name) === 'SUPER_ADMIN') || (req as any).user?.role === 'SUPER_ADMIN')) {
        const firstOrg = await prisma.organization.findFirst({ where: { is_active: true } });
        managerOrgId = firstOrg?.id;
      }

      if (!managerOrgId) {
        res.status(400).json({ error: 'User does not belong to any organization' });
        return;
      }

      const typeFilter = req.query.type as string | undefined;
      const search = (req.query.search || req.query.q) as string | undefined;
      const batch = req.query.batch as string | undefined;
      const cohort = (req.query.cohort_id || req.query.cohort) as string | undefined;
      const users = await UserService.listUsers(managerOrgId, typeFilter, search, batch, cohort);

      res.status(200).json({ users, data: users });
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
      let managerOrgId = fullUser?.organization_id;

      const targetUserId = req.params.id || (req.params as any).userId;
      if (!targetUserId || targetUserId === 'undefined') {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (!managerOrgId && (fullUser?.roles?.some((r: any) => (r.role?.name || r.name) === 'SUPER_ADMIN') || (req as any).user?.role === 'SUPER_ADMIN')) {
        const target = await prisma.user.findUnique({
          where: { id: targetUserId },
          select: { organization_id: true }
        });
        managerOrgId = target?.organization_id || undefined;
      }

      if (!managerOrgId) {
        res.status(403).json({ error: 'Manager organization context required' });
        return;
      }

      // Check request body validation for password if provided:
      const { password, newPassword, new_password } = req.body || {};
      const customPassword = password ?? newPassword ?? new_password;
      if (customPassword !== undefined) {
        if (typeof customPassword !== 'string' || customPassword.length < 8) {
          res.status(400).json({ error: 'Password must be at least 8 characters long' });
          return;
        }
      }

      const result = await UserService.resetUserPassword(managerOrgId, targetUserId, customPassword);

      res.status(200).json({
        ...result,
        ...result.user,
        user: result.user,
        message: 'Password reset successfully',
      });
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
      const fullUser = (req as any).fullUser || {};
      let managerOrgId = fullUser?.organization_id;

      const targetUserId = req.params.userId || req.params.testUserId || req.params.id;
      if (!managerOrgId) {
        const target = await prisma.user.findUnique({ where: { id: targetUserId } });
        managerOrgId = target?.organization_id || undefined;
      }

      if (!managerOrgId) {
        const firstOrg = await prisma.organization.findFirst({ where: { is_active: true } });
        managerOrgId = firstOrg?.id;
      }

      const result = await UserService.deactivateUser(managerOrgId!, targetUserId);

      res.status(200).json({
        ...result,
        ...result.user,
        user: result.user,
        message: 'User deactivated successfully',
      });
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
      let managerOrgId = fullUser?.organization_id;

      const targetUserId = req.params.id || (req.params as any).userId;
      if (!targetUserId || targetUserId === 'undefined') {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (!managerOrgId && (fullUser?.roles?.some((r: any) => (r.role?.name || r.name) === 'SUPER_ADMIN') || (req as any).user?.role === 'SUPER_ADMIN')) {
        const target = await prisma.user.findUnique({
          where: { id: targetUserId },
          select: { organization_id: true }
        });
        managerOrgId = target?.organization_id || undefined;
      }

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
        req.body.roles !== undefined
      ) {
        res.status(400).json({ error: 'Security violation: Only name, batch, subbatch, and cohort_id may be updated' });
        return;
      }

      const { name, batch, subbatch, cohort_id } = req.body;

      const updatedUser = await UserService.updateMember(managerOrgId, targetUserId, {
        name,
        batch,
        subbatch,
        cohort_id,
      });

      res.status(200).json({
        user: updatedUser,
        ...updatedUser,
        id: updatedUser.id,
        name: updatedUser.name,
        message: 'Intern details updated successfully.',
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({ error: error.message || 'Failed to update member details' });
    }
  }
}
