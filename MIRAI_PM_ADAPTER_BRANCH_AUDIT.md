# Audit of MIRAI–PM Integration & Adapter Branch Alignment

**Audit Date:** 2026-10-23  
**Audit Mode:** Strict Read-Only Audit  
**PM Repository:** `C:\Users\srira\Desktop\intern_performance_dashboard` (`Sriram1124/project-management-version-2`)  
**MIRAI Repository:** `C:\Users\srira\Desktop\Mirai-Dashboard` (`krisshhjain/Mirai-Dashboard`)  

---

## 1. Repository & Branch State Verification

### PM Backend Repository (`intern_performance_dashboard`)
- **Repository Root:** `C:/Users/srira/Desktop/intern_performance_dashboard`
- **Remote URL:** `https://github.com/Sriram1124/project-management-version-2.git` (`origin`)
- **Active Branch:** `feature/mirai-project-membership`
- **Latest Commit:** `cd1d147dee6e3137b93ccb6a1475bbc28e36d790`
  - *Subject:* `feat(identity-mapping): implement PM user identity mapping, reconciliation API, and HTTP E2E tests`
  - *Date:* Fri Oct 23 10:36:25 2026 +0530
- **Upstream Sync Status:** **Up to date** with `origin/feature/mirai-project-membership` (pushed).
- **Working Tree:** Clean (only untracked test/demo storage files preserved).

### MIRAI / Django Repository (`Mirai-Dashboard`)
- **Repository Root:** `C:/Users/srira/Desktop/Mirai-Dashboard`
- **Remote URL:** `https://github.com/krisshhjain/Mirai-Dashboard.git` (`origin`)
- **Active Checked-out Branch:** `feature/pm-membership-resolver`
- **Latest Commit on Active Branch:** `f309b02d457043ed7443e1e097b9370f390fba8d`
  - *Author:* J Chaitanya Sai
  - *Subject:* `fix(rbac-adapter): validate PM config via Django system checks and cap total timeout`
- **Working Tree Status:** **2 modified tracked files uncommitted**:
  - `M backend/mirai_adapters/pm_resolver.py`
  - `M backend/tests/test_pm_resolver.py`
  *(Contains working-tree additions for `reconcile_identity`, caching, and 5 unit tests; preserved untouched).*
- **Target Branch (`feature/project-management-adapter`):**
  - *Latest Commit:* `48d1fc1c77388768cd15839fc2ca27e6fb10bae1`
  - *Author:* Sriram
  - *Subject:* `docs(spec): document fail-fast startup check, total timeout cap, dependency agreement, and expanded security verification`
  - *Content:* Isolated TypeScript client adapter (`src/services/mirai-adapter/*`), adapter unit tests, and spec documents.

---

## 2. Audit of the Adapter Implementations

There are **two distinct adapter implementations** across the repositories:

### A. The Python/Django Adapter (`backend/mirai_adapters/pm_resolver.py` in `Mirai-Dashboard`)
This is the actual runtime resolver used by the MIRAI Django backend (`accounts.rbac.scope.MembershipResolver`).
1. **Service JWT Secret:** Uses `settings.PM_SERVICE_JWT_SECRET` via explicit Django system checks in `checks.py` (`E002`). Zero fallback secrets.
2. **Token Claims:** Mints `iss: "mirai-django"`, `aud: "pm-membership-api"`, `org: str(self.org_id)`, `scope: "membership:read"`, `role: "SERVICE"`, `exp: now + 300` (5 minutes). Exactly matches PM backend requirements.
3. **Reconciliation Calling:** Implements `reconcile_identity(user)` which calls `POST /internal/mirai/v1/identities/reconcile` with `{ mirai_user_id, email }`.
4. **Caching & Safety:** Caches membership results in-memory (`TTL 300s`) to avoid slamming PM on every page render. Fails closed on mismatch, timeout, transport error, unmapped, or conflict status.
5. **Test Coverage:** All 24/24 unit tests in `backend/tests/test_pm_resolver.py` pass.

### B. The TypeScript Adapter (`src/services/mirai-adapter/*` on `feature/project-management-adapter`)
This is a standalone TypeScript client package originally written by Sriram.
1. **Target Endpoints:** Currently calls `/projects/:id/members/:userId/check` and `/users/:userId/project-memberships`. It does **not** yet invoke the new `/internal/mirai/v1/identities/reconcile` endpoint.
2. **Auth Header:** Uses static token or pre-minted bearer token via `MiraiHttpClient`. It does not mint M2M service JWTs dynamically.
3. **Identity Mapper:** Uses in-memory override registry (`MiraiIdentityMapper`) rather than calling the PM reconciliation API.

