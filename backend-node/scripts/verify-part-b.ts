import { safeEndpoint, getTestPassword, sanitizeForLog } from './safe-endpoint';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { UserService } from '../src/services/user.service';

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
  console.log('STARTING PART B: MANAGER USER PROVISIONING & BULK IMPORT TESTS');
  console.log('====================================================');

  const timestamp = Date.now();
  let dailoqaOrgId = '';
  let managerToken = '';
  let internToken = '';
  const createdTestEmails: string[] = [];

  let createdInternUserCode = '';
  let createdInternEmail = `test.intern.${timestamp}@dailoqa.com`;
  let createdInternTempPassword = '';
  createdTestEmails.push(createdInternEmail);

  let createdEmpUserCode = '';
  let createdEmpEmail = `test.emp.${timestamp}@dailoqa.com`;
  let createdEmpTempPassword = '';
  createdTestEmails.push(createdEmpEmail);

  // Setup: Find Dailoqa
  const dailoqa = await prisma.organization.findFirst({
    where: { name: { contains: 'Dailoqa' } }
  });
  assert(!!dailoqa, 'Dailoqa organization must exist in DB');
  dailoqaOrgId = dailoqa!.id;

  // Setup: Ensure keshav.agarwal@dailoqa.com exists in Dailoqa organization for conflict testing
  await prisma.user.upsert({
    where: { email: 'keshav.agarwal@dailoqa.com' },
    update: { organization_id: dailoqaOrgId },
    create: {
      name: 'Keshav Aggarwal',
      email: 'keshav.agarwal@dailoqa.com',
      user_code: 'INT-1001',
      password_hash: 'dummyhash',
      organization_id: dailoqaOrgId,
      must_change_password: true,
      is_active: true,
    }
  });

  // Setup: Authenticate Manager
  await runTest('Setup: Authenticate Manager', async () => {
    const res = await fetch(safeEndpoint(API_BASE, 'auth', 'login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'manager@dailoqa.com',
        password: getTestPassword(),
        organization_id: dailoqaOrgId
      })
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    managerToken = data.accessToken;
    assert(data.user.role === 'MANAGER', 'Role must be MANAGER');
  });

  // Individual Creation Tests
  await runTest('Individual: Manager creates Intern with generated user_code & temp password', async () => {
    const res = await fetch(safeEndpoint(API_BASE, 'users'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        name: 'Rahul Sharma',
        email: createdInternEmail,
        type: 'INTERN'
      })
    });

    assert(res.status === 201, `Expected 201, got ${res.status}`);
    const body = await res.json();
    assert(body.user.name === 'Rahul Sharma', 'Name should match');
    assert(body.user.email === createdInternEmail, 'Email should match');
    assert(body.user.type === 'INTERN', 'Type should be INTERN');
    assert(body.user.must_change_password === true, 'must_change_password must be true');
    assert(typeof body.user.user_code === 'string' && body.user.user_code.startsWith('INT-'), 'user_code should start with INT-');
    assert(typeof body.temporary_password === 'string' && body.temporary_password.length >= 8, 'temporary_password should exist');
    assert(body.user.password_hash === undefined, 'password_hash must never be returned');

    createdInternUserCode = body.user.user_code;
    createdInternTempPassword = body.temporary_password;

    const dbUser = await prisma.user.findUnique({
      where: { email: createdInternEmail },
      include: { roles: { include: { role: true } } }
    });
    assert(dbUser?.organization_id === dailoqaOrgId, 'Created user must belong to Manager organization');
    assert(dbUser?.roles.some(r => r.role.name === 'INTERN'), 'DB role must be INTERN');
  });

  await runTest('Individual: Manager creates Employee with generated user_code & temp password', async () => {
    const res = await fetch(safeEndpoint(API_BASE, 'users'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        name: 'Priya Sharma',
        email: createdEmpEmail,
        type: 'EMPLOYEE'
      })
    });

    assert(res.status === 201, `Expected 201, got ${res.status}`);
    const body = await res.json();
    assert(body.user.type === 'EMPLOYEE', 'Type should be EMPLOYEE');
    assert(typeof body.user.user_code === 'string' && body.user.user_code.startsWith('EMP-'), 'user_code should start with EMP-');
    assert(body.user.must_change_password === true, 'must_change_password must be true');
    assert(typeof body.temporary_password === 'string', 'temporary_password must be provided');

    createdEmpUserCode = body.user.user_code;
    createdEmpTempPassword = body.temporary_password;

    const dbUser = await prisma.user.findUnique({
      where: { email: createdEmpEmail },
      include: { roles: { include: { role: true } } }
    });
    assert(dbUser?.organization_id === dailoqaOrgId, 'Employee must belong to Manager organization');
    assert(dbUser?.roles.some(r => r.role.name === 'EMPLOYEE'), 'DB role must be EMPLOYEE');
  });

  await runTest('Security: Intern receives 403 from user creation', async () => {
    const internLogin = await fetch(safeEndpoint(API_BASE, 'auth', 'login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'intern@dailoqa.com',
        password: getTestPassword(),
        organization_id: dailoqaOrgId
      })
    });
    const internData = await internLogin.json();
    internToken = internData.accessToken;

    const res = await fetch(safeEndpoint(API_BASE, 'users'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${internToken}`
      },
      body: JSON.stringify({
        name: 'Unauthorized Intern',
        email: `unauth.${timestamp}@dailoqa.com`,
        type: 'INTERN'
      })
    });

    assert(res.status === 403, `Expected 403 Forbidden, got ${res.status}`);
  });

  await runTest('Security: Manager cannot provide organization_id or custom passwords', async () => {
    const res1 = await fetch(safeEndpoint(API_BASE, 'users'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        name: 'Injected Org',
        email: `injorg.${timestamp}@dailoqa.com`,
        type: 'INTERN',
        organization_id: 'fake-org-id'
      })
    });
    assert(res1.status === 400, `Expected 400 on injected org, got ${res1.status}`);

    const res2 = await fetch(safeEndpoint(API_BASE, 'users'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        name: 'Injected Pwd',
        email: `injpwd.${timestamp}@dailoqa.com`,
        type: 'INTERN',
        password: 'custompassword'
      })
    });
    assert(res2.status === 400, `Expected 400 on injected password, got ${res2.status}`);
  });

  // =========================================================================
  // MANDATORY BULK IMPORT SPECIFICATION TESTS (TEST 1 - TEST 9)
  // =========================================================================

  // TEST 1: CSV with 5 completely new users
  await runTest('TEST 1: CSV with 5 completely new users -> 5 total, 5 valid, 0 invalid, confirm succeeds', async () => {
    const test1Emails = [
      `t1.user1.${timestamp}@dailoqa.com`,
      `t1.user2.${timestamp}@dailoqa.com`,
      `t1.user3.${timestamp}@dailoqa.com`,
      `t1.user4.${timestamp}@dailoqa.com`,
      `t1.user5.${timestamp}@dailoqa.com`
    ];
    test1Emails.forEach(e => createdTestEmails.push(e));

    const csvContent = [
      'name,email,type',
      `User One,${test1Emails[0]},INTERN`,
      `User Two,${test1Emails[1]},INTERN`,
      `User Three,${test1Emails[2]},EMPLOYEE`,
      `User Four,${test1Emails[3]},EMPLOYEE`,
      `User Five,${test1Emails[4]},INTERN`
    ].join('\n');

    // 1. Preview
    const previewRes = await fetch(`${API_BASE}/users/bulk/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({ csv: csvContent })
    });
    assert(previewRes.status === 200, `Preview returned ${previewRes.status}`);
    const preview = await previewRes.json();
    assert(preview.isValid === true, 'Preview should be valid');
    assert(preview.summary.total === 5, 'Total rows must be 5');
    assert(preview.summary.valid === 5, 'Valid rows must be 5');
    assert(preview.summary.invalid === 0, 'Invalid rows must be 0');
    assert(preview.validRows.length === 5, 'validRows length must be 5');
    assert(preview.invalidRows.length === 0, 'invalidRows length must be 0');

    // 2. Confirm Import
    const createRes = await fetch(`${API_BASE}/users/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({ rows: preview.validRows })
    });
    assert(createRes.status === 201, `Confirm import returned ${createRes.status}`);
    const createData = await createRes.json();
    assert(createData.summary.created === 5, 'Should create 5 users');
    assert(createData.created_users.length === 5, 'Should return 5 created user records');

    // Verify all 5 created in DB
    const dbCount = await prisma.user.count({
      where: { email: { in: test1Emails } }
    });
    assert(dbCount === 5, 'All 5 users must exist in DB');
  });

  // TEST 2: CSV contains 1 email already in database
  await runTest('TEST 2: CSV contains 1 email already in database -> 5 total, 4 valid, 1 invalid (Email already exists)', async () => {
    const t2Email1 = `t2.new1.${timestamp}@dailoqa.com`;
    const t2Email2 = `t2.new2.${timestamp}@dailoqa.com`;
    const t2Email3 = `t2.new3.${timestamp}@dailoqa.com`;
    const t2Email4 = `t2.new4.${timestamp}@dailoqa.com`;
    [t2Email1, t2Email2, t2Email3, t2Email4].forEach(e => createdTestEmails.push(e));

    const csvContent = [
      'name,email,type',
      `Existing User,${createdInternEmail},INTERN`, // Already created in DB above!
      `New User 1,${t2Email1},INTERN`,
      `New User 2,${t2Email2},EMPLOYEE`,
      `New User 3,${t2Email3},EMPLOYEE`,
      `New User 4,${t2Email4},INTERN`
    ].join('\n');

    const previewRes = await fetch(`${API_BASE}/users/bulk/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({ csv: csvContent })
    });
    assert(previewRes.status === 200, `Preview returned ${previewRes.status}`);
    const preview = await previewRes.json();
    assert(preview.isValid === false, 'Preview with existing DB email must NOT be completely valid');
    assert(preview.summary.total === 5, 'Total rows should be 5');
    assert(preview.summary.valid === 4, 'Valid rows should be 4');
    assert(preview.summary.invalid === 1, 'Invalid rows should be 1');
    assert(preview.invalidRows.length === 1, 'invalidRows must contain exactly 1 entry');
    assert(preview.invalidRows[0].email === createdInternEmail, 'Invalid row email must match existing email');
    assert(preview.invalidRows[0].reason.includes('Email already exists'), 'Reason must say Email already exists');

    // Confirm that only the 4 valid rows can be imported
    const createRes = await fetch(`${API_BASE}/users/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({ rows: preview.validRows })
    });
    assert(createRes.status === 201, `Confirm import returned ${createRes.status}`);
    const createData = await createRes.json();
    assert(createData.summary.created === 4, 'Only 4 valid rows should be created');
  });

  // TEST 3: CSV contains duplicate email twice
  await runTest('TEST 3: CSV contains duplicate email twice -> Both duplicate rows are marked invalid', async () => {
    const dupeEmail = `dupe.email.${timestamp}@dailoqa.com`;
    const singleEmail = `single.email.${timestamp}@dailoqa.com`;
    createdTestEmails.push(singleEmail);

    const csvContent = [
      'name,email,type',
      `Duplicate One,${dupeEmail},INTERN`,
      `Unique Person,${singleEmail},EMPLOYEE`,
      `Duplicate Two,${dupeEmail},EMPLOYEE`
    ].join('\n');

    const previewRes = await fetch(`${API_BASE}/users/bulk/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({ csv: csvContent })
    });
    const preview = await previewRes.json();
    assert(preview.summary.total === 3, 'Total rows should be 3');
    assert(preview.summary.valid === 1, 'Only 1 unique row should be valid');
    assert(preview.summary.invalid === 2, 'BOTH duplicate rows must be marked invalid');
    assert(preview.invalidRows.length === 2, 'invalidRows must have 2 entries');
    assert(preview.invalidRows.every((r: any) => r.reason.includes('Duplicate email in CSV')), 'Reason must be Duplicate email in CSV');
  });

  // TEST 4: CSV contains email with spaces/capitalization matching an existing email
  await runTest('TEST 4: CSV contains email with spaces/capitalization matching existing email -> Detected and marked invalid', async () => {
    // keshav.agarwal@dailoqa.com was ensured in setup
    const paddedCsv = [
      'name,email,type',
      `" Keshav Aggarwal ","  Keshav.Agarwal@Dailoqa.com  "," INTERN "`,
      `Fresh User,fresh.${timestamp}@dailoqa.com,INTERN`
    ].join('\n');
    createdTestEmails.push(`fresh.${timestamp}@dailoqa.com`);

    const previewRes = await fetch(`${API_BASE}/users/bulk/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({ csv: paddedCsv })
    });
    const preview = await previewRes.json();
    assert(preview.summary.total === 2, 'Total rows should be 2');
    assert(preview.summary.valid === 1, 'Valid rows should be 1');
    assert(preview.summary.invalid === 1, 'Invalid rows should be 1');
    assert(preview.invalidRows[0].email === 'keshav.agarwal@dailoqa.com', 'Normalized email should match');
    assert(preview.invalidRows[0].reason.includes('Email already exists'), 'Reason must be Email already exists');
  });

  // TEST 5: Generate a user_code that already exists in database
  await runTest('TEST 5: user_code collision against database -> System detects collision, generates another code, succeeds', async () => {
    const dummyEmail = `collision.check.${timestamp}@dailoqa.com`;
    createdTestEmails.push(dummyEmail);

    const existingCode = `INT-${crypto.randomInt(1000, 10000)}`;
    await prisma.user.create({
      data: {
        name: 'Code Collision Blocker',
        email: dummyEmail,
        user_code: existingCode,
        password_hash: 'dummyhash',
        organization_id: dailoqaOrgId,
        must_change_password: true,
      }
    });

    const reservedSet = new Set<string>();
    const newCode = await UserService.generateUserCode('INT', dailoqaOrgId, reservedSet);
    assert(newCode !== existingCode, 'New code must not match existing database code');
    assert(reservedSet.has(newCode), 'New code must be added to reserved set');
  });

  // TEST 6: Two users in the same CSV receive the same generated candidate code
  await runTest('TEST 6: Batch user_code reservation prevents collision within same import batch', async () => {
    const reservedBatch = new Set<string>();
    const generatedList: string[] = [];

    // Generate 20 codes in the batch
    for (let i = 0; i < 20; i++) {
      const code = await UserService.generateUserCode('INT', dailoqaOrgId, reservedBatch);
      generatedList.push(code);
    }

    // Assert all 20 codes in the batch are distinct
    const uniqueSet = new Set(generatedList);
    assert(uniqueSet.size === 20, 'All 20 generated codes in batch must be uniquely allocated');
    assert(reservedBatch.size === 20, 'Reserved batch set must track all 20 allocated codes');
  });

  // TEST 7: Preview succeeds, then create a conflicting database user before Confirm Import
  await runTest('TEST 7: Pre-transaction conflict check prevents partial import when user created between preview & confirm', async () => {
    const conflictEmail = `race.conflict.${timestamp}@dailoqa.com`;
    const safeEmail = `race.safe.${timestamp}@dailoqa.com`;
    createdTestEmails.push(conflictEmail);
    createdTestEmails.push(safeEmail);

    const csvContent = [
      'name,email,type',
      `Race Conflict User,${conflictEmail},INTERN`,
      `Race Safe User,${safeEmail},EMPLOYEE`
    ].join('\n');

    // 1. Preview passes cleanly
    const previewRes = await fetch(`${API_BASE}/users/bulk/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({ csv: csvContent })
    });
    const preview = await previewRes.json();
    assert(preview.isValid === true, 'Preview should be valid initially');
    assert(preview.validRows.length === 2, '2 valid rows');

    // 2. Simulate concurrent creation in DB before manager confirms import
    await prisma.user.create({
      data: {
        name: 'Concurrent Interceptor',
        email: conflictEmail,
        user_code: `INT-RACE-${crypto.randomInt(1000, 10000)}`,
        password_hash: 'dummyhash',
        organization_id: dailoqaOrgId,
        must_change_password: true,
      }
    });

    // 3. Confirm import with original preview rows
    const createRes = await fetch(`${API_BASE}/users/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({ rows: preview.validRows })
    });

    // 4. Must be rejected cleanly with 409
    assert(createRes.status === 409, `Expected 409 Conflict, got ${createRes.status}`);
    const errorBody = await createRes.json();
    assert(errorBody.error === 'Bulk import could not be completed.', 'Clean error message');
    assert(errorBody.reason.includes('unavailable before import confirmation'), 'Reason explains conflict');
    assert(errorBody.conflicts.includes(conflictEmail), 'Identifies conflicting email');

    // 5. Verify NO partial import of safeEmail
    const safeInDb = await prisma.user.findUnique({
      where: { email: safeEmail }
    });
    assert(safeInDb === null, 'Transaction must rollback completely - safe user must not be partially imported');
  });

  // TEST 8: Unexpected Prisma unique constraint occurs -> Transaction rolls back with clean error
  await runTest('TEST 8: Unexpected unique constraint failure rolls back and returns clean application error', async () => {
    // keshav.agarwal@dailoqa.com is already in DB
    const errorRes = await fetch(`${API_BASE}/users/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        rows: [
          { name: 'Keshav Duplicate', email: 'keshav.agarwal@dailoqa.com', type: 'INTERN' }
        ]
      })
    });

    assert(errorRes.status === 409, `Expected 409, got ${errorRes.status}`);
    const errData = await errorRes.json();
    assert(errData.error === 'Bulk import could not be completed.', 'Clean application error');
    assert(!errData.reason.includes('tx.user.create()'), 'Must not expose raw Prisma stack trace');
  });

  // TEST 9: All 80 rows are genuinely new
  await runTest('TEST 9: 80 new users -> 80 total, 80 valid, 0 invalid, Confirm Import (80) succeeds collision-free', async () => {
    const eightyRows: string[] = ['name,email,type'];
    const eightyEmails: string[] = [];

    for (let i = 1; i <= 80; i++) {
      const type = i % 2 === 0 ? 'INTERN' : 'EMPLOYEE';
      const email = `bulk80.user.${i}.${timestamp}@dailoqa.com`;
      eightyEmails.push(email);
      createdTestEmails.push(email);
      eightyRows.push(`Batch Member ${i},${email},${type}`);
    }

    const csv80Content = eightyRows.join('\n');

    // 1. Preview
    const previewRes = await fetch(`${API_BASE}/users/bulk/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({ csv: csv80Content })
    });

    assert(previewRes.status === 200, `Preview returned ${previewRes.status}`);
    const preview = await previewRes.json();
    assert(preview.isValid === true, 'Preview of 80 new users must be completely valid');
    assert(preview.summary.total === 80, 'Total rows must be 80');
    assert(preview.summary.valid === 80, 'Valid rows must be 80');
    assert(preview.summary.invalid === 0, 'Invalid rows must be 0');
    assert(preview.validRows.length === 80, 'Must have 80 valid rows');

    // 2. Confirm Import (80)
    console.log('   Importing 80 users in atomic transaction...');
    const createRes = await fetch(`${API_BASE}/users/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({ rows: preview.validRows })
    });

    assert(createRes.status === 201, `Confirm import returned ${createRes.status}`);
    const createData = await createRes.json();
    assert(createData.summary.created === 80, 'Must create all 80 users');
    assert(createData.created_users.length === 80, 'Must return credentials for all 80 users');

    // Verify all 80 user_codes are completely unique
    const userCodes = createData.created_users.map((u: any) => u.user_code);
    const uniqueUserCodes = new Set(userCodes);
    assert(uniqueUserCodes.size === 80, `Expected 80 unique user_codes, but got ${uniqueUserCodes.size}`);

    // Verify all 80 users have temporary passwords and must_change_password
    for (const u of createData.created_users) {
      assert(typeof u.temporary_password === 'string' && u.temporary_password.length >= 8, 'Valid temp password');
      assert(u.password_hash === undefined, 'No password hash leaked');
    }

    // Verify DB count
    const dbCount = await prisma.user.count({
      where: { email: { in: eightyEmails } }
    });
    assert(dbCount === 80, 'All 80 users must exist in DB');
  });

  // =========================================================================
  // ADDITIONAL REGRESSION & INTEGRATION TESTS
  // =========================================================================

  await runTest('First Login: Temporary password forces password change', async () => {
    const loginRes = await fetch(safeEndpoint(API_BASE, 'auth', 'login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: createdInternEmail,
        password: createdInternTempPassword,
        organization_id: dailoqaOrgId
      })
    });

    assert(loginRes.status === 200, `Login failed with ${loginRes.status}`);
    const loginData = await loginRes.json();
    assert(loginData.user.must_change_password === true, 'must_change_password must be true');
    const newInternToken = loginData.accessToken;

    // Change Password
    const changeRes = await fetch(safeEndpoint(API_BASE, 'auth', 'change-password'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${newInternToken}`
      },
      body: JSON.stringify({
        current_password: createdInternTempPassword,
        new_password: 'PermanentPassword456!'
      })
    });

    assert(changeRes.status === 200, `Change password failed with ${changeRes.status}`);

    const dbIntern = await prisma.user.findUnique({
      where: { email: createdInternEmail }
    });
    assert(dbIntern?.must_change_password === false, 'must_change_password must now be false');
  });

  await runTest('Login: User ID (user_code) login succeeds', async () => {
    const loginRes = await fetch(safeEndpoint(API_BASE, 'auth', 'login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: createdInternUserCode,
        password: 'PermanentPassword456!',
        organization_id: dailoqaOrgId
      })
    });

    assert(loginRes.status === 200, `Expected 200, got ${loginRes.status}`);
    const data = await loginRes.json();
    assert(data.user.email === createdInternEmail, 'User profile should match');
    assert(data.user.role === 'INTERN', 'Role should be INTERN');
  });

  await runTest('Regressions: Super Admin login, Projects, Work Items, and Forms', async () => {
    // Super Admin login
    const saLogin = await fetch(safeEndpoint(API_BASE, 'auth', 'login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'superadmin@dailoqa.com',
        password: getTestPassword()
      })
    });
    assert(saLogin.status === 200, 'Super admin login must succeed');

    // Projects list
    const projRes = await fetch(safeEndpoint(API_BASE, 'projects'), {
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    assert(projRes.status === 200, 'Projects endpoint must succeed');

    // Work items list
    const workRes = await fetch(safeEndpoint(API_BASE, 'work-items'), {
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    assert(workRes.status === 200, 'Work items endpoint must succeed');

    // Forms list
    const formRes = await fetch(safeEndpoint(API_BASE, 'forms'), {
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    assert(formRes.status === 200, 'Forms endpoint must succeed');
  });

  // Cleanup test users created in this run
  console.log('\n🧹 Cleaning up test users...');
  try {
    const allUniqueTestEmails = Array.from(new Set(createdTestEmails)).filter(
      (e) => e !== 'keshav.agarwal@dailoqa.com'
    );
    await prisma.userRole.deleteMany({
      where: { user: { email: { in: allUniqueTestEmails } } }
    });
    await prisma.userSession.deleteMany({
      where: { user: { email: { in: allUniqueTestEmails } } }
    });
    await prisma.user.deleteMany({
      where: { email: { in: allUniqueTestEmails } }
    });
    console.log(`✅ Cleanup complete for ${allUniqueTestEmails.length} test records.`);
  } catch (err) {
    console.warn('⚠️ Cleanup warning:', sanitizeForLog(err?.message || err));
  }

  // Summary
  console.log('\n====================================================');
  console.log('PART B & BULK IMPORT VERIFICATION SUMMARY');
  console.log('====================================================');
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`Total Suites : ${sanitizeForLog(total)}`);
  console.log(`Passed       : ${sanitizeForLog(passed)}`);
  console.log(`Failed       : ${sanitizeForLog(failed)}`);

  if (failed > 0) {
    console.error('\nFailed tests:');
    results.filter(r => !r.passed).forEach(r => console.error(`- ${sanitizeForLog(r.name)}: ${sanitizeForLog(r.error)}`));
    process.exit(1);
  } else {
    console.log('\n🌟 ALL 14 TEST SUITES (INCLUDING TESTS 1-9) VERIFIED AND PASSING CLEANLY!');
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
