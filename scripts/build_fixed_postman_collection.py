import json
import os

collection = {
  "info": {
    "_postman_id": "c282051f-57c4-4e54-a845-92b6a3dfdd35",
    "name": "InternHub Platform - Complete Comprehensive API Test Suite",
    "description": "Complete Postman Collection covering all 13 modules, automated token extraction, dynamic variable chaining, and assertion test scripts across the InternHub platform.",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    "version": "2.1.0"
  },
  "variable": [
    {"key": "baseUrl", "value": "http://localhost:3001", "type": "string", "description": "API backend server base URL"},
    {"key": "accessToken", "value": "", "type": "string", "description": "Active JWT Bearer Access Token"},
    {"key": "refreshToken", "value": "", "type": "string", "description": "Active Refresh Token"},
    {"key": "sessionId", "value": "", "type": "string", "description": "Active Session ID"},
    {"key": "superAdminToken", "value": "", "type": "string", "description": "Super Admin JWT Token"},
    {"key": "internToken", "value": "", "type": "string", "description": "Intern JWT Token"},
    {"key": "managerEmail", "value": "manager@dailoqa.com", "type": "string"},
    {"key": "managerPassword", "value": "password123", "type": "string"},
    {"key": "superAdminEmail", "value": "superadmin@dailoqa.com", "type": "string"},
    {"key": "superAdminPassword", "value": "password123", "type": "string"},
    {"key": "internEmail", "value": "intern@dailoqa.com", "type": "string"},
    {"key": "internPassword", "value": "password123", "type": "string"},
    {"key": "organizationId", "value": "", "type": "string"},
    {"key": "managerUserId", "value": "", "type": "string"},
    {"key": "projectId", "value": "", "type": "string"},
    {"key": "sprintId", "value": "", "type": "string"},
    {"key": "workItemId", "value": "", "type": "string"},
    {"key": "commentId", "value": "", "type": "string"},
    {"key": "extensionRequestId", "value": "", "type": "string"},
    {"key": "documentId", "value": "", "type": "string"},
    {"key": "customRoleId", "value": "", "type": "string"},
    {"key": "createdUserId", "value": "", "type": "string"},
    {"key": "cohortId", "value": "", "type": "string"},
    {"key": "formId", "value": "", "type": "string"},
    {"key": "questionId", "value": "", "type": "string"},
    {"key": "submissionId", "value": "", "type": "string"},
    {"key": "notificationId", "value": "", "type": "string"},
    {"key": "timeEntryId", "value": "", "type": "string"},
    {"key": "timeCorrectionId", "value": "", "type": "string"},
    {"key": "actionItemId", "value": "", "type": "string"},
    {"key": "testOrgId", "value": "", "type": "string"},
    {"key": "testManagerId", "value": "", "type": "string"},
    {"key": "testProjectId", "value": "", "type": "string"},
    {"key": "testSprintId", "value": "", "type": "string"},
    {"key": "testFormId", "value": "", "type": "string"}
  ],
  "item": []
}

def make_request(name, method, url_raw, headers=None, body_json=None, auth_token=None, test_scripts=None, prerequest_scripts=None, description=""):
    req = {
        "name": name,
        "request": {
            "method": method,
            "header": [],
            "url": {
                "raw": url_raw,
                "host": ["{{baseUrl}}"],
                "path": [p for p in url_raw.replace("{{baseUrl}}/", "").split("?")[0].split("/") if p],
                "query": []
            },
            "description": description
        },
        "event": []
    }
    
    # Query params
    if "?" in url_raw:
        qs = url_raw.split("?")[1]
        for part in qs.split("&"):
            if "=" in part:
                k, v = part.split("=", 1)
                req["request"]["url"]["query"].append({"key": k, "value": v})
    
    # Auth
    if auth_token == "noauth" or auth_token is None:
        req["request"]["auth"] = {"type": "noauth"}
    else:
        req["request"]["auth"] = {
            "type": "bearer",
            "bearer": [{"key": "token", "value": auth_token, "type": "string"}]
        }
        
    # Headers
    if headers:
        for k, v in headers.items():
            req["request"]["header"].append({"key": k, "value": v})
    elif body_json is not None:
        req["request"]["header"].append({"key": "Content-Type", "value": "application/json"})
        req["request"]["header"].append({"key": "Accept", "value": "application/json"})
    else:
        req["request"]["header"].append({"key": "Accept", "value": "application/json"})
        
    # Body
    if body_json is not None:
        req["request"]["body"] = {
            "mode": "raw",
            "raw": json.dumps(body_json, indent=2) if isinstance(body_json, (dict, list)) else body_json,
            "options": {"raw": {"language": "json"}}
        }
        
    # Events
    if prerequest_scripts:
        req["event"].append({
            "listen": "prerequest",
            "script": {
                "type": "text/javascript",
                "exec": prerequest_scripts if isinstance(prerequest_scripts, list) else [prerequest_scripts]
            }
        })
    if test_scripts:
        req["event"].append({
            "listen": "test",
            "script": {
                "type": "text/javascript",
                "exec": test_scripts if isinstance(test_scripts, list) else [test_scripts]
            }
        })
    return req

# Module 00: Health
m00 = {
    "name": "00. Health & System Diagnostics",
    "description": "System health check and database connectivity diagnostic endpoints.",
    "item": [
        make_request(
            "Health Check (GET /api/health)", "GET", "{{baseUrl}}/api/health", auth_token="noauth",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});',
                'pm.test("Health response is valid JSON", function () {',
                '    var data = pm.response.json();',
                '    pm.expect(data).to.have.property("status");',
                '    pm.expect(data).to.have.property("database");',
                '    pm.expect(data.database.status).to.eql("connected");',
                '});'
            ],
            description="Validates that backend, PostgreSQL pooler, and Redis fallback are online and operational."
        )
    ]
}

