import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ProjectStatus, ProjectMethodology } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { StorageService } from './storage.service';
import { ProjectFile } from '../models/project-file.model';
import { ObjectStorageService } from './object-storage.service';

export interface CreateProjectInput {
  name: string;
  description?: string;
  methodology: ProjectMethodology | string;
  start_date?: string | null;
  end_date?: string | null;
  status?: ProjectStatus;
  owner_id?: string;
  owner_ids?: string[];
  member_ids?: string[];
  organization_id?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  methodology?: ProjectMethodology | string;
  start_date?: string | null;
  end_date?: string | null;
  status?: ProjectStatus;
  owner_id?: string;
}

export interface DocumentInput {
  name: string;
  document_type: string;
  storage_key: string;
}

export class ProjectService {
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
   * Helper to check if user has admin, manager or super admin role
   */
  private static isManagerOrAdmin(user: any): boolean {
    if (!user) return false;
    const roleStr = typeof user.role === 'string' ? user.role : user.role?.name;
    if (roleStr === 'ADMIN' || roleStr === 'MANAGER' || roleStr === 'SUPER_ADMIN') return true;
    if (Array.isArray(user.roles)) {
      return user.roles.some(
        (ur: any) =>
          ur.role?.name === 'ADMIN' ||
          ur.role?.name === 'MANAGER' ||
          ur.role?.name === 'SUPER_ADMIN' ||
          ur.name === 'ADMIN' ||
          ur.name === 'MANAGER' ||
          ur.name === 'SUPER_ADMIN'
      );
    }
    return false;
  }

  /**
   * Helper to check if user has super admin role
   */
  private static isSuperAdmin(user: any): boolean {
    if (!user) return false;
    const roleStr = typeof user.role === 'string' ? user.role : user.role?.name;
    if (roleStr === 'SUPER_ADMIN') return true;
    if (Array.isArray(user.roles)) {
      return user.roles.some((ur: any) => ur.role?.name === 'SUPER_ADMIN' || ur.name === 'SUPER_ADMIN');
    }
    return false;
  }

  /**
   * List all projects scoped to the user's organization
   */
  static async listProjects(user: any, filters?: { status?: string; my?: boolean }) {
    const orgId = this.getUserOrgId(user);
    const where: any = { organization_id: orgId };

    if (filters?.status) {
      if (!Object.values(ProjectStatus).includes(filters.status as ProjectStatus)) {
        throw new Error(`Invalid project status: ${filters.status}`);
      }
      where.status = filters.status as ProjectStatus;
    }

    if (filters?.my) {
      where.OR = [
        { owner_id: user.id },
        { owners: { some: { user_id: user.id } } },
        { members: { some: { user_id: user.id } } },
      ];
    }

    const projects = await prisma.project.findMany({
      where,
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        owners: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        documents: {
          select: {
            id: true,
            name: true,
            document_type: true,
            storage_key: true,
            created_at: true,
            updated_at: true,
          },
        },
        _count: {
          select: {
            members: true,
            documents: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return projects.map((p: any) => ({
      ...p,
      owners: p.owners && p.owners.length > 0
        ? p.owners.map((o: any) => o.user || o)
        : (p.owner ? [p.owner] : []),
    }));
  }

  /**
   * Get single project by ID with organization access check
   */
  static async getProjectById(projectId: string, user: any) {
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
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        owners: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        documents: {
          orderBy: { created_at: 'desc' },
        },
        _count: {
          select: {
            members: true,
            documents: true,
          },
        },
      },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    const isMgr = this.isManagerOrAdmin(user);
    const isOwner = project.owner_id === user.id || project.owners?.some((o: any) => (o.user_id || o.id) === user.id);
    if (!isMgr && !isOwner) {
      const isMember = project.members.some((m) => m.user_id === user.id);
      if (!isMember) {
        throw new Error('Forbidden: you are not a member of this project');
      }
    }

    if (project.owners && project.owners.length > 0) {
      (project as any).owners = project.owners.map((o: any) => o.user || o);
    } else if (project.owner) {
      (project as any).owners = [project.owner];
    } else {
      (project as any).owners = [];
    }

    if (process.env.ENABLE_MONGODB_PROJECT_FILES === 'true') {
      try {
        const mongoDocs = await ProjectFile.find({
          project_id: projectId,
          is_archived: false,
        })
          .sort({ created_at: -1 })
          .lean();

        (project as any).documents = mongoDocs.map((doc: any) => ({
          ...doc,
          id: doc.file_id,
        }));
        if ((project as any)._count) {
          (project as any)._count.documents = mongoDocs.length;
        }
      } catch (err) {
        console.warn('[ProjectService] Failed to load documents from MongoDB in getProjectById (fallback active):', err);
      }
    }

    return project;
  }

  /**
   * Create a new project scoped to the authenticated user's organization
   */
  static async createProject(data: CreateProjectInput, user: any) {
    let orgId = user.organization_id || data.organization_id;
    if (!orgId && this.isManagerOrAdmin(user)) {
      const firstOrg = await prisma.organization.findFirst({ where: { is_active: true } });
      orgId = firstOrg?.id;
    }
    if (!orgId) {
      throw new Error('User does not belong to any organization');
    }

    if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
      throw new Error('Project name is required');
    }

    if (!data.methodology || typeof data.methodology !== 'string' || !data.methodology.trim()) {
      throw new Error('Project methodology is required (SCRUM or KANBAN)');
    }
    const methUpper = data.methodology.toUpperCase().trim();
    if (methUpper !== 'SCRUM' && methUpper !== 'KANBAN') {
      throw new Error(`Invalid project methodology: ${data.methodology}. Must be SCRUM or KANBAN.`);
    }
    const methodology = methUpper as ProjectMethodology;

    // Collect and normalize owner IDs
    const rawOwnerIds: string[] = [];
    if (Array.isArray(data.owner_ids) && data.owner_ids.length > 0) {
      rawOwnerIds.push(...data.owner_ids);
    } else if (data.owner_id && typeof data.owner_id === 'string' && data.owner_id.trim()) {
      rawOwnerIds.push(data.owner_id.trim());
    } else if (user?.id) {
      rawOwnerIds.push(user.id);
    }

    const ownerIds = Array.from(new Set(rawOwnerIds.filter((id): id is string => typeof id === 'string' && !!id.trim())));
    if (ownerIds.length === 0) {
      throw new Error('At least one project owner is required');
    }

    // Validate owners
    let ownerUsers: any[] = [];
    if (ownerIds.length === 1) {
      let ownerUser = await prisma.user.findFirst({
        where: { id: ownerIds[0], organization_id: orgId },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      });
      if (!ownerUser && user?.id === ownerIds[0] && (!user.organization_id || user.organization_id === orgId)) {
        ownerUser = user;
      }
      if (!ownerUser) {
        throw new Error('Project owner does not exist in your organization');
      }
      ownerUsers = [ownerUser];
    } else {
      ownerUsers = await prisma.user.findMany({
        where: {
          id: { in: ownerIds },
          organization_id: orgId,
        },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      });
      if (ownerUsers.length !== ownerIds.length) {
        throw new Error('One or more selected project owners do not exist in your organization');
      }
    }

    for (const ownerUser of ownerUsers) {
      if ((ownerUser as any).is_active === false) {
        throw new Error(`User ${ownerUser.name || ownerUser.email || ownerUser.id} is inactive and cannot be a project owner`);
      }

      const userRoles: string[] = [];
      if (Array.isArray(ownerUser.roles)) {
        for (const r of ownerUser.roles) {
          const roleName = (r.role?.name || r.name || (typeof r === 'string' ? r : '')).toUpperCase();
          if (roleName) userRoles.push(roleName);
        }
      }
      const directRole = ((ownerUser as any).role?.name || (ownerUser as any).role || (ownerUser as any).type || '').toUpperCase();
      if (directRole) userRoles.push(directRole);

      const hasRoleInfo = Array.isArray(ownerUser.roles) || ownerUser.role || (ownerUser as any).type;
      if (hasRoleInfo) {
        const isIntern = userRoles.includes('INTERN');
        const isEligibleRole = userRoles.some((r) => ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(r));

        if (isIntern || !isEligibleRole) {
          throw new Error(`User ${ownerUser.name || ownerUser.email || ownerUser.id} is not eligible to be a project owner. Only managers or higher leadership can own projects.`);
        }
      }
    }

    const primaryOwnerId = ownerIds[0];

    // Validate dates
    let startDate: Date | null = null;
    let endDate: Date | null = null;

    if (data.start_date) {
      startDate = new Date(data.start_date);
      if (isNaN(startDate.getTime())) {
        throw new Error('Invalid start_date format');
      }
    }

    if (data.end_date) {
      endDate = new Date(data.end_date);
      if (isNaN(endDate.getTime())) {
        throw new Error('Invalid end_date format');
      }
    }

    if (startDate && endDate && endDate < startDate) {
      throw new Error('end_date cannot be earlier than start_date');
    }

    let status: ProjectStatus = ProjectStatus.PLANNED;
    if (data.status) {
      let statusCandidate = data.status as any;
      if (typeof statusCandidate === 'string') {
        const upper = statusCandidate.toUpperCase().trim();
        if (upper === 'IN_PROGRESS' || upper === 'IN-PROGRESS' || upper === 'ONGOING' || upper === 'ACTIVE') {
          statusCandidate = ProjectStatus.ACTIVE;
        } else if (upper === 'COMPLETED' || upper === 'DONE') {
          statusCandidate = ProjectStatus.COMPLETED;
        } else if (upper === 'ARCHIVED') {
          statusCandidate = ProjectStatus.ARCHIVED;
        } else if (upper === 'PLANNED') {
          statusCandidate = ProjectStatus.PLANNED;
        }
      }
      if (!Object.values(ProjectStatus).includes(statusCandidate)) {
        throw new Error(`Invalid project status: ${data.status}`);
      }
      status = statusCandidate;
    }

    // Validate members if provided
    let memberIds = Array.from(new Set((data.member_ids || []).filter((id): id is string => typeof id === 'string' && !!id.trim())));
    // Exclude selected owners from memberIds so there are no duplicate memberships or conflicts
    memberIds = memberIds.filter((mid) => !ownerIds.includes(mid));

    if (memberIds.length > 0) {
      const validUsers = await prisma.user.findMany({
        where: {
          id: { in: memberIds },
          organization_id: orgId,
          is_active: true,
        },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      });
      if (validUsers.length !== memberIds.length) {
        throw new Error('One or more selected members do not exist in your organization');
      }

      for (const memberUser of validUsers) {
        const roleNames = (memberUser.roles || []).map((r: any) => (r.role?.name || r.name || '').toUpperCase());
        const directRole = ((memberUser as any).role?.name || (memberUser as any).role || (memberUser as any).type || '').toUpperCase();
        if (directRole) roleNames.push(directRole);

        if (roleNames.length === 1 && roleNames.includes('SUPER_ADMIN')) {
          throw new Error(`User ${memberUser.name || memberUser.email} cannot be assigned as a project member`);
        }
      }
    }

    const createdProject = await prisma.project.create({
      data: {
        name: data.name.trim(),
        description: data.description?.trim() || null,
        methodology,
        start_date: startDate,
        end_date: endDate,
        status,
        owner_id: primaryOwnerId,
        organization_id: orgId,
        owners: {
          create: ownerIds.map((userId) => ({ user_id: userId })),
        },
        members: memberIds.length > 0 ? {
          create: memberIds.map((userId) => ({ user_id: userId })),
        } : undefined,
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        owners: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        documents: true,
        _count: {
          select: {
            members: true,
            documents: true,
          },
        },
      },
    });

    return {
      ...createdProject,
      owners: createdProject.owners && createdProject.owners.length > 0
        ? createdProject.owners.map((o: any) => o.user || o)
        : (createdProject.owner ? [createdProject.owner] : []),
    };
  }

  /**
   * Update project details
   */
  static async updateProject(projectId: string, data: UpdateProjectInput, user: any) {
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

    // Verify project exists in organization
    const existing = await prisma.project.findFirst({
      where,
    });
    if (!existing) {
      throw new Error('Project not found');
    }

    const updateData: any = {};

    if (data.name !== undefined) {
      if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
        throw new Error('Project name cannot be empty');
      }
      updateData.name = data.name.trim();
    }

    if (data.description !== undefined) {
      updateData.description = data.description ? data.description.trim() : null;
    }

    if (data.methodology !== undefined) {
      const methUpper = typeof data.methodology === 'string' ? data.methodology.toUpperCase().trim() : '';
      if (methUpper !== existing.methodology) {
        throw new Error('Project methodology is immutable and cannot be changed after creation');
      }
    }

    let newStart = existing.start_date;
    let newEnd = existing.end_date;

    if (data.start_date !== undefined) {
      if (data.start_date === null) {
        newStart = null;
        updateData.start_date = null;
      } else {
        const parsed = new Date(data.start_date);
        if (isNaN(parsed.getTime())) {
          throw new Error('Invalid start_date format');
        }
        newStart = parsed;
        updateData.start_date = parsed;
      }
    }

    if (data.end_date !== undefined) {
      if (data.end_date === null) {
        newEnd = null;
        updateData.end_date = null;
      } else {
        const parsed = new Date(data.end_date);
        if (isNaN(parsed.getTime())) {
          throw new Error('Invalid end_date format');
        }
        newEnd = parsed;
        updateData.end_date = parsed;
      }
    }

    if (newStart && newEnd && newEnd < newStart) {
      throw new Error('end_date cannot be earlier than start_date');
    }

    if (data.status !== undefined) {
      let statusCandidate = data.status as any;
      if (typeof statusCandidate === 'string') {
        const upper = statusCandidate.toUpperCase().trim();
        if (upper === 'IN_PROGRESS' || upper === 'IN-PROGRESS' || upper === 'ONGOING' || upper === 'ACTIVE') {
          statusCandidate = ProjectStatus.ACTIVE;
        } else if (upper === 'COMPLETED' || upper === 'DONE') {
          statusCandidate = ProjectStatus.COMPLETED;
        } else if (upper === 'ARCHIVED') {
          statusCandidate = ProjectStatus.ARCHIVED;
        } else if (upper === 'PLANNED') {
          statusCandidate = ProjectStatus.PLANNED;
        }
      }
      if (!Object.values(ProjectStatus).includes(statusCandidate)) {
        throw new Error(`Invalid project status: ${data.status}`);
      }
      updateData.status = statusCandidate;
    }

    if (data.owner_id !== undefined) {
      const ownerWhere: any = { id: data.owner_id };
      if (existing.organization_id) {
        ownerWhere.organization_id = existing.organization_id;
      }
      const ownerUser = await prisma.user.findFirst({
        where: ownerWhere,
      });
      if (!ownerUser) {
        throw new Error('Project owner does not exist in your organization');
      }
      updateData.owner_id = data.owner_id;
    }

    return await prisma.project.update({
      where: { id: projectId },
      data: updateData,
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        documents: true,
        _count: {
          select: {
            members: true,
            documents: true,
          },
        },
      },
    });
  }

