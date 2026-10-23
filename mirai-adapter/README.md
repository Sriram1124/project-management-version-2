# MIRAI ↔ Project Management (PM) Integration Adapter

A dedicated, self-contained TypeScript integration adapter that connects the **MIRAI Platform** to the **Project Management System (PM Backend)**.

---

## 1. Overview & Purpose

The **MIRAI Integration Adapter** provides a clean, secure boundary between MIRAI (Django) and the PM Backend (Node/Express/Prisma):
- **Authoritative Data Source**: Project definitions, memberships, and work item hierarchies remain in the PM Backend database (PostgreSQL). MIRAI does not duplicate or replicate tables.
- **Tenant Isolation**: All operations are strictly bounded to the tenant organization identified in verified M2M service JWT claims.
- **Strict Identity Decoupling**: Bridges MIRAI user identities (UUID) to PM user identities through an audited mapping table (`user_identity_mappings`).
- **Resilient Client & Endpoints**: Provides both upstream client abstractions (for consuming PM REST APIs) and authoritative service endpoints (serving MIRAI M2M requests).

---

## 2. Directory Layout & Architecture

```text
mirai-adapter/
├── README.md                      # Architecture, configuration, API contracts, and testing
├── package.json                   # Adapter package definition
├── src/
│   ├── identity-mapping/          # Persistent identity mapping & reconciliation logic
│   │   ├── types.ts               # ResolvedEffectiveUser, ReconciliationResult
│   │   ├── identity-mapping.service.ts
│   │   └── index.ts
│   ├── membership/                # Authoritative project membership queries
│   │   ├── types.ts               # MembershipCheckResult, UserMembershipsResult
│   │   ├── project-membership.service.ts
│   │   └── index.ts
│   ├── authentication/            # Dedicated M2M Service-to-Service JWT authentication
│   │   ├── types.ts               # ServiceUserClaims, AuthenticatedServiceRequest
│   │   ├── service-auth.middleware.ts
│   │   └── index.ts
│   ├── audit/                     # Transactional audit logging for integration events
│   │   ├── types.ts               # MiraiAuditAction, MiraiAuditInput
│   │   ├── mirai-audit.service.ts
│   │   └── index.ts
│   ├── routes/                    # Internal Express router (/internal/mirai/v1)
│   │   ├── internal-mirai.routes.ts
│   │   └── index.ts
│   ├── client/                    # Upstream client for MIRAI Django consumption
│   │   ├── mirai-adapter.types.ts
│   │   ├── mirai-http-client.ts
│   │   ├── mirai-identity-mapper.ts
│   │   ├── mirai-project-management.adapter.ts
│   │   └── index.ts
│   └── index.ts                   # Unified barrel export
├── tests/                         # Integration-specific test suites
│   ├── service-auth.test.ts
│   ├── identity-mapping.test.ts
│   ├── project-membership.test.ts
│   ├── mirai-project-management.adapter.test.ts
│   └── integration-scenarios.test.ts
└── docs/                          # Specifications and technical contracts
    ├── MIRAI_PM_MEMBERSHIP_FINAL_SPECIFICATION.md
    ├── MIRAI_PROJECT_MANAGEMENT_ADAPTER_CONTRACT.md
    └── MIRAI_API_INTEGRATION_TEST_GUIDE.md
```

---

## 3. Approved Identity & Security Invariants

This adapter strictly enforces the requirements approved by engineering leadership:

1. **Decision A — Membership GET routes are strictly read-only (SEC-02)**
   - `GET /internal/mirai/v1/users/:mirai_user_id/project-memberships` and `GET /internal/mirai/v1/users/:mirai_user_id/projects/:project_id/membership` **NEVER** insert, mutate, or create identity mappings.
   - Email query parameters and `X-User-Email` headers are ignored for mapping creation during GET operations.
   - Unmapped users return `mapping_status: "unmapped"` and `project_ids: []` (or `is_member: false`) with HTTP 200.

2. **Decision B — Direct UUID matching alone never establishes identity**
   - Matching UUID strings across systems without an explicit row in `user_identity_mappings` will **never** resolve identity.
   - All identity lookups require an authoritative mapping row belonging to the caller's tenant organization.

3. **Reconciliation Gateway**
   - Mappings can only be created via the authenticated endpoint:
     `POST /internal/mirai/v1/identities/reconcile` (or CLI `reconcile-identities.ts`).
   - When a unique active PM user matches the normalized email within the organization, a mapping is established transactionally.
   - Multiple email matches return `mapping_status: "ambiguous"` with zero row insertions.
   - Conflicts return `mapping_status: "conflict"` with zero row insertions.

