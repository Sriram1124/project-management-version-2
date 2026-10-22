import { Router } from 'express';
import { authenticateMiraiService, requirePermission } from '../middleware/auth.middleware';
import { ProjectService } from '../services/project.service';

const router = Router();

// Dedicated M2M service-to-service authentication
router.use(authenticateMiraiService);

/**
 * GET {PM_BASE}/internal/mirai/v1/users/:mirai_user_id/project-memberships
 * Returns all active verified project IDs for a MIRAI user UUID.
 * Conforms strictly to docs/architecture/pm-membership-contract.md.
 */
router.get(
  '/users/:mirai_user_id/project-memberships',
  requirePermission('PROJECT_READ'),
  async (req, res): Promise<void> => {
    const { mirai_user_id } = req.params;
    const user = (req as any).fullUser;
    const as_of = new Date().toISOString();

    if (!mirai_user_id || typeof mirai_user_id !== 'string' || !mirai_user_id.trim()) {
      res.status(200).json({
        mirai_user_id: mirai_user_id || '',
        mapping_status: 'unmapped',
        project_ids: [],
        as_of,
      });
      return;
    }

    try {
      const result = await ProjectService.getUserProjectMemberships(mirai_user_id.trim(), user);
      res.status(200).json({
        mirai_user_id: mirai_user_id.trim(),
        mapping_status: 'mapped',
        project_ids: result.project_ids,
        as_of,
      });
    } catch (err: any) {
      if (err.message === 'User not found') {
        res.status(200).json({
          mirai_user_id: mirai_user_id.trim(),
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
      const result = await ProjectService.checkProjectMembership(project_id.trim(), mirai_user_id.trim(), user);
      res.status(200).json({
        mirai_user_id: mirai_user_id.trim(),
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

