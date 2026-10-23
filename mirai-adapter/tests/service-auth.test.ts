import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authenticateMiraiService, getServiceJwtSecret } from '../src/authentication/service-auth.middleware';
import { mockPrisma, resetPrismaMock } from '../../backend-node/tests/mocks/prisma.mock';

const SERVICE_SECRET = 'test-dedicated-pm-service-jwt-secret-key-32chars!';

function createMockReqRes(options: {
  headers?: Record<string, string>;
  params?: Record<string, string>;
  body?: any;
}) {
  const req = {
    headers: options.headers || {},
    params: options.params || {},
    body: options.body || {},
    query: {},
  } as unknown as Request;

  let statusCode = 200;
  let responseData: any = null;

  const res = {
    status: jest.fn().mockImplementation((code: number) => {
      statusCode = code;
      return res;
    }),
    json: jest.fn().mockImplementation((data: any) => {
      responseData = data;
      return res;
    }),
    send: jest.fn().mockImplementation((data: any) => {
      responseData = data;
      return res;
    }),
  } as unknown as Response;

  const next = jest.fn();

  return { req, res, next, getStatus: () => statusCode, getData: () => responseData };
}

describe('MiraiAdapter: Service Authentication Middleware', () => {
  const prevEnv = process.env;

  beforeEach(() => {
    resetPrismaMock();
    process.env = { ...prevEnv, PM_SERVICE_JWT_SECRET: SERVICE_SECRET };
  });

  afterAll(() => {
    process.env = prevEnv;
  });

  describe('getServiceJwtSecret', () => {
    it('returns configured secret', () => {
      expect(getServiceJwtSecret()).toBe(SERVICE_SECRET);
    });

    it('throws error when secret is missing', () => {
      delete process.env.PM_SERVICE_JWT_SECRET;
      expect(() => getServiceJwtSecret()).toThrow('FATAL: PM_SERVICE_JWT_SECRET must be configured.');
    });

    it('throws production-specific error when secret is missing in production', () => {
      delete process.env.PM_SERVICE_JWT_SECRET;
      process.env.NODE_ENV = 'production';
      expect(() => getServiceJwtSecret()).toThrow('FATAL: PM_SERVICE_JWT_SECRET is required in production.');
    });
  });

  describe('authenticateMiraiService', () => {
    it('rejects request with missing Authorization header (401)', async () => {
      const { req, res, next, getStatus, getData } = createMockReqRes({});
      await authenticateMiraiService(req, res, next);

      expect(getStatus()).toBe(401);
      expect(getData()).toEqual({ error: 'Missing or invalid authorization header' });
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects request with non-Bearer Authorization header (401)', async () => {
      const { req, res, next, getStatus, getData } = createMockReqRes({
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
      });
      await authenticateMiraiService(req, res, next);

      expect(getStatus()).toBe(401);
      expect(getData()).toEqual({ error: 'Missing or invalid authorization header' });
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects static tokens for MIRAI endpoints (401)', async () => {
      process.env.PROJECT_MANAGEMENT_SERVICE_TOKEN = 'static-legacy-token-value';
      const { req, res, next, getStatus, getData } = createMockReqRes({
        headers: { authorization: 'Bearer static-legacy-token-value' },
      });
      await authenticateMiraiService(req, res, next);

      expect(getStatus()).toBe(401);
      expect(getData().error).toMatch(/Static service tokens are disabled/);
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects token signed with wrong secret (401)', async () => {
      const wrongToken = jwt.sign(
        { iss: 'mirai-django', aud: 'pm-membership-api', org: 'org-1', scope: 'membership:read' },
        'wrong-secret-key-wrong-secret-key!'
      );
      const { req, res, next, getStatus, getData } = createMockReqRes({
        headers: { authorization: `Bearer ${wrongToken}` },
      });
      await authenticateMiraiService(req, res, next);

      expect(getStatus()).toBe(401);
      expect(getData().error).toMatch(/Invalid service token/);
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects token with invalid issuer (401)', async () => {
      const token = jwt.sign(
        { iss: 'other-service', aud: 'pm-membership-api', org: 'org-1', scope: 'membership:read' },
        SERVICE_SECRET
      );
      const { req, res, next, getStatus, getData } = createMockReqRes({
        headers: { authorization: `Bearer ${token}` },
      });
      await authenticateMiraiService(req, res, next);

      expect(getStatus()).toBe(401);
      expect(getData().error).toMatch(/Invalid service token/);
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects token with missing scope or wrong scope (403)', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = jwt.sign(
        {
          iss: 'mirai-django',
          aud: 'pm-membership-api',
          org: 'org-1',
          scope: 'other:scope',
          iat: nowSec,
          exp: nowSec + 120,
        },
        SERVICE_SECRET
      );
      const { req, res, next, getStatus, getData } = createMockReqRes({
        headers: { authorization: `Bearer ${token}` },
      });
      await authenticateMiraiService(req, res, next);

      expect(getStatus()).toBe(403);
      expect(getData().error).toMatch(/requires membership:read/);
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects token when organization is not found in PM database (403)', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = jwt.sign(
        {
          iss: 'mirai-django',
          aud: 'pm-membership-api',
          org: 'non-existent-org',
          scope: 'membership:read',
          iat: nowSec,
          exp: nowSec + 120,
        },
        SERVICE_SECRET
      );
      (mockPrisma.organization.findFirst as jest.Mock).mockResolvedValue(null);

      const { req, res, next, getStatus, getData } = createMockReqRes({
        headers: { authorization: `Bearer ${token}` },
      });
      await authenticateMiraiService(req, res, next);

      expect(getStatus()).toBe(403);
      expect(getData().error).toBe('Organization not found or inactive');
      expect(next).not.toHaveBeenCalled();
    });

    it('authenticates valid M2M service token and calls next() with service user attached', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = jwt.sign(
        {
          iss: 'mirai-django',
          aud: 'pm-membership-api',
          org: 'valid-org-uuid',
          scope: 'membership:read',
          iat: nowSec,
          exp: nowSec + 120,
        },
        SERVICE_SECRET
      );
      (mockPrisma.organization.findFirst as jest.Mock).mockResolvedValue({
        id: 'valid-org-uuid',
        is_active: true,
      });

      const { req, res, next } = createMockReqRes({
        headers: { authorization: `Bearer ${token}` },
      });
      await authenticateMiraiService(req, res, next);

      expect(next).toHaveBeenCalled();
      expect((req as any).fullUser).toBeDefined();
      expect((req as any).fullUser.organization_id).toBe('valid-org-uuid');
      expect((req as any).fullUser.role).toBe('SERVICE');
    });
  });
});

