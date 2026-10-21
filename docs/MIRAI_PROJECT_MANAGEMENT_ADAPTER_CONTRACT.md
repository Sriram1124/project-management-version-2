# MIRAI Project Management Adapter Contract & Integration Guide

**Author**: Sriram (Backend Integration Engineer)  
**Consumer**: Chaitanya (MIRAI REST API Engineer)  
**Module Path**: `backend-node/src/services/mirai-adapter`  
**Date**: October 2026  
**Status**: Ready for Production Integration  

---

## 1. Overview & Architecture

The **MIRAI Project Management Adapter** allows MIRAI to retrieve and harmonize data from the existing Project Management System via HTTP APIs without duplicating database tables, business logic, or schema definitions.

### Key Architectural Invariants:
1. **Zero Database Duplication**: MIRAI queries the upstream platform dynamically.
2. **Strict UUID String Invariant**: All IDs across Projects, WorkItems, Milestones (Sprints), Users, and Cohorts are UUID strings stored as PostgreSQL `TEXT`. They are strictly handled as `string` types.
3. **Multi-Tenant Boundary Isolation**: Cross-organization data leakage is strictly prevented. Any cross-tenant mapping mismatch throws an explicit `UserMappingError`.
4. **Resilient HTTP Communication**: Built-in exponential backoff retry for transient network errors (timeouts, 5xx, 429 rate limits), Bearer auth injection, and structured custom errors.

---

## 2. Environment Configuration

Ensure the following variables are present in `backend-node/.env` (documented in `.env.example`):

```bash
# ── MIRAI Integration Adapter Configuration ──────────────────────────────────
# Base URL of the hosted Project Management System API
PROJECT_MANAGEMENT_API_URL="http://localhost:3001/api"

# Service account JWT or bearer token for authenticating upstream API calls
PROJECT_MANAGEMENT_API_TOKEN="<service_account_bearer_token>"

# Upstream request timeout in milliseconds (default: 8000)
PROJECT_MANAGEMENT_API_TIMEOUT_MS=8000

# Maximum retry attempts for transient upstream errors (5xx, 429, timeouts)
PROJECT_MANAGEMENT_API_MAX_RETRIES=3
```

---

## 3. How to Instantiate and Use the Adapter

Import from `src/services/mirai-adapter`:

```typescript
import {
  MiraiProjectManagementAdapter,
  MiraiHttpClient,
  MiraiIdentityMapper,
  MiraiAdapterError,
  UpstreamNotFoundError,
  UpstreamAuthError,
  UpstreamRateLimitError,
  UpstreamTimeoutError,
} from './services/mirai-adapter';

// 1. Recommended: Automatic instantiation from environment variables
const adapter = MiraiProjectManagementAdapter.createFromEnv();

// 2. Custom / Manual instantiation:
const client = new MiraiHttpClient({
  baseUrl: 'http://localhost:3001/api',
  token: 'my-service-token',
  timeoutMs: 8000,
  maxRetries: 3,
});
const mapper = new MiraiIdentityMapper('expected-org-uuid');
const customAdapter = new MiraiProjectManagementAdapter({ client, identityMapper: mapper });
```

---

## 4. Adapter Interface & Methods

### `listProjects(filters?: ProjectFilters): Promise<NormalizedProject[]>`
Retrieves all accessible projects matching optional filters.

- **Parameters**:
  - `filters.status?: string` — (e.g. `'ACTIVE'`, `'PLANNING'`, `'COMPLETED'`)
  - `filters.my?: boolean` — Filter projects where the authenticated user is a member
  - `filters.organization_id?: string` — Filter by organization boundary
  - `filters.limit?: number` / `filters.offset?: number`
- **Returns**: `Promise<NormalizedProject[]>`

```typescript
const activeProjects = await adapter.listProjects({ status: 'ACTIVE' });
```

---

### `getProjectById(projectId: string): Promise<NormalizedProject>`
Retrieves a single project by its UUID and dynamically computes real-time completion metrics from its work items.

- **Parameters**: `projectId: string`
- **Returns**: `Promise<NormalizedProject>`
- **Errors**: Throws `UpstreamNotFoundError` (404) if the project does not exist.

```typescript
const project = await adapter.getProjectById('123e4567-e89b-12d3-a456-426614174000');
console.log(`Completion: ${project.progress.completion_percentage}%`);
```

---

### `listProjectTasks(projectId: string, filters?: TaskFilters): Promise<NormalizedTask[]>`
Retrieves hierarchical tasks/work items with calculated hierarchy depth (`hierarchy_depth`).

- **Parameters**:
  - `projectId: string`
  - `filters.sprint_id?: string`
  - `filters.type?: string` — (`'EPIC'`, `'STORY'`, `'TASK'`, `'SUBTASK'`)
  - `filters.status?: string` — (`'TODO'`, `'IN_PROGRESS'`, `'IN_REVIEW'`, `'DONE'`, `'BLOCKED'`)
  - `filters.priority?: string` — (`'LOW'`, `'MEDIUM'`, `'HIGH'`, `'CRITICAL'`)
  - `filters.parent_id?: string`
  - `filters.assigned_to?: string` — User UUID
  - `filters.include_children?: boolean` — When `true`, returns a nested hierarchical tree (`children` populated on parent tasks)
  - `filters.limit?: number`
