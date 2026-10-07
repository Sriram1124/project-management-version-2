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
  if (response.status !== 200 || !body.accessToken) {
    throw new Error(`Login failed for ${email}: ${response.status}`);
  }
  return body.accessToken as string;
}

async function request(path: string, token: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: response.status, body: await response.json() as any };
}

async function main() {
  const organization = await prisma.organization.findFirst({ where: { name: 'Dailoqa Technologies' } });
  if (!organization) throw new Error('No organization found');

  const manager = await prisma.user.findUnique({ where: { email: 'manager@dailoqa.com' } });
  const intern = await prisma.user.findUnique({ where: { email: 'intern@dailoqa.com' } });
  if (!manager || !intern) throw new Error('Manager and intern test users are required');

  const managerToken = await login(manager.email, organization.id);
  const internToken = await login(intern.email, organization.id);

  const policy = await request('/timesheet/organization-policy', managerToken);
  if (policy.status !== 200 || !policy.body.policy?.office_start_time) {
    throw new Error(`Policy endpoint failed with ${policy.status}: ${JSON.stringify(policy.body)}`);
  }

  for (const path of ['/timesheet/today', '/timesheet/weekly', '/timesheet/monthly', '/timesheet/task-time']) {
    const result = await request(path, managerToken);
    if (result.status !== 200) throw new Error(`${path} failed with ${result.status}`);
  }

  const managerReport = await request('/timesheet/manager-report', managerToken);
  if (managerReport.status !== 200 || !Array.isArray(managerReport.body.report?.members)) {
    throw new Error(`Manager report failed with ${managerReport.status}`);
  }

  const individualReport = await request(`/users/${intern.id}/timesheet/report?period=month`, managerToken);
  if (individualReport.status !== 200 || individualReport.body.report?.user?.id !== intern.id) {
    throw new Error(`Individual intern report failed with ${individualReport.status}`);
  }
  if (!Array.isArray(individualReport.body.report.time_entries) || !Array.isArray(individualReport.body.report.timeline) || !Array.isArray(individualReport.body.report.task_breakdown)) {
    throw new Error('Individual report is missing detailed entries, timeline, or task breakdown');
  }

  const forbidden = await request(`/timesheet/weekly?user_id=${manager.id}`, internToken);
  if (forbidden.status !== 403) throw new Error(`Intern cross-user report returned ${forbidden.status}`);

  const forbiddenIndividual = await request(`/users/${manager.id}/timesheet/report?period=month`, internToken);
  if (forbiddenIndividual.status !== 403) throw new Error(`Intern individual report returned ${forbiddenIndividual.status}`);

  console.log('timesheet API verification passed', {
    organization: organization.name,
    policyTimezone: policy.body.policy.timezone,
    managerMembers: managerReport.body.report.members.length,
    individualDays: individualReport.body.report.days.length,
    detailedEntries: individualReport.body.report.time_entries.length,
    timelineEvents: individualReport.body.report.timeline.length,
    crossUserStatus: forbidden.status,
    individualCrossUserStatus: forbiddenIndividual.status,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
