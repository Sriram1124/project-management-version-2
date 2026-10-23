export interface ProjectMembershipCheckResult {
  is_member: boolean;
  project_id: string;
  user_id: string;
  pm_user_id: string;
  mapping_source: 'mapped' | 'auto_mapped_by_email';
  project_role: string | null;
  role_id: string | null;
  joined_at: string | null;
}

export interface UserMembershipsResult {
  user_id: string;
  pm_user_id: string;
  mapping_source: 'mapped' | 'auto_mapped_by_email';
  project_ids: string[];
  total: number;
}

