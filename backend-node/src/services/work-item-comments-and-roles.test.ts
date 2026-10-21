import { WorkItemService } from './work-item.service';
import { ProjectService } from './project.service';
import { mockPrisma } from '../../tests/mocks/prisma.mock';
import { WorkItemType, WorkItemStatus, ProjectStatus } from '@prisma/client';

describe('WorkItem Comments, Story Points & Project-Scoped Roles Unit Tests', () => {
  const mockUser = {
    id: 'user-manager-1',
    name: 'Manager User',
    organization_id: 'org-test-1',
    role: 'MANAGER',
    roles: [{ role: { name: 'MANAGER' } }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Story Points Validation on Creation', () => {
    it('rejects task creation when story_points is null', async () => {
      await expect(
        WorkItemService.createWorkItem(mockUser, {
          project_id: 'proj-1',
          type: WorkItemType.TASK,
          title: 'Task without story points',
          story_points: null,
        })
      ).rejects.toThrow(/story points/i);
    });

    it('rejects task creation when story_points is negative', async () => {
      await expect(
        WorkItemService.createWorkItem(mockUser, {
          project_id: 'proj-1',
          type: WorkItemType.TASK,
          title: 'Task with -1 story points',
          story_points: -1,
        })
      ).rejects.toThrow(/story points/i);
    });

    it('rejects task creation when story_points is a decimal', async () => {
      await expect(
        WorkItemService.createWorkItem(mockUser, {
          project_id: 'proj-1',
          type: WorkItemType.TASK,
          title: 'Task with decimal story points',
          story_points: 3.5,
        })
      ).rejects.toThrow(/story points/i);
    });

    it('accepts valid non-negative integer story points on creation', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce({
        id: 'proj-1',
        organization_id: 'org-test-1',
        status: ProjectStatus.ACTIVE,
      });
      mockPrisma.workItem.create.mockResolvedValueOnce({
        id: 'story-1',
        title: 'Valid Story',
        type: WorkItemType.STORY,
        project_id: 'proj-1',
        organization_id: 'org-test-1',
        story_points: 5,
        status: WorkItemStatus.TODO,
        assignees: [],
        time_entries: [],
        children: [],
        extension_requests: [],
      });

      const result = await WorkItemService.createWorkItem(mockUser, {
        project_id: 'proj-1',
        type: WorkItemType.STORY,
        title: 'Valid Story',
        story_points: 5,
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('story-1');
      expect(result.story_points).toBe(5);
    });
  });

  describe('Story Points Update Validation', () => {
    it('rejects update with negative story points', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce({
        id: 'item-1',
        project_id: 'proj-1',
        organization_id: 'org-test-1',
        project: { status: ProjectStatus.ACTIVE },
        assignees: [],
      });

      await expect(
        WorkItemService.updateWorkItem('item-1', mockUser, { story_points: -1 })
      ).rejects.toThrow(/story points/i);
    });
  });

  describe('Persistent Comments CRUD', () => {
    const mockWorkItem = {
      id: 'task-100',
      project_id: 'proj-1',
      organization_id: 'org-test-1',
      project: { status: ProjectStatus.ACTIVE, owner_id: 'user-manager-1' },
      assignees: [],
    };

    it('rejects adding an empty or whitespace-only comment', async () => {
      await expect(
        WorkItemService.createComment('task-100', '   ', mockUser)
      ).rejects.toThrow(/Comment content cannot be empty/);
    });

    it('creates a new comment when content is valid', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce(mockWorkItem);
      mockPrisma.workItemComment.create.mockResolvedValueOnce({
        id: 'comment-1',
        work_item_id: 'task-100',
        author_id: mockUser.id,
        content: 'This is a test comment',
        created_at: new Date('2026-10-20T10:00:00Z'),
        updated_at: new Date('2026-10-20T10:00:00Z'),
        author: {
          id: mockUser.id,
          name: mockUser.name,
          email: 'manager@example.com',
          roles: [{ role: { name: 'MANAGER' } }],
        },
      });

      const comment = await WorkItemService.createComment('task-100', 'This is a test comment', mockUser);
      expect(comment).toBeDefined();
      expect(comment.id).toBe('comment-1');
      expect(comment.content).toBe('This is a test comment');
      expect(comment.author.name).toBe('Manager User');
    });

    it('lists comments ordered oldest to newest', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce(mockWorkItem);
      mockPrisma.workItemComment.findMany.mockResolvedValueOnce([
        {
          id: 'comment-1',
          work_item_id: 'task-100',
          author_id: mockUser.id,
          content: 'First comment',
          created_at: new Date('2026-10-20T10:00:00Z'),
          updated_at: new Date('2026-10-20T10:00:00Z'),
          author: { id: mockUser.id, name: mockUser.name, email: 'mgr@example.com', roles: [] },
        },
        {
          id: 'comment-2',
          work_item_id: 'task-100',
          author_id: mockUser.id,
          content: 'Second comment',
          created_at: new Date('2026-10-20T11:00:00Z'),
          updated_at: new Date('2026-10-20T11:00:00Z'),
          author: { id: mockUser.id, name: mockUser.name, email: 'mgr@example.com', roles: [] },
        },
      ]);

      const comments = await WorkItemService.listComments('task-100', mockUser);
      expect(comments).toHaveLength(2);
      expect(comments[0].content).toBe('First comment');
      expect(comments[1].content).toBe('Second comment');
    });

    it('rejects updating comment with empty content', async () => {
      await expect(
        WorkItemService.updateComment('task-100', 'comment-1', '   ', mockUser)
      ).rejects.toThrow(/Comment content cannot be empty/);
    });

    it('updates existing comment successfully', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce(mockWorkItem);
      mockPrisma.workItemComment.findFirst.mockResolvedValueOnce({
        id: 'comment-1',
        work_item_id: 'task-100',
        author_id: mockUser.id,
      });
      mockPrisma.workItemComment.update.mockResolvedValueOnce({
        id: 'comment-1',
        work_item_id: 'task-100',
        author_id: mockUser.id,
        content: 'Updated comment content',
        created_at: new Date('2026-10-20T10:00:00Z'),
        updated_at: new Date('2026-10-20T10:05:00Z'),
        author: {
          id: mockUser.id,
          name: mockUser.name,
          email: 'mgr@example.com',
          roles: [],
        },
      });

      const updated = await WorkItemService.updateComment('task-100', 'comment-1', 'Updated comment content', mockUser);
      expect(updated.content).toBe('Updated comment content');
    });

    it('deletes comment successfully', async () => {
      mockPrisma.workItem.findFirst.mockResolvedValueOnce(mockWorkItem);
      mockPrisma.workItemComment.findFirst.mockResolvedValueOnce({
        id: 'comment-1',
        work_item_id: 'task-100',
        author_id: mockUser.id,
      });
      mockPrisma.workItemComment.delete.mockResolvedValueOnce({
        id: 'comment-1',
      });

      const deleted = await WorkItemService.deleteComment('task-100', 'comment-1', mockUser);
      expect(deleted).toEqual({ success: true, message: 'Comment deleted successfully' });
    });
  });

  describe('Project-Scoped Custom Roles Restriction', () => {
    it('returns strictly project-scoped permissions when requested with scope=project', async () => {
      mockPrisma.permission.findMany.mockResolvedValueOnce([
        { id: 'perm-1', name: 'PROJECT_READ', description: 'Read project' },
        { id: 'perm-2', name: 'TASK_CREATE', description: 'Create task' },
      ]);

      const result = await ProjectService.getAvailablePermissions(mockUser, 'project');
      expect(result.permissions).toBeDefined();
      expect(result.permissions.every((p: any) => ProjectService.PROJECT_SCOPED_PERMISSIONS.has(p.name))).toBe(true);
    });

    it('rejects creating custom role with out-of-scope permissions', async () => {
      mockPrisma.project.findUnique.mockResolvedValueOnce({
        id: 'proj-1',
        organization_id: 'org-test-1',
      });

      await expect(
        ProjectService.createCustomRole(
          'proj-1',
          {
            name: 'Escalated Role',
            permissions: ['PROJECT_READ', 'ATTENDANCE_READ', 'USER_CREATE'],
          },
          mockUser
        )
      ).rejects.toThrow(/Invalid project-scoped permissions/);
    });

    it('creates custom role with valid project-scoped permissions', async () => {
      mockPrisma.project.findUnique.mockResolvedValueOnce({
        id: 'proj-1',
        organization_id: 'org-test-1',
      });
      mockPrisma.role.findFirst.mockResolvedValueOnce(null); // name uniqueness check
      mockPrisma.permission.findMany.mockResolvedValueOnce([
        { id: 'p-1', name: 'PROJECT_READ' },
        { id: 'p-2', name: 'TASK_READ' },
      ]);
      mockPrisma.role.create.mockResolvedValueOnce({
        id: 'role-custom-1',
        name: 'Project QA Specialist',
        description: 'Test project-scoped custom role',
        project_id: 'proj-1',
        organization_id: 'org-test-1',
        is_custom: true,
        permissions: [
          { permission: { id: 'p-1', name: 'PROJECT_READ' } },
          { permission: { id: 'p-2', name: 'TASK_READ' } },
        ],
      });

      const role = await ProjectService.createCustomRole(
        'proj-1',
        {
          name: 'Project QA Specialist',
          description: 'Test project-scoped custom role',
          permissions: ['PROJECT_READ', 'TASK_READ'],
        },
        mockUser
      );

      expect(role).toBeDefined();
      expect(role.id).toBe('role-custom-1');
      expect(role.name).toBe('Project QA Specialist');
    });
  });
});
