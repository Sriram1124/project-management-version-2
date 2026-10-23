# PM Identity Mapping — Real HTTP End-to-End Verification Report

**Date:** 2026-10-23  
**Target Repository:** PM Backend (`C:\Users\srira\Desktop\intern_performance_dashboard`)  
**Branch:** `feature/mirai-project-membership`  
**Django Repository Status:** **Zero changes** (`C:\Users\srira\Desktop\Mirai-Dashboard` completely untouched)

---

## 1. Executive Summary & Verification Scope

This report documents the **real HTTP end-to-end verification** of the Project Management (PM) identity reconciliation and project membership endpoints:
- **`POST /internal/mirai/v1/identities/reconcile`**
- **`GET /internal/mirai/v1/users/:mirai_user_id/project-memberships`**

### Core Methodological Invariants
1. **Real HTTP Server & Network Socket:** The PM Express application was started on `http://127.0.0.1:3099`, and genuine HTTP requests were transmitted over the network interface. No mock routes, mock HTTP clients, or synthetic in-memory bypasses were used.
2. **Dedicated Isolated Database Engine:** The test was executed against `127.0.0.1:5432/pms_test_db` (PostgreSQL 16). Pre-flight checks strictly confirmed that the database target was `pms_test_db` before executing any query.
3. **No Production / Live Supabase Contamination:** Zero writes or test accounts were sent to Supabase (`aws-0-ap-south-1.pooler.supabase.com:6543`). The known production account (`K.Sriram Naveen` / `k.s.naveen@dailoqa.com`) was **never modified, mapped, or used for test traffic**.
4. **Direct PostgreSQL Persistence Evidence:** Persistence was independently verified by querying `user_identity_mappings` directly in PostgreSQL before and after the HTTP exchanges.

---

## 2. Environment & Database Target Verification

Pre-flight verification was performed by the runner before starting the test:

```text
[1. Database Connection Target Check]
Database Name: pms_test_db
Database Host: 127.0.0.1
Database Port: 5432
Database User: pms_user
Pool Mode:     direct
```

### Health Probe Verification
```http
GET http://127.0.0.1:3099/api/health
```
```json
{
  "status": "ok",
  "timestamp": "2026-10-23T04:59:38.023Z",
  "database": {
    "status": "connected",
    "configured": true,
    "host": "127.0.0.1",
    "port": 5432,
    "pool_mode": "direct",
    "pgbouncer": false,
    "connection_limit": 3,
    "pool_timeout": 30
  },
  "redis": {
    "configured": false,
    "connected": false,
    "url": "None (Synchronous Fallback Active)",
    "mode": "synchronous_fallback",
    "error": "REDIS_URL not configured"
  },
  "version": "1.0.0",
  "uptime": 4
}
```

---

## 3. Synthetic Fixtures (RFC 4122 v4 UUIDs)

All test entities used generated RFC 4122 v4 UUIDs to prevent any collision with real accounts:

| Entity | UUID / Identifier |
| :--- | :--- |
| **Disposable Organization ID** | `7539afc4-ab14-48fd-90b9-1c86d9c04b69` |
| **Synthetic Project ID** | `db2008e1-b294-4988-9603-84d4c6bf0b54` |
| **Synthetic PM User ID** | `ea3255e5-d1c2-4b94-aa93-d81228e5ea35` |
| **Synthetic PM User Email** | `synthetic.sriram.qa.1792731578042@example.internal` |
| **Synthetic MIRAI User ID** | `9c88cfc9-64f9-47cc-877b-412dfb48fe41` |

---

## 4. Scenario-by-Scenario Verification Results

### Scenario 1: Existing PM User — HTTP Reconcile & Persistence

#### 1. Initial HTTP Request
```http
POST http://127.0.0.1:3099/internal/mirai/v1/identities/reconcile
Authorization: Bearer <valid-m2m-service-jwt-redacted>
Content-Type: application/json

{
  "mirai_user_id": "9c88cfc9-64f9-47cc-877b-412dfb48fe41",
  "email": "synthetic.sriram.qa.1792731578042@example.internal"
}
```

