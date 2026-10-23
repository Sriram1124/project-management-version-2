export interface ResolvedEffectiveUser {
  pm_user_id: string;
  mirai_user_id: string;
  mapping_source: 'mapped' | 'auto_mapped_by_email';
}

export type MappingStatus = 'mapped' | 'unmapped' | 'ambiguous' | 'conflict';
export type MappingSource = 'existing_mapping' | 'auto_mapped_by_email' | null;

export interface ReconciliationResult {
  mirai_user_id: string;
  pm_user_id: string | null;
  mapping_status: MappingStatus;
  mapping_source: MappingSource;
  project_ids: string[];
  as_of: string;
}

