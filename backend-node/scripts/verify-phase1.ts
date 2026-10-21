import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_BASE = 'http://127.0.0.1:3001/api';

const ALLOWED_TEST_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function safeEndpoint(baseUrl: string, ...segments: string[]): string {
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Rejected unsafe protocol: ${parsed.protocol}`);
  }
  if (!ALLOWED_TEST_HOSTS.has(parsed.hostname)) {
    throw new Error(`Rejected unauthorized destination host: ${parsed.hostname}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('Rejected embedded credentials in URL');
  }

  const basePrefix = parsed.pathname.replace(/\/+$/, '');
  const encodedSegments: string[] = [];

  for (const raw of segments) {
    const trimmed = String(raw).trim();
    if (!trimmed) {
      throw new Error('Empty path segment rejected');
    }

    let decoded = trimmed;
    try {
      decoded = decodeURIComponent(trimmed);
    } catch {
      throw new Error(`Malformed URL segment encoding: ${trimmed}`);
    }

    if (
      decoded.includes('..') ||
      decoded.includes('/') ||
      decoded.includes('\\') ||
      decoded.includes('?') ||
      decoded.includes('#') ||
      /[\x00-\x1F\x7F]/.test(decoded) ||
      /^(https?:|file:|data:|javascript:|\/\/)/i.test(decoded)
    ) {
      throw new Error(`Potential SSRF or path traversal in segment: ${trimmed}`);
    }

    if (!/^[a-zA-Z0-9_\-\.:]+$/.test(decoded)) {
      throw new Error(`Segment contains disallowed characters: ${trimmed}`);
    }

    encodedSegments.push(encodeURIComponent(decoded));
  }

  parsed.pathname = `${basePrefix}/${encodedSegments.join('/')}`;
  parsed.search = '';
  parsed.hash = '';

  if (!parsed.pathname.startsWith(basePrefix)) {
    throw new Error('Resolved path escaped permitted boundary');
  }

  return parsed.toString();
}

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    console.log(`\n⏳ Running: ${name}`);
    await fn();
    console.log(`✅ PASS: ${name}`);
    results.push({ name, passed: true });
  } catch (err: any) {
    console.error(`❌ FAIL: ${name} ->`, err.message || err);
    results.push({ name, passed: false, error: err.message || String(err) });
  }
}

