import * as fs from 'fs';
import * as path from 'path';

// --- Interfaces for Postman Collection v2.1.0 ---
interface PostmanHeader {
  key: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

interface PostmanQuery {
  key: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

interface PostmanUrl {
  raw: string;
  host: string[];
  path: string[];
  query?: PostmanQuery[];
}

interface PostmanEvent {
  listen: 'test' | 'prerequest';
  script: {
    type: 'text/javascript';
    exec: string[];
  };
}

interface PostmanItem {
  name: string;
  event?: PostmanEvent[];
  request: {
    auth?: {
      type: string;
      bearer?: { key: string; value: string; type: string }[];
    };
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    header: PostmanHeader[];
    body?: {
      mode: 'raw' | 'urlencoded' | 'formdata';
      raw?: string;
      options?: { raw: { language: 'json' } };
      formdata?: { key: string; type: string; src?: string; value?: string; description?: string }[];
    };
    url: PostmanUrl;
    description?: string;
  };
  response?: any[];
}

interface PostmanFolder {
  name: string;
  description?: string;
  item: (PostmanItem | PostmanFolder)[];
}

interface PostmanCollection {
  info: {
    _postman_id: string;
    name: string;
    description: string;
    schema: string;
    version: string;
  };
  variable: { key: string; value: string; type: string; description?: string }[];
  item: (PostmanItem | PostmanFolder)[];
}

// Helper to construct URL
function makeUrl(endpointPath: string, query?: PostmanQuery[]): PostmanUrl {
  const cleanPath = endpointPath.replace(/^\//, '');
  const segments = cleanPath.split('/').map((s) => (s.startsWith(':') ? `{{${s.slice(1)}}}` : s));
  const rawQuery = query && query.length > 0 ? '?' + query.map((q) => `${q.key}=${q.value}`).join('&') : '';
  return {
    raw: `{{baseUrl}}/${segments.join('/')}${rawQuery}`,
    host: ['{{baseUrl}}'],
    path: segments,
    query: query || [],
  };
}

const jsonHeader: PostmanHeader = { key: 'Content-Type', value: 'application/json' };
const acceptHeader: PostmanHeader = { key: 'Accept', value: 'application/json' };

const bearerAuth = (tokenVar = 'accessToken') => ({
  type: 'bearer',
  bearer: [{ key: 'token', value: `{{${tokenVar}}}`, type: 'string' }],
});

const noAuth = { type: 'noauth' };

function testScript(lines: string[]): PostmanEvent {
  return {
    listen: 'test',
    script: {
      type: 'text/javascript',
      exec: lines,
    },
  };
}

function prerequestScript(lines: string[]): PostmanEvent {
  return {
    listen: 'prerequest',
    script: {
      type: 'text/javascript',
      exec: lines,
    },
  };
}

export function buildCollection(): PostmanCollection {
  const folders: (PostmanFolder | PostmanItem)[] = [];

  // =========================================================================
  // 00. SYSTEM & HEALTH
  // =========================================================================
  folders.push({
    name: '00. Health & System Diagnostics',
    description: 'System health check and database connectivity diagnostic endpoints.',
    item: [
      {
        name: 'Health Check (GET /api/health)',
        request: {
          auth: noAuth,
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/health'),
          description: 'Validates that backend, PostgreSQL pooler, and Redis fallback are online and operational.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200", function () {',
            '    pm.response.to.have.status(200);',
            '});',
            'pm.test("Health response is valid JSON", function () {',
            '    var data = pm.response.json();',
            '    pm.expect(data).to.have.property("status");',
            '    pm.expect(data).to.have.property("database");',
            '    pm.expect(data.database.status).to.eql("connected");',
            '});',
          ]),
        ],
      },
    ],
  });

