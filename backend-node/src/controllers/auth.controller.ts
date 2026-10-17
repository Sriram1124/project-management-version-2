import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { UserService } from '../services/user.service';
import { prisma } from '../lib/prisma';
import { invalidateUserSessionCache } from '../middleware/auth.middleware';

let cachedOrganizations: { id: string; name: string }[] | null = null;
let cachedOrganizationsExpiry = 0;
const ORG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function invalidateOrganizationsCache(): void {
  cachedOrganizations = null;
  cachedOrganizationsExpiry = 0;
}

export class AuthController {
  static async getOrganizations(req: Request, res: Response): Promise<void> {
    try {
      const now = Date.now();
      let organizations = cachedOrganizations;

      if (!organizations || now > cachedOrganizationsExpiry) {
        organizations = await prisma.organization.findMany({
          where: {
            is_active: true,
          },
          select: {
            id: true,
            name: true,
          },
          orderBy: { name: 'asc' },
        });
        cachedOrganizations = organizations;
        cachedOrganizationsExpiry = now + ORG_CACHE_TTL_MS;
      }

      // Edge & Browser conditional caching: public metadata, safe for 60s browser, 300s edge
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
      res.status(200).json(organizations);
    } catch (error: any) {
      console.error('[AuthController.getOrganizations] Error:', error?.message || error);
      res.status(500).json({ error: 'Failed to fetch organizations' });
    }
  }

  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, identifier, password, organization_id } = req.body;
      const userIdentifier = (email || identifier || '').trim();
      if (!userIdentifier || !password) {
        res.status(400).json({ error: 'Email / User ID and password are required' });
        return;
      }

      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip;

      const result = await AuthService.login(userIdentifier, password, organization_id || null, userAgent, ipAddress);

      const isProduction = process.env.NODE_ENV === 'production';

      // Set session cookie
      res.cookie('sessionId', result.sessionId, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });
      
      // Set refresh token cookie
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });

      res.status(200).json({
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        sessionId: result.sessionId,
      });
    } catch (error: any) {
      console.error('[AuthController.login] Error during login:', error);
      if (error.statusCode === 403 || error.code === 'ORGANIZATION_SUSPENDED') {
        res.status(403).json({ error: error.message, code: error.code || 'ORGANIZATION_SUSPENDED' });
        return;
      }
      if (error.message === 'Invalid credentials' || error.message === 'User is inactive') {
        res.status(401).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message || 'Internal server error' });
      }
    }
  }

  static async refresh(req: Request, res: Response): Promise<void> {
    try {
      const refreshToken = (req.body && req.body.refreshToken !== undefined)
        ? req.body.refreshToken
        : req.cookies?.refreshToken;
      const sessionId = (req.body && req.body.sessionId !== undefined)
        ? req.body.sessionId
        : req.cookies?.sessionId;

      if (!refreshToken || !sessionId) {
        res.status(401).json({ error: 'Refresh token and session ID required' });
        return;
      }

      const result = await AuthService.refresh(refreshToken, sessionId);
      const isProduction = process.env.NODE_ENV === 'production';

      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000
      });

      res.cookie('sessionId', result.sessionId, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000
      });

      res.status(200).json({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        sessionId: result.sessionId,
      });
    } catch (error) {
      res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
  }

  static async logout(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = req.cookies?.sessionId || req.body?.sessionId;
      const userId = (req as any).user?.userId;
      if (sessionId) {
        await AuthService.logout(sessionId);
      }
      if (userId) {
        invalidateUserSessionCache(userId);
      }
      res.clearCookie('sessionId');
      res.clearCookie('refreshToken');
      res.status(200).json({ message: 'Logged out successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async me(req: Request, res: Response): Promise<void> {
    try {
      // 1. Reuse user already fetched and validated in authenticate middleware (zero redundant queries)
      let user = (req as any).fullUser;

      if (!user) {
        const userId = (req as any).user?.userId;
        user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            name: true,
            email: true,
            user_code: true,
            batch: true,
            is_active: true,
            must_change_password: true,
            organization_id: true,
            roles: {
              select: {
                role: {
                  select: {
                    name: true,
                    permissions: {
                      select: {
                        permission: {
                          select: { name: true }
                        }
                      }
                    }
                  }
                }
              }
            },
            project_memberships: {
              where: { project_role: 'TECH_LEAD' },
              select: { project_id: true }
            }
          }
        });
      }

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const primaryRole = user.roles?.[0]?.role;
      const roleName = primaryRole?.name || (req as any).user?.role || 'USER';
      const isInternOrEmployee = roleName === 'INTERN' || roleName === 'EMPLOYEE';

      // Security requirement 13: Hide API permissions from intern profile endpoint
      const permissions = isInternOrEmployee
        ? []
        : (primaryRole?.permissions?.map((rp: any) => rp.permission?.name || rp.name) || []);

      // Determine Tech Lead status from memberships loaded in user object
      const leadProjectIds = Array.isArray(user.project_memberships)
        ? user.project_memberships.map((m: any) => m.project_id)
        : [];
      const isTechLead = roleName === 'TECH_LEAD' || leadProjectIds.length > 0;

      // Prevent 304 stale revalidation on private user profile - deliver real HTTP 200 fast
      res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

      res.status(200).json({
        id: user.id,
        name: user.name,
        email: user.email,
        batch: user.batch || null,
        user_code: isInternOrEmployee ? undefined : user.user_code,
        must_change_password: user.must_change_password,
        organization_id: user.organization_id,
        role: roleName,
        is_tech_lead: isTechLead,
        lead_project_ids: leadProjectIds,
        permissions,
      });
    } catch (error) {
      console.error('[AuthController.me] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async changePassword(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { current_password, new_password } = req.body;
      if (!current_password || !new_password) {
        res.status(400).json({ error: 'current_password and new_password are required' });
        return;
      }

      const result = await UserService.changePassword(userId, current_password, new_password);
      invalidateUserSessionCache(userId);
      res.status(200).json(result);
    } catch (error: any) {
      if (
        error.message?.includes('incorrect') ||
        error.message?.includes('different') ||
        error.message?.includes('at least') ||
        error.message?.includes('required')
      ) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message || 'Failed to change password' });
      }
    }
  }
}