# Module 01: Auth
m01 = {
    "name": "01. Authentication & Session Management",
    "description": "Authentication lifecycle: organization listing, multi-tenant login, session refresh, profile retrieval, password changes, and logout.",
    "item": [
        make_request(
            "List Active Organizations (GET /api/auth/organizations)", "GET", "{{baseUrl}}/api/auth/organizations", auth_token="noauth",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});',
                'pm.test("Returns list of active organizations", function () {',
                '    var data = pm.response.json();',
                '    pm.expect(Array.isArray(data)).to.be.true;',
                '    if (data.length > 0) {',
                '        pm.collectionVariables.set("organizationId", data[0].id);',
                '    }',
                '});'
            ]
        ),
        make_request(
            "Login as Manager (POST /api/auth/login)", "POST", "{{baseUrl}}/api/auth/login", auth_token="noauth",
            body_json={"email": "{{managerEmail}}", "password": "{{managerPassword}}"},
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});',
                'pm.test("Extract tokens and user context", function () {',
                '    var data = pm.response.json();',
                '    pm.expect(data).to.have.property("accessToken");',
                '    pm.expect(data).to.have.property("refreshToken");',
                '    pm.expect(data).to.have.property("user");',
                '    pm.collectionVariables.set("accessToken", data.accessToken);',
                '    pm.collectionVariables.set("refreshToken", data.refreshToken);',
                '    pm.collectionVariables.set("sessionId", data.sessionId);',
                '    pm.collectionVariables.set("managerUserId", data.user.id);',
                '    pm.collectionVariables.set("organizationId", data.user.organization_id);',
                '});'
            ]
        ),
        make_request(
            "Login as Super Admin (POST /api/auth/login)", "POST", "{{baseUrl}}/api/auth/login", auth_token="noauth",
            body_json={"email": "{{superAdminEmail}}", "password": "{{superAdminPassword}}"},
            test_scripts=[
                'pm.test("SuperAdmin login status 200", function () {',
                '    pm.response.to.have.status(200);',
                '    var data = pm.response.json();',
                '    pm.expect(data).to.have.property("accessToken");',
                '    pm.collectionVariables.set("superAdminToken", data.accessToken);',
                '});'
            ]
        ),
        make_request(
            "Login as Intern (POST /api/auth/login)", "POST", "{{baseUrl}}/api/auth/login", auth_token="noauth",
            body_json={"email": "{{internEmail}}", "password": "{{internPassword}}"},
            test_scripts=[
                'pm.test("Intern login status 200", function () {',
                '    pm.response.to.have.status(200);',
                '    var data = pm.response.json();',
                '    pm.expect(data).to.have.property("accessToken");',
                '    pm.collectionVariables.set("internToken", data.accessToken);',
                '    if (data.user) {',
                '        pm.collectionVariables.set("internUserId", data.user.id);',
                '    }',
                '});'
            ]
        ),
        make_request(
            "Negative: Login with Invalid Password (POST /api/auth/login)", "POST", "{{baseUrl}}/api/auth/login", auth_token="noauth",
            body_json={"email": "{{managerEmail}}", "password": "DefinatelyWrongPassword!123"},
            test_scripts=[
                'pm.test("Status code is 401", function () {',
                '    pm.response.to.have.status(401);',
                '});',
                'pm.test("Error message explains invalid credentials", function () {',
                '    var data = pm.response.json();',
                '    pm.expect(data).to.have.property("error");',
                '});'
            ]
        ),
        make_request(
            "Negative: Login with Missing Body (POST /api/auth/login)", "POST", "{{baseUrl}}/api/auth/login", auth_token="noauth",
            body_json={},
            test_scripts=[
                'pm.test("Status code is 400", function () {',
                '    pm.response.to.have.status(400);',
                '});'
            ]
        ),
        make_request(
            "Get Current User Profile (GET /api/auth/me)", "GET", "{{baseUrl}}/api/auth/me", auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});',
                'pm.test("Profile structure is valid", function () {',
                '    var data = pm.response.json();',
                '    pm.expect(data).to.have.property("id");',
                '    pm.expect(data).to.have.property("email");',
                '    pm.expect(data).to.have.property("role");',
                '    pm.expect(data).to.have.property("permissions");',
                '    pm.expect(Array.isArray(data.permissions)).to.be.true;',
                '});'
            ]
        ),
        make_request(
            "Negative: Get Profile Without Token (GET /api/auth/me)", "GET", "{{baseUrl}}/api/auth/me", auth_token="noauth",
            test_scripts=[
                'pm.test("Status code is 401", function () {',
                '    pm.response.to.have.status(401);',
                '});'
            ]
        ),
        make_request(
            "Refresh Access Token (POST /api/auth/refresh)", "POST", "{{baseUrl}}/api/auth/refresh", auth_token="noauth",
            body_json={"refreshToken": "{{refreshToken}}", "sessionId": "{{sessionId}}"},
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});',
                'pm.test("Stores refreshed accessToken", function () {',
                '    var data = pm.response.json();',
                '    pm.expect(data).to.have.property("accessToken");',
                '    pm.collectionVariables.set("accessToken", data.accessToken);',
                '});'
            ]
        ),
        make_request(
            "Change Password (POST /api/auth/change-password)", "POST", "{{baseUrl}}/api/auth/change-password", auth_token="{{accessToken}}",
            body_json={"current_password": "{{managerPassword}}", "new_password": "{{managerPassword}}"},
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Logout Session (POST /api/auth/logout)", "POST", "{{baseUrl}}/api/auth/logout", auth_token="{{accessToken}}",
            body_json={"sessionId": "{{sessionId}}"},
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Re-authenticate Manager Post-Logout (POST /api/auth/login)", "POST", "{{baseUrl}}/api/auth/login", auth_token="noauth",
            body_json={"email": "{{managerEmail}}", "password": "{{managerPassword}}"},
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '    var data = pm.response.json();',
                '    pm.collectionVariables.set("accessToken", data.accessToken);',
                '    pm.collectionVariables.set("refreshToken", data.refreshToken);',
                '    pm.collectionVariables.set("sessionId", data.sessionId);',
                '});'
            ]
        )
    ]
}

# Module 02: Organizations
m02 = {
    "name": "02. Super Admin & Organizations",
    "description": "Endpoints for platform oversight, audit logging, multi-tenant organization lifecycle, and manager provisioning (Requires SUPER_ADMIN role).",
    "item": [
        make_request(
            "Get Platform Overview KPIs (GET /api/organizations/platform-overview)", "GET", "{{baseUrl}}/api/organizations/platform-overview",
            auth_token="{{superAdminToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});',
                'pm.test("Platform overview contains totalOrganizations", function () {',
                '    var data = pm.response.json();',
                '    pm.expect(data).to.have.property("totalOrganizations");',
                '    pm.expect(data.totalOrganizations).to.be.a("number");',
                '});'
            ],
            description="Global high-level platform KPIs, status counts, and recent platform events. Fixed Assertion #20."
        ),
        make_request(
            "List Platform Audit Logs (GET /api/organizations/audit-logs)", "GET", "{{baseUrl}}/api/organizations/audit-logs?page=1&limit=20",
            auth_token="{{superAdminToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "List All Organizations (GET /api/organizations)", "GET", "{{baseUrl}}/api/organizations?status=all&page=1&limit=25",
            auth_token="{{superAdminToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '    var data = pm.response.json();',
                '    var orgs = data.organizations || data;',
                '    if (Array.isArray(orgs) && orgs.length > 0) {',
                '        pm.collectionVariables.set("testOrgId", orgs[0].id);',
                '    }',
                '});'
            ]
        ),
        make_request(
            "Create Organization (POST /api/organizations)", "POST", "{{baseUrl}}/api/organizations",
            auth_token="{{superAdminToken}}",
            prerequest_scripts=[
                'var ts = Date.now();',
                'pm.variables.set("dynOrgName", "Postman Test Org " + ts);',
                'pm.variables.set("dynOrgMgrEmail", "test.mgr." + ts + "@example.com");'
            ],
            body_json={
                "organizationName": "{{dynOrgName}}",
                "managerName": "Postman Test Manager",
                "managerEmail": "{{dynOrgMgrEmail}}"
            },
            test_scripts=[
                'pm.test("Status code is 201", function () {',
                '    pm.response.to.have.status(201);',
                '});',
                'pm.test("Capture testOrgId and testManagerId", function () {',
                '    var data = pm.response.json();',
                '    var orgId = data.organization ? data.organization.id : data.id;',
                '    pm.expect(orgId).to.be.ok;',
                '    pm.collectionVariables.set("testOrgId", orgId);',
                '    if (data.manager) {',
                '        pm.collectionVariables.set("testManagerId", data.manager.id);',
                '    }',
                '});'
            ],
            description="Provisions an organization and manager with dynamic names to prevent HTTP 409 collisions. Fixed Assertion #23."
        ),
        make_request(
            "Get Organization Details (GET /api/organizations/:id)", "GET", "{{baseUrl}}/api/organizations/{{testOrgId}}",
            auth_token="{{superAdminToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Update Organization (PATCH /api/organizations/:id)", "PATCH", "{{baseUrl}}/api/organizations/{{testOrgId}}",
            auth_token="{{superAdminToken}}",
            body_json={"name": "Updated Test Org {{dynOrgName}}"},
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Toggle Organization Status (POST /api/organizations/:id/toggle-status)", "POST", "{{baseUrl}}/api/organizations/{{testOrgId}}/toggle-status",
            auth_token="{{superAdminToken}}",
            body_json={"is_active": True, "reason": "Automated Postman Verification Test"},
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Get Organization Members (GET /api/organizations/:id/members)", "GET", "{{baseUrl}}/api/organizations/{{testOrgId}}/members?page=1&limit=20",
            auth_token="{{superAdminToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Download Manager Bulk Template (GET /api/organizations/:id/managers/template)", "GET", "{{baseUrl}}/api/organizations/{{testOrgId}}/managers/template",
            auth_token="{{superAdminToken}}",
            headers={"Accept": "text/csv"},
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '    pm.expect(pm.response.text()).to.include("name,email");',
                '});'
            ]
        ),
        make_request(
            "Validate Manager CSV (POST /api/organizations/:id/managers/validate-csv)", "POST", "{{baseUrl}}/api/organizations/{{testOrgId}}/managers/validate-csv",
            auth_token="{{superAdminToken}}",
            body_json={"csvText": "name,email\nAlice Manager,alice.test@example.com\nBob Manager,bob.test@example.com\n"},
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Add Single Manager (POST /api/organizations/:id/managers)", "POST", "{{baseUrl}}/api/organizations/{{testOrgId}}/managers",
            auth_token="{{superAdminToken}}",
            prerequest_scripts=[
                'var ts = Date.now();',
                'pm.variables.set("dynDirectMgrEmail", "direct.mgr." + ts + "@example.com");'
            ],
            body_json={"managerName": "Direct Manager", "managerEmail": "{{dynDirectMgrEmail}}"},
            test_scripts=[
                'pm.test("Status code is 201", function () {',
                '    pm.response.to.have.status(201);',
                '    var data = pm.response.json();',
                '    if (data.manager) {',
                '        pm.collectionVariables.set("testManagerId", data.manager.id);',
                '    }',
                '});'
            ],
            description="Provisions an additional manager with dynamic email to prevent 409 collisions. Fixed Assertion #30."
        ),
        make_request(
            "Import Managers Bulk (POST /api/organizations/:id/managers/bulk)", "POST", "{{baseUrl}}/api/organizations/{{testOrgId}}/managers/bulk",
            auth_token="{{superAdminToken}}",
            body_json={
                "rows": [
                    {"name": "Bulk Manager 1", "email": "bulk.mgr1.{{$timestamp}}@example.com"},
                    {"name": "Bulk Manager 2", "email": "bulk.mgr2.{{$timestamp}}@example.com"}
                ]
            },
            test_scripts=[
                'pm.test("Status code is 201", function () {',
                '    pm.response.to.have.status(201);',
                '});'
            ]
        ),
        make_request(
            "Reset Manager Password (POST /api/organizations/:id/managers/:managerId/reset-password)", "POST", "{{baseUrl}}/api/organizations/{{testOrgId}}/managers/{{testManagerId}}/reset-password",
            auth_token="{{superAdminToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Negative: Manager Access to SuperAdmin Route (GET /api/organizations)", "GET", "{{baseUrl}}/api/organizations",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 403 Forbidden", function () {',
                '    pm.response.to.have.status(403);',
                '});'
            ]
        )
    ]
}

