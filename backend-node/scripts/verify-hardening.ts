import { safeEndpoint } from './safe-endpoint';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();
const BASE_URL = 'http://127.0.0.1:3001/api';



async function main() {
  console.log('================================================================');
  console.log('PRE-PUSH INTEGRATION HARDENING: COMPREHENSIVE VERIFICATION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
      failed++;
    }
  }

  // 1. Find or verify Organization and Manager
  console.log('1. Manager Authentication & Tenant Isolation');
  let org = await prisma.organization.findFirst({
    where: { name: { contains: 'Dailoqa', mode: 'insensitive' } }
  });
  if (!org) {
    org = await prisma.organization.findFirst();
  }
  if (!org) {
    org = await prisma.organization.create({
      data: { name: 'Dailoqa' }
    });
  }
  console.log(`   Using Organization: ${org.name} (${org.id})`);

  // Ensure manager exists
  let manager = await prisma.user.findFirst({
    where: { email: 'manager@dailoqa.com' }
  });
  if (!manager) {
    const managerRole = await prisma.role.findFirst({ where: { name: 'MANAGER' } });
    manager = await prisma.user.create({
      data: {
        email: 'manager@dailoqa.com',
        name: 'Dailoqa Manager',
        password_hash: await argon2.hash('password123'),
        organization_id: org.id,
        user_code: 'MGR-1001',
        is_active: true,
        must_change_password: false,
        roles: managerRole ? {
          create: { role_id: managerRole.id }
        } : undefined
      }
    });
  }

  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'manager@dailoqa.com',
      password: 'password123',
      organization_id: org.id,
    }),
  });

  const cookieHeader = loginRes.headers.get('set-cookie');
  const loginData: any = await loginRes.json();
  assert(loginRes.status === 200, 'Manager logged in successfully');
  const token = loginData.accessToken;
  assert(Boolean(token), 'Manager received access token');

  const authHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
  if (cookieHeader) {
    authHeaders['Cookie'] = cookieHeader;
  }

  // 2. Query users with filter
  console.log('\n2. User Listing & Status Filters');
  const allUsersRes = await fetch(`${BASE_URL}/users?type=ALL`, { headers: authHeaders });
  const allUsersData: any = await allUsersRes.json();
  assert(allUsersRes.status === 200 && Array.isArray(allUsersData.users), 'GET /users?type=ALL returned users array');
  const initialUsersCount = allUsersData.users.length;
  console.log(`   Found ${initialUsersCount} members in organization.`);

  const activeUsersRes = await fetch(`${BASE_URL}/users?type=ACTIVE`, { headers: authHeaders });
  const activeUsersData: any = await activeUsersRes.json();
  assert(
    activeUsersData.users.every((u: any) => u.is_active !== false),
    'GET /users?type=ACTIVE returned only active users'
  );

  const internUsersRes = await fetch(`${BASE_URL}/users?type=INTERN`, { headers: authHeaders });
  const internUsersData: any = await internUsersRes.json();
  assert(
    internUsersData.users.every((u: any) => u.type === 'INTERN'),
    'GET /users?type=INTERN returned only INTERN users'
  );

  // 3. Provision a test intern for password reset & deactivation tests
  console.log('\n3. Provision Test Intern for Hardening Verification');
  const testEmail = `hardening.test.${Date.now()}@dailoqa.com`;
  const createRes = await fetch(`${BASE_URL}/users`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'Hardening Test Intern',
      email: testEmail,
      type: 'INTERN',
    }),
  });

  const createData: any = await createRes.json();
  assert(createRes.status === 201, 'Created test intern for testing');
  const testUser = createData.user;
  const initialTempPassword = createData.temporary_password;

  // 4. Test Password Reset
  console.log('\n4. Password Reset Functionality');
  const resetRes = await fetch(safeEndpoint(BASE_URL, 'users', testUser.id, 'reset-password'), {
    method: 'POST',
    headers: authHeaders,
  });
  const resetData: any = await resetRes.json();
  assert(resetRes.status === 200, 'POST /users/:id/reset-password succeeded');
  assert(Boolean(resetData.temporary_password), 'Generated new temporary password returned');
  const newTempPassword = resetData.temporary_password;
  assert(newTempPassword !== initialTempPassword, 'New temporary password differs from initial');

  // Verify in database
  const dbUserAfterReset = await prisma.user.findUnique({ where: { id: testUser.id } });
  assert(dbUserAfterReset?.must_change_password === true, 'must_change_password flag set to true');
  const hashMatches = await argon2.verify(dbUserAfterReset!.password_hash, newTempPassword);
  assert(hashMatches, 'Argon2 hash matches the new temporary password');

  // 5. Test Tenant Isolation on Password Reset
  console.log('\n5. Tenant Isolation: Password Reset Protection');
  let otherOrg = await prisma.organization.findFirst({ where: { name: 'OtherCorp Hardening' } });
  if (!otherOrg) {
    otherOrg = await prisma.organization.create({
      data: { name: 'OtherCorp Hardening' },
    });
  }

  const otherUser = await prisma.user.create({
    data: {
      email: `other.org.${Date.now()}@othercorp.com`,
      name: 'Other Org User',
      password_hash: await argon2.hash('password123'),
      organization_id: otherOrg.id,
      user_code: `OTH-${Date.now().toString().slice(-4)}`,
    },
  });

  const crossResetRes = await fetch(safeEndpoint(BASE_URL, 'users', otherUser.id, 'reset-password'), {
    method: 'POST',
    headers: authHeaders,
  });
  assert(
    crossResetRes.status === 403,
    'Cross-tenant password reset correctly blocked with 403 Forbidden'
  );

  // Super admin protection
  const superAdmin = await prisma.user.findFirst({
    where: { organization_id: null },
  });
  if (superAdmin) {
    const adminResetRes = await fetch(safeEndpoint(BASE_URL, 'users', superAdmin.id, 'reset-password'), {
      method: 'POST',
      headers: authHeaders,
    });
    assert(
      adminResetRes.status === 403,
      'Super Admin password reset by manager blocked with 403 Forbidden'
    );
  }

  // 6. Test User Deactivation
  console.log('\n6. User Deactivation Functionality');
  const deactRes = await fetch(safeEndpoint(BASE_URL, 'users', testUser.id, 'deactivate'), {
    method: 'POST',
    headers: authHeaders,
  });
  const deactData: any = await deactRes.json();
  assert(deactRes.status === 200, 'POST /users/:id/deactivate succeeded');
  assert(deactData.user?.is_active === false, 'Deactivation response indicates is_active: false');

  const dbUserAfterDeact = await prisma.user.findUnique({ where: { id: testUser.id } });
  assert(dbUserAfterDeact?.is_active === false, 'Database confirms user is_active: false');

  // Verify that deactivated user cannot log in
  const deactLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testUser.email,
      password: newTempPassword,
      organization_id: org.id,
    }),
  });
  assert(
    deactLoginRes.status === 401 || deactLoginRes.status === 403,
    'Deactivated user login rejected with 401/403 status code'
  );

  // Cross-tenant deactivation protection
  const crossDeactRes = await fetch(safeEndpoint(BASE_URL, 'users', otherUser.id, 'deactivate'), {
    method: 'POST',
    headers: authHeaders,
  });
  assert(
    crossDeactRes.status === 403,
    'Cross-tenant deactivation correctly blocked with 403 Forbidden'
  );

  // Inactive filter test
  const inactiveUsersRes = await fetch(`${BASE_URL}/users?type=INACTIVE`, { headers: authHeaders });
  const inactiveUsersData: any = await inactiveUsersRes.json();
  assert(
    inactiveUsersData.users.some((u: any) => u.id === testUser.id),
    'GET /users?type=INACTIVE includes newly deactivated user'
  );

  // 7. Verify Work Items API for Dashboard Metrics
  console.log('\n7. Work Items Live API Verification');
  const workItemsRes = await fetch(`${BASE_URL}/work-items`, { headers: authHeaders });
  const workItemsData: any = await workItemsRes.json();
  assert(
    workItemsRes.status === 200 && Array.isArray(workItemsData.work_items),
    'GET /work-items returned live work items array'
  );

  // 8. Verify Forms API for Clean Empty State / Live Listing
  console.log('\n8. Forms API Verification');
  const formsRes = await fetch(`${BASE_URL}/forms`, { headers: authHeaders });
  const formsData: any = await formsRes.json();
  assert(
    formsRes.status === 200 && Array.isArray(formsData.forms),
    'GET /forms returned live forms array without mock crash'
  );

  // Clean up test data
  console.log('\n9. Cleanup Verification Test Data');
  await prisma.userSession.deleteMany({ where: { user_id: testUser.id } });
  await prisma.userRole.deleteMany({ where: { user_id: testUser.id } });
  await prisma.user.delete({ where: { id: testUser.id } });
  await prisma.user.delete({ where: { id: otherUser.id } });
  if (otherOrg) {
    await prisma.organization.delete({ where: { id: otherOrg.id } });
  }
  console.log('   Cleaned up test users and temporary organization.');

  console.log('\n================================================================');
  console.log(`HARDENING TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Hardening verification encountered an error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
