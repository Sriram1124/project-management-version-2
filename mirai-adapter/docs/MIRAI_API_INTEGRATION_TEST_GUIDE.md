# MIRAI Adapter — Upstream API Integration Testing Guide

**Author**: Sriram (Backend Integration Engineer)  
**Target Audience**: Integration Engineering & QA  
**Scope**: Verification of Deployed Project Management APIs (System A on Vercel) for the MIRAI Adapter  
**Date**: October 2026  
**Status**: Ready for Execution  

---

## 1. Overview & Purpose

This guide outlines how to execute the Postman API test suite to verify that the deployed **Project Management System (System A)** APIs are healthy, reachable, and strictly conform to the contracts expected by the **MIRAI Project Management Integration Adapter**.

### Test Suite Characteristics:
- **100% Read-Only**: Every request is an HTTP `GET`. No project, task, user, or organization records will be created, updated, or deleted.
- **Safety**: Safe to run against staging or production Vercel deployments.
- **Auto-Population**: Request `01.1` dynamically captures an existing `projectId` and `organizationId` into your Postman environment if not already specified.

---

## 2. Test Artifacts

Both files are located in the `postman/` directory:

1. **Collection**: [`postman/MIRAI_Project_Management_API_Tests.postman_collection.json`](file:///c:/Users/srira/Desktop/intern_performance_dashboard/postman/MIRAI_Project_Management_API_Tests.postman_collection.json)
2. **Environment Template**: [`postman/MIRAI_Project_Management_API_Tests.postman_environment.json`](file:///c:/Users/srira/Desktop/intern_performance_dashboard/postman/MIRAI_Project_Management_API_Tests.postman_environment.json)

---

## 3. Step-by-Step Postman Setup

### Step 1: Import Files into Postman
1. Open Postman.
2. Click the **Import** button (top-left).
3. Drag and drop both JSON files from `postman/`:
   - `MIRAI_Project_Management_API_Tests.postman_collection.json`
   - `MIRAI_Project_Management_API_Tests.postman_environment.json`
4. Confirm the import.

### Step 2: Configure Environment Variables
1. In Postman, select the environment dropdown in the top-right corner and choose **MIRAI Adapter - Project Management API Environment**.
2. Click the environment quick-look (eye icon) or navigate to **Environments** in the sidebar.
3. Configure the following variables:

| Variable | Description | Example Value |
|---|---|---|
| `baseUrl` | Deployed Vercel API base URL (must end with `/api`) | `https://your-deployment.vercel.app/api` |
| `token` | Valid Service Account or User Bearer JWT | `eyJhbGciOiJIUzI1NiIsIn...` |
| `projectId` | *(Optional)* Existing project UUID string | `123e4567-e89b-12d3-a456-426614174000` |
| `organizationId` | *(Optional)* Existing organization UUID string | `org-987a6543-e21b-12d3-a456-426614174000` |
| `cohortId` | *(Optional)* Existing cohort UUID string | `coh-555e4567-e89b-12d3-a456-426614174000` |
| `userId` | *(Optional)* Existing user UUID string | `usr-777e4567-e89b-12d3-a456-426614174000` |

> [!NOTE]
> If `projectId` or `organizationId` are left as placeholders, request `01.1 - List Projects` will automatically extract the first available project's identifiers and set them in your active environment for subsequent requests.

---

## 4. Test Suite Structure & Validation Scope

### Folder 01: Projects
- **`01.1 - List Projects (All / Default)`**:
  - Validates `HTTP 200` and `{ projects: [...] }` response structure.
  - Checks for required attributes: `id`, `name`, `status`, `methodology`, `organization_id`, `owner_id`.
  - Captures `projectId` and `organizationId` into environment.
- **`01.2 - List Projects (Filtered by Status=ACTIVE)`**:
  - Validates query param `status=ACTIVE`. Confirms all returned items match the filter.
- **`01.3 - List Projects (My Projects Filter)`**:
  - Validates query param `my=true` used by the Intern Dashboard.
- **`01.4 - Get Project Details by ID`**:
  - Validates `GET /projects/:id`. Confirms `id` is a UUID string and matches the requested project.

### Folder 02: Work Items
- **`02.1 - List Project Work Items`**:
  - Validates `GET /work-items?project_id={{projectId}}`.
  - Confirms work items contain `id`, `title`, `type`, `status`, `priority`, and correct `project_id` association.
- **`02.2 - List Work Items (Filtered by Type=TASK)`**:
  - Validates `type=TASK` filtering across the Jira hierarchy.
- **`02.3 - List Work Items (Filtered by Status=TODO)`**:
  - Validates status filtering (`TODO`, `IN_PROGRESS`, `DONE`).
- **`02.4 - List Work Items (Pagination Limit Verification)`**:
  - Validates `limit=5` parameter and verifies returned count does not exceed limit.

### Folder 03: Sprints and Milestones
- **`03.1 - List Project Sprints / Milestones`**:
  - Validates `GET /projects/:id/sprints`.
  - Checks fields required by `MiraiProjectManagementAdapter.listProjectMilestones()`: `id`, `name`, `status` (`PLANNED`, `ACTIVE`, `COMPLETED`).

### Folder 04: Members and Roles
- **`04.1 - List Project Members`**:
  - Validates `GET /projects/:id/members`.
  - Confirms participant identity fields (`user_id` / `id`, `name`, `email`) and role bindings (`project_role`).
- **`04.2 - List Project Roles`**:
  - Validates `GET /projects/:id/roles`.

### Folder 05: Cohorts and Users
- **`05.1 - List Organization Cohorts`**:
  - Validates `GET /cohorts` returning active cohort array (`id`, `code`, `name`).
- **`05.2 - List Organization Users`**:
  - Validates `GET /users?organization_id={{organizationId}}`. Confirms email and user IDs conform to `MiraiIdentityMapper` requirements.

### Folder 06: Authentication and Negative Tests
- **`06.1 - Missing Authorization Header`**:
  - Disables authentication. Asserts `HTTP 401 Unauthorized` with `Missing or invalid authorization header`.
- **`06.2 - Invalid Bearer Token`**:
  - Sends a forged token. Asserts `HTTP 401 Unauthorized` with `Invalid access token`.
- **`06.3 - Nonexistent Project ID`**:
  - Requests unknown UUID `00000000-0000-0000-0000-000000000000`. Asserts `HTTP 404 Not Found` with `Project not found`.
- **`06.4 - Invalid Pagination Limit Parameter`**:
  - Sends `limit=-1`. Asserts `HTTP 400 Bad Request` with client validation message.

---

## 5. Execution Options in Postman

### Option A: Interactive Runner (Postman GUI)
1. Select the **MIRAI Adapter - Project Management API Test Suite** collection in the sidebar.
2. Click **Run collection** in the top action bar.
3. Verify that **MIRAI Adapter - Project Management API Environment** is selected.
4. Keep the default run order (folders 01 through 06).
5. Click **Run MIRAI Adapter - Project Management API Test Suite**.
6. Inspect the live test results.

### Option B: Newman CLI (Automated / CI Runner)
If you have Newman installed globally or via npx:

```bash
npx newman run postman/MIRAI_Project_Management_API_Tests.postman_collection.json \
  -e postman/MIRAI_Project_Management_API_Tests.postman_environment.json \
  --env-var "baseUrl=https://your-deployment.vercel.app/api" \
  --env-var "token=YOUR_SERVICE_TOKEN" \
  --reporters cli,summary
```

---

## 6. Diagnosing Test Failures

| Observed Status | Likely Cause | Remediation Step |
|---|---|---|
| **401 Unauthorized** (on Folder 01–05) | Token is missing, expired, or invalid. | Generate a fresh JWT using login or service account credentials. Verify `JWT_ACCESS_SECRET` on Vercel. |
| **403 Forbidden** | Caller account lacks `PROJECT_READ` permission or belongs to a different organization. | Ensure the test token has sufficient role privileges (Manager or Super Admin) in the target organization. |
| **404 Not Found** (on `/projects` or `/work-items`) | Incorrect `baseUrl` routing. | Confirm `baseUrl` ends with `/api` (e.g. `https://<app>.vercel.app/api`). Check `vercel.json` rewrites. |
| **404 Not Found** (on `GET /projects/:id`) | The specified `projectId` does not exist in the database. | Run `01.1 - List Projects` first to auto-capture a valid `projectId`. |
| **500 Internal Server Error** | Database connection pool exhaustion or unhandled exception. | Check Vercel serverless function logs and verify PostgreSQL connection string / PgBouncer pool. |

---

## 7. Pre-Integration Verification Checklist

Use this checklist to record the actual outcomes when running against the deployed Vercel backend:

| Request | Endpoint | Expected Status | Observed Status | Outcome (PASS/FAIL) | Notes / Latency |
|---|---|---|---|---|---|
| **01.1** | `GET /projects?limit=20` | `200 OK` | | | |
| **01.2** | `GET /projects?status=ACTIVE` | `200 OK` | | | |
| **01.3** | `GET /projects?my=true` | `200 OK` | | | |
| **01.4** | `GET /projects/:id` | `200 OK` | | | |
| **02.1** | `GET /work-items?project_id=...` | `200 OK` | | | |
| **02.2** | `GET /work-items?type=TASK` | `200 OK` | | | |
| **02.3** | `GET /work-items?status=TODO` | `200 OK` | | | |
| **02.4** | `GET /work-items?limit=5` | `200 OK` | | | |
| **03.1** | `GET /projects/:id/sprints` | `200 OK` | | | |
| **04.1** | `GET /projects/:id/members` | `200 OK` | | | |
| **04.2** | `GET /projects/:id/roles` | `200 OK` | | | |
| **05.1** | `GET /cohorts` | `200 OK` | | | |
| **05.2** | `GET /users?organization_id=...` | `200 OK` | | | |
| **06.1** | `GET /projects` (No Token) | `401 Unauthorized` | | | |
| **06.2** | `GET /projects` (Invalid Token) | `401 Unauthorized` | | | |
| **06.3** | `GET /projects/0000...` | `404 Not Found` | | | |
| **06.4** | `GET /work-items?limit=-1` | `400 Bad Request` | | | |

---

## 8. Next Steps Following Test Verification

Once all positive and negative requests pass:
1. Copy the verified `baseUrl` and service account token into the MIRAI application environment:
   ```bash
   PROJECT_MANAGEMENT_API_URL="https://your-deployment.vercel.app/api"
   PROJECT_MANAGEMENT_API_TOKEN="<verified_token>"
   ```
2. Chaitanya can safely begin consuming the `MiraiProjectManagementAdapter` to power the MIRAI REST API layer according to [`MIRAI_PROJECT_MANAGEMENT_ADAPTER_CONTRACT.md`](file:///c:/Users/srira/Desktop/intern_performance_dashboard/docs/MIRAI_PROJECT_MANAGEMENT_ADAPTER_CONTRACT.md).