# Module 03: Users
m03 = {
    "name": "03. Users & Provisioning",
    "description": "User management: provisioning interns/employees, bulk CSV workflows, role permissions, profile updating, password resets, and deactivation.",
    "item": [
        make_request(
            "List Organization Users (GET /api/users)", "GET", "{{baseUrl}}/api/users?role=INTERN&limit=50",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});',
                'pm.test("Capture existing intern ID for dependent tests", function () {',
                '    var data = pm.response.json();',
                '    var users = data.users || data.data || data;',
                '    if (Array.isArray(users) && users.length > 0) {',
                '        pm.collectionVariables.set("internUserId", users[0].id);',
                '    }',
                '});'
            ]
        ),
        make_request(
            "Provision Single Intern (POST /api/users)", "POST", "{{baseUrl}}/api/users",
            auth_token="{{accessToken}}",
            prerequest_scripts=[
                'var ts = Date.now();',
                'pm.variables.set("dynInternEmail", "postman.intern." + ts + "@dailoqa.com");'
            ],
            body_json={
                "name": "Automated Postman Intern",
                "email": "{{dynInternEmail}}",
                "type": "INTERN",
                "batch": "2026",
                "subbatch": "Batch-A"
            },
            test_scripts=[
                'pm.test("Status code is 201", function () {',
                '    pm.response.to.have.status(201);',
                '});',
                'pm.test("Captures createdUserId and temporaryPassword", function () {',
                '    var data = pm.response.json();',
                '    var userId = data.id || (data.user && data.user.id);',
                '    pm.expect(userId).to.be.ok;',
                '    pm.collectionVariables.set("createdUserId", userId);',
                '});'
            ],
            description="Manager provisions single intern with dynamic email. Fixed Assertion #36 and #37."
        ),
        make_request(
            "Download User CSV Template (GET /api/users/bulk/template)", "GET", "{{baseUrl}}/api/users/bulk/template",
            auth_token="{{accessToken}}",
            headers={"Accept": "text/csv"},
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '    pm.expect(pm.response.headers.get("Content-Type")).to.include("csv");',
                '});'
            ]
        ),
        make_request(
            "Validate Bulk User CSV (POST /api/users/bulk/validate)", "POST", "{{baseUrl}}/api/users/bulk/validate",
            auth_token="{{accessToken}}",
            body_json={
                "csvText": "name,email,type,batch,subbatch\nSample Intern,sample.{{$timestamp}}@dailoqa.com,INTERN,2026,Batch-A\n"
            },
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Update Member Details (PATCH /api/users/:id)", "PATCH", "{{baseUrl}}/api/users/{{createdUserId}}",
            auth_token="{{accessToken}}",
            body_json={"name": "Updated Postman Intern Name", "batch": "2026-Q4", "subbatch": "Alpha"},
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Get User Permissions (GET /api/users/:id/permissions)", "GET", "{{baseUrl}}/api/users/{{createdUserId}}/permissions",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Update User Permissions (PUT /api/users/:id/permissions)", "PUT", "{{baseUrl}}/api/users/{{createdUserId}}/permissions",
            auth_token="{{accessToken}}",
            body_json={"permissions": ["PROJECT_READ", "TASK_READ", "TASK_UPDATE"]},
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Get User Timesheet Report (GET /api/users/:userId/timesheet/report)", "GET", "{{baseUrl}}/api/users/{{internUserId}}/timesheet/report?period=week",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Reset User Password (POST /api/users/:id/reset-password)", "POST", "{{baseUrl}}/api/users/{{createdUserId}}/reset-password",
            auth_token="{{accessToken}}",
            body_json={"new_password": "Password@New123"},
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Update Own Profile (PATCH /api/users/profile)", "PATCH", "{{baseUrl}}/api/users/profile",
            auth_token="{{accessToken}}",
            body_json={"name": "Postman Manager Profile"},
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Deactivate User (POST /api/users/:id/deactivate)", "POST", "{{baseUrl}}/api/users/{{createdUserId}}/deactivate",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Negative: Provision User Without Email (POST /api/users)", "POST", "{{baseUrl}}/api/users",
            auth_token="{{accessToken}}",
            body_json={"name": "Invalid User"},
            test_scripts=[
                'pm.test("Status code is 400", function () {',
                '    pm.response.to.have.status(400);',
                '});'
            ]
        )
    ]
}

# Module 04: Cohorts
m04 = {
    "name": "04. Cohorts",
    "description": "Cohort listing and filtering for grouped intern training programs.",
    "item": [
        make_request(
            "List Active Cohorts (GET /api/cohorts)", "GET", "{{baseUrl}}/api/cohorts",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});',
                'pm.test("Stores cohort ID if available", function () {',
                '    var data = pm.response.json();',
                '    if (Array.isArray(data) && data.length > 0) {',
                '        pm.collectionVariables.set("cohortId", data[0].id);',
                '    }',
                '});'
            ]
        )
    ]
}

