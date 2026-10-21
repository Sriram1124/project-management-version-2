import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert';
import {
  isValidToken,
  isValidSessionId,
  sanitizeUser,
  getSafeToken,
  setSafeToken,
  getSafeSessionId,
  getSafeStoredUser,
  setSafeStoredUser,
  setAuthSessionTokens,
  syncAuthProfile,
  clearSafeAuthStorage,
} from '../utils/storageSecurity.js';

describe('Browser Storage Security Suite (SonarQube jssecurity:S8475)', () => {
  const mockStorage = new Map();
  const mockLocalStorage = {
    getItem: (k) => (mockStorage.has(k) ? mockStorage.get(k) : null),
    setItem: (k, v) => mockStorage.set(k, String(v)),
    removeItem: (k) => mockStorage.delete(k),
    clear: () => mockStorage.clear(),
  };

  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;

  globalThis.window = { localStorage: mockLocalStorage };
  globalThis.localStorage = mockLocalStorage;

  beforeEach(() => {
    mockStorage.clear();
  });

  after(() => {
    globalThis.window = originalWindow;
    globalThis.localStorage = originalLocalStorage;
  });

  describe('Token Validation (isValidToken)', () => {
    test('accepts valid JWT format token', () => {
      const validJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      assert.strictEqual(isValidToken(validJwt), true);
    });

    test('rejects empty, non-string, or too short tokens', () => {
      assert.strictEqual(isValidToken(''), false);
      assert.strictEqual(isValidToken(null), false);
      assert.strictEqual(isValidToken(undefined), false);
      assert.strictEqual(isValidToken(12345), false);
      assert.strictEqual(isValidToken('short'), false);
    });

    test('rejects tokens containing HTML or script injection characters', () => {
      assert.strictEqual(isValidToken('<script>alert(1)</script>'), false);
      assert.strictEqual(isValidToken('token";document.cookie="evil'), false);
      assert.strictEqual(isValidToken('token\nwith\rnewlines'), false);
    });

    test('rejects excessively long tokens (DoS protection)', () => {
      const hugeToken = 'a'.repeat(5000);
      assert.strictEqual(isValidToken(hugeToken), false);
    });
  });

  describe('Session ID Validation (isValidSessionId)', () => {
    test('accepts standard alphanumeric and UUID session IDs', () => {
      assert.strictEqual(isValidSessionId('sess_1234567890'), true);
      assert.strictEqual(isValidSessionId('550e8400-e29b-41d4-a716-446655440000'), true);
    });

    test('rejects session IDs with dangerous characters', () => {
      assert.strictEqual(isValidSessionId('../traversal'), false);
      assert.strictEqual(isValidSessionId("sess'; DROP TABLE users;--"), false);
      assert.strictEqual(isValidSessionId(''), false);
      assert.strictEqual(isValidSessionId('abc'), false);
    });
  });

  describe('User Object Sanitization & Storage Poisoning Defense (sanitizeUser)', () => {
    test('accepts valid manager profile', () => {
      const input = {
        id: 'usr-1234',
        name: 'Sachin Kumar',
        email: 'sachin.kumar@dailoqa.com',
        role: 'MANAGER',
        user_code: 'MGR-2814',
        organization_id: 'org-1',
        organization_name: 'Dailoqa Solutions',
        permissions: ['PROJECT_READ', 'USER_READ'],
        is_tech_lead: false,
        lead_project_ids: [],
      };
      const sanitized = sanitizeUser(input);
      assert.ok(sanitized);
      assert.strictEqual(sanitized.id, 'usr-1234');
      assert.strictEqual(sanitized.name, 'Sachin Kumar');
      assert.strictEqual(sanitized.role, 'MANAGER');
      assert.strictEqual(sanitized.user_code, 'MGR-2814');
    });

    test('rejects objects missing mandatory id', () => {
      assert.strictEqual(sanitizeUser({ name: 'Anonymous', role: 'MANAGER' }), null);
      assert.strictEqual(sanitizeUser({ id: '' }), null);
      assert.strictEqual(sanitizeUser(null), null);
      assert.strictEqual(sanitizeUser('string-payload'), null);
    });

    test('falls back to safe default role if untrusted or unknown role is provided', () => {
      const input = { id: 'usr-1', name: 'Tester', role: 'ROOT_SUPERADMIN_HACK' };
      const sanitized = sanitizeUser(input);
      assert.ok(sanitized);
      assert.strictEqual(sanitized.role, 'USER', 'Untrusted role must fallback to USER');
    });

    test('strips prototype pollution vectors (__proto__, constructor)', () => {
      const maliciousPayload = JSON.parse('{"id": "usr-1", "name": "Evil", "__proto__": {"isAdmin": true}}');
      const sanitized = sanitizeUser(maliciousPayload);
      assert.strictEqual(sanitized, null, 'Must reject payloads with prototype pollution keys');
    });

    test('sanitizes permissions to alphanumeric uppercase identifier strings only', () => {
      const input = {
        id: 'usr-1',
        role: 'INTERN',
        permissions: ['PROJECT_READ', 'alert(1)', 'USER_WRITE', '', 123],
      };
      const sanitized = sanitizeUser(input);
      assert.deepStrictEqual(sanitized.permissions, ['PROJECT_READ', 'USER_WRITE']);
    });
  });

  describe('Safe Storage Read & Write (getSafeStoredUser, setSafeStoredUser, getSafeToken)', () => {
    test('stores and retrieves valid user securely', () => {
      const user = {
        id: 'usr-42',
        name: 'Alice',
        email: 'alice@example.com',
        role: 'INTERN',
      };
      const ok = setSafeStoredUser(user);
      assert.strictEqual(ok, true);

      const retrieved = getSafeStoredUser();
      assert.ok(retrieved);
      assert.strictEqual(retrieved.id, 'usr-42');
      assert.strictEqual(retrieved.name, 'Alice');
      assert.strictEqual(retrieved.role, 'INTERN');
    });

    test('purges storage and returns null if stored user was poisoned or corrupted in localStorage', () => {
      // Attacker attempts to poison localStorage directly
      mockStorage.set('user', '{"id": "", "role": "SUPER_ADMIN", "corrupted": true}');
      const result = getSafeStoredUser();
      assert.strictEqual(result, null);
      assert.strictEqual(mockStorage.has('user'), false, 'Corrupted user must be purged from storage');

      // Malformed JSON string
      mockStorage.set('user', '{not valid json');
      assert.strictEqual(getSafeStoredUser(), null);
      assert.strictEqual(mockStorage.has('user'), false);
    });

    test('getSafeToken purges corrupted tokens and returns null', () => {
      mockStorage.set('accessToken', 'evil<script>');
      assert.strictEqual(getSafeToken('accessToken'), null);
      assert.strictEqual(mockStorage.has('accessToken'), false);
    });

    test('getSafeSessionId validates and returns valid session, purges invalid', () => {
      mockStorage.set('sessionId', 'valid-session-123_abc');
      assert.strictEqual(getSafeSessionId(), 'valid-session-123_abc');

      mockStorage.set('sessionId', 'bad session with spaces!');
      assert.strictEqual(getSafeSessionId(), null);
    });

    test('setAuthSessionTokens stores valid tokens and session id safely', () => {
      setAuthSessionTokens({
        accessToken: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig',
        refreshToken: 'valid-refresh-token-123',
        sessionId: 'session-valid-999',
      });
      assert.strictEqual(mockStorage.get('accessToken'), 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig');
      assert.strictEqual(mockStorage.get('refreshToken'), 'valid-refresh-token-123');
      assert.strictEqual(mockStorage.get('sessionId'), 'session-valid-999');
    });

    test('syncAuthProfile updates reactive state and persists sanitized user', () => {
      let stateUser = null;
      const setUser = (u) => { stateUser = u; };
      const profile = { id: 'usr-99', name: 'Bob', role: 'MANAGER' };

      const synced = syncAuthProfile(profile, setUser);
      assert.strictEqual(synced, true);
      assert.strictEqual(stateUser.name, 'Bob');
      assert.ok(mockStorage.has('user'));
    });

    test('clearSafeAuthStorage wipes all auth keys cleanly', () => {
      mockStorage.set('accessToken', 'valid.token.here');
      mockStorage.set('refreshToken', 'valid.refresh.token');
      mockStorage.set('user', '{"id": "1", "role": "USER"}');
      clearSafeAuthStorage();
      assert.strictEqual(mockStorage.has('accessToken'), false);
      assert.strictEqual(mockStorage.has('refreshToken'), false);
      assert.strictEqual(mockStorage.has('user'), false);
    });
  });
});

