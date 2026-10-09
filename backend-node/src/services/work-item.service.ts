import { WorkItemType, WorkItemStatus, WorkItemPriority } from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface CreateWorkItemInput {
  title: string;
  type: WorkItemType;
  project_id?: string | null;
  parent_id?: string | null;
  sprint_id?: string | null;
  description?: string | null;
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  start_date?: string | Date | null;
  due_date?: string | Date | null;
  story_points?: number | null;
  assignee_ids?: string[];
}

export interface UpdateWorkItemInput {
  title?: string;
  type?: WorkItemType;
  description?: string | null;
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  start_date?: string | Date | null;
  due_date?: string | Date | null;
  story_points?: number | null;
  sprint_id?: string | null;
  parent_id?: string | null;
  assignee_ids?: string[];
}

export interface WorkItemFilter {
  project_id?: string;
  sprint_id?: string;
  type?: string;
  status?: string;
  priority?: string;
  assigned_to_me?: boolean;
  my_personal?: boolean;
}

export class WorkItemService {
  /**
   * Helper to ensure user belongs to an organization
   */
  private static getUserOrgId(user: any): string {
    if (!user.organization_id) {
      throw new Error('User does not belong to any organization');
    }
    return user.organization_id;
  }

  /**
   * Helper to check if user has admin or manager role
   */
  private static isManagerOrAdmin(user: any): boolean {
    if (user.role === 'ADMIN' || user.role === 'MANAGER') return true;
    if (Array.isArray(user.roles)) {
      return user.roles.some(
        (ur: any) =>
          ur.role?.name === 'ADMIN' ||
          ur.role?.name === 'MANAGER' ||
          ur.name === 'ADMIN' ||
          ur.name === 'MANAGER'
      );
    }
    return false;
  }

