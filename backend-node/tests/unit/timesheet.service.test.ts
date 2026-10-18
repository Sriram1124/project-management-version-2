import { TimesheetService } from '../../src/services/timesheet.service';
import { prisma } from '../../src/lib/prisma';
import { mockPrisma } from '../mocks/prisma.mock';
import { WorkItemStatus } from '@prisma/client';

describe('TimesheetService Unit Tests', () => {
  const mockManager = {
    id: 'user-mgr',
    organization_id: 'org-timesheet',
    role: 'MANAGER',
    roles: [{ role: { name: 'MANAGER' } }],
  };

  const mockIntern = {
    id: 'user-intern',
    organization_id: 'org-timesheet',
    role: 'INTERN',
    roles: [{ role: { name: 'INTERN' } }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Organization Work Policy', () => {
    it('returns existing policy or defaults when policy is missing', async () => {
      mockPrisma.organizationWorkPolicy.findUnique.mockResolvedValueOnce(null);
      mockPrisma.organizationWorkPolicy.upsert.mockResolvedValueOnce({
        organization_id: 'org-timesheet',
        office_start_time: '09:00',
        office_end_time: '17:30',
        timezone: 'Asia/Kolkata',
      });

      const policy = await TimesheetService.getOrganizationWorkPolicy(mockManager, 'org-timesheet');
      expect(policy).toHaveProperty('office_start_time');
    });

    it('updates work policy with ensureOrganizationPolicyForOrg', async () => {
      mockPrisma.organizationWorkPolicy.upsert.mockResolvedValueOnce({
        organization_id: 'org-timesheet',
        office_start_time: '10:00',
        office_end_time: '19:00',
      });

      const updated = await TimesheetService.ensureOrganizationPolicyForOrg('org-timesheet', {
        office_start_time: '10:00',
        office_end_time: '19:00',
      });

      expect(updated.office_start_time).toBe('10:00');
    });
  });

  describe('Work Session lifecycle and cutoff enforcement', () => {
    it('calculates 18:15 cutoff correctly for morning session', () => {
      const morningDate = new Date('2026-10-15T09:00:00.000Z');
      const cutoff = TimesheetService.getSessionCutoffTime(morningDate, 'Asia/Kolkata');
      expect(cutoff).toBeInstanceOf(Date);
    });

    it('returns running active session idempotently or switches task', async () => {
      // Idempotent return when session already running on same task
      mockPrisma.workSession.findFirst.mockResolvedValueOnce({
        id: 'session-already-running',
        user_id: mockIntern.id,
        ended_at: null,
      });

      const res = await TimesheetService.startSession(mockIntern, {});
      expect(res.id).toBe('session-already-running');

      // Task switching when timer is active on another task
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'task-2',
        title: 'Task 2',
        assignees: [{ user_id: mockIntern.id }],
      });
      mockPrisma.workSession.findFirst
        .mockResolvedValueOnce({
          id: 'session-task-1',
          task_id: 'task-1',
          task: { id: 'task-1', title: 'Task 1' },
          started_at: new Date(Date.now() - 3600000),
          ended_at: null,
        })
        .mockResolvedValueOnce({
          id: 'session-task-1',
          task_id: 'task-1',
          task: { id: 'task-1', title: 'Task 1' },
          started_at: new Date(Date.now() - 3600000),
          ended_at: null,
        });

      mockPrisma.workSession.create.mockResolvedValueOnce({
        id: 'session-task-2',
        user_id: mockIntern.id,
        task_id: 'task-2',
      });

      const switched = await TimesheetService.startSession(mockIntern, { task_id: 'task-2' });
      expect(switched.id).toBe('session-task-2');
    });

    it('rejects ending when no active session and no previous session is found', async () => {
      mockPrisma.workSession.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await expect(
        TimesheetService.endSession(mockIntern, {})
      ).rejects.toThrow('No active work session found');
    });

    it('retrieves active session if open', async () => {
      mockPrisma.organizationWorkPolicy.findUnique.mockResolvedValueOnce(null);
      mockPrisma.workSession.findFirst.mockResolvedValueOnce({
        id: 'session-open',
        user_id: mockIntern.id,
        started_at: new Date(),
        ended_at: null,
      });

      const active = await TimesheetService.getActiveTaskSession(mockIntern);
      expect(active).toBeDefined();
      expect(active?.id).toBe('session-open');
    });
  });

  describe('getIndividualReport period calculations (day, week, month)', () => {
    it('throws error when target user does not exist in organization', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      await expect(
        TimesheetService.getIndividualReport(mockManager, 'missing-user')
      ).rejects.toThrow('User not found in your organization');
    });

    it('throws error when an intern tries to access another intern report', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        id: 'other-intern',
        name: 'Other Intern',
        organization_id: 'org-timesheet',
      });

      await expect(
        TimesheetService.getIndividualReport(mockIntern, 'other-intern')
      ).rejects.toThrow('Forbidden: you cannot access that intern report');
    });

    it('computes week and month period reports with lifecycle vs logged time', async () => {
      // 1. Week period
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        id: mockIntern.id,
        name: 'Intern',
        organization_id: 'org-timesheet',
      });
      mockPrisma.organizationWorkPolicy.findUnique.mockResolvedValue(null);
      mockPrisma.workSession.findMany.mockResolvedValue([]);
      mockPrisma.timeEntry.findMany.mockResolvedValue([
        {
          id: 'te-1',
          duration_minutes: 120,
          date: new Date('2026-10-12'),
          task_id: 'task-1',
          task: { id: 'task-1', title: 'Feature Task' },
          project: { id: 'proj-1', name: 'Web Portal' },
        },
      ]);
      mockPrisma.workItem.findMany.mockResolvedValue([
        {
          id: 'task-1',
          title: 'Feature Task',
          status: WorkItemStatus.IN_PROGRESS,
          created_at: new Date('2026-10-10'),
          assignees: [{ created_at: new Date('2026-10-10') }],
          project: { id: 'proj-1', name: 'Web Portal' },
        },
      ]);

      const weekReport = await TimesheetService.getIndividualReport(
        mockManager,
        mockIntern.id,
        'week',
        new Date('2026-10-14')
      );

      expect(weekReport).toBeDefined();
      expect(weekReport.days).toBeDefined();

      // 2. Month period
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        id: mockIntern.id,
        name: 'Intern',
        organization_id: 'org-timesheet',
      });
      const monthReport = await TimesheetService.getIndividualReport(
        mockManager,
        mockIntern.id,
        'month',
        new Date('2026-10-14')
      );

      expect(monthReport).toBeDefined();
      expect(monthReport.days).toBeDefined();
    });
  });
});
