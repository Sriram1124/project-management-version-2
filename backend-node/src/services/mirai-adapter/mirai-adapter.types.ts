/**
 * MIRAI Project Management Integration Adapter - Type Definitions & Contracts
 * 
 * Strict type invariants:
 * - All UUIDs are strings stored as TEXT in the underlying database.
 * - Source models are cleanly normalized into type-safe contracts for MIRAI consumption.
 */

// ── Custom Error Hierarchy ──────────────────────────────────────────────────

export class MiraiAdapterError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly details?: any;

  constructor(message: string, code = 'MIRAI_ADAPTER_ERROR', statusCode = 500, details?: any) {
    super(message);
    this.name = 'MiraiAdapterError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UpstreamTimeoutError extends MiraiAdapterError {
  constructor(message = 'Upstream Project Management API timed out', details?: any) {
    super(message, 'UPSTREAM_TIMEOUT', 504, details);
    this.name = 'UpstreamTimeoutError';
  }
}

export class UpstreamAuthError extends MiraiAdapterError {
  constructor(message = 'Authentication or authorization failure with Upstream API', statusCode = 401, details?: any) {
    super(message, 'UPSTREAM_AUTH_ERROR', statusCode, details);
    this.name = 'UpstreamAuthError';
  }
}

export class UpstreamNotFoundError extends MiraiAdapterError {
  constructor(message = 'Requested resource was not found on Upstream API', details?: any) {
    super(message, 'UPSTREAM_NOT_FOUND', 404, details);
    this.name = 'UpstreamNotFoundError';
  }
}

export class UpstreamRateLimitError extends MiraiAdapterError {
  public readonly retryAfterSeconds?: number;

  constructor(message = 'Upstream API rate limit exceeded', retryAfterSeconds?: number, details?: any) {
    super(message, 'UPSTREAM_RATE_LIMIT', 429, details);
    this.name = 'UpstreamRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class UpstreamNetworkError extends MiraiAdapterError {
  constructor(message = 'Network connection failed when reaching Upstream API', details?: any) {
    super(message, 'UPSTREAM_NETWORK_ERROR', 502, details);
    this.name = 'UpstreamNetworkError';
  }
}

export class UserMappingError extends MiraiAdapterError {
  constructor(message: string, details?: any) {
    super(message, 'USER_MAPPING_ERROR', 400, details);
    this.name = 'UserMappingError';
  }
}

// ── Normalized Data Models ──────────────────────────────────────────────────

export interface NormalizedProjectProgress {
  total_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
  completion_percentage: number;
}

export interface NormalizedProject {
  id: string; // Source UUID (TEXT)
  name: string;
  description: string | null;
  status: string; // e.g. 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED'
  methodology: 'SCRUM' | 'KANBAN' | string;
  organization_id: string;
  owner_id: string;
  start_date: string | null;
  end_date: string | null;
  progress: NormalizedProjectProgress;
  created_at: string;
  updated_at: string;
}

export type WorkItemHierarchyType = 'EPIC' | 'STORY' | 'TASK' | 'SUBTASK' | string;

export interface NormalizedTask {
  id: string; // Source UUID (TEXT)
  project_id: string;
  parent_id: string | null; // Hierarchical pointer for Jira-style nested tasks
  type: WorkItemHierarchyType;
  title: string;
  description: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'BLOCKED' | string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string;
  story_points: number | null;
  sprint_id: string | null;
  assignee_ids: string[];
  due_date: string | null;
  completed_at: string | null;
  hierarchy_depth: number; // 0 for EPIC/standalone, 1 for STORY, 2 for TASK, 3 for SUBTASK
  children?: NormalizedTask[];
  created_at: string;
  updated_at: string;
}

export interface NormalizedMilestone {
  id: string; // Source sprint UUID (TEXT)
  project_id: string;
  name: string;
  goal: string | null;
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED' | string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface NormalizedParticipant {
  id: string; // User UUID (TEXT)
  project_id: string;
  name: string;
  email: string;
  role: string; // 'TECH_LEAD' | 'MEMBER' | 'MANAGER' | 'INTERN' | string
  joined_at?: string;
}

export interface NormalizedAssignment {
  task_id: string;
  project_id: string;
  user_id: string;
  assigned_at?: string;
}

export interface IdentityMapping {
  source_user_id: string;
  canonical_user_id: string;
  organization_id: string;
  cohort_id: string | null;
  email: string;
  mapped_at: string;
}

// ── Query Filter Interfaces ─────────────────────────────────────────────────

export interface ProjectFilters {
  status?: string;
  my?: boolean;
  organization_id?: string;
  limit?: number;
  offset?: number;
}

export interface TaskFilters {
  sprint_id?: string;
  type?: string;
  status?: string;
  priority?: string;
  parent_id?: string;
  assigned_to?: string;
  include_children?: boolean;
  limit?: number;
}

export interface ParticipantFilters {
  role?: string;
  search?: string;
}

export interface AssignmentFilters {
  user_id?: string;
  task_id?: string;
}

