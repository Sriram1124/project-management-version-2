import { makeUrl, jsonHeader, acceptHeader, bearerAuth, noAuth, testScript, prerequestScript } from './postman-helpers';

export function getOrgUserCohortFolders(): any[] {
  const folders: any[] = [];

  // =========================================================================
  // 02. SUPER ADMIN & ORGANIZATIONS MODULE
  // =========================================================================
  folders.push({
    name: '02. Super Admin & Organizations',
    description: 'Endpoints for platform oversight, audit logging, multi-tenant organization lifecycle, and manager provisioning (Requires SUPER_ADMIN role).',
    item: [
      {
        name: 'Get Platform Overview KPIs (GET /api/organizations/platform-overview)',
        request: {
          auth: bearerAuth('superAdminToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/organizations/platform-overview'),
          description: 'Global high-level platform KPIs, status counts, and recent platform events.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 403 (if superAdminToken not available)", function () {',
            '    pm.expect([200, 403]).to.include(pm.response.code);',
            '    if (pm.response.code === 200) {',
            '        var data = pm.response.json();',
            '        pm.expect(data).to.have.property("kpis");',
            '        pm.expect(data.kpis).to.have.property("totalOrganizations");',
            '    }',
            '});',
          ]),
        ],
      },
      {
        name: 'List Platform Audit Logs (GET /api/organizations/audit-logs)',
        request: {
          auth: bearerAuth('superAdminToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/organizations/audit-logs', [
            { key: 'page', value: '1' },
            { key: 'limit', value: '20' },
          ]),
          description: 'Retrieves security and operational audit trail logs across organizations.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 403", function () {',
            '    pm.expect([200, 403]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'List All Organizations (GET /api/organizations)',
        request: {
          auth: bearerAuth('superAdminToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/organizations', [
            { key: 'status', value: 'all' },
            { key: 'page', value: '1' },
            { key: 'limit', value: '25' },
          ]),
          description: 'Lists all tenant organizations with metrics and status.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 403", function () {',
            '    pm.expect([200, 403]).to.include(pm.response.code);',
            '    if (pm.response.code === 200) {',
            '        var data = pm.response.json();',
            '        var orgs = data.organizations || data;',
            '        if (Array.isArray(orgs) && orgs.length > 0) {',
            '            pm.collectionVariables.set("testOrgId", orgs[0].id);',
            '        }',
            '    }',
            '});',
          ]),
        ],
      },
      {
        name: 'Create Organization (POST /api/organizations)',
        request: {
          auth: bearerAuth('superAdminToken'),
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              organizationName: 'Postman Automated Test Org {{dynamicTimestamp}}',
              managerName: 'Postman Test Manager',
              managerEmail: 'test.mgr.{{dynamicTimestamp}}@example.com',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/organizations'),
          description: 'Provisions an organization and initial manager atomically.',
        },
        event: [
          testScript([
            'pm.test("Status code is 201 or 403/409", function () {',
            '    pm.expect([201, 403, 409]).to.include(pm.response.code);',
            '    if (pm.response.code === 201) {',
            '        var data = pm.response.json();',
            '        var orgId = data.organization ? data.organization.id : data.id;',
            '        pm.collectionVariables.set("testOrgId", orgId);',
            '        if (pm.environment) { pm.environment.set("testOrgId", orgId); }',
            '        if (data.manager) {',
            '            pm.collectionVariables.set("testManagerId", data.manager.id);',
            '            if (pm.environment) { pm.environment.set("testManagerId", data.manager.id); }',
            '        }',
            '    }',
            '});',
          ]),
        ],
      },
      {
        name: 'Get Organization Details (GET /api/organizations/:id)',
        request: {
          auth: bearerAuth('superAdminToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/organizations/:testOrgId'),
          description: 'Fetches details of a specific organization by ID.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 403/404", function () {',
            '    pm.expect([200, 403, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Update Organization (PATCH /api/organizations/:id)',
        request: {
          auth: bearerAuth('superAdminToken'),
          method: 'PATCH',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              name: 'Updated Test Org {{dynamicTimestamp}}',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/organizations/:testOrgId'),
          description: 'Updates organization name or properties.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 403/404", function () {',
            '    pm.expect([200, 403, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Toggle Organization Status (POST /api/organizations/:id/toggle-status)',
        request: {
          auth: bearerAuth('superAdminToken'),
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              is_active: true,
              reason: 'Automated Postman Verification Test',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/organizations/:testOrgId/toggle-status'),
          description: 'Suspends or reactivates an organization tenant.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 403/404", function () {',
            '    pm.expect([200, 403, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Get Organization Members (GET /api/organizations/:id/members)',
        request: {
          auth: bearerAuth('superAdminToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/organizations/:testOrgId/members', [
            { key: 'page', value: '1' },
            { key: 'limit', value: '20' },
          ]),
          description: 'Lists members belonging to an organization.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 403/404", function () {',
            '    pm.expect([200, 403, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Download Manager Bulk Template (GET /api/organizations/:id/managers/template)',
        request: {
          auth: bearerAuth('superAdminToken'),
          method: 'GET',
          header: [{ key: 'Accept', value: 'text/csv' }],
          url: makeUrl('api/organizations/:testOrgId/managers/template'),
          description: 'Downloads CSV template for bulk manager onboarding.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 403/404", function () {',
            '    pm.expect([200, 403, 404]).to.include(pm.response.code);',
            '    if (pm.response.code === 200) {',
            '        pm.expect(pm.response.text()).to.include("name,email");',
            '    }',
            '});',
          ]),
        ],
      },
      {
        name: 'Validate Manager CSV (POST /api/organizations/:id/managers/validate-csv)',
        request: {
          auth: bearerAuth('superAdminToken'),
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              csvText: 'name,email\nAlice Manager,alice.{{dynamicTimestamp}}@example.com\nBob Manager,bob.{{dynamicTimestamp}}@example.com\n',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/organizations/:testOrgId/managers/validate-csv'),
          description: 'Validates CSV rows before confirming bulk manager import.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 400/403/404", function () {',
            '    pm.expect([200, 400, 403, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Add Single Manager (POST /api/organizations/:id/managers)',
        request: {
          auth: bearerAuth('superAdminToken'),
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              managerName: 'Direct Manager {{dynamicTimestamp}}',
              managerEmail: 'direct.mgr.{{dynamicTimestamp}}@example.com',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/organizations/:testOrgId/managers'),
          description: 'Provisions an additional manager into an existing organization.',
        },
        event: [
          testScript([
            'pm.test("Status code is 201 or 403/404/409", function () {',
            '    pm.expect([201, 403, 404, 409]).to.include(pm.response.code);',
            '    if (pm.response.code === 201) {',
            '        var data = pm.response.json();',
            '        if (data.manager) {',
            '            pm.collectionVariables.set("testManagerId", data.manager.id);',
            '            if (pm.environment) { pm.environment.set("testManagerId", data.manager.id); }',
            '        }',
            '    }',
            '});',
          ]),
        ],
      },
      {
        name: 'Import Managers Bulk (POST /api/organizations/:id/managers/bulk)',
        request: {
          auth: bearerAuth('superAdminToken'),
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              rows: [
                { name: 'Bulk Manager 1', email: 'bulk.mgr1.{{dynamicTimestamp}}@example.com' },
                { name: 'Bulk Manager 2', email: 'bulk.mgr2.{{dynamicTimestamp}}@example.com' },
              ],
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/organizations/:testOrgId/managers/bulk'),
          description: 'Executes bulk creation of managers for an organization.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200, 201 or 400/403/404/409", function () {',
            '    pm.expect([200, 201, 400, 403, 404, 409]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Reset Manager Password (POST /api/organizations/:id/managers/:managerId/reset-password)',
        request: {
          auth: bearerAuth('superAdminToken'),
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          url: makeUrl('api/organizations/:testOrgId/managers/:testManagerId/reset-password'),
          description: 'Securely resets an organization manager password and generates a temporary password.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 403/404", function () {',
            '    pm.expect([200, 403, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Negative: Manager Access to SuperAdmin Route (GET /api/organizations)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/organizations'),
          description: 'Verifies standard manager cannot access SUPER_ADMIN restricted organization APIs (403 Forbidden).',
        },
        event: [
          testScript([
            'pm.test("Status code is 403 Forbidden", function () {',
            '    pm.response.to.have.status(403);',
            '});',
          ]),
        ],
      },
    ],
  });

  // =========================================================================
  // 03. USERS & PROVISIONING MODULE
  // =========================================================================
  folders.push({
    name: '03. Users & Provisioning',
    description: 'User management: provisioning interns/employees, bulk CSV workflows, role permissions, profile updating, password resets, and deactivation.',
    item: [
      {
        name: 'List Organization Users (GET /api/users)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/users', [
            { key: 'role', value: 'INTERN' },
            { key: 'limit', value: '50' },
          ]),
          description: 'Lists all users in the authenticated manager organization.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200", function () {',
            '    pm.response.to.have.status(200);',
            '});',
            'pm.test("Capture existing intern ID for dependent tests", function () {',
            '    var data = pm.response.json();',
            '    var users = data.users || data.data || data;',
            '    if (Array.isArray(users) && users.length > 0) {',
            '        pm.collectionVariables.set("internUserId", users[0].id);',
            '    }',
            '});',
          ]),
        ],
      },
      {
        name: 'Provision Single Intern (POST /api/users)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              name: 'Automated Postman Intern',
              email: 'postman.intern.{{dynamicTimestamp}}@dailoqa.com',
              type: 'INTERN',
              batch: '2026',
              subbatch: 'Batch-A',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/users'),
          description: 'Manager provisions a single intern user. Server auto-generates temporary password and INT-XXXX identifier.',
        },
        event: [
          testScript([
            'pm.test("Status code is 201 or 400/409", function () {',
            '    pm.expect([201, 400, 409]).to.include(pm.response.code);',
            '    if (pm.response.code === 201) {',
            '        var data = pm.response.json();',
            '        var userId = data.id || (data.user && data.user.id);',
            '        if (userId) {',
            '            pm.collectionVariables.set("createdUserId", userId);',
            '            if (pm.environment) { pm.environment.set("createdUserId", userId); }',
            '        }',
            '    }',
            '});',
          ]),
        ],
      },
      {
        name: 'Download User CSV Template (GET /api/users/bulk/template)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [{ key: 'Accept', value: 'text/csv' }],
          url: makeUrl('api/users/bulk/template'),
          description: 'Downloads CSV template matching backend user schema.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200", function () {',
            '    pm.response.to.have.status(200);',
            '    pm.expect(pm.response.headers.get("Content-Type")).to.include("csv");',
            '});',
          ]),
        ],
      },
      {
        name: 'Validate Bulk User CSV (POST /api/users/bulk/validate)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'POST',
          header: [acceptHeader],
          body: {
            mode: 'formdata',
            formdata: [
              {
                key: 'file',
                type: 'text',
                value: 'name,email,type,batch,subbatch\nSample Intern,sample.{{dynamicTimestamp}}@dailoqa.com,INTERN,2026,Batch-A\n',
              },
            ],
          },
          url: makeUrl('api/users/bulk/validate'),
          description: 'Validates uploaded CSV file before importing users.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 400", function () {',
            '    pm.expect([200, 400]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Update Member Details (PATCH /api/users/:id)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'PATCH',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              name: 'Updated Postman Intern Name',
              batch: '2026-Q4',
              subbatch: 'Alpha',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/users/:createdUserId'),
          description: 'Updates organization member permitted details (name, batch, subbatch).',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 404", function () {',
            '    pm.expect([200, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Get User Permissions (GET /api/users/:id/permissions)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/users/:createdUserId/permissions'),
          description: 'Retrieves explicitly granted and role permissions for an intern.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 404", function () {',
            '    pm.expect([200, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Update User Permissions (PUT /api/users/:id/permissions)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'PUT',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              permissions: ['PROJECT_READ', 'TASK_READ', 'TASK_UPDATE'],
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/users/:createdUserId/permissions'),
          description: 'Explicitly grants fine-grained permissions to an organization intern.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 404", function () {',
            '    pm.expect([200, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Get User Timesheet Report (GET /api/users/:userId/timesheet/report)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/users/:internUserId/timesheet/report', [
            { key: 'period', value: 'week' },
          ]),
          description: 'Manager views individual timesheet performance and hours for a team member.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 404", function () {',
            '    pm.expect([200, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Reset User Password (POST /api/users/:id/reset-password)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              new_password: 'Password@New123',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/users/:createdUserId/reset-password'),
          description: 'Manager triggers a password reset for an intern or employee.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 404", function () {',
            '    pm.expect([200, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Update Own Profile (PATCH /api/users/profile)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'PATCH',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              name: 'Postman Manager Profile',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/users/profile'),
          description: 'Authenticated user updates their own basic profile details.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200", function () {',
            '    pm.response.to.have.status(200);',
            '});',
          ]),
        ],
      },
      {
        name: 'Deactivate User (POST /api/users/:id/deactivate)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'POST',
          header: [acceptHeader],
          url: makeUrl('api/users/:createdUserId/deactivate'),
          description: 'Soft-deactivates an organization user, preventing future logins.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or 404", function () {',
            '    pm.expect([200, 404]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Negative: Provision User Without Email (POST /api/users)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              name: 'Invalid User',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/users'),
          description: 'Ensures user provisioning without email is rejected with 400 Bad Request.',
        },
        event: [
          testScript([
            'pm.test("Status code is 400", function () {',
            '    pm.response.to.have.status(400);',
            '});',
          ]),
        ],
      },
    ],
  });

  // =========================================================================
  // 04. COHORTS MODULE
  // =========================================================================
  folders.push({
    name: '04. Cohorts',
    description: 'Cohort listing and filtering for grouped intern training programs.',
    item: [
      {
        name: 'List Active Cohorts (GET /api/cohorts)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/cohorts'),
          description: 'Lists all active intern cohorts for the authenticated user organization.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200", function () {',
            '    pm.response.to.have.status(200);',
            '});',
            'pm.test("Stores cohort ID if available", function () {',
            '    var data = pm.response.json();',
            '    if (Array.isArray(data) && data.length > 0) {',
            '        pm.collectionVariables.set("cohortId", data[0].id);',
            '    }',
            '});',
          ]),
        ],
      },
    ],
  });

  return folders;
}

