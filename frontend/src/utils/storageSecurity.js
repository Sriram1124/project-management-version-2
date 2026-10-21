/**
 * Browser Storage Security Utility
 * Mitigates DOM-based storage poisoning (SonarQube jssecurity:S8475)
 *
 * Enforces strict validation on all items before writing to or reading from
 * localStorage / sessionStorage. The backend remains the sole authoritative
 * source for identity, roles, and permissions.
 */

// Permitted user role values
const ALLOWED_ROLES = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'MANAGER',
  'INTERN',
  'EMPLOYEE',
  'TECH_LEAD',
  'USER',
]);

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
  return null;
}

/**
 * Validates a JWT or bearer token string.
 * Must be a non-empty string of reasonable length matching valid token characters.
 */
export function isValidToken(token) {
  if (typeof token !== 'string') return false;
  const trimmed = token.trim();
  if (trimmed.length < 10 || trimmed.length > 4096) return false;
  // Standard 3-part dot-separated JWT or safe base64url/hex token
  const jwtPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  const safeTokenPattern = /^[A-Za-z0-9_\-\.:+=/]+$/;
  return jwtPattern.test(trimmed) || safeTokenPattern.test(trimmed);
}

/**
 * Validates a session identifier.
 */
export function isValidSessionId(sessionId) {
  if (typeof sessionId !== 'string') return false;
  const trimmed = sessionId.trim();
  if (trimmed.length < 4 || trimmed.length > 256) return false;
  return /^[a-zA-Z0-9_\-]+$/.test(trimmed);
}

/**
 * Sanitizes and validates a user object before persistence or state hydration.
 * Strips unexpected properties (preventing prototype pollution) and verifies
 * mandatory schema fields. Returns null if invalid.
 */
export function sanitizeUser(rawUser) {
  if (!rawUser || typeof rawUser !== 'object' || Array.isArray(rawUser)) {
    return null;
  }

  // Prevent prototype pollution
  if (
    Object.prototype.hasOwnProperty.call(rawUser, '__proto__') ||
    Object.prototype.hasOwnProperty.call(rawUser, 'constructor')
  ) {
    return null;
  }

  const id = typeof rawUser.id === 'string' && rawUser.id.trim() ? rawUser.id.trim() : null;
  if (!id) return null;

  const roleRaw = typeof rawUser.role === 'string' ? rawUser.role.trim().toUpperCase() : 'USER';
  const role = ALLOWED_ROLES.has(roleRaw) ? roleRaw : 'USER';

  const name =
    typeof rawUser.name === 'string'
      ? rawUser.name.slice(0, 255).trim()
      : typeof rawUser.full_name === 'string'
      ? rawUser.full_name.slice(0, 255).trim()
      : 'User';

  const email =
    typeof rawUser.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawUser.email.trim())
      ? rawUser.email.trim().slice(0, 255)
      : '';

  const userCode =
    typeof rawUser.user_code === 'string' && /^[a-zA-Z0-9_\-]+$/.test(rawUser.user_code.trim())
      ? rawUser.user_code.trim()
      : undefined;

  const batch =
    typeof rawUser.batch === 'string' ? rawUser.batch.slice(0, 50).trim() : null;

  const orgId =
    typeof rawUser.organization_id === 'string' && rawUser.organization_id.trim()
      ? rawUser.organization_id.trim()
      : null;

  const orgName =
    typeof rawUser.organization_name === 'string'
      ? rawUser.organization_name.slice(0, 255).trim()
      : rawUser.organization && typeof rawUser.organization.name === 'string'
      ? rawUser.organization.name.slice(0, 255).trim()
      : null;

  const permissions = Array.isArray(rawUser.permissions)
    ? rawUser.permissions
        .filter((p) => typeof p === 'string' && /^[A-Z0-9_]+$/.test(p.trim()))
        .map((p) => p.trim())
    : [];

  const leadProjectIds = Array.isArray(rawUser.lead_project_ids)
    ? rawUser.lead_project_ids
        .filter((leadId) => typeof leadId === 'string' && leadId.trim())
        .map((leadId) => leadId.trim())
    : [];

  return {
    id,
    name,
    email,
    role,
    ...(userCode ? { user_code: userCode } : {}),
    batch,
    organization_id: orgId,
    organization_name: orgName,
    organization: orgId ? { id: orgId, name: orgName || 'Organization' } : null,
    permissions,
    is_tech_lead: Boolean(rawUser.is_tech_lead),
    lead_project_ids: leadProjectIds,
    must_change_password: Boolean(rawUser.must_change_password),
    created_at: typeof rawUser.created_at === 'string' ? rawUser.created_at : null,
  };
}

/**
 * Safe local storage reader for authentication tokens.
 * Discards malformed or manipulated tokens.
 */
export function getSafeToken(key) {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const val = storage.getItem(key);
    if (!val) return null;
    if (isValidToken(val)) {
      return val;
    }
    // Token is corrupt or poisoned; purge it immediately
    storage.removeItem(key);
    return null;
  } catch {
    return null;
  }
}

/**
 * Safe local storage writer for authentication tokens.
 */
export function setSafeToken(key, value) {
  const storage = getStorage();
  if (!storage) return false;
  try {
    if (value && isValidToken(value)) {
      storage.setItem(key, value);
      return true;
    }
    storage.removeItem(key);
    return false;
  } catch {
    return false;
  }
}

/**
 * Safe local storage reader for the cached user.
 * Validates structure and discards invalid or manipulated data.
 */
export function getSafeStoredUser() {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem('user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const sanitized = sanitizeUser(parsed);
    if (!sanitized) {
      storage.removeItem('user');
      return null;
    }
    return sanitized;
  } catch {
    try {
      storage.removeItem('user');
    } catch {}
    return null;
  }
}

/**
 * Safe local storage writer for the user profile.
 */
export function setSafeStoredUser(user) {
  const storage = getStorage();
  if (!storage) return false;
  try {
    const sanitized = sanitizeUser(user);
    if (sanitized) {
      storage.setItem('user', JSON.stringify(sanitized));
      storage.setItem('user_last_verified', String(Date.now()));
      return true;
    }
    storage.removeItem('user');
    return false;
  } catch {
    return false;
  }
}

/**
 * Purges all authentication items from storage safely.
 */
export function clearSafeAuthStorage() {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem('accessToken');
    storage.removeItem('refreshToken');
    storage.removeItem('sessionId');
    storage.removeItem('user');
    storage.removeItem('user_last_verified');
  } catch {}
}

