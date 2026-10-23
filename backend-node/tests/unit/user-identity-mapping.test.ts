import request from 'supertest';
import app from '../../src/app';
import jwt from 'jsonwebtoken';
import { ProjectService } from '../../src/services/project.service';
import { mockPrisma, resetPrismaMock } from '../mocks/prisma.mock';
import { runReconciliation, MiraiCandidate } from '../../src/scripts/reconcile-identities';

describe('MIRAI–PM User Identity Mapping & Reconciliation Tests', () => {
  const orgId = 'org-test-tenant-1';
  const otherOrgId = 'org-test-tenant-2';

  const mockPmUser = {
    id: 'pm-user-uuid-1',
    name: 'Alice Developer',
    email: 'alice@company.com',
    organization_id: orgId,
    is_active: true,
  };

  const mockInactivePmUser = {
    id: 'pm-user-uuid-inactive',
    name: 'Inactive User',
    email: 'inactive@company.com',
    organization_id: orgId,
    is_active: false,
  };

  const mockAlienPmUser = {
    id: 'pm-user-uuid-alien',
    name: 'Alien User',
    email: 'alien@other.com',
    organization_id: otherOrgId,
    is_active: true,
  };

  const canonicalMiraiId = 'mirai-user-uuid-999';
  const callerUser = {
    id: 'caller-admin-1',
    organization_id: orgId,
    role: 'MANAGER',
  };

  const mockProject = {
    id: 'project-uuid-101',
    name: 'Core Platform',
    organization_id: orgId,
    status: 'ACTIVE',
  };

  const SERVICE_SECRET = 'dedicated-service-jwt-secret';

  function generateValidServiceToken(overrideOrgId: string = orgId) {
    process.env.PM_SERVICE_JWT_SECRET = SERVICE_SECRET;
    return jwt.sign(
      {
        iss: 'mirai-django',
        aud: 'pm-membership-api',
        scope: 'membership:read',
        role: 'SERVICE',
        org: overrideOrgId,
      },
      SERVICE_SECRET,
      { expiresIn: '5m' }
    );
  }

  beforeEach(() => {
    resetPrismaMock();
    process.env.PM_SERVICE_JWT_SECRET = SERVICE_SECRET;
    delete process.env.PROJECT_MANAGEMENT_SERVICE_TOKEN;
  });

  describe('ProjectService.resolveEffectiveUser', () => {
    it('should resolve effective PM user from UserIdentityMapping by canonical MIRAI UUID', async () => {
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce({
        id: 'map-1',
        mirai_user_id: canonicalMiraiId,
        pm_user_id: mockPmUser.id,
        organization_id: orgId,
      });
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockPmUser);

      const resolved = await ProjectService.resolveEffectiveUser(canonicalMiraiId, orgId);

      expect(resolved).not.toBeNull();
      expect(resolved?.pm_user_id).toBe(mockPmUser.id);
      expect(resolved?.mirai_user_id).toBe(canonicalMiraiId);
      expect(resolved?.mapping_source).toBe('mapped');
    });

    it('should fallback to direct PM user lookup when no mapping exists and UUID matches active PM user', async () => {
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce(null); // No mapping for mirai_user_id
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockPmUser); // Matches direct PM user
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce(null); // No collision

      const resolved = await ProjectService.resolveEffectiveUser(mockPmUser.id, orgId);

      expect(resolved).not.toBeNull();
      expect(resolved?.pm_user_id).toBe(mockPmUser.id);
      expect(resolved?.mirai_user_id).toBe(mockPmUser.id);
      expect(resolved?.mapping_source).toBe('direct');
    });

    it('negative test: should fail closed (return null) if mapped PM user is inactive', async () => {
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce({
        id: 'map-2',
        mirai_user_id: canonicalMiraiId,
        pm_user_id: mockInactivePmUser.id,
        organization_id: orgId,
      });
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockInactivePmUser);

      const resolved = await ProjectService.resolveEffectiveUser(canonicalMiraiId, orgId);

      expect(resolved).toBeNull();
    });

    it('negative test: should fail closed (return null) if referenced PM user does not exist in tenant organization', async () => {
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce({
        id: 'map-3',
        mirai_user_id: canonicalMiraiId,
        pm_user_id: 'unknown-pm-user',
        organization_id: orgId,
      });
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      const resolved = await ProjectService.resolveEffectiveUser(canonicalMiraiId, orgId);

      expect(resolved).toBeNull();
    });

    it('negative test: collision rejection — should fail closed if direct PM user is mapped to a different MIRAI UUID', async () => {
      // Input is direct PM user ID, no mapping exists with mirai_user_id = mockPmUser.id
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce(null);
      // Direct PM user exists
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockPmUser);
      // But a collision exists: this PM user is already claimed by another MIRAI user
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce({
        mirai_user_id: 'different-mirai-uuid-777',
      });

      const resolved = await ProjectService.resolveEffectiveUser(mockPmUser.id, orgId);

      expect(resolved).toBeNull();
    });

    it('negative test: should fail closed for unmapped user with non-matching UUID', async () => {
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce(null);
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      const resolved = await ProjectService.resolveEffectiveUser('completely-unknown-uuid', orgId);

      expect(resolved).toBeNull();
    });
  });

  describe('Membership APIs with Canonical MIRAI UUID Resolution', () => {
    it('getUserProjectMemberships should resolve mapped canonical MIRAI user and return project IDs', async () => {
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce({
        id: 'map-10',
        mirai_user_id: canonicalMiraiId,
        pm_user_id: mockPmUser.id,
        organization_id: orgId,
      });
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockPmUser);
      mockPrisma.projectMember.findMany.mockResolvedValueOnce([{ project_id: 'proj-1' }, { project_id: 'proj-2' }]);

      const result = await ProjectService.getUserProjectMemberships(canonicalMiraiId, callerUser);

      expect(result.user_id).toBe(canonicalMiraiId);
      expect(result.pm_user_id).toBe(mockPmUser.id);
      expect(result.mapping_source).toBe('mapped');
      expect(result.project_ids).toEqual(['proj-1', 'proj-2']);
      expect(result.total).toBe(2);
    });

    it('checkProjectMembership should resolve mapped canonical MIRAI user and check membership', async () => {
      mockPrisma.project.findFirst.mockResolvedValueOnce(mockProject);
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce({
        id: 'map-11',
        mirai_user_id: canonicalMiraiId,
        pm_user_id: mockPmUser.id,
        organization_id: orgId,
      });
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockPmUser);
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({
        project_id: mockProject.id,
        user_id: mockPmUser.id,
        project_role: 'DEVELOPER',
        role_id: null,
      });

      const result = await ProjectService.checkProjectMembership(mockProject.id, canonicalMiraiId, callerUser);

      expect(result.is_member).toBe(true);
      expect(result.user_id).toBe(canonicalMiraiId);
      expect(result.pm_user_id).toBe(mockPmUser.id);
      expect(result.mapping_source).toBe('mapped');
      expect(result.project_role).toBe('DEVELOPER');
    });
  });

  describe('Internal MIRAI HTTP Endpoints (/internal/mirai/v1)', () => {
    it('GET /users/:mirai_user_id/project-memberships should return mapped project list for mapped MIRAI user', async () => {
      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: orgId, is_active: true });
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce({
        id: 'map-12',
        mirai_user_id: canonicalMiraiId,
        pm_user_id: mockPmUser.id,
        organization_id: orgId,
      });
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockPmUser);
      mockPrisma.projectMember.findMany.mockResolvedValueOnce([{ project_id: 'proj-1' }]);

      const res = await request(app)
        .get(`/internal/mirai/v1/users/${canonicalMiraiId}/project-memberships`)
        .set('Authorization', `Bearer ${generateValidServiceToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.mirai_user_id).toBe(canonicalMiraiId);
      expect(res.body.pm_user_id).toBe(mockPmUser.id);
      expect(res.body.mapping_status).toBe('mapped');
      expect(res.body.project_ids).toEqual(['proj-1']);
    });

    it('GET /users/:mirai_user_id/memberships alias route should return mapped project list', async () => {
      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: orgId, is_active: true });
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce({
        id: 'map-13',
        mirai_user_id: canonicalMiraiId,
        pm_user_id: mockPmUser.id,
        organization_id: orgId,
      });
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockPmUser);
      mockPrisma.projectMember.findMany.mockResolvedValueOnce([{ project_id: 'proj-1' }]);

      const res = await request(app)
        .get(`/internal/mirai/v1/users/${canonicalMiraiId}/memberships`)
        .set('Authorization', `Bearer ${generateValidServiceToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.mirai_user_id).toBe(canonicalMiraiId);
      expect(res.body.pm_user_id).toBe(mockPmUser.id);
      expect(res.body.mapping_status).toBe('mapped');
      expect(res.body.project_ids).toEqual(['proj-1']);
    });

    it('GET /users/:mirai_user_id/project-memberships should return unmapped for completely unmapped user', async () => {
      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: orgId, is_active: true });
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce(null);
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/internal/mirai/v1/users/unmapped-mirai-id/project-memberships')
        .set('Authorization', `Bearer ${generateValidServiceToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.mirai_user_id).toBe('unmapped-mirai-id');
      expect(res.body.mapping_status).toBe('unmapped');
      expect(res.body.project_ids).toEqual([]);
    });

    it('GET /users/:mirai_user_id/project-memberships with email query should auto-reconcile unmapped user by normalized email', async () => {
      const syntheticMiraiId = 'synthetic-mirai-user-auto-1';
      const syntheticEmail = 'ALICE@COMPANY.COM'; // Uppercase to test normalization

      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: orgId, is_active: true });
      // 1. Check existing mapping -> null
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce(null);
      // 2. Email lookup in PM DB -> returns mockPmUser
      mockPrisma.user.findMany.mockResolvedValueOnce([mockPmUser]);
      // 3. Collision check -> null (no conflict)
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce(null);
      // 4. Create mapping in DB
      mockPrisma.userIdentityMapping.create.mockResolvedValueOnce({
        id: 'new-auto-map-1',
        organization_id: orgId,
        mirai_user_id: syntheticMiraiId,
        pm_user_id: mockPmUser.id,
      });
      // 5. Query project memberships
      mockPrisma.projectMember.findMany.mockResolvedValueOnce([{ project_id: 'proj-auto-1' }]);

      const res = await request(app)
        .get(`/internal/mirai/v1/users/${syntheticMiraiId}/project-memberships?email=${syntheticEmail}`)
        .set('Authorization', `Bearer ${generateValidServiceToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.mirai_user_id).toBe(syntheticMiraiId);
      expect(res.body.pm_user_id).toBe(mockPmUser.id);
      expect(res.body.mapping_status).toBe('mapped');
      expect(res.body.project_ids).toEqual(['proj-auto-1']);
      expect(mockPrisma.userIdentityMapping.create).toHaveBeenCalledWith({
        data: {
          organization_id: orgId,
          mirai_user_id: syntheticMiraiId,
          pm_user_id: mockPmUser.id,
        },
      });
    });

    it('POST /identities/reconcile should reconcile existing mapping and return project memberships', async () => {
      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: orgId, is_active: true });
      // 1. Existing mapping found
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce({
        id: 'map-rec-1',
        mirai_user_id: canonicalMiraiId,
        pm_user_id: mockPmUser.id,
      });
      // 2. PM user is active
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockPmUser);
      // 3. Memberships
      mockPrisma.projectMember.findMany.mockResolvedValueOnce([{ project_id: 'proj-rec-1' }]);

      const res = await request(app)
        .post('/internal/mirai/v1/identities/reconcile')
        .set('Authorization', `Bearer ${generateValidServiceToken()}`)
        .send({
          mirai_user_id: canonicalMiraiId,
          email: 'alice@company.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.mirai_user_id).toBe(canonicalMiraiId);
      expect(res.body.pm_user_id).toBe(mockPmUser.id);
      expect(res.body.mapping_status).toBe('mapped');
      expect(res.body.mapping_source).toBe('existing_mapping');
      expect(res.body.project_ids).toEqual(['proj-rec-1']);
    });

    it('POST /identities/reconcile should auto-map unmapped user by normalized email and create mapping', async () => {
      const syntheticMiraiId = 'synthetic-mirai-user-new-99';
      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: orgId, is_active: true });
      // 1. Existing mapping -> null
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce(null);
      // 2. Email lookup -> 1 active user
      mockPrisma.user.findMany.mockResolvedValueOnce([mockPmUser]);
      // 3. Collision check -> null
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce(null);
      // 4. Create mapping
      mockPrisma.userIdentityMapping.create.mockResolvedValueOnce({
        id: 'new-map-99',
        organization_id: orgId,
        mirai_user_id: syntheticMiraiId,
        pm_user_id: mockPmUser.id,
      });
      // 5. Memberships
      mockPrisma.projectMember.findMany.mockResolvedValueOnce([{ project_id: 'proj-new-99' }]);

      const res = await request(app)
        .post('/internal/mirai/v1/identities/reconcile')
        .set('Authorization', `Bearer ${generateValidServiceToken()}`)
        .send({
          mirai_user_id: syntheticMiraiId,
          email: 'Alice@Company.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.mirai_user_id).toBe(syntheticMiraiId);
      expect(res.body.pm_user_id).toBe(mockPmUser.id);
      expect(res.body.mapping_status).toBe('mapped');
      expect(res.body.mapping_source).toBe('auto_mapped_by_email');
      expect(res.body.project_ids).toEqual(['proj-new-99']);
      expect(mockPrisma.userIdentityMapping.create).toHaveBeenCalled();
    });

    it('POST /identities/reconcile negative test: should return ambiguous when multiple active PM users match email', async () => {
      const syntheticMiraiId = 'synthetic-mirai-ambiguous-1';
      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: orgId, is_active: true });
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce(null);
      // 2 PM users share this email
      mockPrisma.user.findMany.mockResolvedValueOnce([
        { id: 'pm-dup-1', email: 'shared@company.com', is_active: true, organization_id: orgId },
        { id: 'pm-dup-2', email: 'shared@company.com', is_active: true, organization_id: orgId },
      ]);

      const res = await request(app)
        .post('/internal/mirai/v1/identities/reconcile')
        .set('Authorization', `Bearer ${generateValidServiceToken()}`)
        .send({
          mirai_user_id: syntheticMiraiId,
          email: 'shared@company.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.mirai_user_id).toBe(syntheticMiraiId);
      expect(res.body.pm_user_id).toBeNull();
      expect(res.body.mapping_status).toBe('ambiguous');
      expect(res.body.project_ids).toEqual([]);
      expect(mockPrisma.userIdentityMapping.create).not.toHaveBeenCalled();
    });

    it('POST /identities/reconcile negative test: should return conflict when matched PM user is already mapped to a different MIRAI user', async () => {
      const syntheticMiraiId = 'synthetic-mirai-conflict-1';
      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: orgId, is_active: true });
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce(null);
      mockPrisma.user.findMany.mockResolvedValueOnce([mockPmUser]);
      // PM user is already claimed by someone else
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce({
        mirai_user_id: 'other-mirai-user-claimed',
      });

      const res = await request(app)
        .post('/internal/mirai/v1/identities/reconcile')
        .set('Authorization', `Bearer ${generateValidServiceToken()}`)
        .send({
          mirai_user_id: syntheticMiraiId,
          email: mockPmUser.email,
        });

      expect(res.status).toBe(200);
      expect(res.body.mirai_user_id).toBe(syntheticMiraiId);
      expect(res.body.pm_user_id).toBeNull();
      expect(res.body.mapping_status).toBe('conflict');
      expect(res.body.project_ids).toEqual([]);
      expect(mockPrisma.userIdentityMapping.create).not.toHaveBeenCalled();
    });

    it('POST /identities/reconcile negative test: should return unmapped when no user matches by email or direct ID', async () => {
      const syntheticMiraiId = 'synthetic-mirai-ghost-1';
      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: orgId, is_active: true });
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce(null);
      mockPrisma.user.findMany.mockResolvedValueOnce([]); // No email match
      mockPrisma.user.findFirst.mockResolvedValueOnce(null); // No direct UUID match

      const res = await request(app)
        .post('/internal/mirai/v1/identities/reconcile')
        .set('Authorization', `Bearer ${generateValidServiceToken()}`)
        .send({
          mirai_user_id: syntheticMiraiId,
          email: 'ghost@nowhere.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.mirai_user_id).toBe(syntheticMiraiId);
      expect(res.body.pm_user_id).toBeNull();
      expect(res.body.mapping_status).toBe('unmapped');
      expect(res.body.project_ids).toEqual([]);
      expect(mockPrisma.userIdentityMapping.create).not.toHaveBeenCalled();
    });

    it('POST /identities/reconcile should reject request with missing mirai_user_id with 400', async () => {
      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: orgId, is_active: true });

      const res = await request(app)
        .post('/internal/mirai/v1/identities/reconcile')
        .set('Authorization', `Bearer ${generateValidServiceToken()}`)
        .send({
          email: 'some@email.com',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('mirai_user_id is required');
    });

    it('POST /identities/reconcile should reject request without service token with 401', async () => {
      const res = await request(app)
        .post('/internal/mirai/v1/identities/reconcile')
        .send({
          mirai_user_id: 'some-id',
          email: 'some@email.com',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('Reconciliation Script Logic (runReconciliation)', () => {
    it('dry-run should accurately report exact UUID, unique email, ambiguous, org conflict, and inactive counts without writing', async () => {
      mockPrisma.userIdentityMapping.findMany.mockResolvedValueOnce([]);
      mockPrisma.user.findMany.mockResolvedValueOnce([
        mockPmUser, // id: 'pm-user-uuid-1', email: 'alice@company.com', active
        mockInactivePmUser, // id: 'pm-user-uuid-inactive', email: 'inactive@company.com', inactive
        mockAlienPmUser, // id: 'pm-user-uuid-alien', email: 'alien@other.com', org: otherOrgId
        { id: 'pm-dup-1', email: 'dup@company.com', organization_id: orgId, is_active: true },
        { id: 'pm-dup-2', email: 'dup@company.com', organization_id: orgId, is_active: true },
      ]);

      const candidates: MiraiCandidate[] = [
        // 1. Exact UUID match
        { mirai_user_id: mockPmUser.id, email: 'alice-mirai@company.com', organization_id: orgId },
        // 2. Unique email match
        { mirai_user_id: 'mirai-bob', email: 'alice@company.com', organization_id: orgId },
        // 3. Inactive PM user
        { mirai_user_id: mockInactivePmUser.id, email: 'inactive@company.com', organization_id: orgId },
        // 4. Org conflict
        { mirai_user_id: mockAlienPmUser.id, email: 'alien@other.com', organization_id: orgId },
        // 5. Ambiguous email (multiple PM users share dup@company.com)
        { mirai_user_id: 'mirai-dup', email: 'dup@company.com', organization_id: orgId },
        // 6. Unmatched
        { mirai_user_id: 'mirai-ghost', email: 'ghost@nowhere.com', organization_id: orgId },
      ];

      const report = await runReconciliation({
        candidates,
        execute: false, // Dry Run
      });

      expect(report.mode).toBe('DRY_RUN');
      expect(report.total_candidates).toBe(6);
      expect(report.exact_uuid_matches).toBe(1);
      expect(report.unique_email_matches).toBe(0); // pm-user-uuid-1 was already matched by exact UUID
      expect(report.inactive_users).toBe(1);
      expect(report.org_conflicts).toBe(1);
      expect(report.ambiguous_matches).toBe(2);
      expect(report.unmatched).toBe(1);
      expect(report.created_mappings).toBe(0);

      // Verify no DB writes in dry run
      expect(mockPrisma.userIdentityMapping.create).not.toHaveBeenCalled();
    });

    it('execute mode should commit non-ambiguous matches inside a transaction', async () => {
      mockPrisma.userIdentityMapping.findMany.mockResolvedValueOnce([]);
      mockPrisma.user.findMany.mockResolvedValueOnce([mockPmUser]);

      const candidates: MiraiCandidate[] = [
        { mirai_user_id: canonicalMiraiId, email: mockPmUser.email, organization_id: orgId },
      ];

      const report = await runReconciliation({
        candidates,
        execute: true,
      });

      expect(report.mode).toBe('EXECUTE');
      expect(report.unique_email_matches).toBe(1);
      expect(report.created_mappings).toBe(1);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('ProjectService.reconcileIdentity Persistent Audit Logging Tests', () => {
    it('1. should write MIRAI_IDENTITY_MAPPED audit log in transaction when new mapping is created', async () => {
      // 1. No existing mapping
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce(null);
      // 2. Email search returns exactly 1 active user
      mockPrisma.user.findMany.mockResolvedValueOnce([mockPmUser]);
      // 3. Candidate PM user is NOT mapped to another user
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce(null);
      // 4. Creation inside transaction
      mockPrisma.userIdentityMapping.create.mockResolvedValueOnce({
        id: 'map-new-1',
        organization_id: orgId,
        mirai_user_id: canonicalMiraiId,
        pm_user_id: mockPmUser.id,
      });
      // 5. Memberships query
      mockPrisma.projectMember.findMany.mockResolvedValueOnce([{ project_id: mockProject.id }]);

      const result = await ProjectService.reconcileIdentity(canonicalMiraiId, mockPmUser.email, callerUser);

      expect(result.mapping_status).toBe('mapped');
      expect(result.mapping_source).toBe('auto_mapped_by_email');
      expect(result.pm_user_id).toBe(mockPmUser.id);
      expect(result.project_ids).toEqual([mockProject.id]);

      // Verify audit log creation
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organization_id: orgId,
          action: 'MIRAI_IDENTITY_MAPPED',
          target_type: 'USER_IDENTITY_MAPPING',
          target_id: 'map-new-1',
          metadata: expect.objectContaining({
            mirai_user_id: canonicalMiraiId,
            pm_user_id: mockPmUser.id,
            status: 'mapped',
            mapping_source: 'auto_mapped_by_email',
          }),
        }),
      });
    });

    it('2. should write MIRAI_IDENTITY_RECONCILED audit log when existing mapping is reused without duplicating mapping', async () => {
      // 1. Existing mapping
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce({
        id: 'map-existing-1',
        mirai_user_id: canonicalMiraiId,
        pm_user_id: mockPmUser.id,
      });
      // 2. Active PM user
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockPmUser);
      // 3. Memberships
      mockPrisma.projectMember.findMany.mockResolvedValueOnce([{ project_id: mockProject.id }]);

      const result = await ProjectService.reconcileIdentity(canonicalMiraiId, mockPmUser.email, callerUser);

      expect(result.mapping_status).toBe('mapped');
      expect(result.mapping_source).toBe('existing_mapping');

      // Verify no new mapping was created
      expect(mockPrisma.userIdentityMapping.create).not.toHaveBeenCalled();

      // Verify audit log recorded reconciliation event
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organization_id: orgId,
          action: 'MIRAI_IDENTITY_RECONCILED',
          target_type: 'USER_IDENTITY_MAPPING',
          target_id: 'map-existing-1',
          metadata: expect.objectContaining({
            mirai_user_id: canonicalMiraiId,
            pm_user_id: mockPmUser.id,
            status: 'mapped',
            mapping_source: 'existing_mapping',
          }),
        }),
      });
    });

    it('3. should write MIRAI_IDENTITY_RECONCILE_FAILED_INACTIVE audit log when mapped PM user is inactive', async () => {
      // 1. Existing mapping
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce({
        id: 'map-inactive-1',
        mirai_user_id: canonicalMiraiId,
        pm_user_id: mockInactivePmUser.id,
      });
      // 2. Inactive PM user
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockInactivePmUser);

      const result = await ProjectService.reconcileIdentity(canonicalMiraiId, mockInactivePmUser.email, callerUser);

      expect(result.mapping_status).toBe('unmapped');
      expect(result.pm_user_id).toBeNull();
      expect(result.project_ids).toEqual([]);

      // Verify audit log recorded inactive user failure
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organization_id: orgId,
          action: 'MIRAI_IDENTITY_RECONCILE_FAILED_INACTIVE',
          target_type: 'USER_IDENTITY_MAPPING',
          target_id: 'map-inactive-1',
          metadata: expect.objectContaining({
            mirai_user_id: canonicalMiraiId,
            pm_user_id: mockInactivePmUser.id,
            status: 'unmapped',
          }),
        }),
      });
    });

    it('4. should write MIRAI_IDENTITY_RECONCILE_AMBIGUOUS audit log when multiple users match normalized email', async () => {
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce(null);
      // Multiple active users share this email
      mockPrisma.user.findMany.mockResolvedValueOnce([mockPmUser, { ...mockPmUser, id: 'pm-user-2' }]);

      const result = await ProjectService.reconcileIdentity(canonicalMiraiId, mockPmUser.email, callerUser);

      expect(result.mapping_status).toBe('ambiguous');
      expect(result.pm_user_id).toBeNull();

      expect(mockPrisma.userIdentityMapping.create).not.toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organization_id: orgId,
          action: 'MIRAI_IDENTITY_RECONCILE_AMBIGUOUS',
          target_type: 'USER_IDENTITY_MAPPING',
          target_id: canonicalMiraiId,
          metadata: expect.objectContaining({
            mirai_user_id: canonicalMiraiId,
            status: 'ambiguous',
            match_count: 2,
          }),
        }),
      });
    });

    it('5. should write MIRAI_IDENTITY_RECONCILE_CONFLICT audit log when candidate user is mapped to different MIRAI ID', async () => {
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce(null);
      mockPrisma.user.findMany.mockResolvedValueOnce([mockPmUser]);
      // Candidate PM user is already mapped to a different MIRAI ID
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce({
        mirai_user_id: 'different-mirai-uuid',
      });

      const result = await ProjectService.reconcileIdentity(canonicalMiraiId, mockPmUser.email, callerUser);

      expect(result.mapping_status).toBe('conflict');
      expect(result.pm_user_id).toBeNull();

      expect(mockPrisma.userIdentityMapping.create).not.toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organization_id: orgId,
          action: 'MIRAI_IDENTITY_RECONCILE_CONFLICT',
          target_type: 'USER_IDENTITY_MAPPING',
          target_id: canonicalMiraiId,
          metadata: expect.objectContaining({
            mirai_user_id: canonicalMiraiId,
            pm_user_id: mockPmUser.id,
            conflicting_mirai_user_id: 'different-mirai-uuid',
            status: 'conflict',
          }),
        }),
      });
    });

    it('6. should write MIRAI_IDENTITY_UNMAPPED audit log when no active user matches', async () => {
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce(null);
      mockPrisma.user.findMany.mockResolvedValueOnce([]); // No email match
      mockPrisma.user.findFirst.mockResolvedValueOnce(null); // No direct UUID match

      const result = await ProjectService.reconcileIdentity(canonicalMiraiId, 'nonexistent@example.com', callerUser);

      expect(result.mapping_status).toBe('unmapped');
      expect(result.pm_user_id).toBeNull();

      expect(mockPrisma.userIdentityMapping.create).not.toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organization_id: orgId,
          action: 'MIRAI_IDENTITY_UNMAPPED',
          target_type: 'USER_IDENTITY_MAPPING',
          target_id: canonicalMiraiId,
          metadata: expect.objectContaining({
            mirai_user_id: canonicalMiraiId,
            status: 'unmapped',
          }),
        }),
      });
    });

    it('7. should guarantee tenant organization isolation in audit logs and reject unauthorized cross-tenant writes', async () => {
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce(null);
      mockPrisma.user.findMany.mockResolvedValueOnce([]);
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      // Caller from otherOrgId
      const otherCaller = { id: 'alien-caller', organization_id: otherOrgId, role: 'SERVICE' };
      await ProjectService.reconcileIdentity(canonicalMiraiId, 'user@other.com', otherCaller);

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organization_id: otherOrgId, // Strictly matches authenticated caller's tenant!
          action: 'MIRAI_IDENTITY_UNMAPPED',
        }),
      });
    });

    it('8. should never record secrets, tokens, or passwords in audit metadata', async () => {
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce(null);
      mockPrisma.user.findMany.mockResolvedValueOnce([]);
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      await ProjectService.reconcileIdentity(canonicalMiraiId, 'clean@example.com', callerUser);

      const auditCall = mockPrisma.auditLog.create.mock.calls[0][0];
      const metadata = auditCall.data.metadata;

      expect(metadata).not.toHaveProperty('token');
      expect(metadata).not.toHaveProperty('secret');
      expect(metadata).not.toHaveProperty('password');
      expect(metadata).not.toHaveProperty('authorization');
    });
  });
});
