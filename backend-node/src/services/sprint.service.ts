import { SprintStatus, WorkItemStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { cacheService } from './cache.service';

export interface CreateSprintInput {
  name: string;
  goal?: string | null;
  start_date?: string | Date | null;
  end_date?: string | Date | null;
}

export interface UpdateSprintInput {
  name?: string;
  goal?: string | null;
  start_date?: string | Date | null;
  end_date?: string | Date | null;
  status?: SprintStatus | string;
}

export interface WorkItemClosureAction {
  work_item_id: string;
  action: 'CARRY_FORWARD' | 'RETURN_TO_BACKLOG' | 'CANCEL';
  cancel_reason?: string;
  target_sprint_id?: string | null;
}

export class SprintService {
  static async isAuthorizedManagerOrLead(user: any, projectId: string): Promise<boolean> {
    if (!user) return false;
    if (this.isManagerOrAdmin(user)) return true;

    const roleNames: string[] = [];
    if (user.role) roleNames.push(user.role);
    if (Array.isArray(user.roles)) {
      user.roles.forEach((r: any) => {
        const name = r.role?.name || r.name;
        if (name) roleNames.push(name);
      });
    }
    if (roleNames.includes('TECH_LEAD') || roleNames.includes('PROJECT_MANAGER')) return true;

    if (user.is_tech_lead) return true;

    const membership = await prisma.projectMember.findFirst({
      where: { project_id: projectId, user_id: user.id },
      select: { project_role: true },
    });
    if (membership && (membership.project_role === 'TECH_LEAD' || membership.project_role === 'MANAGER')) {
      return true;
    }
    return false;
  }
  private static isManagerOrAdmin(user: any): boolean {
    if (!user) return false;
    if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'MANAGER') return true;
    if (Array.isArray(user.roles)) {
      return user.roles.some((r: any) => {
        const name = r.role?.name || r.name;
        return name === 'SUPER_ADMIN' || name === 'ADMIN' || name === 'MANAGER';
      });
    }
    return false;
  }

  private static getUserOrgId(user: any): string {
    if (!user.organization_id) {
      throw new Error('User does not belong to any organization');
    }
    return user.organization_id;
  }

  private static validateDates(
    startDateVal?: string | Date | null,
    endDateVal?: string | Date | null
  ): { startDate: Date | null; endDate: Date | null } {
    const startDate = startDateVal ? new Date(startDateVal) : null;
    const endDate = endDateVal ? new Date(endDateVal) : null;

    if (startDate && Number.isNaN(startDate.getTime())) {
      throw new Error('Invalid start date format');
    }
    if (endDate && Number.isNaN(endDate.getTime())) {
      throw new Error('Invalid end date format');
    }

    if (startDate && endDate && startDate > endDate) {
      throw new Error('Sprint start date cannot be later than its end date');
    }

    return { startDate, endDate };
  }

  /**
   * Create a new sprint in a project
   */
  static async createSprint(projectId: string, data: CreateSprintInput, user: any) {
    if (!projectId || projectId === 'undefined') {
      throw new Error('Project not found');
    }

    if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
      throw new Error('Sprint name is required');
    }

    let orgId = user.organization_id;
    if (!orgId && this.isManagerOrAdmin(user)) {
      const firstOrg = await prisma.organization.findFirst({ where: { is_active: true } });
      orgId = firstOrg?.id;
    }

    const where: any = { id: projectId };
    if (orgId) {
      where.organization_id = orgId;
    }

    const project = await prisma.project.findFirst({
      where,
    });
    if (!project) {
      throw new Error('Project not found');
    }
    if (project.methodology === 'KANBAN') {
      throw new Error('Sprints and cycles are not supported for Kanban projects. Kanban uses continuous flow without sprints.');
    }
    if (project.status === 'ARCHIVED' && !this.isManagerOrAdmin(user)) {
      throw new Error('Cannot create sprints or cycles in an archived project');
    }

    const { startDate, endDate } = this.validateDates(data.start_date, data.end_date);

    let status: SprintStatus = SprintStatus.PLANNED;
    if ((data as any).status) {
      const upper = String((data as any).status).toUpperCase().trim();
      if (upper === 'ACTIVE') status = SprintStatus.ACTIVE;
      else if (upper === 'COMPLETED') status = SprintStatus.COMPLETED;
      else if (upper === 'CANCELLED') status = SprintStatus.CANCELLED;
      else if (upper === 'PLANNED') status = SprintStatus.PLANNED;
    }

    if (status === SprintStatus.ACTIVE) {
      const existingActive = await prisma.sprint.findFirst({
        where: { project_id: projectId, status: SprintStatus.ACTIVE },
      });
      if (existingActive) {
        throw new Error('Another sprint is currently active in this project');
      }
    }

    return await prisma.sprint.create({
      data: {
        organization_id: project.organization_id,
        project_id: projectId,
        name: data.name.trim(),
        goal: data.goal ? data.goal.trim() : null,
        start_date: startDate,
        end_date: endDate,
        status,
      },
    });
  }

  /**
   * List all sprints for a project with metrics
   */
  static async listSprints(projectId: string, user: any) {
    if (!projectId || projectId === 'undefined') {
      throw new Error('Project not found');
    }

    let orgId = user.organization_id;
    if (!orgId && this.isManagerOrAdmin(user)) {
      const firstOrg = await prisma.organization.findFirst({ where: { is_active: true } });
      orgId = firstOrg?.id;
    }

    const where: any = { id: projectId };
    if (orgId) {
      where.organization_id = orgId;
    }

    const project = await prisma.project.findFirst({
      where,
    });
    if (!project) {
      throw new Error('Project not found');
    }

    if (project.methodology === 'KANBAN') {
      return [];
    }

    const cacheKey = `project:${projectId}:sprints`;
    return await cacheService.getOrSet(cacheKey, 15, async () => {
      const sprints = await prisma.sprint.findMany({
      where: { project_id: projectId, organization_id: project.organization_id },
      orderBy: [{ created_at: 'asc' }],
      include: {
        _count: {
          select: { work_items: true },
        },
        work_items: {
          select: {
            id: true,
            status: true,
            story_points: true,
            type: true,
            parent_id: true,
            due_date: true,
            time_entries: {
              select: {
                id: true,
                duration_minutes: true,
                date: true,
                user_id: true,
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
      },
    });

    const now = new Date();

    return sprints.map((s) => {
      // Find all parent IDs that have children in this sprint (to prevent double counting)
      const parentIdsWithChildren = new Set(s.work_items.map((w: any) => w.parent_id).filter(Boolean));
      // Eligible leaves are deliverables without children in this sprint, excluding Epics
      const eligibleLeaves = s.work_items.filter((w: any) => w.type !== 'EPIC' && !parentIdsWithChildren.has(w.id));

      const totalItems = eligibleLeaves.length;
      const completedItems = eligibleLeaves.filter((w) => w.status === WorkItemStatus.COMPLETED).length;
      const inProgressItems = eligibleLeaves.filter((w) => w.status === WorkItemStatus.IN_PROGRESS || w.status === WorkItemStatus.IN_REVIEW).length;
      const todoItems = eligibleLeaves.filter((w) => w.status === WorkItemStatus.TODO).length;
      const blockedItems = eligibleLeaves.filter((w) => w.status === WorkItemStatus.BLOCKED).length;

      const overdueItems = eligibleLeaves.filter((w: any) => {
        if (w.status === WorkItemStatus.COMPLETED) return false;
        if (w.due_date && new Date(w.due_date) < now) return true;
        if (s.end_date && w.due_date && new Date(w.due_date) > new Date(s.end_date)) return true;
        return false;
      }).length;

      const completionPercentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
      const totalPoints = eligibleLeaves.reduce((acc: number, w: any) => acc + (Number(w.story_points) || 0), 0);
      const completedPoints = eligibleLeaves
        .filter((w: any) => w.status === WorkItemStatus.COMPLETED)
        .reduce((acc: number, w: any) => acc + (Number(w.story_points) || 0), 0);

      // Aggregations for cycle time tracking
      let totalLoggedMinutes = 0;
      let cycleRangeLoggedMinutes = 0;
      const internTimeMap = new Map<string, { user_id: string; name: string; email: string | null; logged_minutes: number }>();

      const cycleStart = s.start_date ? new Date(s.start_date) : null;
      const cycleEnd = s.end_date ? new Date(s.end_date) : null;
      if (cycleEnd) {
        cycleEnd.setHours(23, 59, 59, 999);
      }

      s.work_items.forEach((item: any) => {
        const entries = item.time_entries || [];
        entries.forEach((entry: any) => {
          const mins = Number(entry.duration_minutes) || 0;
          totalLoggedMinutes += mins;

          if (cycleStart && cycleEnd) {
            const entryDate = new Date(entry.date);
            if (entryDate >= cycleStart && entryDate <= cycleEnd) {
              cycleRangeLoggedMinutes += mins;
            }
          }

          if (entry.user_id) {
            const existing = internTimeMap.get(entry.user_id) || {
              user_id: entry.user_id,
              name: entry.user?.name || 'Intern',
              email: entry.user?.email || null,
              logged_minutes: 0,
            };
            existing.logged_minutes += mins;
            internTimeMap.set(entry.user_id, existing);
          }
        });
      });

      const timeByIntern = Array.from(internTimeMap.values()).sort((a, b) => b.logged_minutes - a.logged_minutes);

      const { work_items, _count, ...rest } = s;
      return {
        ...rest,
        total_items: totalItems,
        completed_items: completedItems,
        in_progress_items: inProgressItems,
        todo_items: todoItems,
        blocked_items: blockedItems,
        overdue_items: overdueItems,
        completion_percentage: completionPercentage,
        total_points: totalPoints,
        completed_points: completedPoints,
        remaining_points: Math.max(0, totalPoints - completedPoints),
        incomplete_items: Math.max(0, totalItems - completedItems),
        total_logged_minutes: totalLoggedMinutes,
        total_logged_hours: +(totalLoggedMinutes / 60).toFixed(1),
        cycle_range_logged_minutes: cycleRangeLoggedMinutes,
        cycle_range_logged_hours: +(cycleRangeLoggedMinutes / 60).toFixed(1),
        time_by_intern: timeByIntern,
      };
    });
    });
  }

  /**
   * Get single sprint details with work items
   */
  static async getSprintById(projectId: string, sprintId: string, user: any) {
    if (!projectId || projectId === 'undefined') {
      throw new Error('Project not found');
    }
    if (!sprintId || sprintId === 'undefined') {
      throw new Error('Sprint not found');
    }

    let orgId = user.organization_id;
    if (!orgId && this.isManagerOrAdmin(user)) {
      const firstOrg = await prisma.organization.findFirst({ where: { is_active: true } });
      orgId = firstOrg?.id;
    }

    const where: any = { id: projectId };
    if (orgId) {
      where.organization_id = orgId;
    }

    const project = await prisma.project.findFirst({
      where,
    });
    if (!project) {
      throw new Error('Project not found');
    }
    if (project.methodology === 'KANBAN') {
      throw new Error('Sprints and cycles are not supported for Kanban projects.');
    }

    const sprint = await prisma.sprint.findFirst({
      where: { id: sprintId, project_id: projectId, organization_id: project.organization_id },
      include: {
        work_items: {
          include: {
            assignees: {
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
            },
            parent: {
              select: { id: true, title: true, type: true },
            },
            time_entries: {
              select: {
                id: true,
                duration_minutes: true,
                date: true,
                user_id: true,
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
      },
    });

    if (!sprint) {
      throw new Error('Sprint not found in this project');
    }

    const parentIdsWithChildren = new Set(sprint.work_items.map((w: any) => w.parent_id).filter(Boolean));
    const eligibleLeaves = sprint.work_items.filter((w: any) => w.type !== 'EPIC' && !parentIdsWithChildren.has(w.id));

    const totalItems = eligibleLeaves.length;
    const completedItems = eligibleLeaves.filter((w) => w.status === WorkItemStatus.COMPLETED).length;
    const inProgressItems = eligibleLeaves.filter((w) => w.status === WorkItemStatus.IN_PROGRESS || w.status === WorkItemStatus.IN_REVIEW).length;
    const todoItems = eligibleLeaves.filter((w) => w.status === WorkItemStatus.TODO).length;
    const blockedItems = eligibleLeaves.filter((w) => w.status === WorkItemStatus.BLOCKED).length;

    const now = new Date();
    const overdueItems = eligibleLeaves.filter((w: any) => {
      if (w.status === WorkItemStatus.COMPLETED) return false;
      if (w.due_date && new Date(w.due_date) < now) return true;
      if (sprint.end_date && w.due_date && new Date(w.due_date) > new Date(sprint.end_date)) return true;
      return false;
    }).length;

    const completionPercentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
    const totalPoints = eligibleLeaves.reduce((acc: number, w: any) => acc + (Number(w.story_points) || 0), 0);
    const completedPoints = eligibleLeaves
      .filter((w: any) => w.status === WorkItemStatus.COMPLETED)
      .reduce((acc: number, w: any) => acc + (Number(w.story_points) || 0), 0);

    let sprintTotalLogged = 0;
    let sprintCycleRangeLogged = 0;
    const sprintInternMap = new Map<string, { user_id: string; name: string; email: string | null; logged_minutes: number }>();
    const sprintStart = sprint.start_date ? new Date(sprint.start_date) : null;
    const sprintEnd = sprint.end_date ? new Date(sprint.end_date) : null;
    if (sprintEnd) {
      sprintEnd.setHours(23, 59, 59, 999);
    }

    const formattedWorkItems = sprint.work_items.map((w: any) => {
      const entries = w.time_entries || [];
      const logged_minutes = entries.reduce((acc: number, e: any) => acc + (Number(e.duration_minutes) || 0), 0);
      const userMap = new Map<string, { user_id: string; name: string; email: string | null; logged_minutes: number }>();

      entries.forEach((e: any) => {
        const mins = Number(e.duration_minutes) || 0;
        sprintTotalLogged += mins;

        if (sprintStart && sprintEnd) {
          const entryDate = new Date(e.date);
          if (entryDate >= sprintStart && entryDate <= sprintEnd) {
            sprintCycleRangeLogged += mins;
          }
        }

        if (e.user_id) {
          const ex = sprintInternMap.get(e.user_id) || {
            user_id: e.user_id,
            name: e.user?.name || 'Intern',
            email: e.user?.email || null,
            logged_minutes: 0,
          };
          ex.logged_minutes += mins;
          sprintInternMap.set(e.user_id, ex);

          const taskEx = userMap.get(e.user_id) || {
            user_id: e.user_id,
            name: e.user?.name || 'Intern',
            email: e.user?.email || null,
            logged_minutes: 0,
          };
          taskEx.logged_minutes += mins;
          userMap.set(e.user_id, taskEx);
        }
      });

      return {
        ...w,
        logged_minutes,
        time_by_intern: Array.from(userMap.values()),
      };
    });

    const timeByIntern = Array.from(sprintInternMap.values()).sort((a, b) => b.logged_minutes - a.logged_minutes);

    return {
      ...sprint,
      work_items: formattedWorkItems,
      total_items: totalItems,
      completed_items: completedItems,
      in_progress_items: inProgressItems,
      todo_items: todoItems,
      blocked_items: blockedItems,
      overdue_items: overdueItems,
      completion_percentage: completionPercentage,
      total_points: totalPoints,
      completed_points: completedPoints,
      remaining_points: Math.max(0, totalPoints - completedPoints),
      incomplete_items: Math.max(0, totalItems - completedItems),
      total_logged_minutes: sprintTotalLogged,
      total_logged_hours: +(sprintTotalLogged / 60).toFixed(1),
      cycle_range_logged_minutes: sprintCycleRangeLogged,
      cycle_range_logged_hours: +(sprintCycleRangeLogged / 60).toFixed(1),
      time_by_intern: timeByIntern,
    };
  }

  /**
   * Update sprint details
   */
  static async updateSprint(projectId: string, sprintId: string, data: UpdateSprintInput, user: any) {
    if (!projectId || projectId === 'undefined') {
      throw new Error('Project not found');
    }
    if (!sprintId || sprintId === 'undefined') {
      throw new Error('Sprint not found in this project');
    }

    let orgId = user.organization_id;
    if (!orgId && this.isManagerOrAdmin(user)) {
      const firstOrg = await prisma.organization.findFirst({ where: { is_active: true } });
      orgId = firstOrg?.id;
    }

    const where: any = { id: projectId };
    if (orgId) {
      where.organization_id = orgId;
    }

    const project = await prisma.project.findFirst({
      where,
    });
    if (!project) {
      throw new Error('Project not found');
    }
    if (project.methodology === 'KANBAN') {
      throw new Error('Sprints and cycles are not supported for Kanban projects.');
    }
    if (project.status === 'ARCHIVED' && !this.isManagerOrAdmin(user)) {
      throw new Error('Cannot update sprints or cycles in an archived project');
    }

    return await prisma.$transaction(async (tx) => {
      // If activating a sprint, lock project row to serialize concurrent sprint lifecycle requests
      if (data.status === SprintStatus.ACTIVE) {
        await tx.$executeRaw`SELECT id FROM "projects" WHERE id = ${projectId} FOR UPDATE;`;
      }

      const sprintWhere: any = { id: sprintId, project_id: projectId };
      if (project.organization_id) {
        sprintWhere.organization_id = project.organization_id;
      }

      const existing = await tx.sprint.findFirst({
        where: sprintWhere,
      });
      if (!existing) {
        throw new Error('Sprint not found in this project');
      }

      const updateData: any = {};
      if (data.name !== undefined) {
        if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
          throw new Error('Sprint name cannot be empty');
        }
        updateData.name = data.name.trim();
      }

      if (data.goal !== undefined) {
        updateData.goal = data.goal ? data.goal.trim() : null;
      }

      if (data.start_date !== undefined || data.end_date !== undefined) {
        const finalStart = data.start_date !== undefined ? data.start_date : existing.start_date;
        const finalEnd = data.end_date !== undefined ? data.end_date : existing.end_date;
        const { startDate, endDate } = this.validateDates(finalStart, finalEnd);
        updateData.start_date = startDate;
        updateData.end_date = endDate;
      }

      if (data.status !== undefined && data.status !== existing.status) {
        let candidate = String(data.status).toUpperCase().trim();
        if (candidate === 'IN_PROGRESS' || candidate === 'IN-PROGRESS') {
          candidate = 'ACTIVE';
        }

        const validStatuses = Object.values(SprintStatus) as string[];
        if (!validStatuses.includes(candidate)) {
          throw new Error(`Invalid sprint status: ${data.status}`);
        }

        if (candidate === SprintStatus.ACTIVE) {
          const activeSprint = await tx.sprint.findFirst({
            where: {
              project_id: projectId,
              status: SprintStatus.ACTIVE,
              id: { not: sprintId },
            },
          });
          if (activeSprint) {
            throw new Error(
              `Cannot activate sprint: Sprint "${activeSprint.name}" is currently active. Please complete or resolve it first.`
            );
          }
          if (!existing.start_date && !updateData.start_date) {
            updateData.start_date = new Date();
          }
        }

        if (candidate === SprintStatus.COMPLETED) {
          if (!existing.end_date && !updateData.end_date) {
            updateData.end_date = new Date();
          }
        }

        updateData.status = candidate as SprintStatus;
      }

      return await tx.sprint.update({
        where: { id: sprintId },
        data: updateData,
      });
    });
  }

  /**
   * Start a sprint (transactional with single active sprint guarantee and concurrency protection for Scrum)
   */
  static async startSprint(projectId: string, sprintId: string, user: any) {
    if (!projectId || projectId === 'undefined') {
      throw new Error('Project not found');
    }
    if (!sprintId || sprintId === 'undefined') {
      throw new Error('Sprint not found');
    }

    let orgId = user.organization_id;
    if (!orgId && this.isManagerOrAdmin(user)) {
      const firstOrg = await prisma.organization.findFirst({ where: { is_active: true } });
      orgId = firstOrg?.id;
    }

    const where: any = { id: projectId };
    if (orgId) {
      where.organization_id = orgId;
    }

    const project = await prisma.project.findFirst({
      where,
    });
    if (!project) {
      throw new Error('Project not found');
    }
    if (project.methodology === 'KANBAN') {
      throw new Error('Sprints and cycles are not supported for Kanban projects.');
    }
    if (project.status === 'ARCHIVED' && !this.isManagerOrAdmin(user)) {
      throw new Error('Cannot start sprints or cycles in an archived project');
    }

    return await prisma.$transaction(async (tx) => {
      // For Scrum: acquire exclusive lock on the project to serialize concurrent sprint activation requests
      await tx.$executeRaw`SELECT id FROM "projects" WHERE id = ${projectId} FOR UPDATE;`;

      const sprintWhere: any = { id: sprintId, project_id: projectId };
      if (project.organization_id) {
        sprintWhere.organization_id = project.organization_id;
      }

      const targetSprint = await tx.sprint.findFirst({
        where: sprintWhere,
      });
      if (!targetSprint) {
        throw new Error('Sprint not found in this project');
      }

      if (targetSprint.status === SprintStatus.ACTIVE) {
        return targetSprint;
      }
      if (targetSprint.status === SprintStatus.COMPLETED) {
        throw new Error('Cannot start a sprint that is already completed');
      }

      // Check if any other sprint/cycle in this project is currently ACTIVE
      const activeSprint = await tx.sprint.findFirst({
        where: {
          project_id: projectId,
          status: SprintStatus.ACTIVE,
          id: { not: sprintId },
        },
      });

      if (activeSprint) {
        throw new Error(
          `Cannot start sprint: Sprint "${activeSprint.name}" is currently active. Please complete or resolve it first.`
        );
      }

      return await tx.sprint.update({
        where: { id: sprintId },
        data: {
          status: SprintStatus.ACTIVE,
          start_date: targetSprint.start_date || new Date(),
        },
      });
    });
  }

  /**
   * Complete a sprint (transactional; handles unfinished items)
   */
  static async completeSprint(
    projectId: string,
    sprintId: string,
    options: {
      unfinished_action?: 'MOVE_TO_BACKLOG' | 'MOVE_TO_SPRINT' | 'CREATE_NEW_SPRINT' | 'KEEP_IN_CYCLE' | 'REOPEN' | 'CONTINUE';
      target_sprint_id?: string | null;
      new_sprint_name?: string | null;
      new_end_date?: string | Date | null;
      selected_task_ids?: string[] | null;
      item_actions?: WorkItemClosureAction[] | null;
    },
    user: any
  ) {
    if (!projectId || projectId === 'undefined') {
      throw new Error('Project not found');
    }
    if (!sprintId || sprintId === 'undefined') {
      throw new Error('Sprint not found in this project');
    }

    const isAuthorized = await this.isAuthorizedManagerOrLead(user, projectId);
    if (!isAuthorized) {
      const err: any = new Error('Forbidden: Only managers and tech leads can complete sprints or cycles');
      err.statusCode = 403;
      throw err;
    }

    let orgId = user.organization_id;
    if (!orgId && this.isManagerOrAdmin(user)) {
      const firstOrg = await prisma.organization.findFirst({ where: { is_active: true } });
      orgId = firstOrg?.id;
    }

    const where: any = { id: projectId };
    if (orgId) {
      where.organization_id = orgId;
    }

    const project = await prisma.project.findFirst({
      where,
    });
    if (!project) {
      throw new Error('Project not found');
    }
    if (project.methodology === 'KANBAN') {
      throw new Error('Sprints and cycles are not supported for Kanban projects.');
    }
    if (project.status === 'ARCHIVED' && !this.isManagerOrAdmin(user)) {
      throw new Error('Cannot complete sprints or cycles in an archived project');
    }

    return await prisma.$transaction(async (tx) => {
      const sprintWhere: any = { id: sprintId, project_id: projectId };
      if (project.organization_id) {
        sprintWhere.organization_id = project.organization_id;
      }

      const sprint = await tx.sprint.findFirst({
        where: sprintWhere,
      });
      if (!sprint) {
        throw new Error('Sprint not found in this project');
      }

      // Option A: Reopen or Continue Cycle with date adjustment
      if (options.unfinished_action === 'REOPEN' || options.unfinished_action === 'CONTINUE') {
        const updateData: any = { status: SprintStatus.ACTIVE };
        if (options.new_end_date) {
          const parsedEnd = new Date(options.new_end_date);
          if (!Number.isNaN(parsedEnd.getTime())) {
            updateData.end_date = parsedEnd;
          }
        }
        return await tx.sprint.update({
          where: { id: sprintId },
          data: updateData,
        });
      }

      if (sprint.status === SprintStatus.COMPLETED) {
        return sprint;
      }

      // Handle incomplete work items
      if (options.unfinished_action !== 'KEEP_IN_CYCLE') {
        let destinationSprintId: string | null = null;

        // If user chose to create a new cycle to receive carried forward items
        if (
          (options.unfinished_action === 'CREATE_NEW_SPRINT' || Boolean(options.new_sprint_name)) &&
          options.new_sprint_name?.trim()
        ) {
          const newSprint = await tx.sprint.create({
            data: {
              organization_id: project.organization_id,
              project_id: projectId,
              name: options.new_sprint_name.trim(),
              status: SprintStatus.PLANNED,
            },
          });
          destinationSprintId = newSprint.id;
        } else {
          const shouldMoveToSprint =
            (options.unfinished_action === 'MOVE_TO_SPRINT' || !options.unfinished_action) &&
            Boolean(options.target_sprint_id);

          if (shouldMoveToSprint && options.target_sprint_id) {
            if (options.target_sprint_id === sprintId) {
              throw new Error('Target sprint cannot be the sprint being completed');
            }
            const targetSprint = await tx.sprint.findFirst({
              where: {
                id: options.target_sprint_id,
                project_id: projectId,
                ...(project.organization_id ? { organization_id: project.organization_id } : {}),
              },
            });
            if (!targetSprint) {
              throw new Error('Target sprint for incomplete items not found in this project');
            }
            destinationSprintId = targetSprint.id;
          }
        }

        // Granular item actions (Carry Forward, Return to Backlog, Cancel)
        if (Array.isArray(options.item_actions) && options.item_actions.length > 0) {
          for (const act of options.item_actions) {
            if (!act || !act.work_item_id) continue;

            const item = await tx.workItem.findFirst({
              where: {
                id: act.work_item_id,
                sprint_id: sprintId,
                status: { not: WorkItemStatus.COMPLETED },
              },
            });
            if (!item) continue;

            if (act.action === 'CANCEL') {
              try {
                await tx.$executeRaw`UPDATE "work_items" SET "status" = 'CANCELLED'::"WorkItemStatus", "sprint_id" = NULL, "updated_at" = NOW() WHERE "id" = ${item.id};`;
              } catch (rawErr) {
                // If enum in DB lacks CANCELLED, set sprint_id to null and status to BLOCKED with cancel audit
                await tx.workItem.update({
                  where: { id: item.id },
                  data: { sprint_id: null },
                });
              }

              if (act.cancel_reason && act.cancel_reason.trim()) {
                await tx.workItemComment.create({
                  data: {
                    work_item_id: item.id,
                    author_id: user.id,
                    content: `[Sprint Closure] Task cancelled. Reason: ${act.cancel_reason.trim()}`,
                  },
                });
              }
            } else if (act.action === 'RETURN_TO_BACKLOG') {
              await tx.workItem.update({
                where: { id: item.id },
                data: { sprint_id: null },
              });
            } else if (act.action === 'CARRY_FORWARD') {
              let itemDestSprintId = destinationSprintId;
              if (act.target_sprint_id) {
                const itemTarget = await tx.sprint.findFirst({
                  where: {
                    id: act.target_sprint_id,
                    project_id: projectId,
                    ...(project.organization_id ? { organization_id: project.organization_id } : {}),
                  },
                });
                if (itemTarget) {
                  itemDestSprintId = itemTarget.id;
                }
              }
              await tx.workItem.update({
                where: { id: item.id },
                data: { sprint_id: itemDestSprintId },
              });
            }
          }

          // Any remaining incomplete items in sprint not explicitly handled in item_actions
          const handledIds = options.item_actions.map((a) => a.work_item_id);
          await tx.workItem.updateMany({
            where: {
              sprint_id: sprintId,
              id: { notIn: handledIds },
              status: { not: WorkItemStatus.COMPLETED },
            },
            data: {
              sprint_id: destinationSprintId,
            },
          });
        } else if (Array.isArray(options.selected_task_ids) && options.selected_task_ids.length > 0) {
          // If specific task IDs are selected, carry forward only those and leave others in backlog
          await tx.workItem.updateMany({
            where: {
              id: { in: options.selected_task_ids },
              sprint_id: sprintId,
              status: { not: WorkItemStatus.COMPLETED },
            },
            data: {
              sprint_id: destinationSprintId,
            },
          });
          // Unselected unfinished tasks move to backlog
          await tx.workItem.updateMany({
            where: {
              id: { notIn: options.selected_task_ids },
              sprint_id: sprintId,
              status: { not: WorkItemStatus.COMPLETED },
            },
            data: {
              sprint_id: null,
            },
          });
        } else {
          await tx.workItem.updateMany({
            where: {
              sprint_id: sprintId,
              status: { not: WorkItemStatus.COMPLETED },
            },
            data: {
              sprint_id: destinationSprintId,
            },
          });
        }
      }

      return await tx.sprint.update({
        where: { id: sprintId },
        data: {
          status: SprintStatus.COMPLETED,
          end_date: sprint.end_date || new Date(),
        },
      });
    });
  }

  /**
   * Reopen a completed sprint (ensures only one active sprint per project)
   */
  static async reopenSprint(projectId: string, sprintId: string, user: any) {
    if (!projectId || projectId === 'undefined') {
      throw new Error('Project not found');
    }
    if (!sprintId || sprintId === 'undefined') {
      throw new Error('Sprint not found in this project');
    }

    const isAuthorized = await this.isAuthorizedManagerOrLead(user, projectId);
    if (!isAuthorized) {
      const err: any = new Error('Forbidden: Only managers and tech leads can reopen sprints or cycles');
      err.statusCode = 403;
      throw err;
    }

    let orgId = user.organization_id;
    if (!orgId && this.isManagerOrAdmin(user)) {
      const firstOrg = await prisma.organization.findFirst({ where: { is_active: true } });
      orgId = firstOrg?.id;
    }

    const where: any = { id: projectId };
    if (orgId) {
      where.organization_id = orgId;
    }

    const project = await prisma.project.findFirst({
      where,
    });
    if (!project) {
      throw new Error('Project not found');
    }
    if (project.methodology === 'KANBAN') {
      throw new Error('Sprints and cycles are not supported for Kanban projects.');
    }
    if (project.status === 'ARCHIVED' && !this.isManagerOrAdmin(user)) {
      throw new Error('Cannot reopen sprints or cycles in an archived project');
    }

    return await prisma.$transaction(async (tx) => {
      // Serialize concurrent sprint status modifications
      await tx.$executeRaw`SELECT id FROM "projects" WHERE id = ${projectId} FOR UPDATE;`;

      const sprintWhere: any = { id: sprintId, project_id: projectId };
      if (project.organization_id) {
        sprintWhere.organization_id = project.organization_id;
      }

      const sprint = await tx.sprint.findFirst({
        where: sprintWhere,
      });
      if (!sprint) {
        throw new Error('Sprint not found in this project');
      }

      if (sprint.status === SprintStatus.ACTIVE) {
        return sprint;
      }

      // Enforce strictly one active sprint per project
      const activeSprint = await tx.sprint.findFirst({
        where: {
          project_id: projectId,
          status: SprintStatus.ACTIVE,
          id: { not: sprintId },
        },
      });

      if (activeSprint) {
        const err: any = new Error(
          `Cannot reopen sprint: Sprint "${activeSprint.name}" is currently active. Only one active sprint is allowed per project.`
        );
        err.statusCode = 400;
        throw err;
      }

      return await tx.sprint.update({
        where: { id: sprintId },
        data: {
          status: SprintStatus.ACTIVE,
        },
      });
    });
  }

  /**
   * Delete a sprint (disassociates work items safely back to backlog)
   */
  static async deleteSprint(projectId: string, sprintId: string, user: any) {
    if (!projectId || projectId === 'undefined') {
      throw new Error('Project not found');
    }
    if (!sprintId || sprintId === 'undefined') {
      throw new Error('Sprint not found in this project');
    }

    let orgId = user.organization_id;
    if (!orgId && this.isManagerOrAdmin(user)) {
      const firstOrg = await prisma.organization.findFirst({ where: { is_active: true } });
      orgId = firstOrg?.id;
    }

    const where: any = { id: projectId };
    if (orgId) {
      where.organization_id = orgId;
    }

    const project = await prisma.project.findFirst({
      where,
    });
    if (!project) {
      throw new Error('Project not found');
    }
    if (project.methodology === 'KANBAN') {
      throw new Error('Sprints and cycles are not supported for Kanban projects.');
    }
    if (project.status === 'ARCHIVED' && !this.isManagerOrAdmin(user)) {
      throw new Error('Cannot delete sprints or cycles in an archived project');
    }

    return await prisma.$transaction(async (tx) => {
      const sprintWhere: any = { id: sprintId, project_id: projectId };
      if (project.organization_id) {
        sprintWhere.organization_id = project.organization_id;
      }

      const sprint = await tx.sprint.findFirst({
        where: sprintWhere,
      });
      if (!sprint) {
        throw new Error('Sprint not found in this project');
      }

      // Return items to backlog
      await tx.workItem.updateMany({
        where: { sprint_id: sprintId },
        data: { sprint_id: null },
      });

      await tx.sprint.delete({
        where: { id: sprintId },
      });

      return { message: 'Sprint deleted successfully. All items returned to backlog.' };
    });
  }
}
