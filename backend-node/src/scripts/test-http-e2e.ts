import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import http from 'http';

// Enforce local isolated test database environment BEFORE importing prisma/app
const LOCAL_TEST_DB_URL = 'postgresql://pms_user:changeme@127.0.0.1:5432/pms_test_db';
process.env.DATABASE_URL = LOCAL_TEST_DB_URL;
process.env.PM_SERVICE_JWT_SECRET = 'dedicated-pm-service-jwt-secret-key-32chars!';
process.env.JWT_ACCESS_SECRET = 'test-jwt-access-secret-32chars-min!!';
process.env.NODE_ENV = 'test';

const SERVICE_SECRET = process.env.PM_SERVICE_JWT_SECRET;
const TEST_PORT = 3099;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

function generateServiceToken(orgId: string, expiresInSec: number = 120): string {
  const nowSec = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: 'mirai-django',
      aud: 'pm-membership-api',
      scope: 'membership:read',
      org: orgId,
      iat: nowSec,
      exp: nowSec + expiresInSec,
    },
    SERVICE_SECRET,
    { algorithm: 'HS256' }
  );
}

async function run() {
  const startTime = Date.now();
  console.log('================================================================');
  console.log('REAL PM HTTP RECONCILIATION & MEMBERSHIP END-TO-END TEST');
  console.log('================================================================');

  // Dynamic imports ensure environment variables are applied to PrismaClient
  const { prisma, getSanitizedDatabaseInfo } = await import('../lib/prisma');
  const appModule = await import('../app');
  const app = appModule.default || appModule.app;

  // Step 1: Pre-flight Database Target Check
  const dbInfo: any[] = await prisma.$queryRawUnsafe(
    `SELECT inet_server_addr() AS ip, inet_server_port() AS port, current_database() AS db_name, current_user AS db_user;`
  );
  const currentDb = dbInfo[0]?.db_name;
  const currentPort = dbInfo[0]?.port;
  const sanitized = getSanitizedDatabaseInfo();

  console.log('\n[1. Database Connection Target Check]');
  console.log(`Database Name: ${currentDb}`);
  console.log(`Database Host: ${sanitized.host}`);
  console.log(`Database Port: ${currentPort || 5432}`);
  console.log(`Database User: ${dbInfo[0]?.db_user}`);
  console.log(`Pool Mode:     ${sanitized.pool_mode}`);

  if (currentDb !== 'pms_test_db') {
    throw new Error(`CRITICAL ABORT: Target database is NOT 'pms_test_db'. Connected to: ${currentDb}`);
  }
  if (sanitized.host !== '127.0.0.1' && sanitized.host !== 'localhost') {
    throw new Error(`CRITICAL ABORT: Host is not local: ${sanitized.host}`);
  }

  // Step 2: Start the real PM Express HTTP Server on port 3099
  console.log(`\n[2. Starting Local PM Express HTTP Server on ${BASE_URL}]`);
  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.listen(TEST_PORT, '127.0.0.1', () => {
      console.log(`PM API listening on ${BASE_URL}`);
      resolve();
    });
    server.on('error', reject);
  });

  // Step 3: Probe Health Endpoint over HTTP
  console.log('\n[3. Probing PM API Health Endpoint over HTTP]');
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  const healthJson = await healthRes.json();
  console.log(`HTTP ${healthRes.status}:`, JSON.stringify(healthJson, null, 2));

  if (healthRes.status !== 200 || healthJson.status !== 'ok') {
    throw new Error('Health check failed or database degraded');
  }

  // Step 4: Generate RFC 4122 v4 UUID fixtures
  const orgId = crypto.randomUUID();
  const projId = crypto.randomUUID();
  const pmUserId1 = crypto.randomUUID();
  const miraiUserId1 = crypto.randomUUID();
  const synthEmail1 = `synthetic.sriram.qa.${Date.now()}@example.internal`;

  console.log('\n[4. Generated Synthetic Fixtures]');
  console.log(`Disposable Organization UUID: ${orgId}`);
  console.log(`Synthetic Project UUID:       ${projId}`);
  console.log(`Synthetic PM User UUID:       ${pmUserId1}`);
  console.log(`Synthetic PM User Email:      ${synthEmail1}`);
  console.log(`Synthetic MIRAI User UUID:    ${miraiUserId1}`);

  try {
    // Check initial row count in user_identity_mappings
    const initialMappingCount = await prisma.userIdentityMapping.count({
      where: { organization_id: orgId },
    });
    console.log(`Initial mapping count for test org: ${initialMappingCount}`);

    // Insert synthetic organization, PM user, and project in isolated database
    await prisma.organization.create({
      data: {
        id: orgId,
        name: 'Synthetic QA Organization',
        is_active: true,
      },
    });

    await prisma.user.create({
      data: {
        id: pmUserId1,
        organization: { connect: { id: orgId } },
        name: 'Synthetic QA Engineer',
        email: synthEmail1,
        password_hash: 'dummy_hash',
        is_active: true,
        must_change_password: false,
      },
    });

    await prisma.project.create({
      data: {
        id: projId,
        organization: { connect: { id: orgId } },
        owner: { connect: { id: pmUserId1 } },
        name: 'Synthetic Verification Project',
        description: 'E2E Testing Project',
        status: 'ACTIVE',
      },
    });

    await prisma.projectMember.create({
      data: {
        project: { connect: { id: projId } },
        user: { connect: { id: pmUserId1 } },
        project_role: 'TECH_LEAD',
      },
    });

    const validToken = generateServiceToken(orgId);

    // =========================================================================
    // Scenario 1: Existing PM User — HTTP POST /internal/mirai/v1/identities/reconcile
    // =========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log('SCENARIO 1: Existing PM User Reconcile over HTTP');
    console.log('----------------------------------------------------------------');

    const reqBody1 = {
      mirai_user_id: miraiUserId1,
      email: synthEmail1,
    };
    console.log(`Sending HTTP POST ${BASE_URL}/internal/mirai/v1/identities/reconcile`);
    console.log('Request Payload:', JSON.stringify(reqBody1, null, 2));

    const httpRes1 = await fetch(`${BASE_URL}/internal/mirai/v1/identities/reconcile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify(reqBody1),
    });

    const resJson1 = await httpRes1.json();
    console.log(`\nHTTP Status: ${httpRes1.status}`);
    console.log('Response Payload:', JSON.stringify(resJson1, null, 2));

    if (httpRes1.status !== 200) throw new Error(`HTTP reconcile failed with status ${httpRes1.status}`);
    if (resJson1.mapping_status !== 'mapped') throw new Error(`Expected 'mapped', got ${resJson1.mapping_status}`);
    if (resJson1.mapping_source !== 'auto_mapped_by_email') throw new Error(`Expected 'auto_mapped_by_email', got ${resJson1.mapping_source}`);
    if (resJson1.pm_user_id !== pmUserId1) throw new Error(`Expected pm_user_id ${pmUserId1}, got ${resJson1.pm_user_id}`);
    if (!resJson1.project_ids.includes(projId)) throw new Error(`Expected project_ids to contain ${projId}`);

    // Direct SQL verification in PostgreSQL
    console.log('\n[Direct PostgreSQL Verification - Scenario 1]');
    const persistedMapping1 = await prisma.userIdentityMapping.findFirst({
      where: { mirai_user_id: miraiUserId1, organization_id: orgId },
    });
    console.log('Directly Queried Mapping Row:', JSON.stringify(persistedMapping1, null, 2));
    if (!persistedMapping1 || persistedMapping1.pm_user_id !== pmUserId1) {
      throw new Error('Database verification failed: mapping row not found in user_identity_mappings');
    }

    // Idempotency: Send the exact same HTTP request again
    console.log('\n[Idempotency Verification]');
    const httpRes1Idempotent = await fetch(`${BASE_URL}/internal/mirai/v1/identities/reconcile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify(reqBody1),
    });
    const resJson1Idempotent = await httpRes1Idempotent.json();
    console.log(`HTTP Status: ${httpRes1Idempotent.status}`);
    console.log('Response Payload:', JSON.stringify(resJson1Idempotent, null, 2));

    if (resJson1Idempotent.mapping_status !== 'mapped' || resJson1Idempotent.mapping_source !== 'existing_mapping') {
      throw new Error('Idempotent request did not return existing_mapping');
    }

    const mappingCountAfterIdempotency = await prisma.userIdentityMapping.count({
      where: { organization_id: orgId },
    });
    console.log(`Mapping count after repeat request: ${mappingCountAfterIdempotency} (Expected: 1)`);
    if (mappingCountAfterIdempotency !== 1) throw new Error('Duplicate mapping created on retry');

    // Membership HTTP Endpoint Verification
    console.log('\n[Membership Resolution over HTTP]');
    console.log(`Sending HTTP GET ${BASE_URL}/internal/mirai/v1/users/${miraiUserId1}/project-memberships`);
    const httpResMem = await fetch(`${BASE_URL}/internal/mirai/v1/users/${miraiUserId1}/project-memberships`, {
      headers: {
        Authorization: `Bearer ${validToken}`,
      },
    });
    const resJsonMem = await httpResMem.json();
    console.log(`HTTP Status: ${httpResMem.status}`);
    console.log('Response Payload:', JSON.stringify(resJsonMem, null, 2));

    if (httpResMem.status !== 200 || resJsonMem.mapping_status !== 'mapped') {
      throw new Error('Membership resolution failed');
    }
    if (!resJsonMem.project_ids.includes(projId)) {
      throw new Error('Membership resolution did not return expected project ID');
    }

    // =========================================================================
    // Scenario 2: User Not Found over HTTP
    // =========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log('SCENARIO 2: User Not Found over HTTP');
    console.log('----------------------------------------------------------------');

    const nonExistentMiraiId = crypto.randomUUID();
    const nonExistentEmail = `nonexistent.${Date.now()}@example.invalid`;
    const countBeforeNotFound = await prisma.userIdentityMapping.count({ where: { organization_id: orgId } });

    console.log(`Sending HTTP POST ${BASE_URL}/internal/mirai/v1/identities/reconcile with nonexistent email`);
    const httpRes2 = await fetch(`${BASE_URL}/internal/mirai/v1/identities/reconcile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({
        mirai_user_id: nonExistentMiraiId,
        email: nonExistentEmail,
      }),
    });
    const resJson2 = await httpRes2.json();
    console.log(`HTTP Status: ${httpRes2.status}`);
    console.log('Response Payload:', JSON.stringify(resJson2, null, 2));

    if (httpRes2.status !== 200) throw new Error(`Expected HTTP 200 for unmapped user, got ${httpRes2.status}`);
    if (resJson2.mapping_status !== 'unmapped' || resJson2.pm_user_id !== null) {
      throw new Error(`Expected unmapped status and null pm_user_id`);
    }

    const countAfterNotFound = await prisma.userIdentityMapping.count({ where: { organization_id: orgId } });
    console.log(`Mapping count before: ${countBeforeNotFound}, after: ${countAfterNotFound} (Expected: unchanged)`);
    if (countBeforeNotFound !== countAfterNotFound) throw new Error('Mapping row was erroneously created for non-existent user');

    // =========================================================================
    // Scenario 3: Ambiguous Email over HTTP
    // =========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log('SCENARIO 3: Ambiguous Email over HTTP');
    console.log('----------------------------------------------------------------');

    const ambigEmailLower = `ambig.${Date.now()}@example.internal`;
    const ambigEmailUpper = ambigEmailLower.toUpperCase();
    const ambigUserA = crypto.randomUUID();
    const ambigUserB = crypto.randomUUID();

    await prisma.user.create({
      data: {
        id: ambigUserA,
        organization: { connect: { id: orgId } },
        name: 'Ambig User Lower',
        email: ambigEmailLower,
        password_hash: 'dummy',
        is_active: true,
        must_change_password: false,
      },
    });

    await prisma.user.create({
      data: {
        id: ambigUserB,
        organization: { connect: { id: orgId } },
        name: 'Ambig User Upper',
        email: ambigEmailUpper,
        password_hash: 'dummy',
        is_active: true,
        must_change_password: false,
      },
    });

    const ambigMiraiId = crypto.randomUUID();
    const countBeforeAmbig = await prisma.userIdentityMapping.count({ where: { organization_id: orgId } });

    console.log(`Sending HTTP POST ${BASE_URL}/internal/mirai/v1/identities/reconcile with ambiguous email`);
    const httpRes3 = await fetch(`${BASE_URL}/internal/mirai/v1/identities/reconcile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({
        mirai_user_id: ambigMiraiId,
        email: ambigEmailLower,
      }),
    });
    const resJson3 = await httpRes3.json();
    console.log(`HTTP Status: ${httpRes3.status}`);
    console.log('Response Payload:', JSON.stringify(resJson3, null, 2));

    if (httpRes3.status !== 200 || resJson3.mapping_status !== 'ambiguous' || resJson3.pm_user_id !== null) {
      throw new Error(`Ambiguous email scenario did not fail closed`);
    }

    const countAfterAmbig = await prisma.userIdentityMapping.count({ where: { organization_id: orgId } });
    console.log(`Mapping count before: ${countBeforeAmbig}, after: ${countAfterAmbig} (Expected: unchanged)`);
    if (countBeforeAmbig !== countAfterAmbig) throw new Error('Mapping row was erroneously created for ambiguous email');

    // =========================================================================
    // Scenario 4: Invalid Organization Authorization over HTTP
    // =========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log('SCENARIO 4: Invalid Organization Authorization over HTTP');
    console.log('----------------------------------------------------------------');

    const invalidOrgToken = generateServiceToken(crypto.randomUUID());
    const httpRes4 = await fetch(`${BASE_URL}/internal/mirai/v1/identities/reconcile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${invalidOrgToken}`,
      },
      body: JSON.stringify({
        mirai_user_id: crypto.randomUUID(),
        email: 'anyone@example.internal',
      }),
    });
    const resJson4 = await httpRes4.json();
    console.log(`HTTP Status: ${httpRes4.status}`);
    console.log('Response Payload:', JSON.stringify(resJson4, null, 2));

    if (httpRes4.status !== 403) throw new Error(`Expected HTTP 403 for invalid org, got ${httpRes4.status}`);

    // =========================================================================
    // Scenario 5: Conflicting Identity Mapping over HTTP
    // =========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log('SCENARIO 5: Conflicting Identity Mapping over HTTP');
    console.log('----------------------------------------------------------------');

    const conflictPmUserId = crypto.randomUUID();
    const conflictEmail = `conflict.${Date.now()}@example.internal`;
    const initialMiraiId = crypto.randomUUID();
    const secondMiraiId = crypto.randomUUID();

    await prisma.user.create({
      data: {
        id: conflictPmUserId,
        organization: { connect: { id: orgId } },
        name: 'Conflict PM User',
        email: conflictEmail,
        password_hash: 'dummy',
        is_active: true,
        must_change_password: false,
      },
    });

    await prisma.userIdentityMapping.create({
      data: {
        organization_id: orgId,
        mirai_user_id: initialMiraiId,
        pm_user_id: conflictPmUserId,
      },
    });

    const httpRes5 = await fetch(`${BASE_URL}/internal/mirai/v1/identities/reconcile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({
        mirai_user_id: secondMiraiId,
        email: conflictEmail,
      }),
    });
    const resJson5 = await httpRes5.json();
    console.log(`HTTP Status: ${httpRes5.status}`);
    console.log('Response Payload:', JSON.stringify(resJson5, null, 2));

    if (httpRes5.status !== 200 || resJson5.mapping_status !== 'conflict' || resJson5.pm_user_id !== null) {
      throw new Error(`Conflicting mapping scenario did not return 'conflict'`);
    }

    // Direct SQL query table dump
    console.log('\n----------------------------------------------------------------');
    console.log('DIRECT POSTGRESQL TABLE QUERY EVIDENCE');
    console.log('----------------------------------------------------------------');
    const tableDump: any[] = await prisma.$queryRawUnsafe(
      `SELECT m.id, m.organization_id, m.mirai_user_id, m.pm_user_id, u.email, m.created_at
       FROM user_identity_mappings m
       JOIN users u ON m.pm_user_id = u.id
       WHERE m.organization_id = '${orgId}'
       ORDER BY m.created_at ASC;`
    );
    console.table(tableDump);

    console.log('\n================================================================');
    console.log('ALL HTTP END-TO-END SCENARIOS VERIFIED SUCCESSFULLY');
    console.log('================================================================');

  } finally {
    // Teardown synthetic records
    console.log('\n[Teardown] Cleaning up test fixtures for org:', orgId);
    await prisma.userIdentityMapping.deleteMany({ where: { organization_id: orgId } });
    await prisma.projectMember.deleteMany({ where: { project: { organization_id: orgId } } });
    await prisma.project.deleteMany({ where: { organization_id: orgId } });
    await prisma.user.deleteMany({ where: { organization_id: orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });

    const remMappings = await prisma.userIdentityMapping.count({ where: { organization_id: orgId } });
    const remUsers = await prisma.user.count({ where: { organization_id: orgId } });
    const remOrgs = await prisma.organization.count({ where: { id: orgId } });
    console.log(`Remaining in test org - Mappings: ${remMappings}, Users: ${remUsers}, Orgs: ${remOrgs}`);

    // Stop HTTP server
    await new Promise<void>((resolve) => {
      server.close(() => {
        console.log('PM Express HTTP Server stopped cleanly.');
        resolve();
      });
    });

    const elapsed = Date.now() - startTime;
    console.log(`Total test duration: ${elapsed}ms.`);
    await prisma.$disconnect();
  }
}

run()
  .catch((err) => {
    console.error('HTTP E2E Test Failure:', err);
    process.exit(1);
  });

