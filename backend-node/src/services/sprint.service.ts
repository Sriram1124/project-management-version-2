import { SprintStatus, WorkItemStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

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

export class SprintService {
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

    if (startDate && isNaN(startDate.getTime())) {
      throw new Error('Invalid start date format');
    }
    if (endDate && isNaN(endDate.getTime())) {
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
          },
        },
      },
    });

    return sprints.map((s) => {
      // Find all parent IDs that have children in this sprint (to prevent double counting)
      const parentIdsWithChildren = new Set(s.work_items.map((w: any) => w.parent_id).filter(Boolean));
      // Eligible leaves are deliverables without children in this sprint, excluding Epics
      const eligibleLeaves = s.work_items.filter((w: any) => w.type !== 'EPIC' && !parentIdsWithChildren.has(w.id));

      const totalItems = eligibleLeaves.length;
      const completedItems = eligibleLeaves.filter((w) => w.status === WorkItemStatus.COMPLETED).length;
      const completionPercentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
      const totalPoints = eligibleLeaves.reduce((acc: number, w: any) => acc + (Number(w.story_points) || 0), 0);
      const completedPoints = eligibleLeaves
        .filter((w: any) => w.status === WorkItemStatus.COMPLETED)
        .reduce((acc: number, w: any) => acc + (Number(w.story_points) || 0), 0);

      const { work_items, _count, ...rest } = s;
      return {
        ...rest,
        total_items: totalItems,
        completed_items: completedItems,
        completion_percentage: completionPercentage,
        total_points: totalPoints,
        completed_points: completedPoints,
      };
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
              select: { id: true, duration_minutes: true },
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
    const completionPercentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
    const totalPoints = eligibleLeaves.reduce((acc: number, w: any) => acc + (Number(w.story_points) || 0), 0);
    const completedPoints = eligibleLeaves
      .filter((w: any) => w.status === WorkItemStatus.COMPLETED)
      .reduce((acc: number, w: any) => acc + (Number(w.story_points) || 0), 0);

    return {
      ...sprint,
      total_items: totalItems,
      completed_items: completedItems,
      completion_percentage: completionPercentage,
      total_points: totalPoints,
      completed_points: completedPoints,
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
   * Start a sprint (transactional with single active sprint guarantee and concurrency protection)
   */
  static async startSprint(projectId: string, sprintId: string, user: any) {
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

    return await prisma.$transaction(async (tx) => {
      // Acquire exclusive lock on the project to serialize concurrent sprint activation requests
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

      // Check if any other sprint in this project is currently ACTIVE
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
      unfinished_action?: 'MOVE_TO_BACKLOG' | 'MOVE_TO_SPRINT';
      target_sprint_id?: string | null;
    },
    user: any
  ) {
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

      if (sprint.status === SprintStatus.COMPLETED) {
        return sprint;
      }

      // Handle incomplete work items
      let destinationSprintId: string | null = null;
      const shouldMoveToSprint = (options.unfinished_action === 'MOVE_TO_SPRINT' || !options.unfinished_action) && Boolean(options.target_sprint_id);
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

      // Move unfinished items (status != COMPLETED)
      await tx.workItem.updateMany({
        where: {
          sprint_id: sprintId,
          status: { not: WorkItemStatus.COMPLETED },
        },
        data: {
          sprint_id: destinationSprintId,
        },
      });

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
