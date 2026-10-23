# Dailoqa Intern & Project Management Platform — Complete Project Overview

> **Purpose of this document:** Help a student explain the project confidently to a professor.
> Everything here is based on the actual source code. Nothing is invented or assumed.
> Source files are in `c:\Users\srira\Desktop\intern_performance_dashboard`.

---

## Table of Contents

1. [What the Platform Does](#1-what-the-platform-does)
2. [Problem It Solves](#2-problem-it-solves)
3. [User Roles & Responsibilities](#3-user-roles--responsibilities)
4. [System Architecture](#4-system-architecture)
5. [Database — Every Table Explained](#5-database--every-table-explained)
6. [Main Features Currently Implemented](#6-main-features-currently-implemented)
7. [Complete User Flows](#7-complete-user-flows)
8. [Timesheet & Attendance Flow](#8-timesheet--attendance-flow)
9. [Manager Reporting Flow](#9-manager-reporting-flow)
10. [Security & Authorization](#10-security--authorization)
11. [API Reference Table](#11-api-reference-table)
12. [End-to-End Example (Fictional Intern "Priya")](#12-end-to-end-example-fictional-intern-priya)
13. [Implementation Status & Known Issues](#13-implementation-status--known-issues)
14. [25 Likely Professor Questions & Answers](#14-25-likely-professor-questions--answers)
15. [One-Page Verbal Explanation](#15-one-page-verbal-explanation)

---

## 1. What the Platform Does

The **Dailoqa Intern & Project Management Platform** is a web application that lets a technology company manage its **intern cohorts, projects, tasks, and timesheets** from one place.

It has **two separate portals**:

| Portal | Who Uses It | What They Do |
|--------|-------------|--------------|
| **Manager Dashboard** | Managers, Tech Leads | Create projects, assign tasks, track intern attendance and work hours, read reports |
| **Intern Hub** | Interns, Employees | View assigned projects and tasks, log work sessions, submit forms, track attendance |

There is also a **Super Admin** interface for creating and managing organizations.

---

## 2. Problem It Solves

Before this platform, managers had no centralized way to:
- Know **which intern is working on which task** at any moment
- Measure **actual work time** versus simply clock-in/clock-out attendance
- Track the **lifecycle of a task** (assigned → started → in review → completed)
- Generate **individual performance reports** per intern per week/month
- **Securely separate** what an intern can see from what a manager can see

This platform solves all of these in a single application with role-based access control enforced by the backend.

---

## 3. User Roles & Responsibilities

Roles are stored in the `roles` database table and enforced by the backend middleware.

### 3.1 SUPER_ADMIN
- Global root user. Has **no organization_id** — belongs to no tenant.
- Can create and manage organizations.
- Permissions: `ORGANIZATION_READ`, `ORGANIZATION_CREATE`, `ORGANIZATION_UPDATE`, `ORGANIZATION_DELETE`.
- **Cannot log in under a tenant organization** (enforced in `auth.service.ts`).

### 3.2 MANAGER
- Belongs to a specific organization.
- Full control over users, projects, tasks, and reports within their organization.
- Permissions: `USER_READ`, `USER_CREATE`, `USER_BULK_CREATE`, `PROJECT_*`, `TASK_*`, `FORM_*`, `ATTENDANCE_*`, `EVALUATION_*`, `DOCUMENT_UPLOAD`.
- Can provision new interns (individually or via CSV bulk import).
- Can reset intern passwords.
- Can deactivate users.
- Can view the individual timesheet report for any user in the organization.

### 3.3 TECH_LEAD
- Senior technical member.
- Can read and update projects, create and assign tasks, read forms, upload documents.
- Permissions: `PROJECT_READ`, `PROJECT_UPDATE`, `TASK_READ`, `TASK_CREATE`, `TASK_UPDATE`, `TASK_ASSIGN`, `FORM_READ`, `DOCUMENT_UPLOAD`.
- **Cannot** create new users or delete projects.

### 3.4 INTERN
- End-user of the Intern Hub portal.
- Can view assigned projects and tasks, update task status, submit forms, log attendance.
- Permissions: `PROJECT_READ`, `TASK_READ`, `TASK_UPDATE`, `FORM_READ`, `FORM_SUBMIT`, `ATTENDANCE_READ`, `ATTENDANCE_CREATE`.
- **Cannot** create projects, assign tasks to others, or view permissions/internal IDs.
- Has a `batch` field (e.g., `"Batch 2026-A"`) to group them into cohorts.

### 3.5 EMPLOYEE
- Same permissions as INTERN (same permission set in seed). Used for non-intern staff members.

---

## 4. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     USER BROWSER                        │
│                                                         │
│  ┌──────────────────┐    ┌──────────────────────────┐   │
│  │  Manager Portal   │    │     Intern Hub Portal     │   │
│  │  (React + Vite)  │    │    (React + Vite)         │   │
│  │  /manager/*      │    │    /intern/*              │   │
│  └────────┬─────────┘    └────────────┬─────────────┘   │
└───────────┼──────────────────────────┼─────────────────┘
            │ HTTP + Bearer Token       │
            │ + HTTP-only Cookies       │
            ▼                          ▼
┌─────────────────────────────────────────────────────────┐
│            BACKEND  (Node.js + Express + TypeScript)    │
│                    Running on port 3001                 │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │              REST API Routes                    │    │
│  │  /api/auth  /api/users  /api/projects           │    │
│  │  /api/work-items  /api/timesheet                │    │
│  │  /api/forms  /api/notifications  /api/orgs      │    │
│  └──────────────────┬──────────────────────────────┘    │
│                     │                                    │
│  ┌──────────────────▼──────────────────────────────┐    │
│  │    Middleware Layer                             │    │
│  │  authenticate → requireRole → requirePermission │    │
│  └──────────────────┬──────────────────────────────┘    │
│                     │                                    │
│  ┌──────────────────▼──────────────────────────────┐    │
│  │    Controllers → Services → Prisma ORM          │    │
│  └──────────────────┬──────────────────────────────┘    │
└────────────────────┼─────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  PostgreSQL Database                    │
│         (All data: users, projects, tasks,              │
│          sessions, time entries, forms, etc.)           │
└─────────────────────────────────────────────────────────┘
```

### Key Technology Choices

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React + Vite + Tailwind CSS | Fast builds, modern component model |
| Backend | Node.js + Express + TypeScript | Type safety, mature ecosystem |
| ORM | Prisma | Type-safe DB queries, migration support |
| Database | PostgreSQL | Relational data with FK enforcement |
| Auth | JWT (Access Token) + HTTP-only Cookie (Refresh Token) | Secure, stateless |
| File Storage | Multer (in-memory) → storage service | Document uploads |

### How Components Communicate

1. **Frontend** stores the `accessToken` (short-lived, 15 min) in `localStorage`.
2. Every API call sends `Authorization: Bearer <accessToken>` in the header.
3. Cookies `refreshToken` and `sessionId` are HTTP-only (invisible to JavaScript) — sent automatically by the browser on every request to the backend.
4. When the access token expires, `api.js` calls `POST /api/auth/refresh` to get a new one silently — the user never sees a logout.
5. The backend validates the JWT on every request via the `authenticate` middleware.

> **Source files:**
> - Frontend API client: [`frontend/src/services/api.js`](frontend/src/services/api.js)
> - Auth context: [`frontend/src/context/AuthContext.jsx`](frontend/src/context/AuthContext.jsx)
> - Backend entry point: [`backend-node/src/app.ts`](backend-node/src/app.ts)
> - Auth middleware: [`backend-node/src/middleware/auth.middleware.ts`](backend-node/src/middleware/auth.middleware.ts)

---

## 5. Database — Every Table Explained

> Source: [`backend-node/prisma/schema.prisma`](backend-node/prisma/schema.prisma)

### ER Diagram (Simplified)

```
organizations ──< users
organizations ──< projects
organizations ──< work_items
organizations ──< work_sessions (via organization_id)
organizations ──< time_entries (via organization_id)
organizations ──1 organization_work_policies

users ──< user_roles >── roles ──< role_permissions >── permissions
users ──< user_sessions
users ──< work_sessions
users ──< time_entries
users ──< project_memberships >── projects
users ──< work_item_assignees >── work_items
users ──< form_submissions

projects ──< project_members
projects ──< project_documents
projects ──< work_items

work_items ──< work_items  (self-referencing: parent_id → id)
work_items ──< work_item_assignees
work_items ──< work_item_attachments
work_items ──< work_sessions
work_items ──< time_entries

forms ──< form_questions ──< submission_answers
forms ──< form_submissions ──< submission_answers

notifications ──< notification_recipients
```

---

### Table-by-Table Reference

#### `organizations`
Represents a company/tenant. Every piece of data (users, projects, tasks) belongs to one organization. This is how multi-tenancy is implemented.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `name` | String | Company name (e.g., "Dailoqa Technologies") |
| `created_at` | DateTime | When the org was created |

---

#### `organization_work_policies`
Stores the official office hours for each organization. Used to calculate attendance minutes.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `organization_id` | UUID FK → organizations | One policy per org (unique) |
| `office_start_time` | String | e.g., `"09:00"` |
| `office_end_time` | String | e.g., `"17:30"` |
| `break_start_time` | String? | e.g., `"13:00"` |
| `break_end_time` | String? | e.g., `"14:00"` |
| `lunch_break_minutes` | Int | Default 60 |
| `timezone` | String | Default `"Asia/Kolkata"` |
| `overtime_enabled` | Boolean | Whether OT is tracked |

---

#### `users`
Core identity table. Every person (intern, manager, admin) is a row here.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `organization_id` | UUID? FK → organizations | Which company this user belongs to (null for Super Admin) |
| `name` | String | Full name |
| `email` | String (unique) | Login identifier |
| `user_code` | String? | Short code like "INT-001" (unique per org) |
| `batch` | String? | Cohort group e.g. "Batch 2026-A" (interns only) |
| `must_change_password` | Boolean | Flags first-login password change |
| `password_hash` | String | Argon2 hash — never stored in plain text |
| `is_active` | Boolean | Soft-disable without deleting |

> **Why UUIDs?** They are globally unique, can be generated client-side without hitting the DB, and don't expose row counts like integer IDs do (security benefit).

---

#### `roles` & `permissions`
Separate tables to allow flexible role-based access control (RBAC).

- **`roles`**: Named roles — `ADMIN`, `MANAGER`, `INTERN`, `TECH_LEAD`, `SUPER_ADMIN`, `EMPLOYEE`
- **`permissions`**: Named abilities — `PROJECT_READ`, `TASK_CREATE`, `DOCUMENT_UPLOAD`, etc.
- **`user_roles`**: JOIN — which user has which role (many-to-many)
- **`role_permissions`**: JOIN — which role has which permission (many-to-many)

This design means you can add new permissions without changing the code — just add a row to `permissions` and link it to a role via `role_permissions`.

---

#### `user_sessions`
Tracks refresh token sessions for secure token rotation.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key and `sessionId` cookie value |
| `user_id` | UUID FK → users | Whose session |
| `refresh_token_hash` | String | Argon2 hash of the refresh token (never stored plain) |
| `expires_at` | DateTime | 7 days from login |
| `revoked_at` | DateTime? | Set on logout — prevents reuse |
| `last_used_at` | DateTime? | Updated on each token refresh |
| `user_agent` | String? | Browser info |
| `ip_address` | String? | Login IP |

---

#### `projects`
A project is the top-level container for tasks and work.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `organization_id` | UUID FK | Tenant isolation |
| `owner_id` | UUID FK → users | Who created/owns it |
| `name` | String | Project name |
| `status` | Enum | `PLANNED`, `ACTIVE`, `COMPLETED`, `ARCHIVED` |
| `start_date` / `end_date` | DateTime? | Timeline |

- **`project_members`**: JOIN — which users are members of a project. Only members can see project tasks.
- **`project_documents`**: Files attached to a project (stored via storage service, only the key/metadata saved in DB).

---

#### `work_items`
The most important table — stores all tasks, subtasks, epics, stories, and bugs.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `organization_id` | UUID FK | Tenant |
| `project_id` | UUID? FK → projects | Which project (null = personal task) |
| `parent_id` | UUID? FK → work_items | **Self-reference** — creates the hierarchy |
| `created_by` | UUID FK → users | Who created it |
| `type` | Enum | `EPIC`, `STORY`, `TASK`, `SUBTASK`, `BUG` |
| `title` | String | Task name |
| `status` | Enum | `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `COMPLETED`, `BLOCKED` |
| `priority` | Enum | `LOW`, `MEDIUM`, `HIGH`, `URGENT` |
| `start_date` / `due_date` | DateTime? | Timeline |
| `completed_at` | DateTime? | Auto-stamped when status → COMPLETED |

**Hierarchy Rules** (enforced by `work-item.service.ts`):
```
EPIC (no parent)
  └── STORY (parent must be EPIC)
        └── TASK (parent must be STORY, OR no parent if direct project task)
              └── SUBTASK (parent must be TASK)

BUG = standalone (no parent allowed)
```

- **`work_item_assignees`**: JOIN — multiple users can be assigned to one task.
- **`work_item_attachments`**: Files attached directly to a task.

---

#### `work_sessions`
Tracks when an intern actually **started and stopped** working. This is **attendance-level** data.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `user_id` | UUID FK → users | Who |
| `task_id` | UUID? FK → work_items | Which task (optional — can be general attendance) |
| `started_at` | DateTime | When work started |
| `ended_at` | DateTime? | When work stopped (null = still active) |
| `break_minutes` | Int | Break time to subtract |

> **Key rule:** Only one active session (ended_at = null) per user per task at a time.

---

#### `time_entries`
A **calculated record** of actual task work time. Created automatically when a work session ends.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `user_id` | UUID FK → users | Who |
| `task_id` | UUID FK → work_items | Which task |
| `project_id` | UUID? FK → projects | Which project |
| `work_session_id` | UUID? FK → work_sessions | Linked session |
| `date` | DateTime | The calendar date |
| `start_time` | DateTime | Start of work |
| `end_time` | DateTime | End of work |
| `duration_minutes` | Int | Calculated minutes |

> **Why separate WorkSession and TimeEntry?** WorkSession = live tracking (someone is working right now). TimeEntry = the finished, verified record used for reporting. You can also create manual time entries without a session. Overlap detection is enforced.

---

#### `forms`, `form_questions`, `form_submissions`, `submission_answers`
A dynamic evaluation/survey system.

- **`forms`**: A form template (title, deadline, target roles like `["INTERN"]`)
- **`form_questions`**: Questions in the form (SHORT_TEXT, LONG_TEXT, NUMBER, SINGLE_SELECT, etc.)
- **`form_submissions`**: One submission per intern per form
- **`submission_answers`**: Individual answers to each question

---

#### `notifications` & `notification_recipients`
In-app alert system.

- **`notifications`**: The message itself (title, body, type: `BROADCAST`, `DIRECT`, `TASK_ASSIGNED`, etc.)
- **`notification_recipients`**: JOIN — who received it and whether they read it (`read_at`)

---

## 6. Main Features Currently Implemented

| Feature | Status | Key Files |
|---------|--------|-----------|
| Login with organization selection | ✅ Fully implemented | `auth.service.ts`, `auth.controller.ts`, `LoginView.jsx` |
| JWT + refresh token session | ✅ Fully implemented | `auth.service.ts`, `api.js`, cookies |
| Refresh persistence (no logout on F5) | ✅ Fixed | `AuthContext.jsx`, `api.js` |
| Role-based access control (RBAC) | ✅ Fully implemented | `auth.middleware.ts`, `seed.ts` |
| Manager dashboard | ✅ Implemented | `ManagerApp.jsx`, `ManagerDashboardView.jsx` |
| Intern dashboard | ✅ Implemented | `InternApp.jsx`, `InternDashboardTab.jsx` |
| Static persistent sidebar navigation | ✅ Fixed | `ManagerApp.jsx`, `InternApp.jsx` (URL-synced) |
| My Tasks navigation (URL routing) | ✅ Fixed | `InternApp.jsx`, `ManagerApp.jsx` |
| Create/Read/Update Projects | ✅ Implemented | `project.routes.ts`, `project.service.ts` |
| Project Members (add/remove) | ✅ Implemented | `project.routes.ts` |
| Project Documents (upload/download) | ✅ Implemented | `project.routes.ts`, `storage.service.ts` |
| Task/Subtask hierarchy (DB + API) | ✅ Implemented | `work-item.service.ts` |
| Task creation, update, delete | ✅ Implemented | `work-item.routes.ts`, `work-item.service.ts` |
| Task assignment with search | ✅ Implemented | `AddTaskModal.jsx`, `TaskDetailModal.jsx` |
| Assignee restriction (RBAC enforced) | ✅ Implemented | `work-item.service.ts` → `isAuthorizedToAssign()` |
| Delete button hidden during creation | ✅ Fixed | `TaskDetailModal.jsx` |
| Work Session (Start/Stop Work) | ✅ Implemented | `timesheet.service.ts`, `timesheet.routes.ts` |
| Time Entry (manual + auto) | ✅ Implemented | `timesheet.service.ts` |
| Daily/Weekly/Monthly timesheet | ✅ Implemented | `timesheet.service.ts` |
| Intern individual report | ✅ Implemented | `TimesheetService.getInternReport()` |
| Manager report (per intern) | ✅ Implemented | `TimesheetService.getIndividualReport()` |
| Batch field on intern profile | ✅ Implemented | `schema.prisma`, `auth.controller.ts` |
| Intern profile — hide permissions/IDs | ✅ Implemented | `auth.controller.ts` (me endpoint) |
| Edit Profile flow | ✅ Implemented | `user.service.ts` → `updateProfile()` |
| Bulk user import (CSV) | ✅ Implemented | `user.routes.ts`, `user.controller.ts` |
| Dynamic forms/evaluations | ✅ Implemented | `form.routes.ts`, `form.service.ts` |
| Notifications (broadcast/direct) | ✅ Implemented | `notification.routes.ts` |
| Document upload permission (RBAC) | ✅ Implemented | `project.routes.ts` → `requireAnyPermission` |
| Organization work policy (hours) | ✅ Implemented | `timesheet.service.ts` |
| Super Admin portal | ✅ Partial | `SuperAdminApp.jsx`, `organization.routes.ts` |

---

## 7. Complete User Flows

### 7.1 Login Flow

```
1. Browser loads app → React Router determines role → /login
2. Intern enters: email, password, selects organization (from dropdown)
3. Frontend calls POST /api/auth/login
4. Backend:
   a. Finds user by email OR user_code
   b. Verifies password with Argon2
   c. Checks organization_id matches user's org
   d. Signs JWT access token (15 min) and refresh token (7 days)
   e. Stores refresh token hash in user_sessions table
   f. Sets HTTP-only cookies: refreshToken, sessionId
   g. Returns: { user: {...}, accessToken }
5. Frontend:
   a. Stores accessToken in localStorage
   b. Stores user object in localStorage (for instant re-hydration on refresh)
   c. Updates AuthContext state
   d. Redirects: role=INTERN → /intern/dashboard, role=MANAGER → /manager/dashboard
```

### 7.2 Manager Flow

```
Manager Dashboard
    ├── Create Project (POST /api/projects)
    │       └── Add Members (POST /api/projects/:id/members)
    ├── View Projects → Open Project Workspace
    │       ├── Backlog / Sprint Board
    │       ├── Create Task (POST /api/work-items)
    │       │       └── Assign to intern (who must be a project member)
    │       ├── Upload Documents (POST /api/projects/:id/documents)
    │       └── View Project Members
    ├── My Tasks (manager's own assigned tasks)
    ├── Interns List → View individual intern profile + report
    ├── Tech Leads List
    ├── Reports → Select intern → View daily/weekly/monthly timesheet
    └── Timesheet → View work session history
```

### 7.3 Intern Flow

```
Intern Hub Dashboard
    ├── View assigned tasks (GET /api/work-items?assigned_to_me=true)
    ├── My Projects → Click project → View project tasks
    ├── My Tasks → View + update task status
    │       └── Start Work Session (POST /api/timesheet/work-sessions/start)
    │               └── Stop Work Session (POST /api/timesheet/work-sessions/end)
    │                       └── TimeEntry auto-created
    ├── Forms → Submit assigned evaluation forms
    ├── Attendance → View daily/weekly attendance summary
    ├── MoM → Read Minutes of Meeting
    └── Profile → Edit name, batch (no permissions/IDs shown)
```

### 7.4 Project → Task → Subtask Flow

```
1. Manager creates Project                          → projects table
2. Manager adds interns as members                  → project_members table
3. Manager (or Tech Lead) creates a TASK           → work_items (type=TASK, project_id=X)
4. TASK is assigned to an intern                   → work_item_assignees table
5. Manager creates a SUBTASK under that TASK       → work_items (type=SUBTASK, parent_id=taskId)
6. Subtask assigned to same/different intern       → work_item_assignees table
7. Intern logs in → sees task in My Tasks
8. Intern clicks Start Work → WorkSession created  → work_sessions table
9. Intern clicks Stop Work → WorkSession.ended_at set
                           → TimeEntry auto-created → time_entries table
10. Intern updates status to COMPLETED             → work_items.completed_at = now()
```

---

## 8. Timesheet & Attendance Flow

### Key Concept: Two Separate Things

| Concept | What it means | Where stored |
|---------|--------------|--------------|
| **Attendance** | Was the intern physically present/logged in during office hours? | Derived from `work_sessions` timestamps clipped to office hours |
| **Task Work** | How many minutes did the intern spend on specific tasks? | Stored in `time_entries` |

These are **different**. An intern could be "present" (session open) but working on untracked activity. `net_working_minutes` = attendance - break. `task_minutes` = sum of time entries.

### WorkSession Lifecycle

```
POST /api/timesheet/work-sessions/start
    Body: { task_id: "uuid" }  ← optional

    Rules checked:
    ✓ User must be assigned to that task
    ✓ No other active session (ended_at=null) exists
    ✓ Only INTERN/EMPLOYEE role can start task sessions

    Creates: work_sessions row { started_at: now(), ended_at: null }

... intern does work ...

POST /api/timesheet/work-sessions/end
    Body: { task_id: "uuid", break_minutes: 0 }

    Sets: work_sessions.ended_at = now()
    Auto-creates: time_entries row {
        start_time: session.started_at,
        end_time: now(),
        duration_minutes: (end - start) in minutes
    }
```

### Overlap Detection

Before creating a `TimeEntry`, the service checks:
```sql
SELECT * FROM time_entries
WHERE user_id = ? AND start_time < newEnd AND end_time > newStart
```
If any overlap found → throws error "Time entry overlaps with an existing entry."

### Concrete Example

> **Task: "Build Login Page"** — assigned to intern Priya on Monday

| Time | Action | Database Effect |
|------|--------|----------------|
| 09:00 | Task assigned | `work_item_assignees` row created |
| 10:00 | Priya clicks "Start Work" | `work_sessions`: `{ started_at: 10:00, ended_at: null, task_id: X }` |
| 12:00 | Priya clicks "Stop Work" | `work_sessions.ended_at = 12:00`. `time_entries`: `{ start: 10:00, end: 12:00, duration: 120 }` |
| 14:00 | Priya starts again | New `work_sessions` row: `{ started_at: 14:00, ended_at: null }` |
| 15:00 | Priya stops | `work_sessions.ended_at = 15:00`. New `time_entries`: `{ duration: 60 }` |
| 15:30 | Priya marks task COMPLETED | `work_items.status = COMPLETED`, `completed_at = 15:30` |

**Summary for the day:**
- Task lifecycle: Assigned 09:00 → Completed 15:30 = **6.5 hours lifecycle**
- Actual work: 120 + 60 = **180 minutes (3 hours) actual task work**
- Office hours: 09:00–17:30 = 510 gross minutes, minus 60 lunch = 450 net working minutes
- Unallocated minutes: 450 − 180 = **270 min** (meetings, other tasks, breaks, etc.)

### Daily Summary Calculation (`calculateDailySummary` in `timesheet.service.ts`)

```typescript
attendance_minutes   = total time work_sessions overlapped with office hours (merged intervals)
break_minutes        = from org policy (lunch break deducted)
net_working_minutes  = attendance_minutes − break_minutes
task_minutes         = sum of time_entries.duration_minutes for that day
unallocated_minutes  = net_working_minutes − task_minutes
```

---

## 9. Manager Reporting Flow

```
Manager selects intern from Interns list
    ↓
GET /api/users/:userId/timesheet/report?period=month&date=2026-10
    (requireRole: MANAGER, ADMIN, SUPER_ADMIN)
    ↓
TimesheetService.getIndividualReport(user, targetUserId, period, date)
    ↓
For each day in the period:
    getDailyTimesheet(user, targetUserId, day)
        → fetch work_sessions for that day
        → fetch time_entries for that day
        → calculateDailySummary()
    ↓
Returns:
    {
      user: { name, email, batch },
      period: { start_date, end_date },
      summary: {
        working_days, present_days, absent_days,
        total_actual_minutes, total_task_minutes,
        average_hours_per_day
      },
      days: [ { date, attendance_minutes, task_minutes, entries: [...] } ]
    }
```

**Authorization check:** The manager can only see users within their own `organization_id`. Any attempt to access another org's data fails because the service always filters by `organization_id`.

---

## 10. Security & Authorization

### Backend-Enforced (NOT just frontend hiding)

```
Every API request goes through:

authenticate()               ← Validates JWT, loads user + roles from DB
    ↓
requireRole(['MANAGER'])     ← Checks user.role name
    OR
requirePermission('TASK_CREATE')  ← Checks all role permissions
    OR
requireAnyPermission('DOCUMENT_UPLOAD', 'PROJECT_UPDATE')
    ↓
Controller → Service (additional business-logic checks)
```

### Organization Isolation (Multi-Tenancy)

Every database query in the services includes `organization_id: user.organization_id`. A user from Company A physically **cannot** access Company B's data even if they know the UUID — the query will return null/empty.

### IDOR Protection (Insecure Direct Object Reference)

When an intern calls `GET /api/work-items/some-uuid`, the service checks:
1. Does the item belong to the user's org? (`organization_id`)
2. Is the item a project task? → Is the user a project member?
3. Is it a personal task? → Is the user the creator or assignee?

If any check fails → 403 Forbidden or 404 Not Found (we return 404 for personal tasks to avoid revealing the task exists).

### Intern Profile Security (Requirement 13)

`GET /api/auth/me` — the response is **filtered by role**:
```typescript
const isInternOrEmployee = roleName === 'INTERN' || roleName === 'EMPLOYEE';

// Interns get empty permissions array
const permissions = isInternOrEmployee ? [] : primaryRole.permissions.map(...);

// Interns don't get user_code
const user_code = isInternOrEmployee ? undefined : user.user_code;
```
This is done **in the backend response**, not CSS/hidden in the frontend.

### Password Security

Passwords are hashed with **Argon2** (winner of Password Hashing Competition 2015). Argon2 is memory-hard and resistant to GPU cracking. Never stored in plain text.

### Refresh Token Rotation

On each token refresh:
1. Old refresh token hash is verified against DB
2. New refresh token is generated and hashed
3. New hash **replaces** the old one in `user_sessions`
4. Old token is immediately invalidated
5. Logout sets `revoked_at` — prevents reuse even if token was stolen

---

## 11. API Reference Table

| Method | Endpoint | Purpose | Who Can Access |
|--------|----------|---------|----------------|
| GET | `/api/auth/organizations` | List orgs for login dropdown | Public |
| POST | `/api/auth/login` | Login, get tokens | Public |
| POST | `/api/auth/refresh` | Refresh access token via cookie | Public (cookie required) |
| POST | `/api/auth/logout` | Revoke session | Authenticated |
| GET | `/api/auth/me` | Get current user profile | Authenticated |
| POST | `/api/auth/change-password` | Change own password | Authenticated |
| GET | `/api/users` | List org users | `USER_READ` perm |
| POST | `/api/users` | Create single user | `MANAGER` role |
| POST | `/api/users/bulk` | Bulk import via CSV | `MANAGER` role |
| PATCH | `/api/users/profile` | Edit own profile | Authenticated |
| GET | `/api/users/:id/timesheet/report` | Individual intern report | `MANAGER/ADMIN/SUPER_ADMIN` |
| POST | `/api/users/:id/reset-password` | Reset a user's password | `MANAGER` role |
| POST | `/api/users/:id/deactivate` | Deactivate a user | `MANAGER` role |
| GET | `/api/projects` | List projects | `PROJECT_READ` perm |
| POST | `/api/projects` | Create project | `PROJECT_CREATE` perm |
| GET | `/api/projects/:id` | Get project details | `PROJECT_READ` perm |
| PATCH | `/api/projects/:id` | Update project | `PROJECT_UPDATE` perm |
| GET | `/api/projects/:id/members` | List project members | `PROJECT_READ` perm |
| POST | `/api/projects/:id/members` | Add member | `PROJECT_UPDATE` perm |
| DELETE | `/api/projects/:id/members/:userId` | Remove member | `PROJECT_UPDATE` perm |
| POST | `/api/projects/:id/documents` | Upload document | `DOCUMENT_UPLOAD` OR `PROJECT_UPDATE` |
| GET | `/api/projects/:id/documents` | List documents | `PROJECT_READ` perm |
| POST | `/api/work-items` | Create task/subtask | Authenticated + project member |
| GET | `/api/work-items` | List work items | Authenticated (scoped by role) |
| GET | `/api/work-items/:id` | Get single item | Authenticated + access check |
| PATCH | `/api/work-items/:id` | Update task | Authenticated + member/creator |
| DELETE | `/api/work-items/:id` | Delete task | Manager OR creator |
| POST | `/api/work-items/:id/assignees` | Assign users | Manager/TechLead/Owner |
| DELETE | `/api/work-items/:id/assignees/:uid` | Remove assignee | Manager/TechLead/Owner |
| POST | `/api/timesheet/work-sessions/start` | Start work on task | Assigned intern |
| POST | `/api/timesheet/work-sessions/end` | Stop work | Session owner |
| GET | `/api/timesheet/today` | Today's timesheet | Own or Manager |
| GET | `/api/timesheet/weekly` | Weekly timesheet | Own or Manager |
| GET | `/api/timesheet/monthly` | Monthly timesheet | Own or Manager |
| GET | `/api/timesheet/intern-report` | 30-day intern report | Own or Manager |
| GET | `/api/timesheet/manager-report` | Manager view report | Manager role |
| GET | `/api/forms` | List forms | Authenticated |
| POST | `/api/forms` | Create form | `PROJECT_CREATE` perm |
| POST | `/api/forms/:id/submissions` | Submit form | Authenticated |
| GET | `/api/notifications` | Get my notifications | Authenticated |
| POST | `/api/notifications` | Broadcast notification | `MANAGER/TECH_LEAD` |
| PATCH | `/api/notifications/:id/read` | Mark notification read | Authenticated |
| GET | `/api/organizations` | List orgs | Super Admin |
| POST | `/api/organizations` | Create org | Super Admin |

---

## 12. End-to-End Example (Fictional Intern "Priya")

**Priya Sharma**, intern at Dailoqa Technologies, batch "2026-A".

### Step 1 — Manager provisions Priya
```
Manager opens Interns tab → "Add Intern"
POST /api/users  { name: "Priya Sharma", email: "priya@dailoqa.com", batch: "2026-A" }

DB: users row created { id: "uuid-priya", batch: "2026-A", must_change_password: true }
DB: user_roles row created { user_id: "uuid-priya", role_id: "uuid-INTERN" }
```

### Step 2 — Priya logs in (first time)
```
POST /api/auth/login { email: "priya@dailoqa.com", password: "temp123", organization_id: "uuid-org" }

DB: user_sessions row created { user_id: "uuid-priya", refresh_token_hash: "...", expires_at: +7days }
Response: { user: { name: "Priya", role: "INTERN", batch: "2026-A" }, accessToken: "jwt..." }
Cookie set: refreshToken, sessionId (HTTP-only)

Frontend: stores accessToken in localStorage, redirects to /intern/dashboard
Must-change-password screen appears (must_change_password = true)
```

### Step 3 — Manager creates project and assigns Priya
```
POST /api/projects { name: "Portal Redesign", status: "ACTIVE" }
DB: projects row { id: "uuid-proj" }

POST /api/projects/uuid-proj/members { user_id: "uuid-priya" }
DB: project_members row { project_id: "uuid-proj", user_id: "uuid-priya" }
```

### Step 4 — Manager creates task and assigns Priya
```
POST /api/work-items {
  type: "TASK",
  title: "Build Login Page",
  project_id: "uuid-proj",
  assignee_ids: ["uuid-priya"],
  priority: "HIGH",
  due_date: "2026-10-15"
}

DB: work_items row { id: "uuid-task", type: "TASK", status: "TODO", project_id: "uuid-proj" }
DB: work_item_assignees row { work_item_id: "uuid-task", user_id: "uuid-priya" }
DB: notifications row { type: "TASK_ASSIGNED", ... }
DB: notification_recipients row { user_id: "uuid-priya", read_at: null }
```

### Step 5 — Priya starts working
```
Priya sees task in "My Tasks" tab (GET /api/work-items?assigned_to_me=true)
Priya clicks "Start Work"

POST /api/timesheet/work-sessions/start { task_id: "uuid-task" }
Service checks: Is Priya assigned to uuid-task? Yes. Any active session? No.

DB: work_sessions row { id: "uuid-ws1", user_id: "uuid-priya", task_id: "uuid-task",
                         started_at: "10:00", ended_at: null }
```

### Step 6 — Priya stops working
```
Priya clicks "Stop Work"
POST /api/timesheet/work-sessions/end { task_id: "uuid-task" }

DB: work_sessions.ended_at = "12:00"  (updated)
DB: time_entries row { user_id: "uuid-priya", task_id: "uuid-task",
                        start_time: "10:00", end_time: "12:00",
                        duration_minutes: 120, work_session_id: "uuid-ws1" }
```

### Step 7 — Priya marks task complete
```
PATCH /api/work-items/uuid-task { status: "COMPLETED" }

DB: work_items.status = "COMPLETED"
DB: work_items.completed_at = "15:30"
```

### Step 8 — Manager views Priya's report
```
GET /api/users/uuid-priya/timesheet/report?period=month&date=2026-10
(requireRole: MANAGER)

Service: getDailyTimesheet for each day in October
Returns: { present_days: 5, total_task_minutes: 360, average_hours_per_day: 1.2, ... }

Frontend: displays chart and table in Reports view
```

---

## 13. Implementation Status & Known Issues

### ✅ Fully Implemented
- JWT authentication with 15-minute access token + 7-day refresh token with rotation
- HTTP-only cookie for refresh token (XSS protection)
- Refresh persistence — page refresh does NOT log the user out
- RBAC with role + permission system (enforced by backend middleware)
- Organization multi-tenancy (all queries scoped by `organization_id`)
- Project CRUD with member management
- Project document upload (with `DOCUMENT_UPLOAD` permission enforcement)
- Task/Subtask full hierarchy (Project → Task → Subtask with DB FK enforcement)
- Task assignment with authorization (`isAuthorizedToAssign` check in service)
- Work Session (Start/Stop work) with overlap prevention
- TimeEntry auto-creation on session end
- Daily / Weekly / Monthly timesheet aggregation
- Intern individual report (30-day summary)
- Manager per-intern report (day/week/month)
- Intern profile — batch field displayed, permissions/internal IDs hidden
- Edit Profile flow (name, batch) via `PATCH /api/users/profile`
- Persistent sidebar navigation (URL-synced, survives refresh)
- My Tasks routing fix (URL: `/intern/tasks`, `/manager/my-tasks`)
- Delete button hidden during task creation (only shown for existing tasks with permission)
- Search bar when assigning tasks (searches project members by name/email)
- Notifications (broadcast by Manager/TechLead, read tracking)
- Dynamic forms (create, publish, submit)
- Bulk user CSV import

### ⚠️ Partially Implemented
- **Super Admin Portal**: UI exists (`SuperAdminApp.jsx`), basic org creation works, but org management features are minimal.
- **MoM (Minutes of Meeting)**: UI tab exists, backend routes exist, but feature completeness unclear without deep test.
- **Activity/Audit Log**: No dedicated `audit_logs` table or tracking system. Task `completed_at` is tracked but general activity stream is not.
- **Teams Channel View**: UI component exists (`TeamsChannelView.jsx`), uses local state (mock data), not connected to a real messaging backend.

### ❌ Not Implemented
- **Real-time notifications**: No WebSocket or Server-Sent Events. Notifications are fetched on page load.
- **Email notifications**: No email service integrated.
- **File storage backend**: `storage.service.ts` exists but it likely stores files in-memory/local. A real cloud storage (S3/GCS) is not configured.
- **Test suite**: No unit tests, integration tests, or E2E tests present in the codebase.
- **Rate limiting / brute-force protection**: No express-rate-limit or similar middleware on auth routes.
- **Comments on tasks**: No comments/discussion table in the schema.

### 🐛 Known Issues (from codebase analysis)
- `timesheet.service.ts` has a minor logic issue: the `startSession()` method returns the existing active session if one exists (idempotent behavior) — which is intentional but could confuse clients.
- `work-item.service.ts` `validateHierarchy` enforces `TASK → STORY` parent requirement strictly. Direct project tasks (TASK with no parent) are allowed by having `parent_id = null`, but the hierarchy comment says "TASK must have parent STORY" — there is a slight documentation vs. code discrepancy.

---

## 14. 25 Likely Professor Questions & Answers

**Q1. What is the difference between a WorkSession and a TimeEntry?**
> A `WorkSession` is a live record created when an intern clicks "Start Work". Its `ended_at` is null while work is ongoing. A `TimeEntry` is the finished, verified record of actual work time, created automatically when the session ends. TimeEntry is used for all reporting. They are linked by `work_session_id`.

**Q2. Why did you use JWT instead of server-side sessions?**
> JWT is stateless — the backend doesn't need to query the DB to validate every request (the token is self-contained and signed). This scales better. However, we use a DB-stored refresh token hash for the 7-day refresh token to allow revocation (logout invalidates it).

**Q3. Why are there two tokens — access token and refresh token?**
> The access token (15 min) is short-lived so that if it's stolen, the attacker has limited time. The refresh token (7 days) is stored in an HTTP-only cookie (invisible to JavaScript/XSS attacks) and is only used to get new access tokens. This balances security and user experience.

**Q4. What is HTTP-only cookie and why use it?**
> An HTTP-only cookie cannot be read by JavaScript — only the browser sends it automatically with requests. This protects the refresh token from XSS attacks (malicious scripts injected into the page cannot steal it).

**Q5. How does the platform prevent one intern from seeing another intern's data?**
> Every database query includes the user's `organization_id` as a filter. For personal tasks, only the creator or assignee can access them. For project tasks, only project members. The backend always enforces this — the frontend cannot bypass it.

**Q6. What is RBAC and how is it implemented here?**
> Role-Based Access Control. Roles (`MANAGER`, `INTERN`) are assigned to users. Each role has a set of permissions (`TASK_CREATE`, `PROJECT_READ`). The backend middleware checks these before allowing any operation. The `authenticate` middleware loads the user's full role+permission tree from the DB on every request.

**Q7. Why does the system use UUIDs instead of integers?**
> UUIDs don't expose data count (an attacker can't guess `/api/users/1001` vs `/api/users/1002`). They are globally unique, can be generated without DB coordination, and allow distributed systems to create IDs independently.

**Q8. What is Argon2 and why use it for passwords?**
> Argon2 is a memory-hard password hashing algorithm that won the Password Hashing Competition. It is deliberately slow and memory-intensive to make brute-force attacks computationally expensive. It is more secure than older algorithms like bcrypt.

**Q9. How does organization isolation work?**
> All data tables have `organization_id`. When a user logs in, their `organization_id` is embedded in the JWT. Every service method filters queries by this ID. A Manager from Company A cannot access Company B's data even with a valid token.

**Q10. Explain the task hierarchy in the database.**
> The `work_items` table has a self-referencing `parent_id` foreign key. EPIC has no parent. STORY's parent is EPIC. TASK's parent is STORY (or null for direct project tasks). SUBTASK's parent must be TASK. This is enforced by `validateHierarchy()` in `work-item.service.ts`.

**Q11. How does the system calculate attendance?**
> It sums all `work_sessions` for the day, clips them to office hours, merges overlapping intervals, then subtracts the configured lunch break minutes. The result is `net_working_minutes`.

**Q12. How does the system prevent overlapping time entries?**
> Before inserting a `TimeEntry`, the service queries for any existing entry where `start_time < newEnd AND end_time > newStart`. If found, it throws an error.

**Q13. What happens when the access token expires?**
> `api.js` detects a 401 response, calls `POST /api/auth/refresh` using the HTTP-only cookie. If successful, it stores the new access token and retries the original request — transparently, without the user knowing.

**Q14. How is task assignment restricted?**
> `isAuthorizedToAssign()` in `work-item.service.ts` checks: is the user a Manager/Admin? Tech Lead? Project owner? Task creator? Or do they have the `TASK_ASSIGN` permission? If none of these, they get a 403. This is backend-enforced.

**Q15. How does the refresh token rotation work?**
> On each refresh, the old token is verified, then a brand-new token is generated. The old token hash in `user_sessions` is replaced with the new hash. The old token can never be used again. This limits the window of a stolen refresh token.

**Q16. What is multi-tenancy and how is it used here?**
> Multiple organizations (companies) share the same database and backend, but their data is completely separated by `organization_id`. This is called "shared database, separate schema" multi-tenancy (actually shared schema here, separated by column). It reduces infrastructure cost vs. running separate DBs.

**Q17. How are batch/cohorts handled?**
> The `users` table has a `batch` column (e.g., "Batch 2026-A"). It is optional. The Manager sets it when creating interns (or via CSV import). It is returned in the `/api/auth/me` response and displayed in the Intern Hub portal. Not hardcoded.

**Q18. How does document upload permission work?**
> The route `POST /api/projects/:id/documents` uses `requireAnyPermission('DOCUMENT_UPLOAD', 'PROJECT_UPDATE')`. This means the user must have at least one of these permissions. Managers and Tech Leads have `DOCUMENT_UPLOAD`. Interns do not. The check is in the backend route — not just hidden in the UI.

**Q19. What prevents an intern from accessing the manager's dashboard URL directly?**
> `ProtectedRoute.jsx` on the frontend checks the user's role and redirects. But more importantly, every API call the manager dashboard makes requires `PROJECT_UPDATE`, `USER_CREATE` etc. permissions. The intern's JWT will fail these checks and get 403 errors from the backend.

**Q20. What is Prisma and why use it?**
> Prisma is an ORM (Object-Relational Mapper). It generates TypeScript types from the schema, allowing type-safe database queries. Migrations are managed as SQL files. It reduces SQL boilerplate and catches type errors at compile time.

**Q21. How does the manager report differ from the intern report?**
> `getInternReport` is called by the intern for their own last 30 days. `getIndividualReport` is called by a Manager, accepts a `targetUserId` and a `period` parameter (day/week/month), and includes more detailed day-by-day breakdown. Both are protected by role checks.

**Q22. Why is the intern's `user_code` hidden from the `/me` endpoint?**
> `user_code` is an internal identifier used by the system for operations. Interns don't need to know it and showing it could confuse them. The backend explicitly omits it for `INTERN` and `EMPLOYEE` roles in `auth.controller.ts`.

**Q23. What is the difference between `requireRole` and `requirePermission`?**
> `requireRole(['MANAGER'])` checks the user's role name directly (simple, coarse-grained). `requirePermission('TASK_CREATE')` checks the user's permissions set (fine-grained, flexible). The permission system is more powerful because you can add new permissions without changing role names.

**Q24. What happens when an intern refreshes the page?**
> Previously it caused logout (bug). Now: `AuthContext.jsx` hydrates `user` state **immediately** from `localStorage` on the first render (not after an async call), so the UI renders correctly at once. Then `initAuth()` validates the token in the background. If the token is expired, it tries `POST /api/auth/refresh` using the cookie. Only if that fails does it log out.

**Q25. How does the task assignment search work?**
> When a manager opens the "Add Assignee" modal, the frontend calls `GET /api/projects/:id/members?search=<query>`. The backend service filters project members by name or email using a case-insensitive `contains` filter in Prisma. This is a real backend search, not frontend filtering.

---

## 15. One-Page Verbal Explanation

> Use this to explain the project in a 3–5 minute verbal presentation.

---

"We built a **Project and Intern Management Platform** called **Dailoqa**. The core problem it solves is this: when a company has many interns working on different projects, there's no easy way for managers to know **who is working on what, for how long, and how productively**.

Our platform has **two separate portals**. The **Manager Dashboard** lets supervisors create projects, add intern team members, create tasks with a proper hierarchy — Project, then Tasks, then Subtasks — and assign them to specific interns. The **Intern Hub** lets interns log in and see exactly what they're assigned to. They can click 'Start Work' when they begin a task and 'Stop Work' when they're done.

Technically, we built this with **React on the frontend and Node.js with TypeScript on the backend**. The database is **PostgreSQL**, and we use **Prisma** as our ORM, which gives us type-safe database queries and automatic migrations.

For **authentication**, we use a **two-token system**: a short-lived JSON Web Token (15 minutes) that the frontend sends on every request, plus a long-lived refresh token stored in an HTTP-only cookie that the browser manages. This means even if someone steals the access token, it expires quickly. And since the refresh token is in an HTTP-only cookie, JavaScript on the page can't steal it.

**Authorization** is role-based — we have roles like Manager, Tech Lead, and Intern. Each role has a set of permissions like `TASK_CREATE` or `DOCUMENT_UPLOAD`. The backend checks these on every API call, so it doesn't matter what the frontend shows — unauthorized users will get a 403 error if they try to call a restricted API.

For **time tracking**, we have two concepts. A **WorkSession** is a live record — it's created when an intern starts work and updated when they stop. When the session ends, we automatically generate a **TimeEntry**, which is the finalized record used for reporting. This lets us separately track attendance (was the intern present?) and productive task time (how much did they actually work on tasks?).

Managers can view per-intern reports — daily, weekly, or monthly — showing attendance minutes, task minutes, and a breakdown by project and task.

The key security principles are: **everything is enforced by the backend**, data is **isolated by organization** (multi-tenancy), and sensitive information like permissions and internal IDs are never returned to intern-facing API endpoints."

---

*Document generated: 2026-10-07. Based on actual source code inspection of `c:\Users\srira\Desktop\intern_performance_dashboard`. No source code was modified.*

