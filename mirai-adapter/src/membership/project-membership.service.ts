import { prisma } from '../../../backend-node/src/lib/prisma';
import { IdentityMappingService } from '../identity-mapping/identity-mapping.service';
import { ProjectMembershipCheckResult, UserMembershipsResult } from './types';

export class ProjectMembershipService {
  /**
   * Authoritative check whether a user is a member of a project using public.project_members.
   * Does NOT infer membership from project ownership or work item assignments.
   * Enforces organization boundaries and fails closed.
   */
  static async checkProjectMembership(
    projectId: string,
    targetUserId: string,
    user: any,
    email?: string
  ): Promise<ProjectMembershipCheckResult> {
    if (!projectId || typeof projectId !== 'string' || !projectId.trim() || projectId === 'undefined') {
      throw new Error('Project not found');
    }
    if (!targetUserId || typeof targetUserId !== 'string' || !targetUserId.trim() || targetUserId === 'undefined') {
      throw new Error('User not found');
    }

    const cleanProjectId = projectId.trim();
    const cleanUserId = targetUserId.trim();

    const orgId = user?.organization_id;
    if (!orgId) {
      throw new Error('User not found');
    }

    // 1. Validate that the project exists within the organization boundary
    const project = await prisma.project.findFirst({
      where: {
        id: cleanProjectId,
        organization_id: orgId,
      },
      select: {
        id: true,
        organization_id: true,
        status: true,
      },
    });
    if (!project) {
      throw new Error('Project not found');
    }

    // 2. Resolve effective user (via UserIdentityMapping, never via unmapped direct fallback)
    const resolved = await IdentityMappingService.resolveEffectiveUser(cleanUserId, orgId, email);
    if (!resolved) {
      throw new Error('User not found');
    }

    // 3. Authoritative membership check solely in public.project_members
    const membership = await prisma.projectMember.findFirst({
      where: {
        project_id: cleanProjectId,
        user_id: resolved.pm_user_id,
      },
      select: {
        project_id: true,
        user_id: true,
        project_role: true,
        role_id: true,
      },
    });

    return {
      is_member: Boolean(membership),
      project_id: cleanProjectId,
      user_id: cleanUserId,
      pm_user_id: resolved.pm_user_id,
      mapping_source: resolved.mapping_source,
      project_role: membership?.project_role || null,
      role_id: membership?.role_id || null,
      joined_at: null,
    };
  }

  /**
   * Return all project IDs that a user is an authoritative member of using public.project_members.
   * Single efficient query, avoiding N+1 requests or whole-roster fetching.
   * Enforces organization boundaries and fails closed.
   */
  static async getUserProjectMemberships(
    targetUserId: string,
    user: any,
    email?: string
  ): Promise<UserMembershipsResult> {
    if (!targetUserId || typeof targetUserId !== 'string' || !targetUserId.trim() || targetUserId === 'undefined') {
      throw new Error('User not found');
    }

    const cleanUserId = targetUserId.trim();

    const orgId = user?.organization_id;
    if (!orgId) {
      throw new Error('User not found');
    }

    // 1. Resolve effective user (via UserIdentityMapping)
    const resolved = await IdentityMappingService.resolveEffectiveUser(cleanUserId, orgId, email);
    if (!resolved) {
      throw new Error('User not found');
    }

    // 2. Query project_members with organization filter via relation in a single efficient query
    const memberships = await prisma.projectMember.findMany({
      where: {
        user_id: resolved.pm_user_id,
        project: { organization_id: orgId },
      },
      select: {
        project_id: true,
      },
    });

    const projectIds = memberships.map((m) => m.project_id);

    return {
      user_id: cleanUserId,
      pm_user_id: resolved.pm_user_id,
      mapping_source: resolved.mapping_source,
      project_ids: projectIds,
      total: projectIds.length,
    };
  }
}

