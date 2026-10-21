import * as dotenv from 'dotenv';
dotenv.config();

import { prisma, getSanitizedDatabaseInfo } from '../src/lib/prisma';

interface QueryMetric {
  name: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

function calculatePercentiles(durations: number[]) {
  if (durations.length === 0) return { p50: 0, p90: 0, p95: 0, avg: 0, min: 0, max: 0 };
  const sorted = [...durations].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = Number((sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(1));
  return { p50, p90, p95, avg, min, max };
}

async function simulateUserDashboardFlow(userId: number): Promise<QueryMetric[]> {
  const metrics: QueryMetric[] = [];

  const runQuery = async (name: string, fn: () => Promise<any>) => {
    const start = performance.now();
    try {
      await fn();
      metrics.push({
        name,
        durationMs: performance.now() - start,
        success: true,
      });
    } catch (err: any) {
      metrics.push({
        name,
        durationMs: performance.now() - start,
        success: false,
        error: err.message,
      });
    }
  };

  // Realistic concurrent requests triggered when an incognito tab loads Manager Dashboard & Project details:
  await Promise.all([
    // 1. Projects listing with relations (the query that previously failed with EMAXCONNSESSION)
    runQuery('project.findMany', () =>
      prisma.project.findMany({
        take: 10,
        include: {
          owner: { select: { id: true, name: true, email: true } },
          members: { include: { user: { select: { id: true, name: true, email: true } } } },
          _count: { select: { members: true, documents: true } },
        },
      })
    ),

    // 2. Users with role relations
    runQuery('user.findMany', () =>
      prisma.user.findMany({
        take: 10,
        include: {
          organization: { select: { id: true, name: true } },
          roles: { include: { role: true } },
        },
      })
    ),

    // 3. Work items for task board
    runQuery('workItem.findMany', () =>
      prisma.workItem.findMany({
        take: 20,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          project_id: true,
        },
      })
    ),

    // 4. Cohorts listing
    runQuery('cohort.findMany', () =>
      prisma.cohort.findMany({
        select: { id: true, name: true, code: true },
      })
    ),

    // 5. Raw health ping
    runQuery('rawHealthPing', () => prisma.$queryRaw`SELECT 1`),
  ]);

  return metrics;
}

async function runConcurrencyStage(concurrencyUsers: number) {
  console.log(`\n--- Running Concurrency Stage: ${concurrencyUsers} simulated users (${concurrencyUsers * 5} parallel queries) ---`);
  const t0 = performance.now();

  const userPromises = Array.from({ length: concurrencyUsers }, (_, i) => simulateUserDashboardFlow(i + 1));
  const results = await Promise.all(userPromises);
  const totalElapsed = performance.now() - t0;

  const allMetrics = results.flat();
  const successful = allMetrics.filter((m) => m.success);
  const failed = allMetrics.filter((m) => !m.success);
  const durations = allMetrics.map((m) => m.durationMs);

  const stats = calculatePercentiles(durations);

  console.log(`Total queries executed: ${allMetrics.length}`);
  console.log(`Successful queries: ${successful.length}`);
  console.log(`Failed queries: ${failed.length}`);
  console.log(`Total elapsed stage time: ${totalElapsed.toFixed(1)} ms`);
  console.log(`Latency min: ${stats.min.toFixed(1)} ms | avg: ${stats.avg.toFixed(1)} ms | p50: ${stats.p50.toFixed(1)} ms | p90: ${stats.p90.toFixed(1)} ms | p95: ${stats.p95.toFixed(1)} ms | max: ${stats.max.toFixed(1)} ms`);

  if (failed.length > 0) {
    console.error('Errors encountered:');
    const uniqueErrors = Array.from(new Set(failed.map((f) => f.error?.replace(/postgres(ql)?:\/\/[^@\s]+@[^\s/]+/gi, 'postgresql://[REDACTED]'))));
    uniqueErrors.forEach((e) => console.error(`  - ${e}`));
    return false;
  }

  console.log(`[PASS] Stage with ${concurrencyUsers} concurrent users completed with 0 errors!`);
  return true;
}

async function main() {
  console.log('=== CONCURRENT DATABASE CONNECTION VERIFICATION ===');
  const dbInfo = getSanitizedDatabaseInfo();
  console.log('Effective Database Configuration:');
  console.log(`  Configured: ${Boolean(dbInfo.configured)}`);
  console.log(`  Pool Mode: ${dbInfo.pool_mode || 'unknown'}`);
  console.log(`  PgBouncer flag: ${Boolean(dbInfo.pgbouncer)}`);
  console.log(`  Connection Limit: ${dbInfo.connection_limit || 0}`);
  console.log(`  Pool Timeout: ${dbInfo.pool_timeout || 0}s`);

  // Progressive load: 5 users (matches user scenario: 5 incognito tabs)
  const pass5 = await runConcurrencyStage(5);

  // Progressive load: 10 users (50 parallel queries)
  const pass10 = await runConcurrencyStage(10);

  // Progressive load: 15 users (75 parallel queries)
  const pass15 = await runConcurrencyStage(15);

  await prisma.$disconnect();

  if (!pass5 || !pass10 || !pass15) {
    console.error('\n[FAIL] One or more concurrency stages failed.');
    process.exit(1);
  }

  console.log('\n=== ALL CONCURRENCY STAGES PASSED CLEANLY (ZERO EMAXCONNSESSION ERRORS) ===');
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

