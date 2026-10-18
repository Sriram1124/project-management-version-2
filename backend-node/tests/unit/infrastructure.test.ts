describe('Infrastructure Modules Unit Tests', () => {
  describe('src/lib/prisma.ts', () => {
    let getEffectiveDatabaseUrl: any;
    let getSanitizedDatabaseInfo: any;

    beforeAll(() => {
      const prismaLib = jest.requireActual('../../src/lib/prisma');
      getEffectiveDatabaseUrl = prismaLib.getEffectiveDatabaseUrl;
      getSanitizedDatabaseInfo = prismaLib.getSanitizedDatabaseInfo;
    });

    it('returns undefined if rawUrl is empty or undefined', () => {
      expect(getEffectiveDatabaseUrl(undefined)).toBeUndefined();
      expect(getEffectiveDatabaseUrl('')).toBeUndefined();
    });

    it('returns rawUrl untouched when URL string is malformed', () => {
      expect(getEffectiveDatabaseUrl('not-a-valid-url')).toBe('not-a-valid-url');
    });

    it('rewrites Supabase Pooler port from 5432 to 6543 and sets pgbouncer=true', () => {
      const url = 'postgresql://postgres.project:pass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres';
      const effective = getEffectiveDatabaseUrl(url);

      expect(effective).toBeDefined();
      const u = new URL(effective!);
      expect(u.port).toBe('6543');
      expect(u.searchParams.get('pgbouncer')).toBe('true');
      expect(u.searchParams.get('connection_limit')).toBe('3');
      expect(u.searchParams.get('pool_timeout')).toBe('30');
    });

    it('respects existing Supabase Pooler transaction port 6543 without overwriting', () => {
      const url = 'postgresql://postgres.project:pass@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';
      const effective = getEffectiveDatabaseUrl(url);

      expect(effective).toBeDefined();
      const u = new URL(effective!);
      expect(u.port).toBe('6543');
      expect(u.searchParams.get('pgbouncer')).toBe('true');
    });

    it('respects custom PRISMA_CONNECTION_LIMIT and PRISMA_POOL_TIMEOUT env vars', () => {
      const origLimit = process.env.PRISMA_CONNECTION_LIMIT;
      const origTimeout = process.env.PRISMA_POOL_TIMEOUT;
      try {
        process.env.PRISMA_CONNECTION_LIMIT = '10';
        process.env.PRISMA_POOL_TIMEOUT = '45';

        const url = 'postgresql://usr:pwd@localhost:5432/mydb';
        const effective = getEffectiveDatabaseUrl(url);

        expect(effective).toBeDefined();
        const u = new URL(effective!);
        expect(u.searchParams.get('connection_limit')).toBe('10');
        expect(u.searchParams.get('pool_timeout')).toBe('45');
      } finally {
        process.env.PRISMA_CONNECTION_LIMIT = origLimit;
        process.env.PRISMA_POOL_TIMEOUT = origTimeout;
      }
    });

    it('getSanitizedDatabaseInfo returns configured: false when DATABASE_URL is not set', () => {
      const origUrl = process.env.DATABASE_URL;
      try {
        delete process.env.DATABASE_URL;
        const info = getSanitizedDatabaseInfo();
        expect(info).toEqual({ configured: false });
      } finally {
        process.env.DATABASE_URL = origUrl;
      }
    });

    it('getSanitizedDatabaseInfo reports transaction mode on Supabase pooler with port 6543', () => {
      const origUrl = process.env.DATABASE_URL;
      try {
        process.env.DATABASE_URL = 'postgresql://user:secret@aws-0.pooler.supabase.com:6543/db?pgbouncer=true';
        const info = getSanitizedDatabaseInfo();
        expect(info.configured).toBe(true);
        expect(info.host).toBe('aws-0.pooler.supabase.com');
        expect(info.port).toBe(6543);
        expect(info.pool_mode).toBe('transaction');
        expect(info.pgbouncer).toBe(true);
      } finally {
        process.env.DATABASE_URL = origUrl;
      }
    });

    it('getSanitizedDatabaseInfo reports direct mode on localhost or standard databases', () => {
      const origUrl = process.env.DATABASE_URL;
      try {
        process.env.DATABASE_URL = 'postgresql://user:secret@127.0.0.1:5432/localdb';
        const info = getSanitizedDatabaseInfo();
        expect(info.configured).toBe(true);
        expect(info.host).toBe('127.0.0.1');
        expect(info.port).toBe(5432);
        expect(info.pool_mode).toBe('direct');
        expect(info.pgbouncer).toBe(false);
      } finally {
        process.env.DATABASE_URL = origUrl;
      }
    });

    it('getSanitizedDatabaseInfo catches malformed database URLs gracefully', () => {
      const origUrl = process.env.DATABASE_URL;
      try {
        process.env.DATABASE_URL = 'invalid-database-string';
        const info = getSanitizedDatabaseInfo();
        expect(info).toEqual({ configured: true, error: 'Invalid URL format' });
      } finally {
        process.env.DATABASE_URL = origUrl;
      }
    });
  });

  describe('src/lib/redis.ts', () => {
    let getRedisConfig: any;
    let getRedisUrl: any;
    let buildRedisOptions: any;
    let closeRedisConnections: any;

    beforeAll(() => {
      const redisLib = jest.requireActual('../../src/lib/redis');
      getRedisConfig = redisLib.getRedisConfig;
      getRedisUrl = redisLib.getRedisUrl;
      buildRedisOptions = redisLib.buildRedisOptions;
      closeRedisConnections = redisLib.closeRedisConnections;
    });

    it('getRedisConfig parses explicit REDIS_URL and masks credentials', () => {
      const origUrl = process.env.REDIS_URL;
      try {
        process.env.REDIS_URL = 'redis://default:my_secret_password@cluster.redis.cache.windows.net:6380';
        const config = getRedisConfig();

        expect(config.isConfigured).toBe(true);
        expect(config.isTls).toBe(false);
        expect(config.maskedUrl).toBe('redis://***@cluster.redis.cache.windows.net:6380');
        expect(config.url).toBe(process.env.REDIS_URL);
      } finally {
        process.env.REDIS_URL = origUrl;
      }
    });

    it('getRedisConfig detects TLS rediss:// protocol', () => {
      const origUrl = process.env.REDIS_URL;
      try {
        process.env.REDIS_URL = 'rediss://usr:secret@upstash.io:6379';
        const config = getRedisConfig();

        expect(config.isConfigured).toBe(true);
        expect(config.isTls).toBe(true);
        expect(config.maskedUrl).toBe('rediss://***@upstash.io:6379');
      } finally {
        process.env.REDIS_URL = origUrl;
      }
    });

    it('getRedisConfig constructs URL from granular REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, and REDIS_TLS', () => {
      const origUrl = process.env.REDIS_URL;
      const origHost = process.env.REDIS_HOST;
      const origPort = process.env.REDIS_PORT;
      const origPass = process.env.REDIS_PASSWORD;
      const origTls = process.env.REDIS_TLS;
      try {
        delete process.env.REDIS_URL;
        process.env.REDIS_HOST = 'redis.internal';
        process.env.REDIS_PORT = '6380';
        process.env.REDIS_PASSWORD = 'mypassword';
        process.env.REDIS_TLS = 'true';

        const config = getRedisConfig();
        expect(config.isConfigured).toBe(true);
        expect(config.isTls).toBe(true);
        expect(config.url).toBe('rediss://default:mypassword@redis.internal:6380');
        expect(config.maskedUrl).toBe('rediss://***@redis.internal:6380');
      } finally {
        process.env.REDIS_URL = origUrl;
        process.env.REDIS_HOST = origHost;
        process.env.REDIS_PORT = origPort;
        process.env.REDIS_PASSWORD = origPass;
        process.env.REDIS_TLS = origTls;
      }
    });

    it('getRedisConfig returns default fallback when no Redis env vars are set', () => {
      const origUrl = process.env.REDIS_URL;
      const origHost = process.env.REDIS_HOST;
      try {
        delete process.env.REDIS_URL;
        delete process.env.REDIS_HOST;

        const config = getRedisConfig();
        expect(config.isConfigured).toBe(false);
        expect(config.url).toBeNull();
        expect(config.isTls).toBe(false);
        expect(config.maskedUrl).toContain('Synchronous Fallback Active');
      } finally {
        process.env.REDIS_URL = origUrl;
        process.env.REDIS_HOST = origHost;
      }
    });

    it('getRedisUrl falls back to 127.0.0.1:6379 when unconfigured', () => {
      const origUrl = process.env.REDIS_URL;
      const origHost = process.env.REDIS_HOST;
      try {
        delete process.env.REDIS_URL;
        delete process.env.REDIS_HOST;

        expect(getRedisUrl()).toBe('redis://127.0.0.1:6379');
      } finally {
        process.env.REDIS_URL = origUrl;
        process.env.REDIS_HOST = origHost;
      }
    });

    it('buildRedisOptions sets expected defaults, timeouts, and retry strategy', () => {
      const options = buildRedisOptions();
      expect(options.lazyConnect).toBe(true);
      expect(options.connectTimeout).toBe(3000);
      expect(options.commandTimeout).toBe(4000);

      // Verify retryStrategy logic:
      expect(typeof options.retryStrategy).toBe('function');
      const retry = options.retryStrategy as (times: number) => number | null;
      expect(retry(1)).toBe(300);
      expect(retry(2)).toBe(600);
      expect(retry(3)).toBe(900);
      expect(retry(4)).toBeNull(); // stops after 3 attempts
    });

    it('buildRedisOptions configures tls rejectUnauthorized when REDIS_TLS_REJECT_UNAUTHORIZED=true', () => {
      const origUrl = process.env.REDIS_URL;
      const origTlsReject = process.env.REDIS_TLS_REJECT_UNAUTHORIZED;
      try {
        process.env.REDIS_URL = 'rediss://localhost:6379';
        process.env.REDIS_TLS_REJECT_UNAUTHORIZED = 'true';

        const options = buildRedisOptions();
        expect(options.tls).toBeDefined();
        expect(options.tls?.rejectUnauthorized).toBe(true);
      } finally {
        process.env.REDIS_URL = origUrl;
        process.env.REDIS_TLS_REJECT_UNAUTHORIZED = origTlsReject;
      }
    });

    it('closeRedisConnections gracefully handles uninitialized connection', async () => {
      await expect(closeRedisConnections()).resolves.toBeUndefined();
    });
  });

  describe('src/queues/notification.queue.ts', () => {
    let enqueueNotificationJob: any;
    let notificationQueue: any;

    beforeAll(() => {
      const queueModule = jest.requireActual('../../src/queues/notification.queue');
      enqueueNotificationJob = queueModule.enqueueNotificationJob;
      notificationQueue = queueModule.notificationQueue;
    });

    it('enqueueNotificationJob throws error when notificationId is missing', async () => {
      await expect(enqueueNotificationJob('')).rejects.toThrow('Notification ID is required to enqueue job');
    });

    it('enqueueNotificationJob throws error when Redis is not configured', async () => {
      const origUrl = process.env.REDIS_URL;
      const origHost = process.env.REDIS_HOST;
      try {
        delete process.env.REDIS_URL;
        delete process.env.REDIS_HOST;

        await expect(enqueueNotificationJob('notif-123')).rejects.toThrow(
          'Redis queue is not configured (REDIS_URL not set)'
        );
      } finally {
        process.env.REDIS_URL = origUrl;
        process.env.REDIS_HOST = origHost;
      }
    });

    it('notificationQueue.isConfigured reflects Redis configuration state', () => {
      const redisMock = require('../../src/lib/redis');
      redisMock.getRedisConfig.mockReturnValueOnce({ isConfigured: false });
      expect(notificationQueue.isConfigured).toBe(false);

      redisMock.getRedisConfig.mockReturnValueOnce({ isConfigured: true });
      expect(notificationQueue.isConfigured).toBe(true);
    });
  });
});
