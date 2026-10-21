import { WorkItemService } from '../../src/services/work-item.service';
import { mockPrisma, resetPrismaMock } from '../mocks/prisma.mock';
import { WorkItemType, WorkItemStatus, WorkItemPriority, SprintStatus } from '@prisma/client';

describe('WorkItem Hierarchy, Validation & Permissions Unit Tests', () => {
  const mockOrgId = 'org-wh-1';
  const mockProjectId = 'proj-wh-1';

  const mockManager = {
    id: 'user-mgr-1',
    organization_id: mockOrgId,
    role: 'MANAGER',
    roles: [{ role: { name: 'MANAGER' } }],
  };

  const mockIntern = {
    id: 'user-intern-1',
    organization_id: mockOrgId,
    role: 'INTERN',
    roles: [{ role: { name: 'INTERN' } }],
  };

  const mockProject = {
    id: mockProjectId,
    organization_id: mockOrgId,
    name: 'Hierarchy Project',
    owner_id: mockManager.id,
    status: 'ACTIVE',
  };

  const mockParentStory = {
    id: 'story-1',
    project_id: mockProjectId,
    organization_id: mockOrgId,
    type: WorkItemType.STORY,
    status: WorkItemStatus.IN_PROGRESS,
  };

  beforeEach(() => {
    resetPrismaMock();
    mockPrisma.project.findFirst.mockResolvedValue(mockProject);
    mockPrisma.project.findUnique.mockResolvedValue(mockProject);
  });

  describe('Root Work Items vs Personal Tasks Validation', () => {
    it('throws error when creating a TASK at project root without a parent', async () => {
      await expect(
        WorkItemService.createWorkItem(mockManager, {
          title: 'Orphan Task',
          type: WorkItemType.TASK,
          project_id: mockProjectId,
          parent_id: null,
          story_points: 3,
        })
      ).rejects.toThrow('TASK must have a parent work item. Only EPIC, STORY, and BUG can be created at the project root.');
    });

    it('throws error when creating personal task with type other than TASK', async () => {
      await expect(
        WorkItemService.createWorkItem(mockManager, {
          title: 'Personal Epic',
          type: WorkItemType.EPIC,
          project_id: null,
        })
      ).rejects.toThrow('Personal tasks without a project must be of type TASK');
    });

    it('creates root STORY or BUG in a project without parent successfully', async () => {
      mockPrisma.projectMember.findFirst.mockResolvedValue({
        project_id: mockProjectId,
        user_id: mockManager.id,
      });
      mockPrisma.workItem.create.mockResolvedValueOnce({
        id: 'wi-story-1',
        title: 'Root Story',
        type: WorkItemType.STORY,
        project_id: mockProjectId,
        story_points: 5,
        assignees: [],
        time_entries: [],
      });

      const res = await WorkItemService.createWorkItem(mockManager, {
        title: 'Root Story',
        type: WorkItemType.STORY,
        project_id: mockProjectId,
        story_points: 5,
      });

      expect(res.id).toBe('wi-story-1');
    });
  });

  describe('Parent Relationships and Boundary Validations', () => {
    it('throws error when parent work item is not found in organization', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce(null);

      await expect(
        WorkItemService.createWorkItem(mockManager, {
          title: 'Subtask 1',
          type: WorkItemType.SUBTASK,
          project_id: mockProjectId,
          parent_id: 'parent-missing',
          story_points: 1,
        })
      ).rejects.toThrow('Parent work item not found in your organization');
    });

    it('throws error when parent belongs to a different project', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'parent-other',
        project_id: 'proj-other-999',
        type: WorkItemType.STORY,
      });

      await expect(
        WorkItemService.createWorkItem(mockManager, {
          title: 'Child Task',
          type: WorkItemType.TASK,
          project_id: mockProjectId,
          parent_id: 'parent-other',
          story_points: 2,
        })
      ).rejects.toThrow('Cross-project parent relationships are not allowed');
    });

    it('throws error when personal task has a project work item as parent', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'parent-proj',
        project_id: mockProjectId,
        type: WorkItemType.TASK,
      });

      await expect(
        WorkItemService.createWorkItem(mockManager, {
          title: 'Personal Child',
          type: WorkItemType.TASK,
          project_id: null,
          parent_id: 'parent-proj',
          story_points: 1,
        })
      ).rejects.toThrow('Personal tasks cannot have a project work item as a parent');
    });
  });

  describe('Strict Jira Parent-Child Hierarchy Rules', () => {
    it('throws error when adding TASK under an EPIC parent', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'epic-1',
        project_id: mockProjectId,
        type: WorkItemType.EPIC,
      });

      await expect(
        WorkItemService.createWorkItem(mockManager, {
          title: 'Task under Epic',
          type: WorkItemType.TASK,
          project_id: mockProjectId,
          parent_id: 'epic-1',
          story_points: 3,
        })
      ).rejects.toThrow('An EPIC can only contain STORY or BUG work items');
    });

    it('throws error when adding SUBTASK under a STORY parent', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'story-1',
        project_id: mockProjectId,
        type: WorkItemType.STORY,
      });

      await expect(
        WorkItemService.createWorkItem(mockManager, {
          title: 'Subtask under Story',
          type: WorkItemType.SUBTASK,
          project_id: mockProjectId,
          parent_id: 'story-1',
          story_points: 1,
        })
      ).rejects.toThrow('A STORY can only contain TASK work items as direct children');
    });

    it('throws error when adding STORY under a TASK parent', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'task-1',
        project_id: mockProjectId,
        type: WorkItemType.TASK,
      });

      await expect(
        WorkItemService.createWorkItem(mockManager, {
          title: 'Story under Task',
          type: WorkItemType.STORY,
          project_id: mockProjectId,
          parent_id: 'task-1',
          story_points: 5,
        })
      ).rejects.toThrow('A TASK can only contain SUBTASK work items');
    });

    it('throws error when adding children under a SUBTASK (leaf node)', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'subtask-1',
        project_id: mockProjectId,
        type: WorkItemType.SUBTASK,
      });

      await expect(
        WorkItemService.createWorkItem(mockManager, {
          title: 'Child under Subtask',
          type: WorkItemType.SUBTASK,
          project_id: mockProjectId,
          parent_id: 'subtask-1',
          story_points: 1,
        })
      ).rejects.toThrow('A SUBTASK is a leaf item and cannot have child work items');
    });

    it('throws error when adding children under a BUG (leaf node)', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'bug-1',
        project_id: mockProjectId,
        type: WorkItemType.BUG,
      });

      await expect(
        WorkItemService.createWorkItem(mockManager, {
          title: 'Child under Bug',
          type: WorkItemType.SUBTASK,
          project_id: mockProjectId,
          parent_id: 'bug-1',
          story_points: 1,
        })
      ).rejects.toThrow('A BUG is a leaf item and cannot have child work items');
    });
  });

  describe('Circular Parent-Child Cycle Detection', () => {
    it('throws error when item is assigned as its own parent', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'wi-self',
        project_id: mockProjectId,
        type: WorkItemType.TASK,
        assignees: [],
      });

      await expect(
        WorkItemService.updateWorkItem('wi-self', mockManager, {
          parent_id: 'wi-self',
        })
      ).rejects.toThrow('Circular parent-child relationship detected: an item cannot be its own parent');
    });

    it('throws error on indirect circular dependency loop A -> B -> A', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'wi-a',
        project_id: mockProjectId,
        type: WorkItemType.TASK,
        assignees: [],
      });

      // Chain traversal: target parent is wi-b, wi-b has parent wi-a (cycle!)
      mockPrisma.workItem.findUnique.mockResolvedValueOnce({ parent_id: 'wi-a' });

      await expect(
        WorkItemService.updateWorkItem('wi-a', mockManager, {
          parent_id: 'wi-b',
        })
      ).rejects.toThrow('Circular parent-child relationship detected');
    });
  });

  describe('Intern Creation Restrictions & Assignee Validation', () => {
    it('forbids intern from creating root work item without parent', async () => {
      mockPrisma.projectMember.findFirst.mockResolvedValue({
        project_id: mockProjectId,
        user_id: mockIntern.id,
        project_role: 'DEVELOPER',
      });

      await expect(
        WorkItemService.createWorkItem(mockIntern, {
          title: 'Intern Root Task',
          type: WorkItemType.STORY,
          project_id: mockProjectId,
          parent_id: null,
          story_points: 3,
        })
      ).rejects.toThrow('Forbidden: interns cannot create root work items');
    });

    it('forbids intern from creating EPIC under parent', async () => {
      mockPrisma.projectMember.findFirst.mockResolvedValue({
        project_id: mockProjectId,
        user_id: mockIntern.id,
        project_role: 'DEVELOPER',
      });

      await expect(
        WorkItemService.createWorkItem(mockIntern, {
          title: 'Intern Epic',
          type: WorkItemType.EPIC,
          project_id: mockProjectId,
          parent_id: 'some-parent',
        })
      ).rejects.toThrow('EPIC cannot have a parent work item');
    });

    it('throws error when assignees do not exist in organization', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce(mockParentStory);
      mockPrisma.user.findMany.mockResolvedValueOnce([]); // 0 found

      await expect(
        WorkItemService.createWorkItem(mockManager, {
          title: 'Task with invalid assignee',
          type: WorkItemType.TASK,
          project_id: mockProjectId,
          parent_id: 'story-1',
          assignee_ids: ['u-nonexistent'],
          story_points: 2,
        })
      ).rejects.toThrow('One or more assignees do not exist in your organization');
    });

    it('throws error when assignee is not a member of the project', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce(mockParentStory);
      mockPrisma.user.findMany.mockResolvedValueOnce([{ id: 'u-org-user' }]);
      mockPrisma.projectMember.findMany.mockResolvedValueOnce([]); // not in project

      await expect(
        WorkItemService.createWorkItem(mockManager, {
          title: 'Task with non-member assignee',
          type: WorkItemType.TASK,
          project_id: mockProjectId,
          parent_id: 'story-1',
          assignee_ids: ['u-org-user'],
          story_points: 2,
        })
      ).rejects.toThrow('User u-org-user is not a member of project');
    });

    it('forbids intern without authorization from assigning task to others', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'wi-t1',
        project_id: mockProjectId,
        project: { owner_id: 'other-owner', organization_id: mockOrgId },
        created_by: 'creator-other',
        assignees: [],
      });
      mockPrisma.projectMember.findFirst.mockResolvedValue(null);

      await expect(
        WorkItemService.addAssignees('wi-t1', mockIntern, ['u-other-member'])
      ).rejects.toThrow('Forbidden: interns cannot assign work items');
    });

    it('throws error when assigning personal task to a sprint', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([{ id: mockManager.id }]);

      await expect(
        WorkItemService.createWorkItem(mockManager, {
          title: 'Personal task with sprint',
          type: WorkItemType.TASK,
          project_id: null,
          sprint_id: 'sprint-1',
          story_points: 1,
        })
      ).rejects.toThrow('Personal tasks cannot be assigned to a sprint');
    });

    it('throws error when sprint does not exist in organization', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce(mockParentStory);
      mockPrisma.sprint.findFirst.mockResolvedValueOnce(null);

      await expect(
        WorkItemService.createWorkItem(mockManager, {
          title: 'Task in missing sprint',
          type: WorkItemType.TASK,
          project_id: mockProjectId,
          parent_id: 'story-1',
          sprint_id: 'sprint-missing',
          story_points: 1,
        })
      ).rejects.toThrow('Sprint not found in your organization');
    });

    it('throws error when sprint belongs to a different project', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce(mockParentStory);
      mockPrisma.sprint.findFirst.mockResolvedValueOnce({
        id: 'sprint-diff',
        project_id: 'proj-other-888',
        status: SprintStatus.ACTIVE,
      });

      await expect(
        WorkItemService.createWorkItem(mockManager, {
          title: 'Task in wrong sprint',
          type: WorkItemType.TASK,
          project_id: mockProjectId,
          parent_id: 'story-1',
          sprint_id: 'sprint-diff',
          story_points: 1,
        })
      ).rejects.toThrow('Cannot assign work item to a sprint belonging to a different project');
    });

    it('throws error when trying to add work item to a completed sprint', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce(mockParentStory);
      mockPrisma.sprint.findFirst.mockResolvedValueOnce({
        id: 'sprint-done',
        project_id: mockProjectId,
        status: SprintStatus.COMPLETED,
      });

      await expect(
        WorkItemService.createWorkItem(mockManager, {
          title: 'Task in completed sprint',
          type: WorkItemType.TASK,
          project_id: mockProjectId,
          parent_id: 'story-1',
          sprint_id: 'sprint-done',
          story_points: 1,
        })
      ).rejects.toThrow('Cannot add new work items to a completed sprint or cycle');
    });
  });

  describe('updateWorkItem Intern Restrictions and Type Compatibility', () => {
    const existingTask = {
      id: 'wi-t1',
      title: 'Existing Task',
      type: WorkItemType.TASK,
      status: WorkItemStatus.IN_PROGRESS,
      project_id: mockProjectId,
      parent_id: 'story-1',
      assignees: [{ user_id: mockIntern.id }],
    };

    it('forbids intern from updating work items not assigned to them', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        ...existingTask,
        assignees: [{ user_id: 'other-intern' }],
      });
      mockPrisma.projectMember.findFirst.mockResolvedValue({
        project_id: mockProjectId,
        user_id: mockIntern.id,
        project_role: 'DEVELOPER',
      });

      await expect(
        WorkItemService.updateWorkItem('wi-t1', mockIntern, { status: WorkItemStatus.IN_REVIEW })
      ).rejects.toThrow('Forbidden: you can only update tasks assigned to you');
    });

    it.each([
      ['assignee_ids', ['other-u'], 'Forbidden: interns cannot reassign tasks'],
      ['sprint_id', 'sp-new', 'Forbidden: interns cannot change sprint assignments'],
      ['parent_id', 'p-new', 'Forbidden: interns cannot alter parent-child or epic assignments'],
      ['story_points', 8, 'Forbidden: interns cannot modify story points'],
      ['priority', WorkItemPriority.HIGH, 'Forbidden: interns cannot modify task priority'],
      ['due_date', new Date(), 'Forbidden: interns cannot modify task due dates or schedules'],
      ['title', 'Altered Title', 'Forbidden: interns cannot modify task title'],
      ['description', 'Altered Desc', 'Forbidden: interns cannot modify task description'],
      ['type', WorkItemType.BUG, 'Forbidden: interns cannot modify task type'],
    ])('forbids intern from modifying restricted field %s', async (field, value, expectedError) => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce(existingTask);
      mockPrisma.projectMember.findFirst.mockResolvedValue({
        project_id: mockProjectId,
        user_id: mockIntern.id,
        project_role: 'DEVELOPER',
      });

      await expect(
        WorkItemService.updateWorkItem('wi-t1', mockIntern, { [field]: value } as any)
      ).rejects.toThrow(expectedError);
    });

    it('throws error when changing parent type to SUBTASK while having existing children', async () => {
      mockPrisma.workItem.findFirst
        .mockResolvedValueOnce({
          id: 'wi-parent-1',
          title: 'Parent Task',
          type: WorkItemType.TASK,
          project_id: mockProjectId,
          parent_id: 'task-root',
          assignees: [],
        })
        .mockResolvedValueOnce({
          id: 'task-root',
          project_id: mockProjectId,
          type: WorkItemType.TASK,
        });

      mockPrisma.workItem.findMany.mockResolvedValueOnce([
        { id: 'c-1', type: WorkItemType.SUBTASK },
      ]);

      await expect(
        WorkItemService.updateWorkItem('wi-parent-1', mockManager, {
          type: WorkItemType.SUBTASK,
        })
      ).rejects.toThrow('Cannot change type to SUBTASK: work item has 1 child item(s), but SUBTASK cannot have children');
    });

    it('throws error when changing parent type to EPIC when child is not STORY or BUG', async () => {
      mockPrisma.workItem.findFirst
        .mockResolvedValueOnce({
          id: 'wi-parent-2',
          title: 'Parent Story',
          type: WorkItemType.STORY,
          project_id: mockProjectId,
          parent_id: null,
          assignees: [],
        });

      mockPrisma.workItem.findMany.mockResolvedValueOnce([
        { id: 'c-task-1', type: WorkItemType.TASK },
      ]);

      await expect(
        WorkItemService.updateWorkItem('wi-parent-2', mockManager, {
          type: WorkItemType.EPIC,
        })
      ).rejects.toThrow('Cannot change type to EPIC: existing child item is of type TASK. EPIC only allows STORY or BUG.');
    });

    it('handles completed_at timestamp correctly when transitioning to and from COMPLETED', async () => {
      // 1. Transition from TODO to COMPLETED sets completed_at
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        ...existingTask,
        status: WorkItemStatus.TODO,
      });
      mockPrisma.workItem.update.mockResolvedValueOnce({
        ...existingTask,
        status: WorkItemStatus.COMPLETED,
        completed_at: new Date(),
        assignees: [],
        time_entries: [],
      });

      await WorkItemService.updateWorkItem('wi-t1', mockManager, {
        status: WorkItemStatus.COMPLETED,
      });

      expect(mockPrisma.workItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            completed_at: expect.any(Date),
          }),
        })
      );

      // 2. Transition from COMPLETED back to IN_PROGRESS sets completed_at to null
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        ...existingTask,
        status: WorkItemStatus.COMPLETED,
      });
      mockPrisma.workItem.update.mockResolvedValueOnce({
        ...existingTask,
        status: WorkItemStatus.IN_PROGRESS,
        completed_at: null,
        assignees: [],
        time_entries: [],
      });

      await WorkItemService.updateWorkItem('wi-t1', mockManager, {
        status: WorkItemStatus.IN_PROGRESS,
      });

      expect(mockPrisma.workItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            completed_at: null,
          }),
        })
      );
    });
  });

  describe('WorkItem Formatting & Time Aggregation', () => {
    it('aggregates time_by_intern and total logged_minutes accurately', () => {
      const rawItem = {
        id: 'wi-100',
        title: 'Task with time entries',
        type: WorkItemType.TASK,
        status: WorkItemStatus.IN_PROGRESS,
        assignees: [
          { user: { id: 'u1', name: 'Alice', email: 'alice@test.com' } },
        ],
        time_entries: [
          { user_id: 'u1', duration_minutes: 60, user: { name: 'Alice', email: 'alice@test.com' } },
          { user_id: 'u1', duration_minutes: 45, user: { name: 'Alice', email: 'alice@test.com' } },
          { user_id: 'u2', duration_minutes: 90, user: { name: 'Bob', email: 'bob@test.com' } },
          { user_id: null, duration_minutes: 15 }, // entry with missing user_id
        ],
      };

      const formatted = (WorkItemService as any).formatWorkItem(rawItem);
      expect(formatted.logged_minutes).toBe(210);
      expect(formatted.time_by_intern).toHaveLength(2);
      expect(formatted.time_by_intern).toEqual(
        expect.arrayContaining([
          { user_id: 'u1', name: 'Alice', email: 'alice@test.com', logged_minutes: 105 },
          { user_id: 'u2', name: 'Bob', email: 'bob@test.com', logged_minutes: 90 },
        ])
      );
    });
  });

  describe('Creation Assignment Authorization', () => {
    it('rejects assigning tasks to other users during creation if user lacks TASK_ASSIGN in custom role', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce(mockParentStory);
      mockPrisma.projectMember.findFirst.mockResolvedValue({
        id: 'pm-1',
        user_id: mockIntern.id,
        project_id: mockProjectId,
        role: {
          name: 'Restricted Member',
          is_custom: true,
          permissions: [{ permission: { name: 'TASK_CREATE' } }],
        },
      });
      mockPrisma.user.findMany.mockResolvedValueOnce([{ id: 'user-other-person' }]);
      mockPrisma.projectMember.findMany.mockResolvedValueOnce([{ user_id: 'user-other-person' }]);
      mockPrisma.project.findUnique.mockResolvedValueOnce({
        id: mockProjectId,
        owner_id: 'user-other-mgr',
      });

      await expect(
        WorkItemService.createWorkItem(mockIntern, {
          title: 'Task assigned to someone else',
          type: WorkItemType.TASK,
          project_id: mockProjectId,
          parent_id: 'story-1',
          assignee_ids: ['user-other-person'],
          story_points: 3,
        })
      ).rejects.toThrow('Forbidden: you do not have permission to assign tasks to other users');
    });
  });

  describe('Update Sprint Transitions & Boundary Validation', () => {
    const baseItem = {
      id: 'wi-sprint-test',
      project_id: mockProjectId,
      organization_id: mockOrgId,
      type: WorkItemType.TASK,
      status: WorkItemStatus.IN_PROGRESS,
      created_by: mockManager.id,
      assignees: [],
      time_entries: [],
      project: mockProject,
    };

    it('moves work item to backlog when sprint_id is set to backlog or null', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        ...baseItem,
        sprint_id: 'sprint-old',
      });
      mockPrisma.workItem.update.mockResolvedValueOnce({
        ...baseItem,
        sprint_id: null,
      });

      const res = await WorkItemService.updateWorkItem('wi-sprint-test', mockManager, {
        sprint_id: 'backlog',
      });

      expect(mockPrisma.workItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sprint_id: null,
          }),
        })
      );
    });

    it('rejects assigning personal task to a sprint during update', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        ...baseItem,
        project_id: null,
        project: null,
      });

      await expect(
        WorkItemService.updateWorkItem('wi-sprint-test', mockManager, {
          sprint_id: 'sprint-123',
        })
      ).rejects.toThrow('Personal tasks cannot be assigned to a sprint');
    });

    it('rejects sprint update when sprint is not found in organization', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce(baseItem);
      mockPrisma.sprint.findFirst.mockResolvedValueOnce(null);

      await expect(
        WorkItemService.updateWorkItem('wi-sprint-test', mockManager, {
          sprint_id: 'sprint-missing',
        })
      ).rejects.toThrow('Sprint not found in your organization');
    });

    it('rejects sprint update when sprint belongs to a different project', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce(baseItem);
      mockPrisma.sprint.findFirst.mockResolvedValueOnce({
        id: 'sprint-diff-proj',
        organization_id: mockOrgId,
        project_id: 'proj-other-999',
        status: SprintStatus.ACTIVE,
      });

      await expect(
        WorkItemService.updateWorkItem('wi-sprint-test', mockManager, {
          sprint_id: 'sprint-diff-proj',
        })
      ).rejects.toThrow('Cannot assign work item to a sprint belonging to a different project');
    });

    it('rejects moving work item into a completed sprint', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        ...baseItem,
        sprint_id: 'sprint-active',
      });
      mockPrisma.sprint.findFirst.mockResolvedValueOnce({
        id: 'sprint-completed',
        organization_id: mockOrgId,
        project_id: mockProjectId,
        status: SprintStatus.COMPLETED,
      });

      await expect(
        WorkItemService.updateWorkItem('wi-sprint-test', mockManager, {
          sprint_id: 'sprint-completed',
        })
      ).rejects.toThrow('Cannot move work items into a completed sprint or cycle');
    });
  });

  describe('Deletion Permissions & Safeguards', () => {
    it('rejects deletion of work items in archived projects for non-managers', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'wi-del-archived',
        project_id: mockProjectId,
        organization_id: mockOrgId,
        created_by: mockIntern.id,
        children: [],
      });
      mockPrisma.project.findUnique.mockResolvedValueOnce({
        id: mockProjectId,
        status: 'ARCHIVED',
        owner_id: 'someone-else',
      });

      await expect(
        WorkItemService.deleteWorkItem('wi-del-archived', mockIntern)
      ).rejects.toThrow('Cannot delete work items in an archived project');
    });

    it('rejects intern deleting personal tasks', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'wi-del-personal',
        project_id: null,
        organization_id: mockOrgId,
        created_by: mockIntern.id,
        children: [],
      });

      await expect(
        WorkItemService.deleteWorkItem('wi-del-personal', mockIntern)
      ).rejects.toThrow('Forbidden: interns do not have permission to delete work items');
    });

    it('rejects non-creator non-manager deleting another user personal task', async () => {
      const nonCreatorDev = {
        id: 'dev-1',
        organization_id: mockOrgId,
        role: 'DEVELOPER',
        roles: [{ role: { name: 'DEVELOPER' } }],
      };
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'wi-del-personal',
        project_id: null,
        organization_id: mockOrgId,
        created_by: 'creator-99',
        children: [],
      });

      await expect(
        WorkItemService.deleteWorkItem('wi-del-personal', nonCreatorDev)
      ).rejects.toThrow('Forbidden: only the creator can delete this personal task');
    });

    it('rejects deletion of work item with existing children', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'wi-parent',
        project_id: mockProjectId,
        organization_id: mockOrgId,
        created_by: mockManager.id,
        children: [{ id: 'child-1' }],
      });
      mockPrisma.project.findUnique.mockResolvedValueOnce({
        id: mockProjectId,
        status: 'ACTIVE',
        owner_id: mockManager.id,
      });

      await expect(
        WorkItemService.deleteWorkItem('wi-parent', mockManager)
      ).rejects.toThrow('Cannot delete work item with child items. Please reassign or delete children first.');
    });
  });

  describe('Comments Validation & Authorization', () => {
    it('validates empty content and length limit on updateComment', async () => {
      await expect(
        WorkItemService.updateComment('wi-1', 'c-1', '', mockManager)
      ).rejects.toThrow('Comment content cannot be empty');

      await expect(
        WorkItemService.updateComment('wi-1', 'c-1', 'x'.repeat(5001), mockManager)
      ).rejects.toThrow('Comment content cannot exceed 5000 characters');
    });

    it('rejects updating non-existent comment with 404', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'wi-1',
        organization_id: mockOrgId,
        project_id: mockProjectId,
        project: mockProject,
        assignees: [],
      });
      mockPrisma.workItemComment.findFirst.mockResolvedValueOnce(null);

      await expect(
        WorkItemService.updateComment('wi-1', 'c-missing', 'Valid comment', mockManager)
      ).rejects.toThrow('Comment not found');
    });

    it('rejects editing another user comment for non-managers', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'wi-1',
        organization_id: mockOrgId,
        project_id: mockProjectId,
        project: mockProject,
        assignees: [{ user_id: mockIntern.id }],
      });
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({ id: 'pm-1' });
      mockPrisma.workItemComment.findFirst.mockResolvedValueOnce({
        id: 'c-1',
        work_item_id: 'wi-1',
        author_id: 'other-author-123',
      });

      await expect(
        WorkItemService.updateComment('wi-1', 'c-1', 'Trying to edit', mockIntern)
      ).rejects.toThrow('Forbidden: you can only edit your own comments');
    });

    it('rejects deleting another user comment for non-managers', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'wi-1',
        organization_id: mockOrgId,
        project_id: mockProjectId,
        project: mockProject,
        assignees: [{ user_id: mockIntern.id }],
      });
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({ id: 'pm-1' });
      mockPrisma.workItemComment.findFirst.mockResolvedValueOnce({
        id: 'c-1',
        work_item_id: 'wi-1',
        author_id: 'other-author-123',
      });

      await expect(
        WorkItemService.deleteComment('wi-1', 'c-1', mockIntern)
      ).rejects.toThrow('Forbidden: you can only delete your own comments');
    });
  });

  describe('Extension Request Validation & Edge Cases', () => {
    it('validates reason character limit (<= 2000 chars)', async () => {
      await expect(
        WorkItemService.requestExtension('wi-1', mockIntern, {
          reason: 'a'.repeat(2001),
          requested_due_date: '2026-12-01',
        })
      ).rejects.toThrow('Reason cannot exceed 2000 characters');
    });

    it('rejects extension request on work item in archived project', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'wi-1',
        organization_id: mockOrgId,
        project_id: mockProjectId,
        project: { ...mockProject, status: 'ARCHIVED' },
        assignees: [{ user_id: mockIntern.id }],
      });
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({ id: 'pm-1' });

      await expect(
        WorkItemService.requestExtension('wi-1', mockIntern, {
          reason: 'Need time',
          requested_due_date: '2026-12-01',
        })
      ).rejects.toThrow('Cannot request extensions for work items in an archived project');
    });

    it('rejects extension request when task has no project (personal task)', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'wi-personal',
        organization_id: mockOrgId,
        project_id: null,
        project: null,
        created_by: mockIntern.id,
        assignees: [{ user_id: mockIntern.id }],
      });

      await expect(
        WorkItemService.requestExtension('wi-personal', mockIntern, {
          reason: 'Need time',
          requested_due_date: '2026-12-01',
        })
      ).rejects.toThrow('Due-date extensions are only supported for project work items');
    });

    it('requires a future date when task has no current due date', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'wi-nodue',
        organization_id: mockOrgId,
        project_id: mockProjectId,
        project: mockProject,
        due_date: null,
        assignees: [{ user_id: mockIntern.id }],
      });
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({ id: 'pm-1' });

      await expect(
        WorkItemService.requestExtension('wi-nodue', mockIntern, {
          reason: 'Need deadline set',
          requested_due_date: '2020-01-01', // Past date
        })
      ).rejects.toThrow('The requested date must be a future date');
    });
  });
});
