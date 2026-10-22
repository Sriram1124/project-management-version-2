# MIRAI Project Membership Integration Handoff Specification

**Document Version:** 1.0.0  
**Target Audience:** MIRAI Django Backend Engineers, RBAC Developers, System Integrators  
**Source Service:** Node.js Project Management Service (`backend-node`)  
**Target Service:** MIRAI Django Core Application (`mirai-django-core`)  
**Date:** October 2026  
**Status:** Approved & Implemented in Node.js PM Repository  

---

## 1. Executive Overview & Policy Invariants

This specification provides the technical handoff and integration guide for connecting MIRAI's Django Role-Based Access Control (RBAC) layer to the Node.js Project Management (PM) service.

### Security Invariants & Policy Rules
1. **Intern Project Visibility Invariant (Non-negotiable):**  
   Interns must **only** see and access projects to which they are explicitly and authoritatively assigned in `public.project_members`.
2. **Ownership $\neq$ Membership:**  
   Project ownership (`projects.owner_id`, `public.project_owners`) is modeled separately from project membership. Interns are strictly prohibited from being project owners. Project ownership or task assignment must **never** be used to infer project membership.
3. **Fail-Closed by Default:**  
   If the upstream Project Management service is unreachable, returns an error (401, 403, 500), times out, or reports that a user or project is not found (404), Django RBAC **must fail closed** and deny project visibility. Never grant project access on operational failures.
4. **Authoritative Single Source of Truth:**  
   `public.project_members` is the sole authoritative store of project membership.

---

## 2. Endpoints Summary

| Purpose | Method | Path | Required Permissions |
| :--- | :--- | :--- | :--- |
| **Membership Check** (Detail Views) | `GET` | `/api/projects/:projectId/members/:userId/check` | `PROJECT_READ` |
| **Project Memberships List** (List Filtering) | `GET` | `/api/users/:userId/project-memberships` | `PROJECT_READ` or `USER_READ` |
| **Secondary Membership List Alias** | `GET` | `/api/projects/user/:userId/memberships` | `PROJECT_READ` |

---

## 3. Machine-to-Machine (M2M) Authentication

All requests from Django to the Node.js service must be authenticated using machine-to-machine service credentials. Standard interactive human-user session tokens are not required.

### Supported Authentication Methods

#### Method A: Static Service Bearer Token (Recommended for Service-to-Service)
Django transmits a pre-shared service bearer token configured in the environment:
```http
Authorization: Bearer <PROJECT_MANAGEMENT_SERVICE_TOKEN>
X-Organization-Id: <organization-uuid>
Accept: application/json
```

#### Method B: Service JWT
Django signs and transmits a short-lived JSON Web Token signed with `JWT_ACCESS_SECRET`:
- **Algorithm:** HS256
- **Claims:**
  ```json
  {
    "role": "SERVICE",
    "type": "service",
    "service": "mirai-django-core",
    "organizationId": "<organization-uuid>",
    "exp": 1792680000
  }
  ```

### Principal Permissions & Least Privilege
When authenticated, the service principal is granted least-privilege service credentials:
- **Role:** `SERVICE`
- **Permissions:** `PROJECT_READ`, `USER_READ`
- **Security Boundaries:** The service principal is strictly blocked from mutation endpoints (`PROJECT_CREATE`, `PROJECT_DELETE`, `USER_CREATE`).

### Environment Configuration Requirements
Store secrets securely in environment configuration or secret managers (e.g. AWS Secrets Manager, HashiCorp Vault). Never hardcode secrets in source code.

| Environment Variable | Service | Description | Example / Notes |
| :--- | :--- | :--- | :--- |
| `PROJECT_MANAGEMENT_SERVICE_TOKEN` | Node.js & Django | Dedicated M2M shared secret | Pre-shared high-entropy token |
| `PROJECT_MANAGEMENT_API_URL` | Django | Base URL of Node.js API | e.g. `https://pm.internal.domain/api` |
| `PROJECT_MANAGEMENT_API_TIMEOUT_MS` | Django | HTTP client timeout in ms | e.g. `5000` |
| `PROJECT_MANAGEMENT_API_MAX_RETRIES` | Django | Maximum retry count for 5xx/429 | e.g. `3` |
| `JWT_ACCESS_SECRET` | Node.js (& Django if using Method B) | Shared secret for signing/verifying JWTs | Used if signing Service JWTs |

