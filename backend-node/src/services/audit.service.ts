import { prisma } from '../lib/prisma';

export interface CreateAuditLogInput {
  actorId?: string | null;
  organizationId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, any> | null;
  ipAddress?: string;
  userAgent?: string;
}

export class AuditService {
  /**
   * Deep sanitize metadata to guarantee NO passwords, hashes, or tokens are ever logged.
   */
  private static sanitizeMetadata(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeMetadata(item));
    }

    const forbiddenKeys = [
      'password',
      'temporary_password',
      'temporarypassword',
      'password_hash',
      'passwordhash',
      'token',
      'accesstoken',
      'refreshtoken',
      'access_token',
      'refresh_token',
      'secret',
      'secret_key',
    ];

    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      const lower = key.toLowerCase();
      if (forbiddenKeys.some((f) => lower.includes(f))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeMetadata(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Record a sensitive administrative operation.
   */
  static async record(input: CreateAuditLogInput) {
    try {
      const sanitizedMeta = input.metadata ? this.sanitizeMetadata(input.metadata) : null;
      return await prisma.auditLog.create({
        data: {
          actor_id: input.actorId || null,
          organization_id: input.organizationId || null,
          action: input.action,
          target_type: input.targetType,
          target_id: input.targetId,
          metadata: sanitizedMeta,
          ip_address: input.ipAddress || null,
          user_agent: input.userAgent || null,
        },
      });
    } catch (err) {
      console.error('[AuditService] Failed to record audit log:', err);
      return null;
    }
  }

  /**
   * Paginated listing of audit logs strictly for Superadmin.
   */
  static async listLogs(params: {
    page?: number;
    limit?: number;
    action?: string;
    targetType?: string;
    organizationId?: string;
  }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.action) {
      where.action = params.action;
    }
    if (params.targetType) {
      where.target_type = params.targetType;
    }
    if (params.organizationId) {
      where.organization_id = params.organizationId;
    }

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: {
          actor: {
            select: {
              id: true,
              name: true,
              email: true,
              user_code: true,
            },
          },
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}
