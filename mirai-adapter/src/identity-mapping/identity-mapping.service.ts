import { prisma } from '../../../backend-node/src/lib/prisma';
import { MiraiAuditService } from '../audit/mirai-audit.service';
import { ResolvedEffectiveUser, ReconciliationResult } from './types';

export class IdentityMappingService {
  /**
   * Authoritative effective PM user resolution for MIRAI integration.
   * Conforms to Approved Identity Decisions:
   * 1. Decision A (SEC-02): GET routes are strictly read-only; no auto-mapping or row insertion side effects.
   * 2. Decision B: Matching UUID strings alone must never establish identity without a persistent mapping row.
   * 3. Scoped strictly to the tenant organization boundary.
   * 4. Fails closed (returns null) if unmapped, inactive, or not found.
   */
  static async resolveEffectiveUser(
    targetUserId: string,
    orgId: string,
    email?: string
  ): Promise<ResolvedEffectiveUser | null> {
    if (!targetUserId || typeof targetUserId !== 'string' || !targetUserId.trim() || targetUserId === 'undefined') {
      return null;
    }
    if (!orgId || typeof orgId !== 'string' || !orgId.trim()) {
      return null;
    }

    const cleanTargetId = targetUserId.trim();
    const cleanOrgId = orgId.trim();

    // 1. Check UserIdentityMapping first by canonical mirai_user_id within tenant boundary
    const mapping = await prisma.userIdentityMapping.findFirst({
      where: {
        mirai_user_id: cleanTargetId,
        organization_id: cleanOrgId,
      },
      select: {
        id: true,
        mirai_user_id: true,
        pm_user_id: true,
        organization_id: true,
      },
    });

    if (mapping) {
      // Verify that the referenced PM user exists, is in the same organization, and is active
      const pmUser = await prisma.user.findFirst({
        where: {
          id: mapping.pm_user_id,
          organization_id: cleanOrgId,
        },
        select: {
          id: true,
          organization_id: true,
          is_active: true,
        },
      });

      if (!pmUser || !pmUser.is_active) {
        return null;
      }

      return {
        pm_user_id: pmUser.id,
        mirai_user_id: mapping.mirai_user_id,
        mapping_source: 'mapped',
      };
    }

    // 2. Decision A: GET membership lookups are strictly read-only with respect to identity mappings (SEC-02).
    // Mapping creation and auto-mapping mutations must go exclusively through POST /internal/mirai/v1/identities/reconcile.

    // 3. Decision B: Direct-ID fallback completely removed.
    // Matching UUID strings alone must never establish identity without a persistent mapping row.
    // Every identity lookup must resolve through the persistent, audited identity-mapping table.
    return null;
  }

