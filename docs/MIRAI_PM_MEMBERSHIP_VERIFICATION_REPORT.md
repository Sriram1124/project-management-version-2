# MIRAI Project Management Membership Integration: Final Verification Report

Status: Verified and Ready for Django Resolver Integration  
Author: Kompella Sriram Naveen (Backend Integration Engineer & Identity Owner)  
Date: October 22, 2026  
Target Systems: 
- Project Management Service (`Sriram1124/project-management-version-2`, Node.js/Prisma, Port 4000)
- MIRAI Core Dashboard (`krisshhjain/Mirai-Dashboard`, Django/React, Port 8000)

---

## 1. Executive Summary

This report documents the completion, validation, and empirical testing of the Project Management (PM) membership verification integration with MIRAI.

Krish Jain has approved Option A as the core architectural pattern:
- Frontend Communication: React frontend communicates exclusively with Django over port 8000 using standard session cookies and CSRF protection.
- Service Communication: Django connects directly to the Node.js PM service on port 4000 backend-to-backend using a short-lived, audience-restricted M2M Service JWT.
- Zero Direct Exposure: The Node.js PM service port 4000 is never exposed to browser CORS or user session cookies.

All core invariants, automated unit tests, negative revocation tests, and manual database-backed execution tests have completed with 100% pass rates.

---

## 2. Git References & Commits

