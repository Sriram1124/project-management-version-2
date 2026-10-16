import IORedis, { RedisOptions } from 'ioredis';

let queueConnection: IORedis | null = null;
let connectionWarned = false;
let lastOfflineLogTime = 0;

export interface RedisConfig {
  url: string | null;
  isConfigured: boolean;
  isTls: boolean;
  maskedUrl: string;
}

/**
 * Returns current Redis configuration from environment variables.
 * Never leaks password or credentials in maskedUrl.
 */
export function getRedisConfig(): RedisConfig {
  const rawUrl = process.env.REDIS_URL?.trim();

  // If REDIS_URL is explicitly set (e.g. redis://... or rediss://...)
  if (rawUrl) {
    const isTls = rawUrl.startsWith('rediss://');
    const maskedUrl = rawUrl.replace(/:\/\/[^@]*@/, '://***@');
    return {
      url: rawUrl,
      isConfigured: true,
      isTls,
      maskedUrl,
    };
  }

  // If granular REDIS_HOST / REDIS_PORT are provided
  if (process.env.REDIS_HOST) {
    const host = process.env.REDIS_HOST.trim();
    const port = Number(process.env.REDIS_PORT) || 6379;
    const isTls = process.env.REDIS_TLS === 'true';
    const protocol = isTls ? 'rediss' : 'redis';
    const authPart = process.env.REDIS_PASSWORD
      ? `${process.env.REDIS_USERNAME || 'default'}:${process.env.REDIS_PASSWORD}@`
      : '';
    const constructedUrl = `${protocol}://${authPart}${host}:${port}`;
    const maskedUrl = `${protocol}://${authPart ? '***@' : ''}${host}:${port}`;

    return {
      url: constructedUrl,
      isConfigured: true,
      isTls,
      maskedUrl,
    };
  }

  // Default when REDIS_URL is not configured
  return {
    url: null,
    isConfigured: false,
    isTls: false,
    maskedUrl: 'None (Synchronous Fallback Active)',
  };
}

/**
 * Backward-compatible helper returning active URL or default localhost
 */
export function getRedisUrl(): string {
  const config = getRedisConfig();
  return config.url || 'redis://127.0.0.1:6379';
}

/**
 * Build standard ioredis options with robust timeouts, limited retries, and TLS handling.
 */
export function buildRedisOptions(customOptions?: Partial<RedisOptions>): RedisOptions {
  const config = getRedisConfig();

  const options: RedisOptions = {
    lazyConnect: true,
    maxRetriesPerRequest: 1, // Fail fast on detached commands instead of buffering indefinitely
    connectTimeout: 3000,    // 3-second connect timeout
    commandTimeout: 4000,    // 4-second command timeout
    enableReadyCheck: true,
    retryStrategy(times) {
      // Finite retry: stop retrying after 3 attempts to prevent infinite ECONNREFUSED loops
      if (times > 3) {
        return null;
      }
      return Math.min(times * 300, 1500);
    },
    ...customOptions,
  };

  if (config.isTls) {
    options.tls = {
      rejectUnauthorized: process.env.REDIS_TLS_REJECT_UNAUTHORIZED === 'true',
    };
  }

  return options;
}

/**
 * Get shared connection for BullMQ Queues.
 */
export function getRedisConnection(): IORedis {
  const config = getRedisConfig();

  if (!queueConnection) {
    const url = config.url || 'redis://127.0.0.1:6379';
    const opts = buildRedisOptions({
      maxRetriesPerRequest: null, // BullMQ queue compatibility
    });

    queueConnection = new IORedis(url, opts);

    // Suppress unhandled error crashes & throttle warning logs
    queueConnection.on('error', (err: any) => {
      const now = Date.now();
      // Log at most once every 60 seconds to prevent terminal spam
      if (!connectionWarned || now - lastOfflineLogTime > 60000) {
        console.warn(`[Redis] Offline (${config.maskedUrl}). Error: ${err.message}. Background queuing paused; fallback active.`);
        connectionWarned = true;
        lastOfflineLogTime = now;
      }
    });

    queueConnection.on('connect', () => {
      console.log(`[Redis] Connected successfully to ${config.maskedUrl}`);
      connectionWarned = false;
    });
  }

  return queueConnection;
}

/**
 * Create a dedicated, unshared connection (e.g. for BullMQ Worker).
 * BullMQ Workers require their own connection because they execute blocking Redis commands.
 */
export function createNewRedisConnection(): IORedis {
  const config = getRedisConfig();
  const url = config.url || 'redis://127.0.0.1:6379';
  const opts = buildRedisOptions({
    maxRetriesPerRequest: null, // BullMQ worker requires maxRetriesPerRequest: null
  });

  const conn = new IORedis(url, opts);
  conn.on('error', () => {
    // Handled by worker error listeners
  });
  return conn;
}

/**
 * Diagnostic ping check to verify if Redis is currently reachable.
 * Never throws unhandled exceptions.
 */
export async function testRedisConnection(customUrl?: string): Promise<{
  connected: boolean;
  latencyMs?: number;
  error?: string;
  url: string;
}> {
  const config = getRedisConfig();
  const targetUrl = customUrl || config.url;

  if (!targetUrl) {
    return {
      connected: false,
      error: 'REDIS_URL is not configured in environment',
      url: 'None',
    };
  }

  const masked = targetUrl.replace(/:\/\/[^@]*@/, '://***@');
  const isTls = targetUrl.startsWith('rediss://');

  const testClient = new IORedis(targetUrl, {
    lazyConnect: true,
    connectTimeout: 2000,
    commandTimeout: 2000,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null, // Do not retry on test health check
    tls: isTls ? { rejectUnauthorized: process.env.REDIS_TLS_REJECT_UNAUTHORIZED === 'true' } : undefined,
  });

  testClient.on('error', () => {}); // Swallow error events during health test

  const start = Date.now();
  try {
    await testClient.connect();
    const res = await testClient.ping();
    const latencyMs = Date.now() - start;
    await testClient.quit().catch(() => testClient.disconnect());

    if (res === 'PONG') {
      return { connected: true, latencyMs, url: masked };
    }
    return { connected: false, error: `Unexpected PING response: ${res}`, url: masked };
  } catch (err: any) {
    testClient.disconnect();
    return { connected: false, error: err.message || 'Connection failed', url: masked };
  }
}

let cachedAvailability: { available: boolean; timestamp: number } | null = null;

/**
 * Fast cached check to see if Redis is ready to accept commands.
 * Caches result for 4 seconds to avoid pinging on every request.
 */
export async function isRedisAvailable(): Promise<boolean> {
  const config = getRedisConfig();
  if (!config.isConfigured || !config.url) {
    return false;
  }

  const now = Date.now();
  if (cachedAvailability && now - cachedAvailability.timestamp < 4000) {
    return cachedAvailability.available;
  }

  const result = await testRedisConnection();
  cachedAvailability = { available: result.connected, timestamp: now };
  return result.connected;
}

/**
 * Graceful cleanup of open Redis connections on process shutdown
 */
export async function closeRedisConnections(): Promise<void> {
  if (queueConnection) {
    try {
      await queueConnection.quit();
    } catch {
      queueConnection.disconnect();
    }
    queueConnection = null;
  }
}
