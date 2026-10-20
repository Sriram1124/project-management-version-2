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

  private static isIntern(user: any): boolean {
    const role = String(user.role || '').toUpperCase();
    if (role === 'INTERN') return true;
    if (Array.isArray(user.roles)) {
      const hasIntern = user.roles.some(
        (ur: any) => (ur.role?.name || ur.name || '').toUpperCase() === 'INTERN'
      );
      if (hasIntern && !this.isManagerOrAdmin(user)) return true;
    }
    return false;
  }

  private static async canManageProject(
    user: any,
    projectId: string,
    orgId: string
  ): Promise<boolean> {
    if (this.isManagerOrAdmin(user)) return true;

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

    const project = await prisma.project.findFirst({
      where: { id: projectId, organization_id: orgId },
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
    if (membership && (membership.project_role === 'TECH_LEAD' || membership.project_role === 'MANAGER')) {
      return true;
    }

    return false;
  }

  static async create(data: CreateActionItemInput, user?: any) {
    if (user) {
      const canManage = await this.canManageProject(user, data.project_id, data.organization_id);
      if (this.isIntern(user) && !canManage) {
        throw new Error('Forbidden: interns do not have permission to create action items');
      }
    }

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

  static async update(id: string, organization_id: string, data: UpdateActionItemInput, user?: any) {
    const existing = await this.getById(id, organization_id);

    if (user && this.isIntern(user)) {
      const canManage = await this.canManageProject(user, existing.project_id, organization_id);
      if (!canManage) {
        // Intern can only update their own assigned action item
        if (existing.assignee_id !== user.id) {
          throw new Error('Forbidden: you can only update action items assigned to you');
        }

        // Interns cannot modify title, description, assignee, priority, or due_date
        if (data.title !== undefined || data.description !== undefined || data.assignee_id !== undefined || data.priority !== undefined || data.due_date !== undefined) {
          throw new Error('Forbidden: interns can only update progress or status of assigned action items');
        }
      }
    }

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

  static async delete(id: string, organization_id: string, user?: any) {
    const existing = await this.getById(id, organization_id);

    if (user) {
      const canManage = await this.canManageProject(user, existing.project_id, organization_id);
      const isMgr = this.isManagerOrAdmin(user);
      const isCreator = existing.creator_id === user.id;

      if (this.isIntern(user) && !canManage) {
        throw new Error('Forbidden: interns are not permitted to delete action items');
      }

      if (!isMgr && !canManage && !isCreator) {
        throw new Error('Forbidden: you do not have permission to delete this action item');
      }
    }

    return prisma.actionItem.delete({
      where: { id },
    });
  }
}

