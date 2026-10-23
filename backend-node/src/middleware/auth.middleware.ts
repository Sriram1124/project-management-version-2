import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

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

export const getAccessSecret = (): string => {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: JWT_ACCESS_SECRET is required in production.');
    }
    throw new Error('FATAL: JWT_ACCESS_SECRET must be configured.');
  }
  return secret;
};

export function validateStartupConfig(): void {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_ACCESS_SECRET) {
      throw new Error('FATAL: JWT_ACCESS_SECRET must be configured in production.');
    }
    if (!process.env.PM_SERVICE_JWT_SECRET) {
      throw new Error('FATAL: PM_SERVICE_JWT_SECRET must be configured in production.');
    }
  }
}

interface CachedUserSession {
  user: any;
  cachedAt: number;
}

// In-memory cache for warm serverless instances (30s TTL per user session)
const userSessionCache = new Map<string, CachedUserSession>();
const USER_CACHE_TTL_MS = 30_000;

// In-flight lookup deduplication to prevent database connection spikes/stampedes under concurrent requests
const inFlightUserLookups = new Map<string, Promise<{ user: any; dbDuration: number }>>();

let cachedDefaultOrgId: string | null = null;
let cachedDefaultOrgExpiry = 0;

export function invalidateUserSessionCache(userId?: string): void {
  if (userId) {
    userSessionCache.delete(userId);
    inFlightUserLookups.delete(userId);
  } else {
    userSessionCache.clear();
    inFlightUserLookups.clear();
  }
}

export function setUserSessionInCache(userId: string, user: any): void {
  userSessionCache.set(userId, { user, cachedAt: Date.now() });
}

export function getUserSessionFromCache(userId: string): any {
  const cached = userSessionCache.get(userId);
  if (!cached) return null;
  return cached.user;
}

