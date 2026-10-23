import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';

// 1. Enforce local isolated test database environment BEFORE importing prisma/app
const LOCAL_TEST_DB_URL = 'postgresql://pms_user:changeme@127.0.0.1:5432/pms_test_db';
process.env.DATABASE_URL = LOCAL_TEST_DB_URL;
process.env.PM_SERVICE_JWT_SECRET = 'test-dedicated-pm-service-jwt-secret-key-32chars!';
process.env.JWT_ACCESS_SECRET = 'test-jwt-access-secret-32chars-min!!';
process.env.NODE_ENV = 'test';

const SERVICE_SECRET = process.env.PM_SERVICE_JWT_SECRET;

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
  console.log('--- Starting PM Identity Reconciliation & Membership E2E Verification ---');

  // Dynamic imports ensure process.env.DATABASE_URL is set before PrismaClient initializes
  const { prisma } = await import('../lib/prisma');
  const appModule = await import('../app');
  const app = appModule.default || appModule.app;

  // Step 1: Verify database connection target
  const dbInfo: any[] = await prisma.$queryRawUnsafe(
    `SELECT inet_server_addr() AS ip, inet_server_port() AS port, current_database() AS db_name, current_user AS db_user;`
  );
  const currentDb = dbInfo[0]?.db_name;
  const currentPort = dbInfo[0]?.port;
  console.log(`[Target Check] Database: ${currentDb}, Port: ${currentPort || 5432}, User: ${dbInfo[0]?.db_user}`);

  if (currentDb !== 'pms_test_db') {
    throw new Error(`CRITICAL ABORT: Target database is NOT 'pms_test_db'. Connected to: ${currentDb}`);
  }

  // Step 2: Generate RFC 4122 v4 UUID fixtures
  const orgId = crypto.randomUUID();
  const projId = crypto.randomUUID();
  const pmUserId1 = crypto.randomUUID();
  const miraiUserId1 = crypto.randomUUID();
  const synthEmail1 = `synth.intern.${Date.now()}@example.internal`;

  console.log(`[Fixtures] Org UUID: ${orgId}`);
  console.log(`[Fixtures] Project UUID: ${projId}`);
  console.log(`[Fixtures] PM User UUID: ${pmUserId1} (${synthEmail1})`);
  console.log(`[Fixtures] MIRAI User UUID: ${miraiUserId1}`);

  try {
    // Step 3: Insert prerequisite organization, project, and PM user in isolated DB
    await prisma.organization.create({
      data: {
        id: orgId,
        name: 'Synthetic E2E Org',
        is_active: true,
      },
    });

    await prisma.user.create({
      data: {
        id: pmUserId1,
        name: 'Synthetic QA Intern',
        email: synthEmail1,
        password_hash: 'dummy_hash',
        is_active: true,
        must_change_password: false,
        organization: { connect: { id: orgId } },
      },
    });

    await prisma.project.create({
      data: {
        id: projId,
        name: 'Synthetic Project Alpha',
        description: 'E2E Testing Project',
        status: 'ACTIVE',
        organization: { connect: { id: orgId } },
        owner: { connect: { id: pmUserId1 } },
      },
    });

    await prisma.projectMember.create({
      data: {
        project: { connect: { id: projId } },
        user: { connect: { id: pmUserId1 } },
        project_role: 'MEMBER',
      },
    });

    const validToken = generateServiceToken(orgId);

    // --- Scenario 1: Mapping Creation via POST /internal/mirai/v1/identities/reconcile ---
    console.log('\n[Scenario 1] Testing mapping creation via reconcile endpoint...');
    const res1 = await request(app)
      .post('/internal/mirai/v1/identities/reconcile')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        mirai_user_id: miraiUserId1,
        email: synthEmail1,
      });

    console.log(`[Scenario 1 Response] HTTP ${res1.status}:`, res1.body);
    if (res1.status !== 200) throw new Error(`Scenario 1 failed with status ${res1.status}`);
    if (res1.body.mapping_status !== 'mapped') throw new Error(`Expected mapping_status 'mapped', got ${res1.body.mapping_status}`);
    if (res1.body.mapping_source !== 'auto_mapped_by_email') throw new Error(`Expected mapping_source 'auto_mapped_by_email', got ${res1.body.mapping_source}`);
    if (res1.body.pm_user_id !== pmUserId1) throw new Error(`Expected pm_user_id ${pmUserId1}, got ${res1.body.pm_user_id}`);
    if (!res1.body.project_ids.includes(projId)) throw new Error(`Expected project_ids to include ${projId}`);

    // Query DB directly to prove persistence
    const directMapping1 = await prisma.userIdentityMapping.findFirst({
      where: { mirai_user_id: miraiUserId1, organization_id: orgId },
    });
    console.log('[Scenario 1 DB Check] Persisted mapping in PostgreSQL:', directMapping1);
    if (!directMapping1 || directMapping1.pm_user_id !== pmUserId1) {
      throw new Error('Scenario 1 DB check failed: mapping not persisted in database');
    }

    // --- Scenario 2: Idempotent Second Reconcile Request ---
    console.log('\n[Scenario 2] Testing idempotency with identical reconcile request...');
    const res2 = await request(app)
      .post('/internal/mirai/v1/identities/reconcile')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        mirai_user_id: miraiUserId1,
        email: synthEmail1,
      });

    console.log(`[Scenario 2 Response] HTTP ${res2.status}:`, res2.body);
    if (res2.status !== 200) throw new Error(`Scenario 2 failed with status ${res2.status}`);
    if (res2.body.mapping_status !== 'mapped') throw new Error(`Expected mapping_status 'mapped', got ${res2.body.mapping_status}`);
    if (res2.body.mapping_source !== 'existing_mapping') throw new Error(`Expected mapping_source 'existing_mapping', got ${res2.body.mapping_source}`);
    if (res2.body.pm_user_id !== pmUserId1) throw new Error(`Expected pm_user_id ${pmUserId1}, got ${res2.body.pm_user_id}`);

    // Check count in DB - must remain exactly 1
    const mappingCountOrg = await prisma.userIdentityMapping.count({
      where: { organization_id: orgId },
    });
    console.log(`[Scenario 2 DB Check] Mapping count for org: ${mappingCountOrg}`);
    if (mappingCountOrg !== 1) throw new Error(`Expected exactly 1 mapping, found ${mappingCountOrg}`);

    // --- Scenario 3: Membership Resolution via GET /users/:mirai_user_id/project-memberships ---
    console.log('\n[Scenario 3] Testing membership endpoint resolution for mapped MIRAI user...');
    const res3 = await request(app)
      .get(`/internal/mirai/v1/users/${miraiUserId1}/project-memberships`)
      .set('Authorization', `Bearer ${validToken}`);

    console.log(`[Scenario 3 Response] HTTP ${res3.status}:`, res3.body);
    if (res3.status !== 200) throw new Error(`Scenario 3 failed with status ${res3.status}`);
    if (res3.body.mapping_status !== 'mapped') throw new Error(`Expected mapping_status 'mapped', got ${res3.body.mapping_status}`);
    if (res3.body.pm_user_id !== pmUserId1) throw new Error(`Expected pm_user_id ${pmUserId1}, got ${res3.body.pm_user_id}`);
    if (!res3.body.project_ids.includes(projId)) throw new Error(`Expected project_ids to include ${projId}`);

    // --- Scenario 4: Safe Failure — Inactive / Nonexistent Organization in Token ---
    console.log('\n[Scenario 4] Testing safe failure for token with non-existent organization...');
    const invalidOrgToken = generateServiceToken(crypto.randomUUID());
    const res4 = await request(app)
      .post('/internal/mirai/v1/identities/reconcile')
      .set('Authorization', `Bearer ${invalidOrgToken}`)
      .send({
        mirai_user_id: crypto.randomUUID(),
        email: 'anyone@example.internal',
      });

    console.log(`[Scenario 4 Response] HTTP ${res4.status}:`, res4.body);
    if (res4.status !== 403) throw new Error(`Expected HTTP 403 for invalid org, got ${res4.status}`);

    // --- Scenario 5: Safe Failure — Ambiguous Email ---
    console.log('\n[Scenario 5] Testing safe failure for ambiguous email...');
    const ambigUserIdA = crypto.randomUUID();
    const ambigUserIdB = crypto.randomUUID();
    const ambigEmailLower = `ambig.${Date.now()}@example.internal`;
    const ambigEmailUpper = ambigEmailLower.toUpperCase();

    await prisma.user.create({
      data: {
        id: ambigUserIdA,
        organization: { connect: { id: orgId } },
        name: 'Ambig User A',
        email: ambigEmailLower,
        password_hash: 'dummy',
        is_active: true,
        must_change_password: false,
      },
    });

    await prisma.user.create({
      data: {
        id: ambigUserIdB,
        organization: { connect: { id: orgId } },
        name: 'Ambig User B',
        email: ambigEmailUpper,
        password_hash: 'dummy',
        is_active: true,
        must_change_password: false,
      },
    });

    const miraiAmbigId = crypto.randomUUID();
    const res5 = await request(app)
      .post('/internal/mirai/v1/identities/reconcile')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        mirai_user_id: miraiAmbigId,
        email: ambigEmailLower,
      });

    console.log(`[Scenario 5 Response] HTTP ${res5.status}:`, res5.body);
    if (res5.status !== 200) throw new Error(`Scenario 5 failed with status ${res5.status}`);
    if (res5.body.mapping_status !== 'ambiguous') throw new Error(`Expected mapping_status 'ambiguous', got ${res5.body.mapping_status}`);
    if (res5.body.pm_user_id !== null) throw new Error(`Expected pm_user_id null, got ${res5.body.pm_user_id}`);

    // Verify DB: No mapping created for miraiAmbigId
    const ambigDbMapping = await prisma.userIdentityMapping.findFirst({
      where: { mirai_user_id: miraiAmbigId },
    });
    if (ambigDbMapping) throw new Error('Ambiguous email should not have created any mapping');

    // --- Scenario 6: Safe Failure — Conflicting Mapping ---
    console.log('\n[Scenario 6] Testing safe failure for conflicting PM user mapping...');
    const conflictPmUserId = crypto.randomUUID();
    const conflictEmail = `conflict.${Date.now()}@example.internal`;
    const initialMiraiId = crypto.randomUUID();
    const secondMiraiId = crypto.randomUUID();

    await prisma.user.create({
      data: {
        id: conflictPmUserId,
        organization: { connect: { id: orgId } },
        name: 'Conflict User',
        email: conflictEmail,
        password_hash: 'dummy',
        is_active: true,
        must_change_password: false,
      },
    });

    // Initial mapping creates link to initialMiraiId
    await prisma.userIdentityMapping.create({
      data: {
        organization_id: orgId,
        mirai_user_id: initialMiraiId,
        pm_user_id: conflictPmUserId,
      },
    });

    // Attempting to reconcile secondMiraiId with same email must result in 'conflict'
    const res6 = await request(app)
      .post('/internal/mirai/v1/identities/reconcile')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        mirai_user_id: secondMiraiId,
        email: conflictEmail,
      });

    console.log(`[Scenario 6 Response] HTTP ${res6.status}:`, res6.body);
    if (res6.status !== 200) throw new Error(`Scenario 6 failed with status ${res6.status}`);
    if (res6.body.mapping_status !== 'conflict') throw new Error(`Expected mapping_status 'conflict', got ${res6.body.mapping_status}`);
    if (res6.body.pm_user_id !== null) throw new Error(`Expected pm_user_id null, got ${res6.body.pm_user_id}`);

    // Verify DB: secondMiraiId must NOT have a mapping
    const secondDbMapping = await prisma.userIdentityMapping.findFirst({
      where: { mirai_user_id: secondMiraiId },
    });
    if (secondDbMapping) throw new Error('Conflicting mapping should not have created a mapping for second MIRAI ID');

    // --- Scenario 7: Safe Failure — Nonexistent PM User ---
    console.log('\n[Scenario 7] Testing safe failure for nonexistent PM user...');
    const nonexistentMiraiId = crypto.randomUUID();
    const res7 = await request(app)
      .post('/internal/mirai/v1/identities/reconcile')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        mirai_user_id: nonexistentMiraiId,
        email: `nonexistent.${Date.now()}@fictional.invalid`,
      });

    console.log(`[Scenario 7 Response] HTTP ${res7.status}:`, res7.body);
    if (res7.status !== 200) throw new Error(`Scenario 7 failed with status ${res7.status}`);
    if (res7.body.mapping_status !== 'unmapped') throw new Error(`Expected mapping_status 'unmapped', got ${res7.body.mapping_status}`);
    if (res7.body.pm_user_id !== null) throw new Error(`Expected pm_user_id null, got ${res7.body.pm_user_id}`);

    console.log('\n--- All Endpoint Scenarios Passed Successfully ---');

    // Step 8: Direct SQL Query Verification
    console.log('\n[Direct DB Verification] Querying PostgreSQL directly...');
    const persistedRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT m.id, m.organization_id, m.mirai_user_id, m.pm_user_id, u.email, m.created_at
       FROM user_identity_mappings m
       JOIN users u ON m.pm_user_id = u.id
       WHERE m.organization_id = '${orgId}'
       ORDER BY m.created_at ASC;`
    );
    console.log(`Found ${persistedRows.length} persisted mapping row(s) for test organization:`);
    console.table(persistedRows);

  } finally {
    // Step 9: Teardown & Clean Up Only Test Data Created In This Run
    console.log('\n[Teardown] Cleaning up synthetic test fixtures for org:', orgId);
    await prisma.userIdentityMapping.deleteMany({ where: { organization_id: orgId } });
    await prisma.projectMember.deleteMany({ where: { project: { organization_id: orgId } } });
    await prisma.project.deleteMany({ where: { organization_id: orgId } });
    await prisma.user.deleteMany({ where: { organization_id: orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });

    const remainingMappings = await prisma.userIdentityMapping.count({ where: { organization_id: orgId } });
    const remainingUsers = await prisma.user.count({ where: { organization_id: orgId } });
    const remainingOrgs = await prisma.organization.count({ where: { id: orgId } });
    console.log(`[Teardown Verification] Remaining in test org - Mappings: ${remainingMappings}, Users: ${remainingUsers}, Orgs: ${remainingOrgs}`);

    const elapsed = Date.now() - startTime;
    console.log(`\nCompleted verification in ${elapsed}ms.`);
    await prisma.$disconnect();
  }
}

run()
  .catch((err) => {
    console.error('E2E Verification Error:', err);
    process.exit(1);
  });
