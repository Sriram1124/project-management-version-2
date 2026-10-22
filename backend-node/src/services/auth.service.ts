import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

const getAccessSecret = (): string => {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error('FATAL: JWT_ACCESS_SECRET must be configured.');
  }
  return secret;
};
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh_secret';
const ACCESS_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '7d';

export class AuthService {
  static async login(
    identifier: string,
    password: string,
    organizationId?: string | null,
    userAgent?: string,
    ipAddress?: string
  ) {
    const cleanIdentifier = identifier.trim();
    const normalizedEmail = cleanIdentifier.toLowerCase();

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: normalizedEmail },
          { user_code: cleanIdentifier }
        ]
      },
      include: {
        organization: {
          select: { id: true, name: true },
        },
        roles: {
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
        },
      },
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    if (!user.is_active) {
      throw new Error('User is inactive');
    }

    const isValid = await argon2.verify(user.password_hash, password);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // Role verification & tenant isolation
    const isSuperAdmin = user.roles.some((r: any) => r.role?.name === 'SUPER_ADMIN');

    if (isSuperAdmin) {
      // Super Admin is root/global (organization_id is null); cannot log in under a tenant organization
      if (organizationId) {
        throw new Error('Invalid credentials');
      }
    } else {
      // If organization_id is provided, it MUST match user.organization_id exactly
      if (organizationId && user.organization_id !== organizationId) {
        throw new Error('Invalid credentials');
      }

      const effectiveOrgId = organizationId || user.organization_id;
      if (effectiveOrgId) {
        // Check whether tenant organization is suspended
        const org = await prisma.organization.findUnique({
          where: { id: effectiveOrgId },
          select: { is_active: true }
        });
        if (org && !org.is_active) {
          const err: any = new Error('Organization account is suspended. Please contact your platform administrator.');
          err.statusCode = 403;
          err.code = 'ORGANIZATION_SUSPENDED';
          throw err;
        }
      }
    }

    const primaryRole = user.roles[0]?.role;
    const permissions = primaryRole?.permissions.map((rp: any) => rp.permission.name) || [];

    const accessToken = jwt.sign(
      { userId: user.id, role: primaryRole?.name },
      getAccessSecret(),
      { expiresIn: ACCESS_EXPIRY as any }
    );

    const refreshToken = jwt.sign(
      { userId: user.id },
      REFRESH_SECRET,
      { expiresIn: '30d' }
    );
    
    // Hash refresh token for DB
    const refreshTokenHash = await argon2.hash(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const session = await prisma.userSession.create({
      data: {
        user_id: user.id,
        refresh_token_hash: refreshTokenHash,
        expires_at: expiresAt,
        user_agent: userAgent,
        ip_address: ipAddress,
        last_used_at: new Date(),
      },
    });

    const leadMemberships = await prisma.projectMember.findMany({
      where: {
        user_id: user.id,
        project_role: 'TECH_LEAD',
      },
      select: { project_id: true },
    });
    const leadProjectIds = leadMemberships.map((m) => m.project_id);
    const isTechLead = primaryRole?.name === 'TECH_LEAD' || leadProjectIds.length > 0;

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        user_code: user.user_code,
        must_change_password: user.must_change_password,
        organization_id: user.organization_id,
        organization: user.organization ? { id: user.organization.id, name: user.organization.name } : null,
        organization_name: user.organization?.name || null,
        created_at: user.created_at,
        role: primaryRole?.name || 'USER',
        is_tech_lead: isTechLead,
        lead_project_ids: leadProjectIds,
        permissions,
      },
      accessToken,
      refreshToken,
      sessionId: session.id,
    };
  }

  static async refresh(refreshToken: string, sessionId: string) {
    try {
      const payload = jwt.verify(refreshToken, REFRESH_SECRET) as any;
      const session = await prisma.userSession.findUnique({
        where: { id: sessionId },
      });

      if (!session || session.revoked_at || session.user_id !== payload.userId) {
        throw new Error('Invalid session');
      }

      if (new Date() > session.expires_at) {
        throw new Error('Session expired');
      }

      const isValid = await argon2.verify(session.refresh_token_hash, refreshToken);
      if (!isValid) {
        throw new Error('Invalid refresh token');
      }

      const user = await prisma.user.findUnique({
        where: { id: session.user_id },
        include: {
          organization: { select: { is_active: true } },
          roles: { include: { role: true } },
        },
      });

      if (!user || !user.is_active) {
        throw new Error('User inactive or not found');
      }

      if (user.organization_id && user.organization && !user.organization.is_active) {
        throw new Error('Organization account is suspended');
      }

      const primaryRole = user.roles[0]?.role;

      const newAccessToken = jwt.sign(
        { userId: user.id, role: primaryRole?.name },
        getAccessSecret(),
        { expiresIn: ACCESS_EXPIRY as any }
      );

      // Keep session updated
      await prisma.userSession.update({
        where: { id: sessionId },
        data: {
          last_used_at: new Date(),
        },
      });

      return {
        accessToken: newAccessToken,
        refreshToken: refreshToken,
        sessionId: session.id,
      };

    } catch (e) {
      throw new Error('Invalid or expired refresh token');
    }
  }

  static async logout(sessionId: string) {
    await prisma.userSession.update({
      where: { id: sessionId },
      data: { revoked_at: new Date() },
    });
  }
}