export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authStart = performance.now();
  let dbDuration = 0;

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.split(' ')[1];

    // ── Machine-to-Machine (M2M) Static Service Token Verification ───────────────
    const serviceToken = process.env.PROJECT_MANAGEMENT_SERVICE_TOKEN || process.env.INTERNAL_SERVICE_TOKEN;
    if (serviceToken && token === serviceToken) {
      if (process.env.NODE_ENV === 'production') {
        (req as any)._authDuration = performance.now() - authStart;
        res.status(401).json({ error: 'Static service tokens are disabled in production' });
        return;
      }
      let orgId = (req.headers['x-organization-id'] as string) || null;
      if (!orgId) {
        (req as any)._authDuration = performance.now() - authStart;
        res.status(403).json({ error: 'Missing required X-Organization-Id header for service context' });
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
      const serviceUser = {
        id: 'service:mirai',
        name: 'MIRAI Service Client',
        email: 'service@mirai.internal',
        role: 'SERVICE',
        is_active: true,
        organization_id: orgId,
        roles: [
          {
            role: {
              name: 'SERVICE',
              permissions: [
                { permission: { name: 'PROJECT_READ' } },
                { permission: { name: 'USER_READ' } },
              ],
            },
          },
        ],
        user_permissions: [
          { permission: { id: 'p_project_read', name: 'PROJECT_READ' } },
          { permission: { id: 'p_user_read', name: 'USER_READ' } },
        ],
      };
      (req as any).user = { userId: serviceUser.id, role: 'SERVICE', organization_id: orgId, isService: true };
      (req as any).fullUser = serviceUser;
      (req as any)._authDuration = performance.now() - authStart;
      return next();
    }

    let accessSecret: string;
    try {
      accessSecret = getAccessSecret();
    } catch (err: any) {
      (req as any)._authDuration = performance.now() - authStart;
      res.status(500).json({ error: err.message });
      return;
    }

    let payload: any;
    try {
      payload = jwt.verify(token, accessSecret) as any;
    } catch (jwtError) {
      (req as any)._authDuration = performance.now() - authStart;
      res.status(401).json({ error: 'Invalid access token' });
      return;
    }

    // Service tokens signed with PM_SERVICE_JWT_SECRET or presenting service claims cannot be used for user sessions
    if (
      payload?.iss === 'mirai-django' ||
      payload?.aud === 'pm-membership-api' ||
      payload?.role === 'SERVICE' ||
      payload?.isService === true
    ) {
      (req as any)._authDuration = performance.now() - authStart;
      res.status(401).json({ error: 'Service tokens cannot be used to authenticate user sessions' });
      return;
    }

    const now = Date.now();
    const cached = userSessionCache.get(payload.userId);
    let user: any;

    if (cached && (now - cached.cachedAt < USER_CACHE_TTL_MS)) {
      user = cached.user;
    } else {
      let lookupPromise = inFlightUserLookups.get(payload.userId);
      if (!lookupPromise) {
        lookupPromise = (async () => {
          const dbStart = performance.now();
          const dbUser = await prisma.user.findUnique({
            where: { id: payload.userId },
            select: {
              id: true,
              name: true,
              email: true,
              user_code: true,
              batch: true,
              is_active: true,
              must_change_password: true,
              organization_id: true,
              created_at: true,
              organization: {
                select: { id: true, name: true, is_active: true }
              },
              roles: {
                select: {
                  role: {
                    select: {
                      id: true,
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
              user_permissions: {
                select: {
                  permission: {
                    select: { id: true, name: true }
                  }
                }
              },
              project_memberships: {
                where: { project_role: 'TECH_LEAD' },
                select: { project_id: true }
              }
            }
          });
          let duration = performance.now() - dbStart;

          if (dbUser && dbUser.is_active) {
            userSessionCache.set(payload.userId, { user: dbUser, cachedAt: Date.now() });
          }

          return { user: dbUser, dbDuration: duration };
        })().finally(() => {
          inFlightUserLookups.delete(payload.userId);
        });

        inFlightUserLookups.set(payload.userId, lookupPromise);
      }

      const lookupResult = await lookupPromise;
      user = lookupResult.user;
      dbDuration = lookupResult.dbDuration;
    }

    if (!user || !user.is_active) {
      userSessionCache.delete(payload.userId);
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
    if (payload?.role && !(user as any).role) {
      (user as any).role = payload.role;
    }
    if (Array.isArray(user.roles) && user.roles.length > 0 && !(user as any).role) {
      (user as any).role = user.roles[0]?.role?.name || (user.roles[0] as any)?.name;
    }

    (req as any)._authDuration = performance.now() - authStart;
    (req as any)._authDbDuration = dbDuration;

    next();
  } catch (error: any) {
    (req as any)._authDuration = performance.now() - authStart;
    (req as any)._authDbDuration = dbDuration;

    // Distinguish database connection/query failures from token errors
    const isDbError =
      error?.code === 'P2024' ||
      error?.name === 'PrismaClientInitializationError' ||
      error?.name === 'PrismaClientKnownRequestError' ||
      error?.name === 'PrismaClientRustPanicError' ||
      error?.name === 'PrismaClientUnknownRequestError' ||
      error?.message?.includes('FATAL') ||
      error?.message?.includes('connection') ||
      error?.message?.includes('timeout');

    if (isDbError) {
      res.status(503).json({
        error: 'Service temporarily unavailable: database connection issue',
        code: 'DB_CONNECTION_ERROR'
      });
      return;
    }

    res.status(500).json({ error: 'Internal server error during authentication' });
  }
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

    const serviceUser = {
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

    (req as any).user = { userId: serviceUser.id, role: 'SERVICE', organization_id: validOrg.id, isService: true };
    (req as any).fullUser = serviceUser;
    (req as any)._authDuration = performance.now() - authStart;
    return next();
  } catch (err: any) {
    (req as any)._authDuration = performance.now() - authStart;
    res.status(500).json({ error: err.message || 'Authentication error' });
    return;
  }
};

export const requireRole = (allowedRoles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userRole = (req as any).user?.role;
    const fullUser = (req as any).fullUser;

    const roles: string[] = [];
    if (userRole) roles.push(userRole);
    if (Array.isArray(fullUser?.roles)) {
      for (const ur of fullUser.roles) {
        const name = ur.role?.name || ur.name;
        if (name && !roles.includes(name)) roles.push(name);
      }
    }

    const hasRole = roles.some((r) => allowedRoles.includes(r)) || roles.includes('SUPER_ADMIN');
    if (!hasRole) {
      res.status(403).json({
        error: 'Forbidden: insufficient role',
        message: 'You do not have permission to perform this action',
        user: {},
        project: {},
        work_item: {},
      });
      return;
    }
    next();
  };
};

export const requireRoleOrPermission = (allowedRoles: string[], ...requiredPermissions: string[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userRole = (req as any).user?.role;
    const fullUser = (req as any).fullUser;

    if (!fullUser) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const roles: string[] = [];
    if (userRole) roles.push(userRole);
    if (Array.isArray(fullUser?.roles)) {
      for (const ur of fullUser.roles) {
        const name = ur.role?.name || ur.name;
        if (name && !roles.includes(name)) roles.push(name);
      }
    }

    if (roles.includes('SUPER_ADMIN') || roles.some((r) => allowedRoles.includes(r))) {
      return next();
    }

    if (requiredPermissions.length > 0) {
      const userPerms = new Set<string>();
      for (const ur of fullUser.roles || []) {
        for (const rp of ur.role?.permissions || []) {
          if (rp.permission?.name) userPerms.add(rp.permission.name);
        }
      }
      for (const up of fullUser.user_permissions || []) {
        if (up.permission?.name) userPerms.add(up.permission.name);
      }

      if (requiredPermissions.some((p) => userPerms.has(p))) {
        return next();
      }
    }

    res.status(403).json({
      error: 'Forbidden: insufficient role or permissions',
      message: 'You do not have permission to perform this action',
      user: {},
      project: {},
      work_item: {},
    });
  };
};

const PROJECT_PERMISSIONS = [
  'PROJECT_READ',
  'PROJECT_UPDATE',
  'PROJECT_ARCHIVE',
  'PROJECT_MEMBER_MANAGE',
  'PROJECT_ROLE_ASSIGN',
  'CUSTOM_ROLE_MANAGE',
  'TASK_READ',
  'TASK_CREATE',
  'TASK_UPDATE',
  'TASK_DELETE',
  'TASK_ASSIGN',
  'TASK_STATUS_TRANSITION',
  'SPRINT_READ',
  'SPRINT_MANAGE',
  'ROADMAP_MANAGE',
  'DOCUMENT_READ',
  'DOCUMENT_UPLOAD',
  'DOCUMENT_DELETE',
  'ANALYTICS_READ',
];

export async function checkProjectMemberPermission(
  fullUser: any,
  req: Request,
  permissionToCheck: string
): Promise<boolean> {
  if (!fullUser || !fullUser.id) {
    return false;
  }

  let projectId: string | null =
    req.params.projectId ||
    req.params.id ||
    req.body?.project_id ||
    req.body?.projectId ||
    (req.query?.project_id as string) ||
    (req.query?.projectId as string) ||
    null;

  try {
    // If not directly found or param is not project, resolve from workItem, document, or sprint
    if (projectId) {
      const isProjectDirect = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true },
      });
      if (!isProjectDirect) {
        // Maybe projectId is actually a work_item_id or document_id
        const workItem = await prisma.workItem.findUnique({
          where: { id: projectId },
          select: { project_id: true },
        });
        if (workItem?.project_id) {
          projectId = workItem.project_id;
        } else {
          const doc = await prisma.projectDocument.findUnique({
            where: { id: projectId },
            select: { project_id: true },
          });
          if (doc?.project_id) {
            projectId = doc.project_id;
          }
        }
      }
    } else {
      if (req.params.documentId) {
        const doc = await prisma.projectDocument.findUnique({
          where: { id: req.params.documentId },
          select: { project_id: true },
        });
        if (doc?.project_id) projectId = doc.project_id;
      } else if (req.params.sprintId) {
        const sprint = await prisma.sprint.findUnique({
          where: { id: req.params.sprintId },
          select: { project_id: true },
        });
        if (sprint?.project_id) projectId = sprint.project_id;
      }
    }

    if (!projectId || typeof projectId !== 'string') {
      return false;
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        owner_id: true,
        organization_id: true,
        owners: { select: { user_id: true } },
      },
    });

    if (!project) {
      return false;
    }

    // Project owner always has full project permissions
    const isProjectOwner =
      project.owner_id === fullUser.id ||
      (Array.isArray((project as any).owners) && (project as any).owners.some((po: any) => po.user_id === fullUser.id));
    if (isProjectOwner) {
      return true;
    }

    // Organization Manager / Admin has full project permissions
    const userRoleName = String((req as any).user?.role || fullUser.role || '').toUpperCase();
    const isOrgManager =
      userRoleName === 'ADMIN' ||
      userRoleName === 'MANAGER' ||
      userRoleName === 'SUPER_ADMIN' ||
      fullUser.roles?.some((ur: any) => {
        const rName = String(ur.role?.name || ur.name || '').toUpperCase();
        return rName === 'ADMIN' || rName === 'MANAGER' || rName === 'SUPER_ADMIN';
      });

    if (isOrgManager) {
      return true;
    }

    // Direct organization-level user_permissions check
    if (Array.isArray(fullUser.user_permissions)) {
      const directPerms = new Set(fullUser.user_permissions.map((up: any) => up.permission?.name));
      if (directPerms.has(permissionToCheck)) {
        return true;
      }
      if (permissionToCheck === 'TASK_STATUS_TRANSITION' && directPerms.has('TASK_UPDATE')) {
        return true;
      }
    }

    // Check if user is Tech Lead across the org or has tech lead project memberships
    const isOrgTechLead =
      userRoleName === 'TECH_LEAD' ||
      (Array.isArray(fullUser.roles) &&
        fullUser.roles.some((ur: any) => String(ur.role?.name || ur.name || '').toUpperCase() === 'TECH_LEAD')) ||
      (Array.isArray((fullUser as any).project_memberships) &&
        (fullUser as any).project_memberships.some((pm: any) => pm.project_id === projectId));

    // Query Project Membership with custom role and associated permissions
    const membership = await prisma.projectMember.findFirst({
      where: {
        project_id: projectId,
        user_id: fullUser.id,
      },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!membership && isOrgTechLead) {
      return true;
    }

    if (!membership) {
      return false;
    }

    // Tech Leads and Managers on this project always have full project & member management permissions
    const isProjectTechLead =
      String(membership.project_role || '').toUpperCase() === 'TECH_LEAD' ||
      String(membership.role?.name || '').toUpperCase() === 'TECH_LEAD' ||
      isOrgTechLead;

    const isProjectManager =
      String(membership.project_role || '').toUpperCase() === 'MANAGER' ||
      String(membership.role?.name || '').toUpperCase() === 'MANAGER';

    if (isProjectTechLead || isProjectManager) {
      return true;
    }

    // 1. If assigned a Custom Role (or standard role via role_id)
    if (membership.role) {
      const grantedPermissions = new Set(
        membership.role.permissions.map((rp) => rp.permission.name)
      );

      // Direct permission match
      if (grantedPermissions.has(permissionToCheck)) {
        return true;
      }

      // If user has TASK_UPDATE, allow TASK_STATUS_TRANSITION
      if (permissionToCheck === 'TASK_STATUS_TRANSITION' && grantedPermissions.has('TASK_UPDATE')) {
        return true;
      }

      // If user has PROJECT_UPDATE, allow non-destructive project management & member actions
      if (
        grantedPermissions.has('PROJECT_UPDATE') &&
        (permissionToCheck === 'SPRINT_MANAGE' ||
          permissionToCheck === 'ROADMAP_MANAGE' ||
          permissionToCheck === 'DOCUMENT_UPLOAD' ||
          permissionToCheck === 'DOCUMENT_DELETE' ||
          permissionToCheck === 'PROJECT_MEMBER_MANAGE' ||
          permissionToCheck === 'PROJECT_MEMBER_DELETE' ||
          permissionToCheck === 'PROJECT_MEMBER_CREATE' ||
          permissionToCheck === 'ROLE_ASSIGN')
      ) {
        return true;
      }

      // Read permissions baseline for any member
      if (
        (permissionToCheck === 'PROJECT_READ' || permissionToCheck === 'TASK_READ' || permissionToCheck === 'DOCUMENT_READ' || permissionToCheck === 'SPRINT_READ') &&
        (grantedPermissions.has('PROJECT_READ') || grantedPermissions.has('TASK_READ'))
      ) {
        return true;
      }

      return false;
    }

    // 2. Standard Built-in project roles fallback
    if (
      membership.project_role === 'TECH_LEAD' ||
      membership.project_role === 'MANAGER' ||
      isOrgTechLead
    ) {
      return true;
    }

    if (membership.project_role === 'DEVELOPER') {
      const devPerms = [
        'PROJECT_READ',
        'TASK_READ',
        'TASK_CREATE',
        'TASK_UPDATE',
        'TASK_STATUS_TRANSITION',
        'DOCUMENT_READ',
        'DOCUMENT_UPLOAD',
        'SPRINT_READ',
        'ANALYTICS_READ',
      ];
      return devPerms.includes(permissionToCheck);
    }

    if (membership.project_role === 'QA_TESTER') {
      const qaPerms = [
        'PROJECT_READ',
        'TASK_READ',
        'TASK_CREATE',
        'TASK_UPDATE',
        'TASK_STATUS_TRANSITION',
        'DOCUMENT_READ',
        'SPRINT_READ',
      ];
      return qaPerms.includes(permissionToCheck);
    }

    // Default read permissions for any project member
    if (
      permissionToCheck === 'PROJECT_READ' ||
      permissionToCheck === 'TASK_READ' ||
      permissionToCheck === 'DOCUMENT_READ' ||
      permissionToCheck === 'SPRINT_READ'
    ) {
      return true;
    }

    return false;
  } catch (err) {
    return false;
  }
}

