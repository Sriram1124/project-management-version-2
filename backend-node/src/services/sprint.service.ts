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
    const orgId = this.getUserOrgId(user);

    if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
      throw new Error('Sprint name is required');
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, organization_id: orgId },
    });
    if (!project) {
      throw new Error('Project not found');
    }

    const { startDate, endDate } = this.validateDates(data.start_date, data.end_date);

    return await prisma.sprint.create({
      data: {
        organization_id: project.organization_id,
        project_id: projectId,
        name: data.name.trim(),
        goal: data.goal ? data.goal.trim() : null,
        start_date: startDate,
        end_date: endDate,
        status: SprintStatus.PLANNED,
      },
    });
  }

  /**
   * List all sprints for a project with metrics
   */
  static async listSprints(projectId: string, user: any) {
    const orgId = this.getUserOrgId(user);

    const project = await prisma.project.findFirst({
      where: { id: projectId, organization_id: orgId },
    });
    if (!project) {
      throw new Error('Project not found');
    }

    const sprints = await prisma.sprint.findMany({
      where: { project_id: projectId, organization_id: orgId },
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
          },
        },
      },
    });

    return sprints.map((s) => {
      const totalItems = s._count.work_items;
      const completedItems = s.work_items.filter((w) => w.status === WorkItemStatus.COMPLETED).length;
      const completionPercentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
      const totalPoints = s.work_items.reduce((acc: number, w: any) => acc + (Number(w.story_points) || 0), 0);
      const completedPoints = s.work_items
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
    const orgId = this.getUserOrgId(user);

    const sprint = await prisma.sprint.findFirst({
      where: { id: sprintId, project_id: projectId, organization_id: orgId },
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

    const totalItems = sprint.work_items.length;
    const completedItems = sprint.work_items.filter((w) => w.status === WorkItemStatus.COMPLETED).length;
    const completionPercentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
    const totalPoints = sprint.work_items.reduce((acc: number, w: any) => acc + (Number(w.story_points) || 0), 0);
    const completedPoints = sprint.work_items
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
    const orgId = this.getUserOrgId(user);

    return await prisma.$transaction(async (tx) => {
      // If activating a sprint, lock project row to serialize concurrent sprint lifecycle requests
      if (data.status === SprintStatus.ACTIVE) {
        await tx.$executeRaw`SELECT id FROM "projects" WHERE id = ${projectId} FOR UPDATE;`;
      }

      const existing = await tx.sprint.findFirst({
        where: { id: sprintId, project_id: projectId, organization_id: orgId },
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
        const validStatuses = Object.values(SprintStatus) as string[];
        if (!validStatuses.includes(data.status)) {
          throw new Error(`Invalid sprint status: ${data.status}`);
        }

        if (data.status === SprintStatus.ACTIVE) {
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

        if (data.status === SprintStatus.COMPLETED) {
          if (!existing.end_date && !updateData.end_date) {
            updateData.end_date = new Date();
          }
        }

        updateData.status = data.status as SprintStatus;
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
    const orgId = this.getUserOrgId(user);

    return await prisma.$transaction(async (tx) => {
      // Acquire exclusive lock on the project to serialize concurrent sprint activation requests
      await tx.$executeRaw`SELECT id FROM "projects" WHERE id = ${projectId} FOR UPDATE;`;

      const targetSprint = await tx.sprint.findFirst({
        where: { id: sprintId, project_id: projectId, organization_id: orgId },
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
    const orgId = this.getUserOrgId(user);

    return await prisma.$transaction(async (tx) => {
      const sprint = await tx.sprint.findFirst({
        where: { id: sprintId, project_id: projectId, organization_id: orgId },
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
            organization_id: orgId,
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
    const orgId = this.getUserOrgId(user);

    return await prisma.$transaction(async (tx) => {
      const sprint = await tx.sprint.findFirst({
        where: { id: sprintId, project_id: projectId, organization_id: orgId },
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
