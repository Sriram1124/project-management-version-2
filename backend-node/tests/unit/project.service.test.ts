import fs from 'fs';
import path from 'path';
import { ProjectStatus, ProjectMethodology } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';
import { StorageService } from '../../src/services/storage.service';
import { ProjectService } from '../../src/services/project.service';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    project: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    projectOwner: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    projectMember: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    projectDocument: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    role: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    rolePermission: {
      create: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    permission: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn().mockResolvedValue({}),
    },
    organization: {
      findFirst: jest.fn(),
    },
    workItem: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../src/services/storage.service', () => ({
  StorageService: {
    saveProjectFile: jest.fn().mockResolvedValue({ storageKey: 'projects/p-1/spec.pdf' }),
    deleteFile: jest.fn().mockResolvedValue(true),
    getStorageRoot: jest.fn().mockReturnValue(path.resolve('./test-storage')),
    getMimeType: jest.fn().mockReturnValue('application/pdf'),
  },
}));

describe('ProjectService Unit Tests', () => {
  const mockOrgUser = {
    id: 'user-mgr-1',
    organization_id: 'org-1',
    role: 'MANAGER',
  };

  const mockInternUser = {
    id: 'user-intern-1',
    organization_id: 'org-1',
    role: 'INTERN',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listProjects', () => {
    it('should throw if user has no organization_id', async () => {
      await expect(ProjectService.listProjects({ id: 'u-no-org' })).rejects.toThrow(
        'User does not belong to any organization'
      );
    });

    it('should throw if invalid project status filter is supplied', async () => {
      await expect(
        ProjectService.listProjects(mockOrgUser, { status: 'INVALID_STATUS' as any })
      ).rejects.toThrow('Invalid project status: INVALID_STATUS');
    });

    it('should list projects with status and my filters', async () => {
      (prisma.project.findMany as jest.Mock).mockResolvedValue([
        { id: 'p-1', name: 'Project One', organization_id: 'org-1' },
      ]);

      const projects = await ProjectService.listProjects(mockOrgUser, {
        status: ProjectStatus.ACTIVE,
        my: true,
      });

      expect(projects.length).toBe(1);
      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organization_id: 'org-1',
            status: ProjectStatus.ACTIVE,
            OR: expect.any(Array),
          }),
        })
      );
    });
  });

  describe('getProjectById', () => {
    it('should throw if projectId is missing or undefined', async () => {
      await expect(ProjectService.getProjectById('', mockOrgUser)).rejects.toThrow('Project not found');
      await expect(ProjectService.getProjectById('undefined', mockOrgUser)).rejects.toThrow('Project not found');
    });

    it('should throw if project not found in database', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(ProjectService.getProjectById('p-missing', mockOrgUser)).rejects.toThrow('Project not found');
    });

    it('should forbid non-manager non-member non-owner user', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue({
        id: 'p-1',
        owner_id: 'other-owner',
        members: [{ user_id: 'someone-else' }],
      });

      await expect(ProjectService.getProjectById('p-1', mockInternUser)).rejects.toThrow(
        'Forbidden: you are not a member of this project'
      );
    });

    it('should return project when user is project member', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue({
        id: 'p-1',
        owner_id: 'other-owner',
        members: [{ user_id: mockInternUser.id }],
      });

      const res = await ProjectService.getProjectById('p-1', mockInternUser);
      expect(res.id).toBe('p-1');
    });
  });

  describe('createProject', () => {
    it('should validate required fields: name and methodology', async () => {
      await expect(
        ProjectService.createProject({ name: '', methodology: 'SCRUM' }, mockOrgUser)
      ).rejects.toThrow('Project name is required');

      await expect(
        ProjectService.createProject({ name: 'Project A', methodology: '' }, mockOrgUser)
      ).rejects.toThrow('Project methodology is required (SCRUM or KANBAN)');

      await expect(
        ProjectService.createProject({ name: 'Project A', methodology: 'WATERFALL' }, mockOrgUser)
      ).rejects.toThrow('Invalid project methodology: WATERFALL. Must be SCRUM or KANBAN.');
    });

    it('should validate owner belongs to organization', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        ProjectService.createProject(
          { name: 'Project A', methodology: 'SCRUM', owner_id: 'bad-owner' },
          mockOrgUser
        )
      ).rejects.toThrow('Project owner does not exist in your organization');
    });

    it('should validate start_date and end_date', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'valid-owner' });

      await expect(
        ProjectService.createProject(
          { name: 'Proj', methodology: 'SCRUM', start_date: 'invalid-date' },
          mockOrgUser
        )
      ).rejects.toThrow('Invalid start_date format');

      await expect(
        ProjectService.createProject(
          { name: 'Proj', methodology: 'SCRUM', end_date: 'invalid-date' },
          mockOrgUser
        )
      ).rejects.toThrow('Invalid end_date format');

      await expect(
        ProjectService.createProject(
          {
            name: 'Proj',
            methodology: 'SCRUM',
            start_date: '2026-05-01',
            end_date: '2026-04-01',
          },
          mockOrgUser
        )
      ).rejects.toThrow('end_date cannot be earlier than start_date');
    });

    it('should validate status normalization and member validation', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'm-1' }]); // returned 1, requested 2
      await expect(
        ProjectService.createProject(
          {
            name: 'Proj',
            methodology: 'KANBAN',
            member_ids: ['m-1', 'm-2'],
          },
          mockOrgUser
        )
      ).rejects.toThrow('One or more selected members do not exist in your organization');
    });

    it('should create project successfully with members', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'm-1' }]);
      (prisma.project.create as jest.Mock).mockResolvedValue({
        id: 'p-new',
        name: 'New Project',
        methodology: ProjectMethodology.SCRUM,
        status: ProjectStatus.ACTIVE,
      });

      const res = await ProjectService.createProject(
        {
          name: 'New Project',
          methodology: 'SCRUM',
          status: 'IN_PROGRESS' as any,
          member_ids: ['m-1'],
        },
        mockOrgUser
      );

      expect(res.id).toBe('p-new');
      expect(prisma.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ProjectStatus.ACTIVE,
            methodology: ProjectMethodology.SCRUM,
          }),
        })
      );
    });

    it('should reject if an empty owner_ids list is explicitly provided', async () => {
      await expect(
        ProjectService.createProject(
          { name: 'Multi Owner Proj', methodology: 'SCRUM', owner_ids: [] },
          { id: '', organization_id: 'org-1', role: 'MANAGER' }
        )
      ).rejects.toThrow('At least one project owner is required');
    });

    it('should reject if an INTERN is provided as a project owner', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue({
        id: 'intern-1',
        name: 'Intern User',
        email: 'intern@test.com',
        roles: [{ role: { name: 'INTERN' } }],
      });

      await expect(
        ProjectService.createProject(
          { name: 'Intern Owned Proj', methodology: 'SCRUM', owner_ids: ['intern-1'] },
          mockOrgUser
        )
      ).rejects.toThrow(/not eligible to be a project owner/);
    });

    it('should reject if a selected owner is neither manager nor admin', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue({
        id: 'dev-1',
        name: 'Dev User',
        email: 'dev@test.com',
        roles: [{ role: { name: 'DEVELOPER' } }],
      });

      await expect(
        ProjectService.createProject(
          { name: 'Dev Owned Proj', methodology: 'SCRUM', owner_ids: ['dev-1'] },
          mockOrgUser
        )
      ).rejects.toThrow(/not eligible to be a project owner/);
    });

    it('should reject if any owner in multiple owner_ids does not exist or belongs to another org', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: 'mgr-1', roles: [{ role: { name: 'MANAGER' } }] },
        // mgr-2 is missing / from another org
      ]);

      await expect(
        ProjectService.createProject(
          { name: 'Multi Owner Proj', methodology: 'SCRUM', owner_ids: ['mgr-1', 'mgr-2'] },
          mockOrgUser
        )
      ).rejects.toThrow('One or more selected project owners do not exist in your organization');
    });

    it('should successfully create project with multiple owners and persist owners relation', async () => {
      (prisma.user.findMany as jest.Mock)
        .mockResolvedValueOnce([
          { id: 'mgr-1', name: 'Mgr One', roles: [{ role: { name: 'MANAGER' } }] },
          { id: 'mgr-2', name: 'Admin Two', roles: [{ role: { name: 'ADMIN' } }] },
        ])
        .mockResolvedValueOnce([
          { id: 'mem-1', name: 'Intern Mem', roles: [{ role: { name: 'INTERN' } }] },
        ]);

      (prisma.project.create as jest.Mock).mockResolvedValue({
        id: 'p-multi',
        name: 'Multi Owner Project',
        owner_id: 'mgr-1',
        owners: [
          { user_id: 'mgr-1', user: { id: 'mgr-1', name: 'Mgr One' } },
          { user_id: 'mgr-2', user: { id: 'mgr-2', name: 'Admin Two' } },
        ],
        members: [{ user_id: 'mem-1' }],
      });

      const res = await ProjectService.createProject(
        {
          name: 'Multi Owner Project',
          methodology: 'SCRUM',
          owner_ids: ['mgr-1', 'mgr-2'],
          member_ids: ['mgr-1', 'mem-1'], // mgr-1 is already an owner, should be excluded from members
        },
        mockOrgUser
      );

      expect(res.id).toBe('p-multi');
      expect(prisma.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            owner_id: 'mgr-1',
            owners: {
              create: [{ user_id: 'mgr-1' }, { user_id: 'mgr-2' }],
            },
            // member_ids should exclude mgr-1 because mgr-1 is an owner
            members: {
              create: [{ user_id: 'mem-1' }],
            },
          }),
        })
      );
      expect(res.owners).toHaveLength(2);
    });

    it('should reject if a SUPER_ADMIN is selected as a regular project task member', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue({
        id: 'mgr-1',
        roles: [{ role: { name: 'MANAGER' } }],
      });
      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: 'sa-1', name: 'Super Admin', roles: [{ role: { name: 'SUPER_ADMIN' } }] },
      ]);

      await expect(
        ProjectService.createProject(
          {
            name: 'Proj',
            methodology: 'SCRUM',
            owner_id: 'mgr-1',
            member_ids: ['sa-1'],
          },
          mockOrgUser
        )
      ).rejects.toThrow(/cannot be assigned as a project member/);
    });
  });

  describe('updateProject', () => {
    it('should throw if project not found', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(
        ProjectService.updateProject('p-missing', { name: 'Updated' }, mockOrgUser)
      ).rejects.toThrow('Project not found');
    });

    it('should forbid changing methodology after creation', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue({
        id: 'p-1',
        methodology: ProjectMethodology.SCRUM,
        organization_id: 'org-1',
      });

      await expect(
        ProjectService.updateProject('p-1', { methodology: 'KANBAN' }, mockOrgUser)
      ).rejects.toThrow('Project methodology is immutable and cannot be changed after creation');
    });

    it('should reject empty name', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue({
        id: 'p-1',
        methodology: ProjectMethodology.SCRUM,
        organization_id: 'org-1',
      });

      await expect(ProjectService.updateProject('p-1', { name: '  ' }, mockOrgUser)).rejects.toThrow(
        'Project name cannot be empty'
      );
    });

    it('should validate date ordering during update', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue({
        id: 'p-1',
        methodology: ProjectMethodology.SCRUM,
        start_date: new Date('2026-06-01'),
        end_date: new Date('2026-08-01'),
        organization_id: 'org-1',
      });

      await expect(
        ProjectService.updateProject('p-1', { end_date: '2026-05-01' }, mockOrgUser)
      ).rejects.toThrow('end_date cannot be earlier than start_date');
    });

    it('should update project successfully', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue({
        id: 'p-1',
        methodology: ProjectMethodology.SCRUM,
        organization_id: 'org-1',
      });
      (prisma.project.update as jest.Mock).mockResolvedValue({
        id: 'p-1',
        name: 'Renamed Project',
        status: ProjectStatus.COMPLETED,
      });

      const updated = await ProjectService.updateProject(
        'p-1',
        { name: 'Renamed Project', status: 'COMPLETED' as any },
        mockOrgUser
      );

      expect(updated.name).toBe('Renamed Project');
    });

    it('should support updating multiple project owners and sync memberships', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue({
        id: 'p-1',
        owner_id: 'user-mgr-1',
        organization_id: 'org-1',
        methodology: ProjectMethodology.SCRUM,
      });
      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: 'user-mgr-1', name: 'Manager 1', roles: [{ role: { name: 'MANAGER' } }] },
        { id: 'user-mgr-2', name: 'Manager 2', roles: [{ role: { name: 'TECH_LEAD' } }] },
      ]);
      (prisma.project.update as jest.Mock).mockResolvedValue({
        id: 'p-1',
        name: 'Project 1',
        owner_id: 'user-mgr-1',
        owner: { id: 'user-mgr-1', name: 'Manager 1', email: 'm1@example.com' },
        members: [
          { project_role: 'MANAGER', user: { id: 'user-mgr-2', name: 'Manager 2', email: 'm2@example.com' } },
        ],
      });
      (prisma.projectMember.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.projectMember.findMany as jest.Mock).mockResolvedValue([]);

      const updated = await ProjectService.updateProject(
        'p-1',
        { owner_ids: ['user-mgr-1', 'user-mgr-2'] },
        mockOrgUser
      );

      expect(updated.owners).toHaveLength(2);
      expect(updated.owner_ids).toEqual(['user-mgr-1', 'user-mgr-2']);
      expect(prisma.projectMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            project_id: 'p-1',
            project_role: 'MANAGER',
          }),
        })
      );
    });

    it('should reject assigning pure interns as project owners', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue({
        id: 'p-1',
        owner_id: 'user-mgr-1',
        organization_id: 'org-1',
        methodology: ProjectMethodology.SCRUM,
      });
      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: 'user-intern-1', name: 'Intern Dave', roles: [{ role: { name: 'INTERN' } }] },
      ]);

      await expect(
        ProjectService.updateProject('p-1', { owner_ids: ['user-intern-1'] }, mockOrgUser)
      ).rejects.toThrow('User "Intern Dave" is an intern and cannot be assigned as a project owner');
    });
  });

  describe('archiveProject', () => {
    it('should throw if project not found', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.project.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(ProjectService.archiveProject('p-missing', mockOrgUser)).rejects.toThrow(
        'Project not found'
      );
    });

    it('should archive existing project', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue({ id: 'p-1', organization_id: 'org-1' });
      (prisma.project.update as jest.Mock).mockResolvedValue({ id: 'p-1', status: ProjectStatus.ARCHIVED });

      const res = await ProjectService.archiveProject('p-1', mockOrgUser);
      expect(res.status).toBe(ProjectStatus.ARCHIVED);
    });
  });

  describe('deleteProject', () => {
    it('should throw if project not found', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.project.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(ProjectService.deleteProject('p-missing', mockOrgUser)).rejects.toThrow(
        'Project not found'
      );
    });

    it('should forbid non-manager non-owner from deleting project', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue({
        id: 'p-1',
        name: 'Secret Project',
        owner_id: 'other-mgr',
        owners: [],
        organization_id: 'org-1',
      });

      await expect(ProjectService.deleteProject('p-1', mockInternUser)).rejects.toThrow(
        'Forbidden: only managers or project owners can delete this project'
      );
    });

    it('should delete project completely from database including child relations', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue({
        id: 'p-1',
        name: 'Project to Delete',
        owner_id: mockOrgUser.id,
        owners: [{ user_id: mockOrgUser.id }],
        organization_id: 'org-1',
      });

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          workItem: {
            findMany: jest.fn().mockResolvedValue([{ id: 'wi-1' }]),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          workItemAssignee: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
          workItemComment: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
          workItemAttachment: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
          workItemExtensionRequest: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
          timeEntry: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          workSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          projectOwner: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
          projectMember: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
          projectDocument: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
          actionItem: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
          sprint: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
          role: {
            findMany: jest.fn().mockResolvedValue([]),
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
          rolePermission: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          userRole: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          form: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
          project: { delete: jest.fn().mockResolvedValue({ id: 'p-1' }) },
        };
        return callback(tx);
      });

      const res = await ProjectService.deleteProject('p-1', mockOrgUser);
      expect(res.success).toBe(true);
      expect(res.id).toBe('p-1');
      expect(res.name).toBe('Project to Delete');
    });
  });

  describe('getProjectMembers', () => {
    it('should return sorted project members with TECH_LEAD first', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue({ id: 'p-1', organization_id: 'org-1' });
      (prisma.projectMember.findMany as jest.Mock).mockResolvedValue([
        {
          project_role: 'DEVELOPER',
          role_id: 'r-dev',
          user: { id: 'u-dev', name: 'Bob Dev', email: 'bob@example.com' },
          role: { id: 'r-dev', name: 'DEVELOPER', permissions: [] },
        },
        {
          project_role: 'TECH_LEAD',
          role_id: 'r-lead',
          user: { id: 'u-lead', name: 'Alice Lead', email: 'alice@example.com' },
          role: { id: 'r-lead', name: 'TECH_LEAD', permissions: [] },
        },
      ]);

      const members = await ProjectService.getProjectMembers('p-1', mockOrgUser, 'Alice');
      expect(members[0].project_role).toBe('TECH_LEAD');
      expect(members[1].project_role).toBe('DEVELOPER');
    });
  });

  describe('getAvailablePermissions & ensureBuiltInProjectRoles', () => {
    it('should list all available permissions and group them', async () => {
      (prisma.permission.findMany as jest.Mock).mockResolvedValue([
        { id: 'p-1', name: 'PROJECT_READ', description: 'Read projects' },
        { id: 'p-2', name: 'TASK_CREATE', description: 'Create tasks' },
      ]);

      const res = await ProjectService.getAvailablePermissions(mockOrgUser, 'project');
      expect(res.totalCount).toBe(2);
      expect(res.categories).toContain('Projects');
      expect(res.categories).toContain('Tasks & Sprints');
    });

    it('should ensure built-in project roles exist in DB', async () => {
      (prisma.role.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.role.create as jest.Mock).mockResolvedValue({ id: 'new-role' });
      (prisma.permission.findFirst as jest.Mock).mockResolvedValue({ id: 'perm-1' });

      await ProjectService.ensureBuiltInProjectRoles();
      expect(prisma.role.create).toHaveBeenCalled();
    });
  });

  describe('getProjectRoles & createCustomRole', () => {
    it('should return available project roles', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue({ id: 'p-1', organization_id: 'org-1' });
      (prisma.role.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'r-1',
          name: 'DEVELOPER',
          is_custom: false,
          permissions: [{ permission: { name: 'PROJECT_READ' } }],
        },
      ]);

      const roles = await ProjectService.getProjectRoles('p-1', mockOrgUser);
      expect(roles.length).toBe(1);
      expect(roles[0].name).toBe('DEVELOPER');
      expect(roles[0].permissions).toContain('PROJECT_READ');
    });

    it('should validate authorization for custom role creation', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue(null); // not project owner
      await expect(
        ProjectService.createCustomRole('p-1', { name: 'Role', permissions: ['TASK_READ'] }, mockInternUser)
      ).rejects.toThrow('Unauthorized: Only managers, administrators, or project owners can create custom roles');
    });

    it('should validate custom role name and scope restrictions', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue({ id: 'p-1', organization_id: 'org-1' });

      await expect(
        ProjectService.createCustomRole('p-1', { name: 'R', permissions: ['TASK_READ'] }, mockOrgUser)
      ).rejects.toThrow('Role name must be at least 2 characters long');

      await expect(
        ProjectService.createCustomRole('p-1', { name: 'Valid Role', permissions: [] }, mockOrgUser)
      ).rejects.toThrow('At least one permission must be selected for the custom role');

      // Invalid out-of-scope permission
      await expect(
        ProjectService.createCustomRole('p-1', { name: 'Valid Role', permissions: ['ORGANIZATION_DELETE'] }, mockOrgUser)
      ).rejects.toThrow('Invalid project-scoped permissions: ORGANIZATION_DELETE');
    });

    it('should reject duplicate custom role name in scope', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue({ id: 'p-1', organization_id: 'org-1' });
      (prisma.role.findFirst as jest.Mock).mockResolvedValue({ id: 'existing-role' });

      await expect(
        ProjectService.createCustomRole('p-1', { name: 'Developer', permissions: ['TASK_READ'] }, mockOrgUser)
      ).rejects.toThrow('A role with the name "Developer" already exists in this scope.');
    });

    it('should create custom role in transaction', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue({ id: 'p-1', organization_id: 'org-1' });
      (prisma.role.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.permission.findMany as jest.Mock).mockResolvedValue([
        { id: 'perm-read', name: 'TASK_READ' },
      ]);

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          role: {
            create: jest.fn().mockResolvedValue({
              id: 'custom-role-1',
              name: 'Scrum Assistant',
              project_id: 'p-1',
              organization_id: 'org-1',
              created_at: new Date(),
            }),
          },
          rolePermission: { createMany: jest.fn() },
        };
        return await callback(tx);
      });

      const res = await ProjectService.createCustomRole(
        'p-1',
        { name: 'Scrum Assistant', permissions: ['TASK_READ'] },
        mockOrgUser
      );

      expect(res.name).toBe('Scrum Assistant');
      expect(res.permissions).toContain('TASK_READ');
      expect(res.carry_forward).toBe(false);
      expect(res.is_template).toBe(false);
    });

    it('should create project-scoped custom role when carry_forward is false', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue({ id: 'p-1', organization_id: 'org-1' });
      (prisma.role.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.permission.findMany as jest.Mock).mockResolvedValue([
        { id: 'perm-read', name: 'TASK_READ' },
      ]);

      let createRolePayload: any = null;
      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          role: {
            create: jest.fn().mockImplementation(async ({ data }) => {
              createRolePayload = data;
              return {
                id: 'custom-role-project-only',
                name: 'Project Specialist',
                organization_id: data.organization_id,
                project_id: data.project_id,
                is_custom: true,
                created_at: new Date(),
              };
            }),
          },
          rolePermission: { createMany: jest.fn() },
        };
        return await callback(tx);
      });

      const res = await ProjectService.createCustomRole(
        'p-1',
        { name: 'Project Specialist', permissions: ['TASK_READ'], carry_forward: false },
        mockOrgUser
      );

      expect(createRolePayload.project_id).toBe('p-1');
      expect(createRolePayload.organization_id).toBe('org-1');
      expect(res.carry_forward).toBe(false);
      expect(res.is_template).toBe(false);
      expect(res.project_id).toBe('p-1');
    });

    it('should create reusable organization-scoped custom role when carry_forward is true', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue({ id: 'p-1', organization_id: 'org-1' });
      (prisma.role.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.permission.findMany as jest.Mock).mockResolvedValue([
        { id: 'perm-read', name: 'TASK_READ' },
      ]);

      let createRolePayload: any = null;
      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          role: {
            create: jest.fn().mockImplementation(async ({ data }) => {
              createRolePayload = data;
              return {
                id: 'custom-role-reusable',
                name: 'Org Reusable Specialist',
                organization_id: data.organization_id,
                project_id: data.project_id,
                is_custom: true,
                created_at: new Date(),
              };
            }),
          },
          rolePermission: { createMany: jest.fn() },
        };
        return await callback(tx);
      });

      const res = await ProjectService.createCustomRole(
        'p-1',
        { name: 'Org Reusable Specialist', permissions: ['TASK_READ'], carry_forward: true },
        mockOrgUser
      );

      expect(createRolePayload.project_id).toBeNull();
      expect(createRolePayload.organization_id).toBe('org-1');
      expect(res.carry_forward).toBe(true);
      expect(res.is_template).toBe(true);
      expect(res.project_id).toBeNull();
    });

    it('should expose carry_forward and is_template flags in getProjectRoles', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue({ id: 'p-1', organization_id: 'org-1' });
      (prisma.role.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'r-builtin',
          name: 'DEVELOPER',
          is_custom: false,
          organization_id: null,
          project_id: null,
          permissions: [{ permission: { name: 'PROJECT_READ' } }],
        },
        {
          id: 'r-project-only',
          name: 'Project Specific Analyst',
          is_custom: true,
          organization_id: 'org-1',
          project_id: 'p-1',
          permissions: [{ permission: { name: 'TASK_READ' } }],
        },
        {
          id: 'r-reusable',
          name: 'Org Reusable Lead',
          is_custom: true,
          organization_id: 'org-1',
          project_id: null,
          permissions: [{ permission: { name: 'TASK_READ' } }, { permission: { name: 'TASK_CREATE' } }],
        },
      ]);

      const roles = await ProjectService.getProjectRoles('p-1', mockOrgUser);
      expect(roles.length).toBe(3);

      const builtin = roles.find((r) => r.name === 'DEVELOPER');
      expect(builtin.is_custom).toBe(false);
      expect(builtin.carry_forward).toBe(false);

      const projOnly = roles.find((r) => r.name === 'Project Specific Analyst');
      expect(projOnly.is_custom).toBe(true);
      expect(projOnly.project_id).toBe('p-1');
      expect(projOnly.carry_forward).toBe(false);
      expect(projOnly.is_template).toBe(false);

      const reusable = roles.find((r) => r.name === 'Org Reusable Lead');
      expect(reusable.is_custom).toBe(true);
      expect(reusable.project_id).toBeNull();
      expect(reusable.carry_forward).toBe(true);
      expect(reusable.is_template).toBe(true);
    });
  });

  describe('updateProjectMemberRoles & updateMemberPermissions', () => {
    it('should reject invalid role assignments or cross-project role assignments', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue({ id: 'p-1', organization_id: 'org-1' });
      (prisma.role.findUnique as jest.Mock).mockResolvedValue({
        id: 'role-p2',
        name: 'Project 2 Role',
        project_id: 'p-2', // scoped to project 2
      });

      await expect(
        ProjectService.updateProjectMemberRoles(
          'p-1',
          [{ user_id: 'u-1', role_id: 'role-p2' }],
          mockOrgUser
        )
      ).rejects.toThrow('Cross-project role assignment rejected');
    });

    it('should update member roles successfully with standard roles', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue({ id: 'p-1', organization_id: 'org-1' });
      (prisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
        project_id: 'p-1',
        user_id: 'u-1',
      });
      (prisma.projectMember.findMany as jest.Mock).mockResolvedValue([]);

      const members = await ProjectService.updateProjectMemberRoles(
        'p-1',
        [{ user_id: 'u-1', project_role: 'LEAD' }],
        mockOrgUser
      );

      expect(prisma.projectMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            project_role: 'TECH_LEAD',
          }),
        })
      );
    });

    it('should clear custom permissions when permissions array is empty or NONE', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue({ id: 'p-1', organization_id: 'org-1' });
      (prisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
        project_id: 'p-1',
        user_id: 'u-1',
        role: { id: 'r-custom', is_custom: true, name: 'Member_u-1_p-1' },
      });
      (prisma.projectMember.findMany as jest.Mock).mockResolvedValue([]);

      await ProjectService.updateMemberPermissions('p-1', 'u-1', ['NONE'], mockOrgUser);
      expect(prisma.projectMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { role_id: null },
        })
      );
    });
  });

  describe('addProjectMember and removeProjectMember', () => {
    it('should add project member or update existing role', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue({ id: 'p-1', organization_id: 'org-1' });
      (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'u-2', organization_id: 'org-1' });
      (prisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.projectMember.create as jest.Mock).mockResolvedValue({
        project_id: 'p-1',
        user_id: 'u-2',
        project_role: 'DEVELOPER',
        role_id: null,
        user: { id: 'u-2', name: 'User 2', email: 'u2@example.com' },
      });

      const res = await ProjectService.addProjectMember('p-1', 'u-2', mockOrgUser, 'DEVELOPER');
      expect(res.user_id).toBe('u-2');
      expect(res.role).toBe('DEVELOPER');
    });

    it('should remove project member', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue({ id: 'p-1', organization_id: 'org-1' });
      const res = await ProjectService.removeProjectMember('p-1', 'u-2', mockOrgUser);
      expect(res.message).toBe('Member removed successfully');
      expect(prisma.projectMember.deleteMany).toHaveBeenCalledWith({
        where: { project_id: 'p-1', user_id: 'u-2' },
      });
    });
  });

  describe('Project Documents and File Handling', () => {
    it('should list project documents', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue({ id: 'p-1', organization_id: 'org-1' });
      (prisma.projectDocument.findMany as jest.Mock).mockResolvedValue([
        { id: 'doc-1', name: 'Spec.pdf', project_id: 'p-1' },
      ]);

      const docs = await ProjectService.getProjectDocuments('p-1', mockOrgUser);
      expect(docs.length).toBe(1);
    });

    it('should upload file and save document metadata', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue({ id: 'p-1', organization_id: 'org-1' });
      (prisma.projectDocument.create as jest.Mock).mockResolvedValue({
        id: 'doc-1',
        name: 'Architecture.pdf',
        document_type: 'pdf',
        storage_key: 'projects/p-1/Architecture.pdf',
      });

      const doc = await ProjectService.uploadProjectDocumentWithFile(
        'p-1',
        {
          originalname: 'Architecture.pdf',
          buffer: Buffer.from('dummy content'),
        },
        mockOrgUser
      );

      expect(doc.name).toBe('Architecture.pdf');
    });

    it('should retrieve physical document file for download', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue({ id: 'p-1', organization_id: 'org-1' });
      (prisma.projectDocument.findFirst as jest.Mock).mockResolvedValue({
        id: 'doc-1',
        name: 'Document.pdf',
        storage_key: 'doc.pdf',
        project_id: 'p-1',
      });

      const res = await ProjectService.getProjectDocumentFile('p-1', 'doc-1', mockOrgUser);
      expect(res.document.id).toBe('doc-1');
      expect(res.mimeType).toBe('application/pdf');
    });

    it('should update and delete document', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue({ id: 'p-1', organization_id: 'org-1' });
      (prisma.projectDocument.findFirst as jest.Mock).mockResolvedValue({
        id: 'doc-1',
        name: 'Old.pdf',
        storage_key: 'old.pdf',
      });
      (prisma.projectDocument.update as jest.Mock).mockResolvedValue({
        id: 'doc-1',
        name: 'New.pdf',
      });

      const updated = await ProjectService.updateProjectDocument(
        'p-1',
        'doc-1',
        { name: 'New.pdf' },
        mockOrgUser
      );
      expect(updated.name).toBe('New.pdf');

      const deleted = await ProjectService.deleteProjectDocument('p-1', 'doc-1', mockOrgUser);
      expect(deleted.success).toBe(true);
      expect(StorageService.deleteFile).toHaveBeenCalledWith('old.pdf');
    });
  });

  describe('getTechLeadsOverview', () => {
    it('should return overview metrics for tech leads', async () => {
      (prisma.projectMember.findMany as jest.Mock).mockResolvedValue([
        {
          project_role: 'TECH_LEAD',
          user: {
            id: 'lead-1',
            name: 'Sarah Lead',
            email: 'sarah@example.com',
            batch: 'A',
            is_active: true,
            roles: [{ role: { name: 'TECH_LEAD' } }],
          },
          project: {
            id: 'proj-1',
            name: 'Alpha Project',
            status: 'ACTIVE',
            start_date: new Date(),
            end_date: new Date(),
          },
        },
      ]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

      (prisma.workItem.findMany as jest.Mock)
        .mockResolvedValueOnce([
          // projectWorkItems
          {
            id: 'task-1',
            project_id: 'proj-1',
            status: 'COMPLETED',
            priority: 'HIGH',
            story_points: 5,
            type: 'TASK',
            assignees: [{ user_id: 'lead-1' }],
          },
          {
            id: 'task-2',
            project_id: 'proj-1',
            status: 'IN_PROGRESS',
            priority: 'MEDIUM',
            story_points: 3,
            type: 'TASK',
            assignees: [],
          },
        ])
        .mockResolvedValueOnce([
          // leadAssignedItems
          {
            id: 'task-1',
            project_id: 'proj-1',
            status: 'COMPLETED',
            story_points: 5,
            assignees: [{ user_id: 'lead-1' }],
          },
        ]);

      const overview = await ProjectService.getTechLeadsOverview(mockOrgUser);
      expect(overview.length).toBe(1);
      expect(overview[0].name).toBe('Sarah Lead');
      expect(overview[0].project_count).toBe(1);
      expect(overview[0].total_project_tasks).toBe(2);
      expect(overview[0].completed_project_tasks).toBe(1);
      expect(overview[0].project_completion_rate).toBe(50);
      expect(overview[0].direct_assigned_tasks).toBe(1);
      expect(overview[0].direct_completion_rate).toBe(100);
      // Performance score: 50 * 0.6 + 100 * 0.4 = 70
      expect(overview[0].performance_score).toBe(70);
      expect(overview[0].performance_label).toBe('Strong');
      // Project Health & Risk Assessment
      expect(overview[0].health_score).toBeGreaterThanOrEqual(0);
      expect(overview[0].health_status).toBeDefined();
      expect(overview[0].risk_level).toBeDefined();
      expect(overview[0].projects[0].health_score).toBeDefined();
      expect(overview[0].projects[0].risk_level).toBeDefined();
      expect(overview[0].projects[0].schedule_health).toBeDefined();
      expect(overview[0].projects[0].recommended_actions).toBeDefined();
    });

    it('should handle tech lead with 0 project tasks as Insufficient Data', async () => {
      (prisma.projectMember.findMany as jest.Mock).mockResolvedValue([
        {
          project_role: 'TECH_LEAD',
          user: {
            id: 'lead-2',
            name: 'Empty Lead',
            email: 'empty@example.com',
            is_active: true,
            roles: [],
          },
          project: {
            id: 'proj-empty',
            name: 'Empty Project',
            status: 'PLANNED',
          },
        },
      ]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.workItem.findMany as jest.Mock)
        .mockResolvedValueOnce([]) // 0 project items
        .mockResolvedValueOnce([]); // 0 lead assigned items

      const overview = await ProjectService.getTechLeadsOverview(mockOrgUser);
      expect(overview[0].total_project_tasks).toBe(0);
      expect(overview[0].performance_score).toBe(0);
      expect(overview[0].performance_label).toBe('No Tasks');
      expect(overview[0].health_score).toBeNull();
      expect(overview[0].health_status).toBe('INSUFFICIENT_DATA');
      expect(overview[0].risk_level).toBe('Insufficient Data');
      expect(overview[0].projects[0].health_score).toBeNull();
      expect(overview[0].projects[0].risk_level).toBe('Insufficient Data');
    });
  });
});
