import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { UserService } from '../services/user.service';
import { prisma } from '../lib/prisma';

export class AuthController {
  static async getOrganizations(req: Request, res: Response): Promise<void> {
    try {
      const organizations = await prisma.organization.findMany({
        select: {
          id: true,
          name: true,
        },
        orderBy: { name: 'asc' },
      });
      res.status(200).json(organizations);
    } catch (error) {
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
      if (error.message === 'Invalid credentials' || error.message === 'User is inactive') {
        res.status(401).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message || 'Internal server error' });
      }
    }
  }

  static async refresh(req: Request, res: Response): Promise<void> {
    try {
      const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
      const sessionId = req.cookies?.sessionId || req.body?.sessionId;

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
      if (sessionId) {
        await AuthService.logout(sessionId);
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
      const userId = (req as any).user.userId;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          roles: {
            include: {
              role: {
                include: {
                  permissions: {
                    include: {
                      permission: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const primaryRole = user.roles[0]?.role;
      const roleName = primaryRole?.name || 'USER';
      const isInternOrEmployee = roleName === 'INTERN' || roleName === 'EMPLOYEE';

      // Security requirement 13: Hide API permissions from intern profile endpoint
      const permissions = isInternOrEmployee
        ? []
        : (primaryRole?.permissions.map((rp: any) => rp.permission.name) || []);

      res.status(200).json({
        id: user.id,
        name: user.name,
        email: user.email,
        batch: user.batch || null,
        user_code: isInternOrEmployee ? undefined : user.user_code,
        must_change_password: user.must_change_password,
        organization_id: user.organization_id,
        role: roleName,
        permissions,
      });
    } catch (error) {
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
