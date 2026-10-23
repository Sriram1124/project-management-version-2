import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import {
  authenticate,
  requireRole,
  requirePermission,
  requireAnyPermission,
  checkProjectMemberPermission,
  invalidateUserSessionCache,
  setUserSessionInCache,
  getUserSessionFromCache,
  validateStartupConfig,
} from '../../src/middleware/auth.middleware';
import { prisma } from '../../src/lib/prisma';
import { mockPrisma } from '../mocks/prisma.mock';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access_secret';

function createMockReqRes(options: {
  headers?: Record<string, string>;
  params?: Record<string, string>;
  body?: any;
  query?: any;
  originalUrl?: string;
  user?: any;
  fullUser?: any;
} = {}) {
  const req: Partial<Request> = {
    headers: options.headers || {},
    params: options.params || {},
    body: options.body || {},
    query: options.query || {},
    originalUrl: options.originalUrl || '/api/test',
    ...options,
  };

  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };

  const next: NextFunction = jest.fn();

  return { req: req as Request, res: res as Response, next };
}

describe('Auth Middleware Unit Tests', () => {
  beforeEach(() => {
    invalidateUserSessionCache();
    jest.clearAllMocks();
  });

  describe('Session Cache helpers', () => {
    it('sets, retrieves, and invalidates cache per user and globally', async () => {
      const mockUser = {
        id: 'user-1',
        name: 'User 1',
        is_active: true,
        organization_id: 'org-1',
        organization: { id: 'org-1', is_active: true },
        roles: [{ role: { name: 'INTERN' } }],
      };
      setUserSessionInCache('user-1', mockUser);
      expect(getUserSessionFromCache('user-1')).toEqual(mockUser);

      // Verify that warm cache is utilized by authenticate middleware without querying database
      const token = jwt.sign({ userId: 'user-1' }, ACCESS_SECRET);
      const { req, res, next } = createMockReqRes({
        headers: { authorization: `Bearer ${token}` },
      });
      await authenticate(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.fullUser).toEqual(mockUser);
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();

      // Invalidate specific user cache
      invalidateUserSessionCache('user-1');
      expect(getUserSessionFromCache('user-1')).toBeNull();

      // Verify global cache clear
      setUserSessionInCache('user-1', mockUser);
      setUserSessionInCache('user-2', { id: 'user-2', name: 'User 2', role: 'MANAGER' });
      expect(getUserSessionFromCache('user-1')).toBeDefined();
      expect(getUserSessionFromCache('user-2')).toBeDefined();

      invalidateUserSessionCache(); // global clear
      expect(getUserSessionFromCache('user-1')).toBeNull();
      expect(getUserSessionFromCache('user-2')).toBeNull();
    });
  });

  describe('authenticate middleware', () => {
    it('returns 401 if authorization header is missing or malformed', async () => {
      const { req, res, next } = createMockReqRes();
      await authenticate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing or invalid authorization header' });
      expect(next).not.toHaveBeenCalled();

      const { req: req2, res: res2, next: next2 } = createMockReqRes({
        headers: { authorization: 'Basic 12345' },
      });
      await authenticate(req2, res2, next2);
      expect(res2.status).toHaveBeenCalledWith(401);
    });

    it('returns 401 on invalid JWT signature', async () => {
      const { req, res, next } = createMockReqRes({
        headers: { authorization: 'Bearer invalid.token.payload' },
      });
      await authenticate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid access token' });
      expect(next).not.toHaveBeenCalled();
    });

    it('uses warm userSessionCache if present and not expired', async () => {
      const token = jwt.sign({ userId: 'cached-user', role: 'INTERN' }, ACCESS_SECRET);
      setUserSessionInCache('cached-user', {
        id: 'cached-user',
        name: 'Cached Intern',
        is_active: true,
        organization_id: 'org-1',
        organization: { id: 'org-1', is_active: true },
        roles: [{ role: { name: 'INTERN' } }],
      });

      const { req, res, next } = createMockReqRes({
        headers: { authorization: `Bearer ${token}` },
      });

      await authenticate(req, res, next);
      expect(next).toHaveBeenCalled();
      expect((req as any).user).toHaveProperty('userId', 'cached-user');
      expect((req as any).fullUser).toHaveProperty('id', 'cached-user');
    });

    it('fetches user from DB and preserves unassigned organization (no firstOrg fallback)', async () => {
      const token = jwt.sign({ userId: 'no-org-user' }, ACCESS_SECRET);
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'no-org-user',
        name: 'No Org User',
        is_active: true,
        organization_id: null,
        roles: [{ role: { name: 'DEVELOPER' } }],
      });

      const { req, res, next } = createMockReqRes({
        headers: { authorization: `Bearer ${token}` },
      });

      await authenticate(req, res, next);
      expect(next).toHaveBeenCalled();
      expect((req as any).fullUser.organization_id).toBeNull();
    });

    it('returns 401 if user is not found or inactive in DB', async () => {
      const token = jwt.sign({ userId: 'inactive-user' }, ACCESS_SECRET);
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'inactive-user',
        is_active: false,
      });

      const { req, res, next } = createMockReqRes({
        headers: { authorization: `Bearer ${token}` },
      });

      await authenticate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'User is inactive or not found' });
    });

    it('returns 403 if user organization is suspended', async () => {
      const token = jwt.sign({ userId: 'suspended-org-user' }, ACCESS_SECRET);
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'suspended-org-user',
        is_active: true,
        organization_id: 'org-suspended',
        organization: { id: 'org-suspended', is_active: false },
      });

      const { req, res, next } = createMockReqRes({
        headers: { authorization: `Bearer ${token}` },
      });

      await authenticate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'ORGANIZATION_SUSPENDED' })
      );
    });

    it('blocks access if must_change_password is true and path is not exempt', async () => {
      const token = jwt.sign({ userId: 'pwd-user' }, ACCESS_SECRET);
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'pwd-user',
        is_active: true,
        must_change_password: true,
      });

      const { req, res, next } = createMockReqRes({
        headers: { authorization: `Bearer ${token}` },
        originalUrl: '/api/projects',
      });

      await authenticate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'PASSWORD_CHANGE_REQUIRED' })
      );
    });

    it('allows access if must_change_password is true but path is exempt', async () => {
      const token = jwt.sign({ userId: 'pwd-user-2' }, ACCESS_SECRET);
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'pwd-user-2',
        is_active: true,
        must_change_password: true,
      });

      const { req, res, next } = createMockReqRes({
        headers: { authorization: `Bearer ${token}` },
        originalUrl: '/api/auth/me',
      });

      await authenticate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('returns 503 on database connection failure', async () => {
      const token = jwt.sign({ userId: 'db-fail-user' }, ACCESS_SECRET);
      const dbErr: any = new Error('Prisma timeout connection error');
      dbErr.code = 'P2024';
      mockPrisma.user.findUnique.mockRejectedValueOnce(dbErr);

      const { req, res, next } = createMockReqRes({
        headers: { authorization: `Bearer ${token}` },
      });

      await authenticate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'DB_CONNECTION_ERROR' })
      );
    });

    it('returns 500 on unexpected non-db exceptions', async () => {
      const token = jwt.sign({ userId: 'generic-err-user' }, ACCESS_SECRET);
      mockPrisma.user.findUnique.mockRejectedValueOnce(new Error('Syntax or runtime error'));

      const { req, res, next } = createMockReqRes({
        headers: { authorization: `Bearer ${token}` },
      });

      await authenticate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error during authentication' });
    });
  });

  describe('requireRole middleware', () => {
    it('allows access when user has direct role or is SUPER_ADMIN', async () => {
      const middleware = requireRole(['MANAGER']);

      // Direct matching role
      const { req, res, next } = createMockReqRes({
        user: { role: 'MANAGER' },
      });
      await middleware(req, res, next);
      expect(next).toHaveBeenCalled();

      // SUPER_ADMIN bypass
      const { req: reqAdmin, res: resAdmin, next: nextAdmin } = createMockReqRes({
        user: { role: 'SUPER_ADMIN' },
      });
      await middleware(reqAdmin, resAdmin, nextAdmin);
      expect(nextAdmin).toHaveBeenCalled();
    });

    it('allows access when role is contained in fullUser.roles array', async () => {
      const middleware = requireRole(['TECH_LEAD']);
      const { req, res, next } = createMockReqRes({
        user: { role: 'INTERN' },
        fullUser: { roles: [{ role: { name: 'TECH_LEAD' } }] },
      });

      await middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('returns 403 when user lacks required role', async () => {
      const middleware = requireRole(['MANAGER']);
      const { req, res, next } = createMockReqRes({
        user: { role: 'INTERN' },
        fullUser: { roles: [{ role: { name: 'INTERN' } }] },
      });

      await middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Forbidden: insufficient role' })
      );
    });
  });

  describe('checkProjectMemberPermission', () => {
    it('returns false if fullUser is missing or invalid', async () => {
      const { req } = createMockReqRes();
      const result = await checkProjectMemberPermission(null, req, 'PROJECT_READ');
      expect(result).toBe(false);
    });

    it('returns false if projectId cannot be resolved', async () => {
      const { req } = createMockReqRes();
      const result = await checkProjectMemberPermission({ id: 'u1' }, req, 'PROJECT_READ');
      expect(result).toBe(false);
    });

    it('resolves projectId from workItem or projectDocument fallback', async () => {
      mockPrisma.project.findUnique.mockResolvedValueOnce(null); // not direct project
      mockPrisma.workItem.findUnique.mockResolvedValueOnce({ project_id: 'proj-from-workitem' });
      mockPrisma.project.findUnique.mockResolvedValueOnce({
        owner_id: 'u-owner',
        organization_id: 'org-1',
      });

      const { req } = createMockReqRes({
        params: { id: 'task-123' },
      });

      const result = await checkProjectMemberPermission({ id: 'u-owner' }, req, 'PROJECT_READ');
      expect(result).toBe(true);
    });

    it('resolves projectId from documentId param', async () => {
      mockPrisma.projectDocument.findUnique.mockResolvedValueOnce({ project_id: 'proj-from-doc' });
      mockPrisma.project.findUnique.mockResolvedValueOnce({
        owner_id: 'u-owner',
        organization_id: 'org-1',
      });

      const { req } = createMockReqRes({
        params: { documentId: 'doc-123' },
      });

      const result = await checkProjectMemberPermission({ id: 'u-owner' }, req, 'PROJECT_READ');
      expect(result).toBe(true);
    });

    it('resolves projectId from sprintId param', async () => {
      mockPrisma.sprint.findUnique.mockResolvedValueOnce({ project_id: 'proj-from-sprint' });
      mockPrisma.project.findUnique.mockResolvedValueOnce({
        owner_id: 'u-owner',
        organization_id: 'org-1',
      });

      const { req } = createMockReqRes({
        params: { sprintId: 'sprint-123' },
      });

      const result = await checkProjectMemberPermission({ id: 'u-owner' }, req, 'PROJECT_READ');
      expect(result).toBe(true);
    });

    it('grants permission if user is project owner', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'proj-1',
        owner_id: 'u-owner',
        organization_id: 'org-1',
      });

      const { req } = createMockReqRes({ params: { projectId: 'proj-1' } });
      const result = await checkProjectMemberPermission({ id: 'u-owner' }, req, 'PROJECT_DELETE');
      expect(result).toBe(true);
    });

    it('grants permission if user is Org Manager or Admin within same organization', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'proj-1',
        owner_id: 'u-other',
        organization_id: 'org-1',
      });

      const { req } = createMockReqRes({
        params: { projectId: 'proj-1' },
        user: { role: 'MANAGER' },
      });

      const result = await checkProjectMemberPermission(
        { id: 'u-mgr', organization_id: 'org-1', roles: [{ role: { name: 'MANAGER' } }] },
        req,
        'PROJECT_ARCHIVE'
      );
      expect(result).toBe(true);
    });

    it('evaluates custom role permissions on project membership', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'proj-1',
        owner_id: 'u-other',
        organization_id: 'org-1',
      });

      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({
        project_id: 'proj-1',
        user_id: 'u-custom',
        role: {
          permissions: [
            { permission: { name: 'TASK_UPDATE' } },
            { permission: { name: 'PROJECT_UPDATE' } },
          ],
        },
      });

      const { req } = createMockReqRes({ params: { projectId: 'proj-1' } });

      // Direct match
      expect(
        await checkProjectMemberPermission({ id: 'u-custom', organization_id: 'org-1' }, req, 'TASK_UPDATE')
      ).toBe(true);

      // TASK_UPDATE grants TASK_STATUS_TRANSITION
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({
        project_id: 'proj-1',
        user_id: 'u-custom',
        role: { permissions: [{ permission: { name: 'TASK_UPDATE' } }] },
      });
      expect(
        await checkProjectMemberPermission({ id: 'u-custom', organization_id: 'org-1' }, req, 'TASK_STATUS_TRANSITION')
      ).toBe(true);

      // PROJECT_UPDATE grants SPRINT_MANAGE
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({
        project_id: 'proj-1',
        user_id: 'u-custom',
        role: { permissions: [{ permission: { name: 'PROJECT_UPDATE' } }] },
      });
      expect(
        await checkProjectMemberPermission({ id: 'u-custom', organization_id: 'org-1' }, req, 'SPRINT_MANAGE')
      ).toBe(true);
    });

    it('evaluates standard project roles (TECH_LEAD, DEVELOPER, QA_TESTER)', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'proj-1',
        owner_id: 'u-other',
        organization_id: 'org-1',
      });

      const user = { id: 'u-member', organization_id: 'org-1' };
      const { req } = createMockReqRes({ params: { projectId: 'proj-1' } });

      // TECH_LEAD has all permissions
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({
        project_id: 'proj-1',
        user_id: 'u-member',
        project_role: 'TECH_LEAD',
      });
      expect(await checkProjectMemberPermission(user, req, 'ROADMAP_MANAGE')).toBe(true);

      // DEVELOPER can create tasks but cannot manage sprints
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({
        project_id: 'proj-1',
        user_id: 'u-member',
        project_role: 'DEVELOPER',
      });
      expect(await checkProjectMemberPermission(user, req, 'TASK_CREATE')).toBe(true);

      // QA_TESTER can test but cannot manage roadmap
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({
        project_id: 'proj-1',
        user_id: 'u-member',
        project_role: 'QA_TESTER',
      });
      expect(await checkProjectMemberPermission(user, req, 'TASK_STATUS_TRANSITION')).toBe(true);

      // Default member read permission
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({
        project_id: 'proj-1',
        user_id: 'u-member',
        project_role: 'VIEWER',
      });
      expect(await checkProjectMemberPermission(user, req, 'PROJECT_READ')).toBe(true);

      // Non-member returns false
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce(null);
      expect(await checkProjectMemberPermission(user, req, 'PROJECT_READ')).toBe(false);
    });

    it('resolves projectId from projectDocument when workItem is null', async () => {
      mockPrisma.project.findUnique.mockResolvedValueOnce(null); // not project
      mockPrisma.workItem.findUnique.mockResolvedValueOnce(null); // not work item
      mockPrisma.projectDocument.findUnique.mockResolvedValueOnce({ project_id: 'proj-from-doc-id' });
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'proj-from-doc-id',
        owner_id: 'u-owner',
        organization_id: 'org-1',
      });

      const { req } = createMockReqRes({ params: { id: 'doc-param' } });
      expect(await checkProjectMemberPermission({ id: 'u-owner' }, req, 'DOCUMENT_READ')).toBe(true);
    });

    it('returns false if project record is not found in database', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);
      const { req } = createMockReqRes({ params: { projectId: 'missing-proj' } });
      expect(await checkProjectMemberPermission({ id: 'u1' }, req, 'PROJECT_READ')).toBe(false);
    });

    it('grants permission if user has Org Tech Lead role', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'proj-1',
        owner_id: 'u-other',
        organization_id: 'org-1',
      });
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({
        project_id: 'proj-1',
        user_id: 'u-tl',
        project_role: 'MEMBER',
      });

      const { req } = createMockReqRes({ params: { projectId: 'proj-1' } });
      const user = {
        id: 'u-tl',
        roles: [{ role: { name: 'TECH_LEAD' } }],
      };
      expect(await checkProjectMemberPermission(user, req, 'ROADMAP_MANAGE')).toBe(true);
    });

    it('handles custom role baseline read permissions and rejects unauthorized action', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'proj-1',
        owner_id: 'u-other',
        organization_id: 'org-1',
      });
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({
        project_id: 'proj-1',
        user_id: 'u-cust',
        role: {
          permissions: [{ permission: { name: 'PROJECT_READ' } }],
        },
      });

      const { req } = createMockReqRes({ params: { projectId: 'proj-1' } });
      expect(
        await checkProjectMemberPermission({ id: 'u-cust', organization_id: 'org-1' }, req, 'DOCUMENT_READ')
      ).toBe(true);

      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({
        project_id: 'proj-1',
        user_id: 'u-cust',
        role: {
          permissions: [{ permission: { name: 'PROJECT_READ' } }],
        },
      });
      expect(
        await checkProjectMemberPermission({ id: 'u-cust', organization_id: 'org-1' }, req, 'PROJECT_ARCHIVE')
      ).toBe(false);
    });

    it('catches unexpected database errors and returns false gracefully', async () => {
      mockPrisma.project.findUnique.mockRejectedValueOnce(new Error('Fatal DB failure'));
      const { req } = createMockReqRes({ params: { projectId: 'proj-err' } });
      const result = await checkProjectMemberPermission({ id: 'u1' }, req, 'PROJECT_READ');
      expect(result).toBe(false);
    });
  });

  describe('requirePermission & requireAnyPermission middleware', () => {
    it('returns 401 when fullUser is not on request', async () => {
      const mw1 = requirePermission('TASK_READ');
      const { req: r1, res: s1, next: n1 } = createMockReqRes();
      await mw1(r1, s1, n1);
      expect(s1.status).toHaveBeenCalledWith(401);

      const mw2 = requireAnyPermission('TASK_READ', 'PROJECT_READ');
      const { req: r2, res: s2, next: n2 } = createMockReqRes();
      await mw2(r2, s2, n2);
      expect(s2.status).toHaveBeenCalledWith(401);
    });

    it('bypasses for SUPER_ADMIN, ADMIN, or MANAGER in user or roles array', async () => {
      const mw = requirePermission('ANY_SPECIAL_PERM');
      const { req, res, next } = createMockReqRes({
        user: { role: 'DEVELOPER' },
        fullUser: { id: 'm1', roles: [{ name: 'MANAGER' }] },
      });
      await mw(req, res, next);
      expect(next).toHaveBeenCalled();

      const mwAny = requireAnyPermission('PERM_1', 'PERM_2');
      const { req: reqAdmin, res: resAdmin, next: nextAdmin } = createMockReqRes({
        user: { role: 'ADMIN' },
        fullUser: { id: 'a1' },
      });
      await mwAny(reqAdmin, resAdmin, nextAdmin);
      expect(nextAdmin).toHaveBeenCalled();
    });

    it('grants access when user has permission through role permissions or project lead', async () => {
      const mw = requirePermission('TASK_READ');
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'proj-lead',
        owner_id: 'u-lead',
      });
      const { req, res, next } = createMockReqRes({
        params: { projectId: 'proj-lead' },
        user: { role: 'DEVELOPER' },
        fullUser: { id: 'u-lead', roles: [] },
      });

      await mw(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('requireAnyPermission evaluates permissions and project lead fallbacks', async () => {
      const mwAny = requireAnyPermission('SPECIAL_READ', 'SPECIAL_WRITE');

      // Matching one of the permissions via role
      const { req: r1, res: s1, next: n1 } = createMockReqRes({
        user: { role: 'CONTRIBUTOR' },
        fullUser: {
          id: 'u-c',
          roles: [
            {
              role: {
                name: 'CONTRIBUTOR',
                permissions: [{ permission: { name: 'SPECIAL_READ' } }],
              },
            },
          ],
        },
      });
      await mwAny(r1, s1, n1);
      expect(n1).toHaveBeenCalled();

      // Matching via project permission
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'proj-any',
        owner_id: 'u-owner-any',
      });
      const { req: r2, res: s2, next: n2 } = createMockReqRes({
        params: { projectId: 'proj-any' },
        user: { role: 'INTERN' },
        fullUser: { id: 'u-owner-any', roles: [] },
      });
      await mwAny(r2, s2, n2);
      expect(n2).toHaveBeenCalled();

      // Rejection when neither role nor project matches
      mockPrisma.project.findUnique.mockResolvedValue(null);
      const { req: r3, res: s3, next: n3 } = createMockReqRes({
        user: { role: 'INTERN' },
        fullUser: { id: 'u-unauth', roles: [] },
      });
      await mwAny(r3, s3, n3);
      expect(s3.status).toHaveBeenCalledWith(403);
    });

    it('returns 403 when user lacks permission and project lead check fails', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);
      const mw = requirePermission('SUPER_RESTRICTED');
      const { req, res, next } = createMockReqRes({
        user: { role: 'INTERN' },
        fullUser: { id: 'u-intern', roles: [{ role: { name: 'INTERN', permissions: [] } }] },
      });

      await mw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Forbidden: insufficient permissions' })
      );
    });
  })
  describe('Startup Configuration Validation and Security Hardening (SEC-04 & SEC-05)', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('rejects static service token on general user authenticate middleware with 401', async () => {
      process.env.PROJECT_MANAGEMENT_SERVICE_TOKEN = 'some-static-token';
      const { req, res, next } = createMockReqRes({
        headers: { authorization: 'Bearer some-static-token', 'x-organization-id': 'org-spoof' },
      });

      await authenticate(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Static service tokens cannot be used to authenticate user sessions',
      });
    });

    it('validates startup secrets in production: rejects missing or weak access secret', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_ACCESS_SECRET;
      process.env.PM_SERVICE_JWT_SECRET = 'a'.repeat(32);
      process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);

      expect(() => validateStartupConfig()).toThrow('FATAL: JWT_ACCESS_SECRET must be configured in production.');

      process.env.JWT_ACCESS_SECRET = 'short';
      expect(() => validateStartupConfig()).toThrow('FATAL: JWT_ACCESS_SECRET is weak or uses a known placeholder value.');
    });

    it('validates startup secrets in production: rejects weak, placeholder, or matching service secrets', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
      process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);

      delete process.env.PM_SERVICE_JWT_SECRET;
      expect(() => validateStartupConfig()).toThrow('FATAL: PM_SERVICE_JWT_SECRET must be configured in production.');

      process.env.PM_SERVICE_JWT_SECRET = 'too-short-key';
      expect(() => validateStartupConfig()).toThrow('FATAL: PM_SERVICE_JWT_SECRET must be at least 32 bytes and cannot use placeholder values.');

      process.env.PM_SERVICE_JWT_SECRET = 'a'.repeat(32); // Same as access secret!
      expect(() => validateStartupConfig()).toThrow('FATAL: PM_SERVICE_JWT_SECRET cannot be equal to JWT_ACCESS_SECRET.');
    });

    it('validates startup secrets in production: rejects weak or reused refresh secrets', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
      process.env.PM_SERVICE_JWT_SECRET = 'b'.repeat(32);

      delete process.env.JWT_REFRESH_SECRET;
      expect(() => validateStartupConfig()).toThrow('FATAL: JWT_REFRESH_SECRET must be configured in production.');

      process.env.JWT_REFRESH_SECRET = 'refresh_secret'; // Placeholder!
      expect(() => validateStartupConfig()).toThrow('FATAL: JWT_REFRESH_SECRET is weak or uses a known placeholder value.');

      process.env.JWT_REFRESH_SECRET = 'a'.repeat(32); // Reused access secret!
      expect(() => validateStartupConfig()).toThrow('FATAL: JWT_REFRESH_SECRET cannot be equal to JWT_ACCESS_SECRET.');
    });
  });
});
