import request from 'supertest';
import app from '../../src/app';
import { mockPrisma } from '../mocks/prisma.mock';
import { setupAuthUser } from '../helpers/auth.helper';

describe('Timesheet API (/api/timesheet)', () => {
  const mockPolicy = {
    id: 'policy-1',
    organization_id: 'org-test-1',
    office_start_time: '09:00',
    office_end_time: '17:30',
    lunch_break_minutes: 60,
    timezone: 'Asia/Kolkata',
    overtime_enabled: false,
  };

  const mockSession = {
    id: 'ws-1',
    user_id: 'user-intern',
    task_id: 'task-1',
    start_time: new Date(),
    end_time: null,
    is_active: true,
  };

  const mockEntry = {
    id: 'te-1',
    user_id: 'user-intern',
    task_id: 'task-1',
    date: new Date(),
    duration_minutes: 120,
    description: 'Worked on unit tests',
    created_at: new Date(),
    task: {
      id: 'task-1',
      title: 'Setup Jest',
      project: { id: 'proj-1', name: 'Dashboard' },
    },
  };

  it('should require authentication for timesheet routes', async () => {
    const res = await request(app).get('/api/timesheet/today');
    expect(res.status).toBe(401);
  });

  describe('Organization Work Policy', () => {
    it('GET /api/timesheet/organization-policy should return policy', async () => {
      const { authHeader } = setupAuthUser({ organization_id: 'org-test-1' });
      mockPrisma.organizationWorkPolicy.findUnique.mockResolvedValueOnce(mockPolicy);

      const res = await request(app).get('/api/timesheet/organization-policy').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('office_start_time', '09:00');
    });

    it('PUT /api/timesheet/organization-policy should allow manager to update policy', async () => {
      const { authHeader } = setupAuthUser({ role: 'ADMIN', permissions: ['ORGANIZATION_UPDATE'], organization_id: 'org-test-1' });
      mockPrisma.organizationWorkPolicy.upsert.mockResolvedValueOnce({
        ...mockPolicy,
        office_end_time: '18:00',
      });

      const res = await request(app)
        .put('/api/timesheet/organization-policy')
        .set('Authorization', authHeader)
        .send({ office_end_time: '18:00' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Organization work policy updated');
    });
  });

  describe('Work Sessions: start, active, end', () => {
    it('POST /api/timesheet/work-sessions/start should begin a live session', async () => {
      const { authHeader } = setupAuthUser({ id: 'user-intern', role: 'INTERN' });
      mockPrisma.workSession.findMany.mockResolvedValueOnce([]); // autoClockExpiredSessions
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'task-1',
        title: 'Task 1',
        organization_id: 'org-test-1',
        assignees: [{ user_id: 'user-intern' }],
      });
      mockPrisma.workSession.findFirst.mockResolvedValueOnce(null); // active session check
      mockPrisma.workSession.create.mockResolvedValueOnce(mockSession);

      const res = await request(app)
        .post('/api/timesheet/work-sessions/start')
        .set('Authorization', authHeader)
        .send({ task_id: 'task-1' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('session');
      expect(res.body.session.id).toBe('ws-1');
    });

    it('GET /api/timesheet/work-sessions/active should return current active session', async () => {
      const { authHeader } = setupAuthUser({ id: 'user-intern', role: 'INTERN' });
      mockPrisma.workSession.findFirst.mockResolvedValueOnce(mockSession);

      const res = await request(app).get('/api/timesheet/work-sessions/active').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.session.id).toBe('ws-1');
    });

    it('POST /api/timesheet/work-sessions/end should finalize live session and create time entry', async () => {
      const { authHeader } = setupAuthUser({ id: 'user-intern', role: 'INTERN' });
      mockPrisma.workSession.findFirst.mockResolvedValueOnce({
        ...mockSession,
        started_at: new Date(Date.now() - 3600000), // 1 hour ago
        break_minutes: 0,
      });
      mockPrisma.organizationWorkPolicy.findUnique.mockResolvedValueOnce({ timezone: 'Asia/Kolkata' });
      mockPrisma.workItem.findUnique.mockResolvedValueOnce({ id: 'task-1', project_id: 'proj-1' });
      mockPrisma.timeEntry.create.mockResolvedValueOnce({
        id: 'te-from-session',
        duration_minutes: 60,
      });
      mockPrisma.workSession.update.mockResolvedValueOnce({
        ...mockSession,
        ended_at: new Date(),
      });

      const res = await request(app)
        .post('/api/timesheet/work-sessions/end')
        .set('Authorization', authHeader)
        .send({ task_id: 'task-1' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('session');
    });
  });

  describe('Time Entries: CRUD', () => {
    it('POST /api/timesheet/time-entries should log manual time entry', async () => {
      const { authHeader } = setupAuthUser({ id: 'user-intern', role: 'INTERN' });
      mockPrisma.workItem.findUnique.mockResolvedValueOnce({
        id: 'task-1',
        title: 'Task 1',
        organization_id: 'org-test-1',
        assignees: [{ user_id: 'user-intern' }],
      });
      mockPrisma.timeEntry.findFirst.mockResolvedValueOnce(null);
      mockPrisma.timeEntry.create.mockResolvedValueOnce(mockEntry);

      const res = await request(app)
        .post('/api/timesheet/time-entries')
        .set('Authorization', authHeader)
        .send({
          task_id: 'task-1',
          duration_minutes: 120,
          description: 'Worked on unit tests',
          date: '2026-10-17',
        });

      expect(res.status).toBe(201);
      expect(res.body.entry.id).toBe('te-1');
    });

    it('PATCH /api/timesheet/time-entries/:id should update entry', async () => {
      const { authHeader } = setupAuthUser({ id: 'user-intern', role: 'INTERN' });
      mockPrisma.timeEntry.findUnique.mockResolvedValueOnce(mockEntry);
      mockPrisma.timeEntry.update.mockResolvedValueOnce({
        ...mockEntry,
        duration_minutes: 150,
      });

      const res = await request(app)
        .patch('/api/timesheet/time-entries/te-1')
        .set('Authorization', authHeader)
        .send({ duration_minutes: 150 });

      expect(res.status).toBe(200);
      expect(res.body.entry.duration_minutes).toBe(150);
    });

    it('DELETE /api/timesheet/time-entries/:id should delete entry', async () => {
      const { authHeader } = setupAuthUser({ id: 'user-intern', role: 'INTERN' });
      mockPrisma.timeEntry.findUnique.mockResolvedValueOnce(mockEntry);
      mockPrisma.timeEntry.delete.mockResolvedValueOnce(mockEntry);

      const res = await request(app).delete('/api/timesheet/time-entries/te-1').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('GET /api/timesheet/tasks/:taskId/entries should fetch entries for a task', async () => {
      const { authHeader } = setupAuthUser({ id: 'user-intern', role: 'INTERN' });
      mockPrisma.workItem.findUnique.mockResolvedValueOnce({
        id: 'task-1',
        organization_id: 'org-test-1',
        project_id: 'proj-1',
      });
      mockPrisma.timeEntry.findMany.mockResolvedValueOnce([mockEntry]);

      const res = await request(app).get('/api/timesheet/tasks/task-1/entries').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('entries');
      expect(Array.isArray(res.body.entries)).toBe(true);
    });
  });

  describe('Timesheet Views and Reports', () => {
    it('GET /api/timesheet/today should return today timesheet summary', async () => {
      const { authHeader } = setupAuthUser({ id: 'user-intern', role: 'INTERN' });
      mockPrisma.timeEntry.findMany.mockResolvedValueOnce([mockEntry]);
      mockPrisma.workSession.findMany.mockResolvedValueOnce([]);

      const res = await request(app).get('/api/timesheet/today').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('timesheet');
    });

    it('GET /api/timesheet/weekly should return weekly timesheet with task status filters', async () => {
      const { authHeader } = setupAuthUser({ id: 'user-intern', role: 'INTERN' });
      mockPrisma.timeEntry.findMany.mockResolvedValueOnce([mockEntry]);
      mockPrisma.workSession.findMany.mockResolvedValueOnce([]);

      const res = await request(app)
        .get('/api/timesheet/weekly?date=2026-10-17&status=IN_PROGRESS')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('timesheet');
    });

    it('GET /api/timesheet/monthly should return monthly breakdown', async () => {
      const { authHeader } = setupAuthUser({ id: 'user-intern', role: 'INTERN' });
      mockPrisma.timeEntry.findMany.mockResolvedValueOnce([mockEntry]);

      const res = await request(app).get('/api/timesheet/monthly').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('timesheet');
    });

    it('GET /api/timesheet/task-time should return cumulative task time', async () => {
      const { authHeader } = setupAuthUser({ id: 'user-intern', role: 'INTERN' });
      mockPrisma.timeEntry.findMany.mockResolvedValueOnce([mockEntry]);

      const res = await request(app).get('/api/timesheet/task-time').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('timesheet');
    });

    it('GET /api/timesheet/intern-report should return report for intern', async () => {
      const { authHeader } = setupAuthUser({ id: 'user-intern', role: 'INTERN' });
      mockPrisma.timeEntry.findMany.mockResolvedValueOnce([mockEntry]);

      const res = await request(app).get('/api/timesheet/intern-report').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('report');
    });

    it('GET /api/timesheet/manager-report should return aggregated report for manager', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });
      mockPrisma.timeEntry.findMany.mockResolvedValueOnce([mockEntry]);

      const res = await request(app).get('/api/timesheet/manager-report').set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('report');
    });

    it('GET /api/timesheet/review should require manager/lead role and return grid', async () => {
      const { authHeader: internHeader } = setupAuthUser({ role: 'INTERN' });
      const forbiddenRes = await request(app).get('/api/timesheet/review').set('Authorization', internHeader);
      expect(forbiddenRes.status).toBe(403);

      const { authHeader: mgrHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });
      mockPrisma.user.findMany.mockResolvedValueOnce([
        {
          id: 'u-1',
          name: 'Alice',
          email: 'alice@test.com',
          user_code: 'INT001',
          batch: '2026',
          cohort: { name: 'Cohort 1' },
          time_entries: [],
          work_sessions: [],
        },
      ]);
      mockPrisma.user.count.mockResolvedValueOnce(1);

      const res = await request(app)
        .get('/api/timesheet/review?date=2026-10-17')
        .set('Authorization', mgrHeader);

      expect(res.status).toBe(200);
    });

    it('GET /api/users/:userId/timesheet/report should return individual report', async () => {
      const { authHeader } = setupAuthUser({ role: 'MANAGER', organization_id: 'org-test-1' });
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        id: 'user-intern-1',
        name: 'Alice',
        organization_id: 'org-test-1',
      });
      mockPrisma.organizationWorkPolicy.findUnique.mockResolvedValueOnce({ timezone: 'Asia/Kolkata' });
      mockPrisma.workSession.findMany.mockResolvedValueOnce([]);
      mockPrisma.timeEntry.findMany
        .mockResolvedValueOnce([]) // daily entries
        .mockResolvedValueOnce([mockEntry]); // detailedEntries
      mockPrisma.workItem.findMany.mockResolvedValueOnce([]); // assignedTasks

      const res = await request(app)
        .get('/api/users/user-intern-1/timesheet/report?period=day')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('report');
    });
  });
});
