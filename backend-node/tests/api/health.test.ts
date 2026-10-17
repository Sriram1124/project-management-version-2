import request from 'supertest';
import app from '../../src/app';
import { mockPrisma } from '../mocks/prisma.mock';

describe('Health and System Diagnostic API', () => {
  it('GET /api/health should return ok when database query succeeds', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ 1: 1 }]);

    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('database');
    expect(res.body.database.status).toBe('connected');
    expect(res.body).toHaveProperty('redis');
    expect(res.body).toHaveProperty('uptime');
  });

  it('GET /api/health should return degraded when database query fails', async () => {
    mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('Connection lost'));

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('degraded');
    expect(res.body.database.status).toContain('error: Connection lost');
  });

  it('Catch-all 404 should return JSON error for unknown routes', async () => {
    const res = await request(app).get('/api/non-existent-endpoint');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toContain('Route not found: GET /api/non-existent-endpoint');
  });
});
