import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import Redis from 'ioredis';

const prisma = new PrismaClient();
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3001/api';
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';

async function main() {
  console.log('================================================================');
  console.log('BULLMQ + REDIS BACKGROUND NOTIFICATION SYSTEM VERIFICATION');
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

  // Helper login function
  async function login(email: string, password = 'password123', organization_id?: string | null) {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, organization_id }),
    });
    const json: any = await res.json();
    return { status: res.status, json, token: json.accessToken };
  }

  try {
    // -------------------------------------------------------------
    // 1. Redis Connectivity Verification
    // -------------------------------------------------------------
    console.log('--- 1. Redis Broker Health Check ---');
    const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
    await redis.connect();
    const pingResponse = await redis.ping();
    assert(pingResponse === 'PONG', `Redis responded with PONG (${REDIS_URL})`);
    await redis.quit();

    // -------------------------------------------------------------
    // 2. Setup Organizations & Users
    // -------------------------------------------------------------
    console.log('\n--- 2. Setting Up Multi-Tenant Data ---');
    // Ensure Org A (Primary)
    let orgA = await prisma.organization.findFirst({
      where: { name: 'Acme Test Corp' }
    });
    if (!orgA) {
      orgA = await prisma.organization.create({
        data: { name: 'Acme Test Corp' }
      });
    }

    // Ensure Org B (Secondary - For isolation testing)
    let orgB = await prisma.organization.findFirst({
      where: { name: 'Globex Test Corp' }
    });
    if (!orgB) {
      orgB = await prisma.organization.create({
        data: { name: 'Globex Test Corp' }
      });
    }

    // Roles
    const managerRole = await prisma.role.findFirst({ where: { name: 'MANAGER' } });
    const internRole = await prisma.role.findFirst({ where: { name: 'INTERN' } });
    const superAdminRole = await prisma.role.findFirst({ where: { name: 'SUPER_ADMIN' } });

    // Org A Manager
    const managerEmail = 'manager.notif@acme.com';
    let managerUser = await prisma.user.findFirst({ where: { email: managerEmail } });
    if (!managerUser) {
      managerUser = await prisma.user.create({
        data: {
          email: managerEmail,
          name: 'Acme Manager',
          password_hash: await argon2.hash('password123'),
          organization_id: orgA.id,
          user_code: 'MGR-NTF1',
          is_active: true,
          must_change_password: false,
          roles: managerRole ? { create: { role_id: managerRole.id } } : undefined,
        }
      });
    }

    // Org A Intern 1
    const intern1Email = 'intern1.notif@acme.com';
    let intern1User = await prisma.user.findFirst({ where: { email: intern1Email } });
    if (!intern1User) {
      intern1User = await prisma.user.create({
        data: {
          email: intern1Email,
          name: 'Alice Intern',
          password_hash: await argon2.hash('password123'),
          organization_id: orgA.id,
          user_code: 'INT-NTF1',
          is_active: true,
          must_change_password: false,
          roles: internRole ? { create: { role_id: internRole.id } } : undefined,
        }
      });
    }

    // Org A Intern 2
    const intern2Email = 'intern2.notif@acme.com';
    let intern2User = await prisma.user.findFirst({ where: { email: intern2Email } });
    if (!intern2User) {
      intern2User = await prisma.user.create({
        data: {
          email: intern2Email,
          name: 'Bob Intern',
          password_hash: await argon2.hash('password123'),
          organization_id: orgA.id,
          user_code: 'INT-NTF2',
          is_active: true,
          must_change_password: false,
          roles: internRole ? { create: { role_id: internRole.id } } : undefined,
        }
      });
    }

    // Org B Intern
    const orgBInternEmail = 'charlie.notif@globex.com';
    let orgBInternUser = await prisma.user.findFirst({ where: { email: orgBInternEmail } });
    if (!orgBInternUser) {
      orgBInternUser = await prisma.user.create({
        data: {
          email: orgBInternEmail,
          name: 'Charlie Globex',
          password_hash: await argon2.hash('password123'),
          organization_id: orgB.id,
          user_code: 'INT-GLBX1',
          is_active: true,
          must_change_password: false,
          roles: internRole ? { create: { role_id: internRole.id } } : undefined,
        }
      });
    }

    // Super Admin User (Global)
    const superAdminEmail = 'superadmin.notif@platform.local';
    let superAdminUser = await prisma.user.findFirst({ where: { email: superAdminEmail } });
    if (!superAdminUser) {
      superAdminUser = await prisma.user.create({
        data: {
          email: superAdminEmail,
          name: 'Platform Super Admin',
          password_hash: await argon2.hash('password123'),
          organization_id: null,
          user_code: 'SA-001',
          is_active: true,
          must_change_password: false,
          roles: superAdminRole ? { create: { role_id: superAdminRole.id } } : undefined,
        }
      });
    }

    assert(Boolean(managerUser && intern1User && intern2User && orgBInternUser && superAdminUser), 'All required test identities initialized');

    // -------------------------------------------------------------
    // 3. Authenticate Manager
    // -------------------------------------------------------------
    console.log('\n--- 3. Manager Authentication ---');
    const mgrLogin = await login(managerEmail, 'password123', orgA.id);
    assert(mgrLogin.status === 200 && Boolean(mgrLogin.token), 'Manager logged in successfully and acquired JWT');
    const managerToken = mgrLogin.token;

    // -------------------------------------------------------------
    // 4. Validation: Rejection of Empty/Invalid Inputs
    // -------------------------------------------------------------
    console.log('\n--- 4. Payload Validation Enforcement ---');
    const resEmptyTitle = await fetch(`${BASE_URL}/notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        title: '',
        message: 'Valid message content',
        recipient_ids: [intern1User.id],
      }),
    });
    assert(resEmptyTitle.status === 400, 'POST /notifications with empty title rejected (HTTP 400)');

    const resEmptyRecipients = await fetch(`${BASE_URL}/notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        title: 'Title',
        message: 'Message',
        recipient_ids: [],
      }),
    });
    assert(resEmptyRecipients.status === 400, 'POST /notifications with empty recipients rejected (HTTP 400)');

    // -------------------------------------------------------------
    // 5. Tenant Security: Disallow Cross-Org Notification
    // -------------------------------------------------------------
    console.log('\n--- 5. Multi-Tenant Boundary Enforcement ---');
    const resCrossOrg = await fetch(`${BASE_URL}/notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        title: 'Cross-Tenant Exploit Attempt',
        message: 'This should be blocked by multi-tenant boundary checks',
        recipient_ids: [orgBInternUser.id],
      }),
    });
    assert(resCrossOrg.status === 403, 'POST /notifications targeting other organization rejected (HTTP 403 Forbidden)');

    // -------------------------------------------------------------
    // 6. Security: Disallow Targeting Super Admin
    // -------------------------------------------------------------
    console.log('\n--- 6. Super Admin Protection Enforcement ---');
    const resSuperAdminTarget = await fetch(`${BASE_URL}/notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        title: 'Targeting Super Admin',
        message: 'Manager cannot spam global super admins',
        recipient_ids: [superAdminUser.id],
      }),
    });
    assert(resSuperAdminTarget.status === 400 || resSuperAdminTarget.status === 403, 'POST /notifications targeting SUPER_ADMIN rejected (HTTP 400/403)');

    // -------------------------------------------------------------
    // 7. Successful Broadcast Creation & BullMQ Enqueue
    // -------------------------------------------------------------
    console.log('\n--- 7. Broadcast Dispatch & BullMQ Queueing ---');
    const broadcastTitle = `Sprint Sync Notice ${Date.now()}`;
    const broadcastMessage = 'All interns please review your backlog and submit daily status forms by 5 PM.';

    const broadcastRes = await fetch(`${BASE_URL}/notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        title: broadcastTitle,
        message: broadcastMessage,
        recipient_ids: [intern1User.id, intern2User.id],
      }),
    });

    const broadcastJson: any = await broadcastRes.json();
    assert(broadcastRes.status === 201, 'POST /notifications returns HTTP 201 Created');
    const notifObj = broadcastJson.notification || broadcastJson.data;
    assert(Boolean(notifObj && notifObj.recipient_count === 2), 'Response includes created notification with recipient_count = 2');
    const createdNotifId = notifObj?.id;

    // -------------------------------------------------------------
    // 8. BullMQ Worker Processing & PostgreSQL Verification
    // -------------------------------------------------------------
    console.log('\n--- 8. BullMQ Worker Processing & Database Integrity ---');
    console.log('   Waiting 2000ms for BullMQ background worker to process notification job...');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const dbNotif = await prisma.notification.findUnique({
      where: { id: createdNotifId },
      include: { recipients: true },
    });

    assert(Boolean(dbNotif), 'Notification persisted in PostgreSQL');
    assert(dbNotif?.recipients.length === 2, '2 NotificationRecipient records found in PostgreSQL');
    
    const allDelivered = dbNotif?.recipients.every((r) => r.delivered === true);
    assert(Boolean(allDelivered), 'BullMQ Worker successfully marked all recipients delivered: true');

    // -------------------------------------------------------------
    // 9. Recipient 1 Inbox & Unread Count Verification
    // -------------------------------------------------------------
    console.log('\n--- 9. Recipient Retrieval & Unread Counts ---');
    const intern1Login = await login(intern1Email, 'password123', orgA.id);
    assert(intern1Login.status === 200, 'Intern 1 logged in successfully');
    const intern1Token = intern1Login.token;

    const listRes = await fetch(`${BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${intern1Token}` },
    });
    const listJson: any = await listRes.json();
    assert(listRes.status === 200, 'GET /notifications returned HTTP 200');
    
    const notifList = listJson.notifications || listJson.data || [];
    const foundNotif = notifList.find((n: any) => n.id === createdNotifId);
    assert(Boolean(foundNotif), 'Broadcast alert found in Intern 1 notification inbox');
    assert(foundNotif?.is_read === false, 'Notification initially unread (is_read: false)');
    assert(foundNotif?.sender?.name === managerUser.name, 'Notification sender details correctly populated');

    const unreadRes1 = await fetch(`${BASE_URL}/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${intern1Token}` },
    });
    const unreadJson1: any = await unreadRes1.json();
    const unreadCount1 = unreadJson1.unread_count ?? unreadJson1.data?.unread_count ?? 0;
    assert(unreadRes1.status === 200 && unreadCount1 >= 1, `GET /notifications/unread-count reflects unread notifications (${unreadCount1})`);

    // -------------------------------------------------------------
    // 10. Mark Single Notification as Read
    // -------------------------------------------------------------
    console.log('\n--- 10. Mark Notification As Read ---');
    const markReadRes = await fetch(`${BASE_URL}/notifications/${createdNotifId}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${intern1Token}` },
    });
    const markReadJson: any = await markReadRes.json();
    assert(markReadRes.status === 200 && (markReadJson.is_read === true || markReadJson.data?.is_read === true), 'PATCH /notifications/:id/read returned HTTP 200 with is_read: true');

    const unreadRes2 = await fetch(`${BASE_URL}/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${intern1Token}` },
    });
    const unreadJson2: any = await unreadRes2.json();
    const unreadCount2 = unreadJson2.unread_count ?? unreadJson2.data?.unread_count ?? 0;
    assert(unreadCount2 === unreadCount1 - 1, 'Unread count properly decremented after marking as read');

    // -------------------------------------------------------------
    // 11. Recipient Isolation: Recipient 2 Still Unread
    // -------------------------------------------------------------
    console.log('\n--- 11. Per-Recipient Read State Isolation ---');
    const intern2Login = await login(intern2Email, 'password123', orgA.id);
    const intern2Token = intern2Login.token;

    const listRes2 = await fetch(`${BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${intern2Token}` },
    });
    const listJson2: any = await listRes2.json();
    const notifList2 = listJson2.notifications || listJson2.data || [];
    const foundNotif2 = notifList2.find((n: any) => n.id === createdNotifId);
    assert(foundNotif2?.is_read === false, 'Recipient 2 still has is_read: false (independent recipient read state)');

    // -------------------------------------------------------------
    // 12. Mark All As Read
    // -------------------------------------------------------------
    console.log('\n--- 12. Mark All Notifications As Read ---');
    // Send a 2nd notification to Intern 1
    await fetch(`${BASE_URL}/notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        title: 'Second Alert',
        message: 'Second notification for bulk read test',
        recipient_ids: [intern1User.id],
      }),
    });
    await new Promise((r) => setTimeout(r, 1000));

    const markAllRes = await fetch(`${BASE_URL}/notifications/read-all`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${intern1Token}` },
    });
    assert(markAllRes.status === 200, 'PATCH /notifications/read-all returned HTTP 200');

    const unreadRes3 = await fetch(`${BASE_URL}/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${intern1Token}` },
    });
    const unreadJson3: any = await unreadRes3.json();
    const unreadCount3 = unreadJson3.unread_count ?? unreadJson3.data?.unread_count ?? 0;
    assert(unreadCount3 === 0, 'Unread count is 0 after markAllAsRead');

    // -------------------------------------------------------------
    // 13. Tenant Data Privacy: Org B Intern Cannot See Org A Notifications
    // -------------------------------------------------------------
    console.log('\n--- 13. Tenant Data Privacy & Visibility Check ---');
    const globexLogin = await login(orgBInternEmail, 'password123', orgB.id);
    const globexToken = globexLogin.token;

    const globexInboxRes = await fetch(`${BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${globexToken}` },
    });
    const globexInboxJson: any = await globexInboxRes.json();
    const globexList = globexInboxJson.notifications || globexInboxJson.data || [];
    const leakedNotif = globexList.find((n: any) => n.organization_id === orgA.id);
    assert(!leakedNotif, 'Globex intern has zero access to Acme notifications (0 leakage across tenants)');

    // Summary
    console.log('\n================================================================');
    console.log(`TOTAL CHECKS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log('================================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Unexpected error in verification suite:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Unhandled error in verify-notifications:', err);
  process.exit(1);
});