# Module 05: Projects
m05 = {
    "name": "05. Projects",
    "description": "Portfolio health, project CRUD, team membership, role assignment, custom roles, and project lifecycle.",
    "item": [
        make_request(
            "Get Portfolio Health Overview (GET /api/projects/health-overview)", "GET", "{{baseUrl}}/api/projects/health-overview",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});',
                'pm.test("Health overview contains required summary and distribution", function () {',
                '    var data = pm.response.json();',
                '    pm.expect(data).to.have.property("summary");',
                '    pm.expect(data.summary).to.have.property("total");',
                '    pm.expect(data.summary.total).to.be.a("number");',
                '    pm.expect(data).to.have.property("health_distribution");',
                '});'
            ],
            description="Portfolio health and metrics. Fixed Assertion #51."
        ),
        make_request(
            "Get Tech Leads Overview (GET /api/projects/tech-leads)", "GET", "{{baseUrl}}/api/projects/tech-leads",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Get Permissions Registry (GET /api/projects/permissions/registry)", "GET", "{{baseUrl}}/api/projects/permissions/registry",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "List Projects (GET /api/projects)", "GET", "{{baseUrl}}/api/projects",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});',
                'pm.test("Extract active projectId for downstream chained tests", function () {',
                '    var data = pm.response.json();',
                '    var projs = data.projects || data.data || data;',
                '    pm.expect(Array.isArray(projs)).to.be.true;',
                '    if (projs.length > 0) {',
                '        pm.collectionVariables.set("projectId", projs[0].id);',
                '        pm.collectionVariables.set("projectName", projs[0].name);',
                '    }',
                '});'
            ]
        ),
        make_request(
            "Create Temporary Project (POST /api/projects)", "POST", "{{baseUrl}}/api/projects",
            auth_token="{{accessToken}}",
            prerequest_scripts=[
                'var ts = Date.now();',
                'pm.variables.set("dynProjectName", "Postman Integration Suite Project " + ts);'
            ],
            body_json={
                "name": "{{dynProjectName}}",
                "description": "Temporary project generated by Postman automated integration test runner.",
                "methodology": "SCRUM",
                "start_date": "2026-10-21T17:43:11.405Z",
                "end_date": "2026-11-20T17:43:11.406Z"
            },
            test_scripts=[
                'pm.test("Status code is 201", function () {',
                '    pm.response.to.have.status(201);',
                '});',
                'pm.test("Captures testProjectId", function () {',
                '    var data = pm.response.json();',
                '    var id = data.id || (data.project && data.project.id);',
                '    pm.expect(id).to.be.ok;',
                '    pm.collectionVariables.set("testProjectId", id);',
                '});'
            ]
        ),
        make_request(
            "Get Project by ID (GET /api/projects/:id)", "GET", "{{baseUrl}}/api/projects/{{projectId}}",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});',
                'pm.test("Returns project object with methodology and health", function () {',
                '    var data = pm.response.json();',
                '    var proj = data.project || data;',
                '    pm.expect(proj).to.have.property("methodology");',
                '    pm.expect(proj).to.have.property("status");',
                '});'
            ]
        ),
        make_request(
            "Update Project Details (PATCH /api/projects/:id)", "PATCH", "{{baseUrl}}/api/projects/{{testProjectId}}",
            auth_token="{{accessToken}}",
            body_json={"description": "Updated description by Postman test script.", "status": "ACTIVE"},
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "List Project Members (GET /api/projects/:id/members)", "GET", "{{baseUrl}}/api/projects/{{projectId}}/members",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});',
                'pm.test("Members array returned", function () {',
                '    var data = pm.response.json();',
                '    var members = data.members || data.data || data;',
                '    pm.expect(Array.isArray(members)).to.be.true;',
                '});'
            ]
        ),
        make_request(
            "Add Member to Project (POST /api/projects/:id/members)", "POST", "{{baseUrl}}/api/projects/{{testProjectId}}/members",
            auth_token="{{accessToken}}",
            body_json={"userId": "{{internUserId}}", "role": "DEVELOPER"},
            test_scripts=[
                'pm.test("Status code is 201 or 400 (if already member)", function () {',
                '    pm.expect([201, 400]).to.include(pm.response.code);',
                '});'
            ]
        ),
        make_request(
            "Update Member Roles (PATCH /api/projects/:id/members/roles)", "PATCH", "{{baseUrl}}/api/projects/{{testProjectId}}/members/roles",
            auth_token="{{accessToken}}",
            body_json={"roles": [{"user_id": "{{internUserId}}", "project_role": "BUSINESS_ANALYST"}]},
            test_scripts=[
                'pm.test("Status code is 200 or 400", function () {',
                '    pm.expect([200, 400]).to.include(pm.response.code);',
                '});'
            ]
        ),
        make_request(
            "Update Member Permissions (PATCH /api/projects/:id/members/:userId/permissions)", "PATCH", "{{baseUrl}}/api/projects/{{testProjectId}}/members/{{internUserId}}/permissions",
            auth_token="{{accessToken}}",
            body_json={"permissions": ["TASK_CREATE", "TASK_UPDATE"]},
            test_scripts=[
                'pm.test("Status code is 200 or 400", function () {',
                '    pm.expect([200, 400]).to.include(pm.response.code);',
                '});'
            ]
        ),
        make_request(
            "Remove Member from Project (DELETE /api/projects/:id/members/:userId)", "DELETE", "{{baseUrl}}/api/projects/{{testProjectId}}/members/{{internUserId}}",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200 or 400", function () {',
                '    pm.expect([200, 400]).to.include(pm.response.code);',
                '});'
            ]
        ),
        make_request(
            "Get Custom Project Roles (GET /api/projects/:id/roles)", "GET", "{{baseUrl}}/api/projects/{{projectId}}/roles",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Create Custom Project Role (POST /api/projects/:id/roles)", "POST", "{{baseUrl}}/api/projects/{{testProjectId}}/roles",
            auth_token="{{accessToken}}",
            prerequest_scripts=['pm.variables.set("dynRoleName", "Security Lead " + Date.now());'],
            body_json={"name": "{{dynRoleName}}", "description": "Responsible for security compliance", "permissions": ["PROJECT_READ", "TASK_READ", "TASK_UPDATE"]},
            test_scripts=[
                'pm.test("Status code is 201", function () {',
                '    pm.response.to.have.status(201);',
                '    var data = pm.response.json();',
                '    var roleId = data.role ? data.role.id : data.id;',
                '    pm.collectionVariables.set("customRoleId", roleId);',
                '});'
            ]
        ),
        make_request(
            "Get Project Extension Requests (GET /api/projects/:id/extension-requests)", "GET", "{{baseUrl}}/api/projects/{{projectId}}/extension-requests",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Archive Project (POST /api/projects/:id/archive)", "POST", "{{baseUrl}}/api/projects/{{testProjectId}}/archive",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Delete Project (DELETE /api/projects/:id)", "DELETE", "{{baseUrl}}/api/projects/{{testProjectId}}",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Negative: Get Non-Existent Project (GET /api/projects/:id)", "GET", "{{baseUrl}}/api/projects/00000000-0000-0000-0000-000000000000",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 404", function () {',
                '    pm.response.to.have.status(404);',
                '});'
            ]
        ),
        make_request(
            "Negative: Create Project Without Name (POST /api/projects)", "POST", "{{baseUrl}}/api/projects",
            auth_token="{{accessToken}}",
            body_json={"methodology": "SCRUM"},
            test_scripts=[
                'pm.test("Status code is 400", function () {',
                '    pm.response.to.have.status(400);',
                '});'
            ]
        )
    ]
}

# Module 06: Sprints
m06 = {
    "name": "06. Project Sprints",
    "description": "Sprint planning and execution: sprint creation, editing, single-active lifecycle start, completion with task rollover, reopen, and deletion.",
    "item": [
        make_request(
            "List Project Sprints (GET /api/projects/:id/sprints)", "GET", "{{baseUrl}}/api/projects/{{projectId}}/sprints",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});',
                'pm.test("Captures existing sprintId for task linking", function () {',
                '    var data = pm.response.json();',
                '    var sprints = data.sprints || data.data || data;',
                '    if (Array.isArray(sprints) && sprints.length > 0) {',
                '        pm.collectionVariables.set("sprintId", sprints[0].id);',
                '    }',
                '});'
            ]
        ),
        make_request(
            "Create New Sprint (POST /api/projects/:id/sprints)", "POST", "{{baseUrl}}/api/projects/{{projectId}}/sprints",
            auth_token="{{accessToken}}",
            prerequest_scripts=['pm.variables.set("dynSprintName", "Postman Sprint " + Date.now());'],
            body_json={
                "name": "{{dynSprintName}}",
                "goal": "Automated sprint testing",
                "start_date": "2026-10-21T17:43:11.406Z",
                "end_date": "2026-11-04T17:43:11.406Z"
            },
            test_scripts=[
                'pm.test("Status code is 201", function () {',
                '    pm.response.to.have.status(201);',
                '    var data = pm.response.json();',
                '    var id = data.id || (data.sprint && data.sprint.id);',
                '    pm.collectionVariables.set("testSprintId", id);',
                '});'
            ]
        ),
        make_request(
            "Get Sprint by ID (GET /api/projects/:id/sprints/:sprintId)", "GET", "{{baseUrl}}/api/projects/{{projectId}}/sprints/{{sprintId}}",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Update Sprint (PATCH /api/projects/:id/sprints/:sprintId)", "PATCH", "{{baseUrl}}/api/projects/{{projectId}}/sprints/{{testSprintId}}",
            auth_token="{{accessToken}}",
            body_json={"goal": "Updated sprint goal for test verification"},
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Start Sprint (POST /api/projects/:id/sprints/:sprintId/start)", "POST", "{{baseUrl}}/api/projects/{{projectId}}/sprints/{{testSprintId}}/start",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200 or 400 (if active sprint exists)", function () {',
                '    pm.expect([200, 400]).to.include(pm.response.code);',
                '});'
            ]
        ),
        make_request(
            "Complete Sprint (POST /api/projects/:id/sprints/:sprintId/complete)", "POST", "{{baseUrl}}/api/projects/{{projectId}}/sprints/{{testSprintId}}/complete",
            auth_token="{{accessToken}}",
            body_json={"unfinished_action": "MOVE_TO_BACKLOG"},
            test_scripts=[
                'pm.test("Status code is 200 or 400", function () {',
                '    pm.expect([200, 400]).to.include(pm.response.code);',
                '});'
            ]
        ),
        make_request(
            "Reopen Sprint (POST /api/projects/:id/sprints/:sprintId/reopen)", "POST", "{{baseUrl}}/api/projects/{{projectId}}/sprints/{{testSprintId}}/reopen",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200 or 400", function () {',
                '    pm.expect([200, 400]).to.include(pm.response.code);',
                '});'
            ]
        ),
        make_request(
            "Delete Sprint (DELETE /api/projects/:id/sprints/:sprintId)", "DELETE", "{{baseUrl}}/api/projects/{{projectId}}/sprints/{{testSprintId}}",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Negative: Create Sprint Without Name (POST /api/projects/:id/sprints)", "POST", "{{baseUrl}}/api/projects/{{projectId}}/sprints",
            auth_token="{{accessToken}}",
            body_json={"goal": "Missing name"},
            test_scripts=[
                'pm.test("Status code is 400", function () {',
                '    pm.response.to.have.status(400);',
                '});'
            ]
        )
    ]
}

