# Project Management Membership Contract & Identity Resolution

**Document Status:** FINAL / SIGNED OFF BY PM OWNER  
**Author:** Kompella Sriram Naveen (Identity Mapping & PM Backend Lead)  
**Co-Owner / Integration Adapter:** Jangeti Chaithanya Sai  
**Target Reviewers:** Krish Jain, MIRAI Django RBAC Team, Frontend Engineering  
**PR Reference:** Follows [Mirai-Dashboard PR #15](https://github.com/krisshhjain/Mirai-Dashboard/pull/15) (`docs/architecture/pm-membership-contract.md`)  
**Date:** 22 October 2026  

---

## 1. Executive Summary

This document provides the definitive resolution to the **Project Management (PM) membership contract**, resolves all 7 open questions from `pm-membership-contract.md`, establishes the identity mapping rules, specifies the live internal service endpoints, and supplies the drop-in Django membership resolver for `backend/accounts/rbac/scope.py`.

### Core Architectural Decisions
1. **Frontend Architecture (Option A Approved):**  
   The frontend communicates **only** with the Django backend on port 8000 (`/api/v1`) using existing session cookies + CSRF tokens. The frontend does **not** call port 4000 directly and does not manage Node.js JWT tokens.
2. **Backend-to-Backend Resolution:**  
   Django enforces the approved 6-persona RBAC rules (`projects.view`) and intersects them with actual project memberships retrieved from the PM service over a protected Machine-to-Machine (M2M) channel.
3. **Authoritative Gatekeeper (`public.project_members`):**  
   `public.project_members` is the sole source of truth for project membership. Task assignment or past project ownership never confers membership.
4. **Fail-Closed by Default:**  
   All timeouts, 401/403/500 errors, network failures, and unmapped users return `frozenset()` / `is_member: false`.

---

## 2. Answers to the 7 Open Questions from PR #15

### Q1: Membership Criteria & Statuses
> *What counts as a "verified member or assigned participant" in PM (statuses, invitations, ended memberships)? Should `project_ids` include archived projects?*

**Resolution:**
- **Active Membership:** An intern is a member if and only if an active record exists in `public.project_members(project_id, user_id)`.
- **Invitations / Pending:** Pending invitations or draft invitations are **not** stored in `project_members` and do **not** grant visibility.
- **Removed Members:** When an intern is removed from a project, their row in `public.project_members` is immediately deleted via `DELETE FROM project_members WHERE project_id = $1 AND user_id = $2`. Access is revoked immediately.
- **Archived Projects:** `project_ids` **includes** archived projects where the intern was a verified member, preserving read-only portfolio and historical access unless explicitly unassigned by a manager.

---

### Q2: User Identity Mapping & Merged/Deleted Users
> *Where does the MIRAI UUID → PM user mapping live and who maintains it? What happens when a PM user is merged or deleted?*

**Resolution:**
- **Canonical UUID `TEXT` Invariant:** Both MIRAI and the PM service use PostgreSQL UUID strings (RFC 4122 v4). By default, **`mirai_user_id == pm_user_id`** (1:1 Direct Federation). No heuristic email or name matching is performed.
- **Override Registry:** If an account was provisioned under a differing UUID, the adapter maintains an explicit override mapping table (`MiraiIdentityMapper.registerUserOverride(sourceUserId, canonicalUserId, orgId)`).
- **Deleted / Merged Users:** If a user is deleted from PM, `getUserProjectMemberships` returns `mapping_status: "unmapped"` and `project_ids: []`. Django safely treats this as `frozenset()` (fail closed).

---

### Q3: Project Identity Mapping
> *Are PM project ids already the ids MIRAI will store, or does the adapter translate?*

**Resolution:**
- **1:1 Identical:** In `backend-node/prisma/schema.prisma` (`model Project`), project IDs are primary key RFC 4122 v4 UUID strings stored as `TEXT`.
- There is no secondary internal integer ID. The `project_id` UUID stored in PM is identical to the `project_id` UUID stored and exposed in MIRAI URLs. No translation layer is needed.

---

### Q4: Dedicated Internal Route vs. Existing API
> *Separate internal endpoint as above, or part of the existing project-management API under a service-only route?*

**Resolution:**
- **Dedicated Internal Routes Active:** We have implemented the exact dedicated endpoints specified in the contract under `{PM_BASE}/internal/mirai/v1`:
  - `GET /internal/mirai/v1/users/:mirai_user_id/project-memberships`
  - `GET /internal/mirai/v1/users/:mirai_user_id/projects/:project_id/membership`
- This keeps internal service-to-service traffic completely decoupled from interactive browser routes.

---

### Q5: Service Authentication Token & Key Rotation
> *Token format and issuer: signed JWT from Django with a shared secret, asymmetric keys, or an identity provider? Who rotates keys?*

**Resolution:**
- Both methods are implemented and supported in Node.js PM middleware:
  - **Option 1 (Pre-shared Token — Recommended for immediate deployment):**
    ```http
    Authorization: Bearer <PROJECT_MANAGEMENT_SERVICE_TOKEN>
    X-Organization-Id: <organization-uuid>
    ```
  - **Option 2 (Service JWT — Supported):**  
    HS256 signed JWT with claims:
    ```json
    {
      "role": "SERVICE",
      "type": "service",
      "service": "mirai-django-core",
      "organizationId": "<organization-uuid>",
      "exp": 1792680000
    }
    ```
- Service credentials grant least-privilege `SERVICE` principal credentials (`PROJECT_READ`, `USER_READ`) and strictly block mutation endpoints (`POST`, `PUT`, `DELETE`).
- **Key Rotation:** Managed via environment variables in the infrastructure secret store (AWS Secrets Manager / Vault / Docker secrets).

---

### Q6: Caching & Freshness TTL
> *Acceptable timeout and cross-request cache TTL?*

**Resolution:**
- **Timeout:** 2.0 seconds (hard timeout in Django HTTP client).
- **Per-request Cache:** Handled automatically by Django's `cache` dictionary in `build_record_scope()`.
- **Cross-request Cache TTL:** Recommended **30 to 60 seconds** in Redis. When an intern is removed from a project, access revokes within at most 60 seconds.
- Every response includes `as_of: "<ISO-8601-TIMESTAMP>"` for cache invalidation audits.

---

### Q7: Persona Reach & Staff Scope
> *Do staff personas ever need PM membership, or only interns?*

**Resolution:**
- **Interns Only:** Membership resolution only widens `Scope.OWN` (`Capability.PROJECTS_VIEW`).
- **Staff Personas:** Functional Admins, Japanese Teachers, and Technical Admins access projects via their `ASSIGNED` cohorts or `ALL` scope in the approved matrix. PM membership lookup is bypassed for staff personas whose reach is already `ASSIGNED` or `ALL`.

---

## 3. Database Invariants: Why Task Assignment $\neq$ Membership

```
                ┌───────────────────────────────────┐
                │      public.project_members       │
                │  (The SOLE Membership Authority)  │
                └─────────────────┬─────────────────┘
                                  │
                  ┌───────────────┴───────────────┐
                  ▼                               ▼
       [ Active Intern Member ]        [ Removed Intern Member ]
       - Row exists in table           - Row deleted from table
       - is_member: true               - is_member: false
       - Appears in project_ids        - Returns empty project_ids
                                                  │
                                                  ▼
                                      [ Historical Work Items ]
                                      - Tasks in work_items remain
                                      - Assignee IDs in work_item_assignees
                                        remain intact for burndown & velocity
                                      - BUT membership check returns FALSE
```

1. In `public.work_item_assignees`, assignees link directly to `users.id`.
2. When a manager removes an intern from a project:
   - `prisma.projectMember.deleteMany` removes their membership.
   - Their past completed work items are **retained** to prevent corrupting historical sprint velocity, burn-down metrics, and commit logs.
3. If Django inferred membership from task assignments, removed interns would retain lingering visibility indefinitely.
4. **Rule:** A user is a project member if and only if they exist in `public.project_members`.

---

## 4. Live API Specifications

Base URL: `{PM_BASE}/internal/mirai/v1` (Port 4000)

### Endpoint 1: List User's Project Memberships
```http
GET /internal/mirai/v1/users/{mirai_user_id}/project-memberships HTTP/1.1
Host: localhost:4000
Authorization: Bearer <PROJECT_MANAGEMENT_SERVICE_TOKEN>
X-Organization-Id: 00000000-0000-0000-0000-000000000001
Accept: application/json
```

#### Response: Mapped Active Member (HTTP 200 OK)
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

#### Response: Unmapped or Non-existent User (HTTP 200 OK)
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
```http
GET /internal/mirai/v1/users/{mirai_user_id}/projects/{project_id}/membership HTTP/1.1
Host: localhost:4000
Authorization: Bearer <PROJECT_MANAGEMENT_SERVICE_TOKEN>
X-Organization-Id: 00000000-0000-0000-0000-000000000001
Accept: application/json
```

#### Response: Verified Member (HTTP 200 OK)
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

#### Response: Non-Member or Unmapped (HTTP 200 OK)
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

## 5. Drop-in Django Resolver Implementation

This Python class conforms to Django's `MembershipResolver` protocol defined in [`backend/accounts/rbac/scope.py`](file:///C:/Users/srira/Desktop/Mirai-Dashboard/backend/accounts/rbac/scope.py#L40-L60).

Create this file at `backend/accounts/rbac/adapters.py` in the Django repository:

```python
"""
Project Management Membership Resolver for MIRAI RBAC Scope.
Connects Django RBAC to Node.js PM service.
Author: Kompella Sriram Naveen
"""

import os
import logging
from uuid import UUID
import requests
from django.conf import settings

logger = logging.getLogger("accounts.rbac.pm_adapter")

class PMProjectMembershipResolver:
    """
    Plugs into MIRAI_RBAC_MEMBERSHIP_RESOLVERS["project"].
    Implements: member_ids(user) -> frozenset[UUID]
    """

    def __init__(self):
        self.base_url = getattr(
            settings,
            "PM_SERVICE_URL",
            os.getenv("PM_SERVICE_URL", "http://localhost:4000"),
        ).rstrip("/")
        self.service_token = getattr(
            settings,
            "PM_SERVICE_TOKEN",
            os.getenv("PROJECT_MANAGEMENT_SERVICE_TOKEN", ""),
        )
        self.organization_id = getattr(
            settings,
            "PM_SERVICE_ORGANIZATION_ID",
            os.getenv("PM_SERVICE_ORGANIZATION_ID", "00000000-0000-0000-0000-000000000001"),
        )
        self.timeout_seconds = getattr(settings, "PM_SERVICE_TIMEOUT_SECONDS", 2.0)

    def member_ids(self, user) -> frozenset[UUID]:
        """
        Retrieves verified active project IDs for a MIRAI user.
        Fails closed (returns empty frozenset) on any error.
        """
        user_uuid = getattr(user, "pk", getattr(user, "id", None))
        if not user_uuid:
            return frozenset()

        endpoint = f"{self.base_url}/internal/mirai/v1/users/{user_uuid}/project-memberships"
        headers = {
            "Authorization": f"Bearer {self.service_token}",
            "X-Organization-Id": str(self.organization_id),
            "Accept": "application/json",
        }

        try:
            response = requests.get(endpoint, headers=headers, timeout=self.timeout_seconds)
            if response.status_code != 200:
                logger.warning(
                    "PM membership lookup non-200: status=%s user=%s",
                    response.status_code,
                    user_uuid,
                )
                return frozenset()

            payload = response.json()
            if payload.get("mapping_status") != "mapped":
                return frozenset()

            raw_ids = payload.get("project_ids", [])
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

### Configuration in Django `settings.py`

```python
# MIRAI RBAC Membership Resolvers Configuration
MIRAI_RBAC_MEMBERSHIP_RESOLVERS = {
    "project": "accounts.rbac.adapters.PMProjectMembershipResolver",
}

# PM Service Configuration
PM_SERVICE_URL = os.getenv("PM_SERVICE_URL", "http://localhost:4000")
PM_SERVICE_TOKEN = os.getenv("PROJECT_MANAGEMENT_SERVICE_TOKEN", "your-shared-service-token")
PM_SERVICE_ORGANIZATION_ID = os.getenv("PM_SERVICE_ORGANIZATION_ID", "00000000-0000-0000-0000-000000000001")
PM_SERVICE_TIMEOUT_SECONDS = 2.0
```

---

## 6. Verification and Test Evidence

| Test Suite / Inspection | Scope | Result |
| :--- | :--- | :--- |
| **Prisma Schema** | `public.project_members`, `projects.id` UUID `TEXT` | **Verified** |
| **Route Implementation** | `GET /internal/mirai/v1/users/:id/project-memberships` | **Implemented & Tested** |
| **Single Check Route** | `GET /internal/mirai/v1/users/:id/projects/:id/membership` | **Implemented & Tested** |
| **M2M Authentication** | Pre-shared token & Service JWT with `SERVICE` role | **Implemented & Tested** |
| **Fail-Closed Boundary** | 401, 403, 404, 500, unmapped returns safe fallback | **Verified** |
| **TypeScript Build** | `npx tsc --noEmit` in `backend-node` | **0 errors (Exit code 0)** |