  /**
   * Helper to verify if user has authority to assign tasks
   * (Admins, Managers, Tech Leads, Project Owners, or users with TASK_ASSIGN permission)
   */
  private static isAuthorizedToAssign(
    user: any,
    projectOwnerId?: string | null,
    creatorId?: string | null
  ): boolean {
    if (this.isManagerOrAdmin(user)) return true;

    // Project owner or task creator
    if (projectOwnerId && user.id === projectOwnerId) return true;
    if (creatorId && user.id === creatorId) return true;

    // Check roles for TECH_LEAD
    const roleNames: string[] = [];
    if (user.role) roleNames.push(user.role);
    if (Array.isArray(user.roles)) {
      user.roles.forEach((ur: any) => {
        if (ur.role?.name) roleNames.push(ur.role.name);
        if (ur.name) roleNames.push(ur.name);
      });
    }
    if (roleNames.includes('TECH_LEAD') || roleNames.includes('PROJECT_MANAGER')) {
      return true;
    }

    // Check permissions
    if (Array.isArray(user.permissions) && user.permissions.includes('TASK_ASSIGN')) {
      return true;
    }
    if (Array.isArray(user.roles)) {
      for (const ur of user.roles) {
        if (Array.isArray(ur.role?.permissions)) {
          if (ur.role.permissions.some((rp: any) => rp.permission?.name === 'TASK_ASSIGN' || rp.name === 'TASK_ASSIGN')) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Helper to verify user membership in a project
   */
  private static async verifyProjectMembership(
    projectId: string,
    userId: string,
    orgId: string
  ): Promise<boolean> {
    const member = await prisma.projectMember.findFirst({
      where: {
        project_id: projectId,
        user_id: userId,
        project: {
          organization_id: orgId,
        },
      },
    });
    return Boolean(member);
  }

  /**
   * Validate hierarchy integrity:
   * Strict Jira-Style Hierarchy:
   * EPIC -> STORY or BUG only
   * STORY -> TASK or BUG only
   * TASK -> SUBTASK only
   * SUBTASK -> cannot have children
   * BUG -> cannot have children
   *
   * Top-level (parentId = null):
   * In a Project (projectId != null): only EPIC is permitted at root.
   * Personal Tasks (projectId == null): only TASK is permitted.
   */
  private static async validateHierarchy(
    type: WorkItemType,
    parentId: string | null | undefined,
    projectId: string | null | undefined,
    orgId: string
  ): Promise<void> {
    if (!parentId) {
      if (projectId) {
        if (type !== WorkItemType.EPIC) {
          throw new Error(
            `${type} must have a parent work item. Only EPIC can be created at the project root.`
          );
        }
      } else {
        if (type !== WorkItemType.TASK) {
          throw new Error(
            `Personal tasks without a project must be of type TASK. Cannot create ${type} as a personal item.`
          );
        }
      }
      return;
    }

    // EPIC cannot have a parent
    if (type === WorkItemType.EPIC) {
      throw new Error('EPIC cannot have a parent work item');
    }

    const parent = await prisma.workItem.findFirst({
      where: { id: parentId, organization_id: orgId },
    });

    if (!parent) {
      throw new Error('Parent work item not found in your organization');
    }

    // Boundary check: project vs personal
    if (projectId) {
      if (parent.project_id !== projectId) {
        throw new Error(
          'Cross-project parent relationships are not allowed. Parent work item must belong to the same project.'
        );
      }
    } else {
      if (parent.project_id !== null) {
        throw new Error('Personal tasks cannot have a project work item as a parent.');
      }
    }

    // Strict parent-child validation rules
    switch (parent.type) {
      case WorkItemType.EPIC:
        if (type !== WorkItemType.STORY && type !== WorkItemType.BUG) {
          throw new Error(
            `An EPIC can only contain STORY or BUG work items. Cannot create ${type} under an EPIC.`
          );
        }
        break;

      case WorkItemType.STORY:
        if (type !== WorkItemType.TASK && type !== WorkItemType.BUG) {
          throw new Error(
            `A STORY can only contain TASK or BUG work items. Cannot create ${type} under a STORY.`
          );
        }
        break;

      case WorkItemType.TASK:
        if (type !== WorkItemType.SUBTASK) {
          throw new Error(
            `A TASK can only contain SUBTASK work items. Cannot create ${type} under a TASK.`
          );
        }
        break;

      case WorkItemType.SUBTASK:
        throw new Error(
          'A SUBTASK is a leaf item and cannot have child work items.'
        );

      case WorkItemType.BUG:
        throw new Error(
          'A BUG is a leaf item and cannot have child work items.'
        );

      default:
        throw new Error(`Invalid parent work item type: ${parent.type}`);
    }
  }

  /**
   * Traverse ancestor chain to prevent circular parent-child relationships
   */
  private static async assertNoCycles(itemId: string, targetParentId: string): Promise<void> {
    if (itemId === targetParentId) {
      throw new Error('Circular parent-child relationship detected: an item cannot be its own parent.');
    }

    let currentId: string | null = targetParentId;
    const visited = new Set<string>([itemId]);

    while (currentId) {
      if (visited.has(currentId)) {
        throw new Error('Circular parent-child relationship detected.');
      }
      visited.add(currentId);

      const parentRecord: { parent_id: string | null } | null = await prisma.workItem.findUnique({
        where: { id: currentId },
        select: { parent_id: true },
      });

      currentId = parentRecord?.parent_id || null;
    }
  }

  /**
   * Helper to derive dynamic attributes (such as is_overdue and formatted children)
   */
  private static formatWorkItem(item: any): any {
    if (!item) return null;
    const is_overdue = Boolean(
      item.due_date &&
        new Date(item.due_date) < new Date() &&
        item.status !== WorkItemStatus.COMPLETED
    );

    const formattedAssignees = Array.isArray(item.assignees)
      ? item.assignees.map((a: any) => ({
          user_id: a.user_id,
          name: a.user?.name || null,
          email: a.user?.email || null,
        }))
      : [];

    const formattedChildren = Array.isArray(item.children)
      ? item.children.map((child: any) => this.formatWorkItem(child))
      : [];

    const logged_minutes = Array.isArray(item.time_entries)
      ? item.time_entries.reduce((sum: number, entry: any) => sum + (Number(entry.duration_minutes) || 0), 0)
      : 0;

    return {
      ...item,
      is_overdue,
      logged_minutes,
      assignees: formattedAssignees,
      children: formattedChildren,
    };
  }

  /**
   * Create a new WorkItem (Project task or Personal task)
   */
  static async createWorkItem(user: any, data: CreateWorkItemInput) {
    const orgId = this.getUserOrgId(user);

    if (!data.title || typeof data.title !== 'string' || !data.title.trim()) {
      throw new Error('Work item title is required');
    }

    if (!data.type || !Object.values(WorkItemType).includes(data.type)) {
      throw new Error(
        `Invalid work item type: ${data.type}. Must be one of: ${Object.values(WorkItemType).join(', ')}`
      );
    }

    if (data.status && !Object.values(WorkItemStatus).includes(data.status)) {
      throw new Error(`Invalid status: ${data.status}`);
    }

    if (data.priority && !Object.values(WorkItemPriority).includes(data.priority)) {
      throw new Error(`Invalid priority: ${data.priority}`);
    }

    const projectId = data.project_id ? data.project_id.trim() : null;
    const parentId = data.parent_id ? data.parent_id.trim() : null;

    // Validate project access if this is a project work item
    if (projectId) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, organization_id: orgId },
      });
      if (!project) {
        throw new Error('Project not found in your organization');
      }

      const isMgr = this.isManagerOrAdmin(user);
      if (!isMgr) {
        const isMember = await this.verifyProjectMembership(projectId, user.id, orgId);
        if (!isMember) {
          throw new Error('Forbidden: you are not a member of this project');
        }
      }
    }

    // Validate hierarchy
    await this.validateHierarchy(data.type, parentId, projectId, orgId);

    // Validate assignees if provided
    let assigneeIds = Array.isArray(data.assignee_ids)
      ? [...new Set(data.assignee_ids.map((id) => id.trim()))].filter(Boolean)
      : [];

    if (projectId === null && assigneeIds.length === 0) {
      assigneeIds.push(user.id);
    }

    if (assigneeIds.length > 0) {
      const users = await prisma.user.findMany({
        where: {
          id: { in: assigneeIds },
          organization_id: orgId,
          is_active: true,
        },
        select: { id: true },
      });

      if (users.length !== assigneeIds.length) {
        throw new Error('One or more assignees do not exist in your organization');
      }

      if (projectId) {
        const projectMembers = await prisma.projectMember.findMany({
          where: { project_id: projectId, user_id: { in: assigneeIds } },
          select: { user_id: true },
        });
        const memberIds = new Set(projectMembers.map((pm) => pm.user_id));
        for (const uid of assigneeIds) {
          if (!memberIds.has(uid)) {
            throw new Error(`User ${uid} is not a member of project ${projectId}`);
          }
        }
      }

      // Check assignment authorization if assigning to others
      if (assigneeIds.some((uid) => uid !== user.id)) {
        const project = projectId
          ? await prisma.project.findUnique({ where: { id: projectId }, select: { owner_id: true } })
          : null;
        if (!this.isAuthorizedToAssign(user, project?.owner_id, user.id)) {
          throw new Error('Forbidden: you do not have permission to assign tasks to other users');
        }
      }
    }

    // Validate sprint if provided
    let sprintId: string | null = null;
    if (data.sprint_id) {
      if (!projectId) {
        throw new Error('Personal tasks cannot be assigned to a sprint');
      }
      const sprint = await prisma.sprint.findFirst({
        where: { id: data.sprint_id, organization_id: orgId },
      });
      if (!sprint) {
        throw new Error('Sprint not found in your organization');
      }
      if (sprint.project_id !== projectId) {
        throw new Error('Cannot assign work item to a sprint belonging to a different project');
      }
      sprintId = sprint.id;
    }

    const status = data.status || WorkItemStatus.TODO;
    const priority = data.priority || WorkItemPriority.MEDIUM;
    const completedAt = status === WorkItemStatus.COMPLETED ? new Date() : null;

    const workItem = await prisma.workItem.create({
      data: {
        organization_id: orgId,
        project_id: projectId,
        parent_id: parentId,
        sprint_id: sprintId,
        created_by: user.id,
        type: data.type,
        title: data.title.trim(),
        description: data.description ? data.description.trim() : null,
        status,
        priority,
        start_date: data.start_date ? new Date(data.start_date) : null,
        due_date: data.due_date ? new Date(data.due_date) : null,
        story_points: data.story_points !== undefined && data.story_points !== null ? Number(data.story_points) : 0,
        completed_at: completedAt,
        assignees: {
          create: assigneeIds.map((uid) => ({
            user_id: uid,
          })),
        },
      },
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
        project: {
          select: { id: true, name: true, status: true },
        },
        sprint: {
          select: { id: true, name: true, status: true },
        },
        parent: {
          select: { id: true, title: true, type: true, status: true, priority: true },
        },
        assignees: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    return this.formatWorkItem(workItem);
  }

  /**
   * List work items scoped to organization and user permissions
   */
  static async listWorkItems(user: any, filters?: WorkItemFilter) {
    const orgId = this.getUserOrgId(user);
    const isMgr = this.isManagerOrAdmin(user);

    const where: any = { organization_id: orgId };

    if (filters?.type) {
      if (!Object.values(WorkItemType).includes(filters.type as WorkItemType)) {
        throw new Error(`Invalid work item type: ${filters.type}`);
      }
      where.type = filters.type as WorkItemType;
    }

    if (filters?.status) {
      if (!Object.values(WorkItemStatus).includes(filters.status as WorkItemStatus)) {
        throw new Error(`Invalid work item status: ${filters.status}`);
      }
      where.status = filters.status as WorkItemStatus;
    }

    if (filters?.priority) {
      if (!Object.values(WorkItemPriority).includes(filters.priority as WorkItemPriority)) {
        throw new Error(`Invalid work item priority: ${filters.priority}`);
      }
      where.priority = filters.priority as WorkItemPriority;
    }

    if (filters?.sprint_id !== undefined) {
      if (filters.sprint_id === 'null' || filters.sprint_id === 'backlog' || filters.sprint_id === '') {
        where.sprint_id = null;
      } else {
        where.sprint_id = filters.sprint_id;
      }
    }

    if (filters?.my_personal) {
      where.project_id = null;
      where.OR = [
        { created_by: user.id },
        { assignees: { some: { user_id: user.id } } },
      ];
    } else if (filters?.project_id) {
      // Access check for specific project
      if (!isMgr) {
        const isMember = await this.verifyProjectMembership(filters.project_id, user.id, orgId);
        if (!isMember) {
          throw new Error('Forbidden: you are not a member of this project');
        }
      }
      where.project_id = filters.project_id;
    } else {
      // No specific project or my_personal filter provided
      if (!isMgr) {
        // Non-managers only see personal tasks assigned/created by them, or project tasks for projects they belong to
        where.OR = [
          {
            project_id: null,
            OR: [
              { created_by: user.id },
              { assignees: { some: { user_id: user.id } } },
            ],
          },
          {
            project: {
              members: { some: { user_id: user.id } },
            },
          },
        ];
      } else {
        // Managers see all project tasks, or personal tasks where they are creator/assignee
        where.OR = [
          { project_id: { not: null } },
          { created_by: user.id },
          { assignees: { some: { user_id: user.id } } },
        ];
      }
    }

    if (filters?.assigned_to_me) {
      where.assignees = {
        some: { user_id: user.id },
      };
    }

    const items = await prisma.workItem.findMany({
      where,
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
        project: {
          select: { id: true, name: true, status: true },
        },
        sprint: {
          select: { id: true, name: true, status: true },
        },
        parent: {
          select: { id: true, title: true, type: true, status: true, priority: true },
        },
        children: {
          include: {
            creator: {
              select: { id: true, name: true, email: true },
            },
            assignees: {
              include: {
                user: {
                  select: { id: true, name: true, email: true },
                },
              },
            },
          },
          orderBy: { created_at: 'asc' },
        },
        assignees: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        time_entries: {
          select: { id: true, duration_minutes: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return items.map((item) => this.formatWorkItem(item));
  }

  /**
   * Get single work item with full details
   */
  static async getWorkItemById(id: string, user: any) {
    const orgId = this.getUserOrgId(user);
    const isMgr = this.isManagerOrAdmin(user);

    const item = await prisma.workItem.findFirst({
      where: { id, organization_id: orgId },
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
        project: {
          select: { id: true, name: true, status: true },
        },
        sprint: {
          select: { id: true, name: true, status: true },
        },
        parent: {
          select: { id: true, title: true, type: true, status: true, priority: true },
        },
        children: {
          select: {
            id: true,
            title: true,
            type: true,
            status: true,
            priority: true,
            due_date: true,
          },
        },
        assignees: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        time_entries: {
          select: { id: true, duration_minutes: true },
        },
      },
    });

    if (!item) {
      throw new Error('Work item not found');
    }

    // Access authorization
    if (item.project_id) {
      if (!isMgr) {
        const isMember = await this.verifyProjectMembership(item.project_id, user.id, orgId);
        if (!isMember) {
          throw new Error('Forbidden: you are not a member of this project');
        }
      }
    } else {
      // Personal task: only creator or assignees
      const isCreator = item.created_by === user.id;
      const isAssignee = item.assignees.some((a) => a.user_id === user.id);
      if (!isCreator && !isAssignee && !isMgr) {
        throw new Error('Work item not found');
      }
    }

    return this.formatWorkItem(item);
  }

  /**
   * Update work item fields
   */
  static async updateWorkItem(id: string, user: any, input: UpdateWorkItemInput) {
    const orgId = this.getUserOrgId(user);
    const isMgr = this.isManagerOrAdmin(user);

    const currentItem = await prisma.workItem.findFirst({
      where: { id, organization_id: orgId },
      include: {
        assignees: true,
      },
    });

    if (!currentItem) {
      throw new Error('Work item not found');
    }

    // Access check
    if (currentItem.project_id) {
      if (!isMgr) {
        const isMember = await this.verifyProjectMembership(
          currentItem.project_id,
          user.id,
          orgId
        );
        if (!isMember) {
          throw new Error('Forbidden: you are not a member of this project');
        }
      }
    } else {
      // Personal task
      const isCreator = currentItem.created_by === user.id;
      const isAssignee = currentItem.assignees.some((a) => a.user_id === user.id);
      if (!isCreator && !isAssignee && !isMgr) {
        throw new Error('Forbidden: you cannot modify this personal task');
      }
    }

    const dataToUpdate: any = {};

    if (input.title !== undefined) {
      if (!input.title || typeof input.title !== 'string' || !input.title.trim()) {
        throw new Error('Title cannot be empty');
      }
      dataToUpdate.title = input.title.trim();
    }

    if (input.description !== undefined) {
      dataToUpdate.description = input.description ? input.description.trim() : null;
    }

    if (input.status !== undefined) {
      if (!Object.values(WorkItemStatus).includes(input.status)) {
        throw new Error(`Invalid status: ${input.status}`);
      }
      dataToUpdate.status = input.status;

      // Handle completed_at timestamp
      if (
        input.status === WorkItemStatus.COMPLETED &&
        currentItem.status !== WorkItemStatus.COMPLETED
      ) {
        dataToUpdate.completed_at = new Date();
      } else if (
        input.status !== WorkItemStatus.COMPLETED &&
        currentItem.status === WorkItemStatus.COMPLETED
      ) {
        dataToUpdate.completed_at = null;
      }
    }

    if (input.priority !== undefined) {
      if (!Object.values(WorkItemPriority).includes(input.priority)) {
        throw new Error(`Invalid priority: ${input.priority}`);
      }
      dataToUpdate.priority = input.priority;
    }

    if (input.start_date !== undefined) {
      dataToUpdate.start_date = input.start_date ? new Date(input.start_date) : null;
    }

    if (input.due_date !== undefined) {
      dataToUpdate.due_date = input.due_date ? new Date(input.due_date) : null;
    }

    if (input.story_points !== undefined) {
      dataToUpdate.story_points = input.story_points !== null && input.story_points !== undefined ? Math.max(0, parseInt(String(input.story_points), 10) || 0) : null;
    }

    if (input.sprint_id !== undefined) {
      if (
        input.sprint_id === null ||
        input.sprint_id === '' ||
        input.sprint_id === 'null' ||
        input.sprint_id === 'backlog'
      ) {
        dataToUpdate.sprint_id = null;
      } else {
        if (!currentItem.project_id) {
          throw new Error('Personal tasks cannot be assigned to a sprint');
        }
        const sprint = await prisma.sprint.findFirst({
          where: { id: input.sprint_id, organization_id: orgId },
        });
        if (!sprint) {
          throw new Error('Sprint not found in your organization');
        }
        if (sprint.project_id !== currentItem.project_id) {
          throw new Error('Cannot assign work item to a sprint belonging to a different project');
        }
        dataToUpdate.sprint_id = sprint.id;
      }
    }

    const effectiveType = input.type !== undefined ? input.type : currentItem.type;
    const effectiveParentId =
      input.parent_id !== undefined
        ? input.parent_id === '' || input.parent_id === 'null'
          ? null
          : input.parent_id
        : currentItem.parent_id;

    if (input.type !== undefined) {
      if (!Object.values(WorkItemType).includes(input.type)) {
        throw new Error(`Invalid work item type: ${input.type}`);
      }
    }

    if (input.type !== undefined || input.parent_id !== undefined) {
      // If setting parent_id to a new non-null value, assert no cycles
      if (
        input.parent_id !== undefined &&
        input.parent_id !== null &&
        input.parent_id !== '' &&
        input.parent_id !== 'null'
      ) {
        await this.assertNoCycles(id, input.parent_id);
      }

      // Validate hierarchy for effective type and effective parent
      await this.validateHierarchy(
        effectiveType,
        effectiveParentId,
        currentItem.project_id,
        orgId
      );

      // Check children compatibility if type changed
      if (input.type !== undefined && input.type !== currentItem.type) {
        const children = await prisma.workItem.findMany({
          where: { parent_id: id },
          select: { id: true, type: true },
        });

        if (children.length > 0) {
          if (input.type === WorkItemType.SUBTASK || input.type === WorkItemType.BUG) {
            throw new Error(
              `Cannot change type to ${input.type}: work item has ${children.length} child item(s), but ${input.type} cannot have children.`
            );
          }
          for (const child of children) {
            if (
              input.type === WorkItemType.EPIC &&
              child.type !== WorkItemType.STORY &&
              child.type !== WorkItemType.BUG
            ) {
              throw new Error(
                `Cannot change type to EPIC: existing child item is of type ${child.type}. EPIC only allows STORY or BUG.`
              );
            }
            if (
              input.type === WorkItemType.STORY &&
              child.type !== WorkItemType.TASK &&
              child.type !== WorkItemType.BUG
            ) {
              throw new Error(
                `Cannot change type to STORY: existing child item is of type ${child.type}. STORY only allows TASK or BUG.`
              );
            }
            if (input.type === WorkItemType.TASK && child.type !== WorkItemType.SUBTASK) {
              throw new Error(
                `Cannot change type to TASK: existing child item is of type ${child.type}. TASK only allows SUBTASK.`
              );
            }
          }
        }
        dataToUpdate.type = input.type;
      }

      if (input.parent_id !== undefined) {
        dataToUpdate.parent_id = effectiveParentId;
      }
    }

    if (input.assignee_ids !== undefined) {
      const cleanUserIds = Array.isArray(input.assignee_ids)
        ? [...new Set(input.assignee_ids.map((uid) => uid.trim()))].filter(Boolean)
        : [];

      // Check assignment authorization if assigning to others
      if (cleanUserIds.some((uid) => uid !== user.id)) {
        const project = currentItem.project_id
          ? await prisma.project.findUnique({
              where: { id: currentItem.project_id },
              select: { owner_id: true },
            })
          : null;
        if (!this.isAuthorizedToAssign(user, project?.owner_id, currentItem.created_by)) {
          throw new Error('Forbidden: you do not have permission to assign tasks to other users');
        }
      }

      if (cleanUserIds.length > 0) {
        const validUsers = await prisma.user.findMany({
          where: {
            id: { in: cleanUserIds },
            organization_id: orgId,
            is_active: true,
          },
          select: { id: true },
        });
        if (validUsers.length !== cleanUserIds.length) {
          throw new Error('One or more users do not exist in your organization');
        }

        if (currentItem.project_id) {
          const projectMembers = await prisma.projectMember.findMany({
            where: { project_id: currentItem.project_id, user_id: { in: cleanUserIds } },
            select: { user_id: true },
          });
          const memberIds = new Set(projectMembers.map((pm) => pm.user_id));
          for (const uid of cleanUserIds) {
            if (!memberIds.has(uid)) {
              throw new Error(`User ${uid} is not a member of project ${currentItem.project_id}`);
            }
          }
        }
      }

      await prisma.workItemAssignee.deleteMany({
        where: { work_item_id: id },
      });
      if (cleanUserIds.length > 0) {
        await prisma.workItemAssignee.createMany({
          data: cleanUserIds.map((uid) => ({
            work_item_id: id,
            user_id: uid,
          })),
        });
      }
    }

    const updated = await prisma.workItem.update({
      where: { id },
      data: dataToUpdate,
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
        project: {
          select: { id: true, name: true, status: true },
        },
        sprint: {
          select: { id: true, name: true, status: true },
        },
        parent: {
          select: { id: true, title: true, type: true, status: true, priority: true },
        },
        assignees: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        time_entries: {
          select: { id: true, duration_minutes: true },
        },
      },
    });

    return this.formatWorkItem(updated);
  }

  /**
   * Safe deletion of work item
   */
  static async deleteWorkItem(id: string, user: any) {
    const orgId = this.getUserOrgId(user);
    const isMgr = this.isManagerOrAdmin(user);

    const item = await prisma.workItem.findFirst({
      where: { id, organization_id: orgId },
      include: {
        children: { select: { id: true } },
      },
    });

    if (!item) {
      throw new Error('Work item not found');
    }

    if (item.project_id) {
      if (!isMgr && item.created_by !== user.id) {
        throw new Error('Forbidden: you do not have permission to delete this work item');
      }
    } else {
      if (item.created_by !== user.id) {
        throw new Error('Forbidden: only the creator can delete this personal task');
      }
    }

    // Hierarchy safe deletion: reject if children exist
    if (item.children && item.children.length > 0) {
      throw new Error(
        'Cannot delete work item with child items. Please reassign or delete children first.'
      );
    }

    await prisma.workItem.delete({
      where: { id },
    });

    return { message: 'Work item deleted successfully' };
  }

  /**
   * Add assignees to work item
   */
  static async addAssignees(id: string, user: any, userIds: string[]) {
    const orgId = this.getUserOrgId(user);
    const isMgr = this.isManagerOrAdmin(user);

    const item = await prisma.workItem.findFirst({
      where: { id, organization_id: orgId },
      include: { assignees: true },
    });

    if (!item) {
      throw new Error('Work item not found');
    }

    // Permission check
    if (item.project_id) {
      const project = await prisma.project.findUnique({
        where: { id: item.project_id },
        select: { owner_id: true },
      });
      const canAssign = this.isAuthorizedToAssign(user, project?.owner_id, item.created_by);
      if (!canAssign) {
        throw new Error('Forbidden: you do not have permission to assign tasks in this project');
      }
    } else {
      if (item.created_by !== user.id && !this.isAuthorizedToAssign(user, null, item.created_by)) {
        throw new Error('Forbidden: only creator or authorized manager can assign users to this personal task');
      }
    }

    const cleanUserIds = [...new Set(userIds.map((uid) => uid.trim()))].filter(Boolean);
    if (cleanUserIds.length === 0) {
      throw new Error('User IDs are required');
    }

    // Verify users in organization
    const validUsers = await prisma.user.findMany({
      where: {
        id: { in: cleanUserIds },
        organization_id: orgId,
        is_active: true,
      },
      select: { id: true },
    });

    if (validUsers.length !== cleanUserIds.length) {
      throw new Error('One or more users do not exist in your organization');
    }

    // If project task, verify project membership
    if (item.project_id) {
      const projectMembers = await prisma.projectMember.findMany({
        where: { project_id: item.project_id, user_id: { in: cleanUserIds } },
        select: { user_id: true },
      });
      const memberIds = new Set(projectMembers.map((pm) => pm.user_id));
      for (const uid of cleanUserIds) {
        if (!memberIds.has(uid)) {
          throw new Error(`User ${uid} is not a member of project ${item.project_id}`);
        }
      }
    }

    for (const uid of cleanUserIds) {
      await prisma.workItemAssignee.upsert({
        where: {
          work_item_id_user_id: {
            work_item_id: id,
            user_id: uid,
          },
        },
        update: {},
        create: {
          work_item_id: id,
          user_id: uid,
        },
      });
    }

    return this.getWorkItemById(id, user);
  }

  /**
   * Remove assignee from work item
   */
  static async removeAssignee(id: string, user: any, targetUserId: string) {
    const orgId = this.getUserOrgId(user);
    const isMgr = this.isManagerOrAdmin(user);

    const item = await prisma.workItem.findFirst({
      where: { id, organization_id: orgId },
      include: { assignees: true },
    });

    if (!item) {
      throw new Error('Work item not found');
    }

    // Permission check
    if (item.project_id) {
      const isSelf = user.id === targetUserId;
      if (!isMgr && !isSelf) {
        const isMember = await this.verifyProjectMembership(item.project_id, user.id, orgId);
        if (!isMember) {
          throw new Error('Forbidden: you are not a member of this project');
        }
      }
    } else {
      const isSelf = user.id === targetUserId;
      if (item.created_by !== user.id && !isSelf && !isMgr) {
        throw new Error('Forbidden: cannot modify assignees of this personal task');
      }
    }

    const existing = await prisma.workItemAssignee.findUnique({
      where: {
        work_item_id_user_id: {
          work_item_id: id,
          user_id: targetUserId,
        },
      },
    });

    if (!existing) {
      throw new Error('Assignee not found on this work item');
    }

    await prisma.workItemAssignee.delete({
      where: {
        work_item_id_user_id: {
          work_item_id: id,
          user_id: targetUserId,
        },
      },
    });

    return { message: 'Assignee removed successfully' };
  }
}
