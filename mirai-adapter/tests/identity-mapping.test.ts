import { IdentityMappingService } from '../src/identity-mapping/identity-mapping.service';
import { MiraiAuditService } from '../src/audit/mirai-audit.service';
import { mockPrisma, resetPrismaMock } from '../../backend-node/tests/mocks/prisma.mock';

describe('MiraiAdapter: IdentityMappingService', () => {
  const orgId = 'org-test-tenant-1';
  const miraiUserId = 'd56a3127-142f-48d6-95ff-f2d4fdf3d820';
  const pmUserId = 'pm-user-uuid-1';
  const mockServiceUser = {
    id: 'service:mirai',
    organization_id: orgId,
    role: 'SERVICE',
  };

  beforeEach(() => {
    resetPrismaMock();
  });

  describe('resolveEffectiveUser', () => {
    it('returns mapped user when active mapping and active PM user exist in tenant', async () => {
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

      const result = await IdentityMappingService.resolveEffectiveUser(miraiUserId, orgId);
      expect(result).toEqual({
        pm_user_id: pmUserId,
        mirai_user_id: miraiUserId,
        mapping_source: 'mapped',
      });
    });

    it('Decision A: fails closed and does NOT create mappings from email during resolution', async () => {
      (mockPrisma.userIdentityMapping.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await IdentityMappingService.resolveEffectiveUser(miraiUserId, orgId, 'intern@test.com');
      expect(result).toBeNull();
      expect(mockPrisma.userIdentityMapping.create).not.toHaveBeenCalled();
    });

    it('Decision B: fails closed on direct UUID matching without an existing mapping row', async () => {
      (mockPrisma.userIdentityMapping.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await IdentityMappingService.resolveEffectiveUser(pmUserId, orgId);
      expect(result).toBeNull();
    });

    it('fails closed when referenced PM user is inactive', async () => {
      (mockPrisma.userIdentityMapping.findFirst as jest.Mock).mockResolvedValue({
        id: 'map-1',
        mirai_user_id: miraiUserId,
        pm_user_id: pmUserId,
        organization_id: orgId,
      });

      (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue({
        id: pmUserId,
        organization_id: orgId,
        is_active: false,
      });

      const result = await IdentityMappingService.resolveEffectiveUser(miraiUserId, orgId);
      expect(result).toBeNull();
    });

    it('fails closed when referenced PM user belongs to a different organization', async () => {
      (mockPrisma.userIdentityMapping.findFirst as jest.Mock).mockResolvedValue({
        id: 'map-1',
        mirai_user_id: miraiUserId,
        pm_user_id: pmUserId,
        organization_id: orgId,
      });

      (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await IdentityMappingService.resolveEffectiveUser(miraiUserId, orgId);
      expect(result).toBeNull();
    });
  });

  describe('reconcileIdentity', () => {
    it('returns existing mapping with mapped status when mapping already exists', async () => {
      (mockPrisma.userIdentityMapping.findFirst as jest.Mock).mockResolvedValue({
        id: 'map-1',
        mirai_user_id: miraiUserId,
        pm_user_id: pmUserId,
      });

      (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue({
        id: pmUserId,
        is_active: true,
      });

      (mockPrisma.projectMember.findMany as jest.Mock).mockResolvedValue([
        { project_id: 'proj-1' },
        { project_id: 'proj-2' },
      ]);

      const result = await IdentityMappingService.reconcileIdentity(miraiUserId, 'alice@test.com', mockServiceUser);
      expect(result.mapping_status).toBe('mapped');
      expect(result.mapping_source).toBe('existing_mapping');
      expect(result.pm_user_id).toBe(pmUserId);
      expect(result.project_ids).toEqual(['proj-1', 'proj-2']);
    });

    it('returns unmapped and records audit with unchanged database mapping when existing mapping points to inactive PM user', async () => {
      const auditSpy = jest.spyOn(MiraiAuditService, 'record');

      (mockPrisma.userIdentityMapping.findFirst as jest.Mock).mockResolvedValue({
        id: 'map-inactive-1',
        mirai_user_id: miraiUserId,
        pm_user_id: pmUserId,
      });

      (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue({
        id: pmUserId,
        is_active: false,
      });

      const result = await IdentityMappingService.reconcileIdentity(miraiUserId, 'alice@test.com', mockServiceUser);
      expect(result.mapping_status).toBe('unmapped');
      expect(result.pm_user_id).toBeNull();
      expect(result.project_ids).toEqual([]);

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          action: 'MIRAI_IDENTITY_RECONCILE_FAILED_INACTIVE',
          targetId: 'map-inactive-1',
          metadata: expect.objectContaining({
            mapping_changed: false,
            source: 'reconcile',
            before: { mirai_user_id: miraiUserId, pm_user_id: pmUserId },
            after: { mirai_user_id: miraiUserId, pm_user_id: pmUserId },
            before_mirai_user_id: miraiUserId,
            before_pm_user_id: pmUserId,
            after_mirai_user_id: miraiUserId,
            after_pm_user_id: pmUserId,
            status: 'unmapped',
          }),
        })
      );
      auditSpy.mockRestore();
    });

    it('auto-maps by email within tenant when unique active match exists', async () => {
      (mockPrisma.userIdentityMapping.findFirst as jest.Mock)
        .mockResolvedValueOnce(null) // existing mapping check
        .mockResolvedValueOnce(null); // conflict check on candidate

      (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: pmUserId, is_active: true, organization_id: orgId },
      ]);

      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return callback(mockPrisma);
      });

      (mockPrisma.userIdentityMapping.create as jest.Mock).mockResolvedValue({
        id: 'new-map-1',
        organization_id: orgId,
        mirai_user_id: miraiUserId,
        pm_user_id: pmUserId,
      });

      (mockPrisma.projectMember.findMany as jest.Mock).mockResolvedValue([{ project_id: 'proj-1' }]);

      const result = await IdentityMappingService.reconcileIdentity(miraiUserId, 'Alice@Test.Com', mockServiceUser);
      expect(result.mapping_status).toBe('mapped');
      expect(result.mapping_source).toBe('auto_mapped_by_email');
      expect(result.pm_user_id).toBe(pmUserId);
      expect(result.project_ids).toEqual(['proj-1']);
    });

    it('Requirement 3: records full audit event atomically in tx on mapping creation with actor, timestamp, source, org, and before/after IDs', async () => {
      const auditSpy = jest.spyOn(MiraiAuditService, 'record');

      (mockPrisma.userIdentityMapping.findFirst as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: pmUserId, is_active: true, organization_id: orgId },
      ]);

      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return callback(mockPrisma);
      });

      (mockPrisma.userIdentityMapping.create as jest.Mock).mockResolvedValue({
        id: 'new-map-1',
        organization_id: orgId,
        mirai_user_id: miraiUserId,
        pm_user_id: pmUserId,
      });

      (mockPrisma.projectMember.findMany as jest.Mock).mockResolvedValue([]);

      await IdentityMappingService.reconcileIdentity(miraiUserId, 'alice@test.com', mockServiceUser);

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          action: 'MIRAI_IDENTITY_MAPPED',
          targetId: 'new-map-1',
          actor: 'service:mirai',
          tx: mockPrisma,
          metadata: expect.objectContaining({
            actor: 'service:mirai',
            timestamp: expect.any(String),
            source: 'email',
            mapping_changed: true,
            organization_id: orgId,
            mirai_user_id: miraiUserId,
            pm_user_id: pmUserId,
            before: { mirai_user_id: null, pm_user_id: null },
            after: { mirai_user_id: miraiUserId, pm_user_id: pmUserId },
            before_mirai_user_id: null,
            before_pm_user_id: null,
            after_mirai_user_id: miraiUserId,
            after_pm_user_id: pmUserId,
          }),
        })
      );
      auditSpy.mockRestore();
    });

    it('Requirement 4: does not claim a mapping change when reconciling an existing mapping', async () => {
      const auditSpy = jest.spyOn(MiraiAuditService, 'record');

      (mockPrisma.userIdentityMapping.findFirst as jest.Mock).mockResolvedValue({
        id: 'map-existing-1',
        mirai_user_id: miraiUserId,
        pm_user_id: pmUserId,
      });

      (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue({
        id: pmUserId,
        is_active: true,
      });

      (mockPrisma.projectMember.findMany as jest.Mock).mockResolvedValue([{ project_id: 'proj-1' }]);

      const result = await IdentityMappingService.reconcileIdentity(miraiUserId, 'alice@test.com', mockServiceUser);

      expect(result.mapping_status).toBe('mapped');
      expect(result.mapping_source).toBe('existing_mapping');
      expect(mockPrisma.userIdentityMapping.create).not.toHaveBeenCalled();

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          action: 'MIRAI_IDENTITY_RECONCILED',
          targetId: 'map-existing-1',
          metadata: expect.objectContaining({
            mapping_changed: false,
            source: 'reconcile',
            before: { mirai_user_id: miraiUserId, pm_user_id: pmUserId },
            after: { mirai_user_id: miraiUserId, pm_user_id: pmUserId },
            before_pm_user_id: pmUserId,
            after_pm_user_id: pmUserId,
          }),
        })
      );
      auditSpy.mockRestore();
    });

    it('Requirement 5: rolls back mapping creation and fails closed with conflict if audit write fails in transaction', async () => {
      (mockPrisma.userIdentityMapping.findFirst as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: pmUserId, is_active: true, organization_id: orgId },
      ]);

      const auditFailure = new Error('DATABASE_DISK_FULL: audit write failed');
      const auditSpy = jest.spyOn(MiraiAuditService, 'record').mockRejectedValueOnce(auditFailure);

      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return callback(mockPrisma);
      });

      (mockPrisma.userIdentityMapping.create as jest.Mock).mockResolvedValue({
        id: 'new-map-1',
        organization_id: orgId,
        mirai_user_id: miraiUserId,
        pm_user_id: pmUserId,
      });

      // After rollback, recheck finds no mapping
      (mockPrisma.userIdentityMapping.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const result = await IdentityMappingService.reconcileIdentity(miraiUserId, 'alice@test.com', mockServiceUser);
      expect(result.mapping_status).toBe('conflict');
      expect(result.pm_user_id).toBeNull();

      auditSpy.mockRestore();
    });

    it('Requirement 7: handles concurrent race on unique constraint P2002 and detects conflict if mapped to different identity', async () => {
      (mockPrisma.userIdentityMapping.findFirst as jest.Mock)
        .mockResolvedValueOnce(null) // pre-check
        .mockResolvedValueOnce(null); // conflict pre-check

      (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: pmUserId, is_active: true, organization_id: orgId },
      ]);

      const uniqueConstraintError: any = new Error('Unique constraint failed on the fields: (mirai_user_id)');
      uniqueConstraintError.code = 'P2002';

      (mockPrisma.$transaction as jest.Mock).mockRejectedValueOnce(uniqueConstraintError);

      // Recheck finds that concurrent worker mapped miraiUserId to a different PM user
      (mockPrisma.userIdentityMapping.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'map-other',
        mirai_user_id: miraiUserId,
        pm_user_id: 'different-pm-user-id',
      });

      const result = await IdentityMappingService.reconcileIdentity(miraiUserId, 'alice@test.com', mockServiceUser);
      expect(result.mapping_status).toBe('conflict');
      expect(result.pm_user_id).toBeNull();
    });

    it('Requirement 7: handles concurrent race on unique constraint P2002 and succeeds idempotently if exact mapping was created', async () => {
      (mockPrisma.userIdentityMapping.findFirst as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: pmUserId, is_active: true, organization_id: orgId },
      ]);

      const uniqueConstraintError: any = new Error('Unique constraint failed');
      uniqueConstraintError.code = 'P2002';

      (mockPrisma.$transaction as jest.Mock).mockRejectedValueOnce(uniqueConstraintError);

      // Recheck finds that concurrent worker committed the exact same (miraiUserId, pmUserId) pair
      (mockPrisma.userIdentityMapping.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'map-winner',
        mirai_user_id: miraiUserId,
        pm_user_id: pmUserId,
      });

      (mockPrisma.projectMember.findMany as jest.Mock).mockResolvedValue([{ project_id: 'proj-winner' }]);

      const result = await IdentityMappingService.reconcileIdentity(miraiUserId, 'alice@test.com', mockServiceUser);
      expect(result.mapping_status).toBe('mapped');
      expect(result.pm_user_id).toBe(pmUserId);
      expect(result.project_ids).toEqual(['proj-winner']);
    });

    it('returns ambiguous when multiple active PM users match the email', async () => {
      (mockPrisma.userIdentityMapping.findFirst as jest.Mock).mockResolvedValue(null);

      (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: 'user-1', is_active: true, organization_id: orgId },
        { id: 'user-2', is_active: true, organization_id: orgId },
      ]);

      const result = await IdentityMappingService.reconcileIdentity(miraiUserId, 'shared@test.com', mockServiceUser);
      expect(result.mapping_status).toBe('ambiguous');
      expect(result.pm_user_id).toBeNull();
      expect(mockPrisma.userIdentityMapping.create).not.toHaveBeenCalled();
    });

    it('returns conflict when candidate PM user is already mapped to a different MIRAI identity', async () => {
      (mockPrisma.userIdentityMapping.findFirst as jest.Mock)
        .mockResolvedValueOnce(null) // check for miraiUserId
        .mockResolvedValueOnce({ mirai_user_id: 'different-mirai-id' }); // check candidate pm user

      (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: pmUserId, is_active: true, organization_id: orgId },
      ]);

      const result = await IdentityMappingService.reconcileIdentity(miraiUserId, 'alice@test.com', mockServiceUser);
      expect(result.mapping_status).toBe('conflict');
      expect(result.pm_user_id).toBeNull();
      expect(mockPrisma.userIdentityMapping.create).not.toHaveBeenCalled();
    });

    it('returns unmapped when no user matches email or ID', async () => {
      (mockPrisma.userIdentityMapping.findFirst as jest.Mock).mockResolvedValue(null);
      (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([]);

      const result = await IdentityMappingService.reconcileIdentity(miraiUserId, 'unknown@test.com', mockServiceUser);
      expect(result.mapping_status).toBe('unmapped');
      expect(result.pm_user_id).toBeNull();
      expect(result.project_ids).toEqual([]);
    });
  });
});

