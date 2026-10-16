import { Worker, Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import { createNewRedisConnection, getRedisConfig } from '../lib/redis';
import { NOTIFICATION_QUEUE_NAME, NotificationJobData } from '../queues/notification.queue';

const redisConfig = getRedisConfig();
console.log(`[Worker] Initializing BullMQ Notification Worker with broker: ${redisConfig.maskedUrl}...`);

if (!redisConfig.isConfigured) {
  console.warn('[Worker] Warning: REDIS_URL not configured. Notification worker requires a Redis broker to process background jobs.');
}

export const notificationWorker = new Worker<NotificationJobData>(
  NOTIFICATION_QUEUE_NAME,
  async (job: Job<NotificationJobData>) => {
    const { notification_id } = job.data;
    console.log(`[Worker] Received job ${job.id} for notification ${notification_id} (attempt ${job.attemptsMade + 1}/${job.opts.attempts || 3})`);

    if (!notification_id) {
      throw new Error('Invalid job payload: notification_id is missing');
    }

    // 1. Fetch notification and recipient records from database
    const notification = await prisma.notification.findUnique({
      where: { id: notification_id },
      include: {
        recipients: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                user_code: true,
                is_active: true,
              },
            },
          },
        },
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!notification) {
      console.warn(`[Worker] Notification ${notification_id} not found in database. Job will not be retried.`);
      return { status: 'skipped', reason: 'Notification record not found' };
    }

    const recipientCount = notification.recipients.length;
    console.log(`[Worker] Processing notification "${notification.title}" (ID: ${notification.id}) from sender ${notification.sender?.name} to ${recipientCount} recipients`);

    // 2. Deliver notification to all designated recipients in organization
    const recipients = notification.recipients;

    // Confirm delivery in PostgreSQL
    if (recipients.length > 0) {
      await prisma.notificationRecipient.updateMany({
        where: {
          id: { in: recipients.map((r) => r.id) },
        },
        data: {
          delivered: true,
        },
      });
    }

    console.log(`[Worker] Successfully dispatched in-app notification to ${recipients.length} recipients`);

    return {
      status: 'success',
      notification_id: notification.id,
      recipients_delivered: recipients.length,
      timestamp: new Date().toISOString(),
    };
  },
  {
    connection: createNewRedisConnection(), // Dedicated connection for worker
    concurrency: 5,
  }
);

notificationWorker.on('completed', (job: Job) => {
  console.log(`[Worker] Job ${job.id} completed successfully`);
});

notificationWorker.on('failed', (job: Job | undefined, err: Error) => {
  console.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
});

notificationWorker.on('error', (err: Error) => {
  console.error('[Worker] Worker encountered error:', err.message);
});

// Graceful shutdown handling
let isShuttingDown = false;
async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[Worker] Received ${signal}. Closing notification worker gracefully...`);

  try {
    await notificationWorker.close();
    await prisma.$disconnect();
    console.log('[Worker] Notification worker shut down cleanly.');
    process.exit(0);
  } catch (err: any) {
    console.error('[Worker] Error during shutdown:', err.message);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

console.log('[Worker] Notification Worker is listening for jobs on queue:', NOTIFICATION_QUEUE_NAME);
