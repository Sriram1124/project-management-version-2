# Superadmin Role & Implementation Plan — InternHub

**Date:** October 11, 2026  
**Document Version:** 1.0  
**Scope:** Existing Audit, Security Assessment, and Step-by-Step Implementation Plan for Superadmin Functionality.

---

## 1. Executive Summary & Audit Baseline

In the current InternHub codebase, the **`SUPER_ADMIN`** role serves as a **global, root-level control plane administrator** that exists completely outside the multi-tenant hierarchy (`user.organization_id = null`).

### Current Implemented Baseline
1. **Atomic Tenant Provisioning:** `POST /api/organizations` creates an `Organization` and provisions the initial `MANAGER` user with an auto-generated temporary password inside a single `prisma.$transaction`.
2. **Global Tenant Directory:** `GET /api/organizations` lists all organizations with aggregate counts (`users`, `projects`, `work_items`, `forms`) and the primary managers.
3. **Single Organization Inspector:** `GET /api/organizations/:id` lists organization stats and member rosters.
4. **Backend Enforcement:** Routes under `/api/organizations` are strictly guarded by `authenticate` and `requireRole(['SUPER_ADMIN'])`.

### Identified Operational Gaps
- **Zero Manager Recovery:** If an initial manager misplaces their temporary password, Superadmin cannot reset it.
- **No Organization Lifecycle:** Organizations lack `is_active` or suspension flags; they cannot be deactivated or edited.
- **Single Manager Limitation:** No endpoint exists to provision secondary or replacement managers into an existing organization.
- **No Audit Trail:** Administrative actions are not logged in any persistent database table.

---

## 2. Capability Matrix

| Capability | Status | Relevant Frontend Files | Relevant Backend Endpoints | Prisma Models |
| :--- | :--- | :--- | :--- | :--- |
| **Create Org + Initial Manager** | **Fully Implemented** | `CreateOrganizationModal.jsx` | `POST /api/organizations` | `Organization`, `User`, `UserRole` |
| **List Platform Organizations** | **Fully Implemented** | `SuperAdminDashboardView.jsx` | `GET /api/organizations` | `Organization`, `User` |
| **View Organization Details** | **Fully Implemented** | `SuperAdminDashboardView.jsx` | `GET /api/organizations/:id` | `Organization`, `User` |
| **Update Organization Details** | **Not Implemented** | *Needs UI in Org Details* | `PATCH /api/organizations/:id` | `Organization` |
| **Suspend / Deactivate Organization**| **Not Implemented** | *Needs Toggle / Action* | `POST /api/organizations/:id/status` | `Organization` (`is_active`) |
| **Reset Manager Passwords** | **Not Implemented** | *Needs Button in Member Roster*| `POST /api/organizations/:id/managers/:managerId/reset-password` | `User` |
| **Add Additional Managers** | **Not Implemented** | *Needs Modal in Org Details* | `POST /api/organizations/:id/managers` | `User`, `UserRole` |
| **Global Search Across Tenants** | **Partially Implemented**| Client-side filter on top 5 | `GET /api/organizations?search=...` | `Organization`, `User` |
| **Audit Logs for Admin Actions** | **Not Implemented** | *Needs Audit Log Tab* | `GET /api/audit-logs` | `AuditLog` *(New)* |

---

## 3. Recommended Permission Hierarchy

```
[Level 0] SUPER_ADMIN (Platform Scope: Global / organization_id = null)
   │── Manage Organizations (Create, Update, Suspend, Archive)
   │── Manage Organization Managers (Provision secondary, Reset passwords, Deactivate)
   │── Platform Usage Analytics & Cross-Tenant Audit Logging
   │
   └── [Level 1] MANAGER / ORG_ADMIN (Tenant Scope: organization_id = Org_UUID)
         │── Provision & Manage Interns, Employees, Tech Leads
         │── Create & Manage Projects, Milestones, Sprints
         │── Broadcast Cohort Notifications & Issue Forms
         │
         ├── [Level 2] TECH_LEAD (Project Scope: ProjectMember)
         │     │── Sprint Planning, Backlog Prioritization, Task Assignment
         │     │── Track Member Progress & Review Work
         │     │
         │     └── [Level 3] INTERN / EMPLOYEE (Task & Session Scope)
         │           │── Work Session Check-in / Timesheet Tracking
         │           │── Update Assigned Work Items & Submit Forms
```

