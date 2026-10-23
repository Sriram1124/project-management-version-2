/**
 * MIRAI Identity and Cohort Mapper
 * 
 * Invariants:
 * - UUIDs are strings stored as TEXT; values are preserved without alteration.
 * - Strict organization boundary enforcement: Cross-tenant mappings are rejected.
 * - Explicit failure handling: Ambiguous or invalid records throw UserMappingError rather than silently falling back.
 * - Complete audit traceability (timestamps, source IDs, organization context).
 */

import { IdentityMapping, UserMappingError } from './mirai-adapter.types';

export interface SourceUserPayload {
  id: string;
  email: string;
  organization_id?: string;
  cohort_id?: string | null;
  name?: string;
}

export interface SourceCohortPayload {
  id: string;
  code: string;
  name?: string;
  organization_id?: string;
}

export interface CohortMapping {
  source_cohort_id: string;
  canonical_cohort_id: string;
  code: string;
  organization_id: string;
  mapped_at: string;
}

export class MiraiIdentityMapper {
  private readonly defaultOrganizationId?: string;
  // Optional cache or explicit overrides map
  private readonly userOverrides: Map<string, string> = new Map();
  private readonly reverseUserOverrides: Map<string, string> = new Map();
  private readonly userOverrideOrgs: Map<string, string> = new Map();
  private readonly cohortOverrides: Map<string, string> = new Map();

  constructor(defaultOrganizationId?: string) {
    this.defaultOrganizationId = defaultOrganizationId;
  }

  /**
   * Register an explicit canonical override for a specific source user,
   * optionally bound to a specific organization.
   */
  registerUserOverride(sourceUserId: string, canonicalUserId: string, organizationId?: string): void {
    if (!sourceUserId || !canonicalUserId) {
      throw new UserMappingError('Source and canonical user IDs must be valid non-empty strings');
    }
    this.userOverrides.set(sourceUserId, canonicalUserId);
    this.reverseUserOverrides.set(canonicalUserId, sourceUserId);
    if (organizationId) {
      this.userOverrideOrgs.set(canonicalUserId, organizationId);
      this.userOverrideOrgs.set(sourceUserId, organizationId);
    }
  }

  /**
   * Resolve a canonical MIRAI user UUID to the corresponding source PM user ID.
   * Preserves UUID strings without alteration by default.
   * Enforces non-empty string validation and organization boundaries when provided.
   */
  resolveSourceUserId(miraiUserId: string, userOrgId?: string, expectedOrgId?: string): string {
    if (!miraiUserId || typeof miraiUserId !== 'string' || miraiUserId.trim() === '') {
      throw new UserMappingError('Invalid MIRAI user ID: expected non-empty UUID string', { miraiUserId });
    }

    const trimmed = miraiUserId.trim();

    // Check organization boundary if supplied or bound to the registered override
    const overrideOrg = this.userOverrideOrgs.get(trimmed);
    const orgId = userOrgId || overrideOrg || this.defaultOrganizationId;
    const boundaryOrgId = expectedOrgId || this.defaultOrganizationId;
    if (orgId && boundaryOrgId && orgId !== boundaryOrgId) {
      throw new UserMappingError(
        `Organization boundary violation: user belongs to organization '${orgId}' but expected '${boundaryOrgId}'`,
        { miraiUserId, expectedOrgId: boundaryOrgId, actualOrgId: orgId }
      );
    }

    // Resolve explicit override if registered, otherwise maintain the exact UUID string invariant
    return this.reverseUserOverrides.get(trimmed) || trimmed;
  }

  /**
   * Register an explicit canonical override for a specific source cohort
   */
  registerCohortOverride(sourceCohortId: string, canonicalCohortId: string): void {
    if (!sourceCohortId || !canonicalCohortId) {
      throw new UserMappingError('Source and canonical cohort IDs must be valid non-empty strings');
    }
    this.cohortOverrides.set(sourceCohortId, canonicalCohortId);
  }

  /**
   * Map a single source user record to a canonical MIRAI Identity
   */
  mapUser(user: SourceUserPayload, expectedOrgId?: string): IdentityMapping {
    if (!user || typeof user !== 'object') {
      throw new UserMappingError('Invalid user payload: payload is missing or not an object');
    }

    if (!user.id || typeof user.id !== 'string' || user.id.trim() === '') {
      throw new UserMappingError('Invalid user payload: missing or invalid user id (UUID string expected)', { user });
    }

    if (!user.email || typeof user.email !== 'string' || !user.email.includes('@')) {
      throw new UserMappingError(`Invalid user payload: missing or malformed email for user ${user.id}`, { user });
    }

    const orgId = user.organization_id || this.defaultOrganizationId;
    const boundaryOrgId = expectedOrgId || this.defaultOrganizationId;

    if (!orgId) {
      throw new UserMappingError(`User ${user.id} has no organization affiliation`, { user });
    }

    // Enforce strict organization boundary
    if (boundaryOrgId && orgId !== boundaryOrgId) {
      throw new UserMappingError(
        `Organization boundary violation: user ${user.id} belongs to organization '${orgId}' but expected '${boundaryOrgId}'`,
        { user, expectedOrgId: boundaryOrgId, actualOrgId: orgId }
      );
    }

    // Resolve canonical user ID (override or preserved canonical UUID string)
    const canonicalUserId = this.userOverrides.get(user.id) || user.id;

    return {
      source_user_id: user.id,
      canonical_user_id: canonicalUserId,
      organization_id: orgId,
      cohort_id: user.cohort_id || null,
      email: user.email.toLowerCase().trim(),
      mapped_at: new Date().toISOString(),
    };
  }

  /**
   * Map a batch of user records with boundary enforcement
   */
  mapUsers(users: SourceUserPayload[], expectedOrgId?: string): IdentityMapping[] {
    if (!Array.isArray(users)) {
      throw new UserMappingError('Expected an array of users for batch mapping');
    }
    return users.map((u) => this.mapUser(u, expectedOrgId));
  }

  /**
   * Map a source cohort record to canonical MIRAI cohort format
   */
  mapCohort(cohort: SourceCohortPayload, expectedOrgId?: string): CohortMapping {
    if (!cohort || typeof cohort !== 'object') {
      throw new UserMappingError('Invalid cohort payload: payload is missing or not an object');
    }

    if (!cohort.id || typeof cohort.id !== 'string' || cohort.id.trim() === '') {
      throw new UserMappingError('Invalid cohort payload: missing or invalid cohort id', { cohort });
    }

    if (!cohort.code || typeof cohort.code !== 'string' || cohort.code.trim() === '') {
      throw new UserMappingError(`Invalid cohort payload: missing code for cohort ${cohort.id}`, { cohort });
    }

    const orgId = cohort.organization_id || this.defaultOrganizationId;
    const boundaryOrgId = expectedOrgId || this.defaultOrganizationId;

    if (!orgId) {
      throw new UserMappingError(`Cohort ${cohort.id} has no organization affiliation`, { cohort });
    }

    // Enforce organization boundary
    if (boundaryOrgId && orgId !== boundaryOrgId) {
      throw new UserMappingError(
        `Organization boundary violation: cohort ${cohort.id} belongs to organization '${orgId}' but expected '${boundaryOrgId}'`,
        { cohort, expectedOrgId: boundaryOrgId, actualOrgId: orgId }
      );
    }

    const canonicalCohortId = this.cohortOverrides.get(cohort.id) || cohort.id;

    return {
      source_cohort_id: cohort.id,
      canonical_cohort_id: canonicalCohortId,
      code: cohort.code.trim(),
      organization_id: orgId,
      mapped_at: new Date().toISOString(),
    };
  }
}

