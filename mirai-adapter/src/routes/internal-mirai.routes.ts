import { Router } from 'express';
import { authenticateMiraiService } from '../authentication/service-auth.middleware';
import { requirePermission } from '../../../backend-node/src/middleware/auth.middleware';
import { IdentityMappingService } from '../identity-mapping/identity-mapping.service';
import { ProjectMembershipService } from '../membership/project-membership.service';

const router = Router();

// Dedicated M2M service-to-service authentication
router.use(authenticateMiraiService);

/**
 * POST {PM_BASE}/internal/mirai/v1/identities/reconcile
 * Alias POST {PM_BASE}/internal/mirai/v1/users/:mirai_user_id/reconcile
 * Dedicated authenticated endpoint for resolving or automatically mapping Django user to PM user.
 * Conforms to Django contract:
 * {
 *   "mirai_user_id": "<synthetic-or-real-Django-UUID-at-runtime>",
 *   "email": "<Django-user-email-at-runtime>"
 * }
 * Organization is derived strictly from verified service JWT claims (fullUser.organization_id).
 */
router.post(
  ['/identities/reconcile', '/users/:mirai_user_id/reconcile'],
  requirePermission('PROJECT_READ'),
  async (req, res): Promise<void> => {
    const mirai_user_id = req.body?.mirai_user_id || req.params?.mirai_user_id;
    const email = req.body?.email || (req.query?.email as string);
    const user = (req as any).fullUser;

    if (!mirai_user_id || typeof mirai_user_id !== 'string' || !mirai_user_id.trim()) {
      res.status(400).json({ error: 'mirai_user_id is required' });
      return;
    }

    try {
      const result = await IdentityMappingService.reconcileIdentity(mirai_user_id.trim(), email, user);
      res.status(200).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }
);

/**
 * GET {PM_BASE}/internal/mirai/v1/users/:mirai_user_id/project-memberships
 * Alias GET {PM_BASE}/internal/mirai/v1/users/:mirai_user_id/memberships
 * Returns all active verified project IDs for a MIRAI user UUID.
 * Conforms strictly to docs/architecture/pm-membership-contract.md.
 */
router.get(
  ['/users/:mirai_user_id/project-memberships', '/users/:mirai_user_id/memberships'],
  requirePermission('PROJECT_READ'),
  async (req, res): Promise<void> => {
    const { mirai_user_id } = req.params;
    const email = (req.query?.email as string) || (req.headers['x-user-email'] as string);
    const user = (req as any).fullUser;
    const as_of = new Date().toISOString();

    if (!mirai_user_id || typeof mirai_user_id !== 'string' || !mirai_user_id.trim()) {
      res.status(200).json({
        mirai_user_id: mirai_user_id || '',
        pm_user_id: null,
        mapping_status: 'unmapped',
        project_ids: [],
        as_of,
      });
      return;
    }

    try {
      const result = await ProjectMembershipService.getUserProjectMemberships(mirai_user_id.trim(), user, email);
      res.status(200).json({
        mirai_user_id: mirai_user_id.trim(),
        pm_user_id: result.pm_user_id,
        mapping_status: 'mapped',
        project_ids: result.project_ids,
        as_of,
      });
    } catch (err: any) {
      if (err.message === 'User not found') {
        res.status(200).json({
          mirai_user_id: mirai_user_id.trim(),
          pm_user_id: null,
          mapping_status: 'unmapped',
          project_ids: [],
          as_of,
        });
        return;
      }
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }
);

/**
 * GET {PM_BASE}/internal/mirai/v1/users/:mirai_user_id/projects/:project_id/membership
 * Check single project membership for a MIRAI user UUID and Project UUID.
 * Conforms strictly to docs/architecture/pm-membership-contract.md.
 */
router.get(
  '/users/:mirai_user_id/projects/:project_id/membership',
  requirePermission('PROJECT_READ'),
  async (req, res): Promise<void> => {
    const { mirai_user_id, project_id } = req.params;
    const email = (req.query?.email as string) || (req.headers['x-user-email'] as string);
    const user = (req as any).fullUser;
    const as_of = new Date().toISOString();

    if (!mirai_user_id || !project_id) {
      res.status(200).json({
        mirai_user_id: mirai_user_id || '',
        project_id: project_id || '',
        mapping_status: 'unmapped',
        is_member: false,
        role_in_project: null,
        as_of,
      });
      return;
    }

    try {
      const result = await ProjectMembershipService.checkProjectMembership(project_id.trim(), mirai_user_id.trim(), user, email);
      res.status(200).json({
        mirai_user_id: mirai_user_id.trim(),
        pm_user_id: result.pm_user_id,
        project_id: project_id.trim(),
        mapping_status: 'mapped',
        is_member: result.is_member,
        role_in_project: result.project_role || (result.is_member ? 'participant' : null),
        as_of,
      });
    } catch (err: any) {
      if (err.message === 'User not found' || err.message === 'Project not found') {
        res.status(200).json({
          mirai_user_id: mirai_user_id.trim(),
          project_id: project_id.trim(),
          mapping_status: 'unmapped',
          is_member: false,
          role_in_project: null,
          as_of,
        });
        return;
      }
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }
);

export const internalMiraiRouter = router;

