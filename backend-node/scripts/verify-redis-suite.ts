import { getRedisConfig, testRedisConnection, isRedisAvailable, buildRedisOptions, getRedisConnection, createNewRedisConnection } from '../src/lib/redis';
import { enqueueNotificationJob, NOTIFICATION_QUEUE_NAME } from '../src/queues/notification.queue';
import { NotificationService } from '../src/services/notification.service';
import { prisma } from '../src/lib/prisma';
import app from '../src/app';
import http from 'http';

async function runRedisSuite() {
  console.log('================================================================');
  console.log('         RUNNING REDIS & BULLMQ ARCHITECTURE VERIFICATION        ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testNum: number, title: string, details?: string) {
    if (condition) {
      console.log(`[PASS] Test ${testNum}: ${title}`);
      passed++;
    } else {
      console.error(`[FAIL] Test ${testNum}: ${title}`);
      if (details) console.error(`       Details: ${details}`);
      failedCount++;
    }
  }

  let failedCount = 0;

  // ---------------------------------------------------------------------------
  // TEST 1: Environment-Based Configuration & Credential Masking
  // ---------------------------------------------------------------------------
  try {
    const originalEnv = process.env.REDIS_URL;
    process.env.REDIS_URL = 'rediss://admin:super_secret_password_123@my-redis-provider.cloud:6380';
    const tlsConfig = getRedisConfig();
    const maskedSafe = !tlsConfig.maskedUrl.includes('super_secret_password_123');
    const isTlsDetected = tlsConfig.isTls;
    const isConfigured = tlsConfig.isConfigured;

    // Restore env
    if (originalEnv) {
      process.env.REDIS_URL = originalEnv;
    } else {
      delete process.env.REDIS_URL;
    }

    assert(
      maskedSafe && isTlsDetected && isConfigured,
      1,
      'Environment configuration parses rediss:// URLs, detects TLS, and masks credentials in logs'
    );
  } catch (err: any) {
    assert(false, 1, 'Environment configuration parses rediss:// URLs', err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Graceful Behavior when REDIS_URL is Unset
  // ---------------------------------------------------------------------------
  try {
    const originalEnv = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    delete process.env.REDIS_HOST;

    const unconfigured = getRedisConfig();
    const options = buildRedisOptions();

    if (originalEnv) process.env.REDIS_URL = originalEnv;

    assert(
      !unconfigured.isConfigured && unconfigured.url === null && options.connectTimeout === 3000,
      2,
      'Unset REDIS_URL cleanly marks broker unconfigured with finite timeouts and without hardcoding localhost'
    );
  } catch (err: any) {
    assert(false, 2, 'Graceful behavior when REDIS_URL is unset', err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Finite Reconnection Strategy (No Infinite ECONNREFUSED Loop)
  // ---------------------------------------------------------------------------
  try {
    const options = buildRedisOptions();
    if (typeof options.retryStrategy === 'function') {
      const retry1 = options.retryStrategy(1);
      const retry2 = options.retryStrategy(2);
      const retry3 = options.retryStrategy(3);
      const retry4 = options.retryStrategy(4); // Attempt > 3 MUST return null to stop retrying

      assert(
        typeof retry1 === 'number' && typeof retry3 === 'number' && retry4 === null,
        3,
        'Retry strategy terminates after 3 attempts (returns null) preventing infinite reconnect loops'
      );
    } else {
      assert(false, 3, 'Retry strategy is not defined on redis options');
    }
  } catch (err: any) {
    assert(false, 3, 'Finite reconnection strategy', err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Non-Blocking Diagnostic Health Check against Offline Broker
  // ---------------------------------------------------------------------------
  try {
    const testResult = await testRedisConnection('redis://127.0.0.1:6399'); // Unreachable test port
    assert(
      !testResult.connected && Boolean(testResult.error) && !testResult.error?.includes('Unhandled'),
      4,
      'Diagnostic test connection safely catches offline broker without throwing unhandled exceptions'
    );
  } catch (err: any) {
    assert(false, 4, 'Non-blocking diagnostic health check', err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Connection Separation (Queue vs Worker)
  // ---------------------------------------------------------------------------
  try {
    const queueConn = getRedisConnection();
    const workerConn = createNewRedisConnection();
    // BullMQ requires separate connection instances for workers to avoid blocking command collision
    assert(
      queueConn !== workerConn,
      5,
      'Queue and Worker utilize distinct IORedis connection instances (BullMQ best-practice)'
    );
  } catch (err: any) {
    assert(false, 5, 'Connection separation', err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Enqueue Rejection when Redis is Offline (No Fake Success)
  // ---------------------------------------------------------------------------
  try {
    let threwExpected = false;
    try {
      await enqueueNotificationJob('dummy-test-notif-id');
    } catch (err: any) {
      threwExpected = err.message.includes('offline') || err.message.includes('not configured');
    }
    assert(
      threwExpected,
      6,
      'enqueueNotificationJob rejects with an explicit error when broker is offline instead of pretending success'
    );
  } catch (err: any) {
    assert(false, 6, 'Enqueue rejection when Redis is offline', err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Notification Service Synchronous Fallback & Accurate Delivery Status
  // ---------------------------------------------------------------------------
  let testUser: any = null;
  let testOrg: any = null;
  try {
    testOrg = await prisma.organization.findFirst({ where: { is_active: true } });
    if (!testOrg) {
      testOrg = await prisma.organization.create({ data: { name: 'Redis Test Org' } });
    }

    testUser = await prisma.user.findFirst({ where: { organization_id: testOrg.id } });
    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          email: 'redis-test-user@test.com',
          name: 'Redis Test User',
          password_hash: 'dummy',
          organization_id: testOrg.id,
        },
      });
    }

    const notifResult = await NotificationService.createNotification({
      organizationId: testOrg.id,
      senderId: testUser.id,
      title: 'Redis Fallback Verification Alert',
      message: 'Verifying synchronous database delivery when Redis is offline.',
      recipientIds: [testUser.id],
    });

    // Check PostgreSQL delivery confirmation
    const recipientRecord = await prisma.notificationRecipient.findFirst({
      where: {
        notification_id: notifResult.notification.id,
        user_id: testUser.id,
      },
    });

    // Accurately reports queued: false, delivery_mode: 'direct_dispatch', delivered: true in DB
    const truthfulStatus = notifResult.queued === false && notifResult.delivery_mode === 'direct_dispatch';
    const deliveredInDb = recipientRecord?.delivered === true;

    // Clean up created notification
    await prisma.notificationRecipient.deleteMany({
      where: { notification_id: notifResult.notification.id },
    });
    await prisma.notification.delete({
      where: { id: notifResult.notification.id },
    });

    assert(
      truthfulStatus && deliveredInDb,
      7,
      'When Redis is offline, notification falls back to direct synchronous database dispatch with truthful API response'
    );
  } catch (err: any) {
    assert(false, 7, 'Notification Service synchronous fallback', err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 8: /api/health Diagnostic Endpoint Verification
  // ---------------------------------------------------------------------------
  try {
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    const data: any = await res.json();
    server.close();

    const hasStatus = data.status === 'ok' || data.status === 'degraded';
    const hasDatabase = data.database === 'connected';
    const hasRedis = Boolean(data.redis && typeof data.redis.mode === 'string');

    assert(
      hasStatus && hasDatabase && hasRedis,
      8,
      '/api/health diagnostic endpoint accurately reports database status, Redis broker status, and delivery mode'
    );
  } catch (err: any) {
    assert(false, 8, '/api/health diagnostic endpoint', err.message);
  }

  console.log('\n================================================================');
  console.log(`TOTAL TESTS: ${passed + failedCount} | PASSED: ${passed} | FAILED: ${failedCount}`);
  console.log('================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runRedisSuite().catch((err) => {
  console.error('Fatal error during test execution:', err);
  process.exit(1);
});