---

## 3. Audit of the PM Backend Branch (`feature/mirai-project-membership`)

Commit **`cd1d147`** on `Sriram1124/project-management-version-2`:
1. **Authentication (`auth.middleware.ts`):**
   - Enforces dedicated `PM_SERVICE_JWT_SECRET`.
   - Requires `iss: 'mirai-django'`, `aud: 'pm-membership-api'`, `scope: 'membership:read'`, `exp <= 5m`.
   - Disables static service tokens for all internal routes (returns 401).
   - Ignores `X-Organization-Id` header and pulls tenant context strictly from verified JWT `payload.org`.
2. **Database Persistence (`schema.prisma` & migration `20261023084000_add_user_identity_mappings`):**
   - Defines `UserIdentityMapping` table with unique constraints on `mirai_user_id` and `pm_user_id`.
   - Verified live in PostgreSQL container `pms_postgres` (`pms_test_db`).
3. **Reconciliation Route (`internal-mirai.routes.ts`):**
   - `POST /internal/mirai/v1/identities/reconcile` resolves existing PM user by normalized email within tenant, persists mapping, and returns mapped project IDs.
   - Rejects ambiguous or conflicting users.
4. **Real HTTP E2E Verification:**
   - 100% verified over loopback HTTP socket (`test-http-e2e.ts`) on port 3099. Direct SQL queries confirmed row persistence and idempotency.
   - All 66 tests passing in PM backend.

---

## 4. Cross-Repository Compatibility Matrix

| Integration Point | MIRAI Django Adapter (`pm_resolver.py`) | PM Backend Expectation (`cd1d147`) | Match? | Line Evidence | Required Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Service JWT Secret** | `getattr(settings, "PM_SERVICE_JWT_SECRET")` | `getServiceJwtSecret()` (`PM_SERVICE_JWT_SECRET`) | **MATCH** | `pm_resolver.py#L41` / `auth.middleware.ts#L5` | None. Compatible. |
| **JWT Issuer (`iss`)** | `"mirai-django"` | `"mirai-django"` | **MATCH** | `pm_resolver.py#L79` / `auth.middleware.ts#L384` | None. Compatible. |
| **JWT Audience (`aud`)**| `"pm-membership-api"` | `"pm-membership-api"` | **MATCH** | `pm_resolver.py#L80` / `auth.middleware.ts#L385` | None. Compatible. |
| **JWT Scope (`scope`)** | `"membership:read"` | `"membership:read"` | **MATCH** | `pm_resolver.py#L82` / `auth.middleware.ts#L435` | None. Compatible. |
| **Tenant Claim (`org`)** | `"org": str(self.org_id)` | `payload.org` | **MATCH** | `pm_resolver.py#L81` / `auth.middleware.ts#L442` | None. Compatible. |
| **JWT Lifetime (`exp`)**| `now + 300` (5 minutes) | `exp - iat <= 300` | **MATCH** | `pm_resolver.py#L85` / `auth.middleware.ts#L421` | None. Compatible. |
| **Reconcile Endpoint** | `POST /internal/mirai/v1/identities/reconcile` | `POST /internal/mirai/v1/identities/reconcile` | **MATCH** | `pm_resolver.py#L99` / `internal-mirai.routes.ts#L22` | None. Compatible. |
| **Reconcile Payload** | `{"mirai_user_id": ..., "email": ...}` | `{mirai_user_id, email}` | **MATCH** | `pm_resolver.py#L111` / `internal-mirai.routes.ts#L25` | None. Compatible. |
| **Membership Endpoint** | `GET /internal/mirai/v1/users/{uuid}/project-memberships` | `GET /internal/mirai/v1/users/:mirai_user_id/project-memberships` | **MATCH** | `pm_resolver.py#L204` / `internal-mirai.routes.ts#L50` | None. Compatible. |
| **Inactive PM User** | Fails closed (empty set) on `mapping_status != "mapped"` | Returns `mapping_status: "unmapped"` for inactive PM user | **MATCH** | `pm_resolver.py#L186` / `project.service.ts#L1438` | None. Compatible. |
| **TypeScript Client** | `src/services/mirai-adapter/` on `feature/project-management-adapter` | Expects M2M JWT and calls `/internal/mirai/v1/...` | **MISMATCH** | `mirai-project-management.adapter.ts#L423` | Update TS adapter if Krish's frontend requires Node adapter. |

