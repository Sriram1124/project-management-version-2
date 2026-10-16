import { WorkItemType, WorkItemStatus, WorkItemPriority, SprintStatus, ProjectStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ProjectHealthService } from './project-health.service';

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

export interface WorkItemAnalyticsFilter {
  user_id?: string;
  project_id?: string;
  sprint_id?: string;
  cohort_id?: string;
  start_date?: string;
  end_date?: string;
}

export class WorkItemService {
  /**
   * Helper to ensure user belongs to an organization
   */
  private static getUserOrgId(user: any): string {
    if (user?.organization_id) return user.organization_id;
    if (user?.organization?.id) return user.organization.id;
    throw new Error('User does not belong to any organization');
  }

  /**
   * Helper to check if user has admin or manager role
   */
  private static isManagerOrAdmin(user: any): boolean {
    if (!user) return false;
    const r = String(user.role || '').toUpperCase();
    if (r === 'ADMIN' || r === 'MANAGER' || r === 'SUPER_ADMIN') return true;
    if (Array.isArray(user.roles)) {
      return user.roles.some((ur: any) => {
        const name = String(ur.role?.name || ur.name || ur || '').toUpperCase();
        return name === 'ADMIN' || name === 'MANAGER' || name === 'SUPER_ADMIN';
      });
    }
    return false;
  }

  /**
   * Helper to resolve a member's effective project permissions
   */
  static async getMemberProjectPermissions(userId: string, projectId: string) {
    if (!userId || !projectId) {
      return {
        isMember: false,
        isOwner: false,
        isCustomRole: false,
        roleName: null,
        permissions: new Set<string>(),
      };
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { owner_id: true, organization_id: true },
    });

    const isOwner = Boolean(project && project.owner_id === userId);

