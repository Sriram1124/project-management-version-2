import request from 'supertest';
import app from '../../src/app';
import jwt from 'jsonwebtoken';
import { mockPrisma, resetPrismaMock } from '../mocks/prisma.mock';

describe('MIRAI–PM Scenarios Verification (Isolated Synthetic Test)', () => {
  const orgId = '3f320c6f-3a45-44fc-a63c-971b5690262b';
  const SERVICE_SECRET = 'dedicated-service-jwt-secret';

  function generateToken() {
    process.env.PM_SERVICE_JWT_SECRET = SERVICE_SECRET;
    return jwt.sign(
      {
        iss: 'mirai-django',
        aud: 'pm-membership-api',
        scope: 'membership:read',
        role: 'SERVICE',
        org: orgId,
      },
      SERVICE_SECRET,
      { expiresIn: '5m' }
    );
  }

  beforeEach(() => {
    resetPrismaMock();
    process.env.PM_SERVICE_JWT_SECRET = SERVICE_SECRET;
  });

  describe('Scenario B: Non-existent email (ksnaveen@dailoqa.com)', () => {
    it('should return unmapped status without creating any account or mapping', async () => {
      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: orgId, is_active: true });
      // 1. Existing mapping check -> null
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce(null);
      // 2. Email lookup in PM DB -> 0 users found
      mockPrisma.user.findMany.mockResolvedValueOnce([]);
      // 3. Direct UUID lookup -> null
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      const miraiUuid = '018f4a12-8822-7711-a000-0123456789ab';
      const email = 'ksnaveen@dailoqa.com';

      const res = await request(app)
        .post('/internal/mirai/v1/identities/reconcile')
        .set('Authorization', `Bearer ${generateToken()}`)
        .send({ mirai_user_id: miraiUuid, email });

      expect(res.status).toBe(200);
      expect(res.body.mirai_user_id).toBe(miraiUuid);
      expect(res.body.pm_user_id).toBeNull();
      expect(res.body.mapping_status).toBe('unmapped');
      expect(res.body.mapping_source).toBeNull();
      expect(res.body.project_ids).toEqual([]);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
      expect(mockPrisma.userIdentityMapping.create).not.toHaveBeenCalled();
    });
  });

  describe('Scenario C: Synthetic user and disposable identity', () => {
    const syntheticMiraiUuid = '0192e2b3-5689-7cf1-9d50-100000000001';
    const syntheticPmUuid = '550e8400-e29b-41d4-a716-446655440000';
    const syntheticEmail = 'synthetic.intern.qa@dailoqa.internal';
    const syntheticProjectId = 'c8a14b08-958b-4ad3-9e11-e6da48ceba51';

    const mockSyntheticPmUser = {
      id: syntheticPmUuid,
      name: 'Synthetic Test User',
      email: syntheticEmail,
      organization_id: orgId,
      is_active: true,
    };

    it('Step 1 & 2 & 3: Initial reconcile should create mapping when exactly 1 synthetic user matches', async () => {
      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: orgId, is_active: true });
      // 1. Initial mapping check -> null (no mapping initially)
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce(null);
      // 2. Email lookup -> exactly 1 matching active PM user
      mockPrisma.user.findMany.mockResolvedValueOnce([mockSyntheticPmUser]);
      // 3. Collision check -> null (no collision)
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce(null);
      // 4. Create mapping
      mockPrisma.userIdentityMapping.create.mockResolvedValueOnce({
        id: 'synthetic-map-1',
        organization_id: orgId,
        mirai_user_id: syntheticMiraiUuid,
        pm_user_id: syntheticPmUuid,
      });
      // 5. Query memberships
      mockPrisma.projectMember.findMany.mockResolvedValueOnce([{ project_id: syntheticProjectId }]);

      const res = await request(app)
        .post('/internal/mirai/v1/identities/reconcile')
        .set('Authorization', `Bearer ${generateToken()}`)
        .send({
          mirai_user_id: syntheticMiraiUuid,
          email: syntheticEmail,
        });

      expect(res.status).toBe(200);
      expect(res.body.mirai_user_id).toBe(syntheticMiraiUuid);
      expect(res.body.pm_user_id).toBe(syntheticPmUuid);
      expect(res.body.mapping_status).toBe('mapped');
      expect(res.body.mapping_source).toBe('auto_mapped_by_email');
      expect(res.body.project_ids).toEqual([syntheticProjectId]);
      expect(mockPrisma.userIdentityMapping.create).toHaveBeenCalledWith({
        data: {
          organization_id: orgId,
          mirai_user_id: syntheticMiraiUuid,
          pm_user_id: syntheticPmUuid,
        },
      });
    });

    it('Step 4 & 5: Repeating request reuses existing mapping without creating duplicate', async () => {
      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: orgId, is_active: true });
      // 1. Existing mapping check -> returns existing mapping
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce({
        id: 'synthetic-map-1',
        organization_id: orgId,
        mirai_user_id: syntheticMiraiUuid,
        pm_user_id: syntheticPmUuid,
      });
      // 2. Validate PM user is active
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockSyntheticPmUser);
      // 3. Query memberships
      mockPrisma.projectMember.findMany.mockResolvedValueOnce([{ project_id: syntheticProjectId }]);

      const res = await request(app)
        .post('/internal/mirai/v1/identities/reconcile')
        .set('Authorization', `Bearer ${generateToken()}`)
        .send({
          mirai_user_id: syntheticMiraiUuid,
          email: syntheticEmail,
        });

      expect(res.status).toBe(200);
      expect(res.body.mirai_user_id).toBe(syntheticMiraiUuid);
      expect(res.body.pm_user_id).toBe(syntheticPmUuid);
      expect(res.body.mapping_status).toBe('mapped');
      expect(res.body.mapping_source).toBe('existing_mapping');
      expect(res.body.project_ids).toEqual([syntheticProjectId]);
      // Zero creates on repeated request
      expect(mockPrisma.userIdentityMapping.create).not.toHaveBeenCalled();
    });

    it('Step 6: Ambiguous match is rejected and creates no mapping', async () => {
      mockPrisma.organization.findFirst.mockResolvedValueOnce({ id: orgId, is_active: true });
      // 1. Initial mapping check -> null
      mockPrisma.userIdentityMapping.findFirst.mockResolvedValueOnce(null);
      // 2. Email lookup -> 2 matching PM users (duplicate email)
      mockPrisma.user.findMany.mockResolvedValueOnce([
        mockSyntheticPmUser,
        { ...mockSyntheticPmUser, id: '550e8400-e29b-41d4-a716-446655440002', name: 'Duplicate User' },
      ]);

      const res = await request(app)
        .post('/internal/mirai/v1/identities/reconcile')
        .set('Authorization', `Bearer ${generateToken()}`)
        .send({
          mirai_user_id: syntheticMiraiUuid,
          email: syntheticEmail,
        });

      expect(res.status).toBe(200);
      expect(res.body.mirai_user_id).toBe(syntheticMiraiUuid);
      expect(res.body.pm_user_id).toBeNull();
      expect(res.body.mapping_status).toBe('ambiguous');
      expect(res.body.project_ids).toEqual([]);
      expect(mockPrisma.userIdentityMapping.create).not.toHaveBeenCalled();
    });
  });
});