# Module 07: Documents
m07 = {
    "name": "07. Project Documents",
    "description": "Document management: metadata records, file uploads, previews, downloads, and deletion.",
    "item": [
        make_request(
            "List Project Documents (GET /api/projects/:id/documents)", "GET", "{{baseUrl}}/api/projects/{{projectId}}/documents",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});',
                'pm.test("Extracts documentId if available", function () {',
                '    var data = pm.response.json();',
                '    var docs = data.documents || data.data || data;',
                '    if (Array.isArray(docs) && docs.length > 0) {',
                '        pm.collectionVariables.set("documentId", docs[0].id);',
                '    }',
                '});'
            ]
        ),
        make_request(
            "Create Project Document (POST /api/projects/:id/documents)", "POST", "{{baseUrl}}/api/projects/{{projectId}}/documents",
            auth_token="{{accessToken}}",
            body_json={
                "name": "Architecture-Specification-v2.pdf",
                "document_type": "ARCHITECTURE",
                "file_size": 1048576,
                "mime_type": "application/pdf",
                "url": "https://storage.local/projects/docs/spec.pdf"
            },
            test_scripts=[
                'pm.test("Status code is 201", function () {',
                '    pm.response.to.have.status(201);',
                '});',
                'pm.test("Captures created documentId", function () {',
                '    var data = pm.response.json();',
                '    var id = data.id || (data.document && data.document.id);',
                '    pm.expect(id).to.be.ok;',
                '    pm.collectionVariables.set("documentId", id);',
                '});'
            ]
        ),
        make_request(
            "Preview Document (GET /api/projects/:id/documents/:documentId/preview)", "GET", "{{baseUrl}}/api/projects/{{projectId}}/documents/{{documentId}}/preview",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200 or 404", function () {',
                '    pm.expect([200, 404]).to.include(pm.response.code);',
                '});'
            ]
        ),
        make_request(
            "Download Document (GET /api/projects/:id/documents/:documentId/download)", "GET", "{{baseUrl}}/api/projects/{{projectId}}/documents/{{documentId}}/download",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200 or 404", function () {',
                '    pm.expect([200, 404]).to.include(pm.response.code);',
                '});'
            ]
        ),
        make_request(
            "Update Document Metadata (PATCH /api/projects/:id/documents/:documentId)", "PATCH", "{{baseUrl}}/api/projects/{{projectId}}/documents/{{documentId}}",
            auth_token="{{accessToken}}",
            body_json={"name": "Renamed-Architecture-Specification.pdf"},
            test_scripts=[
                'pm.test("Status code is 200 or 404", function () {',
                '    pm.expect([200, 404]).to.include(pm.response.code);',
                '});'
            ]
        ),
        make_request(
            "Delete Document (DELETE /api/projects/:id/documents/:documentId)", "DELETE", "{{baseUrl}}/api/projects/{{projectId}}/documents/{{documentId}}",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200 or 404", function () {',
                '    pm.expect([200, 404]).to.include(pm.response.code);',
                '});'
            ]
        ),
        make_request(
            "Negative: Preview Non-Existent Document (GET /api/projects/:id/documents/:documentId/preview)", "GET", "{{baseUrl}}/api/projects/{{projectId}}/documents/00000000-0000-0000-0000-000000000000/preview",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 404", function () {',
                '    pm.response.to.have.status(404);',
                '});'
            ]
        )
    ]
}