---

## 4. Detailed API Contracts

### 4.1. Single-Project Membership Check

Used by Django RBAC when an intern attempts to view or perform actions on a specific project detail view (`/projects/<uuid>/`).

#### Request
```http
GET /api/projects/:projectId/members/:userId/check HTTP/1.1
Host: pm.internal.domain
Authorization: Bearer <service-token>
X-Organization-Id: 00000000-0000-0000-0000-000000000001
Accept: application/json
```

#### URL Parameters
- `projectId` *(string, required)*: UUID string of the project.
- `userId` *(string, required)*: Source PM User UUID string (resolved from MIRAI user UUID).

#### Response: Confirmed Member (HTTP 200 OK)
```json
{
  "status": "success",
  "data": {
    "is_member": true,
    "project_id": "proj-uuid-100",
    "user_id": "user-uuid-member",
    "project_role": "DEVELOPER",
    "role_id": null,
    "joined_at": null
  },
  "is_member": true,
  "project_id": "proj-uuid-100",
  "user_id": "user-uuid-member",
  "project_role": "DEVELOPER",
  "role_id": null,
  "joined_at": null
}
```

#### Response: Confirmed Non-Member (HTTP 200 OK)
When both the project and the user exist within the caller's organization, but the user has no record in `public.project_members`:
```json
{
  "status": "success",
  "data": {
    "is_member": false,
    "project_id": "proj-uuid-100",
    "user_id": "user-uuid-nonmember",
    "project_role": null,
    "role_id": null,
    "joined_at": null
  },
  "is_member": false,
  "project_id": "proj-uuid-100",
  "user_id": "user-uuid-nonmember",
  "project_role": null,
  "role_id": null,
  "joined_at": null
}
```

#### Response: Project or User Not Found (HTTP 404 Not Found)
When the requested project or user does not exist in the tenant:
```json
{
  "error": "Project not found"
}
```
*or*
```json
{
  "error": "User not found"
}
```

---

### 4.2. User Project Memberships List

Used by Django when rendering the project list view (`/projects/`) to retrieve all project IDs the intern is authorized to see.

#### Request
```http
GET /api/users/:userId/project-memberships HTTP/1.1
Host: pm.internal.domain
Authorization: Bearer <service-token>
X-Organization-Id: 00000000-0000-0000-0000-000000000001
Accept: application/json
```

#### URL Parameters
- `userId` *(string, required)*: Source PM User UUID string (resolved from MIRAI user UUID).

#### Response: Active Member in Projects (HTTP 200 OK)
```json
{
  "status": "success",
  "data": {
    "user_id": "user-uuid-member",
    "project_ids": [
      "proj-uuid-1",
      "proj-uuid-2",
      "proj-uuid-3"
    ],
    "total": 3
  },
  "user_id": "user-uuid-member",
  "project_ids": [
    "proj-uuid-1",
    "proj-uuid-2",
    "proj-uuid-3"
  ],
  "total": 3
}
```

#### Response: User with Zero Project Memberships (HTTP 200 OK)
When a valid user exists in the tenant but belongs to no projects:
```json
{
  "status": "success",
  "data": {
    "user_id": "user-uuid-idle",
    "project_ids": [],
    "total": 0
  },
  "user_id": "user-uuid-idle",
  "project_ids": [],
  "total": 0
}
```

#### Response: User Not Found (HTTP 404 Not Found)
When the user ID does not exist in the organization:
```json
{
  "error": "User not found"
}
```

---

## 5. Identity Resolution & Mapping Rules

Both MIRAI and Node.js Project Management represent entity identifiers as UUID strings (`TEXT` in PostgreSQL and Prisma).

1. **Direct Federation Invariant:**  
   By default, MIRAI user UUIDs match PM source user IDs without transformation.
2. **Explicit Override Mapping:**  
   If an intern has distinct IDs across the two systems, register an explicit mapping via `MiraiIdentityMapper.registerUserOverride(sourceUserId, canonicalUserId, organizationId)`.
3. **No Blind Trust:**  
   Do not treat an arbitrary UUID string as a valid identity simply because it conforms to UUID syntax.
4. **Distinguishing Mapping Failures from Zero Memberships:**  
   - If an identity resolution fails or violates an organization boundary, an exception (`UserMappingError`) is raised.  
   - An operational or mapping failure must **never** return an empty project list (`[]`), because doing so would deceive Django into believing the user was verified with 0 projects rather than alerting it to an operational issue.

