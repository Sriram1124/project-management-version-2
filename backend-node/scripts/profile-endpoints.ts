import * as dotenv from 'dotenv';
dotenv.config();
import http from 'http';
import jwt from 'jsonwebtoken';
import { prisma, getSanitizedDatabaseInfo } from '../src/lib/prisma';
import app from '../src/app';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access_secret';

// Suppress per-request timing spam during profiling
const origLog = console.log;
console.log = (...args: any[]) => {
  if (typeof args[0] === 'string' && args[0].startsWith('[Timing]')) return;
  origLog(...args);
};

interface EndpointProfile {
  name: string;
  category: string;
  path: string;
  count: number;
  errorCount: number;
  durations: number[];
  dbDurations: number[];
  authDurations: number[];
}

function calculatePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

async function profile() {
  console.log('=== PHASE 2: DETAILED ENDPOINT-BY-ENDPOINT PROFILING ===\n');

  // Find active manager user
  const user = await prisma.user.findFirst({
    where: { is_active: true, must_change_password: false },
    include: { roles: { include: { role: true } } },
  });
  if (!user) throw new Error('No active user found');

  const project = await prisma.project.findFirst({
    where: { organization_id: user.organization_id || undefined },
    select: { id: true, name: true },
  });

  const sprint = project
    ? await prisma.sprint.findFirst({
        where: { project_id: project.id },
        select: { id: true, name: true },
      })
    : null;

  const workItem = await prisma.workItem.findFirst({
    where: { organization_id: user.organization_id || undefined },
    select: { id: true, title: true },
  });

  const token = jwt.sign(
    { userId: user.id, role: user.roles[0]?.role?.name || 'MANAGER' },
    ACCESS_SECRET,
    { expiresIn: '2h' }
  );

  // Start ephemeral server
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const endpointsToTest = [
    {
      category: 'Auth & Session',
      name: 'Session Validation (me)',
      path: '/api/auth/me',
    },
    {
      category: 'Auth & Session',
      name: 'Organization List',
      path: '/api/auth/organizations',
    },
    {
      category: 'Org & Cohorts',
      name: 'Cohort List',
      path: '/api/cohorts',
    },
    {
      category: 'Manager Dashboard',
      name: 'User Roster',
      path: '/api/users',
    },
    {
      category: 'Manager Dashboard',
      name: 'Health Overview',
      path: '/api/projects/health-overview',
    },
    {
      category: 'Manager Dashboard',
      name: 'Action Items',
      path: '/api/action-items',
    },
    {
      category: 'Projects',
      name: 'Project List',
      path: '/api/projects',
    },
    ...(project
      ? [
          {
            category: 'Projects',
            name: 'Project Details',
            path: `/api/projects/${project.id}`,
          },
          {
            category: 'Cycles',
            name: 'Project Sprints/Cycles',
            path: `/api/projects/${project.id}/sprints`,
          },
          {
            category: 'Work Items',
            name: 'Project Work Items',
            path: `/api/work-items?project_id=${project.id}`,
          },
          {
            category: 'Work Items',
            name: 'Project Backlog',
            path: `/api/work-items?project_id=${project.id}&sprint_id=backlog`,
          },
          ...(sprint
            ? [
                {
                  category: 'Work Items',
                  name: 'Kanban Active Cycle',
                  path: `/api/work-items?project_id=${project.id}&sprint_id=${sprint.id}`,
                },
              ]
            : []),
          {
            category: 'Analytics',
            name: 'Work Item Analytics',
            path: `/api/work-items/analytics?project_id=${project.id}`,
          },
        ]
      : []),
    ...(workItem
      ? [
          {
            category: 'Work Items',
            name: 'Work Item Detail',
            path: `/api/work-items/${workItem.id}`,
          },
        ]
      : []),
    {
      category: 'Unfiltered Mega Query',
      name: 'Unfiltered Work Items (All)',
      path: '/api/work-items',
    },
    {
      category: 'Intern Dashboard',
      name: 'My Assigned Work Items',
      path: '/api/work-items?assigned_to_me=true',
    },
    {
      category: 'Intern Dashboard',
      name: 'My Personal Work Items',
      path: '/api/work-items?my_personal=true',
    },
  ];

  const profiles: EndpointProfile[] = [];
  const REPEAT_COUNT = 10;

  for (const ep of endpointsToTest) {
    const prof: EndpointProfile = {
      name: ep.name,
      category: ep.category,
      path: ep.path,
      count: REPEAT_COUNT,
      errorCount: 0,
      durations: [],
      dbDurations: [],
      authDurations: [],
    };

    for (let i = 0; i < REPEAT_COUNT; i++) {
      const t0 = performance.now();
      try {
        const res = await fetch(`${baseUrl}${ep.path}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const duration = performance.now() - t0;
        prof.durations.push(duration);

        if (!res.ok) {
          prof.errorCount++;
        }

        const serverTiming = res.headers.get('Server-Timing') || '';
        // Format: total;dur=12.3, auth;dur=1.2, db;dur=0.5
        const dbMatch = serverTiming.match(/db;dur=([0-9.]+)/);
        const authMatch = serverTiming.match(/auth;dur=([0-9.]+)/);
        if (dbMatch) prof.dbDurations.push(parseFloat(dbMatch[1]));
        if (authMatch) prof.authDurations.push(parseFloat(authMatch[1]));
      } catch (err) {
        prof.errorCount++;
        prof.durations.push(performance.now() - t0);
      }
    }

    profiles.push(prof);
  }

  server.close();
  await prisma.$disconnect();

  console.log('-----------------------------------------------------------------------------------------------------------------');
  console.log(
    'Category'.padEnd(20) +
    'Endpoint'.padEnd(28) +
    'Reqs'.padEnd(6) +
    'p50 (ms)'.padEnd(10) +
    'p95 (ms)'.padEnd(10) +
    'p99 (ms)'.padEnd(10) +
    'DB Avg'.padEnd(10) +
    'App Avg'.padEnd(10) +
    'Errors'
  );
  console.log('-----------------------------------------------------------------------------------------------------------------');

  for (const p of profiles) {
    p.durations.sort((a, b) => a - b);
    const p50 = calculatePercentile(p.durations, 50).toFixed(1);
    const p95 = calculatePercentile(p.durations, 95).toFixed(1);
    const p99 = calculatePercentile(p.durations, 99).toFixed(1);
    const avgDb = (p.dbDurations.reduce((a, b) => a + b, 0) / (p.dbDurations.length || 1)).toFixed(1);
    const avgTotal = p.durations.reduce((a, b) => a + b, 0) / p.durations.length;
    const avgApp = Math.max(0, avgTotal - parseFloat(avgDb)).toFixed(1);

    console.log(
      p.category.padEnd(20) +
      p.name.padEnd(28) +
      String(p.count).padEnd(6) +
      p50.padEnd(10) +
      p95.padEnd(10) +
      p99.padEnd(10) +
      `${avgDb}ms`.padEnd(10) +
      `${avgApp}ms`.padEnd(10) +
      `${p.errorCount}`
    );
  }
  console.log('-----------------------------------------------------------------------------------------------------------------\n');
}

profile().catch((err) => {
  console.error('Profiling error:', err);
  process.exit(1);
});

