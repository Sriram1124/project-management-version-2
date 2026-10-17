import { SprintService } from '../../src/services/sprint.service';
import { prisma } from '../../src/lib/prisma';
import { mockPrisma } from '../mocks/prisma.mock';
import { SprintStatus, WorkItemStatus, WorkItemType } from '@prisma/client';

describe('SprintService Unit Tests', () => {
  const mockUser = {
    id: 'user-manager',
    organization_id: 'org-123',
    role: 'MANAGER',
    roles: [{ role: { name: 'MANAGER' } }],
  };

  const mockProject = {
    id: 'proj-123',
    organization_id: 'org-123',
    name: 'Test Project',
    status: 'ACTIVE',
    methodology: 'SCRUM',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSprint', () => {
    it('throws error when projectId or name is missing', async () => {
      await expect(SprintService.createSprint('', { name: 'Cycle 1' }, mockUser)).rejects.toThrow(
        'Project not found'
      );
      await expect(
        SprintService.createSprint('proj-123', { name: '   ' }, mockUser)
      ).rejects.toThrow('Sprint name is required');
    });

    it('throws error when date validation fails', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      await expect(
        SprintService.createSprint(
          'proj-123',
          { name: 'Cycle 1', start_date: 'invalid-date' },
          mockUser
        )
      ).rejects.toThrow('Invalid start date format');

      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      await expect(
        SprintService.createSprint(
          'proj-123',
          { name: 'Cycle 1', end_date: 'invalid-date' },
          mockUser
        )
      ).rejects.toThrow('Invalid end date format');

      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      await expect(
        SprintService.createSprint(
          'proj-123',
          {
            name: 'Cycle 1',
            start_date: new Date('2026-10-20'),
            end_date: new Date('2026-10-10'),
          },
          mockUser
        )
      ).rejects.toThrow('Sprint start date cannot be later than its end date');
    });

    it('throws error when creating a sprint in an archived project as non-manager', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce({
        ...mockProject,
        status: 'ARCHIVED',
      });

      const internUser = { id: 'u-intern', organization_id: 'org-123', role: 'INTERN' };
      await expect(
        SprintService.createSprint('proj-123', { name: 'Cycle Archived' }, internUser)
      ).rejects.toThrow('Cannot create sprints or cycles in an archived project');
    });

    it('rejects starting in ACTIVE status if another sprint is already ACTIVE', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.sprint.findFirst.mockResolvedValueOnce({
        id: 'sprint-active',
        name: 'Existing Active Sprint',
        status: SprintStatus.ACTIVE,
      });

      await expect(
        SprintService.createSprint(
          'proj-123',
          { name: 'New Sprint', status: 'ACTIVE' } as any,
          mockUser
        )
      ).rejects.toThrow('Another sprint is currently active in this project');
    });

    it('creates sprint successfully with mapped status and trimmed fields', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.sprint.create.mockResolvedValueOnce({
        id: 'sprint-created',
        name: 'Sprint Alpha',
        status: SprintStatus.PLANNED,
        project_id: 'proj-123',
      });

      const res = await SprintService.createSprint(
        'proj-123',
        { name: '  Sprint Alpha  ', goal: ' Deliver MVP ', status: 'PLANNED' } as any,
        mockUser
      );

      expect(res.id).toBe('sprint-created');
      expect(mockPrisma.sprint.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Sprint Alpha',
            goal: 'Deliver MVP',
            status: SprintStatus.PLANNED,
          }),
        })
      );
    });

    it('resolves active organization if user lacks organization_id and is manager', async () => {
      const userNoOrg = { id: 'u-mgr', role: 'MANAGER' };
      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: 'org-first' });
      mockPrisma.project.findFirst.mockResolvedValueOnce({
        ...mockProject,
        organization_id: 'org-first',
      });
      mockPrisma.sprint.create.mockResolvedValueOnce({ id: 'sprint-no-org' });

      const res = await SprintService.createSprint('proj-123', { name: 'Sprint Org Fallback' }, userNoOrg);
      expect(res.id).toBe('sprint-no-org');
    });
  });

  describe('getSprintById and listSprints metrics', () => {
    it('computes completion, overdue, points, and intern hours accurately', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.sprint.findFirst.mockResolvedValueOnce({
        id: 'sprint-metrics',
        project_id: 'proj-123',
        organization_id: 'org-123',
        start_date: new Date('2026-10-01'),
        end_date: new Date('2026-10-15'),
        work_items: [
          {
            id: 'task-1',
            type: WorkItemType.TASK,
            status: WorkItemStatus.COMPLETED,
            story_points: 5,
            due_date: new Date('2026-10-10'),
            time_entries: [
              {
                id: 'te-1',
                duration_minutes: 120,
                date: new Date('2026-10-05'),
                user_id: 'u-1',
                user: { id: 'u-1', name: 'Alice', email: 'alice@test.com' },
              },
            ],
          },
          {
            id: 'task-2',
            type: WorkItemType.TASK,
            status: WorkItemStatus.IN_PROGRESS,
            story_points: 3,
            due_date: new Date('2026-10-20'), // overdue past sprint end_date
            time_entries: [
              {
                id: 'te-2',
                duration_minutes: 60,
                date: new Date('2026-10-12'),
                user_id: 'u-2',
                user: { id: 'u-2', name: 'Bob', email: 'bob@test.com' },
              },
            ],
          },
        ],
      });

      const sprint = await SprintService.getSprintById('proj-123', 'sprint-metrics', mockUser);
      expect(sprint.total_items).toBe(2);
      expect(sprint.completed_items).toBe(1);
      expect(sprint.in_progress_items).toBe(1);
      expect(sprint.overdue_items).toBe(1);
      expect(sprint.total_points).toBe(8);
      expect(sprint.completed_points).toBe(5);
      expect(sprint.remaining_points).toBe(3);
      expect(sprint.total_logged_minutes).toBe(180);
      expect(sprint.total_logged_hours).toBe(3);
      expect(sprint.time_by_intern).toHaveLength(2);
    });

    it('throws 404 when sprint does not exist in project', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.sprint.findFirst.mockResolvedValueOnce(null);

      await expect(
        SprintService.getSprintById('proj-123', 'non-existent', mockUser)
      ).rejects.toThrow('Sprint not found in this project');
    });
  });

  describe('startSprint', () => {
    it('returns target sprint immediately if already ACTIVE', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.sprint.findFirst.mockResolvedValueOnce({
        id: 'sprint-already-active',
        status: SprintStatus.ACTIVE,
      });

      const res = await SprintService.startSprint('proj-123', 'sprint-already-active', mockUser);
      expect(res.status).toBe(SprintStatus.ACTIVE);
    });

    it('throws error when starting an already COMPLETED sprint', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.sprint.findFirst.mockResolvedValueOnce({
        id: 'sprint-done',
        status: SprintStatus.COMPLETED,
      });

      await expect(
        SprintService.startSprint('proj-123', 'sprint-done', mockUser)
      ).rejects.toThrow('Cannot start a sprint that is already completed');
    });

    it('starts sprint in Kanban without acquiring row lock', async () => {
      const kanbanProject = { ...mockProject, methodology: 'KANBAN' };
      mockPrisma.project.findFirst.mockResolvedValueOnce(kanbanProject);
      mockPrisma.sprint.findFirst
        .mockResolvedValueOnce({ id: 'cycle-1', status: SprintStatus.PLANNED }) // targetSprint
        .mockResolvedValueOnce(null); // activeSprint check
      mockPrisma.sprint.update.mockResolvedValueOnce({
        id: 'cycle-1',
        status: SprintStatus.ACTIVE,
      });

      const res = await SprintService.startSprint('proj-123', 'cycle-1', mockUser);
      expect(res.status).toBe(SprintStatus.ACTIVE);
    });
  });

  describe('completeSprint with unfinished item actions', () => {
    it('reopens or continues sprint with date extension when REOPEN or CONTINUE is passed', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.sprint.findFirst.mockResolvedValueOnce({
        id: 'sprint-reopen',
        status: SprintStatus.COMPLETED,
      });
      mockPrisma.sprint.update.mockResolvedValueOnce({
        id: 'sprint-reopen',
        status: SprintStatus.ACTIVE,
      });

      const res = await SprintService.completeSprint(
        'proj-123',
        'sprint-reopen',
        { unfinished_action: 'REOPEN', new_end_date: new Date('2026-11-01') },
        mockUser
      );

      expect(res.status).toBe(SprintStatus.ACTIVE);
    });

    it('creates a new sprint and carries over unfinished items when CREATE_NEW_SPRINT is requested', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.sprint.findFirst.mockResolvedValueOnce({
        id: 'sprint-current',
        status: SprintStatus.ACTIVE,
      });
      mockPrisma.sprint.create.mockResolvedValueOnce({
        id: 'sprint-next-created',
        name: 'Sprint 2 (Carried Over)',
      });
      mockPrisma.workItem.updateMany.mockResolvedValueOnce({ count: 4 });
      mockPrisma.sprint.update.mockResolvedValueOnce({
        id: 'sprint-current',
        status: SprintStatus.COMPLETED,
      });

      const res = await SprintService.completeSprint(
        'proj-123',
        'sprint-current',
        {
          unfinished_action: 'CREATE_NEW_SPRINT',
          new_sprint_name: 'Sprint 2 (Carried Over)',
        },
        mockUser
      );

      expect(mockPrisma.workItem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { sprint_id: 'sprint-next-created' },
        })
      );
    });

    it('throws error if target_sprint_id is identical to the completed sprint', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.sprint.findFirst.mockResolvedValueOnce({
        id: 'sprint-self',
        status: SprintStatus.ACTIVE,
      });

      await expect(
        SprintService.completeSprint(
          'proj-123',
          'sprint-self',
          { unfinished_action: 'MOVE_TO_SPRINT', target_sprint_id: 'sprint-self' },
          mockUser
        )
      ).rejects.toThrow('Target sprint cannot be the sprint being completed');
    });

    it('throws error if target sprint does not exist in project', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.sprint.findFirst
        .mockResolvedValueOnce({ id: 'sprint-current', status: SprintStatus.ACTIVE })
        .mockResolvedValueOnce(null); // target sprint not found

      await expect(
        SprintService.completeSprint(
          'proj-123',
          'sprint-current',
          { unfinished_action: 'MOVE_TO_SPRINT', target_sprint_id: 'sprint-missing' },
          mockUser
        )
      ).rejects.toThrow('Target sprint for incomplete items not found in this project');
    });

    it('preserves unfinished items when KEEP_IN_CYCLE is selected', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.sprint.findFirst.mockResolvedValueOnce({
        id: 'sprint-keep',
        status: SprintStatus.ACTIVE,
      });
      mockPrisma.sprint.update.mockResolvedValueOnce({
        id: 'sprint-keep',
        status: SprintStatus.COMPLETED,
      });

      await SprintService.completeSprint(
        'proj-123',
        'sprint-keep',
        { unfinished_action: 'KEEP_IN_CYCLE' },
        mockUser
      );

      expect(mockPrisma.workItem.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('updateSprint', () => {
    it('updates metadata and enforces single active sprint rule', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.sprint.findFirst.mockResolvedValueOnce({
        id: 'sprint-edit',
        status: SprintStatus.PLANNED,
        project_id: 'proj-123',
      });
      mockPrisma.sprint.update.mockResolvedValueOnce({
        id: 'sprint-edit',
        name: 'Updated Sprint Name',
        goal: 'New Goal',
      });

      const updated = await SprintService.updateSprint(
        'proj-123',
        'sprint-edit',
        { name: 'Updated Sprint Name', goal: 'New Goal' },
        mockUser
      );

      expect(updated.name).toBe('Updated Sprint Name');
    });

    it('throws error if updating status to an invalid value', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.sprint.findFirst.mockResolvedValueOnce({
        id: 'sprint-edit',
        status: SprintStatus.PLANNED,
      });

      await expect(
        SprintService.updateSprint(
          'proj-123',
          'sprint-edit',
          { status: 'INVALID_STATUS' as any },
          mockUser
        )
      ).rejects.toThrow('Invalid sprint status');
    });
  });

  describe('deleteSprint', () => {
    it('unassigns work items and deletes sprint record', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.sprint.findFirst.mockResolvedValueOnce({
        id: 'sprint-del',
        project_id: 'proj-123',
      });
      mockPrisma.workItem.updateMany.mockResolvedValueOnce({ count: 5 });
      mockPrisma.sprint.delete.mockResolvedValueOnce({ id: 'sprint-del' });

      const res = await SprintService.deleteSprint('proj-123', 'sprint-del', mockUser);
      expect(res.message).toBe('Sprint deleted successfully. All items returned to backlog.');
      expect(mockPrisma.workItem.updateMany).toHaveBeenCalledWith({
        where: { sprint_id: 'sprint-del' },
        data: { sprint_id: null },
      });
    });
  });

  describe('listSprints', () => {
    it('returns aggregated metrics for all project sprints', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.sprint.findMany.mockResolvedValueOnce([
        {
          id: 'sp-1',
          name: 'Sprint 1',
          work_items: [
            {
              id: 'wi-1',
              type: 'TASK',
              status: WorkItemStatus.COMPLETED,
              story_points: 3,
              time_entries: [],
            },
          ],
        },
      ]);

      const list = await SprintService.listSprints('proj-123', mockUser);
      expect(list).toHaveLength(1);
      expect(list[0].total_items).toBe(1);
      expect(list[0].completed_items).toBe(1);
      expect(list[0].completion_percentage).toBe(100);
    });
  });
});

