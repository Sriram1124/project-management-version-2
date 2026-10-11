import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access_secret';

export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, ACCESS_SECRET) as any;

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        organization: {
          select: { id: true, name: true, is_active: true }
        },
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } }
              }
            }
          }
        }
      }
    });

    if (!user || !user.is_active) {
      res.status(401).json({ error: 'User is inactive or not found' });
      return;
    }

    // Tenant Suspension Guard: If user belongs to an organization, verify it is active
    if (user.organization_id && user.organization && !user.organization.is_active) {
      res.status(403).json({ 
        error: 'Forbidden: Organization account is suspended',
        code: 'ORGANIZATION_SUSPENDED'
      });
      return;
    }

    // Force Password Change Guard:
    // If user is flagged with must_change_password, block all protected operational APIs
    // Allowed paths: /api/auth/change-password, /api/auth/me, /api/auth/logout
    const isExemptPath = 
      req.originalUrl.includes('/auth/change-password') || 
      req.originalUrl.includes('/auth/me') || 
      req.originalUrl.includes('/auth/logout');

    if (user.must_change_password && !isExemptPath) {
      res.status(403).json({
        error: 'Forbidden: Password change required before accessing platform features',
        code: 'PASSWORD_CHANGE_REQUIRED'
      });
      return;
    }

    (req as any).user = payload;
    (req as any).fullUser = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid access token' });
  }
};

export const requireRole = (allowedRoles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userRole = (req as any).user?.role;
    if (!userRole || !allowedRoles.includes(userRole)) {
      res.status(403).json({ error: 'Forbidden: insufficient role' });
      return;
    }
    next();
  };
};

export const requirePermission = (requiredPermission: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const fullUser = (req as any).fullUser;
    
    if (!fullUser) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    let hasPermission = false;
    for (const ur of fullUser.roles) {
      for (const rp of ur.role.permissions) {
        if (rp.permission.name === requiredPermission) {
          hasPermission = true;
          break;
        }
      }
    }

    if (!hasPermission) {
      res.status(403).json({ error: 'Forbidden: insufficient permissions' });
      return;
    }

    next();
  };
};

export const requireAnyPermission = (...requiredPermissions: string[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const fullUser = (req as any).fullUser;
    
    if (!fullUser) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    let hasPermission = false;
    for (const ur of fullUser.roles) {
      for (const rp of ur.role.permissions) {
        if (requiredPermissions.includes(rp.permission.name)) {
          hasPermission = true;
          break;
        }
      }
      if (hasPermission) break;
    }

    if (!hasPermission) {
      res.status(403).json({ error: 'Forbidden: insufficient permissions', message: 'You do not have permission to perform this action' });
      return;
    }

    next();
  };
};