- **Returns**: `Promise<NormalizedTask[]>`

```typescript
// Flat list filtered by assignee
const myTasks = await adapter.listProjectTasks(projectId, { assigned_to: userId });

// Nested hierarchical tree (EPIC -> STORIES -> TASKS -> SUBTASKS)
const taskTree = await adapter.listProjectTasks(projectId, { include_children: true });
```

---

### `listProjectMilestones(projectId: string): Promise<NormalizedMilestone[]>`
Retrieves project milestones (mapped from source system Sprints).

- **Parameters**: `projectId: string`
- **Returns**: `Promise<NormalizedMilestone[]>`

```typescript
const milestones = await adapter.listProjectMilestones(projectId);
milestones.forEach((m) => {
  console.log(`${m.name} (${m.status}) - Goal: ${m.goal}`);
});
```

---

### `listProjectParticipants(projectId: string, filters?: ParticipantFilters): Promise<NormalizedParticipant[]>`
Retrieves members associated with the project and normalizes their project roles.

- **Parameters**:
  - `projectId: string`
  - `filters.role?: string` — (e.g. `'TECH_LEAD'`, `'MEMBER'`, `'MANAGER'`, `'INTERN'`)
  - `filters.search?: string` — Search query for name/email
- **Returns**: `Promise<NormalizedParticipant[]>`

```typescript
const techLeads = await adapter.listProjectParticipants(projectId, { role: 'TECH_LEAD' });
```

---

### `listProjectAssignments(projectId: string, filters?: AssignmentFilters): Promise<NormalizedAssignment[]>`
Flattens work item assignees into clean assignment link records.

- **Parameters**:
  - `projectId: string`
  - `filters.user_id?: string`
  - `filters.task_id?: string`
- **Returns**: `Promise<NormalizedAssignment[]>`

```typescript
const assignments = await adapter.listProjectAssignments(projectId, { user_id: userId });
```

---

## 5. Normalized Data Contracts

```typescript
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
  status: string; // 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED'
  methodology: 'SCRUM' | 'KANBAN' | string;
  organization_id: string;
  owner_id: string;
  start_date: string | null; // ISO 8601
  end_date: string | null;   // ISO 8601
  progress: NormalizedProjectProgress;
  created_at: string;        // ISO 8601
  updated_at: string;        // ISO 8601
}

export interface NormalizedTask {
  id: string; // Source UUID (TEXT)
  project_id: string;
  parent_id: string | null; // Hierarchical pointer
  type: 'EPIC' | 'STORY' | 'TASK' | 'SUBTASK' | string;
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
  children?: NormalizedTask[]; // Populated when include_children: true
  created_at: string;
  updated_at: string;
}

export interface NormalizedMilestone {
  id: string; // Source Sprint UUID (TEXT)
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
  role: string; // 'TECH_LEAD' | 'MEMBER' | 'MANAGER' | 'INTERN'
  joined_at?: string;
}

export interface NormalizedAssignment {
  task_id: string;
  project_id: string;
  user_id: string;
  assigned_at?: string;
}
```

---

## 6. Identity & Cohort Mapping

The `MiraiIdentityMapper` handles user & cohort identity resolution and guarantees multi-tenant boundary security:

```typescript
const mapper = adapter.getIdentityMapper();

// Maps a user with strict boundary check
const identity = mapper.mapUser({
  id: 'usr-uuid-123',
  email: 'intern@company.com',
  organization_id: 'org-uuid-a',
  cohort_id: 'cohort-uuid-b',
}, 'expected-org-uuid-a'); // Will throw UserMappingError if actual org is not 'expected-org-uuid-a'
```

---

## 7. Error Handling Guide for Chaitanya's REST Routes

Map adapter errors to corresponding HTTP responses:

```typescript
import {
  UpstreamNotFoundError,
  UpstreamAuthError,
  UpstreamRateLimitError,
  UpstreamTimeoutError,
  UserMappingError,
} from './services/mirai-adapter';

try {
  const project = await adapter.getProjectById(req.params.id);
  res.status(200).json(project);
} catch (error: any) {
  if (error instanceof UpstreamNotFoundError) {
    res.status(404).json({ error: error.message });
  } else if (error instanceof UpstreamAuthError) {
    res.status(401).json({ error: 'Upstream authorization failed' });
  } else if (error instanceof UpstreamRateLimitError) {
    res.setHeader('Retry-After', error.retryAfterSeconds || 60);
    res.status(429).json({ error: 'Upstream rate limit reached' });
  } else if (error instanceof UpstreamTimeoutError) {
    res.status(504).json({ error: 'Upstream service timed out' });
  } else if (error instanceof UserMappingError) {
    res.status(400).json({ error: error.message });
  } else {
    res.status(500).json({ error: 'Internal adapter error', details: error.message });
  }
}
```

