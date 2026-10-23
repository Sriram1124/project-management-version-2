import request from 'supertest';
import app from '../../src/app';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ProjectService } from '../../src/services/project.service';
import { ProjectController } from '../../src/controllers/project.controller';
import { authenticate, authenticateMiraiService, getServiceJwtSecret, validateStartupConfig, requirePermission } from '../../src/middleware/auth.middleware';
import { mockPrisma, resetPrismaMock } from '../mocks/prisma.mock';

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

describe('MIRAI Project Membership Verification & Integration Tests', () => {
  const orgId = 'org-test-1';
  const otherOrgId = 'org-test-2';

  const mockProject = {
    id: 'proj-uuid-100',
    name: 'InternHub Dashboard',
    description: 'Internal tracking',
    organization_id: orgId,
    owner_id: 'user-manager-1',
    status: 'ACTIVE',
    methodology: 'SCRUM',
  };

  const mockUserMember = {
    id: 'user-uuid-member',
    name: 'Alice Member',
    email: 'alice@company.com',
    organization_id: orgId,
    is_active: true,
  };

  const mockUserNonMember = {
    id: 'user-uuid-nonmember',
    name: 'Bob NonMember',
    email: 'bob@company.com',
    organization_id: orgId,
    is_active: true,
  };

  const mockUserOwner = {
    id: 'user-uuid-owner',
    name: 'Charlie Owner',
    email: 'charlie@company.com',
    organization_id: orgId,
    is_active: true,
  };

  const mockUserTaskAssignee = {
    id: 'user-uuid-assignee',
    name: 'Dave Assignee',
    email: 'dave@company.com',
    organization_id: orgId,
    is_active: true,
  };

  const mockUserAlien = {
    id: 'user-uuid-alien',
    name: 'Eve Alien',
    email: 'eve@alien.com',
    organization_id: otherOrgId,
    is_active: true,
  };

  const mockManagerCaller = {
    id: 'user-manager-1',
    role: 'MANAGER',
    organization_id: orgId,
    roles: [{ role: { name: 'MANAGER', permissions: [{ permission: { name: 'PROJECT_READ' } }] } }],
  };

  beforeEach(() => {
    resetPrismaMock();
    jest.clearAllMocks();
  });

  // ── 1. ProjectService.checkProjectMembership Unit Tests ───────────────────
  describe('ProjectService.checkProjectMembership', () => {
    it('should return is_member: true with role for an existing project member in project_members', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockUserMember);
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({
        project_id: mockProject.id,
        user_id: mockUserMember.id,
        project_role: 'DEVELOPER',
        role_id: null,
      });

      const result = await ProjectService.checkProjectMembership(
        mockProject.id,
        mockUserMember.id,
        mockManagerCaller
      );

      expect(result.is_member).toBe(true);
      expect(result.project_id).toBe(mockProject.id);
      expect(result.user_id).toBe(mockUserMember.id);
      expect(result.project_role).toBe('DEVELOPER');
    });

    it('should return is_member: false for a user who is NOT in project_members', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockUserNonMember);
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce(null);

      const result = await ProjectService.checkProjectMembership(
        mockProject.id,
        mockUserNonMember.id,
        mockManagerCaller
      );

      expect(result.is_member).toBe(false);
      expect(result.project_id).toBe(mockProject.id);
      expect(result.user_id).toBe(mockUserNonMember.id);
      expect(result.project_role).toBeNull();
    });

    it('should return is_member: false for a user who has task assignments but NO entry in project_members', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockUserTaskAssignee);
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce(null);

      const result = await ProjectService.checkProjectMembership(
        mockProject.id,
        mockUserTaskAssignee.id,
        mockManagerCaller
      );

      expect(result.is_member).toBe(false);
      expect(result.project_role).toBeNull();
      // Ensure we queried project_members directly and did not treat task assignment as membership
      expect(mockPrisma.projectMember.findFirst).toHaveBeenCalledWith({
        where: {
          project_id: mockProject.id,
          user_id: mockUserTaskAssignee.id,
        },
        select: expect.anything(),
      });
    });

    it('should return is_member: false for a project owner who is NOT in project_members', async () => {
      // Project owner exists in projects.owner_id and project_owners, but not in project_members
      const ownedProject = { ...mockProject, owner_id: mockUserOwner.id };
      mockPrisma.project.findFirst.mockResolvedValueOnce(ownedProject);
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockUserOwner);
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce(null);

      const result = await ProjectService.checkProjectMembership(
        ownedProject.id,
        mockUserOwner.id,
        mockManagerCaller
      );

      expect(result.is_member).toBe(false);
      expect(result.project_role).toBeNull();
    });

    it('negative test: should demonstrate that a removed project member loses access immediately (is_member: false)', async () => {
      // When a user is removed from a project, their project_members row is deleted.
      // Even if the user exists and the project exists, membership check must immediately return false.
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockUserMember);
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce(null); // Record deleted/revoked

      const result = await ProjectService.checkProjectMembership(
        mockProject.id,
        mockUserMember.id,
        mockManagerCaller
      );

      expect(result.is_member).toBe(false);
      expect(result.project_role).toBeNull();
    });

    it('should throw "Project not found" if project does not exist', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(null);

      await expect(
        ProjectService.checkProjectMembership('non-existent-proj', mockUserMember.id, mockManagerCaller)
      ).rejects.toThrow('Project not found');
    });

    it('should throw "User not found" if target user does not exist in organization', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      await expect(
        ProjectService.checkProjectMembership(mockProject.id, 'ghost-user', mockManagerCaller)
      ).rejects.toThrow('User not found');
    });

    it('negative test: should throw "User not found" for an inactive user (is_active: false)', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.user.findFirst.mockResolvedValueOnce({ ...mockUserMember, is_active: false });

      await expect(
        ProjectService.checkProjectMembership(mockProject.id, mockUserMember.id, mockManagerCaller)
      ).rejects.toThrow('User not found');
    });

    it('should throw "User not found" when checking user from another organization (cross-tenant isolation)', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      await expect(
        ProjectService.checkProjectMembership(mockProject.id, mockUserAlien.id, mockManagerCaller)
      ).rejects.toThrow('User not found');
    });

    it('should throw error when database query fails (never fails open)', async () => {
      mockPrisma.project.findFirst.mockRejectedValueOnce(new Error('PostgreSQL connection dropped'));

      await expect(
        ProjectService.checkProjectMembership(mockProject.id, mockUserMember.id, mockManagerCaller)
      ).rejects.toThrow('PostgreSQL connection dropped');
    });
  });

  // ── 2. ProjectService.getUserProjectMemberships Unit Tests ────────────────
  describe('ProjectService.getUserProjectMemberships', () => {
    it('should return all project IDs that a user is an authoritative member of', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockUserMember);
      mockPrisma.projectMember.findMany.mockResolvedValueOnce([
        { project_id: 'proj-1' },
        { project_id: 'proj-2' },
        { project_id: 'proj-3' },
      ]);

      const result = await ProjectService.getUserProjectMemberships(mockUserMember.id, mockManagerCaller);

      expect(result.user_id).toBe(mockUserMember.id);
      expect(result.project_ids).toEqual(['proj-1', 'proj-2', 'proj-3']);
      expect(result.total).toBe(3);
    });

    it('should return empty array for a user with zero project memberships', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockUserNonMember);
      mockPrisma.projectMember.findMany.mockResolvedValueOnce([]);

      const result = await ProjectService.getUserProjectMemberships(mockUserNonMember.id, mockManagerCaller);

      expect(result.user_id).toBe(mockUserNonMember.id);
      expect(result.project_ids).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should return empty array for a user who only has work item assignments and no project_members records', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockUserTaskAssignee);
      mockPrisma.projectMember.findMany.mockResolvedValueOnce([]);

      const result = await ProjectService.getUserProjectMemberships(mockUserTaskAssignee.id, mockManagerCaller);

      expect(result.project_ids).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should throw "User not found" if user does not exist in caller organization', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      await expect(
        ProjectService.getUserProjectMemberships('unknown-user', mockManagerCaller)
      ).rejects.toThrow('User not found');
    });

    it('negative test: should throw "User not found" for an inactive user (is_active: false)', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({ ...mockUserMember, is_active: false });

      await expect(
        ProjectService.getUserProjectMemberships(mockUserMember.id, mockManagerCaller)
      ).rejects.toThrow('User not found');
    });

    it('should throw error when database fails (never fails open)', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockUserMember);
      mockPrisma.projectMember.findMany.mockRejectedValueOnce(new Error('DB read timeout'));

      await expect(
        ProjectService.getUserProjectMemberships(mockUserMember.id, mockManagerCaller)
      ).rejects.toThrow('DB read timeout');
    });
  });

  // ── 3. Controller Execution Unit Tests ────────────────────────────────────
  describe('ProjectController Membership Endpoints', () => {
    it('checkMemberStatus should respond 200 with is_member: true for confirmed member', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockUserMember);
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({
        project_id: mockProject.id,
        user_id: mockUserMember.id,
        project_role: 'DEVELOPER',
        role_id: null,
      });

      const { req, res } = createMockReqRes({
        params: { id: mockProject.id, userId: mockUserMember.id },
        fullUser: mockManagerCaller,
      });

      await ProjectController.checkMemberStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          is_member: true,
          project_role: 'DEVELOPER',
        })
      );
    });

    it('checkMemberStatus should respond 200 with is_member: false for non-member', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockUserNonMember);
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce(null);

      const { req, res } = createMockReqRes({
        params: { id: mockProject.id, userId: mockUserNonMember.id },
        fullUser: mockManagerCaller,
      });

      await ProjectController.checkMemberStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          is_member: false,
          project_role: null,
        })
      );
    });

    it('checkMemberStatus should respond 404 if project is not found', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(null);

      const { req, res } = createMockReqRes({
        params: { id: 'unknown-proj', userId: mockUserMember.id },
        fullUser: mockManagerCaller,
      });

      await ProjectController.checkMemberStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Project not found' });
    });

    it('getUserMemberships should respond 200 with list of project IDs', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockUserMember);
      mockPrisma.projectMember.findMany.mockResolvedValueOnce([
        { project_id: 'proj-1' },
        { project_id: 'proj-2' },
      ]);

      const { req, res } = createMockReqRes({
        params: { userId: mockUserMember.id },
        fullUser: mockManagerCaller,
      });

      await ProjectController.getUserMemberships(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          project_ids: ['proj-1', 'proj-2'],
          total: 2,
        })
      );
    });

    it('getUserMemberships should respond 404 if user is not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      const { req, res } = createMockReqRes({
        params: { userId: 'ghost-user' },
        fullUser: mockManagerCaller,
      });

      await ProjectController.getUserMemberships(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });
  });

  // ── 4. Machine-to-Machine (M2M) Service Authentication Tests ───────────────
  describe('Machine-to-Machine Service Authentication', () => {
    const originalServiceToken = process.env.PROJECT_MANAGEMENT_SERVICE_TOKEN;

    afterEach(() => {
      process.env.PROJECT_MANAGEMENT_SERVICE_TOKEN = originalServiceToken;
    });

    it('should authenticate via valid M2M Service JWT signed with PM_SERVICE_JWT_SECRET', async () => {
      const serviceSecret = 'dedicated-service-jwt-secret';
      process.env.PM_SERVICE_JWT_SECRET = serviceSecret;

      const serviceJwt = jwt.sign(
        {
          iss: 'mirai-django',
          aud: 'pm-membership-api',
          scope: 'membership:read',
          role: 'SERVICE',
          org: orgId,
        },
        serviceSecret,
        { expiresIn: '5m' }
      );

      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: orgId, is_active: true });

      const { req, res, next } = createMockReqRes({
        headers: {
          authorization: `Bearer ${serviceJwt}`,
        },
      });

      await authenticateMiraiService(req, res, next);

      expect(next).toHaveBeenCalled();
      expect((req as any).user.role).toBe('SERVICE');
      expect((req as any).user.organization_id).toBe(orgId);
      expect((req as any).user.isService).toBe(true);

      const permNext = jest.fn();
      await requirePermission('PROJECT_READ')(req, res, permNext);
      expect(permNext).toHaveBeenCalled();
    });

    it('negative test: should reject a user token presented as a service token (signed with JWT_ACCESS_SECRET)', async () => {
      const serviceSecret = 'dedicated-service-jwt-secret';
      process.env.PM_SERVICE_JWT_SECRET = serviceSecret;

      // User token signed with ACCESS_SECRET, not PM_SERVICE_JWT_SECRET
      const userToken = jwt.sign(
        {
          userId: 'user-alice-123',
          email: 'alice@company.com',
          role: 'DEVELOPER',
          organizationId: orgId,
        },
        ACCESS_SECRET,
        { expiresIn: '5m' }
      );

      const { req, res, next } = createMockReqRes({
        headers: {
          authorization: `Bearer ${userToken}`,
        },
      });

      await authenticateMiraiService(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Invalid service token') })
      );
    });

    it('negative test: should reject service token with missing or wrong issuer (iss)', async () => {
      const serviceSecret = 'dedicated-service-jwt-secret';
      process.env.PM_SERVICE_JWT_SECRET = serviceSecret;

      // Token with wrong issuer
      const wrongIssToken = jwt.sign(
        {
          iss: 'wrong-issuer',
          aud: 'pm-membership-api',
          scope: 'membership:read',
          org: orgId,
        },
        serviceSecret,
        { expiresIn: '5m' }
      );

      const { req, res, next } = createMockReqRes({
        headers: { authorization: `Bearer ${wrongIssToken}` },
      });

      await authenticateMiraiService(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('jwt issuer invalid') })
      );
    });

    it('negative test: should reject service token with missing or wrong audience (aud)', async () => {
      const serviceSecret = 'dedicated-service-jwt-secret';
      process.env.PM_SERVICE_JWT_SECRET = serviceSecret;

      // Token with wrong audience
      const wrongAudToken = jwt.sign(
        {
          iss: 'mirai-django',
          aud: 'wrong-audience',
          scope: 'membership:read',
          org: orgId,
        },
        serviceSecret,
        { expiresIn: '5m' }
      );

      const { req, res, next } = createMockReqRes({
        headers: { authorization: `Bearer ${wrongAudToken}` },
      });

      await authenticateMiraiService(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('jwt audience invalid') })
      );
    });

    it('negative test: should reject service token without membership:read scope (dropping PROJECT_READ alternative)', async () => {
      const serviceSecret = 'dedicated-service-jwt-secret';
      process.env.PM_SERVICE_JWT_SECRET = serviceSecret;

      // Token with only PROJECT_READ, lacking membership:read
      const insufficientScopeToken = jwt.sign(
        {
          iss: 'mirai-django',
          aud: 'pm-membership-api',
          scope: 'PROJECT_READ',
          org: orgId,
        },
        serviceSecret,
        { expiresIn: '5m' }
      );

      const { req, res, next } = createMockReqRes({
        headers: { authorization: `Bearer ${insufficientScopeToken}` },
      });

      await authenticateMiraiService(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Insufficient token scope: requires membership:read',
      });
    });

    it('negative test: should reject service token with lifetime exceeding 5 minutes (300 seconds)', async () => {
      const serviceSecret = 'dedicated-service-jwt-secret';
      process.env.PM_SERVICE_JWT_SECRET = serviceSecret;

      // Token with 1 hour lifetime (exceeds 5m)
      const longLivedToken = jwt.sign(
        {
          iss: 'mirai-django',
          aud: 'pm-membership-api',
          scope: 'membership:read',
          org: orgId,
        },
        serviceSecret,
        { expiresIn: '1h' }
      );

      const { req, res, next } = createMockReqRes({
        headers: { authorization: `Bearer ${longLivedToken}` },
      });

      await authenticateMiraiService(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Token lifetime exceeds maximum allowed 5 minutes (300s)',
      });
    });

    it('negative test: should reject static service token when in production (NODE_ENV === "production")', async () => {
      const prevEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        process.env.PROJECT_MANAGEMENT_SERVICE_TOKEN = 'static-secret-token';

        const { req, res, next } = createMockReqRes({
          headers: { authorization: 'Bearer static-secret-token' },
        });

        await authenticateMiraiService(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
          error: 'Static service tokens are disabled in production',
        });
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    it('negative test: should ignore X-Organization-Id header and reject if token lacks valid org claim', async () => {
      const serviceSecret = 'dedicated-service-jwt-secret';
      process.env.PM_SERVICE_JWT_SECRET = serviceSecret;

      // Token without org claim, relying on header
      const noOrgToken = jwt.sign(
        {
          iss: 'mirai-django',
          aud: 'pm-membership-api',
          scope: 'membership:read',
        },
        serviceSecret,
        { expiresIn: '5m' }
      );

      const { req, res, next } = createMockReqRes({
        headers: {
          authorization: `Bearer ${noOrgToken}`,
          'x-organization-id': orgId, // Header must be ignored
        },
      });

      await authenticateMiraiService(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing canonical organization claim (org) in service token',
      });
    });

    it('negative test: should reject service token that only specifies legacy organizationId instead of canonical org', async () => {
      const serviceSecret = 'dedicated-service-jwt-secret';
      process.env.PM_SERVICE_JWT_SECRET = serviceSecret;
      const now = Math.floor(Date.now() / 1000);
      const token = jwt.sign(
        {
          iss: 'mirai-django',
          aud: 'pm-membership-api',
          scope: 'membership:read',
          organizationId: 'org-fallback-only',
          iat: now,
          exp: now + 300,
        },
        serviceSecret
      );

      const { req, res, next } = createMockReqRes({
        headers: { authorization: `Bearer ${token}` },
      });

      await authenticateMiraiService(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing canonical organization claim (org) in service token',
      });
    });

    it('should reject requests with missing authorization header with 401', async () => {
      const { req, res, next } = createMockReqRes({
        headers: {},
      });

      await authenticateMiraiService(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing or invalid authorization header' });
    });

    it('should reject service token if organization does not exist or is inactive', async () => {
      const serviceSecret = 'dedicated-service-jwt-secret';
      process.env.PM_SERVICE_JWT_SECRET = serviceSecret;

      const validJwt = jwt.sign(
        {
          iss: 'mirai-django',
          aud: 'pm-membership-api',
          scope: 'membership:read',
          org: 'non-existent-org',
        },
        serviceSecret,
        { expiresIn: '5m' }
      );

      mockPrisma.organization.findFirst.mockResolvedValueOnce(null);

      const { req, res, next } = createMockReqRes({
        headers: {
          authorization: `Bearer ${validJwt}`,
        },
      });

      await authenticateMiraiService(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Organization not found or inactive' });
    });

    it('negative test: should reject service token with missing exp claim', async () => {
      const serviceSecret = 'dedicated-service-jwt-secret';
      process.env.PM_SERVICE_JWT_SECRET = serviceSecret;

      const noExpToken = jwt.sign(
        {
          iss: 'mirai-django',
          aud: 'pm-membership-api',
          scope: 'membership:read',
          org: orgId,
          iat: Math.floor(Date.now() / 1000),
        },
        serviceSecret
      );

      const { req, res, next } = createMockReqRes({
        headers: { authorization: `Bearer ${noExpToken}` },
      });

      await authenticateMiraiService(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing token expiration claim (exp)' });
    });

    it('negative test: should reject service token with missing iat claim', async () => {
      const serviceSecret = 'dedicated-service-jwt-secret';
      process.env.PM_SERVICE_JWT_SECRET = serviceSecret;

      const noIatToken = jwt.sign(
        {
          iss: 'mirai-django',
          aud: 'pm-membership-api',
          scope: 'membership:read',
          org: orgId,
          exp: Math.floor(Date.now() / 1000) + 120,
        },
        serviceSecret,
        { noTimestamp: true }
      );

      const { req, res, next } = createMockReqRes({
        headers: { authorization: `Bearer ${noIatToken}` },
      });

      await authenticateMiraiService(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringMatching(/Missing token issued-at claim|iat required when maxAge is specified/) })
      );
    });

    it('negative test: should reject service token issued in the future (future iat)', async () => {
      const serviceSecret = 'dedicated-service-jwt-secret';
      process.env.PM_SERVICE_JWT_SECRET = serviceSecret;

      const futureIat = Math.floor(Date.now() / 1000) + 600;
      const futureToken = jwt.sign(
        {
          iss: 'mirai-django',
          aud: 'pm-membership-api',
          scope: 'membership:read',
          org: orgId,
          iat: futureIat,
          exp: futureIat + 120,
        },
        serviceSecret
      );

      const { req, res, next } = createMockReqRes({
        headers: { authorization: `Bearer ${futureToken}` },
      });

      await authenticateMiraiService(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Token issued in the future (iat)' });
    });

    it('negative test: should reject service token signed with unapproved algorithm (e.g. HS512)', async () => {
      const serviceSecret = 'dedicated-service-jwt-secret';
      process.env.PM_SERVICE_JWT_SECRET = serviceSecret;

      const hs512Token = jwt.sign(
        {
          iss: 'mirai-django',
          aud: 'pm-membership-api',
          scope: 'membership:read',
          org: orgId,
        },
        serviceSecret,
        { algorithm: 'HS512', expiresIn: '5m' }
      );

      const { req, res, next } = createMockReqRes({
        headers: { authorization: `Bearer ${hs512Token}` },
      });

      await authenticateMiraiService(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('invalid algorithm') })
      );
    });

    it('negative test: should fail if PM_SERVICE_JWT_SECRET is missing from environment', async () => {
      const prevSecret = process.env.PM_SERVICE_JWT_SECRET;
      delete process.env.PM_SERVICE_JWT_SECRET;

      try {
        const dummyToken = jwt.sign({ iss: 'mirai-django' }, 'some-key');
        const { req, res, next } = createMockReqRes({
          headers: { authorization: `Bearer ${dummyToken}` },
        });

        await authenticateMiraiService(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
          error: 'FATAL: PM_SERVICE_JWT_SECRET must be configured.',
        });
      } finally {
        process.env.PM_SERVICE_JWT_SECRET = prevSecret;
      }
    });

    it('negative test: validateStartupConfig should throw if PM_SERVICE_JWT_SECRET or JWT_ACCESS_SECRET missing in production', () => {
      const prevEnv = process.env.NODE_ENV;
      const prevAccess = process.env.JWT_ACCESS_SECRET;
      const prevService = process.env.PM_SERVICE_JWT_SECRET;

      try {
        process.env.NODE_ENV = 'production';
        process.env.JWT_ACCESS_SECRET = 'secret1';
        delete process.env.PM_SERVICE_JWT_SECRET;

        expect(() => validateStartupConfig()).toThrow('FATAL: PM_SERVICE_JWT_SECRET must be configured in production.');

        delete process.env.JWT_ACCESS_SECRET;
        process.env.PM_SERVICE_JWT_SECRET = 'secret2';

        expect(() => validateStartupConfig()).toThrow('FATAL: JWT_ACCESS_SECRET must be configured in production.');
      } finally {
        process.env.NODE_ENV = prevEnv;
        process.env.JWT_ACCESS_SECRET = prevAccess;
        process.env.PM_SERVICE_JWT_SECRET = prevService;
      }
    });

    it('negative test: standard user authenticate middleware should reject service tokens presented to user endpoints', async () => {
      const serviceSecret = 'dedicated-service-jwt-secret';
      process.env.PM_SERVICE_JWT_SECRET = serviceSecret;

      const serviceToken = jwt.sign(
        {
          iss: 'mirai-django',
          aud: 'pm-membership-api',
          scope: 'membership:read',
          role: 'SERVICE',
          org: orgId,
        },
        ACCESS_SECRET,
        { expiresIn: '5m' }
      );

      const { req, res, next } = createMockReqRes({
        headers: { authorization: `Bearer ${serviceToken}` },
      });

      await authenticate(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Service tokens cannot be used to authenticate user sessions',
      });
    });
  });

  // ── 5. End-to-End Route Integration Tests ─────────────────────────────────
  describe('Full Route Supertest Verification', () => {
    const serviceSecret = 'm2m-test-token-789';

    beforeEach(() => {
      process.env.PROJECT_MANAGEMENT_SERVICE_TOKEN = serviceSecret;
    });

    it('GET /api/projects/:id/members/:userId/check should verify member via service token', async () => {
      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: orgId });
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockUserMember);
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({
        project_id: mockProject.id,
        user_id: mockUserMember.id,
        project_role: 'DEVELOPER',
        role_id: null,
      });

      const res = await request(app)
        .get(`/api/projects/${mockProject.id}/members/${mockUserMember.id}/check`)
        .set('Authorization', `Bearer ${serviceSecret}`)
        .set('x-organization-id', orgId);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.is_member).toBe(true);
      expect(res.body.data.project_id).toBe(mockProject.id);
      expect(res.body.data.user_id).toBe(mockUserMember.id);
      expect(res.body.is_member).toBe(true);
    });

    it('GET /api/projects/:id/members/:userId/check should return is_member: false for non-member', async () => {
      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: orgId });
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockUserNonMember);
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .get(`/api/projects/${mockProject.id}/members/${mockUserNonMember.id}/check`)
        .set('Authorization', `Bearer ${serviceSecret}`)
        .set('x-organization-id', orgId);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.is_member).toBe(false);
      expect(res.body.is_member).toBe(false);
    });

    it('GET /api/users/:id/project-memberships should return project IDs via service token', async () => {
      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: orgId });
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockUserMember);
      mockPrisma.projectMember.findMany.mockResolvedValueOnce([
        { project_id: 'proj-1' },
        { project_id: 'proj-2' },
      ]);

      const res = await request(app)
        .get(`/api/users/${mockUserMember.id}/project-memberships`)
        .set('Authorization', `Bearer ${serviceSecret}`)
        .set('x-organization-id', orgId);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.project_ids).toEqual(['proj-1', 'proj-2']);
      expect(res.body.data.total).toBe(2);
      expect(res.body.project_ids).toEqual(['proj-1', 'proj-2']);
    });

    it('GET /api/users/:id/project-memberships should return 404 for unknown user', async () => {
      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: orgId });
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/api/users/unknown-user-id/project-memberships')
        .set('Authorization', `Bearer ${serviceSecret}`)
        .set('x-organization-id', orgId);

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'User not found' });
    });

    it('should reject unauthenticated request on both membership endpoints', async () => {
      const res1 = await request(app).get('/api/projects/proj-1/members/user-1/check');
      expect(res1.status).toBe(401);

      const res2 = await request(app).get('/api/users/user-1/project-memberships');
      expect(res2.status).toBe(401);
    });
  });

  // ── 6. Dedicated /internal/mirai/v1 Route Contract Tests ──────────────────
  describe('Internal MIRAI Contract Routes (/internal/mirai/v1)', () => {
    const serviceJwtSecret = 'test-mirai-service-jwt-secret';

    const generateValidM2MToken = (overrides: any = {}) => {
      return jwt.sign(
        {
          iss: 'mirai-django',
          aud: 'pm-membership-api',
          scope: 'membership:read',
          role: 'SERVICE',
          org: orgId,
          ...overrides,
        },
        serviceJwtSecret,
        { expiresIn: '5m' }
      );
    };

    beforeEach(() => {
      process.env.PM_SERVICE_JWT_SECRET = serviceJwtSecret;
    });

    it('GET /internal/mirai/v1/users/:userId/project-memberships should return mapped membership list with valid M2M token', async () => {
      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: orgId, is_active: true });
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockUserMember);
      mockPrisma.projectMember.findMany.mockResolvedValueOnce([
        { project_id: 'proj-uuid-1' },
        { project_id: 'proj-uuid-2' },
      ]);

      const res = await request(app)
        .get(`/internal/mirai/v1/users/${mockUserMember.id}/project-memberships`)
        .set('Authorization', `Bearer ${generateValidM2MToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.mirai_user_id).toBe(mockUserMember.id);
      expect(res.body.mapping_status).toBe('mapped');
      expect(res.body.project_ids).toEqual(['proj-uuid-1', 'proj-uuid-2']);
      expect(res.body.as_of).toBeDefined();
    });

    it('GET /internal/mirai/v1/users/:userId/project-memberships negative test: should return unmapped for non-existent user', async () => {
      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: orgId, is_active: true });
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/internal/mirai/v1/users/unknown-uuid/project-memberships')
        .set('Authorization', `Bearer ${generateValidM2MToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.mirai_user_id).toBe('unknown-uuid');
      expect(res.body.mapping_status).toBe('unmapped');
      expect(res.body.project_ids).toEqual([]);
      expect(res.body.as_of).toBeDefined();
    });

    it('GET /internal/mirai/v1/users/:userId/project-memberships negative test: should return unmapped for inactive user (is_active: false)', async () => {
      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: orgId, is_active: true });
      mockPrisma.user.findFirst.mockResolvedValueOnce({ ...mockUserMember, is_active: false });

      const res = await request(app)
        .get(`/internal/mirai/v1/users/${mockUserMember.id}/project-memberships`)
        .set('Authorization', `Bearer ${generateValidM2MToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.mirai_user_id).toBe(mockUserMember.id);
      expect(res.body.mapping_status).toBe('unmapped');
      expect(res.body.project_ids).toEqual([]);
      expect(res.body.as_of).toBeDefined();
    });

    it('GET /internal/mirai/v1/users/:userId/projects/:projectId/membership should check single project membership with valid token', async () => {
      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: orgId, is_active: true });
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockUserMember);
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({
        project_id: mockProject.id,
        user_id: mockUserMember.id,
        project_role: 'DEVELOPER',
        role_id: null,
      });

      const res = await request(app)
        .get(`/internal/mirai/v1/users/${mockUserMember.id}/projects/${mockProject.id}/membership`)
        .set('Authorization', `Bearer ${generateValidM2MToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.mirai_user_id).toBe(mockUserMember.id);
      expect(res.body.project_id).toBe(mockProject.id);
      expect(res.body.mapping_status).toBe('mapped');
      expect(res.body.is_member).toBe(true);
      expect(res.body.role_in_project).toBe('DEVELOPER');
      expect(res.body.as_of).toBeDefined();
    });

    it('GET /internal/mirai/v1/users/:userId/projects/:projectId/membership should return is_member: false for non-member', async () => {
      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: orgId, is_active: true });
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockUserNonMember);
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .get(`/internal/mirai/v1/users/${mockUserNonMember.id}/projects/${mockProject.id}/membership`)
        .set('Authorization', `Bearer ${generateValidM2MToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.mapping_status).toBe('mapped');
      expect(res.body.is_member).toBe(false);
      expect(res.body.role_in_project).toBeNull();
    });

    it('GET /internal/mirai/v1/users/:userId/projects/:projectId/membership negative test: should return unmapped for inactive user (is_active: false)', async () => {
      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: orgId, is_active: true });
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.user.findFirst.mockResolvedValueOnce({ ...mockUserMember, is_active: false });

      const res = await request(app)
        .get(`/internal/mirai/v1/users/${mockUserMember.id}/projects/${mockProject.id}/membership`)
        .set('Authorization', `Bearer ${generateValidM2MToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.mapping_status).toBe('unmapped');
      expect(res.body.is_member).toBe(false);
      expect(res.body.role_in_project).toBeNull();
    });

    it('GET /internal/mirai/v1/users/:userId/projects/:projectId/membership should return unmapped for unknown user/project', async () => {
      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: orgId, is_active: true });
      mockPrisma.project.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/internal/mirai/v1/users/user-1/projects/unknown-proj/membership')
        .set('Authorization', `Bearer ${generateValidM2MToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.mapping_status).toBe('unmapped');
      expect(res.body.is_member).toBe(false);
    });

    it('negative test: GET /internal/mirai/v1/users/:userId/projects/:projectId/membership demonstrates removed project member loses access immediately', async () => {
      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: orgId, is_active: true });
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockUserMember);
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce(null); // Deleted from project_members

      const res = await request(app)
        .get(`/internal/mirai/v1/users/${mockUserMember.id}/projects/${mockProject.id}/membership`)
        .set('Authorization', `Bearer ${generateValidM2MToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.mapping_status).toBe('mapped');
      expect(res.body.is_member).toBe(false);
      expect(res.body.role_in_project).toBeNull();
    });
  });
});

