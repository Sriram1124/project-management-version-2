import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../../../backend-node/src/lib/prisma';
import { AuthenticatedServiceRequest, ServiceUserClaims } from './types';

export const getServiceJwtSecret = (): string => {
  const secret = process.env.PM_SERVICE_JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: PM_SERVICE_JWT_SECRET is required in production.');
    }
    throw new Error('FATAL: PM_SERVICE_JWT_SECRET must be configured.');
  }
  return secret;
};

/**
 * Dedicated M2M Authentication Middleware for MIRAI Service-to-Service Endpoints (/internal/mirai/v1)
 * Enforces:
 * 1. Dedicated PM_SERVICE_JWT_SECRET verification (tokens signed with JWT_ACCESS_SECRET fail signature)
 * 2. Static tokens rejected in production with 401
 * 3. Issuer strictly 'mirai-django'
 * 4. Audience strictly 'pm-membership-api'
 * 5. Scope strictly includes 'membership:read' (no PROJECT_READ alternative)
 * 6. Expiration (exp) mandatory, lifetime <= 5m (300s)
 * 7. Tenant organization strictly from token org claim (X-Organization-Id header ignored)
 */
export const authenticateMiraiService = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authStart = performance.now();

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      (req as any)._authDuration = performance.now() - authStart;
      res.status(401).json({ error: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.split(' ')[1];

    // 1. Static Service Token Check - Rejected in production (401) and disallowed for MIRAI service endpoints
    const staticToken = process.env.PROJECT_MANAGEMENT_SERVICE_TOKEN || process.env.INTERNAL_SERVICE_TOKEN;
    if (staticToken && token === staticToken) {
      (req as any)._authDuration = performance.now() - authStart;
      if (process.env.NODE_ENV === 'production') {
        res.status(401).json({ error: 'Static service tokens are disabled in production' });
        return;
      }
      res.status(401).json({ error: 'Static service tokens are disabled for MIRAI endpoints' });
      return;
    }

    // 2. Machine-to-Machine JWT Verification with dedicated PM_SERVICE_JWT_SECRET
    let serviceSecret: string;
    try {
      serviceSecret = getServiceJwtSecret();
    } catch (err: any) {
      (req as any)._authDuration = performance.now() - authStart;
      res.status(500).json({ error: err.message });
      return;
    }

    let payload: any;
    try {
      payload = jwt.verify(token, serviceSecret, {
        issuer: 'mirai-django',
        audience: 'pm-membership-api',
        algorithms: ['HS256'],
        maxAge: '5m',
      });
    } catch (jwtError: any) {
      (req as any)._authDuration = performance.now() - authStart;
      res.status(401).json({ error: `Invalid service token: ${jwtError.message}` });
      return;
    }

    // 3. Strict Expiration & Lifetime Check (iat and exp mandatory, lifetime <= 5m / 300s)
    if (typeof payload.exp !== 'number') {
      (req as any)._authDuration = performance.now() - authStart;
      res.status(401).json({ error: 'Missing token expiration claim (exp)' });
      return;
    }

    if (typeof payload.iat !== 'number') {
      (req as any)._authDuration = performance.now() - authStart;
      res.status(401).json({ error: 'Missing token issued-at claim (iat)' });
      return;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.iat > nowSec + 5) {
      (req as any)._authDuration = performance.now() - authStart;
      res.status(401).json({ error: 'Token issued in the future (iat)' });
      return;
    }

    if (payload.exp <= payload.iat) {
      (req as any)._authDuration = performance.now() - authStart;
      res.status(401).json({ error: 'Token expiration must be after issued at time' });
      return;
    }

    if (payload.exp - payload.iat > 300) {
      (req as any)._authDuration = performance.now() - authStart;
      res.status(401).json({ error: 'Token lifetime exceeds maximum allowed 5 minutes (300s)' });
      return;
    }

    // 4. Strict Scope Enforcement (must contain membership:read; no PROJECT_READ alternative)
    if (!payload.scope || typeof payload.scope !== 'string') {
      (req as any)._authDuration = performance.now() - authStart;
      res.status(403).json({ error: 'Missing or invalid scope claim in service token' });
      return;
    }

    const scopes = payload.scope.split(' ');
    if (!scopes.includes('membership:read')) {
      (req as any)._authDuration = performance.now() - authStart;
      res.status(403).json({ error: 'Insufficient token scope: requires membership:read' });
      return;
    }

    // 5. Tenant Validation (strictly from canonical token claim payload.org; X-Organization-Id header is completely ignored)
    const orgId = payload.org;
    if (!orgId || typeof orgId !== 'string') {
      (req as any)._authDuration = performance.now() - authStart;
      res.status(403).json({ error: 'Missing canonical organization claim (org) in service token' });
      return;
    }

    const validOrg = await prisma.organization.findFirst({
      where: { id: orgId, is_active: true },
      select: { id: true },
    });

    if (!validOrg) {
      (req as any)._authDuration = performance.now() - authStart;
      res.status(403).json({ error: 'Organization not found or inactive' });
      return;
    }

    const serviceUser: ServiceUserClaims = {
      id: payload.userId || 'service:mirai',
      name: payload.name || 'MIRAI Service Account',
      email: payload.email || 'service@mirai.internal',
      role: 'SERVICE',
      is_active: true,
      organization_id: validOrg.id,
      roles: [
        {
          role: {
            name: 'SERVICE',
            permissions: [
              { permission: { name: 'PROJECT_READ' } },
            ],
          },
        },
      ],
      user_permissions: [
        { permission: { id: 'p_project_read', name: 'PROJECT_READ' } },
      ],
    };

    (req as AuthenticatedServiceRequest).user = { userId: serviceUser.id, role: 'SERVICE', organization_id: validOrg.id, isService: true };
    (req as AuthenticatedServiceRequest).fullUser = serviceUser;
    (req as AuthenticatedServiceRequest)._authDuration = performance.now() - authStart;
    return next();
  } catch (err: any) {
    (req as any)._authDuration = performance.now() - authStart;
    res.status(500).json({ error: err.message || 'Authentication error' });
    return;
  }
};