#### 2. HTTP Response (Status 200 OK)
```json
{
  "mirai_user_id": "9c88cfc9-64f9-47cc-877b-412dfb48fe41",
  "pm_user_id": "ea3255e5-d1c2-4b94-aa93-d81228e5ea35",
  "mapping_status": "mapped",
  "mapping_source": "auto_mapped_by_email",
  "project_ids": [
    "db2008e1-b294-4988-9603-84d4c6bf0b54"
  ],
  "as_of": "2026-10-23T04:59:38.198Z"
}
```

#### 3. Direct PostgreSQL Row Verification
Queried `user_identity_mappings` directly in PostgreSQL immediately following the HTTP response:
```sql
SELECT id, organization_id, mirai_user_id, pm_user_id, created_at, updated_at
FROM user_identity_mappings
WHERE mirai_user_id = '9c88cfc9-64f9-47cc-877b-412dfb48fe41'
  AND organization_id = '7539afc4-ab14-48fd-90b9-1c86d9c04b69';
```
**Database Row Result:**
```json
{
  "id": "888a62e1-652c-4fb1-9620-c6af7de91564",
  "organization_id": "7539afc4-ab14-48fd-90b9-1c86d9c04b69",
  "mirai_user_id": "9c88cfc9-64f9-47cc-877b-412dfb48fe41",
  "pm_user_id": "ea3255e5-d1c2-4b94-aa93-d81228e5ea35",
  "created_at": "2026-10-23T04:59:38.216Z",
  "updated_at": "2026-10-23T04:59:38.216Z"
}
```
*Result:* **Verified.** The returned PM user UUID strictly matches the row persisted in PostgreSQL.

#### 4. Idempotency Verification (Repeat HTTP Request)
Sent the exact same HTTP request a second time:
```json
{
  "mirai_user_id": "9c88cfc9-64f9-47cc-877b-412dfb48fe41",
  "pm_user_id": "ea3255e5-d1c2-4b94-aa93-d81228e5ea35",
  "mapping_status": "mapped",
  "mapping_source": "existing_mapping",
  "project_ids": [
    "db2008e1-b294-4988-9603-84d4c6bf0b54"
  ],
  "as_of": "2026-10-23T04:59:38.247Z"
}
```
**Database Mapping Count Query:**
```sql
SELECT count(*) FROM user_identity_mappings WHERE organization_id = '7539afc4-ab14-48fd-90b9-1c86d9c04b69';
```
*Count:* **`1`** (No duplicate rows were created).

#### 5. Membership Resolution over HTTP
```http
GET http://127.0.0.1:3099/internal/mirai/v1/users/9c88cfc9-64f9-47cc-877b-412dfb48fe41/project-memberships
Authorization: Bearer <valid-m2m-service-jwt-redacted>
```
**HTTP 200 OK Response:**
```json
{
  "mirai_user_id": "9c88cfc9-64f9-47cc-877b-412dfb48fe41",
  "pm_user_id": "ea3255e5-d1c2-4b94-aa93-d81228e5ea35",
  "mapping_status": "mapped",
  "project_ids": [
    "db2008e1-b294-4988-9603-84d4c6bf0b54"
  ],
  "as_of": "2026-10-23T04:59:38.270Z"
}
```
*Result:* **Verified.** The membership endpoint cleanly resolved the persisted mapping and returned the active project memberships.

---

### Scenario 2: User Not Found over HTTP

#### HTTP Request
```http
POST http://127.0.0.1:3099/internal/mirai/v1/identities/reconcile
Authorization: Bearer <valid-m2m-service-jwt-redacted>

{
  "mirai_user_id": "e485147a-d471-422a-9b20-5b2361c57ca4",
  "email": "nonexistent.1792731578278@example.invalid"
}
```
#### HTTP Response (Status 200 OK)
```json
{
  "mirai_user_id": "e485147a-d471-422a-9b20-5b2361c57ca4",
  "pm_user_id": null,
  "mapping_status": "unmapped",
  "mapping_source": null,
  "project_ids": [],
  "as_of": "2026-10-23T04:59:38.296Z"
}
```
**Database Row Count Check:**
- Mapping count before: **1**
- Mapping count after: **1**
- New PM users created: **0** (No phantom accounts created).

