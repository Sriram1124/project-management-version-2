import { ActionItemPriority, ActionItemStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface CreateActionItemInput {
  title: string;
  description?: string | null;
  project_id: string;
  assignee_id?: string | null;
  status?: ActionItemStatus;
  priority?: ActionItemPriority;
  due_date?: Date | string | null;
  organization_id: string;
  creator_id: string;
}

export interface UpdateActionItemInput {
  title?: string;
  description?: string | null;
  assignee_id?: string | null;
  status?: ActionItemStatus;
  priority?: ActionItemPriority;
  due_date?: Date | string | null;
}

export class ActionItemService {
  static async list(params: {
    organization_id: string;
    project_id?: string;
    assignee_id?: string;
    status?: ActionItemStatus;
  }) {
    const where: any = {
      organization_id: params.organization_id,
    };

    if (params.project_id) {
      where.project_id = params.project_id;
    }

    if (params.assignee_id) {
      where.assignee_id = params.assignee_id;
    }

    if (params.status) {
      where.status = params.status;
    }

    return prisma.actionItem.findMany({
      where,
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  static async getById(id: string, organization_id: string) {
    const item = await prisma.actionItem.findFirst({
      where: { id, organization_id },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!item) {
      throw new Error('Action item not found');
    }

    return item;
  }

  static async create(data: CreateActionItemInput) {
    return prisma.actionItem.create({
      data: {
        title: data.title,
        description: data.description || null,
        project_id: data.project_id,
        assignee_id: data.assignee_id || null,
        status: data.status || ActionItemStatus.OPEN,
        priority: data.priority || ActionItemPriority.MEDIUM,
        due_date: data.due_date ? new Date(data.due_date) : null,
        organization_id: data.organization_id,
        creator_id: data.creator_id,
      },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  static async update(id: string, organization_id: string, data: UpdateActionItemInput) {
    await this.getById(id, organization_id);

    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.assignee_id !== undefined) updateData.assignee_id = data.assignee_id;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.due_date !== undefined) {
      updateData.due_date = data.due_date ? new Date(data.due_date) : null;
    }

    return prisma.actionItem.update({
      where: { id },
      data: updateData,
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  static async delete(id: string, organization_id: string) {
    await this.getById(id, organization_id);
    return prisma.actionItem.delete({
      where: { id },
    });
  }
}

