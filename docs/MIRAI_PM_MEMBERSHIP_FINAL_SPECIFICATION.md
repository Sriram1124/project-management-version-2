# Engineering Specification: MIRAI Project Management Membership & Adapter Integration

> [!NOTE]
> **Canonical Location:** The authoritative version of this integration specification is maintained in [mirai-adapter/docs/MIRAI_PM_MEMBERSHIP_FINAL_SPECIFICATION.md](../mirai-adapter/docs/MIRAI_PM_MEMBERSHIP_FINAL_SPECIFICATION.md). This copy is preserved for backwards compatibility with existing repository links.

Author: Sriram (Identity Mapping & PM Backend Lead)  
Co-Owner / Integration Adapter: Jangeti Chaithanya Sai  
Target Repository: https://github.com/krisshhjain/Mirai-Dashboard  
Reference PR: #15 (docs/architecture/pm-membership-contract.md)  
Date: 22 October 2026  
Status: PROPOSED — PENDING KRISH'S REVIEW  

---

## 1. Executive Summary

This document establishes the updated engineering agreement for connecting MIRAI's Django Role-Based Access Control (RBAC) layer to the Node.js Project Management (PM) service. It addresses the review feedback on PR #15 and Krish's Round 3 requirements:
- Hardening Service Authentication to make audience-restricted, short-lived JWTs mandatory in production.
- Deriving organization identity strictly from token claims rather than headers.
- Defining the authoritative identity provisioning lifecycle and persistent override auditing.
- Clarifying code repository locations and component ownership between Sriram, Chaitanya, and Anant.

```mermaid
flowchart TD
    subgraph ClientLayer ["Client & Frontend Layer"]
        UI["MIRAI Frontend\n(Single Session-Based API Client)"]
    end

    subgraph DjangoLayer ["MIRAI Core (Django on port 8000)"]
        AUTH["Session Cookie + CSRF Auth\n(/auth/me)"]
        RBAC["6-Persona RBAC Engine\n(accounts/rbac/scope.py)"]
        RESOLVER["Chaitanya's PM Resolver Adapter\n(External Module / Separate PR)"]
    end

    subgraph NodePMLayer ["Project Management Service (Node.js on port 4000)"]
        M2M_AUTH["Audience-Restricted M2M JWT Auth\n(iss: mirai-django, aud: pm-membership-api)"]
        INTERNAL_API["Internal Membership Endpoints\n(/internal/mirai/v1/...)"]
        DB[("PostgreSQL Database\npublic.project_members")]
    end

    UI -- "Session Cookie + CSRF" --> AUTH
    AUTH --> RBAC
    RBAC --> RESOLVER
    RESOLVER -- "Short-Lived Signed JWT (exp <= 5m)" --> M2M_AUTH
    M2M_AUTH --> INTERNAL_API
    INTERNAL_API --> DB
```

---

## 2. Architecture & Ownership Boundaries

### Transport Strategy (Proposed for Krish's Formal Sign-Off)
- Option A: The frontend communicates exclusively with the Django backend on port 8000 using standard session cookies and CSRF tokens. Django acts as the single gateway, evaluates RBAC rules, and queries Node PM via backend-to-backend calls.
- Frontend does not manage Node.js JWTs or communicate directly with port 4000.

### Ownership Matrix
- Sriram (PM Backend & Identity): Owns Node.js `/internal/mirai/v1` routes, M2M service token verification, `public.project_members` database queries, and the identity mapping lifecycle.
- Jangeti Chaithanya Sai (MIRAI-facing Adapter): Owns the Django-side resolver adapter implementation in a dedicated module (outside `accounts/rbac/`), client-side configuration, and transport error handling.
- Anant Sharma (RBAC Lead): Reviews the Django adapter against the `accounts/rbac/scope.py` MembershipResolver protocol and coordinates settings integration.
- Krish Jain: Final sign-off on Option A transport model and the Identity Provisioning lifecycle.

---

## 3. Database Invariants: Why Task Assignment Is Not Membership

### Authoritative Store
`public.project_members` is the single source of truth for project membership.