---

## 6. Django Client Implementation (Python / Requests Reference)

Below is the recommended reference implementation for the Django integration client:

```python
import os
import logging
import requests
from typing import List, Optional
from requests.adapters import HTTPAdapter
from urllib3.util import Retry

logger = logging.getLogger(__name__)

class MiraiProjectMembershipClientError(Exception):
    """Base exception for MIRAI Project Management client errors."""
    pass

class UpstreamNotFoundError(MiraiProjectMembershipClientError):
    """Raised when project or user is not found upstream (HTTP 404)."""
    pass

class UpstreamAuthError(MiraiProjectMembershipClientError):
    """Raised when service token is rejected (HTTP 401/403)."""
    pass

class UpstreamNetworkError(MiraiProjectMembershipClientError):
    """Raised on connection drop or HTTP 5xx."""
    pass


class MiraiProjectMembershipClient:
    def __init__(self, base_url: Optional[str] = None, token: Optional[str] = None, default_org_id: Optional[str] = None):
        self.base_url = (base_url or os.getenv("PROJECT_MANAGEMENT_API_URL", "http://localhost:3001/api")).rstrip("/")
        self.token = token or os.getenv("PROJECT_MANAGEMENT_SERVICE_TOKEN")
        self.default_org_id = default_org_id or os.getenv("DEFAULT_ORGANIZATION_ID")
        self.timeout = float(os.getenv("PROJECT_MANAGEMENT_API_TIMEOUT_MS", 5000)) / 1000.0

        if not self.token:
            raise ValueError("PROJECT_MANAGEMENT_SERVICE_TOKEN is required for M2M membership calls.")

        self.session = requests.Session()
        retries = Retry(
            total=3,
            backoff_factor=0.3,
            status_forcelist=[429, 500, 502, 503, 504],
            raise_on_status=False
        )
        self.session.mount("http://", HTTPAdapter(max_retries=retries))
        self.session.mount("https://", HTTPAdapter(max_retries=retries))

    def _get_headers(self, organization_id: Optional[str] = None) -> dict:
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json",
        }
        org = organization_id or self.default_org_id
        if org:
            headers["X-Organization-Id"] = org
        return headers

    def is_project_member(self, mirai_user_id: str, project_id: str, organization_id: Optional[str] = None) -> bool:
        """
        Check if a user is an authoritative member of a project in public.project_members.
        Fails closed on any error.
        """
        if not mirai_user_id or not project_id:
            logger.warning("[RBAC] Invalid empty mirai_user_id or project_id in is_project_member check.")
            return False

        url = f"{self.base_url}/projects/{project_id}/members/{mirai_user_id}/check"
        try:
            resp = self.session.get(url, headers=self._get_headers(organization_id), timeout=self.timeout)
            
            if resp.status_code == 200:
                payload = resp.json()
                data = payload.get("data", payload)
                return bool(data.get("is_member", False))
            
            if resp.status_code == 404:
                # User or Project does not exist upstream
                logger.info(f"[RBAC] Project {project_id} or User {mirai_user_id} not found upstream.")
                return False
                
            if resp.status_code in (401, 403):
                logger.error(f"[RBAC] Service authentication failed against PM service: {resp.status_code}")
                raise UpstreamAuthError(f"Service credentials rejected: {resp.text}")
                
            resp.raise_for_status()
            return False

        except (requests.exceptions.RequestException, MiraiProjectMembershipClientError) as exc:
            logger.error(f"[RBAC] Membership check failed with exception: {exc}. Failing closed (access denied).")
            # In Django RBAC: fail closed
            return False

    def get_project_ids_for_user(self, mirai_user_id: str, organization_id: Optional[str] = None) -> List[str]:
        """
        Retrieve all project IDs for an intern.
        Returns list of project UUID strings.
        Raises exception on operational failure to prevent masking errors.
        """
        if not mirai_user_id:
            return []

        url = f"{self.base_url}/users/{mirai_user_id}/project-memberships"
        try:
            resp = self.session.get(url, headers=self._get_headers(organization_id), timeout=self.timeout)
            
            if resp.status_code == 200:
                payload = resp.json()
                data = payload.get("data", payload)
                return data.get("project_ids", [])
                
            if resp.status_code == 404:
                logger.warning(f"[RBAC] User {mirai_user_id} not found in PM database.")
                raise UpstreamNotFoundError(f"User {mirai_user_id} not found.")
                
            if resp.status_code in (401, 403):
                logger.error(f"[RBAC] Service auth error fetching project list: {resp.status_code}")
                raise UpstreamAuthError("Service auth failed.")
                
            resp.raise_for_status()
            return []

        except requests.exceptions.RequestException as exc:
            logger.error(f"[RBAC] Failed to fetch project list for user {mirai_user_id}: {exc}")
            raise UpstreamNetworkError(f"Failed to communicate with PM service: {exc}")
```

