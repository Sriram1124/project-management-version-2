import * as dotenv from 'dotenv';
dotenv.config();
import http from 'http';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma, getSanitizedDatabaseInfo } from '../src/lib/prisma';
import app from '../src/app';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access_secret';

// Suppress per-request timing spam during test
const origLog = console.log;
console.log = (...args: any[]) => {
  if (typeof args[0] === 'string' && args[0].startsWith('[Timing]')) return;
  origLog(...args);
};

interface StepResult {
  endpoint: string;
  persona: 'MANAGER' | 'INTERN';
  status: number;
  durationMs: number;
  error?: string;
}

interface UserJourneyResult {
  vuIndex: number;
  persona: 'MANAGER' | 'INTERN';
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
  emaxConnErrors: number;
  poolTimeoutErrors: number;
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
  endpointBreakdown: Record<
    string,
    { count: number; avgMs: number; p95Ms: number; errors: number }
  >;
}

function calculatePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runStage(
  baseUrl: string,
  managerToken: string,
  internToken: string,
  concurrency: number,
  managerCtx: { projectId: string; sprintId: string; taskId: string },
  internCtx: { projectId: string; sprintId: string; taskId: string }
): Promise<StageSummary> {
  console.log(`\n============================================================`);
  console.log(`Executing Load Test: ${concurrency} Concurrent Virtual Users`);
  console.log(`Workload: 50% Manager Persona / 50% Intern Persona with Ramp-up`);
  console.log(`============================================================`);

  const tStageStart = performance.now();
  const rampUpWindowMs = Math.min(3000, concurrency * 30); // 30ms per VU ramp-up

  const vuPromises = Array.from({ length: concurrency }, async (_, idx) => {
    // Stagger arrival
    const delay = (idx / concurrency) * rampUpWindowMs;
    await sleep(delay);

    const isManager = idx % 2 === 0;
    const persona = isManager ? 'MANAGER' : 'INTERN';
    const token = isManager ? managerToken : internToken;
    const vuStart = performance.now();
    const steps: StepResult[] = [];
    let vuSuccess = true;

    const endpoints = isManager
      ? [
          { name: 'GET /api/auth/me', path: '/api/auth/me' },
          { name: 'GET /api/cohorts', path: '/api/cohorts' },
          { name: 'GET /api/projects', path: '/api/projects' },
          { name: 'GET /api/projects/health-overview', path: '/api/projects/health-overview' },
          { name: 'GET /api/projects/:id/sprints', path: `/api/projects/${managerCtx.projectId}/sprints` },
          { name: 'GET /api/work-items?project_id=...', path: `/api/work-items?project_id=${managerCtx.projectId}` },
          { name: 'GET /api/work-items/:id', path: `/api/work-items/${managerCtx.taskId}` },
        ]
      : [
          { name: 'GET /api/auth/me', path: '/api/auth/me' },
          { name: 'GET /api/work-items?assigned_to_me=true', path: '/api/work-items?assigned_to_me=true' },
          { name: 'GET /api/projects/:id', path: `/api/projects/${internCtx.projectId}` },
          { name: 'GET /api/work-items?project_id=...&sprint_id=...', path: `/api/work-items?project_id=${internCtx.projectId}&sprint_id=${internCtx.sprintId}` },
          { name: 'GET /api/work-items/:id', path: `/api/work-items/${internCtx.taskId}` },
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

        let isEmaxConn = false;
        let isPoolTimeout = false;

        if (text.includes('EMAXCONNSESSION') || text.includes('max clients reached')) {
          isEmaxConn = true;
          vuSuccess = false;
        }
        if (text.includes('pool_timeout') || text.includes('Timed out fetching a new connection')) {
          isPoolTimeout = true;
          vuSuccess = false;
        }

        steps.push({
          endpoint: ep.name,
          persona,
          status: res.status,
          durationMs: duration,
          error: isOk
            ? undefined
            : isEmaxConn
            ? 'EMAXCONNSESSION'
            : isPoolTimeout
            ? 'PRISMA_POOL_TIMEOUT'
            : `HTTP ${res.status}`,
        });

        // Think time between operations (30ms - 60ms) using cryptographically secure random jitter
        await sleep(30 + crypto.randomInt(0, 31));
      } catch (err: any) {
        vuSuccess = false;
        steps.push({
          endpoint: ep.name,
          persona,
          status: 0,
          durationMs: performance.now() - stepStart,
          error: err?.message || 'Network/Fetch error',
        });
      }
    }

    return {
      vuIndex: idx + 1,
      persona,
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
  const emaxConnErrors = allStepResults.filter((s) => s.error === 'EMAXCONNSESSION').length;
  const poolTimeoutErrors = allStepResults.filter((s) => s.error === 'PRISMA_POOL_TIMEOUT').length;

  const endpointBreakdown: Record<
    string,
    { count: number; avgMs: number; p95Ms: number; errors: number }
  > = {};

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
    emaxConnErrors,
    poolTimeoutErrors,
    totalDurationMs: totalStageDuration,
    throughputRps: allStepResults.length / (totalStageDuration / 1000),
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
  console.log(`- Total Requests:        ${summary.totalRequests}`);
  console.log(
    `- Success Rate:          ${((summary.successfulRequests / summary.totalRequests) * 100).toFixed(1)}% (${summary.successfulRequests}/${summary.totalRequests})`
  );
  console.log(`- EMAXCONNSESSION:       ${summary.emaxConnErrors}`);
  console.log(`- Pool Timeout Errors:   ${summary.poolTimeoutErrors}`);
  console.log(`- Wall Clock Duration:   ${(summary.totalDurationMs / 1000).toFixed(2)}s`);
  console.log(`- Throughput:            ${summary.throughputRps.toFixed(1)} req/sec`);
  console.log(`- Latency p50:           ${summary.latencies.p50.toFixed(1)} ms`);
  console.log(`- Latency p90:           ${summary.latencies.p90.toFixed(1)} ms`);
  console.log(`- Latency p95:           ${summary.latencies.p95.toFixed(1)} ms`);
  console.log(`- Latency Max:           ${summary.latencies.max.toFixed(1)} ms`);
  console.log(`\nEndpoint Breakdown:`);
  for (const [ep, stats] of Object.entries(summary.endpointBreakdown)) {
    console.log(
      `  * ${ep.padEnd(36)}: Reqs=${String(stats.count).padEnd(4)} | Avg=${stats.avgMs.toFixed(1).padEnd(8)}ms | p95=${stats.p95Ms.toFixed(1).padEnd(8)}ms | Errors=${stats.errors}`
    );
  }

  return summary;
}

async function runAll() {
  console.log('=== VALIDATION: REALISTIC LOAD TEST (30, 60, 100 VIRTUAL USERS) ===');
  const dbInfo = getSanitizedDatabaseInfo();
  console.log(`Database connectivity: configured=${Boolean(dbInfo.configured)}, pool_mode=${dbInfo.pool_mode || 'unknown'}, limit=${dbInfo.connection_limit || 0}`);

  // Find manager and intern principals
  const managerUser = await prisma.user.findFirst({
    where: { is_active: true, must_change_password: false, roles: { some: { role: { name: 'MANAGER' } } } },
    include: { roles: { include: { role: true } } },
  }) || await prisma.user.findFirst({
    where: { is_active: true, must_change_password: false },
    include: { roles: { include: { role: true } } },
  });

  const internUser = await prisma.user.findFirst({
    where: { is_active: true, must_change_password: false, roles: { some: { role: { name: 'INTERN' } } } },
    include: { roles: { include: { role: true } } },
  }) || managerUser;

  if (!managerUser || !internUser) throw new Error('Test principals could not be initialized');

  // Target entities for Manager
  const project = await prisma.project.findFirst({
    where: { organization_id: managerUser.organization_id || undefined },
    select: { id: true, name: true },
  });
  if (!project) throw new Error('No project found for load test');

  const sprint = await prisma.sprint.findFirst({
    where: { project_id: project.id },
    select: { id: true, name: true },
  });

  const workItem = await prisma.workItem.findFirst({
    where: { project_id: project.id },
    select: { id: true },
  }) || await prisma.workItem.findFirst({
    select: { id: true },
  });

  // Target entities for Intern (scoped to intern's project membership)
  const internMembership = await prisma.projectMember.findFirst({
    where: { user_id: internUser.id },
    include: { project: true },
  });
  const internProjectId = internMembership?.project_id || project.id;
  const internSprint = await prisma.sprint.findFirst({
    where: { project_id: internProjectId },
    select: { id: true, name: true },
  });
  const internWorkItem = await prisma.workItem.findFirst({
    where: { project_id: internProjectId },
    select: { id: true },
  }) || workItem;

  const managerToken = jwt.sign(
    { userId: managerUser.id, role: 'MANAGER' },
    ACCESS_SECRET,
    { expiresIn: '2h' }
  );
  const internToken = jwt.sign(
    { userId: internUser.id, role: 'INTERN' },
    ACCESS_SECRET,
    { expiresIn: '2h' }
  );

  const managerCtx = {
    projectId: project.id,
    sprintId: sprint?.id || 'backlog',
    taskId: workItem?.id || 'sample',
  };

  const internCtx = {
    projectId: internProjectId,
    sprintId: internSprint?.id || 'backlog',
    taskId: internWorkItem?.id || 'sample',
  };

  console.log(`Manager Principal: User ID=${managerUser.id.slice(0, 8)}... -> Project: ${project.name}`);
  console.log(`Intern Principal:  User ID=${internUser.id.slice(0, 8)}... -> Project: ${internMembership?.project?.name || project.name}`);

  // Start ephemeral server
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`Ephemeral Test Server listening on ${baseUrl}\n`);

  try {
    const s30 = await runStage(
      baseUrl,
      managerToken,
      internToken,
      30,
      managerCtx,
      internCtx
    );
    const s60 = await runStage(
      baseUrl,
      managerToken,
      internToken,
      60,
      managerCtx,
      internCtx
    );
    const s100 = await runStage(
      baseUrl,
      managerToken,
      internToken,
      100,
      managerCtx,
      internCtx
    );

    console.log('\n============================================================');
    console.log('FINAL REALISTIC 100 CONCURRENT USERS VALIDATION SUMMARY');
    console.log('============================================================');
    console.table([
      {
        'Virtual Users': 30,
        'Total Reqs': s30.totalRequests,
        'Success Rate': `${((s30.successfulRequests / s30.totalRequests) * 100).toFixed(1)}%`,
        'EMAXCONNSESSION': s30.emaxConnErrors,
        'Pool Timeout': s30.poolTimeoutErrors,
        'p50 (ms)': s30.latencies.p50.toFixed(0),
        'p95 (ms)': s30.latencies.p95.toFixed(0),
        'Throughput (req/s)': s30.throughputRps.toFixed(1),
      },
      {
        'Virtual Users': 60,
        'Total Reqs': s60.totalRequests,
        'Success Rate': `${((s60.successfulRequests / s60.totalRequests) * 100).toFixed(1)}%`,
        'EMAXCONNSESSION': s60.emaxConnErrors,
        'Pool Timeout': s60.poolTimeoutErrors,
        'p50 (ms)': s60.latencies.p50.toFixed(0),
        'p95 (ms)': s60.latencies.p95.toFixed(0),
        'Throughput (req/s)': s60.throughputRps.toFixed(1),
      },
      {
        'Virtual Users': 100,
        'Total Reqs': s100.totalRequests,
        'Success Rate': `${((s100.successfulRequests / s100.totalRequests) * 100).toFixed(1)}%`,
        'EMAXCONNSESSION': s100.emaxConnErrors,
        'Pool Timeout': s100.poolTimeoutErrors,
        'p50 (ms)': s100.latencies.p50.toFixed(0),
        'p95 (ms)': s100.latencies.p95.toFixed(0),
        'Throughput (req/s)': s100.throughputRps.toFixed(1),
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

