import * as dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { prisma } from './lib/prisma';
import { closeRedisConnections, getRedisConfig } from './lib/redis';
import { TimesheetService } from './services/timesheet.service';

const PORT = Number(process.env.PORT) || 3001;
const HOST = '0.0.0.0';

let autoClockTimer: NodeJS.Timeout | null = null;

async function start() {
  try {
    await prisma.$connect();
    console.log('Connected to database.');

    const redisConfig = getRedisConfig();
    console.log(`[Redis] Broker Status: ${redisConfig.maskedUrl}`);

    // Server-side automatic clock-out at 6:15 PM IST worker
    const runAutoClock = async () => {
      try {
        const count = await TimesheetService.autoClockExpiredSessions();
        if (count > 0) {
          console.log(`[AutoClock] Automatically clocked out ${count} session(s) at 6:15 PM IST cutoff.`);
        }
      } catch (err) {
        console.error('[AutoClock] Background check failed:', err);
      }
    };

    // Run immediately on server boot to catch any sessions that passed cutoff during downtime
    await runAutoClock();

    // Check every 30 seconds
    autoClockTimer = setInterval(runAutoClock, 30 * 1000);
    
    const server = app.listen(PORT, HOST, () => {
      console.log(`Server is running on http://${HOST}:${PORT}`);
    });

    const shutdown = async (signal: string) => {
      console.log(`\nReceived ${signal}. Gracefully shutting down...`);
      if (autoClockTimer) clearInterval(autoClockTimer);
      server.close(async () => {
        await closeRedisConnections();
        await prisma.$disconnect();
        console.log('Server and connections closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
