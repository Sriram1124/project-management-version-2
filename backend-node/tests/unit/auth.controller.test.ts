import { Request, Response } from 'express';
import { AuthController } from '../../src/controllers/auth.controller';
import { UserService } from '../../src/services/user.service';
import { prisma } from '../../src/lib/prisma';
import * as authMiddleware from '../../src/middleware/auth.middleware';

jest.mock('../../src/services/user.service');
jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

describe('AuthController Unit Tests - Profile & Change Password', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;
  let setHeaderMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    statusMock = jest.fn().mockReturnThis();
    jsonMock = jest.fn().mockReturnThis();
    setHeaderMock = jest.fn().mockReturnThis();

    res = {
      status: statusMock,
      json: jsonMock,
      setHeader: setHeaderMock,
    };
  });

  describe('GET /api/auth/me', () => {
    it('returns full manager profile when req.fullUser is present', async () => {
      req = {
        fullUser: {
          id: 'mgr-123',
          name: 'Jane Manager',
          email: 'jane@company.com',
          user_code: 'MGR001',
          batch: null,
          is_active: true,
          must_change_password: false,
          organization_id: 'org-456',
          created_at: new Date('2025-01-15T10:00:00Z'),
          organization: {
            id: 'org-456',
            name: 'Acme Corp',
          },
          roles: [
            {
              role: {
                name: 'MANAGER',
                permissions: [
                  { permission: { name: 'PROJECT_READ' } },
                  { permission: { name: 'PROJECT_WRITE' } },
                ],
              },
            },
          ],
          project_memberships: [],
        },
      } as any;

      await AuthController.me(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'mgr-123',
          name: 'Jane Manager',
          email: 'jane@company.com',
          role: 'MANAGER',
          organization_id: 'org-456',
          organization_name: 'Acme Corp',
          organization: { id: 'org-456', name: 'Acme Corp' },
          permissions: ['PROJECT_READ', 'PROJECT_WRITE'],
        })
      );
    });

    it('fetches user from DB with organization when fullUser is not on request', async () => {
      req = {
        user: { userId: 'mgr-789', role: 'MANAGER' },
      } as any;

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'mgr-789',
        name: 'Bob Lead',
        email: 'bob@company.com',
        user_code: 'MGR002',
        batch: null,
        is_active: true,
        must_change_password: false,
        organization_id: 'org-999',
        organization: { id: 'org-999', name: 'Tech Org' },
        created_at: new Date('2025-02-01T12:00:00Z'),
        roles: [{ role: { name: 'MANAGER', permissions: [] } }],
        project_memberships: [],
      });

      await AuthController.me(req as Request, res as Response);

      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'mgr-789' },
          select: expect.objectContaining({
            organization: { select: { id: true, name: true } },
            created_at: true,
          }),
        })
      );
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'mgr-789',
          name: 'Bob Lead',
          organization_name: 'Tech Org',
          role: 'MANAGER',
        })
      );
    });

    it('returns 404 if user is not found in database', async () => {
      req = {
        user: { userId: 'non-existent' },
      } as any;

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await AuthController.me(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'User not found' });
    });
  });

  describe('POST /api/auth/change-password', () => {
    it('returns 401 if user is not authenticated', async () => {
      req = {
        body: { current_password: 'oldPassword123', new_password: 'newPassword123' },
      } as any;

      await AuthController.changePassword(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('returns 400 if required password fields are missing', async () => {
      req = {
        user: { userId: 'user-123' },
        body: { current_password: 'oldPassword123' }, // missing new_password
      } as any;

      await AuthController.changePassword(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'current_password and new_password are required',
      });
    });

    it('successfully changes password and invalidates session cache', async () => {
      req = {
        user: { userId: 'user-123' },
        body: {
          current_password: 'oldPassword123',
          new_password: 'newStrongPassword456',
        },
      } as any;

      const invalidateSpy = jest.spyOn(authMiddleware, 'invalidateUserSessionCache');
      (UserService.changePassword as jest.Mock).mockResolvedValue({
        success: true,
        message: 'Password changed successfully.',
      });

      await AuthController.changePassword(req as Request, res as Response);

      expect(UserService.changePassword).toHaveBeenCalledWith(
        'user-123',
        'oldPassword123',
        'newStrongPassword456'
      );
      expect(invalidateSpy).toHaveBeenCalledWith('user-123');
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        message: 'Password changed successfully.',
      });
    });

    it('returns 400 with specific error message when current password is incorrect', async () => {
      req = {
        user: { userId: 'user-123' },
        body: {
          current_password: 'wrongPassword',
          new_password: 'newStrongPassword456',
        },
      } as any;

      (UserService.changePassword as jest.Mock).mockRejectedValue(
        new Error('Current password is incorrect.')
      );

      await AuthController.changePassword(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Current password is incorrect.' });
    });

    it('returns 400 when new password is too short', async () => {
      req = {
        user: { userId: 'user-123' },
        body: {
          current_password: 'oldPassword123',
          new_password: 'short',
        },
      } as any;

      (UserService.changePassword as jest.Mock).mockRejectedValue(
        new Error('New password must be at least 8 characters.')
      );

      await AuthController.changePassword(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'New password must be at least 8 characters.',
      });
    });

    it('returns 400 when new password matches current password', async () => {
      req = {
        user: { userId: 'user-123' },
        body: {
          current_password: 'samePassword123',
          new_password: 'samePassword123',
        },
      } as any;

      (UserService.changePassword as jest.Mock).mockRejectedValue(
        new Error('New password must be different from current password.')
      );

      await AuthController.changePassword(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'New password must be different from current password.',
      });
    });
  });
});

