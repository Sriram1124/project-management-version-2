import * as dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { prisma } from './lib/prisma';
import { closeRedisConnections, getRedisConfig } from './lib/redis';

const PORT = Number(process.env.PORT) || 3001;
const HOST = '0.0.0.0';

async function start() {
  try {
    await prisma.$connect();
    console.log('Connected to database.');

    const redisConfig = getRedisConfig();
    console.log(`[Redis] Broker Status: ${redisConfig.maskedUrl}`);
    
    const server = app.listen(PORT, HOST, () => {
      console.log(`Server is running on http://${HOST}:${PORT}`);
    });

    const shutdown = async (signal: string) => {
      console.log(`\nReceived ${signal}. Gracefully shutting down...`);
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
