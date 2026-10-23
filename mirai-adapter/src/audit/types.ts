export type MiraiAuditAction =
  | 'MIRAI_IDENTITY_MAPPED'
  | 'MIRAI_IDENTITY_RECONCILED'
  | 'MIRAI_IDENTITY_RECONCILE_CONFLICT'
  | 'MIRAI_IDENTITY_RECONCILE_AMBIGUOUS'
  | 'MIRAI_IDENTITY_RECONCILE_FAILED_INACTIVE'
  | 'MIRAI_IDENTITY_UNMAPPED';

export interface MiraiAuditInput {
  organizationId: string;
  action: MiraiAuditAction;
  targetId: string;
  metadata: Record<string, any>;
  actor?: string;
  tx?: any;
}