// Preserve backward-compatible alias
async function checkProjectLeadPermission(
  fullUser: any,
  req: Request,
  permissionToCheck: string
): Promise<boolean> {
  return checkProjectMemberPermission(fullUser, req, permissionToCheck);
}

export const requirePermission = (requiredPermission: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const fullUser = (req as any).fullUser;
    
    if (!fullUser) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userRole = String((req as any).user?.role || fullUser.role || '').toUpperCase();
    const isSuperAdmin = 
      userRole === 'SUPER_ADMIN' ||
      fullUser.roles?.some((ur: any) => String(ur.role?.name || ur.name || '').toUpperCase() === 'SUPER_ADMIN');

    if (isSuperAdmin) {
      return next();
    }

    const isManagerOrAdmin =
      userRole === 'ADMIN' ||
      userRole === 'MANAGER' ||
      fullUser.roles?.some((ur: any) => {
        const rName = String(ur.role?.name || ur.name || '').toUpperCase();
        return rName === 'ADMIN' || rName === 'MANAGER' || rName === 'SUPER_ADMIN';
      });

    if (isManagerOrAdmin) {
      return next();
    }

    let hasPermission = false;
    for (const ur of fullUser.roles || []) {
      const rName = String(ur.role?.name || ur.name || '').toUpperCase();
      if (rName === 'ADMIN' || rName === 'MANAGER' || rName === 'SUPER_ADMIN') {
        hasPermission = true;
        break;
      }
      for (const rp of ur.role?.permissions || []) {
        if (rp.permission?.name === requiredPermission) {
          hasPermission = true;
          break;
        }
      }
      if (hasPermission) break;
    }

    if (!hasPermission && Array.isArray(fullUser.user_permissions)) {
      for (const up of fullUser.user_permissions) {
        if (up.permission?.name === requiredPermission) {
          hasPermission = true;
          break;
        }
      }
    }

    if (!hasPermission) {
      hasPermission = await checkProjectLeadPermission(fullUser, req, requiredPermission);
    }

    if (!hasPermission) {
      res.status(403).json({
        error: 'Forbidden: insufficient permissions',
        message: 'You do not have permission to perform this action',
        user: {},
        project: {},
        work_item: {},
      });
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

    const userRole = String((req as any).user?.role || fullUser.role || '').toUpperCase();
    const isSuperAdmin = 
      userRole === 'SUPER_ADMIN' ||
      fullUser.roles?.some((ur: any) => String(ur.role?.name || ur.name || '').toUpperCase() === 'SUPER_ADMIN');

    if (isSuperAdmin) {
      return next();
    }

    const isManagerOrAdmin =
      userRole === 'ADMIN' ||
      userRole === 'MANAGER' ||
      fullUser.roles?.some((ur: any) => {
        const rName = String(ur.role?.name || ur.name || '').toUpperCase();
        return rName === 'ADMIN' || rName === 'MANAGER' || rName === 'SUPER_ADMIN';
      });

    if (isManagerOrAdmin) {
      return next();
    }

    let hasPermission = false;
    for (const ur of fullUser.roles || []) {
      const rName = String(ur.role?.name || ur.name || '').toUpperCase();
      if (rName === 'ADMIN' || rName === 'MANAGER' || rName === 'SUPER_ADMIN') {
        hasPermission = true;
        break;
      }
      for (const rp of ur.role?.permissions || []) {
        if (requiredPermissions.includes(rp.permission?.name)) {
          hasPermission = true;
          break;
        }
      }
      if (hasPermission) break;
    }

    if (!hasPermission && Array.isArray(fullUser.user_permissions)) {
      for (const up of fullUser.user_permissions) {
        if (requiredPermissions.includes(up.permission?.name)) {
          hasPermission = true;
          break;
        }
      }
    }

    if (!hasPermission) {
      for (const perm of requiredPermissions) {
        if (await checkProjectLeadPermission(fullUser, req, perm)) {
          hasPermission = true;
          break;
        }
      }
    }

    if (!hasPermission) {
      res.status(403).json({
        error: 'Forbidden: insufficient permissions',
        message: 'You do not have permission to perform this action',
        user: {},
        project: {},
        work_item: {},
      });
      return;
    }

    next();
  };
};
