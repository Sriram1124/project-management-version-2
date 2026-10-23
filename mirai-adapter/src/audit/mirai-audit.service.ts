import { AuditService } from '../../../backend-node/src/services/audit.service';
import { MiraiAuditInput } from './types';

export class MiraiAuditService {
  /**
   * Record a MIRAI integration audit event.
   * If a transaction client (tx) is provided, audit creation is atomic with the transaction
   * and any failure will roll back the enclosing transaction.
   */
  static async record(input: MiraiAuditInput): Promise<any> {
    return await AuditService.record(
      {
        organizationId: input.organizationId,
        action: input.action,
        targetType: 'USER_IDENTITY_MAPPING',
        targetId: input.targetId,
        metadata: {
          ...input.metadata,
          actor: input.actor || 'service:mirai',
        },
      },
      input.tx
    );
  }
}

