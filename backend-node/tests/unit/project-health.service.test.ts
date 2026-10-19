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
      expect(res.health_score).toBe(100);
      expect(res.risk_level).toBe('LOW');
      expect(res.schedule_health).toBe('ON_TRACK');
    });

    it('calculates score and sets NEEDS_ATTENTION with MODERATE risk for moderate blockers/lag', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 20);

      const res = ProjectHealthService.classifyProjectHealth({
        id: 'p-attn',
        name: 'Needs Attention Project',
        status: 'ACTIVE',
        end_date: futureDate,
        work_items: [
          {
            id: 'wi-1',
            type: WorkItemType.TASK,
            status: WorkItemStatus.BLOCKED,
            priority: WorkItemPriority.MEDIUM,
            story_points: 3,
          },
          {
            id: 'wi-2',
            type: WorkItemType.TASK,
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.MEDIUM,
            story_points: 7,
          },
          {
            id: 'wi-3',
            type: WorkItemType.TASK,
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.MEDIUM,
            story_points: 5,
          },
        ],
      });

      // 3 of 10 remaining SP blocked = 30% blocked
      expect(['NEEDS_ATTENTION', 'AT_RISK']).toContain(res.health);
      expect(res.health_score).toBeGreaterThanOrEqual(35);
      expect(res.health_score).toBeLessThanOrEqual(74);
      expect(['MODERATE', 'HIGH']).toContain(res.risk_level);
      expect(res.recommended_actions.length).toBeGreaterThan(0);
      expect(res.recommended_actions[0]).toContain('blocked deliverable');
    });

    it('classifies project with no schedule dates or tasks as INSUFFICIENT_DATA', () => {
      const res = ProjectHealthService.classifyProjectHealth({
        id: 'p-no-sched',
        name: 'No Schedule Project',
        status: 'ACTIVE',
        work_items: [],
      });

      expect(['NOT_ASSESSED', 'INSUFFICIENT_DATA']).toContain(res.health);
      expect(res.health_score).toBeNull();
      expect(res.risk_level).toBe('INSUFFICIENT_DATA');
      expect(res.schedule_health).toBe('NO_SCHEDULE');
      expect(res.recommended_actions[0]).toContain('Define project tasks');
    });

    it('evaluates schedule variance when dates are available', () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30); // started 30 days ago
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 10); // ends in 10 days (total 40 days, ~75% elapsed)

      const res = ProjectHealthService.classifyProjectHealth({
        id: 'p-variance',
        name: 'Variance Project',
        status: 'ACTIVE',
        start_date: startDate,
        end_date: endDate,
        work_items: [
          {
            id: 'wi-1',
            type: WorkItemType.TASK,
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.MEDIUM,
            story_points: 1,
          },
          {
            id: 'wi-2',
            type: WorkItemType.TASK,
            status: WorkItemStatus.TODO,
            priority: WorkItemPriority.MEDIUM,
            story_points: 9,
          },
        ],
      });

      // 1 of 10 SP completed = 10% progress vs ~75% elapsed time -> Behind schedule
      expect(res.schedule_health).toBe('BEHIND');
      expect(res.schedule_variance_percentage).toBeLessThan(-15);
      expect(res.reasons.length).toBeGreaterThan(0);
      expect(res.risk_factors.length).toBeGreaterThan(0);
    });

    it('accurately computes story points delivery metrics and camelCase aliases', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 3);

      const res = ProjectHealthService.classifyProjectHealth({
        id: 'p-sp-test',
        name: 'SP Test Project',
        status: 'ACTIVE',
        work_items: [
          {
            id: 't-comp',
            type: WorkItemType.TASK,
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.HIGH,
            story_points: 9,
          },
          {
            id: 't-overdue',
            type: WorkItemType.TASK,
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.HIGH,
            due_date: pastDate,
            story_points: 6,
          },
          {
            id: 't-blocked',
            type: WorkItemType.TASK,
            status: WorkItemStatus.BLOCKED,
            priority: WorkItemPriority.MEDIUM,
            story_points: 3,
          },
        ],
      });

      // Total SP = 9 + 6 + 3 = 18 SP
      expect(res.total_sp).toBe(18);
      expect(res.completed_sp).toBe(9);
      expect(res.remaining_sp).toBe(9);
      expect(res.delivery_progress_percentage).toBe(50);
      expect(res.overdue_sp).toBe(6);
      expect(res.overdue_sp_percentage).toBeCloseTo(33.3, 1);
      expect(res.blocked_sp).toBe(3);
      expect(res.blocked_sp_percentage).toBeCloseTo(16.7, 1);

      // Verify camelCase aliases
      expect(res.totalSP).toBe(res.total_sp);
      expect(res.completedSP).toBe(res.completed_sp);
      expect(res.remainingSP).toBe(res.remaining_sp);
      expect(res.deliveryProgressPercentage).toBe(res.delivery_progress_percentage);
      expect(res.overdueSP).toBe(res.overdue_sp);
      expect(res.overdueSPPercentage).toBe(res.overdue_sp_percentage);
      expect(res.blockedSP).toBe(res.blocked_sp);
      expect(res.blockedSPPercentage).toBe(res.blocked_sp_percentage);
    });

    it('does not classify as CRITICAL when a single small task is overdue in a large project', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 2);

      const res = ProjectHealthService.classifyProjectHealth({
        id: 'p-minor-overdue',
        name: 'Minor Overdue Project',
        status: 'ACTIVE',
        work_items: [
          {
            id: 't-done-1',
            type: WorkItemType.TASK,
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.MEDIUM,
            story_points: 30,
          },
          {
            id: 't-in-prog',
            type: WorkItemType.TASK,
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.MEDIUM,
            story_points: 18,
          },
          {
            id: 't-small-overdue',
            type: WorkItemType.TASK,
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.LOW,
            due_date: pastDate,
            story_points: 2,
          },
        ],
      });

      // Overdue SP is 2 out of 50 = 4% overdue work. Should NOT force project to CRITICAL!
      expect(res.health).not.toBe('CRITICAL');
      expect(res.overdue_sp).toBe(2);
      expect(res.overdue_sp_percentage).toBe(4);
      expect(res.overdue_tasks).toBe(1);
    });

    it('does not count completed tasks whose due dates have passed as overdue', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);

      const res = ProjectHealthService.classifyProjectHealth({
        id: 'p-completed-past-due',
        name: 'Completed Past Due Task Project',
        status: 'ACTIVE',
        work_items: [
          {
            id: 't-done',
            type: WorkItemType.TASK,
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.MEDIUM,
            due_date: pastDate,
            story_points: 8,
          },
        ],
      });

      expect(res.completed_sp).toBe(8);
      expect(res.remaining_sp).toBe(0);
      expect(res.overdue_tasks).toBe(0);
      expect(res.overdue_sp).toBe(0);
      expect(res.overdue_sp_percentage).toBe(0);
      expect(res.health).toBe('HEALTHY');
    });

    it('avoids double-counting story points between parent stories and leaf tasks', () => {
      const res = ProjectHealthService.classifyProjectHealth({
        id: 'p-hierarchy',
        name: 'Hierarchy Project',
        status: 'ACTIVE',
        work_items: [
          {
            id: 'story-1',
            type: WorkItemType.STORY,
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.HIGH,
            story_points: 10,
          },
          {
            id: 'task-1',
            parent_id: 'story-1',
            type: WorkItemType.TASK,
            status: WorkItemStatus.COMPLETED,
            priority: WorkItemPriority.MEDIUM,
            story_points: 5,
          },
          {
            id: 'task-2',
            parent_id: 'story-1',
            type: WorkItemType.TASK,
            status: WorkItemStatus.TODO,
            priority: WorkItemPriority.MEDIUM,
            story_points: 5,
          },
        ],
      });

      // Child tasks total 10 SP (5 done + 5 todo). Parent story should NOT be double-counted to 20 SP!
      expect(res.total_sp).toBe(10);
      expect(res.completed_sp).toBe(5);
      expect(res.remaining_sp).toBe(5);
      expect(res.delivery_progress_percentage).toBe(50);
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
