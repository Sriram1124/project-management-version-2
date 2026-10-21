import { WorkItemService } from '../../src/services/work-item.service';
import { mockPrisma, mockEntity } from '../mocks/prisma.mock';
import { WorkItemStatus, WorkItemPriority } from '@prisma/client';

describe('Intern Permissions & Status Transitions Unit Tests', () => {
  const internUser = {
    id: 'intern-user-1',
    name: 'Jane Intern',
    email: 'jane@example.com',
    organization_id: 'org-test-1',
    role: 'INTERN',
    roles: [{ role: { name: 'INTERN' } }],
  };

  const managerUser = {
    id: 'mgr-user-1',
    name: 'Bob Manager',
    email: 'bob@example.com',
    organization_id: 'org-test-1',
    role: 'MANAGER',
    roles: [{ role: { name: 'MANAGER' } }],
  };

  const assignedTask = {
    id: 'task-assigned-1',
    project_id: 'proj-1',
    organization_id: 'org-test-1',
    creator_id: 'mgr-user-1',
    title: 'Assigned Dev Task',
    status: WorkItemStatus.TODO,
    priority: WorkItemPriority.MEDIUM,
    story_points: 3,
    due_date: new Date('2026-11-01'),
    created_at: new Date(),
    updated_at: new Date(),
    assignees: [
      { user_id: 'intern-user-1', user: { id: 'intern-user-1', name: 'Jane Intern', email: 'jane@example.com' } },
    ],
    children: [],
    project: {
      id: 'proj-1',
      name: 'Test Project',
      owner_id: 'mgr-user-1',
      status: 'ACTIVE',
    },
    sprint: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockEntity('project', assignedTask.project);
    mockEntity('workItem', assignedTask);
    mockPrisma.projectMember.findFirst.mockResolvedValue({
      project_role: 'INTERN',
      permissions: new Set(['TASK_READ', 'TASK_UPDATE']),
    } as any);
    mockPrisma.projectMember.findMany.mockResolvedValue([]);
  });

  describe('Intern Status Persistence & Restrictions', () => {
    it('allows assigned intern to transition task to IN_PROGRESS', async () => {
      mockPrisma.workItem.update.mockResolvedValueOnce({
        ...assignedTask,
        status: WorkItemStatus.IN_PROGRESS,
      });

      const updated = await WorkItemService.updateWorkItem(
        'task-assigned-1',
        internUser,
        { status: WorkItemStatus.IN_PROGRESS }
      );

      expect(updated.status).toBe(WorkItemStatus.IN_PROGRESS);
      expect(mockPrisma.workItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task-assigned-1' },
          data: expect.objectContaining({ status: WorkItemStatus.IN_PROGRESS }),
        })
      );
    });

    it('allows assigned intern to transition task to IN_REVIEW or BLOCKED', async () => {
      mockPrisma.workItem.update.mockResolvedValueOnce({
        ...assignedTask,
        status: WorkItemStatus.IN_REVIEW,
      });

      const updated = await WorkItemService.updateWorkItem(
        'task-assigned-1',
        internUser,
        { status: WorkItemStatus.IN_REVIEW }
      );

      expect(updated.status).toBe(WorkItemStatus.IN_REVIEW);
    });

    it('rejects intern attempting to transition status to COMPLETED with Forbidden error', async () => {
      await expect(
        WorkItemService.updateWorkItem(
          'task-assigned-1',
          internUser,
          { status: WorkItemStatus.COMPLETED }
        )
      ).rejects.toThrow(/Forbidden: only managers and tech leads can mark tasks as completed/);
    });
  });

  describe('Intern Field Mutation Restrictions', () => {
    it('rejects intern attempting to modify priority', async () => {
      await expect(
        WorkItemService.updateWorkItem(
          'task-assigned-1',
          internUser,
          { priority: WorkItemPriority.URGENT }
        )
      ).rejects.toThrow(/Forbidden: interns cannot modify task priority/);
    });

    it('rejects intern attempting to reassign task', async () => {
      await expect(
        WorkItemService.updateWorkItem(
          'task-assigned-1',
          internUser,
          { assignee_ids: ['other-user-id'] }
        )
      ).rejects.toThrow(/Forbidden: interns cannot reassign tasks/);
    });

    it('rejects intern attempting to modify due date directly', async () => {
      await expect(
        WorkItemService.updateWorkItem(
          'task-assigned-1',
          internUser,
          { due_date: new Date('2026-12-01') }
        )
      ).rejects.toThrow(/Forbidden: interns cannot modify task due dates or schedules/);
    });

    it('rejects intern attempting to modify story points', async () => {
      await expect(
        WorkItemService.updateWorkItem(
          'task-assigned-1',
          internUser,
          { story_points: 10 }
        )
      ).rejects.toThrow(/Forbidden: interns cannot modify story points/);
    });

    it('rejects intern attempting to change sprint assignment', async () => {
      await expect(
        WorkItemService.updateWorkItem(
          'task-assigned-1',
          internUser,
          { sprint_id: 'sprint-2' }
        )
      ).rejects.toThrow(/Forbidden: interns cannot change sprint assignments/);
    });

    it('rejects intern attempting to alter epic / parent relationship', async () => {
      await expect(
        WorkItemService.updateWorkItem(
          'task-assigned-1',
          internUser,
          { parent_id: 'epic-2' }
        )
      ).rejects.toThrow(/Forbidden: interns cannot alter parent-child or epic assignments/);
    });

    it('rejects intern requesting extension on task assigned to another user', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        ...assignedTask,
        id: 'task-other-member',
        assignees: [{ user_id: 'tanvi-user-2' }],
        assignee_id: 'tanvi-user-2',
      });

      await expect(
        WorkItemService.requestExtension('task-other-member', internUser, {
          requested_due_date: '2026-11-15',
          reason: 'Need more time for testing',
        })
      ).rejects.toThrow(/Forbidden: interns can only apply for due-date extensions on tasks assigned to them/);
    });

    it('allows assigned intern to request extension on their own task', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce(assignedTask);
      mockPrisma.workItemExtensionRequest.findFirst.mockResolvedValueOnce(null);
      mockPrisma.workItemExtensionRequest.create.mockResolvedValueOnce({
        id: 'ext-req-1',
        task_id: 'task-assigned-1',
        requester_id: internUser.id,
        requested_due_date: new Date('2026-11-15'),
        reason: 'Need more time',
        status: 'PENDING',
      });

      const res = await WorkItemService.requestExtension('task-assigned-1', internUser, {
        requested_due_date: '2026-11-15',
        reason: 'Need more time',
      });
      expect(res).toBeDefined();
      expect(res.id).toBe('ext-req-1');
    });

    it('strictly forbids intern from deleting any work item', async () => {
      await expect(
        WorkItemService.deleteWorkItem('task-assigned-1', internUser)
      ).rejects.toThrow(/Forbidden: interns do not have permission to delete work items/);
    });
  });

  describe('Manager Permissions (Non-Intern)', () => {
    it('allows manager to mark task as COMPLETED', async () => {
      mockPrisma.workItem.update.mockResolvedValueOnce({
        ...assignedTask,
        status: WorkItemStatus.COMPLETED,
        completed_at: new Date(),
      });

      const updated = await WorkItemService.updateWorkItem(
        'task-assigned-1',
        managerUser,
        { status: WorkItemStatus.COMPLETED }
      );

      expect(updated.status).toBe(WorkItemStatus.COMPLETED);
    });

    it('allows manager to delete work item', async () => {
      mockPrisma.workItem.delete.mockResolvedValueOnce(assignedTask as any);

      const res = await WorkItemService.deleteWorkItem('task-assigned-1', managerUser);
      expect(res).toBeDefined();
    });
  });
});

