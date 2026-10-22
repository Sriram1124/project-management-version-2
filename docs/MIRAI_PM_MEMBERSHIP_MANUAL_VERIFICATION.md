# MIRAI PM Membership Manual Verification & Output Report

Date: October 22, 2026  
Author: Kompella Sriram Naveen (Backend Integration Engineer & Identity Owner)  
Branch: `feature/mirai-project-membership` (`Sriram1124/project-management-version-2`)  
Status: Verified & Approved under Option A Architecture

---

## 1. Architectural Invariants Confirmation

Option A is approved as the MIRAI integration architecture: the React frontend communicates only with Django through session authentication, while Django connects to Node PM using dedicated backend-to-backend credentials.

1. Canonical Identity: Django user UUID is the canonical identity. Both systems store RFC 4122 v4 UUID strings as `TEXT` in `users.id` with 1:1 parity and persistent database mapping.
2. Membership Source: Membership is determined strictly from `project_members`. Task assignments and project ownership do not confer membership.
3. Visibility Only: Membership grants read-only project visibility (`membership:read`). It does not grant editing or mutation rights.
4. Service Auth: Service authentication enforces a short-lived JWT (exp <= 5m) with strict validation of issuer (`mirai-django`), audience (`pm-membership-api`), scope (`membership:read`), and organization extracted from the token claim.
5. Fail-Closed: All mapping failures, token errors, timeouts, and unauthorized requests fail closed (returning 401/403 or resolving to `false` / empty list).
6. Membership Revocation: Removing a user from `project_members` immediately revokes their effective project visibility.

---

## 2. Execution Command

Run from `backend-node`:

```powershell
cd backend-node
npx tsx scripts/manual-test-mirai.ts
```

Script location: [`backend-node/scripts/manual-test-mirai.ts`](../backend-node/scripts/manual-test-mirai.ts)

---

## 3. Verbatim Execution Output

```text
PS C:\Users\srira\Desktop\intern_performance_dashboard\backend-node> npx tsx scripts/manual-test-mirai.ts
◇ injected env (0) from .env
     
======================================================
   MANUAL VERIFICATION: MIRAI /internal/mirai/v1 API  
======================================================

📋 Test Environment Context:
- Organization ID: 3f320c6f-3a45-44fc-a63c-971b5690262b (Dailoqa Solutions)
- Member User ID:  15deb739-1d20-493e-bd9e-dd8c25da6fdf (krish.jain@dailoqa.com)
- Project ID:      694e78dc-dbec-4a58-beef-8e45eb7d9dd5 (Mirai Dashboard)
- Non-Member User: e8a09f29-af21-451b-9fc4-fa7095d75e2f (lead@dailoqa.com)

🔑 Generated Valid M2M Service JWT:
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ...

▶ TEST 1: GET /internal/mirai/v1/users/:userId/project-memberships
[Timing] GET /internal/mirai/v1/users/15deb739-1d20-493e-bd9e-dd8c25da6fdf/project-memberships | 200 | total: 959.4ms | auth: 595.9ms (db: 0.0ms)
Status: 200
Response Body: {
  "mirai_user_id": "15deb739-1d20-493e-bd9e-dd8c25da6fdf",
  "mapping_status": "mapped",
  "project_ids": [
    "694e78dc-dbec-4a58-beef-8e45eb7d9dd5",
    "86928ea7-81d7-470d-81aa-828ed350f7b8"
  ],
  "as_of": "2026-10-22T14:34:37.651Z"
}
✅ PASS: Successfully returned mapped project memberships.

▶ TEST 2: GET /internal/mirai/v1/users/:userId/projects/:projectId/membership (Positive)
[Timing] GET /internal/mirai/v1/users/15deb739-1d20-493e-bd9e-dd8c25da6fdf/projects/694e78dc-dbec-4a58-beef-8e45eb7d9dd5/membership | 200 | total: 712.7ms | auth: 218.4ms (db: 0.0ms)
Status: 200
Response Body: {
  "mirai_user_id": "15deb739-1d20-493e-bd9e-dd8c25da6fdf",
  "project_id": "694e78dc-dbec-4a58-beef-8e45eb7d9dd5",
  "mapping_status": "mapped",
  "is_member": true,
  "role_in_project": "TECH_LEAD",
  "as_of": "2026-10-22T14:34:38.257Z"
}
✅ PASS: Successfully verified active project member.

▶ TEST 3: Negative Test - Non-Member / Revoked Member Check
[Timing] GET /internal/mirai/v1/users/e8a09f29-af21-451b-9fc4-fa7095d75e2f/projects/694e78dc-dbec-4a58-beef-8e45eb7d9dd5/membership | 200 | total: 641.8ms | auth: 161.3ms (db: 0.0ms)
Status: 200
Response Body: {
  "mirai_user_id": "e8a09f29-af21-451b-9fc4-fa7095d75e2f",
  "project_id": "694e78dc-dbec-4a58-beef-8e45eb7d9dd5",
  "mapping_status": "mapped",
  "is_member": false,
  "role_in_project": null,
  "as_of": "2026-10-22T14:34:38.918Z"
}
✅ PASS: Correctly returned is_member: false for non-member.

▶ TEST 4: Security Test - Missing Authorization Header
[Timing] GET /internal/mirai/v1/users/any-id/project-memberships | 401 | total: 0.5ms | auth: 0.0ms (db: 0.0ms)
Status: 401 (Expected: 401)
Response Body: {
  "error": "Missing or invalid authorization header"
}
✅ PASS: Rejected missing authorization with 401 Unauthorized.

▶ TEST 5: Security Test - Wrong Audience in Token
[Timing] GET /internal/mirai/v1/users/any-id/project-memberships | 401 | total: 1.0ms | auth: 0.3ms (db: 0.0ms)
Status: 401 (Expected: 401)
Response Body: {
  "error": "Invalid token audience: expected pm-membership-api"
}
✅ PASS: Rejected invalid audience with 401.

======================================================
         ALL MANUAL VERIFICATIONS COMPLETE            
======================================================
```

---

## 4. Coordination & Next Steps

1. Branches remain unmerged awaiting combined contract review.
2. Chaitanya (`Jangeti Chaithanya Sai`) will pull `feature/project-management-adapter` in `krisshhjain/Mirai-Dashboard` to author the Django resolver plugin outside `accounts/rbac/`.
3. Anant Sharma will review Chaitanya's Django resolver against the RBAC interface prior to merging into `main`.