  /**
   * Dedicated authenticated identity reconciliation method.
   * Given a mirai_user_id and email within the caller's verified tenant organization:
   * 1. Checks if mapping exists -> returns mapped PM user + memberships
   * 2. If not, matches active PM user by normalized email -> creates mapping if exactly 1 active match + memberships
   * 3. If multiple email matches -> returns ambiguous status, no mapping created
   * 4. If conflicting mapping exists -> returns conflict status, no mapping created
   * 5. If no match -> returns unmapped status, zero PM users created
   * Concurrency-safe with transactional audit logging and rollback guarantees.
   */
  static async reconcileIdentity(
    miraiUserId: string,
    email: string | undefined,
    user: any
  ): Promise<ReconciliationResult> {
    const as_of = new Date().toISOString();

    if (!miraiUserId || typeof miraiUserId !== 'string' || !miraiUserId.trim()) {
      return {
        mirai_user_id: miraiUserId || '',
        pm_user_id: null,
        mapping_status: 'unmapped',
        mapping_source: null,
        project_ids: [],
        as_of,
      };
    }

    const cleanMiraiId = miraiUserId.trim();
    const orgId = user?.organization_id;
    if (!orgId || typeof orgId !== 'string' || !orgId.trim()) {
      return {
        mirai_user_id: cleanMiraiId,
        pm_user_id: null,
        mapping_status: 'unmapped',
        mapping_source: null,
        project_ids: [],
        as_of,
      };
    }

    const cleanOrgId = orgId.trim();
    const serviceActor = user?.id || 'service:mirai';

    // 1. Check existing UserIdentityMapping
    const existingMapping = await prisma.userIdentityMapping.findFirst({
      where: {
        mirai_user_id: cleanMiraiId,
        organization_id: cleanOrgId,
      },
      select: {
        id: true,
        mirai_user_id: true,
        pm_user_id: true,
      },
    });

    if (existingMapping) {
      const pmUser = await prisma.user.findFirst({
        where: {
          id: existingMapping.pm_user_id,
          organization_id: cleanOrgId,
        },
        select: {
          id: true,
          is_active: true,
        },
      });

      if (!pmUser || !pmUser.is_active) {
        await MiraiAuditService.record({
          organizationId: cleanOrgId,
          action: 'MIRAI_IDENTITY_RECONCILE_FAILED_INACTIVE',
          targetId: existingMapping.id,
          actor: serviceActor,
          metadata: {
            mirai_user_id: cleanMiraiId,
            pm_user_id: existingMapping.pm_user_id,
            status: 'unmapped',
            reason: 'Referenced PM user is inactive or not found in organization',
          },
        });

        return {
          mirai_user_id: cleanMiraiId,
          pm_user_id: null,
          mapping_status: 'unmapped',
          mapping_source: null,
          project_ids: [],
          as_of,
        };
      }

      const memberships = await prisma.projectMember.findMany({
        where: {
          user_id: pmUser.id,
          project: { organization_id: cleanOrgId },
        },
        select: { project_id: true },
      });

      await MiraiAuditService.record({
        organizationId: cleanOrgId,
        action: 'MIRAI_IDENTITY_RECONCILED',
        targetId: existingMapping.id,
        actor: serviceActor,
        metadata: {
          mirai_user_id: cleanMiraiId,
          pm_user_id: pmUser.id,
          status: 'mapped',
          mapping_source: 'existing_mapping',
          project_count: memberships.length,
        },
      });

      return {
        mirai_user_id: cleanMiraiId,
        pm_user_id: pmUser.id,
        mapping_status: 'mapped',
        mapping_source: 'existing_mapping',
        project_ids: memberships.map((m) => m.project_id),
        as_of,
      };
    }

    // 2. No mapping exists: search active PM user by normalized email
    const normEmail = (email || '').trim().toLowerCase();
    if (normEmail) {
      const emailMatches = await prisma.user.findMany({
        where: {
          email: { equals: normEmail, mode: 'insensitive' },
          organization_id: cleanOrgId,
          is_active: true,
        },
        select: {
          id: true,
          is_active: true,
          organization_id: true,
        },
      });

      if (emailMatches.length > 1) {
        await MiraiAuditService.record({
          organizationId: cleanOrgId,
          action: 'MIRAI_IDENTITY_RECONCILE_AMBIGUOUS',
          targetId: cleanMiraiId,
          actor: serviceActor,
          metadata: {
            mirai_user_id: cleanMiraiId,
            status: 'ambiguous',
            match_count: emailMatches.length,
            reason: 'Multiple active PM users found with matching email',
          },
        });

        return {
          mirai_user_id: cleanMiraiId,
          pm_user_id: null,
          mapping_status: 'ambiguous',
          mapping_source: null,
          project_ids: [],
          as_of,
        };
      }

      if (emailMatches.length === 1) {
        const candidatePmUser = emailMatches[0];

        // Check if candidate PM user is already mapped to a different MIRAI UUID
        const existingPmMapping = await prisma.userIdentityMapping.findFirst({
          where: {
            pm_user_id: candidatePmUser.id,
            organization_id: cleanOrgId,
          },
          select: {
            mirai_user_id: true,
          },
        });

        if (existingPmMapping && existingPmMapping.mirai_user_id !== cleanMiraiId) {
          await MiraiAuditService.record({
            organizationId: cleanOrgId,
            action: 'MIRAI_IDENTITY_RECONCILE_CONFLICT',
            targetId: cleanMiraiId,
            actor: serviceActor,
            metadata: {
              mirai_user_id: cleanMiraiId,
              pm_user_id: candidatePmUser.id,
              conflicting_mirai_user_id: existingPmMapping.mirai_user_id,
              status: 'conflict',
              reason: 'Candidate PM user is already mapped to a different MIRAI identity',
            },
          });

          return {
            mirai_user_id: cleanMiraiId,
            pm_user_id: null,
            mapping_status: 'conflict',
            mapping_source: null,
            project_ids: [],
            as_of,
          };
        }

        // Safe insertion with concurrency handling and atomic audit record
        let createdMapping: any = null;
        try {
          createdMapping = await prisma.$transaction(async (tx) => {
            const mapping = await tx.userIdentityMapping.create({
              data: {
                organization_id: cleanOrgId,
                mirai_user_id: cleanMiraiId,
                pm_user_id: candidatePmUser.id,
              },
            });
            await MiraiAuditService.record({
              organizationId: cleanOrgId,
              action: 'MIRAI_IDENTITY_MAPPED',
              targetId: mapping.id,
              actor: serviceActor,
              metadata: {
                mirai_user_id: cleanMiraiId,
                pm_user_id: candidatePmUser.id,
                status: 'mapped',
                mapping_source: 'auto_mapped_by_email',
              },
              tx,
            });
            return mapping;
          });
        } catch (err: any) {
          // If already created concurrently, verify consistency
          const rechecked = await prisma.userIdentityMapping.findFirst({
            where: {
              mirai_user_id: cleanMiraiId,
              organization_id: cleanOrgId,
            },
          });
          if (!rechecked || rechecked.pm_user_id !== candidatePmUser.id) {
            await MiraiAuditService.record({
              organizationId: cleanOrgId,
              action: 'MIRAI_IDENTITY_RECONCILE_CONFLICT',
              targetId: cleanMiraiId,
              actor: serviceActor,
              metadata: {
                mirai_user_id: cleanMiraiId,
                pm_user_id: candidatePmUser.id,
                status: 'conflict',
                reason: 'Concurrent request mapped PM user to a different identity',
              },
            });

            return {
              mirai_user_id: cleanMiraiId,
              pm_user_id: null,
              mapping_status: 'conflict',
              mapping_source: null,
              project_ids: [],
              as_of,
            };
          }
          createdMapping = rechecked;
        }

        const memberships = await prisma.projectMember.findMany({
          where: {
            user_id: candidatePmUser.id,
            project: { organization_id: cleanOrgId },
          },
          select: { project_id: true },
        });

        return {
          mirai_user_id: cleanMiraiId,
          pm_user_id: candidatePmUser.id,
          mapping_status: 'mapped',
          mapping_source: 'auto_mapped_by_email',
          project_ids: memberships.map((m) => m.project_id),
          as_of,
        };
      }
    }

    // 3. No match: fail closed
    await MiraiAuditService.record({
      organizationId: cleanOrgId,
      action: 'MIRAI_IDENTITY_UNMAPPED',
      targetId: cleanMiraiId,
      actor: serviceActor,
      metadata: {
        mirai_user_id: cleanMiraiId,
        status: 'unmapped',
        reason: 'No matching active PM user found by email or direct ID',
      },
    });

    return {
      mirai_user_id: cleanMiraiId,
      pm_user_id: null,
      mapping_status: 'unmapped',
      mapping_source: null,
      project_ids: [],
      as_of,
    };
  }
}