---

### Scenario 3: Ambiguous Email over HTTP

Two synthetic PM users were created with identical normalized emails differing only by casing (`ambig.1792731578301@example.internal` and `AMBIG.1792731578301@EXAMPLE.INTERNAL`).

#### HTTP Request
```http
POST http://127.0.0.1:3099/internal/mirai/v1/identities/reconcile
Authorization: Bearer <valid-m2m-service-jwt-redacted>

{
  "mirai_user_id": "9290c3bb-bbc5-4fe0-badc-d839ac0aa0bf",
  "email": "ambig.1792731578301@example.internal"
}
```
#### HTTP Response (Status 200 OK)
```json
{
  "mirai_user_id": "9290c3bb-bbc5-4fe0-badc-d839ac0aa0bf",
  "pm_user_id": null,
  "mapping_status": "ambiguous",
  "mapping_source": null,
  "project_ids": [],
  "as_of": "2026-10-23T04:59:38.342Z"
}
```
**Database Row Count Check:**
- Mapping count before: **1**
- Mapping count after: **1**
- Neither user was mapped arbitrarily. Failed closed as required.

---

### Scenario 4: Invalid Organization Authorization over HTTP

Sent request with a service token signed with a random non-existent organization UUID (`crypto.randomUUID()`):

#### HTTP Response (Status 403 Forbidden)
```json
{
  "error": "Organization not found or inactive"
}
```
*Result:* **Verified.** Strict tenant boundary enforced.

---

### Scenario 5: Conflicting Identity Mapping over HTTP

A PM user (`78e04d3f-411c-4a40-8715-45c3d480e38c`) was already mapped to a different MIRAI user (`e6510ebe-581b-401a-bda5-c579aba188c7`). Reconciling a new MIRAI user (`0f0fbac7-ae4a-4197-835f-f044709f0be4`) against that email was tested:

#### HTTP Response (Status 200 OK)
```json
{
  "mirai_user_id": "0f0fbac7-ae4a-4197-835f-f044709f0be4",
  "pm_user_id": null,
  "mapping_status": "conflict",
  "mapping_source": null,
  "project_ids": [],
  "as_of": "2026-10-23T04:59:38.382Z"
}
```
*Result:* **Verified.** Conflict returned without overwriting or assigning multiple MIRAI identities to one PM user.

---

## 5. Direct PostgreSQL Table Dump Evidence

Direct query executed against `pms_test_db` before cleanup:
```sql
SELECT m.id, m.organization_id, m.mirai_user_id, m.pm_user_id, u.email, m.created_at
FROM user_identity_mappings m
JOIN users u ON m.pm_user_id = u.id
WHERE m.organization_id = '7539afc4-ab14-48fd-90b9-1c86d9c04b69'
ORDER BY m.created_at ASC;
```

**PostgreSQL Result:**
```text
┌─────────┬────────────────────────────────────────┬────────────────────────────────────────┬────────────────────────────────────────┬────────────────────────────────────────┬──────────────────────────────────────────────────────┬──────────────────────────┐
│ (index) │ id                                     │ organization_id                        │ mirai_user_id                          │ pm_user_id                             │ email                                                │ created_at               │
├─────────┼────────────────────────────────────────┼────────────────────────────────────────┼────────────────────────────────────────┼────────────────────────────────────────┼──────────────────────────────────────────────────────┼──────────────────────────┤
│ 0       │ '888a62e1-652c-4fb1-9620-c6af7de91564' │ '7539afc4-ab14-48fd-90b9-1c86d9c04b69' │ '9c88cfc9-64f9-47cc-877b-412dfb48fe41' │ 'ea3255e5-d1c2-4b94-aa93-d81228e5ea35' │ 'synthetic.sriram.qa.1792731578042@example.internal' │ 2026-10-23T04:59:38.216Z │
│ 1       │ '7cec013f-e7b7-47ab-9a5b-487621d8eafd' │ '7539afc4-ab14-48fd-90b9-1c86d9c04b69' │ 'e6510ebe-581b-401a-bda5-c579aba188c7' │ '78e04d3f-411c-4a40-8715-45c3d480e38c' │ 'conflict.1792731578362@example.internal'            │ 2026-10-23T04:59:38.375Z │
└─────────┴────────────────────────────────────────┴────────────────────────────────────────┴────────────────────────────────────────┴────────────────────────────────────────┴──────────────────────────────────────────────────────┴──────────────────────────┘
```

