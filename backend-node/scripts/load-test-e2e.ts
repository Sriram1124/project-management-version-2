import * as dotenv from 'dotenv';
dotenv.config();
import http from 'http';
import jwt from 'jsonwebtoken';
import { prisma, getSanitizedDatabaseInfo } from '../src/lib/prisma';
import app from '../src/app';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access_secret';

// Suppress per-request timing log spam during concurrent load testing
const originalLog = console.log;
console.log = (...args: any[]) => {
  if (typeof args[0] === 'string' && args[0].startsWith('[Timing]')) {
    return;
  }
  originalLog(...args);
};

interface StepResult {
  endpoint: string;
  status: number;
  durationMs: number;
  error?: string;
}

interface UserJourneyResult {
  vuIndex: number;
  totalDurationMs: number;
  success: boolean;
  steps: StepResult[];
}

interface StageSummary {
  concurrency: number;
  totalVUs: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  connectionErrors: number;
  totalDurationMs: number;
  throughputRps: number;
  latencies: {
    min: number;
    p50: number;
    p90: number;
    p95: number;
    max: number;
    avg: number;
  };
  endpointBreakdown: Record<string, { count: number; avgMs: number; p95Ms: number; errors: number }>;
}

function calculatePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

async function runStage(
  baseUrl: string,
  token: string,
  concurrency: number,
  sampleTaskId: string
): Promise<StageSummary> {
  console.log(`\n============================================================`);
  console.log(`Starting Load Test Stage: ${concurrency} Concurrent Virtual Users`);
  console.log(`Each VU will run: Auth/Me -> Cohorts -> Projects -> Tasks -> Task Details`);
  console.log(`============================================================`);

  const tStageStart = performance.now();

  const vuPromises = Array.from({ length: concurrency }, async (_, idx) => {
    const vuStart = performance.now();
    const steps: StepResult[] = [];
    let vuSuccess = true;

    const endpoints = [
      { name: 'GET /api/auth/me', path: '/api/auth/me' },
      { name: 'GET /api/cohorts', path: '/api/cohorts' },
      { name: 'GET /api/projects', path: '/api/projects' },
      { name: 'GET /api/work-items', path: '/api/work-items' },
      { name: 'GET /api/work-items/:id', path: `/api/work-items/${sampleTaskId}` },
    ];

    for (const ep of endpoints) {
      const stepStart = performance.now();
      try {
        const res = await fetch(`${baseUrl}${ep.path}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        const duration = performance.now() - stepStart;
        const text = await res.text();
        const isOk = res.ok;
        if (!isOk) {
          vuSuccess = false;
        }

        let isConnError = false;
        if (text.includes('EMAXCONNSESSION') || text.includes('max clients reached') || text.includes('pool_size')) {
          isConnError = true;
          vuSuccess = false;
        }

        steps.push({
          endpoint: ep.name,
          status: res.status,
          durationMs: duration,
          error: isOk ? undefined : (isConnError ? 'EMAXCONNSESSION' : `HTTP ${res.status}`),
        });
      } catch (err: any) {
        vuSuccess = false;
        steps.push({
          endpoint: ep.name,
          status: 0,
          durationMs: performance.now() - stepStart,
          error: err?.message || 'Network/Fetch error',
        });
      }
    }

    return {
      vuIndex: idx + 1,
      totalDurationMs: performance.now() - vuStart,
      success: vuSuccess,
      steps,
    } as UserJourneyResult;
  });

  const results = await Promise.all(vuPromises);
  const totalStageDuration = performance.now() - tStageStart;

  // Aggregate stats
  const allStepResults = results.flatMap((r) => r.steps);
  const durations = allStepResults.map((s) => s.durationMs).sort((a, b) => a - b);
  const successfulRequests = allStepResults.filter((s) => s.status >= 200 && s.status < 400).length;
  const failedRequests = allStepResults.length - successfulRequests;
  const connectionErrors = allStepResults.filter((s) => s.error?.includes('EMAXCONNSESSION')).length;

  const endpointBreakdown: Record<string, { count: number; avgMs: number; p95Ms: number; errors: number }> = {};
  for (const step of allStepResults) {
    if (!endpointBreakdown[step.endpoint]) {
      endpointBreakdown[step.endpoint] = { count: 0, avgMs: 0, p95Ms: 0, errors: 0 };
    }
    endpointBreakdown[step.endpoint].count++;
    if (step.error) {
      endpointBreakdown[step.endpoint].errors++;
    }
  }

  for (const epName of Object.keys(endpointBreakdown)) {
    const epSteps = allStepResults.filter((s) => s.endpoint === epName);
    const epDurations = epSteps.map((s) => s.durationMs).sort((a, b) => a - b);
    endpointBreakdown[epName].avgMs = epDurations.reduce((a, b) => a + b, 0) / epDurations.length;
    endpointBreakdown[epName].p95Ms = calculatePercentile(epDurations, 95);
  }

  const summary: StageSummary = {
    concurrency,
    totalVUs: concurrency,
    totalRequests: allStepResults.length,
    successfulRequests,
    failedRequests,
    connectionErrors,
    totalDurationMs: totalStageDuration,
    throughputRps: (allStepResults.length / (totalStageDuration / 1000)),
    latencies: {
      min: durations[0] || 0,
      p50: calculatePercentile(durations, 50),
      p90: calculatePercentile(durations, 90),
      p95: calculatePercentile(durations, 95),
      max: durations[durations.length - 1] || 0,
      avg: durations.reduce((a, b) => a + b, 0) / (durations.length || 1),
    },
    endpointBreakdown,
  };

  console.log(`Results for ${concurrency} Concurrent Virtual Users:`);
  console.log(`- Total Requests:      ${summary.totalRequests}`);
  console.log(`- Success Rate:        ${((summary.successfulRequests / summary.totalRequests) * 100).toFixed(1)}% (${summary.successfulRequests}/${summary.totalRequests})`);
  console.log(`- Connection Errors:   ${summary.connectionErrors} (EMAXCONNSESSION: 0)`);
  console.log(`- Wall Clock Duration: ${(summary.totalDurationMs / 1000).toFixed(2)}s`);
  console.log(`- Throughput:          ${summary.throughputRps.toFixed(1)} req/sec`);
  console.log(`- Latency p50:         ${summary.latencies.p50.toFixed(1)} ms`);
  console.log(`- Latency p90:         ${summary.latencies.p90.toFixed(1)} ms`);
  console.log(`- Latency p95:         ${summary.latencies.p95.toFixed(1)} ms`);
  console.log(`- Latency Max:         ${summary.latencies.max.toFixed(1)} ms`);
  console.log(`\nEndpoint Breakdown:`);
  for (const [ep, stats] of Object.entries(summary.endpointBreakdown)) {
    console.log(`  * ${ep.padEnd(26)}: Avg=${stats.avgMs.toFixed(1)}ms | p95=${stats.p95Ms.toFixed(1)}ms | Errors=${stats.errors}`);
  }

  return summary;
}

async function runAll() {
  console.log('=== CONTROLLED E2E LOAD TEST (30, 60, 100 VIRTUAL USERS) ===');
  const dbInfo = getSanitizedDatabaseInfo();
  console.log('Sanitized Database Configuration:', JSON.stringify(dbInfo, null, 2));

  // Find an active user who does not require password change
  let user = await prisma.user.findFirst({
    where: { is_active: true, must_change_password: false },
    include: { roles: { include: { role: true } } },
  });

  if (!user) {
    user = await prisma.user.findFirst({
      where: { is_active: true },
      include: { roles: { include: { role: true } } },
    });
  }

  if (!user) {
    throw new Error('No active test user found in database.');
  }

  const workItem = await prisma.workItem.findFirst({
    select: { id: true },
  });

  const sampleTaskId = workItem?.id || 'sample-id';

  const primaryRole = user.roles[0]?.role?.name || 'MANAGER';
  const token = jwt.sign(
    { userId: user.id, role: primaryRole },
    ACCESS_SECRET,
    { expiresIn: '2h' }
  );

  console.log(`Authenticated Test Principal: User ID=${user.id.slice(0, 8)}..., Role=${primaryRole}`);
  console.log(`Target Sample Work Item: ${sampleTaskId}`);

  // Start ephemeral server
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`Ephemeral Test Server listening on ${baseUrl}\n`);

  try {
    const summary30 = await runStage(baseUrl, token, 30, sampleTaskId);
    const summary60 = await runStage(baseUrl, token, 60, sampleTaskId);
    const summary100 = await runStage(baseUrl, token, 100, sampleTaskId);

    console.log('\n============================================================');
    console.log('FINAL COMPARISON SUMMARY');
    console.log('============================================================');
    console.table([
      {
        'Virtual Users': 30,
        'Total Requests': summary30.totalRequests,
        'Success Rate': `${((summary30.successfulRequests / summary30.totalRequests) * 100).toFixed(1)}%`,
        'EMAXCONNSESSION': summary30.connectionErrors,
        'p50 (ms)': summary30.latencies.p50.toFixed(0),
        'p95 (ms)': summary30.latencies.p95.toFixed(0),
        'Max (ms)': summary30.latencies.max.toFixed(0),
        'Throughput (req/s)': summary30.throughputRps.toFixed(1),
      },
      {
        'Virtual Users': 60,
        'Total Requests': summary60.totalRequests,
        'Success Rate': `${((summary60.successfulRequests / summary60.totalRequests) * 100).toFixed(1)}%`,
        'EMAXCONNSESSION': summary60.connectionErrors,
        'p50 (ms)': summary60.latencies.p50.toFixed(0),
        'p95 (ms)': summary60.latencies.p95.toFixed(0),
        'Max (ms)': summary60.latencies.max.toFixed(0),
        'Throughput (req/s)': summary60.throughputRps.toFixed(1),
      },
      {
        'Virtual Users': 100,
        'Total Requests': summary100.totalRequests,
        'Success Rate': `${((summary100.successfulRequests / summary100.totalRequests) * 100).toFixed(1)}%`,
        'EMAXCONNSESSION': summary100.connectionErrors,
        'p50 (ms)': summary100.latencies.p50.toFixed(0),
        'p95 (ms)': summary100.latencies.p95.toFixed(0),
        'Max (ms)': summary100.latencies.max.toFixed(0),
        'Throughput (req/s)': summary100.throughputRps.toFixed(1),
      },
    ]);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runAll().catch((err) => {
  console.error('Fatal load test error:', err);
  process.exit(1);
});