---

## 4. Phased Implementation Roadmap

### Phase 1: Manager Credential Recovery & Management (Priority 1)
*Goal: Prevent locked-out tenant managers and enable provisioning of co-managers.*

1. **Backend Endpoints:**
   - `POST /api/organizations/:id/managers/:managerId/reset-password`
     - Verifies target user belongs to `:id` and possesses the `MANAGER` role.
     - Generates a new temporary password and sets `must_change_password = true`.
     - Returns the temporary password in the response.
   - `POST /api/organizations/:id/managers`
     - Provisions an additional Manager account under an existing Organization ID.
2. **Frontend UI:**
   - Add a "Reset Password" button next to manager entries in `SuperAdminDashboardView.jsx` (Org Details drawer).
   - Display the temporary credentials modal upon successful reset.
   - Add an "Add Manager" button in the Organization Details modal.

---

### Phase 2: Organization Lifecycle & Suspension (Priority 2)
*Goal: Allow Superadmins to suspend access or rename organizations without data loss.*

1. **Database Schema Update:**
   - Add `is_active Boolean @default(true)` to model `Organization` in `schema.prisma`.
2. **Backend Authentication Enforcement:**
   - Update `AuthService.login` to verify `user.organization.is_active !== false` before granting access tokens to non-Superadmin users.
   - Add endpoints:
     - `PATCH /api/organizations/:id` (Rename organization).
     - `POST /api/organizations/:id/toggle-status` (Suspend or Reactivate organization).
3. **Frontend UI:**
   - Add status pill (`Active` / `Suspended`) to each organization card/row.
   - Add a confirmation modal to suspend or reactivate an organization.

---

### Phase 3: Platform Search & Scalable Pagination (Priority 3)
*Goal: Eliminate client-side filtering limitations and handle growing tenant counts.*

1. **Backend Endpoints:**
   - Add server-side search and pagination to `GET /api/organizations`:
     - Query parameters: `?page=1&limit=20&search=...&status=active`
   - Add `GET /api/organizations/:id/users` with pagination for large member rosters.
2. **Frontend UI:**
   - Connect the search input in `SuperAdminDashboardView.jsx` to debounced backend query parameters.
   - Add pagination controls to the organization table and member roster modal.

---

### Phase 4: Platform Audit Logging (Priority 4)
*Goal: Complete compliance tracking for sensitive administrative actions.*

1. **Database Schema:**
   - Create model `AuditLog`:
     ```prisma
     model AuditLog {
       id              String    @id @default(uuid())
       actor_id        String
       action          String    // e.g. "ORGANIZATION_CREATED", "MANAGER_PASSWORD_RESET"
       target_type     String    // e.g. "ORGANIZATION", "USER"
       target_id       String
       metadata        Json?
       ip_address      String?
       created_at      DateTime  @default(now())

       actor           User      @relation(fields: [actor_id], references: [id])
       @@index([actor_id])
       @@index([target_id])
       @@map("audit_logs")
     }
     ```
2. **Backend Interceptors:**
   - Log all successful Superadmin mutations to `audit_logs`.
   - Expose `GET /api/audit-logs` guarded by `requireRole(['SUPER_ADMIN'])`.
3. **Frontend UI:**
   - Add a second navigation tab in `SuperAdminApp.jsx`: `Audit Logs`.
   - Render a searchable table showing who performed administrative operations, against which tenant, and when.

---

## 5. Security & Isolation Guidelines

1. **Strict Root Isolation:** Superadmin accounts must always keep `organization_id = null` and should never be granted project-level or timesheet roles directly to maintain tenant boundaries.
2. **Single-Use Passwords:** All generated temporary passwords must continue using `must_change_password: true`, forcing immediate credential rotation upon first login.
3. **No Cascading Hard Deletes:** Deletion of organizations should default to soft-deactivation (`is_active = false`) to prevent accidental cascade deletion of historic project deliverables, timesheets, and form submissions.