# Module 08: Work Items
m08 = {
    "name": "08. Work Items (Tasks & Kanban)",
    "description": "Jira-style work items: Epic/Story/Task/Subtask hierarchy, story points, kanban boards, assignee management, comments, and due-date extension requests.",
    "item": [
        make_request(
            "List Work Items (GET /api/work-items)", "GET", "{{baseUrl}}/api/work-items?project_id={{projectId}}&limit=50",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});',
                'pm.test("Captures existing workItemId for chaining", function () {',
                '    var data = pm.response.json();',
                '    var items = data.work_items || data.data || data;',
                '    if (Array.isArray(items) && items.length > 0) {',
                '        pm.collectionVariables.set("workItemId", items[0].id);',
                '    }',
                '});'
            ]
        ),
        make_request(
            "Get Kanban Board Summary (GET /api/work-items/kanban-summary)", "GET", "{{baseUrl}}/api/work-items/kanban-summary?project_id={{projectId}}",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});',
                'pm.test("Returns kanban column buckets", function () {',
                '    var data = pm.response.json();',
                '    var summary = data.kanban_summary || data;',
                '    pm.expect(summary).to.have.property("todo");',
                '    pm.expect(summary).to.have.property("completed");',
                '});'
            ],
            description="Aggregates work items grouped by workflow columns. Fixed Assertion #96."
        ),
        make_request(
            "Get Work Item Analytics (GET /api/work-items/analytics)", "GET", "{{baseUrl}}/api/work-items/analytics?project_id={{projectId}}",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Create EPIC (POST /api/work-items)", "POST", "{{baseUrl}}/api/work-items",
            auth_token="{{accessToken}}",
            prerequest_scripts=['pm.variables.set("dynEpicTitle", "Epic: Auth Security " + Date.now());'],
            body_json={
                "title": "{{dynEpicTitle}}",
                "description": "Root epic governing security and auth enhancements.",
                "project_id": "{{projectId}}",
                "type": "EPIC",
                "status": "IN_PROGRESS",
                "priority": "HIGH",
                "story_points": 0
            },
            test_scripts=[
                'pm.test("Status code is 201", function () {',
                '    pm.response.to.have.status(201);',
                '});',
                'pm.test("Captures created epicId", function () {',
                '    var data = pm.response.json();',
                '    var item = data.work_item || data;',
                '    pm.expect(item.id).to.be.ok;',
                '    pm.collectionVariables.set("epicId", item.id);',
                '    pm.collectionVariables.set("workItemId", item.id);',
                '});'
            ]
        ),
        make_request(
            "Create STORY under EPIC (POST /api/work-items)", "POST", "{{baseUrl}}/api/work-items",
            auth_token="{{accessToken}}",
            prerequest_scripts=['pm.variables.set("dynStoryTitle", "Story: JWT Rotation " + Date.now());'],
            body_json={
                "title": "{{dynStoryTitle}}",
                "description": "As a user, my old tokens must invalidate when logging out.",
                "project_id": "{{projectId}}",
                "parent_id": "{{epicId}}",
                "type": "STORY",
                "status": "IN_PROGRESS",
                "priority": "HIGH",
                "story_points": 5
            },
            test_scripts=[
                'pm.test("Status code is 201", function () {',
                '    pm.response.to.have.status(201);',
                '});',
                'pm.test("Captures created storyId", function () {',
                '    var data = pm.response.json();',
                '    var item = data.work_item || data;',
                '    pm.expect(item.id).to.be.ok;',
                '    pm.collectionVariables.set("storyId", item.id);',
                '});'
            ]
        ),
        make_request(
            "Create TASK under STORY (POST /api/work-items)", "POST", "{{baseUrl}}/api/work-items",
            auth_token="{{accessToken}}",
            prerequest_scripts=['pm.variables.set("dynTaskTitle", "Task: Implement Redis Blacklist " + Date.now());'],
            body_json={
                "title": "{{dynTaskTitle}}",
                "description": "Connect Redis cluster and set token TTLs on logout.",
                "project_id": "{{projectId}}",
                "parent_id": "{{storyId}}",
                "type": "TASK",
                "status": "TODO",
                "priority": "MEDIUM",
                "story_points": 3
            },
            test_scripts=[
                'pm.test("Status code is 201", function () {',
                '    pm.response.to.have.status(201);',
                '});',
                'pm.test("Captures created taskId", function () {',
                '    var data = pm.response.json();',
                '    var item = data.work_item || data;',
                '    pm.expect(item.id).to.be.ok;',
                '    pm.collectionVariables.set("taskId", item.id);',
                '});'
            ]
        ),
        make_request(
            "Create SUBTASK under TASK (POST /api/work-items)", "POST", "{{baseUrl}}/api/work-items",
            auth_token="{{accessToken}}",
            prerequest_scripts=['pm.variables.set("dynSubtaskTitle", "Subtask: Unit tests " + Date.now());'],
            body_json={
                "title": "{{dynSubtaskTitle}}",
                "description": "Write Jest test cases for Redis key eviction.",
                "project_id": "{{projectId}}",
                "parent_id": "{{taskId}}",
                "type": "SUBTASK",
                "status": "TODO",
                "priority": "LOW",
                "story_points": 1
            },
            test_scripts=[
                'pm.test("Status code is 201", function () {',
                '    pm.response.to.have.status(201);',
                '});',
                'pm.test("Captures created subtaskId", function () {',
                '    var data = pm.response.json();',
                '    var item = data.work_item || data;',
                '    pm.expect(item.id).to.be.ok;',
                '    pm.collectionVariables.set("subtaskId", item.id);',
                '});'
            ]
        ),
        make_request(
            "Get Work Item by ID (GET /api/work-items/:id)", "GET", "{{baseUrl}}/api/work-items/{{taskId}}",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Update Work Item Status (PATCH /api/work-items/:id)", "PATCH", "{{baseUrl}}/api/work-items/{{taskId}}",
            auth_token="{{accessToken}}",
            body_json={"status": "IN_PROGRESS", "story_points": 5},
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Full Work Item Update (PUT /api/work-items/:id)", "PUT", "{{baseUrl}}/api/work-items/{{taskId}}",
            auth_token="{{accessToken}}",
            body_json={"title": "Fully Updated Task Title", "status": "IN_REVIEW", "priority": "URGENT"},
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Add Assignees to Work Item (POST /api/work-items/:id/assignees)", "POST", "{{baseUrl}}/api/work-items/{{taskId}}/assignees",
            auth_token="{{accessToken}}",
            body_json={"userIds": ["{{internUserId}}"]},
            test_scripts=[
                'pm.test("Status code is 200 or 400", function () {',
                '    pm.expect([200, 400]).to.include(pm.response.code);',
                '});'
            ]
        ),
        make_request(
            "Remove Assignee (DELETE /api/work-items/:id/assignees/:userId)", "DELETE", "{{baseUrl}}/api/work-items/{{taskId}}/assignees/{{internUserId}}",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200 or 404", function () {',
                '    pm.expect([200, 404]).to.include(pm.response.code);',
                '});'
            ]
        ),
        make_request(
            "List Work Item Comments (GET /api/work-items/:id/comments)", "GET", "{{baseUrl}}/api/work-items/{{taskId}}/comments",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Add Comment to Work Item (POST /api/work-items/:id/comments)", "POST", "{{baseUrl}}/api/work-items/{{taskId}}/comments",
            auth_token="{{accessToken}}",
            body_json={"content": "Automated Postman test comment: Task progress on track."},
            test_scripts=[
                'pm.test("Status code is 201", function () {',
                '    pm.response.to.have.status(201);',
                '});',
                'pm.test("Captures created commentId", function () {',
                '    var data = pm.response.json();',
                '    var comment = data.comment || data;',
                '    pm.expect(comment.id).to.be.ok;',
                '    pm.collectionVariables.set("commentId", comment.id);',
                '});'
            ]
        ),
        make_request(
            "Update Comment (PUT /api/work-items/:id/comments/:commentId)", "PUT", "{{baseUrl}}/api/work-items/{{taskId}}/comments/{{commentId}}",
            auth_token="{{accessToken}}",
            body_json={"content": "Updated comment text by Postman script."},
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Delete Comment (DELETE /api/work-items/:id/comments/:commentId)", "DELETE", "{{baseUrl}}/api/work-items/{{taskId}}/comments/{{commentId}}",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Request Due-Date Extension (POST /api/work-items/:id/extension-request)", "POST", "{{baseUrl}}/api/work-items/{{taskId}}/extension-request",
            auth_token="{{internToken}}",
            body_json={
                "requested_date": "2026-10-28T17:43:11.407Z",
                "reason": "Need additional time for end-to-end integration testing."
            },
            test_scripts=[
                'pm.test("Status code is 201 or 400", function () {',
                '    pm.expect([201, 400]).to.include(pm.response.code);',
                '    if (pm.response.code === 201) {',
                '        var data = pm.response.json();',
                '        var reqId = data.id || (data.request && data.request.id);',
                '        pm.collectionVariables.set("extensionRequestId", reqId);',
                '    }',
                '});'
            ]
        ),
        make_request(
            "Get Task Extension Requests (GET /api/work-items/:id/extension-requests)", "GET", "{{baseUrl}}/api/work-items/{{taskId}}/extension-requests",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Decide Extension Request (POST /api/work-items/:id/extension-requests/:requestId/decision)", "POST", "{{baseUrl}}/api/work-items/{{taskId}}/extension-requests/{{extensionRequestId}}/decision",
            auth_token="{{accessToken}}",
            body_json={"decision": "APPROVED", "review_note": "Approved for 7 days based on technical complexity."},
            test_scripts=[
                'pm.test("Status code is 200 or 400/404", function () {',
                '    pm.expect([200, 400, 404]).to.include(pm.response.code);',
                '});'
            ]
        ),
        make_request(
            "Delete Subtask (DELETE /api/work-items/:id)", "DELETE", "{{baseUrl}}/api/work-items/{{subtaskId}}",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Negative: Reject Negative Story Points (POST /api/work-items)", "POST", "{{baseUrl}}/api/work-items",
            auth_token="{{accessToken}}",
            body_json={"title": "Invalid Story Points Task", "project_id": "{{projectId}}", "type": "TASK", "story_points": -5},
            test_scripts=[
                'pm.test("Status code is 400", function () {',
                '    pm.response.to.have.status(400);',
                '});'
            ]
        ),
        make_request(
            "Negative: Non-Existent Work Item (GET /api/work-items/:id)", "GET", "{{baseUrl}}/api/work-items/00000000-0000-0000-0000-000000000000",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 404", function () {',
                '    pm.response.to.have.status(404);',
                '});'
            ]
        )
    ]
}