---

## 7. Django RBAC View Integration Pattern

In Django, apply the membership checks in views or permission classes:

```python
from rest_framework.permissions import BasePermission
from rest_framework.exceptions import PermissionDenied

class IsInternAssignedToProject(BasePermission):
    """
    Ensures interns can only see and access projects they are members of in project_members.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        # Non-interns (Managers, Admins, Mentors) bypass intern visibility filter
        if request.user.role != 'INTERN':
            return True

        project_id = view.kwargs.get('project_id') or view.kwargs.get('pk')
        if not project_id:
            return True  # Handled by list filter

        client = MiraiProjectMembershipClient()
        is_member = client.is_project_member(
            mirai_user_id=str(request.user.id),
            project_id=str(project_id),
            organization_id=str(request.user.organization_id)
        )

        if not is_member:
            raise PermissionDenied("You are not assigned to this project.")
            
        return True


class ProjectListView(generics.ListAPIView):
    """
    Filters project list view so interns see only their assigned projects.
    """
    serializer_class = ProjectSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Project.objects.filter(organization_id=user.organization_id)

        if user.role == 'INTERN':
            client = MiraiProjectMembershipClient()
            try:
                allowed_project_ids = client.get_project_ids_for_user(
                    mirai_user_id=str(user.id),
                    organization_id=str(user.organization_id)
                )
                return qs.filter(id__in=allowed_project_ids)
            except Exception as e:
                # FAIL CLOSED on upstream communication or mapping error
                logger.error(f"Failing closed on project list for intern {user.id}: {e}")
                return qs.none()

        return qs
```

---

## 8. Manual End-to-End Verification Checklist

Before deploying the Django integration to staging or production, execute this verification run:

- [ ] **Check 1: Confirmed Member Access**  
  Select an intern who exists in `public.project_members` for Project A.  
  Verify `GET /api/projects/proj-A/members/intern-X/check` returns HTTP 200 with `is_member: true`.  
  Verify Django grants detail view access.
- [ ] **Check 2: Non-Member Denial**  
  Select an intern in the same organization who is NOT in `public.project_members` for Project B.  
  Verify `GET /api/projects/proj-B/members/intern-Y/check` returns HTTP 200 with `is_member: false`.  
  Verify Django blocks access with `403 Forbidden` (`PermissionDenied`).
- [ ] **Check 3: Project Owner Exclusion**  
  Select a manager who owns Project C (`projects.owner_id = manager-Z`) but was not added to `project_members`.  
  Verify `is_member` returns `false`.  
  Verify that Django ownership rules are not overridden by membership rules.
- [ ] **Check 4: Task Assignee Exclusion**  
  Select a user who has a task assigned in Project D, but no record in `project_members`.  
  Verify `is_member` returns `false`.
- [ ] **Check 5: List View Filtering**  
  Query `/api/users/intern-X/project-memberships`.  
  Verify exactly the expected project UUIDs are returned.  
  Verify Django's project list shows only those projects.
- [ ] **Check 6: Zero Memberships**  
  Query `/api/users/idle-intern/project-memberships`.  
  Verify HTTP 200 with `project_ids: []` and `total: 0`.  
  Verify Django displays an empty project list with no errors.
- [ ] **Check 7: Cross-Tenant Isolation**  
  Pass `X-Organization-Id: <org-B>` for a user belonging to `<org-A>`.  
  Verify Node.js responds with `HTTP 404 User not found`.
- [ ] **Check 8: Invalid Service Token**  
  Send `Authorization: Bearer invalid-token`.  
  Verify HTTP 401 Unauthorized.
- [ ] **Check 9: Upstream Failure Fail-Closed**  
  Simulate a Node.js PM service outage.  
  Verify Django logs error and displays 0 projects (does not fail open).

