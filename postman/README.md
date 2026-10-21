# InternHub Platform — Complete API Test Suite (Postman)

This repository contains the complete, source-code-discovered API test suite for the **InternHub Project Management & Internship Operations Platform** (`project-management-version-2`).

The collection includes **149 total requests** spanning all **13 application modules**, complete with automated token extraction, dynamic variable chaining, response schema validations, positive happy-paths, negative error cases, and role-based access control (RBAC) tests.

---

## 📁 Files Included

1. `InternHub_API_Collection.json`: Postman Collection v2.1.0 formatted file ready for direct import into Postman.
2. `InternHub_Local.postman_environment.json`: Pre-configured environment file with local host variables, default test credentials, and empty dynamic variable placeholders.
3. `README.md`: This guide.

---

## 🏗️ Discovered Modules & Endpoints Overview

| # | Module Folder | Description | Endpoints Covered |
|---|---|---|---|
| **00** | **Health & System Diagnostics** | Server status, PostgreSQL pooler latency, and Redis fallback check | `GET /api/health` |
| **01** | **Authentication & Session Management** | Multi-tenant login, session cookies, JWT token rotation, current profile (`/me`), password change, logout, and 401/400 validation | `GET /api/auth/organizations`, `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/auth/me`, `POST /api/auth/change-password`, `POST /api/auth/logout` |
| **02** | **Super Admin & Organizations** | Platform overview KPIs, audit logs, tenant creation, manager CSV bulk validation, status toggling, and 403 RBAC checks | `GET /api/organizations/platform-overview`, `GET /api/organizations/audit-logs`, `GET /api/organizations`, `POST /api/organizations`, `GET/PATCH /api/organizations/:id`, `POST /api/organizations/:id/toggle-status`, `GET /api/organizations/:id/members`, `POST /api/organizations/:id/managers`, CSV import |
| **03** | **Users & Provisioning** | Single intern creation, CSV bulk user import, member updates, password resets, permissions introspection & updating, timesheet reports, and soft deactivation | `GET/POST /api/users`, `GET /api/users/bulk/template`, `POST /api/users/bulk/validate`, `POST /api/users/bulk`, `PATCH /api/users/:id`, `GET/PUT /api/users/:id/permissions`, `GET /api/users/:userId/timesheet/report`, `POST /api/users/:id/reset-password`, `POST /api/users/:id/deactivate` |
| **04** | **Cohorts** | Active internship cohorts directory | `GET /api/cohorts` |
| **05** | **Projects** | Portfolio health, tech leads overview, permissions registry, project CRUD, member assignments, role updates, custom project roles, and archive/delete | `GET /api/projects/health-overview`, `GET /api/projects/tech-leads`, `GET /api/projects/permissions/registry`, `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id`, `GET/POST /api/projects/:id/members`, `PATCH /api/projects/:id/members/roles`, `GET/POST /api/projects/:id/roles` |
| **06** | **Project Sprints** | Scrum sprint planning, single-active lifecycle start, complete with unfinished task rollover, reopen, and delete | `GET/POST /api/projects/:id/sprints`, `GET/PATCH/DELETE /api/projects/:id/sprints/:sprintId`, `POST /api/projects/:id/sprints/:sprintId/start`, `POST /api/projects/:id/sprints/:sprintId/complete`, `POST /api/projects/:id/sprints/:sprintId/reopen` |
| **07** | **Project Documents** | File attachments, architecture specs, inline preview streams, download attachments, metadata updates, and deletion | `GET/POST /api/projects/:id/documents`, `GET /api/projects/:id/documents/:documentId/preview`, `GET /api/projects/:id/documents/:documentId/download`, `PATCH/DELETE /api/projects/:id/documents/:documentId` |
| **08** | **Work Items (Tasks & Kanban)** | Jira-style Epic -> Story -> Task -> Subtask hierarchy, non-negative story point enforcement, Kanban summaries, analytics, assignee handling, comments, and due-date extension workflows | `GET/POST /api/work-items`, `GET /api/work-items/kanban-summary`, `GET /api/work-items/analytics`, `GET/PATCH/PUT/DELETE /api/work-items/:id`, `POST/DELETE /api/work-items/:id/assignees`, comments CRUD, extension request workflows |
| **09** | **Forms & Evaluations** | Dynamic form authoring, question management, publishing lifecycle, intern submissions, review, overdue summaries, and CSV report exports | `GET/POST /api/forms`, `GET /api/forms/overdue/summary`, `GET /api/forms/overdue/export`, `GET/PATCH/DELETE /api/forms/:id`, `POST /api/forms/:id/publish`, questions CRUD, submissions review |
| **10** | **Notifications** | Broadcast, direct, and system notifications, unread counts, mark read/all-read, and archive/unarchive | `GET/POST /api/notifications`, `GET /api/notifications/unread-count`, `PATCH /api/notifications/read-all`, `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/:id/archive`, `PATCH /api/notifications/:id/unarchive` |
| **11** | **Timesheets & Attendance** | Work policy (cutoff 6:15 PM IST), clock-in/out work sessions, manual entries, today/weekly/monthly grids, intern reports, manager review table, and time correction requests | `GET/PUT /api/timesheet/organization-policy`, `POST /api/timesheet/work-sessions/start`, `POST /api/timesheet/work-sessions/end`, `GET /api/timesheet/work-sessions/active`, time entries CRUD, reports, review table, corrections workflow |
| **12** | **Action Items** | Meeting minutes action items, priority tracking, assignment, status progression, and cleanup | `GET/POST /api/action-items`, `GET/PATCH/DELETE /api/action-items/:id` |

