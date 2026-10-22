import dotenv from 'dotenv';
dotenv.config();

import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('\n======================================================');
  console.log('   MANUAL VERIFICATION: MIRAI /internal/mirai/v1 API  ');
  console.log('======================================================\n');

  // 1. Fetch live seed data from the database
  const org = await prisma.organization.findFirst({ where: { is_active: true } });
  if (!org) {
    console.error('❌ No active organization found in database.');
    process.exit(1);
  }

  const membership = await prisma.projectMember.findFirst({
    include: { user: true, project: true },
  });

  const memberUser = membership?.user;
  const project = membership?.project;

  // Find a non-member for negative test
  const nonMemberUser = memberUser
    ? await prisma.user.findFirst({
        where: {
          organization_id: org.id,
          id: { not: memberUser.id },
        },
      })
    : null;

  console.log('📋 Test Environment Context:');
  console.log(`- Organization ID: ${org.id} (${org.name})`);
  console.log(`- Member User ID:  ${memberUser?.id || 'N/A'} (${memberUser?.email || 'N/A'})`);
  console.log(`- Project ID:      ${project?.id || 'N/A'} (${project?.name || 'N/A'})`);
  console.log(`- Non-Member User: ${nonMemberUser?.id || 'N/A'} (${nonMemberUser?.email || 'N/A'})\n`);

  process.env.PM_SERVICE_JWT_SECRET = process.env.PM_SERVICE_JWT_SECRET || 'test-service-jwt-secret';
  const secret = process.env.PM_SERVICE_JWT_SECRET;

  // 2. Generate valid M2M Service JWT
  const validToken = jwt.sign(
    {
      iss: 'mirai-django',
      aud: 'pm-membership-api',
      scope: 'membership:read',
      role: 'SERVICE',
      org: org.id,
    },
    secret,
    { expiresIn: '5m' }
  );

  console.log('🔑 Generated Valid M2M Service JWT:');
  console.log(`${validToken.substring(0, 35)}...\n`);

  // ── TEST 1: List user project memberships ──────────────────────────────────
  console.log('▶ TEST 1: GET /internal/mirai/v1/users/:userId/project-memberships');
  if (memberUser) {
    const res1 = await request(app)
      .get(`/internal/mirai/v1/users/${memberUser.id}/project-memberships`)
      .set('Authorization', `Bearer ${validToken}`);

    console.log(`Status: ${res1.status}`);
    console.log('Response Body:', JSON.stringify(res1.body, null, 2));
    if (res1.status === 200 && res1.body.mapping_status === 'mapped') {
      console.log('✅ PASS: Successfully returned mapped project memberships.\n');
    } else {
      console.log('❌ FAIL\n');
    }
  }

  // ── TEST 2: Check single project membership (Positive) ──────────────────────
  console.log('▶ TEST 2: GET /internal/mirai/v1/users/:userId/projects/:projectId/membership (Positive)');
  if (memberUser && project) {
    const res2 = await request(app)
      .get(`/internal/mirai/v1/users/${memberUser.id}/projects/${project.id}/membership`)
      .set('Authorization', `Bearer ${validToken}`);

    console.log(`Status: ${res2.status}`);
    console.log('Response Body:', JSON.stringify(res2.body, null, 2));
    if (res2.status === 200 && res2.body.is_member === true) {
      console.log('✅ PASS: Successfully verified active project member.\n');
    } else {
      console.log('❌ FAIL\n');
    }
  }

  // ── TEST 3: Check single project membership (Negative / Non-Member) ─────────
  console.log('▶ TEST 3: Negative Test - Non-Member / Revoked Member Check');
  const targetNonMemberId = nonMemberUser?.id || '00000000-0000-0000-0000-000000000999';
  if (project) {
    const res3 = await request(app)
      .get(`/internal/mirai/v1/users/${targetNonMemberId}/projects/${project.id}/membership`)
      .set('Authorization', `Bearer ${validToken}`);

    console.log(`Status: ${res3.status}`);
    console.log('Response Body:', JSON.stringify(res3.body, null, 2));
    if (res3.status === 200 && res3.body.is_member === false) {
      console.log('✅ PASS: Correctly returned is_member: false for non-member.\n');
    } else {
      console.log('❌ FAIL\n');
    }
  }

  // ── TEST 4: Security Test - Unauthenticated Request ────────────────────────
  console.log('▶ TEST 4: Security Test - Missing Authorization Header');
  const res4 = await request(app).get(`/internal/mirai/v1/users/any-id/project-memberships`);
  console.log(`Status: ${res4.status} (Expected: 401)`);
  console.log('Response Body:', JSON.stringify(res4.body, null, 2));
  if (res4.status === 401) {
    console.log('✅ PASS: Rejected missing authorization with 401 Unauthorized.\n');
  } else {
    console.log('❌ FAIL\n');
  }

  // ── TEST 5: Security Test - Wrong Audience/Issuer ──────────────────────────
  console.log('▶ TEST 5: Security Test - Wrong Audience in Token');
  const invalidAudToken = jwt.sign(
    {
      iss: 'mirai-django',
      aud: 'wrong-audience',
      scope: 'membership:read',
      role: 'SERVICE',
      org: org.id,
    },
    secret,
    { expiresIn: '5m' }
  );
  const res5 = await request(app)
    .get(`/internal/mirai/v1/users/any-id/project-memberships`)
    .set('Authorization', `Bearer ${invalidAudToken}`);
  console.log(`Status: ${res5.status} (Expected: 401)`);
  console.log('Response Body:', JSON.stringify(res5.body, null, 2));
  if (res5.status === 401) {
    console.log('✅ PASS: Rejected invalid audience with 401.\n');
  } else {
    console.log('❌ FAIL\n');
  }

  console.log('======================================================');
  console.log('         ALL MANUAL VERIFICATIONS COMPLETE            ');
  console.log('======================================================\n');
}

main()
  .catch((err) => {
    console.error('Test execution error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
