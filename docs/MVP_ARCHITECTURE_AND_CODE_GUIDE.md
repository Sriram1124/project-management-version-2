# 🏛️ MVP Architecture & Code Guide (Project & Work Management V1)

This document provides a comprehensive technical overview of the **Project Management & Work Management MVP**, detailing the system architecture, file structure, request lifecycle, data schemas, hierarchy constraints, and complete REST API specifications.

---

## 🏗️ 1. High-Level System Architecture

```
                    ┌────────────────────────────────────────────────────────┐
                    │                      Client Browser                    │
                    │   (Unified Portal: React 18 + Vite + Tailwind CSS)     │
                    │               http://localhost:3000                    │
                    └───────────────────────────┬────────────────────────────┘
                                                │
                                    REST API Requests + Bearer JWT
                                    JSON payloads / multipart/form-data
                                                │
                                                ▼
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│                                Docker Compose Network (pms_network)                         │
│                                                                                            │
│   ┌────────────────────────────────────────────────────────────────────────────────────┐   │
│   │                          pms_backend (Node.js 20 + Express)                        │   │
│   │                                 http://localhost:3001                              │   │
│   │                                                                                    │   │
│   │   [Middleware]                                                                     │   │
│   │     ├── cors() / express.json() / cookieParser()                                   │   │
│   │     ├── authenticate()          --> Validates Access JWT, populates req.user       │   │
│   │     └── requirePermission()     --> Enforces granular RBAC permissions             │   │
│   │                                                                                    │   │
│   │   [Routers & Controllers]                                                          │   │
│   │     ├── /api/auth               --> AuthController (login, refresh, logout, me)    │   │
│   │     ├── /api/users              --> UserController (list org users)                │   │
│   │     ├── /api/projects           --> ProjectController (CRUD, members, documents)   │   │
│   │     └── /api/work-items         --> WorkItemController (CRUD, assignees, hierarchy)│   │
│   │                                                                                    │   │
│   │   [Services & Business Logic]                                                      │   │
│   │     ├── AuthService             --> Argon2 hashing, JWT signing & session tracking │   │
│   │     ├── ProjectService          --> Org scoping, membership checks, doc storage    │   │
│   │     └── WorkItemService         --> Jira-style hierarchy & safe deletion rules     │   │
│   │                                                                                    │   │
│   │   [Data Layer]                                                                     │   │
│   │     └── Prisma ORM Client       --> Type-safe queries, relations & transactions    │   │
│   │                                                                                    │   │
│   │   [Local Storage]                                                                  │   │
│   │     └── /app/storage            --> Persistent volume for uploaded project files   │   │
│   └───────────────────────────────────────────┬────────────────────────────────────────┘   │
│                                               │                                            │
│                                    TCP 5432 Connection                                     │
│                                               │                                            │
│   ┌───────────────────────────────────────────▼────────────────────────────────────────┐   │
│   │                         pms_postgres (PostgreSQL 16 Alpine)                        │   │
│   │                                     Port 5432                                      │   │
│   │                                                                                    │   │
│   │   Tables:                                                                          │   │
│   │     ├── organizations, users, roles, permissions, user_roles, role_permissions     │   │
│   │     ├── user_sessions, projects, project_members, project_documents                │   │
│   │     └── work_items, work_item_assignees, work_item_attachments                    │   │
│   └────────────────────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 2. Repository Directory Structure

```
project-management-dashboard-m/
├── .env.example                     # Environment template for Docker Compose & services
├── docker-compose.yml               # Multi-container orchestration (postgres + backend)
├── README.md                        # Root quick start documentation
├── docs/
│   ├── MVP_SETUP_AND_RUN_GUIDE.md   # Deployment, setup, and 20-point verification checklist
│   └── MVP_ARCHITECTURE_AND_CODE_GUIDE.md # Technical architecture and code guide (this file)
│
├── backend-node/                    # Node.js / Express / TypeScript REST API
│   ├── Dockerfile                   # Container definition with Node 20, OpenSSL, and build tools
│   ├── package.json                 # Dependencies (express, prisma, argon2, jsonwebtoken, etc.)
│   ├── tsconfig.json                # TypeScript compiler configuration
│   ├── prisma/
│   │   ├── schema.prisma            # Declarative database models, enums & relations
│   │   ├── seed.ts                  # Seeds default roles, permissions, org, and test accounts
│   │   └── migrations/              # Tracked SQL migration history
│   │       ├── 20260929104627_init_auth/
│   │       ├── 20260929165356_add_project_management/
│   │       ├── 20260929171316_align_v1_project_schema/
│   │       └── 20260930094548_add_work_items/
│   └── src/
│       ├── server.ts                # Express server bootstrapper (listens on PORT 3001)
│       ├── app.ts                   # Express app configuration & top-level router mounts
│       ├── lib/
│       │   └── prisma.ts            # Global singleton Prisma client instance
│       ├── middleware/
│       │   └── auth.middleware.ts   # JWT verification & RBAC permission enforcement
│       ├── routes/
│       │   ├── auth.routes.ts       # /api/auth routes
│       │   ├── user.routes.ts       # /api/users routes
│       │   ├── project.routes.ts    # /api/projects routes (CRUD, members, documents)
│       │   └── work-item.routes.ts  # /api/work-items routes (CRUD, assignees)
│       ├── controllers/
│       │   ├── auth.controller.ts   # Handles auth HTTP requests & cookie management
│       │   ├── user.controller.ts   # Returns sanitized user lists
│       │   ├── project.controller.ts# Handles project, member, and document requests
│       │   └── work-item.controller.ts # Validates input & routes work-item operations
│       └── services/
│           ├── auth.service.ts      # Authentication logic & token lifecycle
│           ├── project.service.ts   # Project business logic & filesystem persistence
│           └── work-item.service.ts # Jira hierarchy enforcement & safe deletion rules
│
└── frontend/                        # Unified React 18 + Vite Frontend Application
    ├── package.json                 # React 18, React Router v7, Lucide React, Tailwind
    ├── vite.config.js               # Vite config (dev server port 3000)
    ├── tailwind.config.js           # Design system tokens and color palette
    └── src/
        ├── main.jsx                 # React root renderer
        ├── App.jsx                  # Main router & role-based gatekeeper
        ├── ManagerApp.jsx           # Manager portal (Dashboard, Projects, Work Items, My Tasks)
        ├── context/
        │   └── AuthContext.jsx      # Global authentication state, login, and logout handlers
        ├── services/
        │   ├── api.js               # Central Fetch wrapper with JWT headers & 401 handling
        │   ├── projects.service.js  # REST API service for Projects, Members, and Documents
        │   └── workItems.service.js # REST API service for WorkItems and Assignees
        ├── components/              # Shared & Manager UI components
        │   ├── layout/ (Sidebar, Header)
        │   ├── views/ (ManagerDashboardView, TasksView, ManagerMyTasksView, projects/)
        │   └── modals/ (TaskDetailModal, CreateWorkItemModal, DocumentModals)
        └── features/
            ├── auth/                # LoginView and authentication forms
            └── intern/              # Intern Portal (InternApp, MyProjectsTab, MyTasksTab)
