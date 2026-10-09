import path from 'path';
import { ProjectStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { StorageService } from './storage.service';

export interface CreateProjectInput {
  name: string;
  description?: string;
  start_date?: string | null;
  end_date?: string | null;
  status?: ProjectStatus;
  owner_id?: string;
  member_ids?: string[];
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
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
    if (user.role === 'ADMIN' || user.role === 'MANAGER' || user.role === 'SUPER_ADMIN') return true;
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
        { members: { some: { user_id: user.id } } },
      ];
    }

    return await prisma.project.findMany({
      where,
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
  }

  /**
   * Get single project by ID with organization access check
   */
  static async getProjectById(projectId: string, user: any) {
    const orgId = this.getUserOrgId(user);

    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organization_id: orgId,
      },
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
    if (!isMgr && project.owner_id !== user.id) {
      const isMember = project.members.some((m) => m.user_id === user.id);
      if (!isMember) {
        throw new Error('Forbidden: you are not a member of this project');
      }
    }

    return project;
  }

  /**
   * Create a new project scoped to the authenticated user's organization
   */
  static async createProject(data: CreateProjectInput, user: any) {
    const orgId = this.getUserOrgId(user);

    if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
      throw new Error('Project name is required');
    }

    let ownerId = user.id;
    if (data.owner_id) {
      // Validate owner belongs to the same organization
      const ownerUser = await prisma.user.findFirst({
        where: { id: data.owner_id, organization_id: orgId },
      });
      if (!ownerUser) {
        throw new Error('Project owner does not exist in your organization');
      }
      ownerId = data.owner_id;
    }

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
      if (!Object.values(ProjectStatus).includes(data.status)) {
        throw new Error(`Invalid project status: ${data.status}`);
      }
      status = data.status;
    }

    // Validate members if provided
    const memberIds = Array.from(new Set((data.member_ids || []).filter((id): id is string => typeof id === 'string' && !!id.trim())));
    if (memberIds.length > 0) {
      const validUsers = await prisma.user.findMany({
        where: {
          id: { in: memberIds },
          organization_id: orgId,
          is_active: true,
        },
        select: { id: true },
      });
      if (validUsers.length !== memberIds.length) {
        throw new Error('One or more selected members do not exist in your organization');
      }
    }

    return await prisma.project.create({
      data: {
        name: data.name.trim(),
        description: data.description?.trim() || null,
        start_date: startDate,
        end_date: endDate,
        status,
        owner_id: ownerId,
        organization_id: orgId,
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
   * Update project details
   */
  static async updateProject(projectId: string, data: UpdateProjectInput, user: any) {
    const orgId = this.getUserOrgId(user);

    // Verify project exists in organization
    const existing = await prisma.project.findFirst({
      where: { id: projectId, organization_id: orgId },
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
      if (!Object.values(ProjectStatus).includes(data.status)) {
        throw new Error(`Invalid project status: ${data.status}`);
      }
      updateData.status = data.status;
    }

    if (data.owner_id !== undefined) {
      const ownerUser = await prisma.user.findFirst({
        where: { id: data.owner_id, organization_id: orgId },
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
    const orgId = this.getUserOrgId(user);

    const existing = await prisma.project.findFirst({
      where: { id: projectId, organization_id: orgId },
    });
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
   * List project members with optional search filtering
   */
  static async getProjectMembers(projectId: string, user: any, searchQuery?: string) {
    const orgId = this.getUserOrgId(user);

    const project = await prisma.project.findFirst({
      where: { id: projectId, organization_id: orgId },
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
      },
    });

    return members.map((m) => ({
      user_id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      project_role: m.project_role || null,
    }));
  }

  static readonly ALLOWED_PROJECT_ROLES = [
    'DEVELOPER',
    'QA_TESTER',
    'TECH_LEAD',
    'UI_UX_DESIGNER',
    'DEVOPS_ENGINEER',
    'BUSINESS_ANALYST',
    'PROJECT_COORDINATOR',
  ] as const;

  /**
   * Update project member roles
   */
  static async updateProjectMemberRoles(
    projectId: string,
    roleAssignments: Array<{ user_id: string; project_role?: string | null }>,
    user: any
  ) {
    const orgId = this.getUserOrgId(user);

    const project = await prisma.project.findFirst({
      where: { id: projectId, organization_id: orgId },
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
      if (item.project_role && typeof item.project_role === 'string' && item.project_role.trim()) {
        const candidate = item.project_role.trim().toUpperCase();
        if (!this.ALLOWED_PROJECT_ROLES.includes(candidate as any)) {
          throw new Error(
            `Invalid project role: ${item.project_role}. Allowed roles: ${this.ALLOWED_PROJECT_ROLES.join(', ')}`
          );
        }
        normalizedRole = candidate;
      }

      await prisma.projectMember.updateMany({
        where: {
          project_id: projectId,
          user_id: item.user_id,
        },
        data: {
          project_role: normalizedRole,
        },
      });
    }

    return await this.getProjectMembers(projectId, user);
  }

  /**
   * Add a member to a project
   */
  static async addProjectMember(projectId: string, targetUserId: string, user: any) {
    const orgId = this.getUserOrgId(user);

    if (!targetUserId) {
      throw new Error('User ID is required');
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, organization_id: orgId },
    });
    if (!project) {
      throw new Error('Project not found');
    }

    // Verify the target user belongs to the same organization
    const targetUser = await prisma.user.findFirst({
      where: { id: targetUserId, organization_id: orgId },
    });
    if (!targetUser) {
      throw new Error('User not found in your organization');
    }

    // Check if already a member
    const existingMember = await prisma.projectMember.findUnique({
      where: {
        project_id_user_id: {
          project_id: projectId,
          user_id: targetUserId,
        },
      },
    });

    if (existingMember) {
      throw new Error('User is already a member of this project');
    }

    const newMember = await prisma.projectMember.create({
      data: {
        project_id: projectId,
        user_id: targetUserId,
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
    const orgId = this.getUserOrgId(user);

    const project = await prisma.project.findFirst({
      where: { id: projectId, organization_id: orgId },
    });
    if (!project) {
      throw new Error('Project not found');
    }

    const existingMember = await prisma.projectMember.findUnique({
      where: {
        project_id_user_id: {
          project_id: projectId,
          user_id: targetUserId,
        },
      },
    });

    if (!existingMember) {
      throw new Error('Member not found in project');
    }

    await prisma.projectMember.delete({
      where: {
        project_id_user_id: {
          project_id: projectId,
          user_id: targetUserId,
        },
      },
    });

    return { message: 'Member removed successfully' };
  }

  /**
   * List documents for a project
   */
  static async getProjectDocuments(projectId: string, user: any) {
    const orgId = this.getUserOrgId(user);

    const project = await prisma.project.findFirst({
      where: { id: projectId, organization_id: orgId },
    });
    if (!project) {
      throw new Error('Project not found');
    }

    return await prisma.projectDocument.findMany({
      where: { project_id: projectId },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Upload actual document file and save metadata
   */
  static async uploadProjectDocumentWithFile(
    projectId: string,
    file: { originalname: string; buffer: Buffer; mimetype?: string },
    user: any
  ) {
    const orgId = this.getUserOrgId(user);

    const project = await prisma.project.findFirst({
      where: { id: projectId, organization_id: orgId },
    });
    if (!project) {
      throw new Error('Project not found');
    }

    if (!file || !file.originalname || !file.buffer) {
      throw new Error('Valid file is required for upload');
    }

    const ext = path.extname(file.originalname).replace('.', '').toLowerCase() || 'bin';
    
    // Save physical file to persistent storage
    const { storageKey } = await StorageService.saveProjectFile(
      projectId,
      file.originalname,
      file.buffer
    );

    try {
      return await prisma.projectDocument.create({
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
  }

  /**
   * Add document metadata to a project (fallback)
   */
  static async createProjectDocument(projectId: string, data: DocumentInput, user: any) {
    const orgId = this.getUserOrgId(user);

    const project = await prisma.project.findFirst({
      where: { id: projectId, organization_id: orgId },
    });
    if (!project) {
      throw new Error('Project not found');
    }

    if (!data.name || !data.name.trim()) {
      throw new Error('Document name is required');
    }
    if (!data.document_type || !data.document_type.trim()) {
      throw new Error('Document type is required');
    }
    if (!data.storage_key || !data.storage_key.trim()) {
      throw new Error('Storage key is required');
    }

    return await prisma.projectDocument.create({
      data: {
        project_id: projectId,
        name: data.name.trim(),
        document_type: data.document_type.trim(),
        storage_key: data.storage_key.trim(),
      },
    });
  }

  /**
   * Retrieve physical file for download or preview
   */
  static async getProjectDocumentFile(projectId: string, documentId: string, user: any) {
    const orgId = this.getUserOrgId(user);

    const project = await prisma.project.findFirst({
      where: { id: projectId, organization_id: orgId },
    });
    if (!project) {
      throw new Error('Project not found');
    }

    const document = await prisma.projectDocument.findFirst({
      where: { id: documentId, project_id: projectId },
    });
    if (!document) {
      throw new Error('Document not found in project');
    }

    const filePath = StorageService.getFilePath(document.storage_key);
    const mimeType = StorageService.getMimeType(document.name);

    return {
      filePath,
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
    const orgId = this.getUserOrgId(user);

    const project = await prisma.project.findFirst({
      where: { id: projectId, organization_id: orgId },
    });
    if (!project) {
      throw new Error('Project not found');
    }

    const document = await prisma.projectDocument.findFirst({
      where: { id: documentId, project_id: projectId },
    });
    if (!document) {
      throw new Error('Document not found in project');
    }

    const updateData: any = {};
    if (data.name !== undefined) {
      if (!data.name || !data.name.trim()) throw new Error('Document name cannot be empty');
      updateData.name = data.name.trim();
    }
    if (data.document_type !== undefined) {
      if (!data.document_type || !data.document_type.trim()) throw new Error('Document type cannot be empty');
      updateData.document_type = data.document_type.trim();
    }
    if (data.storage_key !== undefined) {
      if (!data.storage_key || !data.storage_key.trim()) throw new Error('Storage key cannot be empty');
      updateData.storage_key = data.storage_key.trim();
    }

    return await prisma.projectDocument.update({
      where: { id: documentId },
      data: updateData,
    });
  }

  /**
   * Delete document metadata and remove physical file
   */
  static async deleteProjectDocument(projectId: string, documentId: string, user: any) {
    const orgId = this.getUserOrgId(user);

    const project = await prisma.project.findFirst({
      where: { id: projectId, organization_id: orgId },
    });
    if (!project) {
      throw new Error('Project not found');
    }

    const document = await prisma.projectDocument.findFirst({
      where: { id: documentId, project_id: projectId },
    });
    if (!document) {
      throw new Error('Document not found in project');
    }

    await prisma.projectDocument.delete({
      where: { id: documentId },
    });

    // Delete physical file from storage
    if (document.storage_key) {
      await StorageService.deleteFile(document.storage_key);
    }

    return { message: 'Document deleted successfully' };
  }
}