# Module 09: Forms
m09 = {
    "name": "09. Forms & Evaluations",
    "description": "Dynamic form creation, question authoring, publishing lifecycle, intern responses, submissions review, overdue tracking, and CSV/Excel exports.",
    "item": [
        make_request(
            "List Organization Forms (GET /api/forms)", "GET", "{{baseUrl}}/api/forms",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});',
                'pm.test("Captures existing formId if present", function () {',
                '    var data = pm.response.json();',
                '    var forms = data.forms || data.data || data;',
                '    if (Array.isArray(forms) && forms.length > 0) {',
                '        pm.collectionVariables.set("formId", forms[0].id);',
                '    }',
                '});'
            ]
        ),
        make_request(
            "Get Overdue Forms Summary (GET /api/forms/overdue/summary)", "GET", "{{baseUrl}}/api/forms/overdue/summary",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Export Overdue Report CSV (GET /api/forms/overdue/export)", "GET", "{{baseUrl}}/api/forms/overdue/export?format=csv",
            auth_token="{{accessToken}}",
            headers={"Accept": "text/csv"},
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Create New Form (POST /api/forms)", "POST", "{{baseUrl}}/api/forms",
            auth_token="{{accessToken}}",
            prerequest_scripts=['pm.variables.set("dynFormTitle", "Weekly Progress Evaluation " + Date.now());'],
            body_json={
                "title": "{{dynFormTitle}}",
                "description": "Weekly mandatory self-assessment form for technical interns.",
                "target_roles": ["INTERN"],
                "deadline": "2026-10-28T17:43:11.407Z"
            },
            test_scripts=[
                'pm.test("Status code is 201", function () {',
                '    pm.response.to.have.status(201);',
                '});',
                'pm.test("Captures testFormId", function () {',
                '    var data = pm.response.json();',
                '    var id = data.id || (data.form && data.form.id);',
                '    pm.expect(id).to.be.ok;',
                '    pm.collectionVariables.set("testFormId", id);',
                '    pm.collectionVariables.set("formId", id);',
                '});'
            ]
        ),
        make_request(
            "Get Form by ID (GET /api/forms/:id)", "GET", "{{baseUrl}}/api/forms/{{testFormId}}",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Add Question to Form (POST /api/forms/:id/questions)", "POST", "{{baseUrl}}/api/forms/{{testFormId}}/questions",
            auth_token="{{accessToken}}",
            body_json={
                "question_text": "What major deliverables did you complete this week?",
                "question_type": "TEXT",
                "is_required": True,
                "order_index": 0
            },
            test_scripts=[
                'pm.test("Status code is 201", function () {',
                '    pm.response.to.have.status(201);',
                '});',
                'pm.test("Captures questionId", function () {',
                '    var data = pm.response.json();',
                '    var id = data.id || (data.question && data.question.id);',
                '    pm.expect(id).to.be.ok;',
                '    pm.collectionVariables.set("questionId", id);',
                '});'
            ]
        ),
        make_request(
            "Update Question (PATCH /api/forms/:id/questions/:questionId)", "PATCH", "{{baseUrl}}/api/forms/{{testFormId}}/questions/{{questionId}}",
            auth_token="{{accessToken}}",
            body_json={
                "question_text": "Updated: What major engineering deliverables did you complete this week?",
                "is_required": False
            },
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Update Form Metadata (PATCH /api/forms/:id)", "PATCH", "{{baseUrl}}/api/forms/{{testFormId}}",
            auth_token="{{accessToken}}",
            body_json={"title": "Revised Weekly Progress Evaluation"},
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Publish Form (POST /api/forms/:id/publish)", "POST", "{{baseUrl}}/api/forms/{{testFormId}}/publish",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Get Current User Form Submission (GET /api/forms/:id/submissions/my)", "GET", "{{baseUrl}}/api/forms/{{testFormId}}/submissions/my",
            auth_token="{{internToken}}",
            test_scripts=[
                'pm.test("Status code is 200 or 404", function () {',
                '    pm.expect([200, 404]).to.include(pm.response.code);',
                '});'
            ]
        ),
        make_request(
            "Submit Form Response (POST /api/forms/:id/submissions)", "POST", "{{baseUrl}}/api/forms/{{testFormId}}/submissions",
            auth_token="{{internToken}}",
            body_json={
                "answers": [
                    {
                        "question_id": "{{questionId}}",
                        "value_text": "Completed authentication test automation suite with zero regressions."
                    }
                ]
            },
            test_scripts=[
                'pm.test("Status code is 201 or 400 (if already submitted)", function () {',
                '    pm.expect([201, 400]).to.include(pm.response.code);',
                '    if (pm.response.code === 201) {',
                '        var data = pm.response.json();',
                '        var id = data.id || (data.submission && data.submission.id);',
                '        pm.collectionVariables.set("submissionId", id);',
                '    }',
                '});'
            ]
        ),
        make_request(
            "List Form Submissions (GET /api/forms/:id/submissions)", "GET", "{{baseUrl}}/api/forms/{{testFormId}}/submissions",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Revert Form to Draft (POST /api/forms/:id/revert)", "POST", "{{baseUrl}}/api/forms/{{testFormId}}/revert",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Unpublish Form Alias (POST /api/forms/:id/unpublish)", "POST", "{{baseUrl}}/api/forms/{{testFormId}}/unpublish",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200 or 400", function () {',
                '    pm.expect([200, 400]).to.include(pm.response.code);',
                '});'
            ]
        ),
        make_request(
            "Archive Form (POST /api/forms/:id/archive)", "POST", "{{baseUrl}}/api/forms/{{testFormId}}/archive",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Delete Question (DELETE /api/forms/:id/questions/:questionId)", "DELETE", "{{baseUrl}}/api/forms/{{testFormId}}/questions/{{questionId}}",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Delete Form (DELETE /api/forms/:id)", "DELETE", "{{baseUrl}}/api/forms/{{testFormId}}",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Negative: Non-Existent Form (GET /api/forms/:id)", "GET", "{{baseUrl}}/api/forms/00000000-0000-0000-0000-000000000000",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 404", function () {',
                '    pm.response.to.have.status(404);',
                '});'
            ]
        )
    ]
}

# Module 10: Notifications
m10 = {
    "name": "10. Notifications",
    "description": "Notifications dispatching (Direct, Broadcast, System), unread count tracking, archiving, and read status.",
    "item": [
        make_request(
            "List User Notifications (GET /api/notifications)", "GET", "{{baseUrl}}/api/notifications",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});',
                'pm.test("Captures notificationId if available", function () {',
                '    var data = pm.response.json();',
                '    var notifs = data.notifications || data.data || data;',
                '    if (Array.isArray(notifs) && notifs.length > 0) {',
                '        pm.collectionVariables.set("notificationId", notifs[0].id);',
                '    }',
                '});'
            ]
        ),
        make_request(
            "Get Unread Count (GET /api/notifications/unread-count)", "GET", "{{baseUrl}}/api/notifications/unread-count",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});',
                'pm.test("Unread count is a non-negative number", function () {',
                '    var data = pm.response.json();',
                '    pm.expect(data).to.have.property("count");',
                '    pm.expect(data.count).to.be.at.least(0);',
                '});'
            ]
        ),
        make_request(
            "Create Broadcast Notification (POST /api/notifications)", "POST", "{{baseUrl}}/api/notifications",
            auth_token="{{accessToken}}",
            body_json={
                "title": "Platform Maintenance Notice",
                "message": "Automated Postman broadcast test notification: scheduled maintenance tonight.",
                "type": "BROADCAST",
                "recipient_ids": ["ALL_INTERNS"]
            },
            test_scripts=[
                'pm.test("Status code is 201", function () {',
                '    pm.response.to.have.status(201);',
                '});',
                'pm.test("Captures notificationId", function () {',
                '    var data = pm.response.json();',
                '    var id = data.id || (data.notification && data.notification.id);',
                '    pm.expect(id).to.be.ok;',
                '    pm.collectionVariables.set("notificationId", id);',
                '});'
            ]
        ),
        make_request(
            "Mark Single Notification as Read (PATCH /api/notifications/:id/read)", "PATCH", "{{baseUrl}}/api/notifications/{{notificationId}}/read",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Mark Notification Read Alias (PATCH /api/notifications/:id)", "PATCH", "{{baseUrl}}/api/notifications/{{notificationId}}",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Mark All Notifications as Read (PATCH /api/notifications/read-all)", "PATCH", "{{baseUrl}}/api/notifications/read-all",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Archive Notification (PATCH /api/notifications/:id/archive)", "PATCH", "{{baseUrl}}/api/notifications/{{notificationId}}/archive",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Unarchive Notification (PATCH /api/notifications/:id/unarchive)", "PATCH", "{{baseUrl}}/api/notifications/{{notificationId}}/unarchive",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Negative: Create Notification Missing Title (POST /api/notifications)", "POST", "{{baseUrl}}/api/notifications",
            auth_token="{{accessToken}}",
            body_json={"message": "Missing title in payload"},
            test_scripts=[
                'pm.test("Status code is 400", function () {',
                '    pm.response.to.have.status(400);',
                '});'
            ]
        )
    ]
}