```

---

## 🔄 3. Backend Request Lifecycle & Security Model

Every incoming HTTP request traverses a strict layered pipeline:

```
[HTTP Request]
       │
       ▼
1. CORS Middleware (Origin matching, credentials enabled)
       │
       ▼
2. Body Parsers (express.json(), cookieParser())
       │
       ▼
3. Top-Level Routers (app.ts -> projectRouter, workItemRouter, etc.)
       │
       ▼
4. Authentication Middleware (`authenticate`)
   - Reads `Authorization: Bearer <token>`
   - Verifies JWT signature and expiry using `JWT_ACCESS_SECRET`
   - Fetches active user record with assigned roles & permissions from PostgreSQL
   - Populates `req.user` with `{ id, email, organization_id, roles, permissions }`
       │
       ▼
5. Authorization Guard (`requirePermission(permissionName)`)
   - Checks if user's roles grant the required permission (e.g., `PROJECT_UPDATE`)
   - Returns HTTP 403 Forbidden if permission is missing
       │
       ▼
6. Controller Layer
   - Validates incoming parameters, query filters, and request body types
   - Translates domain exceptions into structured HTTP status codes:
     * 400 Bad Request (hierarchy violation, invalid type)
     * 403 Forbidden (personal task ownership violation)
     * 404 Not Found (item not found in user's organization)
     * 500 Internal Server Error
       │
       ▼
7. Service Layer (Business Logic)
   - Enforces Organization Scoping (`WHERE organization_id = req.user.organization_id`)
   - Validates WorkItem Hierarchy Rules
   - Validates Project Membership & Personal Task Ownership
   - Performs Safe Deletion checks
       │
       ▼
8. Prisma Client Layer -> PostgreSQL 16
```

---

## 📐 4. Work Management V1 Architecture & Rules

### WorkItem Types
The system supports 5 standard work item types defined in enum `WorkItemType`:
1. `EPIC` — High-level feature grouping.
2. `STORY` — User-facing capability under an Epic.
3. `TASK` — Technical unit of work under a Story (or standalone in project).
4. `SUBTASK` — Granular child task under a Task.
5. `BUG` — Standalone issue or defect.

### Jira-Style Hierarchy Rules
Enforced in `WorkItemService.validateHierarchy()`:
* **`EPIC`**: Must have `parent_id = null`. Must belong to a project (`project_id != null`).
* **`STORY`**: Must have a parent of type `EPIC`.
* **`TASK`**: Can have a parent of type `STORY`, or can be a standalone task (`parent_id = null`).
* **`SUBTASK`**: **MUST** have a parent of type `TASK`. (Cannot be standalone; cannot belong to an Epic or Story).
* **`BUG`**: Can have a parent of type `EPIC` or be standalone (`parent_id = null`). (Cannot belong to a Story).
* **Cross-Project Boundary**: A work item cannot have a parent from a different project. If `project_id` is set, `parent.project_id` must match.
* **Personal Boundary**: If `project_id = null` (personal task), the parent must also have `project_id = null`.

### Safe Deletion Rules
Enforced in `WorkItemService.deleteWorkItem()`:
1. **Child Protection**: If a work item has any active children (`children.length > 0`), deletion is **strictly rejected** with HTTP 400 Bad Request (`"Cannot delete work item with child items. Please reassign or delete children first."`).
2. **Project Task Permissions**: A project task can be deleted by:
   - Any user with `MANAGER` or `ADMIN` role.
   - The original creator of the task (`created_by === user.id`).
3. **Personal Task Permissions**: A personal task (`project_id = null`) can **ONLY** be deleted by its creator (`created_by === user.id`). Any other user receives HTTP 403 Forbidden.

### Status & Priority Enums
* **`WorkItemStatus`**: `TODO` | `IN_PROGRESS` | `IN_REVIEW` | `COMPLETED` | `BLOCKED`
* **`WorkItemPriority`**: `LOW` | `MEDIUM` | `HIGH` | `URGENT`

---

## 📁 5. Project Management V1 Architecture

### Project Scoping & Membership
* Every project belongs to an `Organization`.
* Managers can create, update, and archive projects (`ProjectStatus`: `PLANNED`, `ACTIVE`, `COMPLETED`, `ARCHIVED`).
* Users are explicitly assigned to projects via `ProjectMember` (`project_id`, `user_id`).
* Interns only see projects where they have an active membership (`ProjectMember.user_id = intern.id`).

### Project Document Persistence
* Documents are uploaded via `multipart/form-data` handled by `multer`.
* Storage engine: Local disk storage in `/app/storage/projects/{projectId}/{documentId}_{filename}`.
* Supported document metadata: name, MIME type, storage key, upload timestamp.
* Access control: Only project members or organization managers can download or preview documents.
* Endpoints:
  - `POST /api/projects/:id/documents` (upload single file)
  - `GET /api/projects/:id/documents/:documentId/download` (attachment stream)
  - `GET /api/projects/:id/documents/:documentId/preview` (inline stream for browser rendering)
  - `DELETE /api/projects/:id/documents/:documentId` (deletes from DB and filesystem)

---

## 📡 6. Complete REST API Reference Table

All API endpoints reside under `/api` and require `Authorization: Bearer <accessToken>` unless specified otherwise.

### Authentication (`/api/auth`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | Public | Authenticates credentials; returns `{ accessToken, user }` and sets httpOnly refresh cookie |
| `POST` | `/api/auth/refresh` | Public (Cookie) | Rotates refresh token session; returns new `accessToken` |
| `POST` | `/api/auth/logout` | Authenticated | Revokes session and clears auth cookies |
| `GET` | `/api/auth/me` | Authenticated | Returns current authenticated user profile, roles, and permissions |

### Users (`/api/users`)
| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/api/users` | `USER_READ` | Lists all users in the caller's organization (id, name, email, roles) |

### Projects (`/api/projects`)
| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/api/projects` | `PROJECT_READ` | Lists projects visible to user (filtered by membership for non-managers) |
| `POST` | `/api/projects` | `PROJECT_CREATE` | Creates a new project in the user's organization |
| `GET` | `/api/projects/:id` | `PROJECT_READ` | Gets project details, owner info, and counts |
| `PATCH`| `/api/projects/:id` | `PROJECT_UPDATE` | Updates project details (name, description, dates, status) |
| `POST` | `/api/projects/:id/archive` | `PROJECT_UPDATE` | Sets project status to `ARCHIVED` |
| `GET` | `/api/projects/:id/members` | `PROJECT_READ` | Lists all users assigned to the project |
| `POST` | `/api/projects/:id/members` | `PROJECT_UPDATE` | Adds a user to the project (`{ userId }`) |
| `DELETE`| `/api/projects/:id/members/:userId` | `PROJECT_UPDATE` | Removes a user from the project |
| `GET` | `/api/projects/:id/documents` | `PROJECT_READ` | Lists all uploaded documents for the project |
| `POST` | `/api/projects/:id/documents` | `PROJECT_UPDATE` | Uploads a file (multipart/form-data field `file`) |
| `GET` | `/api/projects/:id/documents/:documentId/download` | `PROJECT_READ` | Streams the raw file as a browser download |
| `GET` | `/api/projects/:id/documents/:documentId/preview` | `PROJECT_READ` | Streams the file inline with MIME headers for browser preview |
| `PATCH`| `/api/projects/:id/documents/:documentId` | `PROJECT_UPDATE` | Updates document title/name |
| `DELETE`| `/api/projects/:id/documents/:documentId` | `PROJECT_UPDATE` | Deletes document record and removes file from disk |

### Work Items (`/api/work-items`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/work-items` | Authenticated | Query work items with filters: `project_id`, `type`, `status`, `priority`, `assigned_to_me`, `my_personal` |
| `POST` | `/api/work-items` | Authenticated | Creates a work item (validates hierarchy, project scoping, and permissions) |
| `GET` | `/api/work-items/:id` | Authenticated | Gets work item with full details, creator, parent, children, and assignees |
| `PATCH`| `/api/work-items/:id` | Authenticated | Updates work item fields (`title`, `description`, `status`, `priority`, `due_date`) |
| `DELETE`| `/api/work-items/:id` | Authenticated | Deletes work item (rejects if children exist; enforces creator rule for personal tasks) |
| `POST` | `/api/work-items/:id/assignees` | Authenticated | Assigns users to work item (`{ user_ids: string[] }`) |
| `DELETE`| `/api/work-items/:id/assignees/:userId` | Authenticated | Removes an assigned user from the work item |

---

## 🔑 7. Seeded Development Accounts

These accounts are automatically seeded into PostgreSQL via `backend-node/prisma/seed.ts`:

| Account | Email | Password | Assigned Role | Default Permissions |
|---|---|---|---|---|
| **Manager** | `manager@dailoqa.com` | `password123` | `MANAGER` | `USER_READ`, `PROJECT_*`, `TASK_*`, `FORM_*`, `EVALUATION_*`, `ATTENDANCE_*` |
| **Intern** | `intern@dailoqa.com` | `password123` | `INTERN` | `PROJECT_READ`, `TASK_READ`, `TASK_UPDATE`, `FORM_READ`, `FORM_SUBMIT`, `ATTENDANCE_*` |
| **Tech Lead**| `lead@dailoqa.com` | `password123` | `TECH_LEAD` | Technical leadership role |

Organization: **Dailoqa Technologies**
Password hashing: **Argon2id** (`argon2.hash()`)
