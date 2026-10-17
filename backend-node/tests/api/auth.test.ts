import request from 'supertest';
import app from '../../src/app';
import { mockPrisma } from '../mocks/prisma.mock';
import { setupAuthUser, getAuthHeaders, createTestToken } from '../helpers/auth.helper';
import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';

jest.mock('argon2', () => ({
  verify: jest.fn(),
  hash: jest.fn().mockResolvedValue('$argon2id$mocked-hash'),
}));

describe('Auth API (/api/auth)', () => {
  describe('GET /api/auth/organizations', () => {
    it('should return a list of active organizations with caching headers', async () => {
      mockPrisma.organization.findMany.mockResolvedValueOnce([
        { id: 'org-1', name: 'Alpha Corp' },
        { id: 'org-2', name: 'Beta Ltd' },
      ]);

      const res = await request(app).get('/api/auth/organizations');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      expect(res.headers['cache-control']).toContain('public');
    });

    it('should handle database errors gracefully', async () => {
      // Force cache expiry by mocking findMany rejection when cache is bypassed
      const { invalidateOrganizationsCache } = require('../../src/controllers/auth.controller');
      invalidateOrganizationsCache();
      mockPrisma.organization.findMany.mockRejectedValueOnce(new Error('DB Query Failure'));

      const res = await request(app).get('/api/auth/organizations');

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error', 'Failed to fetch organizations');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should return 400 if email/identifier or password is missing', async () => {
      const res1 = await request(app).post('/api/auth/login').send({ password: 'Password123!' });
      expect(res1.status).toBe(400);

      const res2 = await request(app).post('/api/auth/login').send({ email: 'user@test.com' });
      expect(res2.status).toBe(400);
    });

    it('should return 401 if user does not exist', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      const res = await request(app).post('/api/auth/login').send({
        email: 'nonexistent@test.com',
        password: 'Password123!',
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should return 401 if user is inactive', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        id: 'u-inactive',
        email: 'inactive@test.com',
        is_active: false,
        password_hash: 'hash',
        roles: [],
      });

      const res = await request(app).post('/api/auth/login').send({
        email: 'inactive@test.com',
        password: 'Password123!',
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('User is inactive');
    });

    it('should return 401 if password verification fails', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        id: 'u-1',
        email: 'user@test.com',
        is_active: true,
        password_hash: 'hash',
        roles: [],
      });
      (argon2.verify as jest.Mock).mockResolvedValueOnce(false);

      const res = await request(app).post('/api/auth/login').send({
        email: 'user@test.com',
        password: 'WrongPassword',
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should return 403 if organization account is suspended', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        id: 'u-1',
        email: 'user@test.com',
        is_active: true,
        password_hash: 'hash',
        organization_id: 'org-suspended',
        roles: [{ role: { name: 'DEVELOPER', permissions: [] } }],
      });
      (argon2.verify as jest.Mock).mockResolvedValueOnce(true);
      mockPrisma.organization.findUnique.mockResolvedValueOnce({ is_active: false });

      const res = await request(app).post('/api/auth/login').send({
        email: 'user@test.com',
        password: 'CorrectPassword',
      });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Organization account is suspended');
    });

    it('should login successfully, set cookies, and return tokens', async () => {
      const mockUser = {
        id: 'u-success',
        name: 'Success User',
        email: 'success@test.com',
        user_code: 'SUC001',
        batch: '2026',
        must_change_password: false,
        is_active: true,
        password_hash: 'hash',
        organization_id: 'org-1',
        roles: [
          {
            role: {
              name: 'MANAGER',
              permissions: [{ permission: { name: 'PROJECT_READ' } }],
            },
          },
        ],
      };

      mockPrisma.user.findFirst.mockResolvedValueOnce(mockUser);
      (argon2.verify as jest.Mock).mockResolvedValueOnce(true);
      mockPrisma.organization.findUnique.mockResolvedValueOnce({ is_active: true });
      mockPrisma.userSession.create.mockResolvedValueOnce({ id: 'session-xyz' });

      const res = await request(app).post('/api/auth/login').send({
        email: 'success@test.com',
        password: 'CorrectPassword',
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body).toHaveProperty('sessionId', 'session-xyz');
      expect(res.body.user).toHaveProperty('email', 'success@test.com');
      expect(res.headers['set-cookie']).toBeDefined();
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should return 401 if refresh token or session ID is missing', async () => {
      const res = await request(app).post('/api/auth/refresh').send({});
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Refresh token and session ID required');
    });

    it('should return 401 on invalid or expired refresh token', async () => {
      const res = await request(app).post('/api/auth/refresh').send({
        refreshToken: 'invalid-token',
        sessionId: 'session-123',
      });
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid or expired refresh token');
    });

    it('should rotate tokens successfully on valid refresh token and active session', async () => {
      const refreshSecret = process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret';
      const validRefreshToken = jwt.sign({ userId: 'u-refresh-test' }, refreshSecret, { expiresIn: '1d' });

      mockPrisma.userSession.findUnique.mockResolvedValueOnce({
        id: 'session-valid',
        user_id: 'u-refresh-test',
        refresh_token_hash: 'mock-hash',
        expires_at: new Date(Date.now() + 86400000),
        revoked_at: null,
      });
      (argon2.verify as jest.Mock).mockResolvedValueOnce(true);
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'u-refresh-test',
        is_active: true,
        organization_id: 'org-1',
        organization: { is_active: true },
        roles: [{ role: { name: 'DEVELOPER' } }],
      });
      mockPrisma.userSession.update.mockResolvedValueOnce({ id: 'session-valid' });

      const res = await request(app).post('/api/auth/refresh').send({
        refreshToken: validRefreshToken,
        sessionId: 'session-valid',
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body).toHaveProperty('sessionId', 'session-valid');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should require authentication', async () => {
      const res = await request(app).post('/api/auth/logout');
      expect(res.status).toBe(401);
    });

    it('should logout and clear cookies when authenticated', async () => {
      const { authHeader } = setupAuthUser({ role: 'DEVELOPER' });
      mockPrisma.userSession.updateMany.mockResolvedValueOnce({ count: 1 });

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', authHeader)
        .send({ sessionId: 'session-to-logout' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Logged out successfully');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return 401 if unauthorized', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('should return current user profile for manager with permissions', async () => {
      const { authHeader } = setupAuthUser({
        id: 'u-manager',
        email: 'manager@test.com',
        role: 'MANAGER',
        permissions: ['PROJECT_READ', 'USER_READ'],
      });

      const res = await request(app).get('/api/auth/me').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', 'u-manager');
      expect(res.body).toHaveProperty('email', 'manager@test.com');
      expect(res.body.role).toBe('MANAGER');
      expect(res.body.permissions).toEqual(expect.arrayContaining(['PROJECT_READ', 'USER_READ']));
    });

    it('should hide sensitive API permissions from intern profile', async () => {
      const { authHeader } = setupAuthUser({
        id: 'u-intern',
        email: 'intern@test.com',
        role: 'INTERN',
        permissions: ['PROJECT_READ'],
      });

      const res = await request(app).get('/api/auth/me').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.role).toBe('INTERN');
      expect(res.body.permissions).toEqual([]);
      expect(res.body.user_code).toBeUndefined();
    });

    it('should allow /api/auth/me when must_change_password is true (exempt endpoint)', async () => {
      const { authHeader } = setupAuthUser({
        id: 'u-must-change',
        role: 'DEVELOPER',
        must_change_password: true,
      });

      const res = await request(app).get('/api/auth/me').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.must_change_password).toBe(true);
    });
  });

  describe('POST /api/auth/change-password', () => {
    it('should require authentication', async () => {
      const res = await request(app).post('/api/auth/change-password').send({
        current_password: 'old',
        new_password: 'new',
      });
      expect(res.status).toBe(401);
    });

    it('should return 400 if parameters are missing', async () => {
      const { authHeader } = setupAuthUser({ role: 'DEVELOPER' });
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', authHeader)
        .send({ current_password: 'old' });

      expect(res.status).toBe(400);
    });

    it('should return 400 if current password is wrong', async () => {
      const { authHeader, user } = setupAuthUser({ id: 'u-cp', role: 'DEVELOPER' });
      (argon2.verify as jest.Mock).mockResolvedValueOnce(false);

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', authHeader)
        .send({
          current_password: 'WrongCurrentPassword',
          new_password: 'ValidNewPassword123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Current password is incorrect');
    });

    it('should change password successfully and clear must_change_password flag', async () => {
      const { authHeader, user } = setupAuthUser({ id: 'u-cp-success', role: 'DEVELOPER' });
      (argon2.verify as jest.Mock).mockResolvedValueOnce(true);
      mockPrisma.user.update.mockResolvedValueOnce({
        id: 'u-cp-success',
        must_change_password: false,
      });

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', authHeader)
        .send({
          current_password: 'OldPassword123!',
          new_password: 'NewStrongPassword123!',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message');
    });
  });
});