# Module 11: Timesheets & Attendance
m11 = {
    "name": "11. Timesheets & Attendance",
    "description": "Work policy enforcement, clock in/out sessions, manual time entries, weekly/monthly timesheets, manager reviews, and time correction requests.",
    "item": [
        make_request(
            "Get Organization Policy (GET /api/timesheet/organization-policy)", "GET", "{{baseUrl}}/api/timesheet/organization-policy",
            auth_token="{{superAdminToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Upsert Organization Policy (PUT /api/timesheet/organization-policy)", "PUT", "{{baseUrl}}/api/timesheet/organization-policy",
            auth_token="{{superAdminToken}}",
            body_json={
                "office_start_time": "09:00",
                "office_end_time": "18:15",
                "break_start_time": "13:00",
                "break_end_time": "14:00",
                "lunch_break_minutes": 60,
                "timezone": "Asia/Kolkata"
            },
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});',
                'pm.test("Organization work policy updated", function () {',
                '    var data = pm.response.json();',
                '    pm.expect(data).to.have.property("policy");',
                '});'
            ],
            description="Super Admin updates daily office policy parameters. Fixed Assertion #156."
        ),
        make_request(
            "Start Work Session (POST /api/timesheet/work-sessions/start)", "POST", "{{baseUrl}}/api/timesheet/work-sessions/start",
            auth_token="{{internToken}}",
            body_json={
                "session_type": "WORK",
                "description": "Active testing session started by Postman runner."
            },
            test_scripts=[
                'pm.test("Status code is 201 or 400 (if session already active)", function () {',
                '    pm.expect([201, 400]).to.include(pm.response.code);',
                '});'
            ],
            description="Intern clocks in and starts tracking session time. Fixed Assertion #157."
        ),
        make_request(
            "Get Active Work Session (GET /api/timesheet/work-sessions/active)", "GET", "{{baseUrl}}/api/timesheet/work-sessions/active",
            auth_token="{{internToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "End Work Session (POST /api/timesheet/work-sessions/end)", "POST", "{{baseUrl}}/api/timesheet/work-sessions/end",
            auth_token="{{internToken}}",
            body_json={"notes": "Testing session completed."},
            test_scripts=[
                'pm.test("Status code is 200 or 404 (if no active session)", function () {',
                '    pm.expect([200, 404]).to.include(pm.response.code);',
                '});'
            ]
        ),
        make_request(
            "Create Manual Time Entry (POST /api/timesheet/time-entries)", "POST", "{{baseUrl}}/api/timesheet/time-entries",
            auth_token="{{internToken}}",
            body_json={
                "task_id": "{{taskId}}",
                "duration_minutes": 120,
                "description": "Manual task time logged via automated Postman test.",
                "date": "2026-10-21"
            },
            test_scripts=[
                'pm.test("Status code is 201", function () {',
                '    pm.response.to.have.status(201);',
                '});',
                'pm.test("Captures timeEntryId", function () {',
                '    var data = pm.response.json();',
                '    var id = data.id || (data.entry && data.entry.id);',
                '    pm.expect(id).to.be.ok;',
                '    pm.collectionVariables.set("timeEntryId", id);',
                '});'
            ],
            description="Intern logs manual time entry against user timesheet. Fixed Assertion #160."
        ),
        make_request(
            "Update Time Entry (PATCH /api/timesheet/time-entries/:id)", "PATCH", "{{baseUrl}}/api/timesheet/time-entries/{{timeEntryId}}",
            auth_token="{{internToken}}",
            body_json={"duration_minutes": 150, "description": "Updated duration to 150 mins."},
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ],
            description="Updates manual time entry duration. Fixed Assertion #161."
        ),
        make_request(
            "Get Task Time Entries (GET /api/timesheet/tasks/:taskId/entries)", "GET", "{{baseUrl}}/api/timesheet/tasks/{{taskId}}/entries",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Get Today Timesheet (GET /api/timesheet/today)", "GET", "{{baseUrl}}/api/timesheet/today",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Get Weekly Timesheet (GET /api/timesheet/weekly)", "GET", "{{baseUrl}}/api/timesheet/weekly",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Get Monthly Timesheet (GET /api/timesheet/monthly)", "GET", "{{baseUrl}}/api/timesheet/monthly",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Get Task Time Summary (GET /api/timesheet/task-time)", "GET", "{{baseUrl}}/api/timesheet/task-time",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Get Intern Report (GET /api/timesheet/intern-report)", "GET", "{{baseUrl}}/api/timesheet/intern-report",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Get Manager Report (GET /api/timesheet/manager-report)", "GET", "{{baseUrl}}/api/timesheet/manager-report",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Review Timesheets (GET /api/timesheet/review)", "GET", "{{baseUrl}}/api/timesheet/review?period=WEEK",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Request Time Correction (POST /api/timesheet/corrections/request)", "POST", "{{baseUrl}}/api/timesheet/corrections/request",
            auth_token="{{internToken}}",
            body_json={
                "time_entry_id": "{{timeEntryId}}",
                "corrected_duration_minutes": 180,
                "reason": "Forgot to clock in due to morning standup meeting."
            },
            test_scripts=[
                'pm.test("Status code is 201 or 400", function () {',
                '    pm.expect([201, 400]).to.include(pm.response.code);',
                '    if (pm.response.code === 201) {',
                '        var data = pm.response.json();',
                '        var id = data.id || (data.correction && data.correction.id);',
                '        pm.collectionVariables.set("timeCorrectionId", id);',
                '    }',
                '});'
            ]
        ),
        make_request(
            "List Time Correction Requests (GET /api/timesheet/corrections)", "GET", "{{baseUrl}}/api/timesheet/corrections",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Review Time Correction (POST /api/timesheet/corrections/:requestId/review)", "POST", "{{baseUrl}}/api/timesheet/corrections/{{timeCorrectionId}}/review",
            auth_token="{{accessToken}}",
            body_json={"decision": "APPROVED", "decision_note": "Approved based on verified standup presence."},
            test_scripts=[
                'pm.test("Status code is 200 or 400/404", function () {',
                '    pm.expect([200, 400, 404]).to.include(pm.response.code);',
                '});'
            ]
        ),
        make_request(
            "Delete Time Entry (DELETE /api/timesheet/time-entries/:id)", "DELETE", "{{baseUrl}}/api/timesheet/time-entries/{{timeEntryId}}",
            auth_token="{{internToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ],
            description="Removes manual time entry. Fixed Assertion #171."
        )
    ]
}

# Module 12: Action Items
m12 = {
    "name": "12. Action Items",
    "description": "Meeting minutes and retrospective action items: assignment, priority, status tracking, and deletion.",
    "item": [
        make_request(
            "List Action Items (GET /api/action-items)", "GET", "{{baseUrl}}/api/action-items",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});',
                'pm.test("Captures existing actionItemId if available", function () {',
                '    var data = pm.response.json();',
                '    if (Array.isArray(data) && data.length > 0) {',
                '        pm.collectionVariables.set("actionItemId", data[0].id);',
                '    }',
                '});'
            ]
        ),
        make_request(
            "Create Action Item (POST /api/action-items)", "POST", "{{baseUrl}}/api/action-items",
            auth_token="{{accessToken}}",
            prerequest_scripts=['pm.variables.set("dynActionItemTitle", "Resolve CI/CD pipeline " + Date.now());'],
            body_json={
                "title": "{{dynActionItemTitle}}",
                "description": "Follow-up action item from sprint retrospective.",
                "project_id": "{{projectId}}",
                "priority": "HIGH",
                "status": "OPEN",
                "due_date": "2026-10-26T17:43:11.407Z"
            },
            test_scripts=[
                'pm.test("Status code is 201", function () {',
                '    pm.response.to.have.status(201);',
                '});',
                'pm.test("Captures created actionItemId", function () {',
                '    var data = pm.response.json();',
                '    var id = data.id || (data.item && data.item.id);',
                '    pm.expect(id).to.be.ok;',
                '    pm.collectionVariables.set("actionItemId", id);',
                '});'
            ]
        ),
        make_request(
            "Get Action Item by ID (GET /api/action-items/:id)", "GET", "{{baseUrl}}/api/action-items/{{actionItemId}}",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Update Action Item (PATCH /api/action-items/:id)", "PATCH", "{{baseUrl}}/api/action-items/{{actionItemId}}",
            auth_token="{{accessToken}}",
            body_json={"status": "COMPLETED", "priority": "URGENT"},
            test_scripts=[
                'pm.test("Status code is 200", function () {',
                '    pm.response.to.have.status(200);',
                '});'
            ]
        ),
        make_request(
            "Delete Action Item (DELETE /api/action-items/:id)", "DELETE", "{{baseUrl}}/api/action-items/{{actionItemId}}",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 204 or 200", function () {',
                '    pm.expect([200, 204]).to.include(pm.response.code);',
                '});'
            ]
        ),
        make_request(
            "Negative: Non-Existent Action Item (GET /api/action-items/:id)", "GET", "{{baseUrl}}/api/action-items/00000000-0000-0000-0000-000000000000",
            auth_token="{{accessToken}}",
            test_scripts=[
                'pm.test("Status code is 404", function () {',
                '    pm.response.to.have.status(404);',
                '});'
            ]
        )
    ]
}

collection["item"] = [m00, m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12]

# Write to file
postman_dir = os.path.join(os.path.dirname(__file__), "..", "postman")
os.makedirs(postman_dir, exist_ok=True)
out_path = os.path.join(postman_dir, "InternHub_API_Collection.json")

with open(out_path, "w", encoding="utf-8") as f:
    json.dump(collection, f, indent=2)

print(f"Generated collection successfully at {out_path}")
total_requests = sum(len(m["item"]) for m in collection["item"])
print(f"Total modules: {len(collection['item'])}, Total requests: {total_requests}")
