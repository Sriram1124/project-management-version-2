import jwt from 'jsonwebtoken';
import { mockPrisma } from '../mocks/prisma.mock';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-jwt-access-secret';

export interface TestUserOptions {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  organization_id?: string | null;
  org_active?: boolean;
  is_active?: boolean;
  must_change_password?: boolean;
  permissions?: string[];
  direct_permissions?: string[];
  project_lead_ids?: string[];
}

export function createTestToken(payload: {
  userId: string;
  email: string;
  role: string;
  organization_id?: string | null;
}): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '1h' });
}

export function setupAuthUser(options: TestUserOptions = {}) {
  const {
    id = 'user-test-id',
    name = 'Test User',
    email = 'user@example.com',
    role = 'MANAGER',
    organization_id = 'org-test-1',
    org_active = true,
    is_active = true,
    must_change_password = false,
    permissions = [],
    direct_permissions = [],
    project_lead_ids = [],
  } = options;

  const dbUser = {
    id,
    name,
    email,
    user_code: 'USR001',
    batch: '2026',
    is_active,
    must_change_password,
    organization_id,
    organization: organization_id
      ? {
          id: organization_id,
          name: 'Test Org',
          is_active: org_active,
        }
      : null,
    roles: [
      {
        role: {
          id: `role-${role}`,
          name: role,
          permissions: permissions.map((p) => ({
            permission: { name: p },
          })),
        },
      },
    ],
    user_permissions: (direct_permissions || []).map((p) => ({
      permission: { id: `perm-${p}`, name: p },
    })),
    project_memberships: project_lead_ids.map((pid) => ({
      project_id: pid,
    })),
  };

  mockPrisma.user.findUnique.mockImplementation((args: any) => {
    if (args?.where?.id === id) {
      return Promise.resolve(dbUser);
    }
    if (args?.where?.email === email) {
      return Promise.resolve(dbUser);
    }
    return Promise.resolve(null);
  });

  const { setUserSessionInCache } = require('../../src/middleware/auth.middleware');
  setUserSessionInCache(id, dbUser);

  const token = createTestToken({
    userId: id,
    email,
    role,
    organization_id,
  });

  return {
    user: dbUser,
    token,
    authHeader: `Bearer ${token}`,
  };
}

export function getAuthHeaders(options: TestUserOptions = {}) {
  const { authHeader } = setupAuthUser(options);
  return { Authorization: authHeader };
}
