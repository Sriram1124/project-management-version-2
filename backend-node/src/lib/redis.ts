import IORedis from 'ioredis';

let redisInstance: IORedis | null = null;

export function getRedisUrl(): string {
  return process.env.REDIS_URL || 'redis://127.0.0.1:6379';
}

let redisWarned = false;

export function getRedisConnection(): IORedis {
  if (!redisInstance) {
    const url = getRedisUrl();
    redisInstance = new IORedis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 3) return 10000;
        return Math.min(times * 200, 2000);
      },
    });

    redisInstance.on('error', (err) => {
      if (!redisWarned) {
        console.warn(`[Redis] Offline (${url}). Background queuing paused until Redis is available.`);
        redisWarned = true;
      }
    });

    redisInstance.on('connect', () => {
      console.log('[Redis] Connected successfully to', url.replace(/:\/\/[^@]*@/, '://***@'));
      redisWarned = false;
    });
  }

  return redisInstance;
}

export function createNewRedisConnection(): IORedis {
  const url = getRedisUrl();
  const conn = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 3) return 10000;
      return Math.min(times * 200, 2000);
    },
  });
  conn.on('error', () => {});
  return conn;
}
