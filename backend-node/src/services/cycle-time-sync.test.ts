import { SprintService } from './sprint.service';
import { cacheService } from './cache.service';
import { mockPrisma } from '../../tests/mocks/prisma.mock';
import { SprintStatus, WorkItemStatus, WorkItemType } from '@prisma/client';

describe('Cycle Time Tracking & Synchronization Unit Tests', () => {
  const mockUser = {
    id: 'user-manager-1',
    name: 'Manager User',
    organization_id: 'org-test-1',
    role: 'MANAGER',
    roles: [{ role: { name: 'MANAGER' } }],
  };

  const createMockProject = (id: string) => ({
    id,
    name: `Sync Project ${id}`,
    organization_id: 'org-test-1',
    status: 'ACTIVE',
    methodology: 'SCRUM',
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await cacheService.invalidatePattern('project:');
  });

  it('calculates initial cycle time as 0 hours when planning cycle has tasks with zero logged time', async () => {
    const projectId = 'proj-cycle-1';
    mockPrisma.project.findFirst.mockResolvedValueOnce(createMockProject(projectId));
    mockPrisma.sprint.findMany.mockResolvedValueOnce([
      {
        id: 'cycle-1',
        name: 'Planning Cycle 1',
        project_id: projectId,
        status: SprintStatus.PLANNED,
        start_date: new Date('2026-10-01'),
        end_date: new Date('2026-10-15'),
        work_items: [
          {
            id: 'task-1',
            type: WorkItemType.STORY,
            status: WorkItemStatus.TODO,
            story_points: 3,
            time_entries: [],
          },
        ],
      },
    ]);

    const sprints = await SprintService.listSprints(projectId, mockUser);
    expect(sprints).toHaveLength(1);
    expect(sprints[0].total_logged_minutes).toBe(0);
    expect(sprints[0].total_logged_hours).toBe(0);
    expect(sprints[0].time_by_intern).toEqual([]);
  });

  it('aggregates multiple time entries on tasks into cycle total logged minutes and hours', async () => {
    const projectId = 'proj-cycle-2';
    mockPrisma.project.findFirst.mockResolvedValueOnce(createMockProject(projectId));
    mockPrisma.sprint.findMany.mockResolvedValueOnce([
      {
        id: 'cycle-2',
        name: 'Planning Cycle 2',
        project_id: projectId,
        status: SprintStatus.ACTIVE,
        start_date: new Date('2026-10-01'),
        end_date: new Date('2026-10-15'),
        work_items: [
          {
            id: 'task-1',
            type: WorkItemType.STORY,
            status: WorkItemStatus.IN_PROGRESS,
            story_points: 3,
            time_entries: [
              {
                id: 'te-1',
                duration_minutes: 90,
                user_id: 'intern-1',
                user: { id: 'intern-1', name: 'Intern Alice' },
                date: new Date('2026-10-05'),
              },
              {
                id: 'te-2',
                duration_minutes: 60,
                user_id: 'intern-1',
                user: { id: 'intern-1', name: 'Intern Alice' },
                date: new Date('2026-10-06'),
              },
            ],
          },
          {
            id: 'task-2',
            type: WorkItemType.TASK,
            status: WorkItemStatus.TODO,
            story_points: 2,
            time_entries: [],
          },
        ],
      },
    ]);

    const sprints = await SprintService.listSprints(projectId, mockUser);
    expect(sprints).toHaveLength(1);
    expect(sprints[0].total_logged_minutes).toBe(150);
    expect(sprints[0].total_logged_hours).toBe(2.5);
    expect(sprints[0].time_by_intern).toEqual([
      expect.objectContaining({
        user_id: 'intern-1',
        name: 'Intern Alice',
        logged_minutes: 150,
      }),
    ]);
  });

  it('reflects cycle reassignment when a work item is moved to another sprint', async () => {
    const projectId = 'proj-cycle-3';
    mockPrisma.project.findFirst.mockResolvedValueOnce(createMockProject(projectId));
    mockPrisma.sprint.findMany.mockResolvedValueOnce([
      {
        id: 'cycle-3a',
        name: 'Planning Cycle 3A',
        project_id: projectId,
        status: SprintStatus.ACTIVE,
        start_date: new Date('2026-10-01'),
        end_date: new Date('2026-10-15'),
        work_items: [], // Task was moved out to cycle-3b
      },
      {
        id: 'cycle-3b',
        name: 'Planning Cycle 3B',
        project_id: projectId,
        status: SprintStatus.PLANNED,
        start_date: new Date('2026-10-16'),
        end_date: new Date('2026-10-30'),
        work_items: [
          {
            id: 'task-1',
            type: WorkItemType.STORY,
            status: WorkItemStatus.IN_PROGRESS,
            story_points: 3,
            time_entries: [
              {
                id: 'te-1',
                duration_minutes: 150,
                user_id: 'intern-1',
                user: { id: 'intern-1', name: 'Intern Alice' },
                date: new Date('2026-10-18'),
              },
            ],
          },
        ],
      },
    ]);

    const sprints = await SprintService.listSprints(projectId, mockUser);
    expect(sprints).toHaveLength(2);
    expect(sprints[0].id).toBe('cycle-3a');
    expect(sprints[0].total_logged_minutes).toBe(0);
    expect(sprints[1].id).toBe('cycle-3b');
    expect(sprints[1].total_logged_minutes).toBe(150);
    expect(sprints[1].total_logged_hours).toBe(2.5);
  });
});