    const membership = await prisma.projectMember.findFirst({
      where: {
        project_id: projectId,
        user_id: userId,
      },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    const isMember = Boolean(membership || isOwner);
    const isCustomRole = Boolean(membership?.role?.is_custom);
    const roleName = membership?.role?.name || membership?.project_role || null;
    const permissions = new Set<string>();

    if (membership?.role?.permissions) {
      for (const rp of membership.role.permissions) {
        if (rp.permission?.name) {
          permissions.add(rp.permission.name);
        }
      }
    }

    return {
      isMember,
      isOwner,
      isCustomRole,
      roleName,
      permissions,
      membership,
    };
  }

  /**
   * Helper to verify if user has authority to assign tasks
   * (Admins, Managers, Tech Leads, Project Owners, or users with TASK_ASSIGN permission)
   */
  private static async isAuthorizedToAssign(
    user: any,
    projectOwnerId?: string | null,
    creatorId?: string | null,
    projectId?: string | null
  ): Promise<boolean> {
    if (this.isManagerOrAdmin(user)) return true;

    // Check project custom role permissions if projectId is known
    if (projectId) {
      const permInfo = await this.getMemberProjectPermissions(user.id, projectId);
      if (permInfo.isCustomRole) {
        return permInfo.permissions.has('TASK_ASSIGN');
      }
    }

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

    if (projectId) {
      const canManage = await this.canManageProject(user, projectId);
      if (canManage) return true;
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
   * Helper to check if a user is an authorized manager or tech lead for a project.
   */
  static async canManageProject(
    user: any,
    projectId?: string | null,
    orgId?: string
  ): Promise<boolean> {
    if (this.isManagerOrAdmin(user)) return true;

    // Check organization-level role for TECH_LEAD
    const roleNames: string[] = [];
    if (user.role) roleNames.push(user.role);
    if (Array.isArray(user.roles)) {
      user.roles.forEach((ur: any) => {
        if (ur.role?.name) roleNames.push(ur.role.name);
        if (ur.name) roleNames.push(ur.name);
      });
    }

    if (projectId) {
      const actualOrgId = orgId || this.getUserOrgId(user);
      const project = await prisma.project.findFirst({
        where: { id: projectId, organization_id: actualOrgId },
        select: { owner_id: true },
      });
      if (project && project.owner_id === user.id) {
        return true;
      }

      const membership = await prisma.projectMember.findFirst({
        where: {
          project_id: projectId,
          user_id: user.id,
        },
      });
      if (
        membership &&
        (membership.project_role === 'TECH_LEAD' ||
          membership.project_role === 'MANAGER' ||
          roleNames.includes('TECH_LEAD') ||
          roleNames.includes('PROJECT_MANAGER'))
      ) {
        return true;
      }
    } else if (roleNames.includes('TECH_LEAD') || roleNames.includes('PROJECT_MANAGER')) {
      return true;
    }

    return false;
  }

  /**
   * Check if user is an INTERN
   */
  private static isIntern(user: any): boolean {
    if (this.isManagerOrAdmin(user)) return false;
    const roleNames: string[] = [];
    if (user.role) roleNames.push(String(user.role).toUpperCase());
    if (Array.isArray(user.roles)) {
      user.roles.forEach((ur: any) => {
        if (ur.role?.name) roleNames.push(String(ur.role.name).toUpperCase());
        if (ur.name) roleNames.push(String(ur.name).toUpperCase());
      });
    }
    if (
      roleNames.includes('ADMIN') ||
      roleNames.includes('MANAGER') ||
      roleNames.includes('SUPER_ADMIN') ||
      roleNames.includes('TECH_LEAD')
    ) {
      return false;
    }
    return roleNames.includes('INTERN');
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
   * In a Project (projectId != null): EPIC, STORY, or BUG are permitted at root (standalone stories and bugs permitted without an Epic).
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
        if (
          type !== WorkItemType.EPIC &&
          type !== WorkItemType.STORY &&
          type !== WorkItemType.BUG
        ) {
          throw new Error(
            `${type} must have a parent work item. Only EPIC, STORY, and BUG can be created at the project root.`
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
          id: a.user_id,
          user_id: a.user_id,
          name: a.user?.name || a.name || null,
          email: a.user?.email || a.email || null,
        }))
      : [];

    const formattedChildren = Array.isArray(item.children)
      ? item.children.map((child: any) => this.formatWorkItem(child))
      : [];

    const logged_minutes = Array.isArray(item.time_entries)
      ? item.time_entries.reduce((sum: number, entry: any) => sum + (Number(entry.duration_minutes) || 0), 0)
      : 0;

    const primaryAssignee = formattedAssignees[0] || null;

    return {
      ...item,
      is_overdue,
      logged_minutes,
      assignees: formattedAssignees,
      assignee: primaryAssignee,
      assignee_id: primaryAssignee?.user_id || null,
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

    // Story points validation:
    // For TASK, SUBTASK, BUG: story_points is mandatory and must be a positive integer greater than 0.
    const isTaskLike =
      data.type === WorkItemType.TASK ||
      data.type === WorkItemType.SUBTASK ||
      data.type === WorkItemType.BUG;

    if (isTaskLike) {
      const sp = Number(data.story_points);
      if (
        data.story_points === undefined ||
        data.story_points === null ||
        isNaN(sp) ||
        !Number.isInteger(sp) ||
        sp <= 0
      ) {
        throw new Error(
          'Story points are mandatory for tasks, subtasks, and bugs and must be a positive integer greater than 0.'
        );
      }
    } else if (data.type === WorkItemType.STORY) {
      if (data.story_points !== undefined && data.story_points !== null) {
        const sp = Number(data.story_points);
        if (isNaN(sp) || !Number.isInteger(sp) || sp < 0) {
          throw new Error('Story points for stories must be a non-negative integer.');
        }
      }
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
      if (project.status === ProjectStatus.ARCHIVED) {
        throw new Error('Cannot create work items in an archived project');
      }

      const isMgr = this.isManagerOrAdmin(user);
      const permInfo = await this.getMemberProjectPermissions(user.id, projectId);

      if (!isMgr && !permInfo.isMember && !permInfo.isOwner) {
        throw new Error('Forbidden: you are not a member of this project');
      }

      if (permInfo.isCustomRole && !isMgr && !permInfo.isOwner) {
        if (!permInfo.permissions.has('TASK_CREATE')) {
          throw new Error('Forbidden: your role does not have permission to create work items in this project');
        }
      }
    }

    // Validate hierarchy
    await this.validateHierarchy(data.type, parentId, projectId, orgId);

    // Intern workflow permission check:
    // Interns can only create child Tasks, Subtasks, or Bugs under an existing parent unless they can manage the project or have custom role
    if (this.isIntern(user) && projectId) {
      const permInfo = await this.getMemberProjectPermissions(user.id, projectId);
      if (!permInfo.isCustomRole) {
        const canManage = await this.canManageProject(user, projectId, orgId);
        if (!canManage) {
          if (!parentId) {
            throw new Error('Forbidden: interns cannot create root work items. Only child tasks or bugs are permitted.');
          }
          if (data.type === WorkItemType.EPIC || data.type === WorkItemType.STORY) {
            throw new Error(`Forbidden: interns cannot create ${data.type} items. Only child tasks or bugs are permitted.`);
          }
        }
      }
    }

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
        if (!(await this.isAuthorizedToAssign(user, project?.owner_id, user.id, projectId))) {
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
      if (sprint.status === SprintStatus.COMPLETED) {
        throw new Error('Cannot add new work items to a completed sprint or cycle');
      }
      sprintId = sprint.id;
    }
    // Note: Sprint assignment is strictly independent of parent Epic/Story relationships.
    // Child items do NOT automatically inherit their parent's sprint.

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
            story_points: true,
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
    let orgId = user?.organization_id;
    if (!orgId && this.isManagerOrAdmin(user)) {
      const firstOrg = await prisma.organization.findFirst({ where: { is_active: true } });
      orgId = firstOrg?.id;
    }
    const isMgr = this.isManagerOrAdmin(user);

    const whereItem: any = { id };
    if (orgId) {
      whereItem.organization_id = orgId;
    }

    const currentItem = await prisma.workItem.findFirst({
      where: whereItem,
      include: {
        assignees: true,
      },
    });

    if (!currentItem) {
      throw new Error('Work item not found');
    }

    // Access check
    if (currentItem.project_id) {
      const project = await prisma.project.findUnique({
        where: { id: currentItem.project_id },
        select: { owner_id: true, status: true },
      });
      if (project?.status === ProjectStatus.ARCHIVED) {
        throw new Error('Cannot modify work items in an archived project');
      }

      const permInfo = await this.getMemberProjectPermissions(user.id, currentItem.project_id);
      if (!isMgr && !permInfo.isOwner && !permInfo.isMember) {
        throw new Error('Forbidden: you are not a member of this project');
      }

      // Granular permissions for custom roles
      if (permInfo.isCustomRole && !isMgr && !permInfo.isOwner) {
        if (!permInfo.permissions.has('TASK_UPDATE') && !permInfo.permissions.has('TASK_STATUS_TRANSITION')) {
          throw new Error('Forbidden: your role does not have permission to update work items in this project');
        }
        if (!permInfo.permissions.has('TASK_UPDATE') && permInfo.permissions.has('TASK_STATUS_TRANSITION')) {
          if (
            input.title !== undefined ||
            input.description !== undefined ||
            input.priority !== undefined ||
            input.story_points !== undefined ||
            input.due_date !== undefined ||
            input.start_date !== undefined ||
            input.sprint_id !== undefined ||
            input.parent_id !== undefined ||
            input.type !== undefined
          ) {
            throw new Error('Forbidden: your role only has permission to transition task status, not modify task details');
          }
        }
        if (input.assignee_ids !== undefined && !permInfo.permissions.has('TASK_ASSIGN')) {
          throw new Error('Forbidden: your role does not have permission to assign or reassign tasks');
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

    // Role-based field level permissions check for INTERN role
    const isInternUser = this.isIntern(user);
    if (isInternUser) {
      let isCustom = false;
      if (currentItem.project_id) {
        const pInfo = await this.getMemberProjectPermissions(user.id, currentItem.project_id);
        isCustom = pInfo.isCustomRole;
      }

      if (!isCustom) {
        const canManage = currentItem.project_id
          ? await this.canManageProject(user, currentItem.project_id, orgId)
          : false;

        if (!canManage) {
          const isAssignedToUser = currentItem.assignees.some((a) => a.user_id === user.id);
          if (!isAssignedToUser) {
            throw new Error('Forbidden: you can only update tasks assigned to you');
          }

        // Interns cannot modify restricted fields
        if (input.assignee_ids !== undefined) {
          throw new Error('Forbidden: interns cannot reassign tasks');
        }
        if (input.sprint_id !== undefined) {
          throw new Error('Forbidden: interns cannot change sprint assignments');
        }
        if (input.parent_id !== undefined) {
          throw new Error('Forbidden: interns cannot alter parent-child or epic assignments');
        }
        if (input.story_points !== undefined) {
          throw new Error('Forbidden: interns cannot modify story points');
        }
        if (input.priority !== undefined) {
          throw new Error('Forbidden: interns cannot modify task priority');
        }
        if (input.due_date !== undefined || input.start_date !== undefined) {
          throw new Error('Forbidden: interns cannot modify task due dates or schedules');
        }
        if (input.title !== undefined) {
          throw new Error('Forbidden: interns cannot modify task title');
        }
        if (input.description !== undefined) {
          throw new Error('Forbidden: interns cannot modify task description');
        }
        if (input.type !== undefined) {
          throw new Error('Forbidden: interns cannot modify task type');
        }
      }
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

    const effectiveType = input.type !== undefined ? input.type : currentItem.type;

    if (input.story_points !== undefined) {
      const isTaskLike =
        effectiveType === WorkItemType.TASK ||
        effectiveType === WorkItemType.SUBTASK ||
        effectiveType === WorkItemType.BUG;

      if (isTaskLike) {
        const sp = Number(input.story_points);
        if (
          input.story_points === null ||
          isNaN(sp) ||
          !Number.isInteger(sp) ||
          sp <= 0
        ) {
          throw new Error(
            'Story points are mandatory for tasks, subtasks, and bugs and must be a positive integer greater than 0.'
          );
        }
        dataToUpdate.story_points = sp;
      } else {
        const sp = input.story_points !== null ? Number(input.story_points) : null;
        if (sp !== null && (isNaN(sp) || !Number.isInteger(sp) || sp < 0)) {
          throw new Error('Story points must be a non-negative integer.');
        }
        dataToUpdate.story_points = sp ?? 0;
      }
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
        if (sprint.status === SprintStatus.COMPLETED && currentItem.sprint_id !== sprint.id) {
          throw new Error('Cannot move work items into a completed sprint or cycle');
        }
        dataToUpdate.sprint_id = sprint.id;
      }
    }

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
        if (!(await this.isAuthorizedToAssign(user, project?.owner_id, currentItem.created_by, currentItem.project_id))) {
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
      const project = await prisma.project.findUnique({
        where: { id: item.project_id },
        select: { status: true, owner_id: true },
      });
      if (project?.status === ProjectStatus.ARCHIVED) {
        throw new Error('Cannot delete work items in an archived project');
      }

      const permInfo = await this.getMemberProjectPermissions(user.id, item.project_id);
      if (!isMgr && !permInfo.isOwner) {
        if (permInfo.isCustomRole) {
          if (!permInfo.permissions.has('TASK_DELETE')) {
            throw new Error('Forbidden: your role does not have permission to delete work items in this project');
          }
        } else {
          const canManage = await this.canManageProject(user, item.project_id, orgId);
          if (!canManage && item.created_by !== user.id) {
            throw new Error('Forbidden: you do not have permission to delete this work item');
          }
        }
      }
    } else {
      if (this.isIntern(user)) {
        throw new Error('Forbidden: interns do not have permission to delete work items');
      }
      if (item.created_by !== user.id && !isMgr) {
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
    let orgId = user?.organization_id;
    if (!orgId && this.isManagerOrAdmin(user)) {
      const firstOrg = await prisma.organization.findFirst({ where: { is_active: true } });
      orgId = firstOrg?.id;
    }
    const isMgr = this.isManagerOrAdmin(user);

    const whereItem: any = { id };
    if (orgId) {
      whereItem.organization_id = orgId;
    }

    const item = await prisma.workItem.findFirst({
      where: whereItem,
      include: { assignees: true },
    });

    if (!item) {
      throw new Error('Work item not found');
    }

    // Interns cannot assign or reassign work items unless they have custom role or can manage project
    if (this.isIntern(user)) {
      let isCustom = false;
      if (item.project_id) {
        const pInfo = await this.getMemberProjectPermissions(user.id, item.project_id);
        isCustom = pInfo.isCustomRole && pInfo.permissions.has('TASK_ASSIGN');
      }
      if (!isCustom) {
        const canManage = item.project_id
          ? await this.canManageProject(user, item.project_id, orgId)
          : false;
        if (!canManage) {
          throw new Error('Forbidden: interns cannot assign work items');
        }
      }
    }

    // Permission check
    if (item.project_id) {
      const project = await prisma.project.findUnique({
        where: { id: item.project_id },
        select: { owner_id: true },
      });
      const canAssign = await this.isAuthorizedToAssign(user, project?.owner_id, item.created_by, item.project_id);
      if (!canAssign) {
        throw new Error('Forbidden: you do not have permission to assign tasks in this project');
      }
    } else {
      if (item.created_by !== user.id && !(await this.isAuthorizedToAssign(user, null, item.created_by))) {
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
    let orgId = user?.organization_id;
    if (!orgId && this.isManagerOrAdmin(user)) {
      const firstOrg = await prisma.organization.findFirst({ where: { is_active: true } });
      orgId = firstOrg?.id;
    }
    const isMgr = this.isManagerOrAdmin(user);

    const whereItem: any = { id };
    if (orgId) {
      whereItem.organization_id = orgId;
    }

    const item = await prisma.workItem.findFirst({
      where: whereItem,
      include: { assignees: true },
    });

    if (!item) {
      throw new Error('Work item not found');
    }

    // Interns cannot modify assignees unless authorized to manage the project or have custom role with TASK_ASSIGN
    if (this.isIntern(user)) {
      let isCustom = false;
      if (item.project_id) {
        const pInfo = await this.getMemberProjectPermissions(user.id, item.project_id);
        isCustom = pInfo.isCustomRole && pInfo.permissions.has('TASK_ASSIGN');
      }
      if (!isCustom) {
        const canManage = item.project_id
          ? await this.canManageProject(user, item.project_id, orgId)
          : false;
        if (!canManage) {
          throw new Error('Forbidden: interns cannot reassign work items');
        }
      }
    }

    // Permission check
    if (item.project_id) {
      const isSelf = user.id === targetUserId;
      if (!isMgr && !isSelf) {
        const project = await prisma.project.findUnique({
          where: { id: item.project_id },
          select: { owner_id: true },
        });
        const isOwner = project && project.owner_id === user.id;
        const isMember = await this.verifyProjectMembership(item.project_id, user.id, orgId);
        if (!isMember && !isOwner) {
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

  /**
   * Helper to check if user has organization-level TECH_LEAD role
   */
  private static isOrgTechLead(user: any): boolean {
    const roleNames: string[] = [];
    if (user.role) roleNames.push(String(user.role).toUpperCase());
    if (Array.isArray(user.roles)) {
      user.roles.forEach((ur: any) => {
        if (ur.role?.name) roleNames.push(String(ur.role.name).toUpperCase());
        if (ur.name) roleNames.push(String(ur.name).toUpperCase());
      });
    }
    return roleNames.includes('TECH_LEAD');
  }

  /**
   * Get all project IDs that the user is explicitly authorized to lead or manage
   */
  static async getAuthorizedLeadProjectIds(user: any, orgId: string): Promise<string[]> {
    if (this.isManagerOrAdmin(user)) {
      const allProjects = await prisma.project.findMany({
        where: { organization_id: orgId },
        select: { id: true },
      });
      return allProjects.map((p) => p.id);
    }

    const orgTechLead = this.isOrgTechLead(user);

    const [leadMemberships, ownedProjects] = await Promise.all([
      prisma.projectMember.findMany({
        where: {
          user_id: user.id,
          project: { organization_id: orgId },
          ...(orgTechLead ? {} : { project_role: { in: ['TECH_LEAD', 'MANAGER'] } }),
        },
        select: { project_id: true, project_role: true },
      }),
      prisma.project.findMany({
        where: {
          owner_id: user.id,
          organization_id: orgId,
        },
        select: { id: true },
      }),
    ]);

    const projectIds = new Set<string>();
    for (const m of leadMemberships) {
      if (orgTechLead || m.project_role === 'TECH_LEAD' || m.project_role === 'MANAGER') {
        projectIds.add(m.project_id);
      }
    }
    for (const p of ownedProjects) {
      projectIds.add(p.id);
    }

    return Array.from(projectIds);
  }

  /**
   * Get comprehensive task analytics scoped to the authenticated user or requested scope
   */
  static async getAnalytics(user: any, filters?: WorkItemAnalyticsFilter) {
    let orgId = user?.organization_id;
    if (!orgId && this.isManagerOrAdmin(user)) {
      const firstOrg = await prisma.organization.findFirst({ where: { is_active: true } });
      orgId = firstOrg?.id;
    }
    const isMgr = this.isManagerOrAdmin(user);
    const authorizedLeadProjects = orgId ? await this.getAuthorizedLeadProjectIds(user, orgId) : [];
    const isLeadAnyProject = authorizedLeadProjects.length > 0;

    let targetUserId: string | null = null;
    let isActingAsLead = false;

    if (filters?.project_id) {
      const whereProject: any = { id: filters.project_id };
      if (orgId) {
        whereProject.organization_id = orgId;
      }
      const project = await prisma.project.findFirst({
        where: whereProject,
        select: { id: true, name: true, owner_id: true },
      });
      if (!project) {
        throw new Error('Project not found in your organization');
      }

      if (isMgr || project.owner_id === user.id || authorizedLeadProjects.includes(filters.project_id)) {
        // Authorized Manager or Tech Lead for this project
        isActingAsLead = true;
        if (filters?.user_id) {
          targetUserId = filters.user_id;
        }
      } else {
        // Regular intern or user not authorized to lead this project
        const isMember = await this.verifyProjectMembership(filters.project_id, user.id, orgId);
        if (!isMember) {
          throw new Error('Forbidden: you are not authorized to access analytics for this project');
        }
        if (filters?.user_id && filters.user_id !== user.id) {
          throw new Error('Forbidden: interns can only view their own performance analytics');
        }
        targetUserId = user.id;
      }
    } else {
      // No specific project provided in filters
      if (isMgr || isLeadAnyProject) {
        isActingAsLead = true;
        if (filters?.user_id) {
          targetUserId = filters.user_id;
        }
      } else {
        // Regular intern with no lead projects
        if (filters?.user_id && filters.user_id !== user.id) {
          throw new Error('Forbidden: interns can only view their own performance analytics');
        }
        targetUserId = user.id;
      }
    }

    const where: any = {};
    if (orgId) {
      where.organization_id = orgId;
    }
    if (targetUserId) {
      where.assignees = { some: { user_id: targetUserId } };
    }
    if (filters?.project_id) {
      where.project_id = filters.project_id;
    } else if (isMgr) {
      // Manager across all projects in org
    } else if (isLeadAnyProject) {
      where.project_id = { in: authorizedLeadProjects };
    } else {
      where.OR = [
        { project_id: null },
        { project: { members: { some: { user_id: user.id } } } },
      ];
    }
    if (filters?.sprint_id && filters.sprint_id !== 'ALL' && filters.sprint_id !== 'null') {
      where.sprint_id = filters.sprint_id;
    }

    // Work items
    const items = await prisma.workItem.findMany({
      where,
      include: {
        project: { select: { id: true, name: true } },
        sprint: { select: { id: true, name: true } },
        assignees: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        time_entries: targetUserId
          ? {
              where: { user_id: targetUserId },
              select: { id: true, duration_minutes: true, date: true, start_time: true, end_time: true },
            }
          : {
              select: { id: true, duration_minutes: true, date: true, start_time: true, end_time: true },
            },
      },
      orderBy: { created_at: 'desc' },
    });

    // Time entries for actual work time
    const timeWhere: any = { organization_id: orgId };
    if (targetUserId) {
      timeWhere.user_id = targetUserId;
    }
    if (filters?.project_id) {
      timeWhere.project_id = filters.project_id;
    }
    if (filters?.start_date && filters?.end_date) {
      timeWhere.date = {
        gte: new Date(filters.start_date),
        lte: new Date(filters.end_date),
      };
    }
    const timeEntries = await prisma.timeEntry.findMany({
      where: timeWhere,
      select: {
        id: true,
        task_id: true,
        duration_minutes: true,
        date: true,
        start_time: true,
        end_time: true,
      },
      orderBy: { start_time: 'desc' },
    });

    const now = new Date();
    const total = items.length;
    const completed = items.filter((w) => w.status === WorkItemStatus.COMPLETED).length;
    const in_progress = items.filter((w) => w.status === WorkItemStatus.IN_PROGRESS).length;
    const in_review = items.filter((w) => w.status === WorkItemStatus.IN_REVIEW).length;
    const todo = items.filter((w) => w.status === WorkItemStatus.TODO).length;
    const blocked = items.filter((w) => w.status === WorkItemStatus.BLOCKED).length;

    // Helper: effective deadline (if midnight UTC date-only, extend to end-of-day UTC so it is not prematurely overdue during its deadline day)
    const getEffectiveDeadline = (dueDate: Date): Date => {
      const d = new Date(dueDate);
      if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
        d.setUTCHours(23, 59, 59, 999);
      }
      return d;
    };

    // Current Overdue Work (Requirement 2):
    // Count incomplete work items with a valid due date that has passed within reporting scope
    const scheduled_items_count = items.filter((w) => {
      if (!w.due_date) return false;
      const d = new Date(w.due_date);
      return !isNaN(d.getTime());
    }).length;

    const overdue_items = items.filter((w) => {
      if (w.status === WorkItemStatus.COMPLETED) return false;
      if (!w.due_date) return false;
      const dueDate = new Date(w.due_date);
      if (isNaN(dueDate.getTime())) return false;
      return now > getEffectiveDeadline(dueDate);
    });
    const past_due = overdue_items.length;
    const overdue_rate = scheduled_items_count > 0 ? Math.round((past_due / scheduled_items_count) * 100) : 0;
    const overdue_label = past_due > 0
      ? `${past_due} overdue of ${scheduled_items_count} with deadlines (${overdue_rate}%)`
      : scheduled_items_count > 0
      ? `0 overdue of ${scheduled_items_count} with deadlines (0%)`
      : '0 overdue · No items with deadlines';

    // Completed On-Time Rate (Requirement 1):
    // Formula = (Eligible completed items delivered on or before due date / All eligible completed items with valid due date) * 100
    // Exclude items without valid due dates or reliable completion timestamps from the denominator.
    // Do not assume completed item was delivered on time simply because status is Completed.
    const eligible_completed_items = items.filter((w) => {
      if (w.status !== WorkItemStatus.COMPLETED) return false;
      if (!w.due_date) return false;
      const dueDate = new Date(w.due_date);
      if (isNaN(dueDate.getTime())) return false;
      const compDate = w.completed_at ? new Date(w.completed_at) : (w.updated_at ? new Date(w.updated_at) : null);
      if (!compDate || isNaN(compDate.getTime())) return false;
      return true;
    });

    const completed_with_due_date_count = eligible_completed_items.length;

    const completed_on_time_items = eligible_completed_items.filter((w) => {
      const dueDate = new Date(w.due_date!);
      const effectiveDeadline = getEffectiveDeadline(dueDate);
      const compDate = w.completed_at ? new Date(w.completed_at) : new Date(w.updated_at);
      return compDate <= effectiveDeadline;
    });

    const completed_on_time_count = completed_on_time_items.length;

    // Display N/A (null in JSON) if no eligible completed items exist, not 0% or 100%
    const completed_on_time_rate = completed_with_due_date_count > 0
      ? Math.round((completed_on_time_count / completed_with_due_date_count) * 100)
      : null;

    const completed_on_time_label = completed_with_due_date_count > 0
      ? `${completed_on_time_count} of ${completed_with_due_date_count} eligible completed items delivered on time`
      : 'No eligible completed items with due dates';

    const completion_rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const on_time_rate = completed_on_time_rate; // backwards compatibility

    const status_counts = {
      COMPLETED: completed,
      IN_PROGRESS: in_progress,
      IN_REVIEW: in_review,
      TODO: todo,
      BLOCKED: blocked,
    };

    const priority_counts = {
      URGENT: items.filter((w) => w.priority === WorkItemPriority.URGENT).length,
      HIGH: items.filter((w) => w.priority === WorkItemPriority.HIGH).length,
      MEDIUM: items.filter((w) => w.priority === WorkItemPriority.MEDIUM).length,
      LOW: items.filter((w) => w.priority === WorkItemPriority.LOW).length,
    };

    const type_counts = {
      EPIC: items.filter((w) => w.type === WorkItemType.EPIC).length,
      STORY: items.filter((w) => w.type === WorkItemType.STORY).length,
      TASK: items.filter((w) => w.type === WorkItemType.TASK).length,
      SUBTASK: items.filter((w) => w.type === WorkItemType.SUBTASK).length,
      BUG: items.filter((w) => w.type === WorkItemType.BUG).length,
    };

    // Calculate story points strictly from eligible leaf deliverables (Story, Task, Subtask, Bug)
    // without double-counting parent Epics or parent Stories with estimated child tasks
    const parentIdsWithChildren = new Set(items.map((w) => w.parent_id).filter(Boolean));
    const eligibleLeaves = items.filter((w) => {
      if (w.type === WorkItemType.EPIC) return false;
      if (!parentIdsWithChildren.has(w.id)) return true;
      // If item has children in current scope, check if children have story points
      const children = items.filter((c) => c.parent_id === w.id);
      const childPoints = children.reduce((sum, c) => sum + (Number(c.story_points) || 0), 0);
      return childPoints === 0 && Number(w.story_points || 0) > 0;
    });

    const story_points_total = eligibleLeaves.reduce((sum, w) => sum + (Number(w.story_points) || 0), 0);
    const story_points_completed = eligibleLeaves
      .filter((w) => w.status === WorkItemStatus.COMPLETED)
      .reduce((sum, w) => sum + (Number(w.story_points) || 0), 0);
    const story_points_remaining = Math.max(0, story_points_total - story_points_completed);
    const story_points_progress =
      story_points_total > 0 ? Math.round((story_points_completed / story_points_total) * 100) : null;

    const estimated_items_count = eligibleLeaves.filter((w) => Number(w.story_points || 0) > 0).length;
    const total_leaf_items_count = eligibleLeaves.length;
    const has_estimated_work = story_points_total > 0;
    const is_partially_estimated = estimated_items_count > 0 && estimated_items_count < total_leaf_items_count;

    // Project Health & Schedule Risk Assessment (Requirement 3):
    // Use the authoritative ProjectHealthService rather than arbitrary frontend thresholds.
    // Work-item overdue status is kept strictly separate from project health.
    let project_health: 'HEALTHY' | 'AT_RISK' | 'CRITICAL' | 'NOT_ASSESSED' = 'HEALTHY';
    let project_health_reasons: string[] = [];
    let project_health_warnings: string[] = [];

    if (filters?.project_id) {
      const projRecord = await prisma.project.findUnique({
        where: { id: filters.project_id },
        select: {
          id: true,
          name: true,
          status: true,
          start_date: true,
          end_date: true,
          work_items: {
            select: {
              id: true,
              title: true,
              type: true,
              status: true,
              priority: true,
              due_date: true,
              story_points: true,
              parent_id: true,
              sprint_id: true,
            },
          },
          sprints: {
            select: {
              id: true,
              status: true,
              start_date: true,
              end_date: true,
            },
          },
        },
      });

      if (projRecord) {
        const classified = ProjectHealthService.classifyProjectHealth(projRecord);
        project_health = classified.health as any;
        project_health_reasons = classified.reasons || [];
        project_health_warnings = classified.warnings || [];
      }
    } else {
      // Portfolio scope (All Projects or Cohort)
      try {
        const portfolio = await ProjectHealthService.getPortfolioHealth(user, {
          cohort_id: filters?.cohort_id,
        });
        if (portfolio.summary.critical > 0) {
          project_health = 'CRITICAL';
          project_health_reasons.push(`${portfolio.summary.critical} project(s) in critical health`);
        } else if (portfolio.summary.at_risk > 0) {
          project_health = 'AT_RISK';
          project_health_reasons.push(`${portfolio.summary.at_risk} project(s) at risk`);
        } else if (portfolio.summary.healthy > 0) {
          project_health = 'HEALTHY';
          project_health_reasons.push(`All ${portfolio.summary.healthy} active project(s) healthy`);
        } else {
          project_health = 'NOT_ASSESSED';
          project_health_reasons.push('No projects assessed with estimated work');
        }
      } catch {
        project_health = 'HEALTHY';
      }
    }

    const delivery_risk = project_health;
    const delivery_risk_reasons = project_health_reasons.length > 0 ? project_health_reasons : ['All deliverables on track'];

    const time_entries_count = timeEntries.length;
    const has_time_entries = time_entries_count > 0;
    const total_logged_minutes = timeEntries.reduce((sum, e) => sum + (Number(e.duration_minutes) || 0), 0);
    const total_logged_hours = +(total_logged_minutes / 60).toFixed(1);

    // Map time entries by task for accurate individual task effort
    const taskLoggedMinutesMap = new Map<string, number>();
    for (const e of timeEntries) {
      if (e.task_id) {
        taskLoggedMinutesMap.set(
          e.task_id,
          (taskLoggedMinutesMap.get(e.task_id) || 0) + Number(e.duration_minutes || 0)
        );
      }
    }

    // Formatted work item details for individual performance records
    const task_breakdown = items.map((w) => {
      const has_valid_due_date = Boolean(w.due_date && !isNaN(new Date(w.due_date).getTime()));
      const effective_deadline = has_valid_due_date ? getEffectiveDeadline(new Date(w.due_date!)) : null;
      const is_past_due = Boolean(
        w.status !== WorkItemStatus.COMPLETED &&
          effective_deadline &&
          now > effective_deadline
      );
      const compDate = w.completed_at ? new Date(w.completed_at) : (w.updated_at ? new Date(w.updated_at) : null);
      const is_eligible_completed = Boolean(
        w.status === WorkItemStatus.COMPLETED &&
          effective_deadline &&
          compDate &&
          !isNaN(compDate.getTime())
      );
      const was_completed_on_time = is_eligible_completed ? compDate! <= effective_deadline! : null;
      const logged_minutes = taskLoggedMinutesMap.get(w.id) || 0;

      return {
        id: w.id,
        title: w.title,
        type: w.type,
        status: w.status,
        priority: w.priority,
        due_date: w.due_date,
        completed_at: w.completed_at,
        updated_at: w.updated_at,
        story_points: w.story_points || 0,
        project_id: w.project_id,
        project_name: w.project?.name || null,
        sprint_id: w.sprint_id,
        sprint_name: w.sprint?.name || null,
        is_past_due,
        was_completed_on_time,
        is_eligible_completed,
        logged_minutes,
        logged_hours: +(logged_minutes / 60).toFixed(1),
        assignees: w.assignees?.map((a: any) => ({
          id: a.user?.id || a.user_id,
          user_id: a.user?.id || a.user_id,
          name: a.user?.name,
          email: a.user?.email,
        })) || [],
      };
    });

    // Daily trends over the last 14 days
    const trends: { date: string; completed: number; logged_hours: number }[] = [];
    const dateCursor = new Date();
    dateCursor.setHours(0, 0, 0, 0);
    for (let i = 13; i >= 0; i--) {
      const d = new Date(dateCursor);
      d.setDate(d.getDate() - i);
      const dStr = d.toISOString().split('T')[0];
      const nextD = new Date(d);
      nextD.setDate(nextD.getDate() + 1);

      const dayCompleted = items.filter((w) => {
        if (w.status !== WorkItemStatus.COMPLETED) return false;
        const compDate = w.completed_at || w.updated_at;
        return compDate && new Date(compDate) >= d && new Date(compDate) < nextD;
      }).length;

      const dayMinutes = timeEntries
        .filter((e) => e.date && new Date(e.date) >= d && new Date(e.date) < nextD)
        .reduce((sum, e) => sum + (Number(e.duration_minutes) || 0), 0);

      trends.push({
        date: dStr,
        completed: dayCompleted,
        logged_hours: +(dayMinutes / 60).toFixed(1),
      });
    }

    // Projects accessible for filtering
    const accessibleProjects = isMgr
      ? await prisma.project.findMany({
          where: { organization_id: orgId },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : isLeadAnyProject
      ? await prisma.project.findMany({
          where: {
            organization_id: orgId,
            id: { in: authorizedLeadProjects },
          },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : await prisma.project.findMany({
          where: {
            organization_id: orgId,
            members: { some: { user_id: user.id } },
          },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        });

    // Sprints for selected project
    let accessibleSprints: { id: string; name: string }[] = [];
    if (filters?.project_id) {
      accessibleSprints = await prisma.sprint.findMany({
        where: {
          organization_id: orgId,
          project_id: filters.project_id,
        },
        select: { id: true, name: true },
        orderBy: { created_at: 'asc' },
      });
    }

    // Members for selected project or single lead project
    let projectMembers: any[] = [];
    const targetProjectForMembers = filters?.project_id || (isLeadAnyProject && authorizedLeadProjects.length === 1 ? authorizedLeadProjects[0] : null);
    if (targetProjectForMembers) {
      const pMembers = await prisma.projectMember.findMany({
        where: { project_id: targetProjectForMembers },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      });
      projectMembers = pMembers.map((pm) => ({
        id: pm.user.id,
        user_id: pm.user.id,
        name: pm.user.name,
        email: pm.user.email,
        project_role: pm.project_role,
      }));
    }

    return {
      is_tech_lead: isActingAsLead || isLeadAnyProject,
      lead_project_ids: authorizedLeadProjects,
      total,
      completed,
      in_progress,
      in_review,
      todo,
      blocked,
      past_due,
      overdue_items_count: past_due,
      scheduled_items_count,
      overdue_rate,
      overdue_label,
      delivery_risk,
      delivery_risk_reasons,
      project_health,
      project_health_reasons,
      project_health_warnings,
      completed_on_time: completed_on_time_count,
      completed_on_time_count,
      completed_with_due_date_count,
      completed_on_time_rate,
      completed_on_time_label,
      completion_rate,
      on_time_rate: completed_on_time_rate,
      status_counts,
      priority_counts,
      type_counts,
      story_points_total,
      story_points_completed,
      story_points_remaining,
      story_points_progress,
      estimated_items_count,
      total_leaf_items_count,
      has_estimated_work,
      is_partially_estimated,
      time_entries_count,
      has_time_entries,
      total_logged_minutes,
      total_logged_hours,
      task_breakdown,
      trends,
      members: projectMembers,
      filters: {
        projects: accessibleProjects,
        sprints: accessibleSprints,
      },
    };
  }
}
