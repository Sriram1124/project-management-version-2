import { ProjectMembershipService } from '../src/membership/project-membership.service';
import { IdentityMappingService } from '../src/identity-mapping/identity-mapping.service';
import { mockPrisma, resetPrismaMock } from '../../backend-node/tests/mocks/prisma.mock';

describe('MiraiAdapter: ProjectMembershipService', () => {
  const orgId = 'org-test-tenant-1';
  const miraiUserId = 'd56a3127-142f-48d6-95ff-f2d4fdf3d820';
  const pmUserId = 'pm-user-uuid-1';
  const projectId = 'proj-uuid-100';

  const mockServiceUser = {
    id: 'service:mirai',
    organization_id: orgId,
    role: 'SERVICE',
  };

  beforeEach(() => {
    resetPrismaMock();
  });

  describe('checkProjectMembership', () => {
    it('returns true when user is in project_members in the same tenant', async () => {
      // 1. Project exists in tenant
      (mockPrisma.project.findFirst as jest.Mock).mockResolvedValue({
        id: projectId,
        organization_id: orgId,
        status: 'ACTIVE',
      });

      // 2. Identity mapping exists
      (mockPrisma.userIdentityMapping.findFirst as jest.Mock).mockResolvedValue({
        id: 'map-1',
        mirai_user_id: miraiUserId,
        pm_user_id: pmUserId,
        organization_id: orgId,
      });

      // 3. User is active
      (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue({
        id: pmUserId,
        organization_id: orgId,
        is_active: true,
      });

      // 4. ProjectMember row exists
      (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue({
        project_id: projectId,
        user_id: pmUserId,
        project_role: 'DEVELOPER',
        role_id: null,
      });

      const result = await ProjectMembershipService.checkProjectMembership(projectId, miraiUserId, mockServiceUser);
      expect(result.is_member).toBe(true);
      expect(result.pm_user_id).toBe(pmUserId);
      expect(result.project_role).toBe('DEVELOPER');
    });

    it('returns false when user is resolved but has no project_members row', async () => {
      (mockPrisma.project.findFirst as jest.Mock).mockResolvedValue({
        id: projectId,
        organization_id: orgId,
        status: 'ACTIVE',
      });

      (mockPrisma.userIdentityMapping.findFirst as jest.Mock).mockResolvedValue({
        id: 'map-1',
        mirai_user_id: miraiUserId,
        pm_user_id: pmUserId,
        organization_id: orgId,
      });

      (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue({
        id: pmUserId,
        organization_id: orgId,
        is_active: true,
      });

      (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await ProjectMembershipService.checkProjectMembership(projectId, miraiUserId, mockServiceUser);
      expect(result.is_member).toBe(false);
      expect(result.project_role).toBeNull();
    });

    it('throws Project not found when project belongs to a different organization', async () => {
      (mockPrisma.project.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        ProjectMembershipService.checkProjectMembership(projectId, miraiUserId, mockServiceUser)
      ).rejects.toThrow('Project not found');
    });

    it('throws User not found when identity is unmapped', async () => {
      (mockPrisma.project.findFirst as jest.Mock).mockResolvedValue({
        id: projectId,
        organization_id: orgId,
        status: 'ACTIVE',
      });

      (mockPrisma.userIdentityMapping.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        ProjectMembershipService.checkProjectMembership(projectId, miraiUserId, mockServiceUser)
      ).rejects.toThrow('User not found');
    });
  });

  describe('getUserProjectMemberships', () => {
    it('returns all project IDs user is member of within tenant', async () => {
      (mockPrisma.userIdentityMapping.findFirst as jest.Mock).mockResolvedValue({
        id: 'map-1',
        mirai_user_id: miraiUserId,
        pm_user_id: pmUserId,
        organization_id: orgId,
      });

      (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue({
        id: pmUserId,
        organization_id: orgId,
        is_active: true,
      });

      (mockPrisma.projectMember.findMany as jest.Mock).mockResolvedValue([
        { project_id: 'proj-1' },
        { project_id: 'proj-2' },
        { project_id: 'proj-3' },
      ]);

      const result = await ProjectMembershipService.getUserProjectMemberships(miraiUserId, mockServiceUser);
      expect(result.project_ids).toEqual(['proj-1', 'proj-2', 'proj-3']);
      expect(result.total).toBe(3);
      expect(result.pm_user_id).toBe(pmUserId);
    });

    it('throws User not found when identity mapping does not exist', async () => {
      (mockPrisma.userIdentityMapping.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        ProjectMembershipService.getUserProjectMemberships(miraiUserId, mockServiceUser)
      ).rejects.toThrow('User not found');
    });
  });
});