  /**
   * Safely archive a project
   */
  static async archiveProject(projectId: string, user: any) {
    if (!projectId || projectId === 'undefined') {
      throw new Error('Project not found');
    }

    const orgId = this.getUserOrgId(user);

    let existing = orgId
      ? await prisma.project.findFirst({
          where: { id: projectId, organization_id: orgId },
        })
      : null;

    if (!existing) {
      existing = await prisma.project.findUnique({
        where: { id: projectId },
      });
    }

    if (!existing) {
      throw new Error('Project not found');
    }

    return await prisma.project.update({
      where: { id: projectId },
      data: { status: ProjectStatus.ARCHIVED },
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
        members: true,
        documents: true,
      },
    });
  }

  /**
   * Permanently delete a project and all associated records from the database
   */
  static async deleteProject(projectId: string, user: any) {
    if (!projectId || projectId === 'undefined') {
      throw new Error('Project not found');
    }

    const orgId = user.organization_id;

    let existing = orgId
      ? await prisma.project.findFirst({
          where: { id: projectId, organization_id: orgId },
          include: {
            owners: true,
          },
        })
      : null;

    if (!existing) {
      existing = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          owners: true,
        },
      });
    }

    if (!existing) {
      throw new Error('Project not found');
    }

    const isMgr = this.isManagerOrAdmin(user);
    const isOwner =
      existing.owner_id === user.id ||
      existing.owners?.some((o: any) => o.user_id === user.id);

    if (!isMgr && !isOwner) {
      throw new Error('Forbidden: only managers or project owners can delete this project');
    }

    // Purge project files in MongoDB if enabled
    if (process.env.ENABLE_MONGODB_PROJECT_FILES === 'true') {
      try {
        await ProjectFile.deleteMany({ project_id: projectId });
      } catch (e) {
        console.warn('[ProjectService] Failed to clean up MongoDB project files on deletion:', e);
      }
    }

    await prisma.$transaction(async (tx) => {
      // 1. Fetch work items to clean up child relations
      const workItems = await tx.workItem.findMany({
        where: { project_id: projectId },
        select: { id: true },
      });
      const workItemIds = workItems.map((w) => w.id);

      if (workItemIds.length > 0) {
        // Disconnect parent hierarchy to avoid Restrict constraints
        await tx.workItem.updateMany({
          where: { id: { in: workItemIds } },
          data: { parent_id: null },
        });

        await tx.workItemAssignee.deleteMany({
          where: { work_item_id: { in: workItemIds } },
        });
        await tx.workItemComment.deleteMany({
          where: { work_item_id: { in: workItemIds } },
        });
        await tx.workItemAttachment.deleteMany({
          where: { work_item_id: { in: workItemIds } },
        });
        await tx.workItemExtensionRequest.deleteMany({
          where: { task_id: { in: workItemIds } },
        });
        await tx.timeEntry.deleteMany({
          where: { task_id: { in: workItemIds } },
        });
        await tx.workSession.updateMany({
          where: { task_id: { in: workItemIds } },
          data: { task_id: null },
        });

        await tx.workItem.deleteMany({
          where: { id: { in: workItemIds } },
        });
      }

      // 2. Delete child relations
      await tx.projectOwner.deleteMany({ where: { project_id: projectId } });
      await tx.projectMember.deleteMany({ where: { project_id: projectId } });
      await tx.projectDocument.deleteMany({ where: { project_id: projectId } });
      await tx.actionItem.deleteMany({ where: { project_id: projectId } });
      await tx.workItemExtensionRequest.deleteMany({ where: { project_id: projectId } });
      await tx.sprint.deleteMany({ where: { project_id: projectId } });

      // Clean up roles and permissions
      const projectRoles = await tx.role.findMany({
        where: { project_id: projectId },
        select: { id: true },
      });
      if (projectRoles.length > 0) {
        const roleIds = projectRoles.map((r) => r.id);
        await tx.rolePermission.deleteMany({ where: { role_id: { in: roleIds } } });
        await tx.userRole.deleteMany({ where: { role_id: { in: roleIds } } });
        await tx.role.deleteMany({ where: { id: { in: roleIds } } });
      }

      // Nullify references in forms and time entries
      await tx.timeEntry.updateMany({
        where: { project_id: projectId },
        data: { project_id: null },
      });
      await tx.form.updateMany({
        where: { project_id: projectId },
        data: { project_id: null },
      });

      // 3. Delete project record
      await tx.project.delete({
        where: { id: projectId },
      });
    });

    return {
      success: true,
      id: projectId,
      name: existing.name,
      message: 'Project permanently deleted from database',
    };
  }

  /**
   * List project members with optional search filtering
   */
  static async getProjectMembers(projectId: string, user: any, searchQuery?: string) {
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

    const whereMembers: any = { project_id: projectId };
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.trim();
      whereMembers.user = {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      };
    }

    const members = await prisma.projectMember.findMany({
      where: whereMembers,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
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

    const result = members.map((m: any) => ({
      user_id: m.user.id,
      userId: m.user.id,
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      project_role: m.project_role || null,
      role: m.project_role || null,
      role_id: m.role_id || m.role?.id || null,
      role_details: m.role
        ? {
            id: m.role.id,
            name: m.role.name,
            description: m.role.description,
            is_custom: m.role.is_custom,
            permissions: m.role.permissions?.map((rp: any) => rp.permission.name) || [],
          }
        : null,
      user: m.user,
    }));

    return result.sort((a, b) => {
      const aIsLead = a.project_role === 'TECH_LEAD';
      const bIsLead = b.project_role === 'TECH_LEAD';
      if (aIsLead && !bIsLead) return -1;
      if (!aIsLead && bIsLead) return 1;
      const nameA = a.name || a.email || '';
      const nameB = b.name || b.email || '';
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });
  }

  static readonly ALLOWED_PROJECT_ROLES = [
    'DEVELOPER',
    'QA_TESTER',
    'TECH_LEAD',
    'UI_UX_DESIGNER',
    'DEVOPS_ENGINEER',
    'BUSINESS_ANALYST',
    'PROJECT_COORDINATOR',
    'MANAGER',
    'LEAD',
    'MEMBER',
  ] as const;

  /**
   * Permissions metadata registry
   */
  static readonly PERMISSION_METADATA: Record<
    string,
    { label: string; group: string; description: string; adminOnly?: boolean }
  > = {
    // Projects
    PROJECT_READ: { label: 'View Projects', group: 'Projects', description: 'View project details, members, documents, and sprints' },
    PROJECT_CREATE: { label: 'Create Projects', group: 'Projects', description: 'Create new projects in the organization', adminOnly: true },
    PROJECT_UPDATE: { label: 'Manage Projects', group: 'Projects', description: 'Edit project details, methodology, members, and settings' },
    PROJECT_DELETE: { label: 'Delete / Archive Projects', group: 'Projects', description: 'Archive or permanently delete projects', adminOnly: true },

    // Tasks & Work Items
    TASK_READ: { label: 'View Tasks', group: 'Tasks & Sprints', description: 'View work items, backlog, and sprint boards' },
    TASK_CREATE: { label: 'Create Tasks', group: 'Tasks & Sprints', description: 'Create epics, stories, tasks, bugs, and subtasks' },
    TASK_UPDATE: { label: 'Edit Tasks', group: 'Tasks & Sprints', description: 'Update task status, priority, story points, and details' },
    TASK_DELETE: { label: 'Delete Tasks', group: 'Tasks & Sprints', description: 'Remove work items from projects and backlogs' },
    TASK_ASSIGN: { label: 'Assign Tasks', group: 'Tasks & Sprints', description: 'Assign tasks to team members' },

    // Documents
    DOCUMENT_UPLOAD: { label: 'Upload Documents', group: 'Documents', description: 'Upload and attach project specifications and files' },

    // Forms
    FORM_READ: { label: 'View Forms', group: 'Forms & Surveys', description: 'Access organization and project feedback forms' },
    FORM_CREATE: { label: 'Create Forms', group: 'Forms & Surveys', description: 'Design new forms and evaluation templates', adminOnly: true },
    FORM_UPDATE: { label: 'Edit Forms', group: 'Forms & Surveys', description: 'Modify existing forms and field requirements', adminOnly: true },
    FORM_DELETE: { label: 'Delete Forms', group: 'Forms & Surveys', description: 'Remove forms and question schemas', adminOnly: true },
    FORM_SUBMIT: { label: 'Submit Forms', group: 'Forms & Surveys', description: 'Submit responses to active project forms' },

    // Attendance
    ATTENDANCE_READ: { label: 'View Attendance', group: 'Attendance & Tracking', description: 'View work session logs and timesheet entries' },
    ATTENDANCE_CREATE: { label: 'Log Attendance', group: 'Attendance & Tracking', description: 'Start and log work sessions and time entries' },
    ATTENDANCE_UPDATE: { label: 'Manage Attendance', group: 'Attendance & Tracking', description: 'Review, modify, or approve work session timesheets' },

    // Evaluations
    EVALUATION_READ: { label: 'View Evaluations', group: 'Performance', description: 'Read intern and team performance evaluations' },
    EVALUATION_CREATE: { label: 'Conduct Evaluations', group: 'Performance', description: 'Submit performance reviews and scorecards' },
    EVALUATION_UPDATE: { label: 'Modify Evaluations', group: 'Performance', description: 'Update submitted evaluations and performance metrics' },

    // Notifications
    NOTIFICATION_READ: { label: 'Read Notifications', group: 'Notifications', description: 'Receive system and project alerts' },
    NOTIFICATION_CREATE: { label: 'Send Notifications', group: 'Notifications', description: 'Broadcast notifications to project members' },

    // User Management
    USER_READ: { label: 'View Users', group: 'User Management', description: 'View member directory and contact info' },
    USER_CREATE: { label: 'Provision Users', group: 'User Management', description: 'Create individual organization accounts', adminOnly: true },
    USER_BULK_CREATE: { label: 'Bulk Import Users', group: 'User Management', description: 'Upload CSV rosters to provision members', adminOnly: true },
    USER_UPDATE: { label: 'Edit Users', group: 'User Management', description: 'Modify user profiles, cohorts, or batches', adminOnly: true },
    USER_DELETE: { label: 'Deactivate Users', group: 'User Management', description: 'Soft-deactivate members in the organization', adminOnly: true },

    // Organization
    ORGANIZATION_READ: { label: 'View Organization', group: 'Organization', description: 'View organization profile and policies' },
    ORGANIZATION_CREATE: { label: 'Create Organization', group: 'Organization', description: 'Provision new tenant organizations', adminOnly: true },
    ORGANIZATION_UPDATE: { label: 'Edit Organization', group: 'Organization', description: 'Update organization settings and work policies', adminOnly: true },
    ORGANIZATION_DELETE: { label: 'Delete Organization', group: 'Organization', description: 'Delete organization and purge tenant data', adminOnly: true },

    // 9 Independently Selectable Capabilities
    ROLE_ASSIGN: { label: 'Assign project roles', group: 'Team & Roles', description: 'Assign and change project roles for project members' },
    PROJECT_ROLE_ASSIGN: { label: 'Assign project roles', group: 'Team & Roles', description: 'Assign and change project roles for project members' },
    CYCLE_ACTIVATE: { label: 'Activate a cycle', group: 'Cycles', description: 'Start and activate planned project cycles' },
    SPRINT_ACTIVATE: { label: 'Activate a cycle', group: 'Cycles', description: 'Start and activate planned project cycles' },
    CYCLE_UPDATE: { label: 'Edit cycle details', group: 'Cycles', description: 'Update cycle dates, goals, names, or carry forward items' },
    SPRINT_UPDATE: { label: 'Edit cycle details', group: 'Cycles', description: 'Update cycle dates, goals, names, or carry forward items' },
    CYCLE_CREATE: { label: 'Create a cycle', group: 'Cycles', description: 'Create new project cycles or sprint iterations' },
    SPRINT_CREATE: { label: 'Create a cycle', group: 'Cycles', description: 'Create new project cycles or sprint iterations' },
    ACTION_ITEM_CREATE: { label: 'Add Action Items', group: 'Action Items', description: 'Create and assign action items extracted from project documents' },
    ACTION_ITEM_DELETE: { label: 'Delete Action Items', group: 'Action Items', description: 'Remove action items from the project' },
  };

  /**
   * Permissions strictly permitted for project-level custom roles
   */
  static readonly PROJECT_SCOPED_PERMISSIONS = new Set([
    'PROJECT_READ',
    'PROJECT_UPDATE',
    'TASK_READ',
    'TASK_CREATE',
    'TASK_UPDATE',
    'TASK_DELETE',
    'TASK_ASSIGN',
    'DOCUMENT_UPLOAD',
    'ROLE_ASSIGN',
    'PROJECT_ROLE_ASSIGN',
    'CYCLE_ACTIVATE',
    'SPRINT_ACTIVATE',
    'CYCLE_UPDATE',
    'SPRINT_UPDATE',
    'CYCLE_CREATE',
    'SPRINT_CREATE',
    'ACTION_ITEM_CREATE',
    'ACTION_ITEM_DELETE',
  ]);

  /**
   * Get all registered system permissions grouped logically, optionally filtered by scope
   */
  static async getAvailablePermissions(user: any, scope?: string) {
    const isSuper = this.isSuperAdmin(user);
    const isProjectScope = scope === 'project';

    const where: any = {};
    if (isProjectScope) {
      where.name = { in: Array.from(this.PROJECT_SCOPED_PERMISSIONS) };
    }

    const dbPermissions = await prisma.permission.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    const permissions = dbPermissions.map((p) => {
      const meta = this.PERMISSION_METADATA[p.name] || {
        label: p.name.replace(/_/g, ' '),
        group: 'Other',
        description: p.description || 'System permission',
      };
      return {
        id: p.id,
        name: p.name,
        label: meta.label,
        group: meta.group,
        category: meta.group,
        description: meta.description,
        admin_only: Boolean(meta.adminOnly),
        assignable: isSuper || !meta.adminOnly,
        is_project_scoped: this.PROJECT_SCOPED_PERMISSIONS.has(p.name),
      };
    });

    // Grouping
    const groups: Record<string, typeof permissions> = {};
    for (const p of permissions) {
      if (!groups[p.group]) {
        groups[p.group] = [];
      }
      groups[p.group].push(p);
    }

    return {
      permissions,
      groups,
      categories: Object.keys(groups),
      totalCount: permissions.length,
    };
  }

  private static builtInRolesEnsured = false;

  /**
   * Ensure built-in project roles exist in Role table with default permissions
   */
  static async ensureBuiltInProjectRoles() {
    if (this.builtInRolesEnsured) return;

    const BUILTIN_ROLES: Record<string, { label: string; perms: string[] }> = {
      DEVELOPER: {
        label: 'Developer',
        perms: ['PROJECT_READ', 'TASK_READ', 'TASK_UPDATE', 'FORM_READ', 'FORM_SUBMIT', 'DOCUMENT_UPLOAD'],
      },
      QA_TESTER: {
        label: 'QA Tester',
        perms: ['PROJECT_READ', 'TASK_READ', 'TASK_UPDATE', 'FORM_READ', 'DOCUMENT_UPLOAD'],
      },
      TECH_LEAD: {
        label: 'Tech Lead',
        perms: ['PROJECT_READ', 'PROJECT_UPDATE', 'TASK_READ', 'TASK_CREATE', 'TASK_UPDATE', 'TASK_ASSIGN', 'FORM_READ', 'DOCUMENT_UPLOAD'],
      },
      UI_UX_DESIGNER: {
        label: 'UI/UX Designer',
        perms: ['PROJECT_READ', 'TASK_READ', 'TASK_UPDATE', 'DOCUMENT_UPLOAD'],
      },
      DEVOPS_ENGINEER: {
        label: 'DevOps Engineer',
        perms: ['PROJECT_READ', 'TASK_READ', 'TASK_UPDATE', 'DOCUMENT_UPLOAD'],
      },
      BUSINESS_ANALYST: {
        label: 'Business Analyst',
        perms: ['PROJECT_READ', 'TASK_READ', 'FORM_READ', 'DOCUMENT_UPLOAD'],
      },
      PROJECT_COORDINATOR: {
        label: 'Project Coordinator',
        perms: ['PROJECT_READ', 'TASK_READ', 'TASK_CREATE', 'TASK_UPDATE', 'TASK_ASSIGN', 'FORM_READ', 'DOCUMENT_UPLOAD'],
      },
    };

    const roleNames = Object.keys(BUILTIN_ROLES);
    const existingRoles = await prisma.role.findMany({
      where: { name: { in: roleNames } },
      select: { name: true },
    });
    const existingRoleSet = new Set(existingRoles.map((r) => r.name));

    for (const [roleName, config] of Object.entries(BUILTIN_ROLES)) {
      if (!existingRoleSet.has(roleName)) {
        try {
          const created = await prisma.role.create({
            data: {
              name: roleName,
              description: config.label,
              is_custom: false,
            },
          });
          for (const permName of config.perms) {
            const p = await prisma.permission.findFirst({ where: { name: permName } });
            if (p) {
              await prisma.rolePermission.create({
                data: { role_id: created.id, permission_id: p.id },
              }).catch(() => {});
            }
          }
        } catch (e) {
          // Ignore concurrent seed collision
        }
      }
    }

    // Ensure all 9 project capabilities exist in permissions table
    const PROJECT_PERMISSIONS_TO_ENSURE = [
      'DOCUMENT_UPLOAD',
      'ROLE_ASSIGN',
      'PROJECT_ROLE_ASSIGN',
      'CYCLE_ACTIVATE',
      'SPRINT_ACTIVATE',
      'CYCLE_UPDATE',
      'SPRINT_UPDATE',
      'CYCLE_CREATE',
      'SPRINT_CREATE',
      'TASK_UPDATE',
      'TASK_CREATE',
      'ACTION_ITEM_CREATE',
      'ACTION_ITEM_DELETE',
    ];

    const existingPerms = await prisma.permission.findMany({
      where: { name: { in: PROJECT_PERMISSIONS_TO_ENSURE } },
      select: { name: true },
    });
    const existingPermSet = new Set(existingPerms.map((p) => p.name));
    const missingPerms = PROJECT_PERMISSIONS_TO_ENSURE.filter((p) => !existingPermSet.has(p));
    if (missingPerms.length > 0) {
      await prisma.permission.createMany({
        data: missingPerms.map((permName) => ({
          name: permName,
          description: this.PERMISSION_METADATA[permName]?.description || permName,
        })),
        skipDuplicates: true,
      }).catch(() => {});
    }

    this.builtInRolesEnsured = true;
  }

  /**
   * Get all roles available for a specific project
   * Returns built-in roles + custom roles scoped to this project or organization
   */
  static async getProjectRoles(projectId: string, user: any) {
    await this.ensureBuiltInProjectRoles();

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, organization_id: true },
    });
    if (!project) {
      throw new Error('Project not found');
    }

    const orConditions: any[] = [
      { is_custom: false, organization_id: null }, // Global built-in roles
      { project_id: projectId }, // Project-specific custom roles
    ];
    if (project.organization_id) {
      orConditions.push({ organization_id: project.organization_id, project_id: null, is_custom: true });
    }

    const roles = await prisma.role.findMany({
      where: {
        OR: orConditions,
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: [
        { is_custom: 'asc' },
        { name: 'asc' },
      ],
    });

    const BUILTIN_LABELS: Record<string, string> = {
      DEVELOPER: 'Developer',
      QA_TESTER: 'QA Tester',
      TECH_LEAD: 'Tech Lead',
      UI_UX_DESIGNER: 'UI/UX Designer',
      DEVOPS_ENGINEER: 'DevOps Engineer',
      BUSINESS_ANALYST: 'Business Analyst',
      PROJECT_COORDINATOR: 'Project Coordinator',
      MANAGER: 'Manager',
      EMPLOYEE: 'Employee',
      INTERN: 'Intern',
      ADMIN: 'Admin',
      SUPER_ADMIN: 'Super Admin',
    };

    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      label: r.is_custom ? r.name : (BUILTIN_LABELS[r.name] || r.name),
      description: r.description || (r.is_custom ? 'Custom project role' : 'Standard built-in role'),
      is_custom: Boolean(r.is_custom),
      is_template: Boolean(r.is_custom && !r.project_id),
      carry_forward: Boolean(r.is_custom && !r.project_id),
      organization_id: r.organization_id,
      project_id: r.project_id,
      permissions: r.permissions.map((rp) => rp.permission.name),
      permission_count: r.permissions.length,
      created_at: r.created_at,
    }));
  }

  /**
   * Create a custom role scoped to a project and its organization
   */
  static async createCustomRole(
    projectId: string,
    data: {
      name: string;
      description?: string;
      permissions: string[];
      carry_forward?: boolean;
      carryForward?: boolean;
      is_template?: boolean;
    },
    user: any
  ) {
    if (!projectId || projectId === 'undefined') {
      throw new Error('Project not found');
    }

    // 1. Authorization: Only managers, admins, super admins, or project owners/leads can create custom roles
    const isSuper = this.isSuperAdmin(user);
    const isManagerOrAdmin = this.isManagerOrAdmin(user);
    const isProjectOwner = user.id && (await prisma.project.findFirst({ where: { id: projectId, owner_id: user.id } }));
    if (!isManagerOrAdmin && !isProjectOwner && !isSuper) {
      const err: any = new Error('Unauthorized: Only managers, administrators, or project owners can create custom roles');
      err.statusCode = 403;
      throw err;
    }

    // 2. Project check & tenant isolation
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      const err: any = new Error('Project not found');
      err.statusCode = 404;
      throw err;
    }

    if (!isSuper && user.organization_id && project.organization_id && user.organization_id !== project.organization_id) {
      const err: any = new Error('Forbidden: You do not have access to this project');
      err.statusCode = 403;
      throw err;
    }

    // 3. Validation: Role Name
    const rawName = data?.name;
    if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
      const err: any = new Error('Role name is required');
      err.statusCode = 400;
      throw err;
    }

    const trimmedName = rawName.trim();
    if (trimmedName.length < 2) {
      const err: any = new Error('Role name must be at least 2 characters long');
      err.statusCode = 400;
      throw err;
    }
    if (trimmedName.length > 50) {
      const err: any = new Error('Role name must not exceed 50 characters');
      err.statusCode = 400;
      throw err;
    }

    // Determine role scope: carry_forward / is_template
    const isCarryForward = Boolean(
      (data as any)?.carry_forward ??
      (data as any)?.carryForward ??
      (data as any)?.is_template ??
      (data as any)?.is_reusable_template ??
      false
    );

    // Check duplicate name within scope (case-insensitive)
    const collisionOrs: any[] = [
      { organization_id: null, project_id: null }, // Built-in collision
      { organization_id: project.organization_id, project_id: null }, // Org collision
    ];

    if (isCarryForward) {
      // Reusable organization role: check collisions across the whole organization
      collisionOrs.push({ organization_id: project.organization_id });
    } else {
      // Project-only role: check collisions within current project
      collisionOrs.push({ organization_id: project.organization_id, project_id: projectId });
    }

    const existingDuplicate = await prisma.role.findFirst({
      where: {
        name: { equals: trimmedName, mode: 'insensitive' },
        OR: collisionOrs,
      },
    });

    if (existingDuplicate) {
      const err: any = new Error(`A role with the name "${trimmedName}" already exists in this scope.`);
      err.statusCode = 409;
      throw err;
    }

    // 4. Validation: Permissions
    const requestedPerms = data?.permissions;
    if (!Array.isArray(requestedPerms) || requestedPerms.length === 0) {
      const err: any = new Error('At least one permission must be selected for the custom role');
      err.statusCode = 400;
      throw err;
    }

    const cleanedPerms = requestedPerms
      .filter((p): p is string => typeof p === 'string' && Boolean(p.trim()))
      .map((p) => p.trim());

    if (cleanedPerms.length === 0) {
      const err: any = new Error('At least one valid permission must be selected');
      err.statusCode = 400;
      throw err;
    }

    // Enforce Project module scope: Custom roles created from the project-level interface
    // must contain only permissions corresponding to actions within the Project module.
    const unauthorizedProjectPerms = cleanedPerms.filter((p) => !ProjectService.PROJECT_SCOPED_PERMISSIONS.has(p));
    if (unauthorizedProjectPerms.length > 0) {
      const err: any = new Error(
        `Invalid project-scoped permissions: ${unauthorizedProjectPerms.join(', ')}. Project custom roles are strictly restricted to Project and Task management permissions.`
      );
      err.statusCode = 400;
      throw err;
    }

    // Fetch valid permissions from database registry
    const dbPermissions = await prisma.permission.findMany({
      where: { name: { in: cleanedPerms } },
    });

    if (dbPermissions.length !== cleanedPerms.length) {
      const validSet = new Set(dbPermissions.map((p) => p.name));
      const invalid = cleanedPerms.filter((p) => !validSet.has(p));
      const err: any = new Error(`Invalid permissions: ${invalid.join(', ')}. All permissions must exist in the permissions registry.`);
      err.statusCode = 400;
      throw err;
    }

    // Prevent privilege escalation: Non-super-admins cannot grant admin-only destructive permissions
    if (!isSuper) {
      for (const p of dbPermissions) {
        const meta = this.PERMISSION_METADATA[p.name];
        if (meta?.adminOnly) {
          const err: any = new Error(
            `Unauthorized permission: You do not have authorization to grant administrative permission "${p.name}".`
          );
          err.statusCode = 403;
          throw err;
        }
      }
    }

    // 5. Transactional Creation
    const trimmedDesc = typeof data.description === 'string' && data.description.trim() ? data.description.trim() : null;

    const createdRole = await prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          name: trimmedName,
          description: trimmedDesc,
          organization_id: project.organization_id,
          project_id: isCarryForward ? null : projectId,
          is_custom: true,
        },
      });

      await tx.rolePermission.createMany({
        data: dbPermissions.map((p) => ({
          role_id: role.id,
          permission_id: p.id,
        })),
      });

      return role;
    });

    return {
      id: createdRole.id,
      name: createdRole.name,
      label: createdRole.name,
      description: createdRole.description,
      is_custom: true,
      is_template: !createdRole.project_id,
      carry_forward: !createdRole.project_id,
      organization_id: createdRole.organization_id,
      project_id: createdRole.project_id,
      permissions: dbPermissions.map((p) => p.name),
      permission_count: dbPermissions.length,
      created_at: createdRole.created_at,
    };
  }

  /**
   * Update project member roles
   */
  static async updateProjectMemberRoles(
    projectId: string,
    roleAssignments: Array<{ user_id: string; project_role?: string | null; role_id?: string | null }>,
    user: any
  ) {
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

    if (!Array.isArray(roleAssignments)) {
      throw new Error('Invalid role assignments data');
    }

    for (const item of roleAssignments) {
      if (!item.user_id) continue;

      let normalizedRole: string | null = null;
      let roleIdToPersist: string | null = null;

      if (item.role_id) {
        const directRole = await prisma.role.findUnique({
          where: { id: item.role_id },
        });
        if (!directRole) {
          throw new Error(`Role not found: ${item.role_id}`);
        }
        // Strict project scope check: custom role cannot belong to another project
        if (directRole.project_id && directRole.project_id !== projectId) {
          throw new Error(
            `Cross-project role assignment rejected: Role "${directRole.name}" is scoped to project ${directRole.project_id} and cannot be assigned in project ${projectId}.`
          );
        }
        if (directRole.organization_id && directRole.organization_id !== project.organization_id) {
          throw new Error('Cross-organization role assignment rejected.');
        }
        roleIdToPersist = directRole.id;
        normalizedRole = directRole.name;
      } else if (item.project_role && typeof item.project_role === 'string' && item.project_role.trim()) {
        const candidate = item.project_role.trim();
        const candidateUpper = candidate.toUpperCase();

        if (candidateUpper === 'LEAD') {
          normalizedRole = 'TECH_LEAD';
        } else if (candidateUpper === 'MEMBER') {
          normalizedRole = 'DEVELOPER';
        } else if (this.ALLOWED_PROJECT_ROLES.includes(candidateUpper as any)) {
          normalizedRole = candidateUpper;
        } else {
          // Check if candidate matches a custom role strictly for this project or organization
          const customRole = await prisma.role.findFirst({
            where: {
              name: { equals: candidate, mode: 'insensitive' },
              OR: [
                { project_id: projectId },
                { organization_id: project.organization_id, project_id: null },
                { organization_id: null, project_id: null },
              ],
            },
          });

          if (!customRole) {
            throw new Error(
              `Invalid project role: ${item.project_role}. Role not recognized or not available in this project.`
            );
          }
          normalizedRole = customRole.name;
          roleIdToPersist = customRole.id;
        }
      }

      // If we don't have roleIdToPersist yet, lookup by role name within permitted scope
      if (!roleIdToPersist && normalizedRole) {
        const r = await prisma.role.findFirst({
          where: {
            name: normalizedRole,
            OR: [
              { project_id: projectId },
              { organization_id: project.organization_id, project_id: null },
              { organization_id: null, project_id: null },
            ],
          },
        });
        if (r) {
          roleIdToPersist = r.id;
        }
      }

      const existing = await prisma.projectMember.findUnique({
        where: {
          project_id_user_id: {
            project_id: projectId,
            user_id: item.user_id,
          },
        },
      });

      if (existing) {
        await prisma.projectMember.update({
          where: {
            project_id_user_id: {
              project_id: projectId,
              user_id: item.user_id,
            },
          },
          data: {
            project_role: normalizedRole,
            role_id: roleIdToPersist,
          },
        });
      } else {
        await prisma.projectMember.create({
          data: {
            project_id: projectId,
            user_id: item.user_id,
            project_role: normalizedRole,
            role_id: roleIdToPersist,
          },
        });
      }
    }

    return await this.getProjectMembers(projectId, user);
  }

  /**
   * Update individual member permissions without forcing a new named role for everyone
   */
  static async updateMemberPermissions(
    projectId: string,
    targetUserId: string,
    permissions: string[],
    user: any
  ) {
    if (!projectId || projectId === 'undefined') {
      throw new Error('Project not found');
    }
    if (!targetUserId) {
      throw new Error('Target user ID is required');
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

    const member = await prisma.projectMember.findUnique({
      where: {
        project_id_user_id: {
          project_id: projectId,
          user_id: targetUserId,
        },
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        role: { select: { id: true, name: true, is_custom: true } },
      },
    });

    if (!member) {
      throw new Error('Member not found in this project');
    }

    await this.ensureBuiltInProjectRoles();

    // If permissions array is empty or has 'NONE' or all permissions cleared, reset to base role (role_id = null)
    const cleanedPerms = (Array.isArray(permissions) ? permissions : [])
      .filter((p): p is string => typeof p === 'string' && Boolean(p.trim()) && p.trim().toUpperCase() !== 'NONE')
      .map((p) => p.trim());

    if (cleanedPerms.length === 0) {
      // Clear custom member-specific permissions
      await prisma.projectMember.update({
        where: {
          project_id_user_id: {
            project_id: projectId,
            user_id: targetUserId,
          },
        },
        data: {
          role_id: null,
        },
      });

      // If the member's previous role was a member-specific custom role, clean it up if not used elsewhere
      if (member.role?.is_custom && member.role.name.startsWith(`Member_${targetUserId.slice(0, 8)}`)) {
        await prisma.role.delete({ where: { id: member.role.id } }).catch(() => {});
      }

      return await this.getProjectMembers(projectId, user);
    }

    // Validate requested permissions are within project capabilities
    const unauthorized = cleanedPerms.filter((p) => !ProjectService.PROJECT_SCOPED_PERMISSIONS.has(p));
    if (unauthorized.length > 0) {
      throw new Error(`Invalid permissions: ${unauthorized.join(', ')}. Must be valid project capabilities.`);
    }

    // Upsert or fetch db permissions
    const dbPermissions = await prisma.permission.findMany({
      where: { name: { in: cleanedPerms } },
    });

    // Create or reuse member-specific custom role
    const memberRoleName = `Member_${targetUserId.slice(0, 8)}_${projectId.slice(0, 8)}`;
    const roleDesc = `Custom permissions for ${member.user.name || member.user.email}`;

    await prisma.$transaction(async (tx) => {
      let role = await tx.role.findFirst({
        where: {
          name: memberRoleName,
          project_id: projectId,
        },
      });

      if (!role) {
        role = await tx.role.create({
          data: {
            name: memberRoleName,
            description: roleDesc,
            organization_id: project.organization_id,
            project_id: projectId,
            is_custom: true,
          },
        });
      } else {
        // Clear previous permissions
        await tx.rolePermission.deleteMany({
          where: { role_id: role.id },
        });
      }

      // Assign new permissions
      await tx.rolePermission.createMany({
        data: dbPermissions.map((p) => ({
          role_id: role.id,
          permission_id: p.id,
        })),
      });

      // Assign role to project member
      await tx.projectMember.update({
        where: {
          project_id_user_id: {
            project_id: projectId,
            user_id: targetUserId,
          },
        },
        data: {
          role_id: role.id,
        },
      });
    });

    return await this.getProjectMembers(projectId, user);
  }

  /**
   * Add a member to a project
   */
  static async addProjectMember(
    projectId: string,
    targetUserId: string,
    user: any,
    role?: string,
    roleId?: string
  ) {
    if (!projectId || projectId === 'undefined') {
      throw new Error('Project not found');
    }

    if (!targetUserId) {
      throw new Error('User ID is required');
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

    // Verify the target user belongs to the same organization
    const targetWhere: any = { id: targetUserId };
    if (project.organization_id) {
      targetWhere.organization_id = project.organization_id;
    }
    const targetUser = await prisma.user.findFirst({
      where: targetWhere,
    });
    if (!targetUser) {
      throw new Error('User found or does not belong to your organization');
    }

    // Resolve role and role_id if provided
    let normalizedRole: string | null = null;
    let roleIdToPersist: string | null = null;

    if (roleId) {
      const directRole = await prisma.role.findUnique({ where: { id: roleId } });
      if (!directRole) {
        throw new Error('Role not found');
      }
      if (directRole.project_id && directRole.project_id !== projectId) {
        throw new Error(`Cross-project role assignment rejected: Role is scoped to project ${directRole.project_id}`);
      }
      if (directRole.organization_id && project.organization_id && directRole.organization_id !== project.organization_id) {
        throw new Error('Cross-organization role assignment rejected.');
      }
      roleIdToPersist = directRole.id;
      normalizedRole = directRole.name;
    } else if (role && typeof role === 'string' && role.trim()) {
      const candidate = role.trim();
      const candidateUpper = candidate.toUpperCase();

      if (candidateUpper === 'LEAD') {
        normalizedRole = 'TECH_LEAD';
      } else if (candidateUpper === 'MEMBER') {
        normalizedRole = 'DEVELOPER';
      } else if (this.ALLOWED_PROJECT_ROLES.includes(candidateUpper as any)) {
        normalizedRole = candidateUpper;
      } else {
        const customRole = await prisma.role.findFirst({
          where: {
            name: { equals: candidate, mode: 'insensitive' },
            OR: [
              { project_id: projectId },
              { organization_id: project.organization_id, project_id: null },
              { organization_id: null, project_id: null },
            ],
          },
        });

        if (!customRole) {
          throw new Error(
            `Invalid project role: ${role}. Role not recognized or not available in this project.`
          );
        }
        normalizedRole = customRole.name;
        roleIdToPersist = customRole.id;
      }
    }

    // Check if already a member
    const existingMember = await prisma.projectMember.findUnique({
      where: {
        project_id_user_id: {
          project_id: projectId,
          user_id: targetUserId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (existingMember) {
      if (normalizedRole && existingMember.project_role !== normalizedRole) {
        await prisma.projectMember.update({
          where: {
            project_id_user_id: {
              project_id: projectId,
              user_id: targetUserId,
            },
          },
          data: {
            project_role: normalizedRole,
            role_id: roleIdToPersist || existingMember.role_id,
          },
        });
      }
      return {
        project_id: existingMember.project_id,
        user_id: existingMember.user_id,
        role: normalizedRole || existingMember.project_role,
        project_role: normalizedRole || existingMember.project_role,
        role_id: roleIdToPersist || existingMember.role_id,
        user: {
          id: existingMember.user.id,
          name: existingMember.user.name,
          email: existingMember.user.email,
        },
      };
    }

    const newMember = await prisma.projectMember.create({
      data: {
        project_id: projectId,
        user_id: targetUserId,
        project_role: normalizedRole || null,
        role_id: roleIdToPersist || null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return {
      project_id: newMember.project_id,
      user_id: newMember.user_id,
      role: newMember.project_role,
      project_role: newMember.project_role,
      role_id: newMember.role_id,
      user: {
        id: newMember.user.id,
        name: newMember.user.name,
        email: newMember.user.email,
      },
    };
  }

  /**
   * Remove a member from a project
   */
  static async removeProjectMember(projectId: string, targetUserId: string, user: any) {
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

    if (targetUserId) {
      await prisma.projectMember.deleteMany({
        where: {
          project_id: projectId,
          user_id: targetUserId,
        },
      });
    }

    return { message: 'Member removed successfully' };
  }

  /**
   * List documents for a project including requirements and progress metrics
   */
  static async getProjectDocuments(projectId: string, user: any) {
    if (!projectId || projectId === 'undefined') {
      throw new Error('Project not found');
    }

    let orgId = user?.organization_id;
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

    if (process.env.ENABLE_MONGODB_PROJECT_FILES === 'true') {
      const mongoDocs = await ProjectFile.find({
        project_id: projectId,
        is_archived: false,
      })
        .sort({ created_at: -1 })
        .lean();

      return mongoDocs.map((doc: any) => ({
        ...doc,
        id: doc.file_id,
      }));
    }

    return await prisma.projectDocument.findMany({
      where: { project_id: projectId },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Upload actual document file, save metadata, and automatically parse actionable requirements
   */
  static async uploadProjectDocumentWithFile(
    projectId: string,
    file: { originalname: string; buffer: Buffer; mimetype?: string },
    user: any
  ) {
    if (!projectId || projectId === 'undefined') {
      throw new Error('Project not found');
    }

    let orgId = user?.organization_id;
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

    if (!file || !file.originalname || !file.buffer) {
      throw new Error('Valid file is required for upload');
    }

    const extMatch = file.originalname.split('.').pop();
    const ext = extMatch ? extMatch.toLowerCase() : 'bin';
    
    if (process.env.ENABLE_MONGODB_PROJECT_FILES === 'true') {
      const uploadResult = await ObjectStorageService.uploadBuffer(
        projectId,
        file.originalname,
        file.buffer,
        file.mimetype || 'application/octet-stream'
      );

      const fileId = crypto.randomUUID();

      let createdMongoDoc;
      try {
        createdMongoDoc = await ProjectFile.create({
          file_id: fileId,
          project_id: projectId,
          organization_id: project.organization_id,
          name: uploadResult.sanitizedFilename,
          original_name: file.originalname,
          document_type: ext,
          mime_type: uploadResult.mimeType,
          file_size_bytes: uploadResult.byteLength,
          storage_provider: 's3',
          storage_key: uploadResult.storageKey,
          checksum_sha256: uploadResult.checksumSha256,
          uploaded_by: user.id || 'system',
          is_archived: false,
        });
      } catch (dbErr) {
        // Compensating action: clean up S3 object on MongoDB insert failure
        await ObjectStorageService.deleteObject(uploadResult.storageKey).catch(() => {});
        throw dbErr;
      }

      // Reverse-sync to PostgreSQL if enabled (for zero write-loss rollback)
      if (process.env.REVERSE_SYNC_TO_POSTGRES === 'true') {
        try {
          await prisma.projectDocument.create({
            data: {
              id: fileId,
              project_id: projectId,
              name: uploadResult.sanitizedFilename,
              document_type: ext,
              storage_key: uploadResult.storageKey,
            },
          });
        } catch (syncErr) {
          console.warn('[ProjectService] Reverse sync to PostgreSQL failed (non-blocking):', syncErr);
        }
      }

      return {
        id: createdMongoDoc.file_id,
        file_id: createdMongoDoc.file_id,
        project_id: createdMongoDoc.project_id,
        name: createdMongoDoc.name,
        document_type: createdMongoDoc.document_type,
        storage_key: createdMongoDoc.storage_key,
        mime_type: createdMongoDoc.mime_type,
        file_size_bytes: createdMongoDoc.file_size_bytes,
        checksum_sha256: createdMongoDoc.checksum_sha256,
        created_at: createdMongoDoc.created_at,
        updated_at: createdMongoDoc.updated_at,
      };
    }

    // Save physical file to persistent storage
    const { storageKey } = await StorageService.saveProjectFile(
      projectId,
      file.originalname,
      file.buffer
    );

    let createdDoc;
    try {
      createdDoc = await prisma.projectDocument.create({
        data: {
          project_id: projectId,
          name: file.originalname.trim(),
          document_type: ext,
          storage_key: storageKey,
        },
      });
    } catch (err) {
      // Clean up orphaned file on DB error
      await StorageService.deleteFile(storageKey);
      throw err;
    }

    // Dual-write to S3 and MongoDB if enabled
    if (process.env.DUAL_WRITE_PROJECT_FILES === 'true') {
      try {
        const uploadResult = await ObjectStorageService.uploadBuffer(
          projectId,
          file.originalname,
          file.buffer,
          file.mimetype || 'application/octet-stream'
        );

        await ProjectFile.create({
          file_id: createdDoc.id,
          project_id: projectId,
          organization_id: project.organization_id,
          name: createdDoc.name,
          original_name: file.originalname,
          document_type: ext,
          mime_type: uploadResult.mimeType,
          file_size_bytes: uploadResult.byteLength,
          storage_provider: 's3',
          storage_key: uploadResult.storageKey,
          checksum_sha256: uploadResult.checksumSha256,
          uploaded_by: user.id || 'system',
          is_archived: false,
        });
      } catch (dualErr) {
        console.warn('[ProjectService] Dual-write to MongoDB/S3 failed (non-blocking):', dualErr);
      }
    }

    return createdDoc;
  }

  /**
   * Add document metadata to a project (fallback)
   */
  static async createProjectDocument(projectId: string, data: DocumentInput, user: any) {
    if (!projectId || projectId === 'undefined') {
      throw new Error('Project not found');
    }

    let orgId = user?.organization_id;
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

    const anyData = (data || {}) as any;
    const name = (anyData.name || anyData.title || anyData.fileName || anyData.filename || 'Project Document').trim();
    const docType = (anyData.document_type || anyData.documentType || anyData.type || anyData.fileType || 'OTHER').trim();
    const storageKey = (anyData.storage_key || anyData.storageKey || anyData.key || `metadata_${Date.now()}_${Math.random().toString(36).substring(7)}`).trim();

    return await prisma.projectDocument.create({
      data: {
        project_id: projectId,
        name,
        document_type: docType,
        storage_key: storageKey,
      },
    });
  }

  /**
   * Retrieve physical file for download or preview
   */
  static async getProjectDocumentFile(projectId: string, documentId: string, user: any) {
    if (!projectId || projectId === 'undefined') {
      throw new Error('Project not found');
    }

    let orgId = user?.organization_id;
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

    if (process.env.ENABLE_MONGODB_PROJECT_FILES === 'true') {
      let doc: any = null;
      if (documentId && documentId !== 'undefined') {
        doc = await ProjectFile.findOne({
          file_id: documentId,
          project_id: projectId,
          is_archived: false,
        }).lean();
      }
      if (!doc) {
        doc = await ProjectFile.findOne({
          project_id: projectId,
          is_archived: false,
        })
          .sort({ created_at: -1 })
          .lean();
      }
      if (!doc) {
        throw new Error('Document not found in project');
      }

      const s3Read = await ObjectStorageService.getReadStream(doc.storage_key);
      return {
        s3Stream: s3Read.stream,
        document: {
          id: doc.file_id,
          name: doc.name,
          document_type: doc.document_type,
          storage_key: doc.storage_key,
        },
        mimeType: doc.mime_type || s3Read.contentType || StorageService.getMimeType(doc.name),
        contentLength: s3Read.contentLength,
      };
    }

    let document: any = null;
    if (documentId && documentId !== 'undefined') {
      document = await prisma.projectDocument.findFirst({
        where: { id: documentId, project_id: projectId },
      });
    }
    if (!document) {
      // Fallback: get the most recent document for this project
      document = await prisma.projectDocument.findFirst({
        where: { project_id: projectId },
        orderBy: { created_at: 'desc' },
      });
    }
    if (!document) {
      throw new Error('Document not found in project');
    }

    // Check if storage_key exists in S3 (e.g. after migration or dual-write)
    if (document.storage_key && (process.env.STORAGE_DRIVER === 's3' || document.storage_key.startsWith('projects/'))) {
      try {
        const head = await ObjectStorageService.headObject(document.storage_key);
        if (head.exists) {
          const s3Read = await ObjectStorageService.getReadStream(document.storage_key);
          return {
            s3Stream: s3Read.stream,
            document,
            mimeType: head.contentType || StorageService.getMimeType(document.name),
            contentLength: head.size,
          };
        }
      } catch (s3Err) {
        // Fall back to local disk check
      }
    }

    const storageRoot = StorageService.getStorageRoot();
    const resolvedPath = path.resolve(path.join(storageRoot, document.storage_key));
    if (!resolvedPath.startsWith(storageRoot)) {
      throw new Error('Invalid file path traversal');
    }

    // Removed synthetic dummy-file generation: return explicit 404 error if missing on disk
    if (!fs.existsSync(resolvedPath)) {
      console.error(`[ProjectStorage] CRITICAL: File missing from storage for document ${document.id} (key: ${document.storage_key})`);
      const missingErr = new Error(`File not found in storage: ${document.name}`);
      (missingErr as any).statusCode = 404;
      throw missingErr;
    }

    const mimeType = StorageService.getMimeType(document.name);

    return {
      filePath: resolvedPath,
      document,
      mimeType,
    };
  }

  /**
   * Update document metadata
   */
  static async updateProjectDocument(
    projectId: string,
    documentId: string,
    data: Partial<DocumentInput>,
    user: any
  ) {
    if (!projectId || projectId === 'undefined') {
      throw new Error('Project not found');
    }

    let orgId = user?.organization_id;
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

    if (process.env.ENABLE_MONGODB_PROJECT_FILES === 'true') {
      let doc: any = null;
      if (documentId && documentId !== 'undefined') {
        doc = await ProjectFile.findOne({
          file_id: documentId,
          project_id: projectId,
          is_archived: false,
        });
      }
      if (!doc) {
        doc = await ProjectFile.findOne({
          project_id: projectId,
          is_archived: false,
        }).sort({ created_at: -1 });
      }

      if (!doc) {
        throw new Error('Document not found in project');
      }

      const anyData = (data || {}) as any;
      const name = anyData.name !== undefined ? anyData.name : anyData.title;
      if (name !== undefined) {
        if (!name || !name.trim()) throw new Error('Document name cannot be empty');
        doc.name = name.trim();
      }
      if (anyData.document_type) {
        doc.document_type = anyData.document_type.trim();
      }
      await doc.save();

      // Reverse-sync update to PostgreSQL
      if (process.env.REVERSE_SYNC_TO_POSTGRES === 'true') {
        await prisma.projectDocument.updateMany({
          where: { id: doc.file_id, project_id: projectId },
          data: {
            name: doc.name,
            document_type: doc.document_type,
          },
        }).catch(() => {});
      }

      return {
        id: doc.file_id,
        file_id: doc.file_id,
        project_id: doc.project_id,
        name: doc.name,
        document_type: doc.document_type,
        storage_key: doc.storage_key,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
      };
    }

    let document: any = null;
    if (documentId && documentId !== 'undefined') {
      document = await prisma.projectDocument.findFirst({
        where: { id: documentId, project_id: projectId },
      });
    }
    if (!document) {
      // Fallback: check most recent document for this project
      document = await prisma.projectDocument.findFirst({
        where: { project_id: projectId },
        orderBy: { created_at: 'desc' },
      });
    }
    if (!document) {
      throw new Error('Document not found in project');
    }

    const anyData = (data || {}) as any;
    const updateData: any = {};
    if (anyData.name !== undefined || anyData.title !== undefined) {
      const name = anyData.name !== undefined ? anyData.name : anyData.title;
      if (!name || !name.trim()) throw new Error('Document name cannot be empty');
      updateData.name = name.trim();
    }
    if (anyData.document_type !== undefined || anyData.documentType !== undefined || anyData.type !== undefined) {
      const docType = anyData.document_type !== undefined ? anyData.document_type : (anyData.documentType || anyData.type);
      if (!docType || !docType.trim()) throw new Error('Document type cannot be empty');
      updateData.document_type = docType.trim();
    }
    if (anyData.storage_key !== undefined || anyData.storageKey !== undefined) {
      const storageKey = anyData.storage_key !== undefined ? anyData.storage_key : anyData.storageKey;
      if (!storageKey || !storageKey.trim()) throw new Error('Storage key cannot be empty');
      updateData.storage_key = storageKey.trim();
    }

    const updated = await prisma.projectDocument.update({
      where: { id: document.id },
      data: updateData,
    });

    if (process.env.DUAL_WRITE_PROJECT_FILES === 'true') {
      await ProjectFile.updateOne(
        { file_id: document.id },
        { $set: updateData }
      ).catch(() => {});
    }

    return updated;
  }

  /**
   * Delete document metadata and remove physical file
   */
  static async deleteProjectDocument(projectId: string, documentId: string, user: any) {
    if (!projectId || projectId === 'undefined') {
      throw new Error('Project not found');
    }

    let orgId = user?.organization_id;
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

    if (process.env.ENABLE_MONGODB_PROJECT_FILES === 'true') {
      let doc: any = null;
      if (documentId && documentId !== 'undefined') {
        doc = await ProjectFile.findOne({
          file_id: documentId,
          project_id: projectId,
          is_archived: false,
        });
      }
      if (!doc) {
        throw new Error('Document not found in project');
      }

      // Two-phase deletion: mark archived first, delete S3 object, then delete MongoDB doc
      doc.is_archived = true;
      await doc.save();

      await ObjectStorageService.deleteObject(doc.storage_key).catch(() => {});
      await ProjectFile.deleteOne({ _id: doc._id });

      if (process.env.REVERSE_SYNC_TO_POSTGRES === 'true') {
        await prisma.projectDocument.deleteMany({
          where: { id: doc.file_id, project_id: projectId },
        }).catch(() => {});
      }

      return {
        message: 'Document deleted successfully',
        success: true,
        id: doc.file_id,
        name: doc.name,
      };
    }

    let document: any = null;
    if (documentId && documentId !== 'undefined') {
      document = await prisma.projectDocument.findFirst({
        where: { id: documentId, project_id: projectId },
      });
    }

    if (!document) {
      throw new Error('Document not found in project');
    }

    await prisma.projectDocument.delete({
      where: { id: document.id },
    });

    // Delete physical file from storage (S3 or local disk)
    if (document.storage_key) {
      if (document.storage_key.startsWith('projects/') && process.env.STORAGE_DRIVER === 's3') {
        await ObjectStorageService.deleteObject(document.storage_key).catch(() => {});
      } else {
        await StorageService.deleteFile(document.storage_key).catch(() => {});
      }
    }

    if (process.env.DUAL_WRITE_PROJECT_FILES === 'true') {
      await ProjectFile.deleteOne({ file_id: document.id }).catch(() => {});
    }

    return {
      message: 'Document deleted successfully',
      success: true,
      id: document.id,
      name: document.name,
    };
  }

  /**
   * Get all Tech Leads in the organization with their assigned projects, total tasks, and performance metrics
   */
  static async getTechLeadsOverview(user: any) {
    let orgId = user.organization_id;
    if (!orgId && this.isManagerOrAdmin(user)) {
      const firstOrg = await prisma.organization.findFirst({ where: { is_active: true } });
      orgId = firstOrg?.id;
    }

    // 1. Fetch all users who are assigned project_role === 'TECH_LEAD' OR have organization role === 'TECH_LEAD'
    const leadWhere: any = {
      project_role: 'TECH_LEAD',
    };
    if (orgId) {
      leadWhere.project = { organization_id: orgId };
    }

    const leadMemberships = await prisma.projectMember.findMany({
      where: leadWhere,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            batch: true,
            subbatch: true,
            is_active: true,
            roles: {
              include: {
                role: true,
              },
            },
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            status: true,
            start_date: true,
            end_date: true,
          },
        },
      },
    });

    // Also find any users whose organization role is 'TECH_LEAD'
    const orgRoleWhere: any = {
      roles: {
        some: {
          role: { name: 'TECH_LEAD' },
        },
      },
    };
    if (orgId) {
      orgRoleWhere.organization_id = orgId;
    }

    const orgRoleLeads = await prisma.user.findMany({
      where: orgRoleWhere,
      select: {
        id: true,
        name: true,
        email: true,
        batch: true,
        subbatch: true,
        is_active: true,
        roles: {
          include: {
            role: true,
          },
        },
        project_memberships: {
          where: orgId ? { project: { organization_id: orgId } } : undefined,
          include: {
            project: {
              select: {
                id: true,
                name: true,
                status: true,
                start_date: true,
                end_date: true,
              },
            },
          },
        },
      },
    });

    // Combine distinct tech leads map by user ID
    const leadsMap = new Map<string, any>();

    // Helper to initialize lead entry
    const getOrCreateLeadEntry = (u: any) => {
      if (!leadsMap.has(u.id)) {
        const primaryRole = u.roles?.[0]?.role?.name || 'TECH_LEAD';
        leadsMap.set(u.id, {
          id: u.id,
          name: u.name,
          email: u.email,
          batch: u.batch || null,
          subbatch: u.subbatch || null,
          is_active: u.is_active,
          role: primaryRole,
          projectsMap: new Map<string, any>(),
        });
      }
      return leadsMap.get(u.id);
    };

    // Add leads from projectMember with project_role === 'TECH_LEAD'
    for (const pm of leadMemberships) {
      if (!pm.user) continue;
      const lead = getOrCreateLeadEntry(pm.user);
      if (pm.project) {
        lead.projectsMap.set(pm.project.id, {
          id: pm.project.id,
          name: pm.project.name,
          status: pm.project.status,
          start_date: pm.project.start_date,
          end_date: pm.project.end_date,
          project_role: 'TECH_LEAD',
        });
      }
    }

    // Add leads from org role TECH_LEAD
    for (const u of orgRoleLeads) {
      const lead = getOrCreateLeadEntry(u);
      for (const pm of u.project_memberships || []) {
        if (pm.project && !lead.projectsMap.has(pm.project.id)) {
          lead.projectsMap.set(pm.project.id, {
            id: pm.project.id,
            name: pm.project.name,
            status: pm.project.status,
            start_date: pm.project.start_date,
            end_date: pm.project.end_date,
            project_role: pm.project_role || 'TECH_LEAD',
          });
        }
      }
    }

    const leadList = Array.from(leadsMap.values());
    if (leadList.length === 0) {
      return [];
    }

    // Collect all relevant project IDs across all leads
    const allProjectIds = new Set<string>();
    for (const lead of leadList) {
      for (const projId of lead.projectsMap.keys()) {
        allProjectIds.add(projId);
      }
    }

    // Query all work items in these projects
    const projectWorkItems = allProjectIds.size > 0
      ? await prisma.workItem.findMany({
          where: {
            project_id: { in: Array.from(allProjectIds) },
            ...(orgId ? { organization_id: orgId } : {}),
          },
          select: {
            id: true,
            project_id: true,
            status: true,
            priority: true,
            story_points: true,
            due_date: true,
            type: true,
            assignees: {
              select: {
                user_id: true,
              },
            },
          },
        })
      : [];

    // Query all work items directly assigned to each tech lead
    const leadUserIds = leadList.map((l) => l.id);
    const leadAssignedItems = await prisma.workItem.findMany({
      where: {
        ...(orgId ? { organization_id: orgId } : {}),
        assignees: {
          some: {
            user_id: { in: leadUserIds },
          },
        },
      },
      select: {
        id: true,
        project_id: true,
        status: true,
        priority: true,
        story_points: true,
        due_date: true,
        assignees: {
          select: {
            user_id: true,
          },
        },
      },
    });

    // Build finalized overview response per lead
    const result = leadList.map((lead) => {
      const projects: any[] = Array.from(lead.projectsMap.values());
      const leadProjIds = new Set(projects.map((p: any) => p.id));

      // All tasks across the lead's assigned projects (excluding standalone Epics)
      const allLeadProjectTasks = projectWorkItems.filter(
        (w) => w.project_id && leadProjIds.has(w.project_id) && w.type !== 'EPIC'
      );

      // Tasks specifically assigned to this lead
      const myAssignedTasks = leadAssignedItems.filter((w) =>
        w.assignees.some((a) => a.user_id === lead.id)
      );

      // Per-project breakdown with task metrics
      const projectSummaries = projects.map((p) => {
        const pTasks = allLeadProjectTasks.filter((t) => t.project_id === p.id);
        const pCompleted = pTasks.filter((t) => t.status === 'COMPLETED').length;
        const pTotal = pTasks.length;
        const pRate = pTotal > 0 ? Math.round((pCompleted / pTotal) * 100) : 0;
        const pPoints = pTasks.reduce((acc, t) => acc + (Number(t.story_points) || 0), 0);
        const pCompletedPoints = pTasks
          .filter((t) => t.status === 'COMPLETED')
          .reduce((acc, t) => acc + (Number(t.story_points) || 0), 0);

        return {
          id: p.id,
          name: p.name,
          status: p.status,
          total_tasks: pTotal,
          completed_tasks: pCompleted,
          completion_rate: pRate,
          total_points: pPoints,
          completed_points: pCompletedPoints,
        };
      });

      // Overall Project Task Metrics
      const totalProjectTasks = allLeadProjectTasks.length;
      const completedProjectTasks = allLeadProjectTasks.filter((t) => t.status === 'COMPLETED').length;
      const inProgressProjectTasks = allLeadProjectTasks.filter((t) => t.status === 'IN_PROGRESS' || t.status === 'IN_REVIEW').length;
      const blockedProjectTasks = allLeadProjectTasks.filter((t) => t.status === 'BLOCKED').length;
      const projectCompletionRate = totalProjectTasks > 0
        ? Math.round((completedProjectTasks / totalProjectTasks) * 100)
        : 0;

      // Direct Assignment Metrics
      const totalAssignedTasks = myAssignedTasks.length;
      const completedAssignedTasks = myAssignedTasks.filter((t) => t.status === 'COMPLETED').length;
      const directCompletionRate = totalAssignedTasks > 0
        ? Math.round((completedAssignedTasks / totalAssignedTasks) * 100)
        : 0;

      // Overall Performance Score (0-100)
      // Calculated from project completion progress (60% weight) and lead's direct task execution (40% weight)
      // Condition: if 0 active project tasks, score should be 0%
      let performanceScore = 0;
      if (totalProjectTasks === 0) {
        performanceScore = 0;
      } else if (totalAssignedTasks > 0) {
        performanceScore = Math.round(projectCompletionRate * 0.6 + directCompletionRate * 0.4);
      } else {
        performanceScore = projectCompletionRate;
      }

      // Performance rating label
      let performanceLabel = 'Exceptional';
      let performanceColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
      if (totalProjectTasks === 0) {
        performanceLabel = 'No Tasks';
        performanceColor = 'text-slate-600 bg-slate-100 border-slate-200';
      } else if (performanceScore >= 85) {
        performanceLabel = 'Exceptional';
        performanceColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
      } else if (performanceScore >= 70) {
        performanceLabel = 'Strong';
        performanceColor = 'text-purple-700 bg-purple-50 border-purple-200';
      } else if (performanceScore >= 50) {
        performanceLabel = 'On Track';
        performanceColor = 'text-blue-700 bg-blue-50 border-blue-200';
      } else if (performanceScore >= 25) {
        performanceLabel = 'Needs Attention';
        performanceColor = 'text-amber-700 bg-amber-50 border-amber-200';
      } else {
        performanceLabel = 'At Risk';
        performanceColor = 'text-rose-700 bg-rose-50 border-rose-200';
      }

      const { projectsMap, ...cleanLead } = lead;

      return {
        ...cleanLead,
        projects: projectSummaries,
        project_count: projectSummaries.length,
        total_project_tasks: totalProjectTasks,
        completed_project_tasks: completedProjectTasks,
        in_progress_project_tasks: inProgressProjectTasks,
        blocked_project_tasks: blockedProjectTasks,
        project_completion_rate: projectCompletionRate,
        direct_assigned_tasks: totalAssignedTasks,
        direct_completed_tasks: completedAssignedTasks,
        direct_completion_rate: directCompletionRate,
        performance_score: performanceScore,
        performance_label: performanceLabel,
        performance_color: performanceColor,
      };
    });

    return result.sort((a, b) => (b.project_count || 0) - (a.project_count || 0));
  }
}
