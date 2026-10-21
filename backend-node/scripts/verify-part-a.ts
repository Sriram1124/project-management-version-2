import { PrismaClient } from '@prisma/client';
import { safeEndpoint, getTestPassword, sanitizeForLog } from './safe-endpoint';

const prisma = new PrismaClient();
const API_BASE = 'http://127.0.0.1:3001/api';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${sanitizeForLog(message)}`);
  }
}

async function runTest(name: string, fn: () => Promise<void>) {
  const safeName = sanitizeForLog(name);
  try {
    console.log(`\n⏳ Running: ${safeName}`);
    await fn();
    console.log(`✅ PASS: ${safeName}`);
    results.push({ name: safeName, passed: true });
  } catch (err: any) {
    const errMsg = sanitizeForLog(err?.message || err);
    console.error(`❌ FAIL: ${safeName} -> ${errMsg}`);
    results.push({ name: safeName, passed: false, error: errMsg });
  }
}

async function main() {
  console.log('====================================================');
  console.log('VERIFYING PART A: UNIFIED LOGIN & TENANT ISOLATION');
  console.log('====================================================');

  let dailoqaOrgId = '';
  let otherOrgId = '';
  let superAdminToken = '';
  let managerToken = '';
  let managerUserCode = '';
  let internToken = '';
  let testSessionCookie = '';
  let testRefreshTokenCookie = '';

  // Setup: Find Dailoqa and create a second test organization to test cross-org rejection
  const dailoqa = await prisma.organization.findFirst({
    where: { name: { contains: 'Dailoqa' } }
  });
  assert(!!dailoqa, 'Dailoqa organization must exist in DB');
  dailoqaOrgId = dailoqa!.id;

  let secondaryOrg = await prisma.organization.findFirst({
    where: { name: 'Tenant B Isolated Corp' }
  });
  if (!secondaryOrg) {
    secondaryOrg = await prisma.organization.create({
      data: { name: 'Tenant B Isolated Corp' }
    });
  }
  otherOrgId = secondaryOrg.id;

  // 1. Public Organization Discovery API
  await runTest('1. GET /api/auth/organizations (Public discovery)', async () => {
    const res = await fetch(safeEndpoint(API_BASE, 'auth', 'organizations'));
    assert(res.status === 200, `Expected 200 OK, got ${sanitizeForLog(res.status)}`);
    const data = await res.json();
    assert(Array.isArray(data), 'Response must be an array');
    assert(data.length >= 1, 'Should return at least 1 organization');

    // Check Dailoqa is present
    const dailoqaEntry = data.find((o: any) => o.id === dailoqaOrgId);
    assert(!!dailoqaEntry, 'Dailoqa must be in organizations discovery list');

    // Verify safe projection: each entry MUST only have id and name
    for (const org of data) {
      assert(typeof org.id === 'string', 'org.id must be string');
      assert(typeof org.name === 'string', 'org.name must be string');
      assert(org.users === undefined, 'Must not leak users');
      assert(org.managers === undefined, 'Must not leak managers');
      assert(org.stats === undefined, 'Must not leak stats');
      assert(org.password_hash === undefined, 'Must not leak passwords');
      assert(org.projects === undefined, 'Must not leak projects');
      assert(org.forms === undefined, 'Must not leak forms');
    }
  });

  // 2. ROOT / SUPER ADMIN Login
  await runTest('2. Root Login (Super Admin with organization_id = NULL)', async () => {
    const res = await fetch(safeEndpoint(API_BASE, 'auth', 'login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'superadmin@dailoqa.com',
        password: getTestPassword()
      })
    });

    assert(res.status === 200, `Expected 200 OK, got ${sanitizeForLog(res.status)}`);
    const body = await res.json();
    assert(body.user.role === 'SUPER_ADMIN', `Expected SUPER_ADMIN role, got ${sanitizeForLog(body.user?.role)}`);
    assert(body.user.organization_id === null, 'Super admin organization_id must be null');
    assert(!!body.accessToken, 'Access token must be returned');
    superAdminToken = body.accessToken;
  });

  // 3. Super Admin cannot login with a tenant organization_id
  await runTest('3. Super Admin cannot login under a tenant organization context', async () => {
    const res = await fetch(safeEndpoint(API_BASE, 'auth', 'login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'superadmin@dailoqa.com',
        password: getTestPassword(),
        organization_id: dailoqaOrgId
      })
    });

    assert(res.status === 401, `Expected 401 Invalid credentials, got ${sanitizeForLog(res.status)}`);
  });

  // 4. Regular Organization User MUST provide organization_id
  await runTest('4. Regular organization user rejected when organization_id is missing', async () => {
    const res = await fetch(safeEndpoint(API_BASE, 'auth', 'login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'manager@dailoqa.com',
        password: getTestPassword()
        // organization_id intentionally omitted
      })
    });

    assert(res.status === 401, `Expected 401 Invalid credentials, got ${sanitizeForLog(res.status)}`);
  });

  // 5. Manager Login with Organization Context (Auto role determination)
  await runTest('5. Manager Login under correct organization (Auto role MANAGER)', async () => {
    const res = await fetch(safeEndpoint(API_BASE, 'auth', 'login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'manager@dailoqa.com',
        password: getTestPassword(),
        organization_id: dailoqaOrgId
      })
    });

    assert(res.status === 200, `Expected 200 OK, got ${sanitizeForLog(res.status)}`);
    const cookie = res.headers.get('set-cookie');
    assert(!!cookie, 'Session cookies must be set');
    testSessionCookie = cookie!;

    const body = await res.json();
    assert(body.user.role === 'MANAGER', `Expected MANAGER, got ${sanitizeForLog(body.user?.role)}`);
    assert(body.user.organization_id === dailoqaOrgId, 'organization_id must match Dailoqa');
    assert(!!body.accessToken, 'accessToken must be present');
    managerToken = body.accessToken;

    // Update user_code if null for user_code test
    if (!body.user.user_code) {
      const updated = await prisma.user.update({
        where: { email: 'manager@dailoqa.com' },
        data: { user_code: 'MGR-7788' }
      });
      managerUserCode = updated.user_code!;
    } else {
      managerUserCode = body.user.user_code;
    }
  });

  // 6. Intern Login with Organization Context (Auto role determination)
  await runTest('6. Intern Login under correct organization (Auto role INTERN)', async () => {
    const res = await fetch(safeEndpoint(API_BASE, 'auth', 'login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'intern@dailoqa.com',
        password: getTestPassword(),
        organization_id: dailoqaOrgId
      })
    });

    assert(res.status === 200, `Expected 200 OK, got ${sanitizeForLog(res.status)}`);
    const body = await res.json();
    assert(body.user.role === 'INTERN', `Expected INTERN, got ${sanitizeForLog(body.user?.role)}`);
    assert(body.user.organization_id === dailoqaOrgId, 'organization_id must match Dailoqa');
    internToken = body.accessToken;
  });

  // 7. Cross-Organization Authentication Rejection
  await runTest('7. Cross-organization login rejected (User from Org A trying Org B)', async () => {
    const res = await fetch(safeEndpoint(API_BASE, 'auth', 'login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'manager@dailoqa.com', // Belongs to Dailoqa
        password: getTestPassword(),
        organization_id: otherOrgId  // Trying to log into Tenant B
      })
    });

    assert(res.status === 401, `Expected 401 Unauthorized, got ${sanitizeForLog(res.status)}`);
    const body = await res.json();
    assert(body.error === 'Invalid credentials', `Generic error expected without info leakage, got: ${sanitizeForLog(body.error)}`);
  });

  // 8. Login using User ID (user_code) + Password + organization_id
  await runTest('8. Login with user_code (User ID) instead of email', async () => {
    const res = await fetch(safeEndpoint(API_BASE, 'auth', 'login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: managerUserCode,
        password: getTestPassword(),
        organization_id: dailoqaOrgId
      })
    });

    assert(res.status === 200, `Expected 200 OK, got ${sanitizeForLog(res.status)}`);
    const body = await res.json();
    assert(body.user.email === 'manager@dailoqa.com', 'User email must match manager');
    assert(body.user.role === 'MANAGER', 'Role must be MANAGER');
  });

  // 9. Auth Me endpoint still works
  await runTest('9. GET /api/auth/me profile verification', async () => {
    const res = await fetch(safeEndpoint(API_BASE, 'auth', 'me'), {
      headers: { Authorization: `Bearer ${managerToken}` }
    });

    assert(res.status === 200, `Expected 200, got ${sanitizeForLog(res.status)}`);
    const user = await res.json();
    assert(user.email === 'manager@dailoqa.com', 'Profile email should match');
    assert(user.role === 'MANAGER', 'Profile role should match');
    assert(user.organization_id === dailoqaOrgId, 'Profile organization_id should match');
  });

  // 10. Refresh token endpoint still works
  await runTest('10. POST /api/auth/refresh session continuation', async () => {
    // Extract cookies from manager login
    const loginRes = await fetch(safeEndpoint(API_BASE, 'auth', 'login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'manager@dailoqa.com',
        password: getTestPassword(),
        organization_id: dailoqaOrgId
      })
    });
    
    // Node.js 18+ provides getSetCookie()
    const rawCookies = (loginRes.headers as any).getSetCookie 
      ? (loginRes.headers as any).getSetCookie() 
      : [loginRes.headers.get('set-cookie')];
    const cookieHeader = rawCookies.map((c: string) => c.split(';')[0]).join('; ');

    const refreshRes = await fetch(safeEndpoint(API_BASE, 'auth', 'refresh'), {
      method: 'POST',
      headers: { Cookie: cookieHeader }
    });

    assert(refreshRes.status === 200, `Expected 200, got ${sanitizeForLog(refreshRes.status)}`);
    const refreshData = await refreshRes.json();
    assert(!!refreshData.accessToken, 'Expected new accessToken');
  });

  // 11. Logout still works
  await runTest('11. POST /api/auth/logout session revocation', async () => {
    const loginRes = await fetch(safeEndpoint(API_BASE, 'auth', 'login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'manager@dailoqa.com',
        password: getTestPassword(),
        organization_id: dailoqaOrgId
      })
    });
    const cookieHeader = loginRes.headers.get('set-cookie')!;
    const loginData = await loginRes.json();

    const logoutRes = await fetch(safeEndpoint(API_BASE, 'auth', 'logout'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${loginData.accessToken}`,
        Cookie: cookieHeader
      }
    });

    assert(logoutRes.status === 200, `Logout expected 200, got ${sanitizeForLog(logoutRes.status)}`);
  });

  // 12. Super Admin vs Manager RBAC isolation
  await runTest('12. Existing Protected Routes RBAC Integrity', async () => {
    // Super Admin can list all organizations
    const saRes = await fetch(safeEndpoint(API_BASE, 'organizations'), {
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });
    assert(saRes.status === 200, `Super Admin /organizations expected 200, got ${sanitizeForLog(saRes.status)}`);

    // Manager forbidden from listing all tenant organizations
    const mgrRes = await fetch(safeEndpoint(API_BASE, 'organizations'), {
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    assert(mgrRes.status === 403, `Manager /organizations expected 403, got ${sanitizeForLog(mgrRes.status)}`);
  });

  // Cleanup secondary test organization
  console.log('\n🧹 Cleaning up secondary test organization...');
  try {
    await prisma.organization.delete({
      where: { id: otherOrgId }
    });
    console.log('✅ Cleanup complete.');
  } catch (err) {
    console.warn('⚠️ Cleanup warning:', sanitizeForLog(err?.message || err));
  }

  // Summary
  console.log('\n====================================================');
  console.log('PART A VERIFICATION SUMMARY');
  console.log('====================================================');
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`Total Tests : ${sanitizeForLog(total)}`);
  console.log(`Passed      : ${sanitizeForLog(passed)}`);
  console.log(`Failed      : ${sanitizeForLog(failed)}`);

  if (failed > 0) {
    console.error('\nFailed tests:');
    results.filter(r => !r.passed).forEach(r => console.error(`- ${sanitizeForLog(r.name)}: ${sanitizeForLog(r.error)}`));
    process.exit(1);
  } else {
    console.log('\n🌟 ALL 12 PART A REQUIREMENTS VERIFIED AND PASSING CLEANLY!');
    process.exit(0);
  }
}

main()
  .catch((err) => {
    console.error('Fatal test runner error:', sanitizeForLog(err?.message || err));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