---

## 5. Classification of Changes & Branch Boundaries

### Category A: Push to MIRAI Repository (`krisshhjain/Mirai-Dashboard`)
These files belong to the MIRAI Django platform and should be committed/pushed to **`feature/pm-membership-resolver`** (or merged into `feature/project-management-adapter` if that is where Krish wants the resolver):
1. `backend/mirai_adapters/pm_resolver.py` (adds `reconcile_identity`, caching, and error handling)
2. `backend/tests/test_pm_resolver.py` (adds 5 new unit tests for reconciliation, cache, and timeout)
3. `docs/MIRAI_PM_MEMBERSHIP_FINAL_SPECIFICATION.md` (updated specification §7)

### Category B: Keep in PM Backend Repository (`Sriram1124/project-management-version-2`)
These files belong strictly to the PM Node.js backend. **They are already committed and pushed to `feature/mirai-project-membership` (`cd1d147`)**:
1. `backend-node/prisma/schema.prisma` (`UserIdentityMapping` model)
2. `backend-node/prisma/migrations/20261023084000_add_user_identity_mappings/` (DDL migration)
3. `backend-node/src/middleware/auth.middleware.ts` (service auth, `PM_SERVICE_JWT_SECRET`, claim checks)
4. `backend-node/src/routes/internal-mirai.routes.ts` (`/internal/mirai/v1/...` routes)
5. `backend-node/src/services/project.service.ts` (`reconcileIdentity` logic)
6. `backend-node/tests/unit/user-identity-mapping.test.ts` (21 unit tests)
7. `backend-node/tests/unit/integration-scenarios.test.ts` (4 integration tests)
8. `PM_IDENTITY_MAPPING_HTTP_E2E_REPORT.md` (E2E verification evidence)

### Category C: Do Not Push Yet
1. `backend-node/storage/projects/...` (demo PDFs and rollback test artifacts).
2. Any `.env` file or local credential.
3. Untracked temporary verification scripts (`test-http-e2e.ts`, `verify-reconciliation-e2e.ts`) unless formally reviewed for inclusion in PM scripts.

---

## 6. Recommended Git Execution Plan

When you are ready to proceed with committing the Django-side changes in `Mirai-Dashboard`:

### Step 1: Commit Django Changes on `feature/pm-membership-resolver` in `Mirai-Dashboard`
```powershell
cd C:\Users\srira\Desktop\Mirai-Dashboard
git status
git add backend/mirai_adapters/pm_resolver.py backend/tests/test_pm_resolver.py
git commit -m "feat(rbac-adapter): wire PM identity reconciliation and in-memory cache"
git push origin feature/pm-membership-resolver
```

### Step 2: Update `feature/project-management-adapter` (if Krish requires documentation / spec parity)
If Krish's PR is targeting `feature/project-management-adapter`, copy the updated `docs/MIRAI_PM_MEMBERSHIP_FINAL_SPECIFICATION.md` into that branch and commit it there.

---

## 7. Final Verdict

### **VERDICT: READY AFTER SPECIFIC FIXES (Clarification on Target Branch)**

1. **PM Backend Side:** **READY & FULLY PUSHED.** Commit **`cd1d147`** is live on `origin/feature/mirai-project-membership` and passes all 66 unit, scenario, and real HTTP E2E tests.
2. **MIRAI Django Side:** **READY FOR COMMIT & PUSH.** The working-tree modifications in `C:\Users\srira\Desktop\Mirai-Dashboard` (`pm_resolver.py` and `test_pm_resolver.py`) are fully passing (24/24 pytest passed), but remain **uncommitted on branch `feature/pm-membership-resolver`**.
3. **Reviewer Disconnect:** The reviewer was looking at `krisshhjain/Mirai-Dashboard/tree/feature/project-management-adapter` (where the TypeScript adapter sits at commit `48d1fc1`) and older PM backend commits (`49fb2a8`/`08140af`), rather than the latest PM backend commit (`cd1d147`) and Django resolver branch (`feature/pm-membership-resolver`).