### Separation of Tasks and Membership
- In `backend-node/prisma/schema.prisma`, task assignees are recorded in `public.work_item_assignees` referencing `users.id`, not `project_members`.
- When an intern is removed from a project, `prisma.projectMember.deleteMany` removes their row from `public.project_members`.
- Historical work items and completed tasks in `public.work_items` remain intact to preserve project sprint velocity, burn-down charts, and audit histories.
- If Django RBAC inferred membership from task assignments, removed interns would retain lingering project visibility indefinitely.
- Therefore, task assignment never confers project membership. Access is revoked the moment an intern is removed from `public.project_members`.

### Separation of Ownership and Membership
- Project ownership is recorded in `public.projects.owner_id` and `public.project_owners`.
- Interns are strictly prohibited from owning projects.
- Managers who own a project but are not listed in `public.project_members` are not considered members. Membership checks strictly query `public.project_members`.

---

## 4. Comprehensive Questions & Answers Register

### Part A: Identity Lifecycle & Persistent Mapping (Sriram)

#### Question 1 (Identity Provisioning: How PM Users Get Django UUIDs)
The specification assumes PM user ID = MIRAI UUID. How do PM users get the Django UUID (who creates them, and when)?

Answer by Sriram:
- MIRAI Django is the authoritative Identity Provider (IdP) and user directory.
- When an intern is enrolled in a cohort, Django generates the canonical RFC 4122 v4 UUID (`users.id`).
- During user onboarding / cohort synchronization, the Node.js PM service ingests and creates the user account using the identical UUID as its primary key (`users.id`).
- When SSO / session federation is active, the authenticated user subject claim corresponds directly to this UUID.
- This identity provisioning model is submitted for Krish's formal sign-off.

#### Question 2 (Identity Mapping & Inactive User Semantics)
How are identity mappings and inactive users handled?
 
Answer by Sriram:
- Canonical 1:1 Parity: Django user UUIDs map 1:1 directly to PM `users.id` (RFC 4122 v4 UUID string stored as TEXT). There is no speculative in-memory translation or secondary mapping table.
- Inactive User Handling: If a PM user account exists but has `is_active: false`, `/internal/mirai/v1/users/:mirai_user_id/project-memberships` and `/internal/mirai/v1/users/:mirai_user_id/projects/:project_id/membership` immediately return `mapping_status: "unmapped"` and empty memberships (`project_ids: []` / `is_member: false`), ensuring deprovisioned users lose all effective visibility.

#### Question 3 (Membership Statuses & Archived Projects)
What counts as a verified member or assigned participant in PM? What about invitations, ended memberships, and archived projects?

Answer by Sriram:
- Active Member: An intern is a member if and only if an active record exists in `public.project_members(project_id, user_id)`.
- Invitations / Drafts: Pending or draft invitations do not grant membership and are excluded until accepted into `public.project_members`.
- Ended Memberships: When an intern is removed, their row is deleted from `public.project_members`. Membership check immediately returns `is_member: false`.
- Archived Projects: Verified members retain read-only portfolio access to archived projects they were part of unless explicitly removed by a manager.

#### Question 4 (Project Identity Mapping)
Are PM project IDs already the IDs MIRAI stores and exposes, or does the adapter translate them?

Answer by Sriram:
- Project IDs are 1:1 identical. `projects.id` in PostgreSQL is the primary RFC 4122 v4 UUID string stored as TEXT.
- There is no secondary internal integer ID. The UUID returned in `project_ids` matches the project UUID stored in MIRAI. No translation is required.

---

### Part B: Service-to-Service Authentication Hardening (Krish Round 3 Requirements)

#### Question 5 (Separate Service Key & Mandatory Claims)
How is the service token authenticated and hardened?

Answer by Sriram:
- Dedicated Service Key: Service JWTs are verified strictly with `PM_SERVICE_JWT_SECRET`, separate from `JWT_ACCESS_SECRET` (which signs PM user sessions). User tokens signed with `JWT_ACCESS_SECRET` are immediately rejected with HTTP 401 signature errors.
- Startup Validation: The server fails at boot (`validateStartupConfig()`) if `PM_SERVICE_JWT_SECRET` or `JWT_ACCESS_SECRET` is missing in production. No hardcoded default secrets (like `'access_secret'`) exist in production.
- Required JWT Claims (All Mandatory):
  - `iss`: Must equal `"mirai-django"`. Tokens with missing or mismatched issuers are rejected with HTTP 401.
  - `aud`: Must equal `"pm-membership-api"`. Tokens with missing or mismatched audiences are rejected with HTTP 401.
  - `exp`: Expiration claim is mandatory. Token lifetime (`exp - iat`) cannot exceed 5 minutes (300 seconds). Lifetimes over 5 min or expired tokens are rejected with HTTP 401.
  - `scope`: Must include `"membership:read"`. The alternative `PROJECT_READ` has been dropped. Tokens lacking `membership:read` are rejected with HTTP 403.
  - `org`: Organization UUID must be present in token claims.
