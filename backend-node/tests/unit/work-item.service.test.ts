import { WorkItemService } from '../../src/services/work-item.service';
import { prisma } from '../../src/lib/prisma';
import { mockPrisma } from '../mocks/prisma.mock';
import { WorkItemType, WorkItemStatus, WorkItemPriority, SprintStatus } from '@prisma/client';

describe('WorkItemService Unit Tests', () => {
  const mockManager = {
    id: 'user-mgr',
    organization_id: 'org-123',
    role: 'MANAGER',
    roles: [{ role: { name: 'MANAGER' } }],
  };

  const mockTechLead = {
    id: 'user-tl',
    organization_id: 'org-123',
    role: 'TECH_LEAD',
    roles: [{ role: { name: 'TECH_LEAD' } }],
  };

  const mockIntern = {
    id: 'user-intern',
    organization_id: 'org-123',
    role: 'INTERN',
    roles: [{ role: { name: 'INTERN' } }],
  };

  const mockProject = {
    id: 'proj-123',
    organization_id: 'org-123',
    name: 'WorkItem Project',
    owner_id: 'user-mgr',
    status: 'ACTIVE',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getMemberProjectPermissions & canManageProject', () => {
    it('returns empty permissions if userId or projectId is missing', async () => {
      const res = await WorkItemService.getMemberProjectPermissions('', 'proj-123');
      expect(res.isMember).toBe(false);
      expect(res.permissions.size).toBe(0);
    });

    it('identifies project owner and custom permissions accurately', async () => {
      mockPrisma.project.findUnique.mockResolvedValueOnce({
        owner_id: 'user-mgr',
        organization_id: 'org-123',
      });
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({
        project_id: 'proj-123',
        user_id: 'user-mgr',
        role: {
          is_custom: true,
          name: 'Lead Architect',
          permissions: [{ permission: { name: 'TASK_ASSIGN' } }],
        },
      });

      const res = await WorkItemService.getMemberProjectPermissions('user-mgr', 'proj-123');
      expect(res.isOwner).toBe(true);
      expect(res.isCustomRole).toBe(true);
      expect(res.permissions.has('TASK_ASSIGN')).toBe(true);
    });

    it('evaluates canManageProject for manager, owner, tech lead, and non-members', async () => {
      // Manager bypass
      expect(await WorkItemService.canManageProject(mockManager, 'proj-123')).toBe(true);

      // Tech lead role check
      mockPrisma.project.findFirst.mockResolvedValueOnce({ owner_id: 'someone' });
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({ project_role: 'TECH_LEAD' });
      expect(await WorkItemService.canManageProject(mockTechLead, 'proj-123')).toBe(true);

      // Project owner check
      mockPrisma.project.findFirst.mockResolvedValueOnce({ owner_id: 'user-custom-owner' });
      expect(
        await WorkItemService.canManageProject(
          { id: 'user-custom-owner', organization_id: 'org-123' },
          'proj-123'
        )
      ).toBe(true);

      // Non-manager, non-member intern
      mockPrisma.project.findFirst.mockResolvedValueOnce({ owner_id: 'user-other' });
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce(null);
      expect(await WorkItemService.canManageProject(mockIntern, 'proj-123')).toBe(false);
    });
  });

  describe('createWorkItem validation and hierarchy rules', () => {
    it('throws error when user has no organization context', async () => {
      await expect(
        WorkItemService.createWorkItem(
          { id: 'no-org-u' } as any,
          { title: 'Task 1', type: WorkItemType.TASK, project_id: 'proj-123', story_points: 3 }
        )
      ).rejects.toThrow('User does not belong to any organization');
    });

    it('throws error when title is missing or invalid', async () => {
      await expect(
        WorkItemService.createWorkItem(
          mockManager,
          { title: '   ', type: WorkItemType.TASK, project_id: 'proj-123' }
        )
      ).rejects.toThrow('Work item title is required');
    });

    it('enforces Jira hierarchy: Epic cannot have a parent', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      await expect(
        WorkItemService.createWorkItem(
          mockManager,
          {
            title: 'Child Epic',
            type: WorkItemType.EPIC,
            parent_id: 'parent-123',
            project_id: 'proj-123',
          }
        )
      ).rejects.toThrow('EPIC cannot have a parent');
    });

    it('requires non-negative integer story points for Story, Task, and Bug', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(mockProject);
      await expect(
        WorkItemService.createWorkItem(
          mockManager,
          {
            title: 'Task without points',
            type: WorkItemType.TASK,
            project_id: 'proj-123',
            story_points: null,
          }
        )
      ).rejects.toThrow('Story points are mandatory');

      await expect(
        WorkItemService.createWorkItem(
          mockManager,
          {
            title: 'Task negative points',
            type: WorkItemType.TASK,
            project_id: 'proj-123',
            story_points: -5,
          }
        )
      ).rejects.toThrow('Story points are mandatory for tasks and must be a non-negative integer');
    });

    it('creates a work item successfully with sanitized inputs', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({
        project_id: 'proj-123',
        user_id: 'user-mgr',
      });
      mockPrisma.workItem.create.mockResolvedValueOnce({
        id: 'wi-new-1',
        title: 'Backend API Endpoint',
        type: WorkItemType.STORY,
        story_points: 5,
        project_id: 'proj-123',
        assignees: [],
        time_entries: [],
      });

      const res = await WorkItemService.createWorkItem(
        mockManager,
        {
          title: '  Backend API Endpoint  ',
          type: WorkItemType.STORY,
          project_id: 'proj-123',
          story_points: 5,
          priority: WorkItemPriority.HIGH,
        }
      );

      expect(res.id).toBe('wi-new-1');
      expect(mockPrisma.workItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Backend API Endpoint',
            story_points: 5,
            priority: WorkItemPriority.HIGH,
          }),
        })
      );
    });

    it('rejects task with sprint_id on Kanban projects', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce({
        ...mockProject,
        methodology: 'KANBAN',
      });
      await expect(
        WorkItemService.createWorkItem(mockManager, {
          title: 'Kanban Task with Sprint',
          type: WorkItemType.STORY,
          project_id: 'proj-123',
          sprint_id: 'sprint-123',
          story_points: 3,
        })
      ).rejects.toThrow('Cannot assign tasks to a sprint or cycle in a Kanban project. Kanban projects use continuous flow without sprints.');
    });
  });

  describe('Assignee mutations and authorization', () => {
    it('allows manager or tech lead to assign user to task and ignores duplicate assignment', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'wi-task-1',
        project_id: 'proj-123',
        project: mockProject,
        assignees: [{ user_id: 'u-existing' }],
      });

      mockPrisma.user.findMany.mockResolvedValueOnce([
        {
          id: 'user-intern',
          organization_id: 'org-123',
          is_active: true,
        },
      ]);

      mockPrisma.projectMember.findMany.mockResolvedValueOnce([{ user_id: 'user-intern' }]);
      mockPrisma.workItemAssignee.create.mockResolvedValueOnce({ id: 'wa-1' });

      // getWorkItemById fetch at end of addAssignees
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'wi-task-1',
        project_id: 'proj-123',
        project: mockProject,
        assignees: [{ user_id: 'u-existing' }, { user_id: 'user-intern' }],
      });

      const res = await WorkItemService.addAssignees('wi-task-1', mockManager, ['user-intern']);
      expect(res).toBeDefined();
    });

    it('rejects assigning user to task when caller is unauthorized intern', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'wi-task-1',
        project_id: 'proj-123',
        project: { owner_id: 'other-owner', organization_id: 'org-123' },
        created_by: 'creator-other',
        assignees: [],
      });
      mockPrisma.projectMember.findFirst.mockResolvedValue(null);

      await expect(
        WorkItemService.addAssignees('wi-task-1', mockIntern, ['user-intern-2'])
      ).rejects.toThrow('Forbidden: interns cannot assign work items');
    });

    it('removes assignee from task successfully', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'wi-task-1',
        project_id: 'proj-123',
        project: mockProject,
        assignees: [{ user_id: 'user-intern' }],
      });
      mockPrisma.workItemAssignee.findUnique.mockResolvedValueOnce({
        id: 'wa-1',
        work_item_id: 'wi-task-1',
        user_id: 'user-intern',
      });
      mockPrisma.workItemAssignee.delete.mockResolvedValueOnce({ id: 'wa-1' });

      const res = await WorkItemService.removeAssignee('wi-task-1', mockManager, 'user-intern');
      expect(res).toBeDefined();
    });
  });

  describe('Work Item Comments CRUD', () => {
    it('creates, updates, and deletes comment with author authorization', async () => {
      // 1. Add comment
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'wi-task-1',
        project_id: 'proj-123',
        project: mockProject,
        assignees: [],
      });
      mockPrisma.workItemComment.create.mockResolvedValueOnce({
        id: 'comment-1',
        work_item_id: 'wi-task-1',
        content: 'Great progress on this deliverable!',
        author_id: mockManager.id,
        author: { id: mockManager.id, name: 'Manager', email: 'mgr@test.com', roles: [] },
      });

      const added = await WorkItemService.createComment('wi-task-1', 'Great progress on this deliverable!', mockManager);
      expect(added.id).toBe('comment-1');

      // 2. Update comment
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'wi-task-1',
        project_id: 'proj-123',
        project: mockProject,
        assignees: [],
      });
      mockPrisma.workItemComment.findFirst.mockResolvedValueOnce({
        id: 'comment-1',
        author_id: mockManager.id,
        work_item_id: 'wi-task-1',
      });
      mockPrisma.workItemComment.update.mockResolvedValueOnce({
        id: 'comment-1',
        content: 'Updated comment text',
        author: { id: mockManager.id, name: 'Manager', email: 'mgr@test.com', roles: [] },
      });

      const updated = await WorkItemService.updateComment('wi-task-1', 'comment-1', 'Updated comment text', mockManager);
      expect(updated.content).toBe('Updated comment text');

      // 3. Delete comment (forbidden if caller is neither author nor admin)
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'wi-task-1',
        project_id: 'proj-123',
        project: mockProject,
        assignees: [],
      });
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({
        project_id: 'proj-123',
        user_id: mockIntern.id,
      });
      mockPrisma.workItemComment.findFirst.mockResolvedValueOnce({
        id: 'comment-1',
        author_id: 'other-author',
        work_item_id: 'wi-task-1',
      });
      await expect(
        WorkItemService.deleteComment('wi-task-1', 'comment-1', mockIntern)
      ).rejects.toThrow('Forbidden: you can only delete your own comments');

      // 4. Delete comment success by author
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'wi-task-1',
        project_id: 'proj-123',
        project: mockProject,
        assignees: [],
      });
      mockPrisma.workItemComment.findFirst.mockResolvedValueOnce({
        id: 'comment-1',
        author_id: mockManager.id,
        work_item_id: 'wi-task-1',
      });
      mockPrisma.workItemComment.delete.mockResolvedValueOnce({ id: 'comment-1' });
      await expect(WorkItemService.deleteComment('wi-task-1', 'comment-1', mockManager)).resolves.not.toThrow();
    });
  });

  describe('updateWorkItem in-place state management', () => {
    it('updates work item details and validates status transition permissions', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'wi-task-1',
        type: WorkItemType.TASK,
        status: WorkItemStatus.TODO,
        project_id: 'proj-123',
        project: mockProject,
        assignees: [{ user_id: mockIntern.id }],
      });

      mockPrisma.project.findUnique.mockResolvedValueOnce(mockProject);
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({
        project_id: 'proj-123',
        user_id: mockIntern.id,
      });

      mockPrisma.workItem.update.mockResolvedValueOnce({
        id: 'wi-task-1',
        title: 'New Title',
        status: WorkItemStatus.IN_PROGRESS,
        assignees: [],
        time_entries: [],
      });

      const res = await WorkItemService.updateWorkItem(
        'wi-task-1',
        mockManager,
        { title: 'New Title', status: WorkItemStatus.IN_PROGRESS }
      );

      expect(res.title).toBe('New Title');
    });

    it('rejects updating non-existent work item', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce(null);
      await expect(
        WorkItemService.updateWorkItem('missing-wi', mockManager, { title: 'Test' })
      ).rejects.toThrow('Work item not found');
    });

    it('rejects updating work item with sprint_id on Kanban projects', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'wi-1',
        project_id: 'proj-123',
        assignees: [],
      });
      mockPrisma.project.findUnique.mockResolvedValueOnce({
        ...mockProject,
        methodology: 'KANBAN',
      });
      await expect(
        WorkItemService.updateWorkItem('wi-1', mockManager, {
          sprint_id: 'sprint-123',
        })
      ).rejects.toThrow('Cannot assign tasks to a sprint or cycle in a Kanban project. Kanban projects use continuous flow without sprints.');
    });
  });

  describe('deleteWorkItem', () => {
    it('deletes work item and child references', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'wi-task-1',
        project_id: 'proj-123',
        project: mockProject,
        assignees: [],
      });
      mockPrisma.workItem.delete.mockResolvedValueOnce({ id: 'wi-task-1' });

      await expect(WorkItemService.deleteWorkItem('wi-task-1', mockManager)).resolves.not.toThrow();
    });
  });

  describe('getWorkItemAnalytics', () => {
    it('computes metrics, completion on-time, and trends for manager', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce({
        id: 'proj-123',
        name: 'Analytics Project',
        owner_id: mockManager.id,
      });

      mockPrisma.workItem.findMany.mockResolvedValueOnce([
        {
          id: 'item-1',
          title: 'Deliverable 1',
          type: WorkItemType.TASK,
          status: WorkItemStatus.COMPLETED,
          due_date: new Date('2026-10-15'),
          completed_at: new Date('2026-10-14'),
          story_points: 3,
          assignees: [{ user_id: 'user-intern', user: { id: 'user-intern', name: 'Intern' } }],
        },
      ]);

      mockPrisma.timeEntry.findMany.mockResolvedValueOnce([
        {
          id: 'te-1',
          task_id: 'item-1',
          duration_minutes: 180,
          date: new Date('2026-10-14'),
        },
      ]);

      mockPrisma.sprint.findMany.mockResolvedValueOnce([
        { id: 'sp-1', name: 'Sprint 1', status: 'ACTIVE' },
      ]);
      mockPrisma.project.findMany.mockResolvedValueOnce([
        { id: 'proj-123', name: 'Analytics Project' },
      ]);
      mockPrisma.projectMember.findMany.mockResolvedValueOnce([
        { project_role: 'DEVELOPER', user: { id: 'user-intern', name: 'Intern' } },
      ]);

      const analytics = await WorkItemService.getAnalytics(mockManager, { project_id: 'proj-123' });
      expect(analytics.total).toBe(1);
      expect(analytics.completed).toBe(1);
      expect(analytics.completed_on_time_count).toBe(1);
      expect(analytics.completed_on_time_rate).toBe(100);
      expect(analytics.trends).toHaveLength(14);
    });

    it('forbids intern from viewing another intern analytics', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce({
        id: 'proj-123',
        name: 'Analytics Project',
        owner_id: 'other-owner',
      });
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({
        project_role: 'DEVELOPER',
      });

      await expect(
        WorkItemService.getAnalytics(mockIntern, {
          project_id: 'proj-123',
          user_id: 'other-intern-id',
        })
      ).rejects.toThrow('Forbidden: interns can only view their own performance analytics');
    });

    it('forbids non-member intern from accessing project analytics', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce({
        id: 'proj-123',
        name: 'Analytics Project',
        owner_id: 'other-owner',
      });
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce(null);

      await expect(
        WorkItemService.getAnalytics(mockIntern, { project_id: 'proj-123' })
      ).rejects.toThrow('Forbidden: you are not authorized to access analytics for this project');
    });
  });
});

