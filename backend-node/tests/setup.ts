process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-jwt-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
process.env.ENABLE_MONGODB_PROJECT_FILES = 'false';
process.env.DUAL_WRITE_PROJECT_FILES = 'false';

import { mockPrisma, resetPrismaMock } from './mocks/prisma.mock';
import { invalidateUserSessionCache } from '../src/middleware/auth.middleware';

jest.mock('../src/lib/prisma', () => ({
  prisma: mockPrisma,
  getSanitizedDatabaseInfo: jest.fn().mockReturnValue({
    configured: true,
    host: 'localhost',
    port: 5432,
    pool_mode: 'direct',
    pgbouncer: false,
    connection_limit: 3,
    pool_timeout: 30,
  }),
  getEffectiveDatabaseUrl: jest.fn().mockReturnValue('postgresql://test:test@localhost:5432/test'),
}));

jest.mock('../src/lib/redis', () => ({
  getRedisConfig: jest.fn().mockReturnValue({
    url: null,
    isConfigured: false,
    isTls: false,
    maskedUrl: 'None (Test Mock)',
  }),
  getRedisUrl: jest.fn().mockReturnValue('redis://localhost:6379'),
  testRedisConnection: jest.fn().mockResolvedValue({ connected: false, error: 'Redis disabled in test' }),
  isRedisAvailable: jest.fn().mockResolvedValue(false),
  getRedisConnection: jest.fn().mockReturnValue({
    on: jest.fn(),
    add: jest.fn(),
  }),
  createNewRedisConnection: jest.fn().mockReturnValue({
    on: jest.fn(),
  }),
  closeRedisConnections: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/queues/notification.queue', () => ({
  NOTIFICATION_QUEUE_NAME: 'notification-queue',
  notificationQueue: {
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    isConfigured: false,
  },
  getNotificationQueue: jest.fn().mockReturnValue({
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  }),
  enqueueNotificationJob: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
}));

// Suppress timing and debug console logs during tests to keep test output clean
const originalLog = console.log;
console.log = (...args: any[]) => {
  if (
    typeof args[0] === 'string' &&
    (args[0].startsWith('[Timing]') || args[0].startsWith('[Redis]') || args[0].startsWith('[Queue]'))
  ) {
    return;
  }
  originalLog(...args);
};

afterAll(() => {
  console.log = originalLog;
  jest.restoreAllMocks();
});

beforeEach(() => {
  resetPrismaMock();
  invalidateUserSessionCache();
});