---

## 🚀 How to Import and Run in Postman

### Step 1: Import Files into Postman
1. Launch **Postman Desktop** or **Postman Web**.
2. Click the **Import** button in the upper left corner.
3. Select both files:
   - `postman/InternHub_API_Collection.json`
   - `postman/InternHub_Local.postman_environment.json`
4. Postman will create the collection and environment.

### Step 2: Select the Environment
In the top-right environment selector of Postman, choose:
**`InternHub Local Environment`**.

### Step 3: Verify the Backend is Running
Ensure the local backend server is up:
```bash
cd backend-node
npm run dev
```
The backend listens by default on `http://localhost:3001`.

### Step 4: Run the Collection Runner
1. Right-click on the collection **`InternHub Platform - Complete Comprehensive API Test Suite`** in the left sidebar.
2. Click **Run collection**.
3. Keep the default folder execution order (00 through 12).
4. Click **Run InternHub Platform...**.

---

## 🔄 Dynamic Variable Chaining Architecture

The test collection implements full end-to-end chaining without hardcoding IDs:

1. **Token Extraction:**
   - `POST /api/auth/login` extracts `accessToken`, `refreshToken`, and `sessionId` into collection variables.
   - All subsequent authenticated requests automatically inject `Authorization: Bearer {{accessToken}}` or appropriate role token.
2. **Resource ID Capture:**
   - Listing projects sets `{{projectId}}`.
   - Creating a temporary project sets `{{testProjectId}}`.
   - Listing sprints captures `{{sprintId}}`.
   - Creating an Epic captures `{{epicId}}`, which is then passed as `parent_id` to create a Story (`{{storyId}}`), which in turn creates a Task (`{{taskId}}`), which in turn creates a Subtask (`{{subtaskId}}`).
   - Creating comments, forms, questions, extension requests, notifications, and timesheet entries automatically populate `{{commentId}}`, `{{formId}}`, `{{questionId}}`, `{{extensionRequestId}}`, `{{notificationId}}`, and `{{timeEntryId}}`.
3. **Safe Teardown:**
   - Temporary resources created during the run (temporary projects, test sprints, test documents, test forms, test action items) are deleted in their respective teardown steps, ensuring zero database pollution.

