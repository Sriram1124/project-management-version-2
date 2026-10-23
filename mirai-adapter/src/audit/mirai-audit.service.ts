import { AuditService } from '../../../backend-node/src/services/audit.service';
import { MiraiAuditInput } from './types';

export class MiraiAuditService {
  /**
   * Record a MIRAI integration audit event.
   * If a transaction client (tx) is provided, audit creation is atomic with the transaction
   * and any failure will roll back the enclosing transaction.
   */
  static async record(input: MiraiAuditInput): Promise<any> {
    const isValidUuid =
      typeof input.actor === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.actor);

    return await AuditService.record(
      {
        actorId: isValidUuid ? input.actor : null,
        organizationId: input.organizationId,
        action: input.action,
        targetType: 'USER_IDENTITY_MAPPING',
        targetId: input.targetId,
        metadata: {
          ...input.metadata,
          actor: input.actor || 'service:mirai',
          organization_id: input.organizationId,
          timestamp: input.metadata?.timestamp || new Date().toISOString(),
        },
      },
      input.tx
    );
  }
}