### Project Management Repository (`Sriram1124/project-management-version-2`)
- Branch: `feature/mirai-project-membership`
- Core Implementation Commit: [`49fb2a8`](https://github.com/Sriram1124/project-management-version-2/commit/49fb2a8)
  - `backend-node/src/routes/internal-mirai.routes.ts`: Live `/internal/mirai/v1` routes.
  - `backend-node/src/middleware/auth.middleware.ts`: M2M Service JWT authentication and tenant claim extraction.
  - `backend-node/src/services/project.service.ts`: Authoritative queries on `public.project_members`.
- Negative Tests Commit: [`1d16534`](https://github.com/Sriram1124/project-management-version-2/commit/1d16534)
  - `backend-node/tests/unit/project-membership.service.test.ts`: Explicit negative tests for membership removal and access revocation.
- Verification Script Commit: [`08140af`](https://github.com/Sriram1124/project-management-version-2/commit/08140af)
  - `backend-node/scripts/manual-test-mirai.ts`: Live database testing suite.

### MIRAI Core Repository (`krisshhjain/Mirai-Dashboard`)
- Branch: `feature/project-management-adapter`
- Specification Commit: `42d80f3`
  - `docs/MIRAI_PM_MEMBERSHIP_FINAL_SPECIFICATION.md`: Final specification addressing Krish Round 3 requirements and linking PM implementation commits.
- Adapter Implementation Commit: `85c2d48`
  - `src/services/mirai-adapter/`: Complete TypeScript adapter and test suite.

---

## 3. Core Architectural Invariants Verified

### Invariant 1: Canonical Django Identity
- Django is the authoritative Identity Provider (IdP).
- Both systems store RFC 4122 v4 UUID strings as `TEXT` in `users.id`.
- Zero runtime ID translation overhead is required (`mirai_user_id == pm_user_id`).
- Persistent database mapping options documented for administrative auditability.

### Invariant 2: Membership Exclusivity in `project_members`
- Membership is governed strictly by the presence of a row in `public.project_members`.
- Task assignments (`work_item_assignees`) and project ownership (`projects.owner_id`) do not confer project membership.
- Preserves historical task burndown records even when an intern or member is removed from a project.

### Invariant 3: View-Only Scope
- Endpoints are authorized under `scope: membership:read`.
- Endpoints return boolean visibility flags and project ID lists only.
- The adapter does not provide write, update, or delete capabilities on project resources.

### Invariant 4: Machine-to-Machine Service JWT
- Short-lived token expiry (<= 5 minutes / 300 seconds).
- Mandatory token claims:
  - `iss: "mirai-django"`
  - `aud: "pm-membership-api"`
  - `scope: "membership:read"`
  - `org`: Active organization UUID
- Organization is extracted strictly from the JWT payload (`payload.org`).
- Static tokens and fallback headers (`X-Organization-Id`) are rejected in production.
- Fast-fail startup validation throws exceptions if secrets or endpoints are unconfigured.

### Invariant 5: Fail-Closed Security & Access Revocation
- Any token error (expired, wrong issuer, wrong audience, missing scope) returns HTTP 401/403.
- Network timeouts (capped at 2000ms), circuit breaker trips, or upstream errors evaluate to `false` or empty array `[]`.
- Deleting a user row from `project_members` immediately revokes visibility across all endpoints.

---

## 4. Test Execution Evidence

### Automated Unit & Integration Suite
- File: `backend-node/tests/unit/project-membership.service.test.ts`
- Total Tests: 37 passing / 0 failing
- Highlights:
  - `should return is_member: true with role for an existing project member in project_members` -> PASS
  - `should return is_member: false for a user who has task assignments but NO entry in project_members` -> PASS
  - `should return is_member: false for a project owner who is NOT in project_members` -> PASS
  - `negative test: should demonstrate that a removed project member loses access immediately (is_member: false)` -> PASS
  - `negative test: should exclude project from list immediately when user membership is removed` -> PASS
  - `should reject invalid service token with 401 Unauthorized` -> PASS
  - `should reject service token with wrong audience with 401` -> PASS

### Live Manual Database Verification
- Execution Command: `npx tsx scripts/manual-test-mirai.ts`
- Environment Context:
  - Organization ID: `3f320c6f-3a45-44fc-a63c-971b5690262b` (Dailoqa Solutions)
  - Active Member User: `15deb739-1d20-493e-bd9e-dd8c25da6fdf` (`krish.jain@dailoqa.com`)
  - Target Project: `694e78dc-dbec-4a58-beef-8e45eb7d9dd5` (`Mirai Dashboard`)
  - Non-Member User: `e8a09f29-af21-451b-9fc4-fa7095d75e2f` (`lead@dailoqa.com`)

```
======================================================
   MANUAL VERIFICATION: MIRAI /internal/mirai/v1 API  
======================================================

▶ TEST 1: GET /internal/mirai/v1/users/:userId/project-memberships
Status: 200 OK
Response:
{
  "mirai_user_id": "15deb739-1d20-493e-bd9e-dd8c25da6fdf",
  "mapping_status": "mapped",
  "project_ids": [
    "694e78dc-dbec-4a58-beef-8e45eb7d9dd5",
    "86928ea7-81d7-470d-81aa-828ed350f7b8"
  ],
  "as_of": "2026-10-22T14:34:37.651Z"
}
Result: PASS (Mapped memberships retrieved)

▶ TEST 2: GET /internal/mirai/v1/users/:userId/projects/:projectId/membership (Positive)
Status: 200 OK
Response:
{
  "mirai_user_id": "15deb739-1d20-493e-bd9e-dd8c25da6fdf",
  "project_id": "694e78dc-dbec-4a58-beef-8e45eb7d9dd5",
  "mapping_status": "mapped",
  "is_member": true,
  "role_in_project": "TECH_LEAD",
  "as_of": "2026-10-22T14:34:38.257Z"
}
Result: PASS (Active membership and role confirmed)

▶ TEST 3: Negative Test - Non-Member / Revoked Member Check
Status: 200 OK
Response:
{
  "mirai_user_id": "e8a09f29-af21-451b-9fc4-fa7095d75e2f",
  "project_id": "694e78dc-dbec-4a58-beef-8e45eb7d9dd5",
  "mapping_status": "mapped",
  "is_member": false,
  "role_in_project": null,
  "as_of": "2026-10-22T14:34:38.918Z"
}
Result: PASS (Immediate access denial confirmed)

▶ TEST 4: Security Test - Missing Authorization Header
Status: 401 Unauthorized
Response:
{
  "error": "Missing or invalid authorization header"
}
Result: PASS (Strict authentication boundary enforced)

▶ TEST 5: Security Test - Wrong Audience in Token
Status: 401 Unauthorized
Response:
{
  "error": "Invalid token audience: expected pm-membership-api"
}
Result: PASS (Audience-restriction verified)

======================================================
         ALL MANUAL VERIFICATIONS COMPLETE            
======================================================
```

---

## 5. Next Steps & Responsibilities

1. Repository Visibility: Sriram has confirmed public/collaborator visibility for `Sriram1124/project-management-version-2` to allow Anant and Krish direct review of commits.
2. Branch Status: Branches `feature/mirai-project-membership` (PM repo) and `feature/project-management-adapter` (MIRAI repo) will remain on their respective branches until combined review sign-off.
3. Django Resolver Authoring: Chaitanya (`Jangeti Chaithanya Sai`) can now pull `feature/project-management-adapter` on `krisshhjain/Mirai-Dashboard` and implement the Django-side HTTP client resolver plugin in its own module outside `accounts/rbac/`.
4. Architectural Review: Anant Sharma will review Chaitanya's Django resolver against the RBAC interface before the final merge into `main`.

