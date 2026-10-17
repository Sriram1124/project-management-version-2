import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import api, {
  isJwtExpired,
  parseJwt,
  isPublicEndpoint,
  clearAuthSession,
  refreshAccessToken,
} from './api.js';

// Helper to create a test JWT with custom expiration and claims
function createTestToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = 'test_sig_123';
  return `${header}.${body}.${signature}`;
}

// In-memory mock localStorage
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] !== undefined ? this.store[key] : null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

describe('API Client & Token Refresh Test Suite', () => {
  let originalFetch;
  let originalLocalStorage;
  let originalWindow;
  let mockStorage;
  let dispatchedEvents;

  beforeEach(() => {
    mockStorage = new MockLocalStorage();
    dispatchedEvents = [];
    originalFetch = globalThis.fetch;
    originalLocalStorage = globalThis.localStorage;
    originalWindow = globalThis.window;

    globalThis.localStorage = mockStorage;
    globalThis.window = {
      location: { hostname: 'localhost', pathname: '/dashboard', href: '/dashboard' },
      localStorage: mockStorage,
      dispatchEvent: (event) => dispatchedEvents.push(event.type),
      CustomEvent: class {
        constructor(type, init) {
          this.type = type;
          this.detail = init?.detail;
        }
      },
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalLocalStorage;
    globalThis.window = originalWindow;
  });

  describe('JWT Expiration and Decoding', () => {
    test('correctly decodes standard and base64url JWTs', () => {
      const token = createTestToken({ userId: 'user-abc_123-xyz', role: 'MANAGER', exp: Math.floor(Date.now() / 1000) + 3600 });
      const payload = parseJwt(token);
      assert.equal(payload.userId, 'user-abc_123-xyz');
      assert.equal(payload.role, 'MANAGER');
    });

    test('returns true for expired tokens', () => {
      const pastExp = Math.floor(Date.now() / 1000) - 60; // 60s in the past
      const expiredToken = createTestToken({ userId: 'u1', exp: pastExp });
      assert.equal(isJwtExpired(expiredToken), true);
    });

    test('returns true for tokens within the safety buffer window', () => {
      const nearExp = Math.floor(Date.now() / 1000) + 10; // 10s left, buffer is 15s
      const soonExpiringToken = createTestToken({ userId: 'u1', exp: nearExp });
      assert.equal(isJwtExpired(soonExpiringToken, 15), true);
    });

    test('returns false for tokens well before expiration', () => {
      const futureExp = Math.floor(Date.now() / 1000) + 600; // 10 minutes in future
      const validToken = createTestToken({ userId: 'u1', exp: futureExp });
      assert.equal(isJwtExpired(validToken, 15), false);
    });

    test('returns true for null, empty or invalid tokens', () => {
      assert.equal(isJwtExpired(null), true);
      assert.equal(isJwtExpired(''), true);
      assert.equal(isJwtExpired('not-a-token'), true);
    });
  });

  describe('Public Endpoints', () => {
    test('identifies public endpoints correctly without being blocked', () => {
      assert.equal(isPublicEndpoint('/auth/login'), true);
      assert.equal(isPublicEndpoint('/auth/organizations'), true);
      assert.equal(isPublicEndpoint('/auth/organizations?search=acme'), true);
      assert.equal(isPublicEndpoint('/auth/refresh'), true);
      assert.equal(isPublicEndpoint('/users'), false);
      assert.equal(isPublicEndpoint('/projects/123'), false);
      assert.equal(isPublicEndpoint('/users', { skipAuth: true }), true);
      assert.equal(isPublicEndpoint('/users', { isPublic: true }), true);
    });
  });

  describe('Normal Authenticated Requests', () => {
    test('sends Authorization header with active valid token', async () => {
      const validToken = createTestToken({ userId: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 });
      mockStorage.setItem('accessToken', validToken);

      let capturedHeaders = null;
      globalThis.fetch = async (url, options) => {
        capturedHeaders = options.headers;
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const result = await api.get('/users');
      assert.deepEqual(result, { success: true });
      assert.equal(capturedHeaders.Authorization, `Bearer ${validToken}`);
    });
  });

  describe('Proactive Token Refresh', () => {
    test('proactively refreshes expired token before sending endpoint request', async () => {
      const expiredToken = createTestToken({ userId: 'u1', exp: Math.floor(Date.now() / 1000) - 30 });
      const freshToken = createTestToken({ userId: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 });
      mockStorage.setItem('accessToken', expiredToken);
      mockStorage.setItem('refreshToken', 'valid-refresh-token');
      mockStorage.setItem('sessionId', 'sess-123');

      const requestLog = [];
      globalThis.fetch = async (url, options) => {
        requestLog.push({ url, headers: options.headers });
        if (url.includes('/auth/refresh')) {
          return new Response(JSON.stringify({
            accessToken: freshToken,
            refreshToken: 'valid-refresh-token-2',
            sessionId: 'sess-123',
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ users: ['alice', 'bob'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const result = await api.get('/users');
      assert.deepEqual(result, { users: ['alice', 'bob'] });

      // Verification: 1st request MUST be /auth/refresh, 2nd request is /users with FRESH token
      assert.equal(requestLog.length, 2);
      assert.ok(requestLog[0].url.includes('/auth/refresh'));
      assert.ok(requestLog[1].url.includes('/users'));
      assert.equal(requestLog[1].headers.Authorization, `Bearer ${freshToken}`);
      assert.equal(mockStorage.getItem('accessToken'), freshToken);
    });
  });

  describe('Concurrent Requests Sharing Single Refresh', () => {
    test('multiple concurrent requests share exactly one refresh operation', async () => {
      const expiredToken = createTestToken({ userId: 'u1', exp: Math.floor(Date.now() / 1000) - 30 });
      const freshToken = createTestToken({ userId: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 });
      mockStorage.setItem('accessToken', expiredToken);
      mockStorage.setItem('refreshToken', 'valid-refresh-token');
      mockStorage.setItem('sessionId', 'sess-123');

      let refreshCount = 0;
      globalThis.fetch = async (url, options) => {
        if (url.includes('/auth/refresh')) {
          refreshCount++;
          // Simulate latency
          await new Promise((r) => setTimeout(r, 50));
          return new Response(JSON.stringify({
            accessToken: freshToken,
            refreshToken: 'valid-refresh-token',
            sessionId: 'sess-123',
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // Must always receive fresh token
        assert.equal(options.headers.Authorization, `Bearer ${freshToken}`);
        return new Response(JSON.stringify({ url, ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      // Fire 5 concurrent requests imitating dashboard load
      const [res1, res2, res3, res4, res5] = await Promise.all([
        api.get('/users'),
        api.get('/users?cohort_id=cohort-1'),
        api.get('/projects'),
        api.get('/work-items'),
        api.get('/projects/health-overview'),
      ]);

      assert.equal(refreshCount, 1, 'Exactly one /auth/refresh request should be executed');
      assert.ok(res1.ok);
      assert.ok(res2.ok);
      assert.ok(res3.ok);
      assert.ok(res4.ok);
      assert.ok(res5.ok);
      assert.equal(mockStorage.getItem('accessToken'), freshToken);
    });
  });

  describe('Reactive 401 Handling & Retry At Most Once', () => {
    test('retries on unexpected 401 using refreshed token, at most once per request', async () => {
      const initialToken = createTestToken({ userId: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 });
      const refreshedToken = createTestToken({ userId: 'u1', exp: Math.floor(Date.now() / 1000) + 7200 });
      mockStorage.setItem('accessToken', initialToken);
      mockStorage.setItem('refreshToken', 'valid-refresh-token');
      mockStorage.setItem('sessionId', 'sess-123');

      let usersCallCount = 0;
      globalThis.fetch = async (url, options) => {
        if (url.includes('/auth/refresh')) {
          return new Response(JSON.stringify({
            accessToken: refreshedToken,
            refreshToken: 'valid-refresh-token',
            sessionId: 'sess-123',
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        if (url.includes('/users')) {
          usersCallCount++;
          if (usersCallCount === 1) {
            // First call rejected by backend (e.g. server-side secret rotated or invalidated)
            return new Response(JSON.stringify({ error: 'Invalid access token' }), { status: 401 });
          }
          // Retry call with refreshed token succeeds
          assert.equal(options.headers.Authorization, `Bearer ${refreshedToken}`);
          return new Response(JSON.stringify({ users: ['carol'] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      };

      const result = await api.get('/users');
      assert.deepEqual(result, { users: ['carol'] });
      assert.equal(usersCallCount, 2, 'Should retry exactly once');
    });

    test('terminates cleanly and does not enter infinite loop if retried request is still 401', async () => {
      const initialToken = createTestToken({ userId: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 });
      const refreshedToken = createTestToken({ userId: 'u1', exp: Math.floor(Date.now() / 1000) + 7200 });
      mockStorage.setItem('accessToken', initialToken);
      mockStorage.setItem('refreshToken', 'valid-refresh-token');
      mockStorage.setItem('sessionId', 'sess-123');

      let usersCallCount = 0;
      globalThis.fetch = async (url) => {
        if (url.includes('/auth/refresh')) {
          return new Response(JSON.stringify({
            accessToken: refreshedToken,
            refreshToken: 'valid-refresh-token',
            sessionId: 'sess-123',
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        if (url.includes('/users')) {
          usersCallCount++;
          // Always return 401 (e.g. user banned or suspended)
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        }
      };

      await assert.rejects(
        () => api.get('/users'),
        /Unauthorized/
      );

      // Should attempt initial call + exactly 1 retry, then clear session and stop
      assert.equal(usersCallCount, 2);
      assert.equal(mockStorage.getItem('accessToken'), null);
      assert.ok(dispatchedEvents.includes('auth:unauthorized'));
    });
  });

  describe('Failed Refresh Flow', () => {
    test('cleans up session and redirects cleanly when refresh token is expired or revoked', async () => {
      const expiredToken = createTestToken({ userId: 'u1', exp: Math.floor(Date.now() / 1000) - 30 });
      mockStorage.setItem('accessToken', expiredToken);
      mockStorage.setItem('refreshToken', 'expired-refresh-token');
      mockStorage.setItem('sessionId', 'sess-123');
      mockStorage.setItem('user', JSON.stringify({ id: 'u1', name: 'Alice' }));

      globalThis.fetch = async (url) => {
        if (url.includes('/auth/refresh')) {
          return new Response(JSON.stringify({ error: 'Invalid or expired refresh token' }), { status: 401 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      };

      await assert.rejects(
        () => api.get('/users'),
        /Token refresh failed|No refresh token|Authentication/
      );

      // Verify clean logout
      assert.equal(mockStorage.getItem('accessToken'), null);
      assert.equal(mockStorage.getItem('refreshToken'), null);
      assert.equal(mockStorage.getItem('user'), null);
      assert.ok(dispatchedEvents.includes('auth:unauthorized'));
    });
  });

  describe('Upload and Blob Endpoints', () => {
    test('upload handles FormData and performs token refresh seamlessly', async () => {
      const expiredToken = createTestToken({ userId: 'u1', exp: Math.floor(Date.now() / 1000) - 30 });
      const freshToken = createTestToken({ userId: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 });
      mockStorage.setItem('accessToken', expiredToken);
      mockStorage.setItem('refreshToken', 'valid-refresh-token');
      mockStorage.setItem('sessionId', 'sess-123');

      let uploadHeaders = null;
      globalThis.fetch = async (url, options) => {
        if (url.includes('/auth/refresh')) {
          return new Response(JSON.stringify({
            accessToken: freshToken,
            refreshToken: 'valid-refresh-token',
            sessionId: 'sess-123',
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        uploadHeaders = options.headers;
        return new Response(JSON.stringify({ uploaded: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const mockFormData = new FormData();
      mockFormData.append('test', 'value');

      const result = await api.upload('/documents', mockFormData);
      assert.deepEqual(result, { uploaded: true });
      assert.equal(uploadHeaders.Authorization, `Bearer ${freshToken}`);
      // Ensure Content-Type is NOT overridden to application/json on FormData
      assert.notEqual(uploadHeaders['Content-Type'], 'application/json');
    });

    test('getBlob returns Blob response with valid authentication', async () => {
      const validToken = createTestToken({ userId: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 });
      mockStorage.setItem('accessToken', validToken);

      globalThis.fetch = async (url, options) => {
        assert.equal(options.headers.Authorization, `Bearer ${validToken}`);
        return new Response(new Blob(['file content'], { type: 'text/plain' }), {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      };

      const blob = await api.getBlob('/documents/1/download');
      assert.ok(blob instanceof Blob);
      const text = await blob.text();
      assert.equal(text, 'file content');
    });
  });
});

