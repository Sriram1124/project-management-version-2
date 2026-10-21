import request from 'supertest';
import app from '../../src/app';

describe('Content-Length and Request Body Size Limit Tests (DoS Protection)', () => {
  it('should accept requests with Content-Length within the 2mb body limit', async () => {
    const normalPayload = { identifier: 'test@example.com', password: 'password123' };
    const res = await request(app)
      .post('/api/auth/login')
      .send(normalPayload)
      .set('Content-Type', 'application/json');

    // Request is parsed and processed without 413 Payload Too Large
    expect(res.status).not.toBe(413);
  });

  it('should reject JSON payload exceeding 2mb limit with 413 Payload Too Large', async () => {
    const oversizedString = 'x'.repeat(2.2 * 1024 * 1024);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ data: oversizedString })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(413);
  });

  it('should reject urlencoded payload exceeding 2mb limit with 413 Payload Too Large', async () => {
    const oversizedString = 'x'.repeat(2.2 * 1024 * 1024);
    const res = await request(app)
      .post('/api/auth/login')
      .send(`data=${encodeURIComponent(oversizedString)}`)
      .set('Content-Type', 'application/x-www-form-urlencoded');

    expect(res.status).toBe(413);
  });
});
