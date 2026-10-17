import { ProjectHealthService, BLOCKED_RISK_THRESHOLDS } from '../../src/services/project-health.service';
import { prisma } from '../../src/lib/prisma';
import { mockPrisma } from '../mocks/prisma.mock';
import { WorkItemType, WorkItemStatus, WorkItemPriority } from '@prisma/client';

describe('ProjectHealthService Unit Tests', () => {
  const mockUser = {
    id: 'user-manager',
    organization_id: 'org-health',
    role: 'MANAGER',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('classifyProjectHealth', () => {
    it('classifies projects without work items or story points as NOT_ASSESSED', () => {
      const empty = ProjectHealthService.classifyProjectHealth({
        id: 'p-empty',
        name: 'Empty Project',
        status: 'ACTIVE',
        work_items: [],
      });
      expect(empty.health).toBe('NOT_ASSESSED');
      expect(empty.has_estimated_work).toBe(false);
      expect(empty.reasons).toContain('No estimated work defined for this project');

      const unestimated = ProjectHealthService.classifyProjectHealth({
        id: 'p-unest',
        name: 'Unestimated Project',
        status: 'ACTIVE',
        work_items: [
          {
            id: 'wi-1',
            type: WorkItemType.TASK,
            status: WorkItemStatus.TODO,
            priority: WorkItemPriority.MEDIUM,
            story_points: 0,
          },
        ],
      });
      expect(unestimated.health).toBe('NOT_ASSESSED');
      expect(unestimated.has_estimated_work).toBe(false);
    });

    it('classifies project as CRITICAL when past due by more than 7 days', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);

      const res = ProjectHealthService.classifyProjectHealth({
        id: 'p-crit-overdue',
        name: 'Critically Overdue Project',
        status: 'ACTIVE',
        end_date: pastDate,
        work_items: [
          {
            id: 'wi-1',
            type: WorkItemType.TASK,
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.HIGH,
            story_points: 5,
          },
        ],
      });

      expect(res.health).toBe('CRITICAL');
      expect(res.project_overdue_days).toBeGreaterThanOrEqual(10);
    });

    it('classifies project as CRITICAL when blocked work is >= 50% of remaining points', () => {
      const res = ProjectHealthService.classifyProjectHealth({
        id: 'p-crit-blocked',
        name: 'Blocked Project',
        status: 'ACTIVE',
        work_items: [
          {
            id: 'wi-blocked',
            type: WorkItemType.TASK,
            status: WorkItemStatus.BLOCKED,
            priority: WorkItemPriority.HIGH,
            story_points: 10,
          },
          {
            id: 'wi-todo',
            type: WorkItemType.TASK,
            status: WorkItemStatus.TODO,
            priority: WorkItemPriority.MEDIUM,
            story_points: 5,
          },
        ],
      });

      expect(res.health).toBe('CRITICAL');
      expect(res.blocked_work_percentage).toBeGreaterThanOrEqual(50);
    });

    it('classifies project as AT_RISK when blocked work is between 25% and 50%', () => {
      const res = ProjectHealthService.classifyProjectHealth({
        id: 'p-risk-blocked',
        name: 'Moderate Blocked Project',
        status: 'ACTIVE',
        work_items: [
          {
            id: 'wi-blocked',
            type: WorkItemType.TASK,
            status: WorkItemStatus.BLOCKED,
            priority: WorkItemPriority.MEDIUM,
            story_points: 3,
          },
          {
            id: 'wi-todo',
            type: WorkItemType.TASK,
            status: WorkItemStatus.TODO,
            priority: WorkItemPriority.MEDIUM,
            story_points: 7,
          },
        ],
      });

      expect(res.health).toBe('AT_RISK');
      expect(res.blocked_work_percentage).toBe(30);
    });

    it('classifies project as HEALTHY when on track with low or zero blocker exposure', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const res = ProjectHealthService.classifyProjectHealth({
        id: 'p-healthy',
        name: 'Healthy Project',
        status: 'ACTIVE',
        end_date: futureDate,
        work_items: [
          {
            id: 'wi-1',
            type: WorkItemType.TASK,
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.MEDIUM,
            story_points: 5,
          },
          {
            id: 'wi-2',
            type: WorkItemType.TASK,
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.MEDIUM,
            story_points: 5,
          },
        ],
      });

      expect(res.health).toBe('HEALTHY');
      expect(res.reasons[0]).toContain('On schedule');
      expect(res.progress_percentage).toBe(50);
    });

    it('classifies project as HEALTHY when all deliverables are completed', () => {
      const res = ProjectHealthService.classifyProjectHealth({
        id: 'p-done',
        name: 'Done Project',
        status: 'ACTIVE',
        work_items: [
          {
            id: 'wi-1',
            type: WorkItemType.TASK,
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.MEDIUM,
            story_points: 8,
          },
        ],
      });

      expect(res.health).toBe('HEALTHY');
      expect(res.reasons[0]).toBe('All deliverables completed');
      expect(res.progress_percentage).toBe(100);
    });
  });

  describe('getPortfolioHealth', () => {
    it('returns empty portfolio response when user has no effective organization', async () => {
      mockPrisma.organization.findFirst.mockResolvedValueOnce(null);
      const res = await ProjectHealthService.getPortfolioHealth({ id: 'u-no-org' });

      expect(res.summary.total).toBe(0);
      expect(res.projects).toEqual([]);
    });

    it('aggregates portfolio metrics across organization projects with cohort filter', async () => {
      mockPrisma.project.findMany.mockResolvedValueOnce([
        {
          id: 'p-1',
          name: 'Project One',
          status: 'ACTIVE',
          work_items: [
            {
              id: 'wi-1',
              type: WorkItemType.TASK,
              status: WorkItemStatus.COMPLETED,
              priority: WorkItemPriority.MEDIUM,
              story_points: 5,
            },
          ],
          sprints: [],
        },
        {
          id: 'p-2',
          name: 'Project Two',
          status: 'ARCHIVED',
          work_items: [],
          sprints: [],
        },
      ]);

      const res = await ProjectHealthService.getPortfolioHealth(mockUser, { cohort_id: 'cohort-123' });
      expect(res.summary.total).toBe(2);
      expect(res.summary.healthy).toBe(1);
      expect(res.summary.not_assessed).toBe(1);
      expect(res.distribution.healthy.count).toBe(1);
      expect(res.distribution.healthy.percentage).toBe(100);
      expect(res.distribution.not_assessed.percentage).toBe(50);
      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organization_id: 'org-health',
            members: {
              some: {
                user: {
                  cohort_id: 'cohort-123',
                },
              },
            },
          }),
        })
      );
    });
  });
});