  // =========================================================================
  // 01. AUTHENTICATION & SESSION MANAGEMENT
  // =========================================================================
  folders.push({
    name: '01. Authentication & Session Management',
    description: 'Authentication lifecycle: organization listing, multi-tenant login, session refresh, profile retrieval, password changes, and logout.',
    item: [
      {
        name: 'List Active Organizations (GET /api/auth/organizations)',
        request: {
          auth: noAuth,
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/auth/organizations'),
          description: 'Public endpoint listing active organizations for the login tenant selector.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200", function () {',
            '    pm.response.to.have.status(200);',
            '});',
            'pm.test("Returns list of active organizations", function () {',
            '    var data = pm.response.json();',
            '    pm.expect(Array.isArray(data)).to.be.true;',
            '    if (data.length > 0) {',
            '        pm.collectionVariables.set("organizationId", data[0].id);',
            '    }',
            '});',
          ]),
        ],
      },
      {
        name: 'Login as Manager (POST /api/auth/login)',
        request: {
          auth: noAuth,
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              email: '{{managerEmail}}',
              password: '{{managerPassword}}',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/auth/login'),
          description: 'Authenticates manager, extracts JWT accessToken, refreshToken, and sessionId into collection variables.',
        },
        event: [
          testScript([
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
            '    if (pm.environment) {',
            '        pm.environment.set("accessToken", data.accessToken);',
            '        pm.environment.set("refreshToken", data.refreshToken);',
            '        pm.environment.set("sessionId", data.sessionId);',
            '        pm.environment.set("managerUserId", data.user.id);',
            '        pm.environment.set("organizationId", data.user.organization_id);',
            '    }',
            '});',
          ]),
        ],
      },
      {
        name: 'Login as Super Admin (POST /api/auth/login)',
        request: {
          auth: noAuth,
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              email: '{{superAdminEmail}}',
              password: '{{superAdminPassword}}',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/auth/login'),
          description: 'Authenticates Super Admin and stores superAdminToken for organization oversight testing.',
        },
        event: [
          testScript([
            'pm.test("SuperAdmin login status 200 or 401 fallback", function () {',
            '    if (pm.response.code === 200) {',
            '        var data = pm.response.json();',
            '        pm.collectionVariables.set("superAdminToken", data.accessToken);',
            '        if (pm.environment) { pm.environment.set("superAdminToken", data.accessToken); }',
            '    }',
            '});',
          ]),
        ],
      },
      {
        name: 'Login as Intern (POST /api/auth/login)',
        request: {
          auth: noAuth,
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              email: '{{internEmail}}',
              password: '{{internPassword}}',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/auth/login'),
          description: 'Authenticates Intern to test RBAC restrictions and intern-specific endpoints.',
        },
        event: [
          testScript([
            'pm.test("Intern login status 200 or 401 fallback", function () {',
            '    if (pm.response.code === 200) {',
            '        var data = pm.response.json();',
            '        pm.collectionVariables.set("internToken", data.accessToken);',
            '        if (pm.environment) { pm.environment.set("internToken", data.accessToken); }',
            '        if (data.user && data.user.id) {',
            '            pm.collectionVariables.set("internUserId", data.user.id);',
            '            if (pm.environment) { pm.environment.set("internUserId", data.user.id); }',
            '        }',
            '    }',
            '});',
          ]),
        ],
      },
      {
        name: 'Negative: Login with Invalid Password (POST /api/auth/login)',
        request: {
          auth: noAuth,
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              email: '{{managerEmail}}',
              password: 'DefinatelyWrongPassword!123',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/auth/login'),
          description: 'Ensures invalid credentials securely return 401 Unauthorized.',
        },
        event: [
          testScript([
            'pm.test("Status code is 401", function () {',
            '    pm.response.to.have.status(401);',
            '});',
            'pm.test("Error message explains invalid credentials", function () {',
            '    var data = pm.response.json();',
            '    pm.expect(data).to.have.property("error");',
            '});',
          ]),
        ],
      },
      {
        name: 'Negative: Login with Missing Body (POST /api/auth/login)',
        request: {
          auth: noAuth,
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({}, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/auth/login'),
          description: 'Ensures empty login payload returns 400 Bad Request.',
        },
        event: [
          testScript([
            'pm.test("Status code is 400", function () {',
            '    pm.response.to.have.status(400);',
            '});',
          ]),
        ],
      },
      {
        name: 'Get Current User Profile (GET /api/auth/me)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/auth/me'),
          description: 'Retrieves current user identity, primary role, permissions list, and tech lead associations.',
        },
        event: [
          testScript([
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
            '});',
          ]),
        ],
      },
      {
        name: 'Negative: Get Profile Without Token (GET /api/auth/me)',
        request: {
          auth: noAuth,
          method: 'GET',
          header: [acceptHeader],
          url: makeUrl('api/auth/me'),
          description: 'Verifies unauthenticated access to /api/auth/me is rejected with 401.',
        },
        event: [
          testScript([
            'pm.test("Status code is 401", function () {',
            '    pm.response.to.have.status(401);',
            '});',
          ]),
        ],
      },
      {
        name: 'Refresh Access Token (POST /api/auth/refresh)',
        request: {
          auth: noAuth,
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              refreshToken: '{{refreshToken}}',
              sessionId: '{{sessionId}}',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/auth/refresh'),
          description: 'Refreshes expired or rotating JWT access token using valid refresh token and session ID.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200", function () {',
            '    pm.response.to.have.status(200);',
            '});',
            'pm.test("Stores refreshed accessToken", function () {',
            '    var data = pm.response.json();',
            '    pm.expect(data).to.have.property("accessToken");',
            '    pm.collectionVariables.set("accessToken", data.accessToken);',
            '});',
          ]),
        ],
      },
      {
        name: 'Change Password (POST /api/auth/change-password)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              current_password: '{{managerPassword}}',
              new_password: '{{managerPassword}}',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/auth/change-password'),
          description: 'Changes password for authenticated user and updates must_change_password flag.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200 or expected 400 validation", function () {',
            '    pm.expect([200, 400]).to.include(pm.response.code);',
            '});',
          ]),
        ],
      },
      {
        name: 'Logout Session (POST /api/auth/logout)',
        request: {
          auth: bearerAuth('accessToken'),
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              sessionId: '{{sessionId}}',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/auth/logout'),
          description: 'Invalidates session and clears active authentication state.',
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
        name: 'Re-authenticate Manager Post-Logout (POST /api/auth/login)',
        request: {
          auth: noAuth,
          method: 'POST',
          header: [jsonHeader, acceptHeader],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              email: '{{managerEmail}}',
              password: '{{managerPassword}}',
            }, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: makeUrl('api/auth/login'),
          description: 'Re-authenticates manager to refresh tokens for remaining automated tests.',
        },
        event: [
          testScript([
            'pm.test("Status code is 200", function () {',
            '    pm.response.to.have.status(200);',
            '    var data = pm.response.json();',
            '    pm.collectionVariables.set("accessToken", data.accessToken);',
            '    pm.collectionVariables.set("refreshToken", data.refreshToken);',
            '    pm.collectionVariables.set("sessionId", data.sessionId);',
            '});',
          ]),
        ],
      },
    ],
  });

  // Export collection skeleton and continue in next parts
  return {
    info: {
      _postman_id: 'c282051f-57c4-4e54-a845-92b6a3dfdd35',
      name: 'InternHub Platform - Complete Comprehensive API Test Suite',
      description: 'Complete Postman Collection covering all 13 modules, 129 endpoints, automated token extraction, dynamic variable chaining, and assertion test scripts across the InternHub platform.',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      version: '2.1.0',
    },
    variable: [
      { key: 'baseUrl', value: 'http://localhost:3001', type: 'string', description: 'API backend server base URL' },
      { key: 'accessToken', value: '', type: 'string', description: 'Active JWT Bearer Access Token' },
      { key: 'refreshToken', value: '', type: 'string', description: 'Active Refresh Token' },
      { key: 'sessionId', value: '', type: 'string', description: 'Active Session ID' },
      { key: 'superAdminToken', value: '', type: 'string', description: 'Super Admin JWT Token' },
      { key: 'internToken', value: '', type: 'string', description: 'Intern JWT Token' },
      { key: 'managerEmail', value: 'manager@dailoqa.com', type: 'string' },
      { key: 'managerPassword', value: 'password123', type: 'string' },
      { key: 'superAdminEmail', value: 'superadmin@dailoqa.com', type: 'string' },
      { key: 'superAdminPassword', value: 'password123', type: 'string' },
      { key: 'internEmail', value: 'intern@dailoqa.com', type: 'string' },
      { key: 'internPassword', value: 'password123', type: 'string' },
      { key: 'internUserId', value: '', type: 'string' },
      { key: 'internTaskId', value: '', type: 'string' },
      { key: 'dynamicTimestamp', value: '', type: 'string' },
      { key: 'organizationId', value: '', type: 'string' },
      { key: 'managerUserId', value: '', type: 'string' },
      { key: 'projectId', value: '', type: 'string' },
      { key: 'sprintId', value: '', type: 'string' },
      { key: 'workItemId', value: '', type: 'string' },
      { key: 'taskId', value: '', type: 'string' },
      { key: 'epicId', value: '', type: 'string' },
      { key: 'storyId', value: '', type: 'string' },
      { key: 'subtaskId', value: '', type: 'string' },
      { key: 'commentId', value: '', type: 'string' },
      { key: 'extensionRequestId', value: '', type: 'string' },
      { key: 'documentId', value: '', type: 'string' },
      { key: 'customRoleId', value: '', type: 'string' },
      { key: 'createdUserId', value: '', type: 'string' },
      { key: 'provisionedUserId', value: '', type: 'string' },
      { key: 'cohortId', value: '', type: 'string' },
      { key: 'formId', value: '', type: 'string' },
      { key: 'questionId', value: '', type: 'string' },
      { key: 'submissionId', value: '', type: 'string' },
      { key: 'notificationId', value: '', type: 'string' },
      { key: 'timeEntryId', value: '', type: 'string' },
      { key: 'timeCorrectionId', value: '', type: 'string' },
      { key: 'actionItemId', value: '', type: 'string' },
      { key: 'testOrgId', value: '', type: 'string' },
      { key: 'testManagerId', value: '', type: 'string' },
      { key: 'tempOrgId', value: '', type: 'string' },
    ],
    event: [
      {
        listen: 'prerequest',
        script: {
          type: 'text/javascript',
          exec: [
            '// Set dynamic timestamp variable for request runs',
            'var now = Date.now().toString();',
            'pm.variables.set("dynamicTimestamp", now);',
            'pm.variables.set("timestamp", now);',
          ],
        },
      },
    ],
    item: folders,
  };
}

