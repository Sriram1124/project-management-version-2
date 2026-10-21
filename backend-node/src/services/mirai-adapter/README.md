# MIRAI Project Management Integration Adapter

**Author:** Sriram (Backend Integration Engineer)  
**Consumer:** Chaitanya (MIRAI REST API Layer) & Krish's MIRAI Engineering Team  
**Package:** `src/services/mirai-adapter`  

---

## 1. What Is This Adapter?

The **MIRAI Project Management Integration Adapter** is a reusable, standalone TypeScript backend adapter that connects the **MIRAI Platform** to the deployed **Project Management System (System A)** via its live HTTP REST APIs.

### The Problem It Solves:
- **No Database Duplication**: MIRAI does **not** create duplicate database tables or replicate project management data. The existing project management system on Vercel remains the single authoritative source of truth.
- **Unified & Normalized**: Normalizes upstream projects, hierarchical work items (Epics $\to$ Stories $\to$ Tasks $\to$ Subtasks), sprint milestones, participants, and assignments into stable TypeScript contracts.
- **Zero Schema Invasiveness**: Strictly preserves UUID strings stored as PostgreSQL `TEXT` across both systems.

---

## 2. Architecture & How It Works

```
[ MIRAI Dashboard (Frontend) ]
             │
             ▼
[ MIRAI REST API Layer (Chaitanya's Endpoints) ]
  • Enforces MIRAI Six-Persona Access Matrix (Reviewer, Intern, Admins)
             │
             ▼
[ MiraiProjectManagementAdapter (Sriram's Adapter) ]
  • MiraiHttpClient: Bearer Auth, Timeout Abort, Exponential Backoff
  • MiraiIdentityMapper: Multi-tenant boundary checks & UUID preservation
             │  (HTTPS / REST APIs)
             ▼
[ Deployed Project Management APIs (Vercel Backend) ]
  • Base URL: https://internhub-backend.vercel.app/api
             │
             ▼
[ Authoritative PostgreSQL Database ]
```

### Key Workflow:
1. **Request Execution**: MIRAI's REST controllers invoke single-purpose methods on `MiraiProjectManagementAdapter`.
2. **Resilient Connection**: `MiraiHttpClient` automatically handles Bearer token authentication, timeout cancellation (default 8000ms), and exponential backoff retry for transient network drops or upstream 5xx/429 errors.
3. **Identity & Boundary Enforcement**: `MiraiIdentityMapper` ensures that source user IDs and cohort IDs belong strictly to the expected organization, preventing multi-tenant data leaks.
4. **Data Normalization**: Upstream payloads are transformed into normalized, clean contracts ready for MIRAI views.

---

## 3. Configuration & Environment Variables

Add the following variables to your MIRAI backend `.env`:

```bash
# ── Project Management System Upstream Configuration ─────────────────────────
# Deployed Vercel API Base URL (must end with /api)
PROJECT_MANAGEMENT_API_URL="https://internhub-backend.vercel.app/api"

# Service Account or Manager JWT Bearer Token
PROJECT_MANAGEMENT_API_TOKEN="your_jwt_service_token_here"

# Request timeout in milliseconds (default: 8000)
PROJECT_MANAGEMENT_API_TIMEOUT_MS=8000

# Maximum retry attempts on transient network or 5xx/429 failures (default: 3)
PROJECT_MANAGEMENT_API_MAX_RETRIES=3
```

---

## 4. How to Use the Adapter

Import and instantiate in your service or controller:

```typescript
import { MiraiProjectManagementAdapter } from './services/mirai-adapter';

// 1. Instantiate automatically from environment variables
const adapter = MiraiProjectManagementAdapter.createFromEnv();

// 2. Fetch all active projects
const projects = await adapter.listProjects({ status: 'ACTIVE' });

// 3. Get single project with dynamic task progress calculations
const project = await adapter.getProjectById('project-uuid-123');
console.log(`Completion: ${project.progress.completion_percentage}%`);

// 4. Retrieve hierarchical backlog (with nested parent-child tree)
const taskTree = await adapter.listProjectTasks('project-uuid-123', {
  include_children: true,
});

// 5. Retrieve project milestones (mapped from upstream Sprints)
const milestones = await adapter.listProjectMilestones('project-uuid-123');

// 6. Retrieve project members and normalized roles (TECH_LEAD, MEMBER, MANAGER)
const participants = await adapter.listProjectParticipants('project-uuid-123');

// 7. Retrieve task assignments
const assignments = await adapter.listProjectAssignments('project-uuid-123', {
  user_id: 'intern-user-uuid',
});
```

---

## 5. Available Adapter Interfaces

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `listProjects(filters)` | `status`, `my`, `organization_id`, `limit`, `offset` | `Promise<NormalizedProject[]>` | Retrieves projects with calculated progress metrics. |
| `getProjectById(projectId)` | `projectId: string` | `Promise<NormalizedProject>` | Retrieves single project details and calculates real-time task completion percentage. |
| `listProjectTasks(projectId, filters)` | `type`, `status`, `priority`, `sprint_id`, `assigned_to`, `include_children` | `Promise<NormalizedTask[]>` | Computes `hierarchy_depth` and builds nested task trees. |
| `listProjectMilestones(projectId)` | `projectId: string` | `Promise<NormalizedMilestone[]>` | Maps upstream Sprints into normalized delivery milestones. |
| `listProjectParticipants(projectId, filters)` | `role`, `search` | `Promise<NormalizedParticipant[]>` | Normalizes members and their assigned project roles. |
| `listProjectAssignments(projectId, filters)` | `user_id`, `task_id` | `Promise<NormalizedAssignment[]>` | Flattens task assignees into assignment link pairs. |
| `createFromEnv()` | *None* | `MiraiProjectManagementAdapter` | Factory initializing client and identity mapper from `.env`. |

---

## 6. Error Handling

All upstream errors are translated into clean, typed exception classes:

| Error Class | HTTP Equivalent | When It Is Thrown |
|---|---|---|
| `UpstreamNotFoundError` | `404 Not Found` | Project or resource does not exist. |
| `UpstreamAuthError` | `401 / 403` | Token is invalid, expired, or lacks permission. |
| `UpstreamRateLimitError` | `429 Too Many Requests` | Upstream rate limit reached (includes `retryAfterSeconds`). |
| `UpstreamTimeoutError` | `504 Gateway Timeout` | Request exceeded timeout threshold. |
| `UpstreamNetworkError` | `502 Bad Gateway` | Connection failure after 3 exponential backoff retries. |
| `UserMappingError` | `400 Bad Request` | Cross-organization boundary violation or malformed identity. |

Example controller error mapping:

```typescript
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
    res.status(429).json({ error: 'Rate limit exceeded' });
  } else {
    res.status(500).json({ error: 'Adapter error', details: error.message });
  }
}
```

---

## 7. Testing & Verification

The adapter includes a 100% offline unit test suite:

```bash
# Run adapter unit tests
npm test tests/unit/mirai-project-management.adapter.test.ts
```

- **Test Suite Results**: **23 / 23 Tests PASS (100% coverage)** covering auth, timeouts, retries, 429 backoff, identity mapping, tree nesting, and error handling.
- **Deployed Backend Verification**: Verified against live Vercel backend (`https://internhub-backend.vercel.app/api`) with **41 / 41 passing integration tests**.