async function main() {
  console.log('====================================================');
  console.log('STARTING PHASE 1 SUPER ADMIN & ORG PROVISIONING TESTS');
  console.log('====================================================');

  let superAdminToken = '';
  let managerToken = '';
  let createdOrgId = '';
  let createdManagerEmail = `auto.mgr.${Date.now()}@testorg.com`;
  let createdManagerTempPassword = '';

  const dailoqa = await prisma.organization.findFirst({ where: { name: { contains: 'Dailoqa' } } });
  const dailoqaId = dailoqa?.id;

  // 1. Super Admin Login
  await runTest('1. Super Admin Authentication & Profile', async () => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'superadmin@dailoqa.com',
        password: 'password123'
      })
    });

    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(!!data.accessToken, 'Expected accessToken on successful login');
    superAdminToken = data.accessToken;

    assert(data.user.email === 'superadmin@dailoqa.com', 'User email should match');
    assert(data.user.role === 'SUPER_ADMIN', `User role should be SUPER_ADMIN, got ${data.user.role}`);
    assert(data.user.organization_id === null, 'Super Admin organization_id must be null');
  });

  // 2. Unauthenticated access blocked
  await runTest('2. Unauthenticated Access Blocked on /api/organizations', async () => {
    const res = await fetch(`${API_BASE}/organizations`, {
      method: 'GET'
    });
    assert(res.status === 401, `Expected 401 Unauthorized, got ${res.status}`);
  });

  // 3. Manager/Intern RBAC guard (Forbidden)
  await runTest('3. Non-Super Admin Forbidden on /api/organizations', async () => {
    // Login as existing seeded manager
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'manager@dailoqa.com',
        password: 'password123',
        organization_id: dailoqaId
      })
    });

    assert(loginRes.status === 200, `Manager login failed with ${loginRes.status}`);
    const loginData = await loginRes.json();
    managerToken = loginData.accessToken;

    // Try GET /api/organizations
    const getRes = await fetch(`${API_BASE}/organizations`, {
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    assert(getRes.status === 403, `Manager GET /api/organizations expected 403, got ${getRes.status}`);

    // Try POST /api/organizations
    const postRes = await fetch(`${API_BASE}/organizations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        organizationName: 'Unauthorized Org',
        managerName: 'Hacker',
        managerEmail: 'hacker@example.com'
      })
    });
    assert(postRes.status === 403, `Manager POST /api/organizations expected 403, got ${postRes.status}`);
  });

  // 4. Super Admin Creates Organization with Manager
  await runTest('4. Super Admin Creates Organization & Manager Transaction', async () => {
    const orgName = `Acme Corp ${Date.now()}`;
    const res = await fetch(`${API_BASE}/organizations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`
      },
      body: JSON.stringify({
        organizationName: orgName,
        managerName: 'Alice Manager',
        managerEmail: createdManagerEmail
      })
    });

    assert(res.status === 201, `Expected 201 Created, got ${res.status}`);
    const body = await res.json();
    assert(body.organization.name === orgName, 'Organization name should match');
    assert(!!body.organization.id, 'Organization ID should exist');
    
    assert(body.manager.name === 'Alice Manager', 'Manager name should match');
    assert(body.manager.email === createdManagerEmail, 'Manager email should match');
    assert(body.manager.must_change_password === true, 'must_change_password should be true');
    assert(body.manager.role === 'MANAGER', 'Manager role should be MANAGER');
    assert(typeof body.manager.user_code === 'string', 'Manager user_code should be string');
    assert(typeof body.manager.temporary_password === 'string' && body.manager.temporary_password.length >= 8, 'temporary_password should be at least 8 chars');
    assert(body.manager.password_hash === undefined, 'password_hash must NEVER be returned');

    createdOrgId = body.organization.id;
    createdManagerTempPassword = body.manager.temporary_password;
  });

  // 5. Duplicate Email Conflict & Atomic Rollback
  await runTest('5. Duplicate Email Conflict Handling and Atomic Rollback', async () => {
    const duplicateOrgName = `Duplicate Test Org ${Date.now()}`;
    const res = await fetch(`${API_BASE}/organizations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`
      },
      body: JSON.stringify({
        organizationName: duplicateOrgName,
        managerName: 'Duplicate Person',
        managerEmail: createdManagerEmail // already in use
      })
    });

    assert(res.status === 409, `Expected 409 Conflict, got ${res.status}`);

    // Verify atomic rollback in DB: duplicateOrgName must NOT exist
    const orphanOrg = await prisma.organization.findFirst({
      where: { name: duplicateOrgName }
    });
    assert(orphanOrg === null, 'Atomic rollback failed: orphaned organization exists in database');
  });

  // 6. Newly Created Manager Logs in with Temporary Password
  await runTest('6. Initial Manager Login with Temporary Password', async () => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: createdManagerEmail,
        password: createdManagerTempPassword,
        organization_id: createdOrgId
      })
    });

    assert(res.status === 200, `Manager login failed with status ${res.status}`);
    const body = await res.json();
    assert(body.user.email === createdManagerEmail, 'User email should match');
    assert(body.user.role === 'MANAGER', 'User role should be MANAGER');
    assert(body.user.organization_id === createdOrgId, 'User organization_id should match created org');
    assert(body.user.must_change_password === true, 'must_change_password should be true');
    assert(body.user.password_hash === undefined, 'password_hash should not be in user object');
  });

  // 7. Super Admin List Organizations
  await runTest('7. Super Admin Organization List & Metrics', async () => {
    const res = await fetch(`${API_BASE}/organizations`, {
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });

    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(Array.isArray(body.organizations), 'organizations should be an array');

    const createdOrg = body.organizations.find((o: any) => o.id === createdOrgId);
    assert(!!createdOrg, 'Newly created organization must be present in the list');
    assert(createdOrg.stats.user_count >= 1, 'user_count should be at least 1');
    assert(createdOrg.managers.some((m: any) => m.email === createdManagerEmail), 'manager email should match');
    assert(createdOrg.managers.every((m: any) => m.password_hash === undefined), 'manager password_hash must not be present');
  });

  // 8. Super Admin Get Organization Details
  await runTest('8. Super Admin Organization Details View', async () => {
    const res = await fetch(safeEndpoint(API_BASE, 'organizations', createdOrgId), {
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });

    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(body.organization.id === createdOrgId, 'Org ID should match');
    assert(Array.isArray(body.organization.users), 'users should be an array');
    assert(body.organization.users.length >= 1, 'users length should be at least 1');

    for (const member of body.organization.users) {
      assert(member.password_hash === undefined, 'Member password_hash must never be leaked');
    }
  });

  // 9. Input Validation
  await runTest('9. Input Validation on Organization & Manager Creation', async () => {
    // Missing organizationName
    const res1 = await fetch(`${API_BASE}/organizations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`
      },
      body: JSON.stringify({
        managerName: 'Bob',
        managerEmail: 'bob@example.com'
      })
    });
    assert(res1.status === 400, `Expected 400 for missing org name, got ${res1.status}`);

    // Invalid email format
    const res2 = await fetch(`${API_BASE}/organizations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`
      },
      body: JSON.stringify({
        organizationName: 'Valid Org',
        managerName: 'Bob',
        managerEmail: 'not-an-email'
      })
    });
    assert(res2.status === 400, `Expected 400 for invalid email, got ${res2.status}`);
  });

  // 10. Existing Manager / Intern Regression Verification
  await runTest('10. Existing Role Regression (Manager & Intern auth)', async () => {
    // Verify seeded intern can still login
    const internRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'intern@dailoqa.com',
        password: 'password123',
        organization_id: dailoqaId
      })
    });
    assert(internRes.status === 200, `Intern login failed with ${internRes.status}`);
    const internData = await internRes.json();
    assert(internData.user.role === 'INTERN', `Expected role INTERN, got ${internData.user.role}`);
    assert(!!internData.user.organization_id, 'Intern should have organization_id');

    // Verify intern auth me
    const meRes = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${internData.accessToken}` }
    });
    assert(meRes.status === 200, `Intern /auth/me failed with ${meRes.status}`);
  });

  // Cleanup created test records
  console.log('\n🧹 Cleaning up test organization & user...');
  try {
    await prisma.userRole.deleteMany({
      where: { user: { email: createdManagerEmail } }
    });
    await prisma.userSession.deleteMany({
      where: { user: { email: createdManagerEmail } }
    });
    await prisma.user.deleteMany({
      where: { email: createdManagerEmail }
    });
    if (createdOrgId) {
      await prisma.organization.delete({
        where: { id: createdOrgId }
      });
    }
    console.log('✅ Cleanup complete.');
  } catch (err) {
    console.warn('⚠️ Cleanup warning:', err);
  }

  // Summary
  console.log('\n====================================================');
  console.log('PHASE 1 VERIFICATION SUMMARY');
  console.log('====================================================');
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`Total Tests : ${total}`);
  console.log(`Passed      : ${passed}`);
  console.log(`Failed      : ${failed}`);

  if (failed > 0) {
    console.error('\nFailed tests:');
    results.filter(r => !r.passed).forEach(r => console.error(`- ${r.name}: ${r.error}`));
    process.exit(1);
  } else {
    console.log('\n🌟 ALL 10 PHASE 1 VERIFICATION SUITES PASSED CLEANLY!');
    process.exit(0);
  }
}

main()
  .catch((err) => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