---

## 6. Teardown & Cleanup Verification

All synthetic records created during the run were removed:
```sql
DELETE FROM user_identity_mappings WHERE organization_id = '7539afc4-ab14-48fd-90b9-1c86d9c04b69';
DELETE FROM project_members WHERE project_id = 'db2008e1-b294-4988-9603-84d4c6bf0b54';
DELETE FROM projects WHERE organization_id = '7539afc4-ab14-48fd-90b9-1c86d9c04b69';
DELETE FROM users WHERE organization_id = '7539afc4-ab14-48fd-90b9-1c86d9c04b69';
DELETE FROM organizations WHERE id = '7539afc4-ab14-48fd-90b9-1c86d9c04b69';
```

**Post-Cleanup Verification Query:**
```sql
SELECT count(*) AS remaining_mappings FROM user_identity_mappings WHERE organization_id = '7539afc4-ab14-48fd-90b9-1c86d9c04b69';
SELECT count(*) AS remaining_users FROM users WHERE organization_id = '7539afc4-ab14-48fd-90b9-1c86d9c04b69';
SELECT count(*) AS remaining_orgs FROM organizations WHERE id = '7539afc4-ab14-48fd-90b9-1c86d9c04b69';
```
- `remaining_mappings`: **`0`**
- `remaining_users`: **`0`**
- `remaining_orgs`: **`0`**

---

## 7. Test Suite & Typecheck Status

### 1. TypeScript Compile Check
```powershell
npm run typecheck
```
**Result:** **Exit code 0. (0 errors).**

### 2. Relevant Unit and Scenario Test Suites
```powershell
npx jest tests/unit/user-identity-mapping.test.ts tests/unit/integration-scenarios.test.ts tests/unit/mirai-project-management.adapter.test.ts --runInBand
```
**Result:**
- `tests/unit/mirai-project-management.adapter.test.ts`: **33 passed (33 total)**
- `tests/unit/user-identity-mapping.test.ts`: **21 passed (21 total)**
- `tests/unit/integration-scenarios.test.ts`: **4 passed (4 total)**
- **Total Passing Tests:** **66 / 66 passed (100%)**

---

## 8. Final Git Status & Strict Boundaries Statement

### Git Status (`git status --short`)
```text
 M backend-node/package.json
 M backend-node/prisma/schema.prisma
 M backend-node/src/routes/internal-mirai.routes.ts
 M backend-node/src/services/project.service.ts
 M backend-node/tests/mocks/prisma.mock.ts
?? backend-node/prisma/migrations/20261023084000_add_user_identity_mappings/
?? backend-node/src/scripts/reconcile-identities.ts
?? backend-node/src/scripts/test-http-e2e.ts
?? backend-node/src/scripts/verify-reconciliation-e2e.ts
?? backend-node/tests/unit/integration-scenarios.test.ts
?? backend-node/tests/unit/user-identity-mapping.test.ts
?? PM_IDENTITY_MAPPING_HTTP_E2E_REPORT.md
```

### Confirmation of Non-Interference
- **MIRAI / Django Repository (`C:\Users\srira\Desktop\Mirai-Dashboard`):** **Zero changes made.** No Django files, migrations, settings, or tests were edited, committed, or deleted.
- **Production Supabase Database:** **Zero changes made.** All 92 existing users are untouched. No mapping records were created in Supabase.