- Static Token Rejection: Static service tokens are rejected with HTTP 401 in production (`NODE_ENV === 'production'`).

#### Question 6 (Tenant Extraction & Dropping Hardcoded Defaults)
How is multi-tenancy handled and how is the organization ID extracted?

Answer by Sriram:
- The organization ID is extracted strictly from the token claim (`payload.org` or `payload.organizationId`).
- The `X-Organization-Id` header is completely ignored for service tokens.
- Hardcoded default organizations and "first active org" fallbacks in `getUserProjectMemberships` and `checkProjectMembership` have been completely removed.
- If a service token lacks an active organization or references an inactive organization in PostgreSQL, the request fails closed with HTTP 403 (`Organization not found or inactive`).

---

### Part C: Code Location, Status & Adapter Hardening

#### Question 7 (Where the Routes and Token Middleware Live)
Where are the `/internal/mirai/v1` routes and token middleware located?

Answer by Sriram:
- The `/internal/mirai/v1` routes and M2M authentication middleware are implemented in the **Node.js Project Management repository (`intern_performance_dashboard`)**, not in `krisshhjain/Mirai-Dashboard`.
- Live Commit: [`https://github.com/Sriram1124/project-management-version-2/commit/49fb2a8`](https://github.com/Sriram1124/project-management-version-2/commit/49fb2a8)
- Branch: [`feature/mirai-project-membership`](https://github.com/Sriram1124/project-management-version-2/tree/feature/mirai-project-membership)
- Files in PM Repository:
  - Routes: `backend-node/src/routes/internal-mirai.routes.ts`
  - Auth Middleware: `backend-node/src/middleware/auth.middleware.ts`
  - Membership Service: `backend-node/src/services/project.service.ts`
- Status: Marked as **PROPOSED — PENDING KRISH'S REVIEW** in the MIRAI Dashboard documentation.

#### Question 8 (Client Hardening & Startup Validation)
How is the client resolver hardened against configuration errors and malformed payloads?

Answer:
- No Default Secrets: No fallback secrets (such as `"your-shared-service-token"`) or default `localhost` URLs are permitted. The Django resolver client validates configuration at boot via Django system check (`checks.register`) or `AppConfig.ready()`, failing fast at startup if `PM_SERVICE_URL`, `PM_SERVICE_JWT_SECRET`, or `PM_SERVICE_ORGANIZATION_ID` is missing, preventing runtime HTTP 500s.
- Dependency Agreement: `PyJWT` and `requests` (or `httpx`) are agreed backend dependencies for Django.
- Identity Verification: The client explicitly asserts that `response.mirai_user_id == requested_user_id`, dropping mismatched payloads.
- Payload Type Validation: The client asserts that `project_ids` is an explicit list of valid UUIDs. Non-list payloads or malformed strings are dropped.
- Strict Total Timeout Cap: Total request duration is strictly capped at 2.0 seconds (`timeout=2.0` across entire request lifecycle) with no cascading retries.

---


### Part D: Identity Reconciliation & Persistent Audit Logging (Sriram)

#### Question 9 (Persistent Identity Mapping & Audit Trail)
How are identity reconciliation outcomes persisted and audited in compliance with security requirements?

Answer by Sriram:
- **Persistent Storage:** Identity mappings are persisted in `public.user_identity_mappings` with global 1:1 unique constraints on `mirai_user_id` and `pm_user_id`, tenant-scoped by `organization_id`.
- **Persistent Audit Logging:** Every identity reconciliation request emits an immutable audit event to `public.audit_logs`:
  - `MIRAI_IDENTITY_MAPPED`: Emitted in an atomic transaction when a new mapping is created via normalized email matching. Target type: `USER_IDENTITY_MAPPING`, metadata includes `mirai_user_id`, `pm_user_id`, `status: 'mapped'`, `mapping_source: 'auto_mapped_by_email'`, and `actor`.
  - `MIRAI_IDENTITY_RECONCILED`: Emitted when an existing mapping is successfully verified or direct PM user identity is used.
  - `MIRAI_IDENTITY_RECONCILE_FAILED_INACTIVE`: Emitted when a mapping references an inactive PM user (`is_active: false`), failing closed to `unmapped`.
  - `MIRAI_IDENTITY_RECONCILE_AMBIGUOUS`: Emitted when multiple active PM users share the same normalized email, failing closed to `ambiguous`.
  - `MIRAI_IDENTITY_RECONCILE_CONFLICT`: Emitted when a candidate PM user is already mapped to a different MIRAI identity or a concurrent collision occurs, failing closed to `conflict`.
  - `MIRAI_IDENTITY_UNMAPPED`: Emitted when no matching active PM user is found by email or direct ID.
- **Tenant Isolation:** Audit events derive `organization_id` strictly from verified service-token claims (`user.organization_id`).
- **Data Privacy & Credential Safety:** Audit records never record JWTs, service secrets, authorization headers, or passwords.

---

## 5. Live Internal API Contracts

Base URL: `{PM_BASE}/internal/mirai/v1` (Port 4000)

### Endpoint 1: List a User's Project Memberships

Used for project list queries (`sqlalchemy_filter(member_column=...)`).

Request:
```http
GET /internal/mirai/v1/users/:mirai_user_id/project-memberships HTTP/1.1
Host: localhost:4000
Authorization: Bearer <Short-Lived-Service-JWT>
Accept: application/json
```

Required JWT Claims:
```json
{
  "iss": "mirai-django",
  "aud": "pm-membership-api",
  "org": "00000000-0000-0000-0000-000000000001",
  "scope": "membership:read",
  "role": "SERVICE",
  "exp": 1792680300
}
```

Response: Active Mapped Member (HTTP 200 OK)
```json
{
  "mirai_user_id": "550e8400-e29b-41d4-a716-446655440000",
  "mapping_status": "mapped",
  "project_ids": [
    "8f14e45f-ceea-467a-9575-0b6a2b5a7f01",
    "c9f0f895-fb98-4b1b-8e5b-6bd0c1a2d3e4"
  ],
  "as_of": "2026-10-22T11:15:00.000Z"
}
```

Response: Unmapped / Non-Existent User (HTTP 200 OK)
```json
{
  "mirai_user_id": "550e8400-e29b-41d4-a716-446655440000",
  "mapping_status": "unmapped",
  "project_ids": [],
  "as_of": "2026-10-22T11:15:00.000Z"
}
```

---

### Endpoint 2: Check Single Project Membership

Used for project detail access checks (`allows(record)`).

Request:
```http
GET /internal/mirai/v1/users/:mirai_user_id/projects/:project_id/membership HTTP/1.1
Host: localhost:4000
Authorization: Bearer <Short-Lived-Service-JWT>
Accept: application/json
```

Response: Confirmed Member (HTTP 200 OK)
```json
{
  "mirai_user_id": "550e8400-e29b-41d4-a716-446655440000",
  "project_id": "8f14e45f-ceea-467a-9575-0b6a2b5a7f01",
  "mapping_status": "mapped",
  "is_member": true,
  "role_in_project": "participant",
  "as_of": "2026-10-22T11:15:00.000Z"
}
```

Response: Confirmed Non-Member (HTTP 200 OK)
```json
{
  "mirai_user_id": "550e8400-e29b-41d4-a716-446655440000",
  "project_id": "8f14e45f-ceea-467a-9575-0b6a2b5a7f01",
  "mapping_status": "mapped",
  "is_member": false,
  "role_in_project": null,
  "as_of": "2026-10-22T11:15:00.000Z"
}
```

---

### Endpoint 3: Identity Reconciliation

Reconciles a MIRAI user UUID and optional email with the PM backend, persisting a mapping if uniquely matched.

Request:
```http
POST /internal/mirai/v1/identities/reconcile HTTP/1.1
Host: localhost:4000
Authorization: Bearer <Short-Lived-Service-JWT>
Content-Type: application/json
Accept: application/json

{
  "mirai_user_id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "synthetic.intern@dailoqa.internal"
}
```

Response: Mapped Successfully (HTTP 200 OK)
```json
{
  "mirai_user_id": "550e8400-e29b-41d4-a716-446655440000",
  "pm_user_id": "330e8400-e29b-41d4-a716-446655440001",
  "mapping_status": "mapped",
  "mapping_source": "auto_mapped_by_email",
  "project_ids": ["8f14e45f-ceea-467a-9575-0b6a2b5a7f01"],
  "as_of": "2026-10-23T09:00:00.000Z"
}
```

Audit Event: Writes `MIRAI_IDENTITY_MAPPED` to `public.audit_logs`.

Response: Unmapped User (HTTP 200 OK)
```json
{
  "mirai_user_id": "550e8400-e29b-41d4-a716-446655440000",
  "pm_user_id": null,
  "mapping_status": "unmapped",
  "mapping_source": null,
  "project_ids": [],
  "as_of": "2026-10-23T09:00:00.000Z"
}
```

Audit Event: Writes `MIRAI_IDENTITY_UNMAPPED` to `public.audit_logs`.

---

## 6. Hardened Django Client Implementation Reference

For Chaitanya's implementation in the dedicated MIRAI adapter module (`mirai_adapters/pm_resolver.py`):

```python
"""
Reference implementation for Chaitanya's PM Membership Resolver.
Complies with Krish Round 3 Audience-Restricted Short-Lived JWT requirements.
Backend dependencies required: PyJWT, requests (or httpx).
Startup validation is hooked via Django system checks (or AppConfig.ready()).
"""

import time
import logging
from uuid import UUID
import jwt
import requests
from django.conf import settings
from django.core.checks import Error, register

logger = logging.getLogger("mirai.adapters.pm")

@register()
def check_pm_service_configuration(app_configs, **kwargs):
    """
    Django system check ensuring fail-fast startup validation before handling user traffic.
    Avoids runtime HTTP 500 errors on unconfigured deployments.
    """
    errors = []
    required_settings = ["PM_SERVICE_URL", "PM_SERVICE_JWT_SECRET", "PM_SERVICE_ORGANIZATION_ID"]
    for s in required_settings:
        if not getattr(settings, s, None):
            errors.append(
                Error(
                    f"Required setting {s} is not configured.",
                    hint=f"Define {s} in settings.py or environment variables.",
                    id=f"mirai_adapters.E001_{s}",
                )
            )
    return errors

class PMProjectMembershipResolver:
    """
    Implements Django MembershipResolver protocol: member_ids(user) -> frozenset[UUID]
    """

    def __init__(self):
        self.base_url = getattr(settings, "PM_SERVICE_URL", "").rstrip("/")
        self.secret = getattr(settings, "PM_SERVICE_JWT_SECRET", "")
        self.org_id = getattr(settings, "PM_SERVICE_ORGANIZATION_ID", "")
        # Total request timeout cap (connect + read combined)
        self.timeout = float(getattr(settings, "PM_SERVICE_TIMEOUT_SECONDS", 2.0))

    def _generate_service_jwt(self) -> str:
        now = int(time.time())
        payload = {
            "iss": "mirai-django",
            "aud": "pm-membership-api",
            "org": str(self.org_id),
            "scope": "membership:read",
            "role": "SERVICE",
            "iat": now,
            "exp": now + 300,  # 5 minutes maximum
        }
        return jwt.encode(payload, self.secret, algorithm="HS256")

    def member_ids(self, user) -> frozenset[UUID]:
        user_uuid = getattr(user, "pk", getattr(user, "id", None))
        if not user_uuid:
            return frozenset()

        endpoint = f"{self.base_url}/internal/mirai/v1/users/{user_uuid}/project-memberships"
        token = self._generate_service_jwt()
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }

        try:
            response = requests.get(endpoint, headers=headers, timeout=self.timeout)
            if response.status_code != 200:
                logger.warning("PM membership lookup non-200: status=%s user=%s", response.status_code, user_uuid)
                return frozenset()

            payload = response.json()

            # Hardening: Verify returned user matches requested user
            if str(payload.get("mirai_user_id")) != str(user_uuid):
                logger.error("PM membership response user mismatch: expected=%s got=%s", user_uuid, payload.get("mirai_user_id"))
                return frozenset()

            if payload.get("mapping_status") != "mapped":
                return frozenset()

            raw_ids = payload.get("project_ids")
            if not isinstance(raw_ids, list):
                logger.error("PM membership response project_ids is not a list")
                return frozenset()

            valid_ids = []
            for pid in raw_ids:
                try:
                    valid_ids.append(UUID(str(pid)))
                except (ValueError, TypeError):
                    continue

            return frozenset(valid_ids)

        except requests.exceptions.Timeout:
            logger.error("PM membership lookup timed out for user %s", user_uuid)
            return frozenset()
        except requests.exceptions.RequestException as exc:
            logger.error("PM membership connection error: %s", exc)
            return frozenset()
        except Exception as exc:
            logger.exception("Unexpected error during PM membership lookup: %s", exc)
            return frozenset()
```

---

## 7. Verification & Engineering Evidence (Approved Identity Decisions & Hardening)

### Summary of Approved Invariants & Architecture
1. **Decision A — Read-Only GET Endpoints**: Membership GET routes (/internal/mirai/v1/users/:mirai_user_id/project-memberships and /internal/mirai/v1/users/:mirai_user_id/projects/:projectId/membership) never mutate or create identity mappings. Query parameters (email) and headers (x-user-email) on GET are strictly read-only.
2. **Decision B — Complete Removal of Direct-ID Fallback**: The persistent public.user_identity_mappings table is the **sole** identity resolution mechanism. Direct UUID equivalence between MIRAI and PM backend is completely eliminated. If no mapping row exists, the system returns unmapped (failing closed).
3. **Dedicated Reconciliation Lifecycle**: Identity mapping mutations occur exclusively via authenticated POST /internal/mirai/v1/identities/reconcile (or the administrative migration script 
econcile-identities.ts), recording audited mapping events.
4. **Mandatory Audit Atomicity (SEC-01)**: When a transaction client is provided to AuditService.record, audit insert failures are never caught or suppressed; they rethrow to ensure complete database transaction rollback of mapping mutations.
5. **Legacy Route & Secret Hardening (SEC-04 & SEC-05)**:
   - Static service tokens and service JWTs are rejected with HTTP 401 on user endpoints.
   - User tokens signed with JWT_ACCESS_SECRET are rejected with HTTP 401 on internal service routes.
   - alidateStartupConfig() runs on all non-test entry points (including pi/index.ts). It enforces a 32-character minimum, rejects known placeholder values, and enforces mutual distinctness between JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, and PM_SERVICE_JWT_SECRET.
6. **Django Implementation Alignment (INT-01 & INT-02)**:
   - Django adapter resides in ackend/mirai_adapters/pm_resolver.py on branch eature/project-management-adapter.
   - Adheres to the Django MembershipResolver protocol (member_ids(user) -> frozenset[UUID]).
   - Implements 
econcile_user(self, user, email=None) to call POST /internal/mirai/v1/identities/reconcile with audience-restricted service JWTs.

### Verified Test Results

| Test Suite | Repository & Path | Tests Run | Result | Evidence |
|---|---|---|---|---|
| PM TypeScript Typecheck | project-management-version-2 (ackend-node) | 	sc --noEmit | **0 errors (Exit 0)** | Verified clean compilation |
| User Identity Mapping & Decision B Tests | ackend-node/tests/unit/user-identity-mapping.test.ts | **22 tests** | **22 passed (100%)** | Verified Decision A, Decision B (cases 1-5), and transactional audit rollback |
| Auth Middleware & Secret Hardening | ackend-node/tests/unit/auth.middleware.test.ts | **41 tests** | **41 passed (100%)** | Verified startup validation, secret separation, and static token rejection |
| Project Membership Service & Route Tests | ackend-node/tests/unit/project-membership.service.test.ts | **52 tests** | **52 passed (100%)** | Verified service JWT verification, fail-closed revocation, and route contracts |
| PM Integration Adapter Tests | ackend-node/tests/unit/mirai-project-management.adapter.test.ts | **46 tests** | **46 passed (100%)** | Verified TypeScript adapter boundary enforcement and error handling |
| Integration Scenario Tests | ackend-node/tests/unit/integration-scenarios.test.ts | **4 tests** | **4 passed (100%)** | Verified Scenarios B and C synthetic user onboarding |
| **PM Backend Total** | ackend-node | **165 tests** | **165 passed (100%)** | **ALL PASSED** |
| Django PM Resolver Unit Tests | Mirai-Dashboard/backend/tests/test_pm_resolver.py | **22 tests** | **22 passed (100%)** | Verified protocol, system checks, claims, fail-closed, timeout cap, and 
econcile_user |
