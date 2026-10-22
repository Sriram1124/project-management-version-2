import { cacheService } from '../../src/services/cache.service';
import request from 'supertest';
import app from '../../src/app';
import { mockPrisma } from '../mocks/prisma.mock';
import { setupAuthUser } from '../helpers/auth.helper';

describe('Cohorts API (/api/cohorts)', () => {
  beforeEach(async () => {
    await cacheService.invalidatePattern('org:');
  });
  it('should require authentication', async () => {
    const res = await request(app).get('/api/cohorts');
    expect(res.status).toBe(401);
  });

  it('should return empty array if user has no organization_id', async () => {
    const { authHeader } = setupAuthUser({ organization_id: null });

    const res = await request(app).get('/api/cohorts').set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('should list active cohorts for the user organization with counts', async () => {
    const { authHeader } = setupAuthUser({ organization_id: 'org-cohort-1' });

    mockPrisma.cohort.findMany.mockResolvedValueOnce([
      {
        id: 'cohort-1',
        name: 'Summer 2026 Cohort',
        code: 'S26',
        description: 'Summer interns',
        _count: { users: 15 },
      },
    ]);

    const res = await request(app).get('/api/cohorts').set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toHaveProperty('code', 'S26');
    expect(res.body[0]._count).toHaveProperty('users', 15);
  });

  it('should return 500 when database fails', async () => {
    const { authHeader } = setupAuthUser({ organization_id: 'org-cohort-1' });
    mockPrisma.cohort.findMany.mockRejectedValueOnce(new Error('DB failure'));

    const res = await request(app).get('/api/cohorts').set('Authorization', authHeader);

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error', 'Failed to fetch cohorts');
  });
});

