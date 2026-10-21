import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { cacheService } from '../services/cache.service';

const router = Router();
router.use(authenticate);

/**
 * GET /api/cohorts
 * List active intern cohorts for the authenticated user's organization
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const orgId = (req as any).user?.organization_id || (req as any).fullUser?.organization_id;

    if (!orgId) {
      res.status(200).json([]);
      return;
    }

    const cacheKey = `org:${orgId}:cohorts`;
    const cohorts = await cacheService.getOrSet(cacheKey, 60, async () => {
      return await prisma.cohort.findMany({
        where: {
          organization_id: orgId,
          is_active: true,
        },
        select: {
          id: true,
          name: true,
          code: true,
          description: true,
          _count: {
            select: {
              users: true,
            },
          },
        },
        orderBy: {
          code: 'asc',
        },
      });
    });

    res.status(200).json(cohorts);
  } catch (error) {
    console.error('Failed to list cohorts:', error);
    res.status(500).json({ error: 'Failed to fetch cohorts' });
  }
});

export { router as cohortRouter };
