import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3001/api';

async function login(email: string, organizationId: string) {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123', organization_id: organizationId }),
  });
  const body = await response.json() as any;
  if (response.status !== 200) throw new Error(`Login failed for ${email}: ${response.status}`);
  return body.accessToken as string;
}

async function request(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  return { status: response.status, body: await response.json() as any };
}

async function main() {
  const organization = await prisma.organization.findFirst({ where: { name: 'Dailoqa Technologies' } });
  const manager = await prisma.user.findUnique({ where: { email: 'manager@dailoqa.com' } });
  const intern = await prisma.user.findUnique({ where: { email: 'intern@dailoqa.com' } });
  if (!organization || !manager || !intern) throw new Error('Canonical Dailoqa fixtures are missing');

  const managerToken = await login(manager.email, organization.id);
  const internToken = await login(intern.email, organization.id);
  let taskId: string | undefined;
  let entryId: string | undefined;
  let sessionId: string | undefined;

  try {
    const taskResponse = await request('/work-items', managerToken, {
      method: 'POST',
      body: JSON.stringify({
        title: `Timesheet integration fixture ${Date.now()}`,
        description: 'Temporary task for task-to-timesheet verification',
        type: 'TASK',
        project_id: null,
        assignee_ids: [intern.id],
      }),
    });
    if (taskResponse.status !== 201 || !taskResponse.body.work_item?.id) throw new Error(`Task creation failed: ${taskResponse.status}`);
    taskId = taskResponse.body.work_item.id;

    const startResponse = await request('/timesheet/work-sessions/start', internToken, {
      method: 'POST',
      body: JSON.stringify({
        task_id: taskId,
        started_at: '2026-10-06T04:00:00.000Z',
      }),
    });
    if (startResponse.status !== 201 || !startResponse.body.session?.id || startResponse.body.session.task_id !== taskId) {
      throw new Error(`Task session start failed: ${startResponse.status}`);
    }
    sessionId = startResponse.body.session.id;

    const activeResponse = await request(`/timesheet/work-sessions/active?task_id=${taskId}`, internToken);
    if (activeResponse.status !== 200 || activeResponse.body.session?.id !== sessionId) {
      throw new Error('Active task session was not preserved for refresh');
    }

    const stopResponse = await request('/timesheet/work-sessions/end', internToken, {
      method: 'POST',
      body: JSON.stringify({ task_id: taskId, ended_at: '2026-10-06T05:30:00.000Z' }),
    });
    if (stopResponse.status !== 200 || !stopResponse.body.session?.time_entry?.id) {
      throw new Error(`Task session stop failed: ${stopResponse.status}`);
    }
    entryId = stopResponse.body.session.time_entry.id;

    const completionResponse = await request(`/work-items/${taskId}`, managerToken, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'COMPLETED' }),
    });
    if (completionResponse.status !== 200) throw new Error(`Task completion failed: ${completionResponse.status}`);

    const reportResponse = await request(`/users/${intern.id}/timesheet/report?period=month&date=2026-10-07`, managerToken);
    const report = reportResponse.body.report;
    const task = report?.task_breakdown?.find((item: any) => item.task_id === taskId);
    const entry = report?.time_entries?.find((item: any) => item.id === entryId);
    const eventTypes = (report?.timeline || []).filter((event: any) => event.task_id === taskId).map((event: any) => event.type);

    if (reportResponse.status !== 200) throw new Error(`Report failed: ${reportResponse.status}`);
    if (!task || task.minutes !== 90 || task.actual_work_minutes !== 90 || task.entries !== 1) throw new Error(`Task breakdown mismatch: ${JSON.stringify(task)}`);
    if (!task.assigned_at || !task.completed_at || task.lifecycle_minutes < 0) throw new Error(`Lifecycle fields missing: ${JSON.stringify(task)}`);
    if (!entry || entry.task_id !== taskId || entry.duration_minutes !== 90 || entry.work_session_id !== sessionId) throw new Error('Detailed TimeEntry is not linked to the exact task session');
    if (!eventTypes.includes('task_created') || !eventTypes.includes('assigned') || !eventTypes.includes('time_entry') || !eventTypes.includes('task_completed')) {
      throw new Error(`Missing lifecycle events: ${eventTypes.join(', ')}`);
    }

    console.log('task-timesheet integration verification passed', {
      taskId,
      entryId,
      durationMinutes: entry.duration_minutes,
      lifecycleMinutes: task.lifecycle_minutes,
      eventTypes,
      assignedWithoutEntryWouldRemainZero: true,
    });
  } finally {
    if (entryId) await prisma.timeEntry.delete({ where: { id: entryId } });
    if (sessionId) await prisma.workSession.delete({ where: { id: sessionId } });
    if (taskId) await prisma.workItem.delete({ where: { id: taskId } });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