4. **Dedicated Service-to-Service Authentication**
   - Verified strictly with dedicated `PM_SERVICE_JWT_SECRET` (distinct from `JWT_ACCESS_SECRET`).
   - Token claims enforced:
     - Issuer: `mirai-django`
     - Audience: `pm-membership-api`
     - Scope: Must contain `membership:read`
     - Expiration: Required, maximum lifetime 5 minutes (300 seconds)
     - Tenant: Canonical `org` claim (X-Organization-Id header is ignored).
   - Static service tokens are rejected in production (HTTP 401).

5. **Transactional Audit Logging with Rollback**
   - Mapping creation and audit logging occur inside an atomic database transaction (`prisma.$transaction`).
   - If audit logging fails, the mapping creation is rolled back.

---

## 4. Configuration & Environment Variables

| Variable | Description | Environment | Required |
|---|---|---|---|
| `PM_SERVICE_JWT_SECRET` | Dedicated secret (>= 32 bytes) for M2M JWT verification between MIRAI and PM Backend | All | **Yes** |
| `JWT_ACCESS_SECRET` | Secret for standard PM user session tokens (must NOT equal `PM_SERVICE_JWT_SECRET`) | All | **Yes** |
| `PROJECT_MANAGEMENT_API_URL` | Base URL of deployed PM API (e.g. `https://internhub-backend.vercel.app/api`) | Client | Yes |
| `PROJECT_MANAGEMENT_API_TOKEN` | Service JWT token signed for M2M requests | Client | Yes |

---

## 5. API Contracts

### A. Dedicated Identity Reconciliation
```http
POST /internal/mirai/v1/identities/reconcile
Authorization: Bearer <service_jwt>
Content-Type: application/json

{
  "mirai_user_id": "d56a3127-142f-48d6-95ff-f2d4fdf3d820",
  "email": "intern@company.com"
}
```
**Response (200 OK):**
```json
{
  "mirai_user_id": "d56a3127-142f-48d6-95ff-f2d4fdf3d820",
  "pm_user_id": "c49a1d2e-84b2-4d3a-b8aa-12e098765432",
  "mapping_status": "mapped",
  "mapping_source": "auto_mapped_by_email",
  "project_ids": ["proj-100-uuid", "proj-200-uuid"],
  "as_of": "2026-10-23T19:30:00.000Z"
}
```

### B. User Project Memberships (Read-Only)
```http
GET /internal/mirai/v1/users/:mirai_user_id/project-memberships
Authorization: Bearer <service_jwt>
```
**Response (200 OK - Mapped):**
```json
{
  "mirai_user_id": "d56a3127-142f-48d6-95ff-f2d4fdf3d820",
  "pm_user_id": "c49a1d2e-84b2-4d3a-b8aa-12e098765432",
  "mapping_status": "mapped",
  "project_ids": ["proj-100-uuid", "proj-200-uuid"],
  "as_of": "2026-10-23T19:30:00.000Z"
}
```
**Response (200 OK - Unmapped):**
```json
{
  "mirai_user_id": "d56a3127-142f-48d6-95ff-f2d4fdf3d820",
  "pm_user_id": null,
  "mapping_status": "unmapped",
  "project_ids": [],
  "as_of": "2026-10-23T19:30:00.000Z"
}
```

### C. Single Project Membership Check (Read-Only)
```http
GET /internal/mirai/v1/users/:mirai_user_id/projects/:project_id/membership
Authorization: Bearer <service_jwt>
```
**Response (200 OK):**
```json
{
  "mirai_user_id": "d56a3127-142f-48d6-95ff-f2d4fdf3d820",
  "pm_user_id": "c49a1d2e-84b2-4d3a-b8aa-12e098765432",
  "project_id": "proj-100-uuid",
  "mapping_status": "mapped",
  "is_member": true,
  "role_in_project": "DEVELOPER",
  "as_of": "2026-10-23T19:30:00.000Z"
}
```

---

## 6. How to Run Tests

### Run all adapter tests:
```bash
npm --prefix backend-node test -- mirai-adapter/tests/
```

### Run targeted test suites:
```bash
# Service authentication
npm --prefix backend-node test -- mirai-adapter/tests/service-auth.test.ts

# Identity mapping & reconciliation
npm --prefix backend-node test -- mirai-adapter/tests/identity-mapping.test.ts

# Project membership service
npm --prefix backend-node test -- mirai-adapter/tests/project-membership.test.ts

# Adapter client unit tests
npm --prefix backend-node test -- mirai-adapter/tests/mirai-project-management.adapter.test.ts

# End-to-end integration scenarios
npm --prefix backend-node test -- mirai-adapter/tests/integration-scenarios.test.ts
```

### Typecheck:
```bash
npm --prefix backend-node run typecheck
```

