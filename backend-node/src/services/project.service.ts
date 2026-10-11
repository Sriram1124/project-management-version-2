import { ProjectStatus, RequirementStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { StorageService } from './storage.service';
import { DocumentParserService } from './document-parser.service';

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

    const result = members.map((m) => ({
      user_id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      project_role: m.project_role || null,
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
   * List documents for a project including requirements and progress metrics
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
      include: {
        requirements: {
          orderBy: { created_at: 'asc' },
        },
      },
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

    const extMatch = file.originalname.split('.').pop();
    const ext = extMatch ? extMatch.toLowerCase() : 'bin';
    
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

    // Automatically parse actionable requirements from supported formats
    try {
      const filePath = StorageService.getFilePath(storageKey);
      const text = await DocumentParserService.extractText(filePath, ext, file.buffer);
      const extracted = DocumentParserService.extractRequirements(text);

      if (extracted && extracted.length > 0) {
        await prisma.documentRequirement.createMany({
          data: extracted.map((req) => ({
            document_id: createdDoc.id,
            code: req.code,
            title: req.title,
            description: req.description,
            section: req.section,
            status: RequirementStatus.PENDING,
          })),
        });
      }
    } catch (parseErr: any) {
      console.warn(`[DocumentParser] Notice: Could not parse requirements from ${file.originalname}:`, parseErr.message);
    }

    return await prisma.projectDocument.findUnique({
      where: { id: createdDoc.id },
      include: {
        requirements: {
          orderBy: { created_at: 'asc' },
        },
      },
    });
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

  /**
   * Update an individual requirement status, progress note, or current activity
   */
  static async updateRequirement(
    projectId: string,
    documentId: string,
    requirementId: string,
    data: { status?: RequirementStatus; progress_note?: string; current_activity?: string },
    user: any
  ) {
    const orgId = this.getUserOrgId(user);

    const project = await prisma.project.findFirst({
      where: { id: projectId, organization_id: orgId },
    });
    if (!project) throw new Error('Project not found');

    const requirement = await prisma.documentRequirement.findFirst({
      where: { id: requirementId, document_id: documentId },
    });
    if (!requirement) throw new Error('Requirement not found');

    const updateData: any = {
      updated_by_user_id: user.id,
    };
    if (data.status !== undefined) {
      if (!Object.values(RequirementStatus).includes(data.status)) {
        throw new Error(`Invalid requirement status: ${data.status}`);
      }
      updateData.status = data.status;
    }
    if (data.progress_note !== undefined) updateData.progress_note = data.progress_note;
    if (data.current_activity !== undefined) updateData.current_activity = data.current_activity;

    return await prisma.documentRequirement.update({
      where: { id: requirementId },
      data: updateData,
    });
  }

  /**
   * Reparse document requirements manually or for existing documents
   */
  static async reparseDocumentRequirements(
    projectId: string,
    documentId: string,
    user: any
  ) {
    const orgId = this.getUserOrgId(user);

    const project = await prisma.project.findFirst({
      where: { id: projectId, organization_id: orgId },
    });
    if (!project) throw new Error('Project not found');

    const doc = await prisma.projectDocument.findFirst({
      where: { id: documentId, project_id: projectId },
    });
    if (!doc) throw new Error('Document not found');

    const filePath = StorageService.getFilePath(doc.storage_key);
    const text = await DocumentParserService.extractText(filePath, doc.document_type);
    const extracted = DocumentParserService.extractRequirements(text);

    if (extracted && extracted.length > 0) {
      // Remove previous requirements to prevent duplicates
      await prisma.documentRequirement.deleteMany({
        where: { document_id: documentId },
      });

      await prisma.documentRequirement.createMany({
        data: extracted.map((req) => ({
          document_id: documentId,
          code: req.code,
          title: req.title,
          description: req.description,
          section: req.section,
          status: RequirementStatus.PENDING,
        })),
      });
    }

    return await prisma.projectDocument.findUnique({
      where: { id: documentId },
      include: {
        requirements: {
          orderBy: { created_at: 'asc' },
        },
      },
    });
  }

  /**
   * Get all Tech Leads in the organization with their assigned projects, total tasks, and performance metrics
   */
  static async getTechLeadsOverview(user: any) {
    const orgId = this.getUserOrgId(user);

    // 1. Fetch all users who are assigned project_role === 'TECH_LEAD' OR have organization role === 'TECH_LEAD'
    const leadMemberships = await prisma.projectMember.findMany({
      where: {
        project_role: 'TECH_LEAD',
        project: { organization_id: orgId },
      },
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
    const orgRoleLeads = await prisma.user.findMany({
      where: {
        organization_id: orgId,
        roles: {
          some: {
            role: { name: 'TECH_LEAD' },
          },
        },
      },
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
          where: {
            project: { organization_id: orgId },
          },
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
            organization_id: orgId,
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
        organization_id: orgId,
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
      let performanceScore = 0;
      if (totalProjectTasks > 0 && totalAssignedTasks > 0) {
        performanceScore = Math.round(projectCompletionRate * 0.6 + directCompletionRate * 0.4);
      } else if (totalProjectTasks > 0) {
        performanceScore = projectCompletionRate;
      } else if (totalAssignedTasks > 0) {
        performanceScore = directCompletionRate;
      } else {
        performanceScore = 100; // Fresh lead / clean slate
      }

      // Performance rating label
      let performanceLabel = 'Exceptional';
      let performanceColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
      if (performanceScore >= 85) {
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
