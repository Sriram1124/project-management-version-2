import { Queue } from 'bullmq';
import { getRedisConnection, isRedisAvailable, getRedisConfig } from '../lib/redis';

export const NOTIFICATION_QUEUE_NAME = 'notification-queue';

export interface NotificationJobData {
  notification_id: string;
}

let queueInstance: Queue<NotificationJobData> | null = null;

export function getNotificationQueue(): Queue<NotificationJobData> {
  if (!queueInstance) {
    queueInstance = new Queue<NotificationJobData>(NOTIFICATION_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: {
          age: 3600, // Keep completed jobs for 1 hour for monitoring
          count: 1000,
        },
        removeOnFail: {
          age: 86400, // Keep failed jobs for 24 hours for inspection
          count: 500,
        },
      },
    });

    // Suppress unhandled queue error events when broker is temporarily offline
    queueInstance.on('error', () => {});
  }

  return queueInstance;
}

/**
 * Backward-compatible queue proxy
 */
export const notificationQueue = {
  add: async (name: string, data: NotificationJobData, opts?: any) => {
    const q = getNotificationQueue();
    return q.add(name, data, opts);
  },
  get isConfigured() {
    return getRedisConfig().isConfigured;
  },
};

/**
 * Enqueue notification processing job to BullMQ.
 * Validates broker availability and throws an explicit error if Redis is offline.
 */
export async function enqueueNotificationJob(notificationId: string) {
  if (!notificationId) {
    throw new Error('Notification ID is required to enqueue job');
  }

  const config = getRedisConfig();
  if (!config.isConfigured) {
    throw new Error('Redis queue is not configured (REDIS_URL not set)');
  }

  const available = await isRedisAvailable();
  if (!available) {
    throw new Error(`Redis broker (${config.maskedUrl}) is currently offline`);
  }

  const q = getNotificationQueue();
  const job = await q.add(
    'process-notification',
    { notification_id: notificationId },
    {
      jobId: `notif-${notificationId}`,
    }
  );

  console.log(`[Queue] Enqueued notification job ${job.id} for notification ${notificationId}`);
  return job;
}
