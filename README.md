# Enterprise Project Management & Workspace Platform (v2)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://reactjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748.svg)](https://www.prisma.io/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D.svg)](https://redis.io/)
[![BullMQ](https://img.shields.io/badge/BullMQ-6.3-critical.svg)](https://bullmq.io/)
[![Jest](https://img.shields.io/badge/Jest-30.5-C21325.svg)](https://jestjs.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A modern, full-stack multi-tenant enterprise project and work management platform. Designed for organizations managing structured engineering teams, intern cohorts, and cross-functional projects with strict role-based access control (RBAC), agile sprint workflows, hierarchical work items, asynchronous background task processing, dual-engine document storage, and a dedicated integration adapter.

---

## 📑 Table of Contents

- [Key Features](#-key-features)
- [System Architecture](#-system-architecture)
- [Repository Structure](#-repository-structure)
- [Tech Stack](#-tech-stack)
- [Prerequisites & Local Setup](#-prerequisites--local-setup)
- [Configuration & Environment Variables](#-configuration--environment-variables)
- [Database Setup & Migrations](#-database-setup--migrations)
- [Testing & Quality Assurance](#-testing--quality-assurance)
- [MIRAI Integration Adapter (`mirai-adapter/`)](#-mirai-integration-adapter-mirai-adapter)
- [Deployment Overview & Production Considerations](#-deployment-overview--production-considerations)
- [License](#-license)

---

## 🚀 Key Features

### 1. Multi-Tenant Organization & Granular RBAC
- **Tenant Isolation**: Every database query, project resource, and audit log is strictly bounded to the authenticated tenant organization (`organization_id`).
- **Four Distinct Portals**:
  - **Super Admin (`/super-admin`)**: Global tenant provisioning, manager assignment, organization suspension, and system audits.
  - **Manager (`/manager`)**: Project lifecycle management, team member assignments, bulk intern CSV provisioning, form builder, and cohort broadcasts.
  - **Tech Lead**: Project-scoped leadership, sprint management, task review, extension request decisions, and team analytics.
  - **Intern / Member (`/intern`)**: Task board, sprint backlog, personal tasks, form submission, timesheet check-ins, and notifications.

### 2. Project & Work Management (Agile Scrum & Kanban)
- **Lifecycle Management**: Planned, Active, Completed, and Archived states with automated health scoring.
- **Hierarchical Work Items**: Strict hierarchy (`Epic` $\to$ `Story` $\to$ `Task` $\to$ `Subtask`) alongside standalone `Bug` items. Prevents orphaned items and circular references.
- **Sprint & Kanban Operations**: Active sprint concurrency enforcement (only 1 active sprint per project), automated completion rollover of unfinished tasks to backlog, and agile cycle time metrics.
- **Dual Deadline Adherence**: Tracks primary due dates alongside approved extension requests with audit trails.

### 3. Personal Tasks System
- User-scoped private task board with zero organization-wide leakage (`project_id = null`).
- Instant status transitions, due-date reminders, and personal productivity tracking.

### 4. Dual-Engine Document Storage
- **Object Storage**: S3-compatible cloud storage (AWS S3 or Cloudflare R2) with automated local S3 server fallback for offline development.
- **Metadata Persistence**: High-throughput document metadata and version tracking powered by MongoDB Atlas with fallback to PostgreSQL.

### 5. Asynchronous Background Notifications (BullMQ + Redis)
- Non-blocking broadcast announcements to entire cohorts or specific team members.
- Background worker processes message queues, manages delivery receipts, and updates unread badge counters.

### 6. Timesheets & Automated Cutoff Management
- Daily automated clock-in/clock-out tracking.
- Server-side background worker automatically clocks out expired sessions at the scheduled cutoff time.

---

## 🏛️ System Architecture

```mermaid
flowchart TD
    subgraph Clients["Frontend Clients"]
        WEB["React 18 + Vite SPA<br/>(Tailwind CSS, Lucide Icons)"]
        EXT_MIRAI["MIRAI Platform / Upstream Clients"]
    end

    subgraph Gateway["API & Integration Layer"]
        API["Node.js / Express 5 API Gateway<br/>(Stateless JWT, RBAC Middleware)"]
        ADAPTER["mirai-adapter/<br/>(Dedicated M2M Integration Adapter)"]
    end

    subgraph Services["Core Application Services"]
        AUTH_SVC["Auth & Session Service<br/>(Argon2, Session Rotation)"]
        PROJ_SVC["Project & Sprint Service<br/>(Agile Scrum / Kanban)"]
        WORK_SVC["Work Item Hierarchy Service<br/>(Epic ➔ Story ➔ Task)"]
        DOC_SVC["Document & Storage Service<br/>(Dual-Engine Storage)"]
        AUDIT_SVC["Transactional Audit Service<br/>(Atomic Rollback)"]
    end

    subgraph DataStore["Data & Queue Tier"]
        PG[("PostgreSQL 16 (Primary DB)<br/>(Prisma ORM, Multi-Tenant Schema)")]
        REDIS[("Redis 7 Cache & Broker")]
        BULLMQ["BullMQ Worker<br/>(Async Notifications & Cutoff Sync)"]
        S3[("AWS S3 / Cloudflare R2<br/>(Project Document Objects)")]
        MONGO[("MongoDB Atlas<br/>(Document Metadata Store)")]
    end

    WEB -->|REST API / Bearer Auth| API
    EXT_MIRAI -->|M2M Service JWT| ADAPTER
    ADAPTER -->|Internal Resolution| API
    
    API --> AUTH_SVC
    API --> PROJ_SVC
    API --> WORK_SVC
    API --> DOC_SVC
    API --> AUDIT_SVC
    
    AUTH_SVC --> PG
    PROJ_SVC --> PG
    WORK_SVC --> PG
    AUDIT_SVC --> PG
    
    DOC_SVC --> S3
    DOC_SVC --> MONGO
    
    API --> REDIS
    REDIS --> BULLMQ
    BULLMQ --> PG
```

---

## 📁 Repository Structure

```text
intern_performance_dashboard/
├── frontend/                      # React 18 single-page application (Vite, Tailwind CSS)
│   ├── src/                       # Components, hooks, context, dynamic portals
│   └── package.json
├── backend-node/                  # Primary Node.js REST API service
│   ├── api/index.ts               # Serverless entry point (Vercel deployment)
│   ├── src/
│   │   ├── controllers/           # HTTP controllers for all domain entities
│   │   ├── middleware/            # JWT authentication, RBAC, body limit, session cache
│   │   ├── models/                # MongoDB Mongoose models
│   │   ├── routes/                # Express routes (auth, projects, work-items, etc.)
│   │   ├── scripts/               # Migration, bulk reset, reconciliation utilities
│   │   ├── services/              # Domain logic (projects, sprints, timesheets, storage)
│   │   ├── server.ts              # Local standalone HTTP server & background workers
│   │   └── app.ts                 # Express application assembly & route mounting
│   ├── prisma/                    # PostgreSQL schema, migrations, and seed scripts
│   ├── tests/                     # Unit, integration, and API test suites (49 suites)
│   └── package.json
├── mirai-adapter/                 # Dedicated MIRAI ↔ PM Integration Adapter package
│   ├── README.md                  # Adapter architecture, contracts, security & test guide
│   ├── package.json               # Standalone package definition
│   ├── docs/                      # Technical specifications & API contracts
│   ├── src/                       # Identity mapping, membership resolution, service auth, client SDK
│   └── tests/                     # Dedicated adapter test suites (72 passing tests)
├── backend/                       # Legacy migration reference files
├── docs/                          # Architecture documentation, design guides, audit plans, and specifications
├── scripts/                       # Workspace helper and automation utilities
│   ├── checks/                    # Static code, accessibility, and label verifications
│   ├── testing/                   # Performance load testing and export test utilities
│   └── maintenance/               # Database diagnostics, collections, and service migration scripts
├── docker-compose.yml             # Local multi-container development stack
├── package.json                   # Workspace root package configuration
└── .env.example                   # Master environment variable template
```

---

## 🛠️ Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, Vite 5, TypeScript / JavaScript, Tailwind CSS 3, Lucide React, React Router 7 |
| **Backend API** | Node.js 20+, Express 5, TypeScript 5.9, Prisma ORM 5.22, Argon2, JSON Web Tokens |
| **Databases** | PostgreSQL 16 (Relational Primary), MongoDB Atlas (Document Metadata) |
| **Queues & Storage** | Redis 7, BullMQ 6.3, AWS S3 / Cloudflare R2 (S3 API), Local S3 Server (`s3rver`) |
| **Testing** | Jest 30, `ts-jest`, Supertest, Node Test Runner |
| **Tooling & CI** | Docker Compose, ESLint, Git, Prettier |

---

## ⚡ Prerequisites & Local Setup

### 1. Prerequisites
- **Node.js**: `v20.x` or higher
- **Docker & Docker Compose**: For local PostgreSQL and Redis containers
- **npm**: `v10.x` or higher

### 2. Clone & Environment Configuration
```bash
# 1. Clone repository
git clone https://github.com/Sriram1124/project-management-version-2.git
cd project-management-version-2

# 2. Configure environment variables from template
cp .env.example .env
cp backend-node/.env.example backend-node/.env
```

### 3. Quick Start with Docker Compose
```bash
# Start PostgreSQL and Redis infrastructure
docker compose up -d postgres redis

# Install backend dependencies & generate Prisma client
cd backend-node
npm install
npm run prisma:generate

# Run database migrations and seed baseline accounts
npx prisma migrate deploy
npm run seed

# Start backend development server (http://localhost:3001)
npm run dev
```

### 4. Start Frontend
```bash
# In a new terminal window
cd frontend
npm install
npm run dev
```
The frontend will start at **`http://localhost:5173`** (or `http://localhost:3000`).

---

## 🔑 Default Seed Credentials

After running `npm run seed` in `backend-node/`:

| Role | Email | Password | Scope / Portal |
|---|---|---|---|
| **Super Admin** | `superadmin@platform.local` | `SuperAdmin@123` | Global Platform (`/super-admin`) |
| **Manager** | `manager@dailoqa.com` | `password123` | Organization Management (`/manager`) |
| **Tech Lead** | `lead@dailoqa.com` | `password123` | Project Leadership (`/manager`) |
| **Intern** | `intern@dailoqa.com` | `password123` | Tasks & Memberships (`/intern`) |

---

## ⚙️ Configuration & Environment Variables

Environment variables are managed cleanly without hardcoding. Key parameters:

### Core Application & Database
| Variable | Description | Default / Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://pms_user:secret@localhost:5432/pms_db` |
| `PORT` | API server listen port | `3001` |
| `NODE_ENV` | Runtime environment (`development`, `production`, `test`) | `development` |
| `JWT_ACCESS_SECRET` | Secret for signing user access JWTs (min 32 chars) | Random 32+ character string |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens (min 32 chars) | Random 32+ character string |
| `ACCESS_TOKEN_EXPIRY` | Access token lifespan | `15m` |
| `REFRESH_TOKEN_EXPIRY` | Refresh token lifespan | `7d` |

### Integration & M2M Service Authentication
| Variable | Description | Default / Example |
|---|---|---|
| `PM_SERVICE_JWT_SECRET` | Dedicated secret for M2M integration JWTs (must differ from `JWT_ACCESS_SECRET`) | Random 32+ character string |
| `PROJECT_MANAGEMENT_SERVICE_TOKEN` | Static service token (strictly disabled in production) | Disabled in prod |

### Storage & Broker (Optional / Extended)
| Variable | Description | Default / Example |
|---|---|---|
| `REDIS_URL` | Redis connection URL for queues | `redis://localhost:6379` |
| `MONGODB_URI` | MongoDB Atlas URI for document metadata | `mongodb+srv://...` |
| `STORAGE_DRIVER` | Storage driver (`local` or `s3`) | `local` |
| `S3_ENDPOINT` | S3 / Cloudflare R2 API endpoint | Cloudflare R2 / AWS |
| `S3_BUCKET` | Target bucket name | `internhub-project-files` |

---

## 🧪 Testing & Quality Assurance

The codebase includes an extensive automated test suite covering unit logic, RBAC security, API integration, and edge cases (SonarQube compliant).

```bash
# Run all backend test suites (49 suites, 846 tests)
npm --prefix backend-node test

# Run tests with code coverage report
npm --prefix backend-node run test:coverage

# Run TypeScript typechecking across backend and adapter
npm --prefix backend-node run typecheck

# Run dedicated MIRAI integration adapter test suites (72 tests)
npm --prefix backend-node test -- mirai-adapter/tests/

# Run frontend tests
npm --prefix frontend test
```

---

## 🔌 MIRAI Integration Adapter (`mirai-adapter/`)

The repository features a standalone, top-level integration adapter package located at [`mirai-adapter/`](./mirai-adapter).

### Purpose & Architecture
- **Zero Database Duplication**: External platforms (such as the MIRAI Platform) query project memberships and verify user access via authoritative HTTP endpoints without replicating PM tables.
- **Strict Identity Decoupling**: Bridges external user UUIDs to internal PM user UUIDs through the persistent, audited `user_identity_mappings` table.
- **Approved Security Rules**:
  - **Decision A**: Membership query GET endpoints are strictly read-only and never create mappings from query parameters or headers.
  - **Decision B**: Direct UUID equality alone never establishes identity without an explicit mapping row.
  - **M2M JWT Authentication**: Protected by dedicated `PM_SERVICE_JWT_SECRET`, 5-minute maximum lifetime, `membership:read` scope enforcement, and canonical `org` tenant claims.
  - **Transactional Audit Logging**: Mapping creation and audit logging occur inside an atomic database transaction (`prisma.$transaction`) with automatic rollback on error.

See the [mirai-adapter README](./mirai-adapter/README.md) for full endpoint specifications, request/response formats, and testing details.

---

## 🚢 Deployment Overview & Production Considerations

### Deployment Topology
- **API Backend**: Deployed as serverless functions on **Vercel** (`backend-node/api/index.ts`) or containerized on AWS ECS / Render.
- **Frontend SPA**: Built as an optimized static distribution via Vite (`npm run build`) and served on Vercel, Netlify, or Cloudflare Pages.
- **Primary Database**: Hosted PostgreSQL instance (Supabase, AWS RDS, or Neon) utilizing connection poolers (`pgbouncer`).
- **Object Storage**: Cloudflare R2 or AWS S3 for production document attachments.

### Startup Validation
The application features startup health validation (`validateStartupConfig()`) that runs on server boot and serverless cold start:
- Verifies that all required JWT secrets are present in production.
- Ensures secrets are at least 32 bytes and rejects common weak placeholder values.
- Guarantees `PM_SERVICE_JWT_SECRET` is completely distinct from `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`.

### Known Limitations & Production Prerequisites
Before deploying this workspace in an enterprise production environment:
1. **Connection Pooling**: When deploying serverless functions (e.g. Vercel), ensure `DATABASE_URL` connects via a connection pooler (such as Supabase Transaction Pooler on port 6543 with `?pgbouncer=true`).
2. **Background Notification Worker**: BullMQ broadcast workers (`src/workers/notification.worker.ts`) require a persistent Redis broker and long-running process. They do not run inside stateless serverless function calls.
3. **Object Storage**: Local file upload tests utilize an in-memory S3 server (`s3rver`). Production document attachments require configuring managed cloud buckets (Cloudflare R2 or AWS S3).
4. **Monorepo Container Context**: The Dockerfile inside `backend-node/` is structured for standalone API builds. If containerizing the full monorepo with `mirai-adapter/`, mount or copy `mirai-adapter/` within the build context.

---

