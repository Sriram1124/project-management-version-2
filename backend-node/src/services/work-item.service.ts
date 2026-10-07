import { WorkItemType, WorkItemStatus, WorkItemPriority } from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface CreateWorkItemInput {
  title: string;
  type: WorkItemType;
  project_id?: string | null;
  parent_id?: string | null;
  description?: string | null;
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  start_date?: string | Date | null;
  due_date?: string | Date | null;
  assignee_ids?: string[];
}

export interface UpdateWorkItemInput {
  title?: string;
  description?: string | null;
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  start_date?: string | Date | null;
  due_date?: string | Date | null;
}

export interface WorkItemFilter {
  project_id?: string;
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
   * Project -> Tasks -> Subtasks
   * Epic -> Story -> Task -> Subtask also supported.
   * BUG is standalone
   * Parent must belong to same project, or both must be personal.
   */
  private static async validateHierarchy(
    type: WorkItemType,
    parentId: string | null | undefined,
    projectId: string | null | undefined,
    orgId: string
  ): Promise<void> {
    if (!parentId) {
      if (type === WorkItemType.SUBTASK) {
        throw new Error('SUBTASK must have a parent of type TASK');
      }
      return;
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

    // Type hierarchy check
    switch (type) {
      case WorkItemType.EPIC:
        throw new Error('EPIC cannot have a parent work item');

      case WorkItemType.STORY:
        if (parent.type !== WorkItemType.EPIC) {
          throw new Error('STORY must have a parent of type EPIC');
        }
        break;

      case WorkItemType.TASK:
        if (parent.type !== WorkItemType.STORY) {
          throw new Error('TASK must have a parent of type STORY');
        }
        break;

      case WorkItemType.SUBTASK:
        if (parent.type !== WorkItemType.TASK) {
          throw new Error('SUBTASK must have a parent of type TASK');
        }
        break;

      case WorkItemType.BUG:
        throw new Error('BUG is a standalone work item type and cannot have a parent');

      default:
        throw new Error(`Invalid work item type: ${type}`);
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

    return {
      ...item,
      is_overdue,
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

    const status = data.status || WorkItemStatus.TODO;
    const priority = data.priority || WorkItemPriority.MEDIUM;
    const completedAt = status === WorkItemStatus.COMPLETED ? new Date() : null;

    const workItem = await prisma.workItem.create({
      data: {
        organization_id: orgId,
        project_id: projectId,
        parent_id: parentId,
        created_by: user.id,
        type: data.type,
        title: data.title.trim(),
        description: data.description ? data.description.trim() : null,
        status,
        priority,
        start_date: data.start_date ? new Date(data.start_date) : null,
        due_date: data.due_date ? new Date(data.due_date) : null,
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
