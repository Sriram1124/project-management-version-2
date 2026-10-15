import { WorkItemType, WorkItemStatus, WorkItemPriority } from '@prisma/client';
import { prisma } from '../lib/prisma';

export type HealthStatus = 'HEALTHY' | 'AT_RISK' | 'CRITICAL' | 'NOT_ASSESSED' | 'INSUFFICIENT_DATA';

/**
 * Configurable thresholds for blocked-work percentage of remaining story points.
 * formula: (blockedStoryPoints / remainingStoryPoints) * 100
 */
export const BLOCKED_RISK_THRESHOLDS = {
  LOW_EXPOSURE_MAX: 25, // < 25%: Low exposure; monitor. Do not classify as AT_RISK solely on percentage.
  POTENTIAL_RISK_MIN: 25, // 25% to < 50%: Potential delivery risk (AT_RISK)
  HIGH_RISK_MIN: 50, // >= 50%: High delivery risk (evaluate for CRITICAL or AT_RISK)
} as const;

export interface StoryHealthItem {
  id: string;
  title: string;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  total_sp: number;
  completed_sp: number;
  remaining_sp: number;
  progress_percentage: number | null;
  task_count: number;
  completed_task_count: number;
  is_blocked: boolean;
  is_overdue: boolean;
  sprint_id?: string | null;
}

export interface ProjectHealthItem {
  id: string;
  name: string;
  status: string; // Project lifecycle status (e.g. ACTIVE, PLANNED, ARCHIVED)
  health: HealthStatus;
  reasons: string[];
  warnings?: string[];
  completion_percentage: number | null; // Kept for backwards compatibility
  progress_percentage: number | null; // SP-based project progress percentage
  has_estimated_work: boolean;
  total_sp: number;
  completed_sp: number;
  remaining_sp: number;
  blocked_sp: number;
  blocked_work_percentage: number | null;
  unestimated_blockers_count: number;
  story_count: number;
  completed_stories_count: number;
  blocked_stories_count: number;
  overdue_stories_count: number;
  total_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  blocked_tasks: number;
  critical_tasks: number;
  project_overdue_days: number;
  max_task_overdue_days: number;
  stories?: StoryHealthItem[];
}

export interface PortfolioHealthSummary {
  total: number;
  assessed: number;
  healthy: number;
  at_risk: number;
  critical: number;
  not_assessed: number;
  insufficient_data: number;
  attention_required: number;
  attention_rate: number;
}

export interface PortfolioHealthDistribution {
  healthy: { count: number; percentage: number };
  at_risk: { count: number; percentage: number };
  critical: { count: number; percentage: number };
  not_assessed: { count: number; percentage: number };
  insufficient_data: { count: number; percentage: number };
}

export interface PortfolioHealthResponse {
  summary: PortfolioHealthSummary;
  distribution: PortfolioHealthDistribution;
  projects: ProjectHealthItem[];
}

export class ProjectHealthService {
  /**
   * Helper to ensure user belongs to an organization or fallback for Super Admin
   */
  private static async getEffectiveOrgId(user: any): Promise<string | null> {
    if (user?.organization_id) return user.organization_id;
    if (user?.organization?.id) return user.organization.id;

    // Super Admin global fallback
    const firstOrg = await prisma.organization.findFirst({ where: { is_active: true } });
    return firstOrg?.id || null;
  }

  /**
   * Classify health and compute story-point progress for a single project
   */
  static classifyProjectHealth(project: {
    id: string;
    name: string;
    status: string;
    start_date?: Date | null;
    end_date?: Date | null;
    work_items?: Array<{
      id: string;
      title?: string;
      type: WorkItemType;
      status: WorkItemStatus;
      priority: WorkItemPriority;
      due_date?: Date | null;
      story_points?: number | null;
      parent_id?: string | null;
      sprint_id?: string | null;
    }>;
    sprints?: Array<{
      id: string;
      status: string;
      start_date?: Date | null;
      end_date?: Date | null;
    }>;
  }): {
    health: HealthStatus;
    reasons: string[];
    warnings?: string[];
    has_estimated_work: boolean;
    total_sp: number;
    completed_sp: number;
    remaining_sp: number;
    blocked_sp: number;
    blocked_work_percentage: number | null;
    unestimated_blockers_count: number;
    progress_percentage: number | null;
    completion_percentage: number | null;
    story_count: number;
    completed_stories_count: number;
    blocked_stories_count: number;
    overdue_stories_count: number;
    total_tasks: number;
    completed_tasks: number;
    overdue_tasks: number;
    blocked_tasks: number;
    critical_tasks: number;
    project_overdue_days: number;
    max_task_overdue_days: number;
    stories: StoryHealthItem[];
  } {
    const workItems = project.work_items || [];
    const sprints = project.sprints || [];
    const now = new Date();

    const sprintMap = new Map<string, any>(sprints.map((s: any) => [s.id, s]));

    // 1. All parent IDs that have children in this project (to prevent double counting)
    const parentIdsWithChildren = new Set(workItems.map((w: any) => w.parent_id).filter(Boolean));

    // 2. Identify eligible leaf deliverables:
    // Any work item in the project that is NOT an Epic and has NO children in the project.
    // This includes:
    // - Leaf tasks, subtasks, and bugs
    // - Standalone stories (stories with no child tasks, estimated directly)
    const eligibleLeaves = workItems.filter(
      (w: any) => w.type !== WorkItemType.EPIC && !parentIdsWithChildren.has(w.id)
    );

    // 3. Compute story-level progress and metrics
    const stories = workItems.filter((w: any) => w.type === WorkItemType.STORY);
    const storyItems: StoryHealthItem[] = stories.map((s: any) => {
      // Find all leaf tasks under this story
      const childTasks = eligibleLeaves.filter((t: any) => {
        if (t.id === s.id) return false;
        if (t.parent_id === s.id) return true;
        const parentTask = workItems.find((p: any) => p.id === t.parent_id);
        return parentTask && parentTask.parent_id === s.id;
      });

      const hasChildren = childTasks.length > 0;
      const sTotalSp = hasChildren
        ? childTasks.reduce((sum: number, t: any) => sum + (Number(t.story_points) || 0), 0)
        : Number(s.story_points) || 0;

      const sCompletedTasks = childTasks.filter((t: any) => t.status === WorkItemStatus.COMPLETED);
      const sCompletedSp = hasChildren
        ? sCompletedTasks.reduce((sum: number, t: any) => sum + (Number(t.story_points) || 0), 0)
        : (s.status === WorkItemStatus.COMPLETED ? sTotalSp : 0);

      const sRemainingSp = Math.max(0, sTotalSp - sCompletedSp);
      const sProgress = sTotalSp > 0
        ? Math.round((sCompletedSp / sTotalSp) * 100)
        : (s.status === WorkItemStatus.COMPLETED ? 100 : null);

      // Exclude completed work from remaining blocked work
      const isStoryExplicitlyBlocked = s.status === WorkItemStatus.BLOCKED && s.status !== WorkItemStatus.COMPLETED;
      const hasBlockedChildTask = childTasks.some(
        (t: any) => t.status === WorkItemStatus.BLOCKED && t.status !== WorkItemStatus.COMPLETED
      );
      const isBlocked = isStoryExplicitlyBlocked || hasBlockedChildTask;

      const isStoryExplicitlyOverdue = Boolean(s.due_date && new Date(s.due_date) < now && s.status !== WorkItemStatus.COMPLETED);
      const hasOverdueChildTask = childTasks.some((t: any) => t.due_date && new Date(t.due_date) < now && t.status !== WorkItemStatus.COMPLETED);
      const isOverdue = isStoryExplicitlyOverdue || hasOverdueChildTask;

      return {
        id: s.id,
        title: s.title || 'Story',
        status: s.status,
        priority: s.priority,
        total_sp: sTotalSp,
        completed_sp: sCompletedSp,
        remaining_sp: sRemainingSp,
        progress_percentage: sProgress,
        task_count: hasChildren ? childTasks.length : 1,
        completed_task_count: hasChildren ? sCompletedTasks.length : (s.status === WorkItemStatus.COMPLETED ? 1 : 0),
        is_blocked: isBlocked,
        is_overdue: isOverdue,
        sprint_id: s.sprint_id || null,
      };
    });

    // 4. Compute project-level story points aggregation from eligible leaf deliverables
    const total_sp = eligibleLeaves.reduce((sum: number, t: any) => sum + (Number(t.story_points) || 0), 0);
    const completed_sp = eligibleLeaves
      .filter((t: any) => t.status === WorkItemStatus.COMPLETED)
      .reduce((sum: number, t: any) => sum + (Number(t.story_points) || 0), 0);
    const remaining_sp = Math.max(0, total_sp - completed_sp);
    const has_estimated_work = total_sp > 0;
    const progress_percentage = has_estimated_work ? Math.round((completed_sp / total_sp) * 100) : null;

    // Unfinished leaf deliverables (excluding completed or cancelled work)
    const unfinishedLeaves = eligibleLeaves.filter(
      (t: any) => t.status !== WorkItemStatus.COMPLETED && (t.status as any) !== 'CANCELLED'
    );

    // Blocked leaf deliverables (only active/unfinished work)
    const blockedLeaves = unfinishedLeaves.filter((t: any) => t.status === WorkItemStatus.BLOCKED);
    const blocked_tasks = blockedLeaves.length;
    const blocked_sp = blockedLeaves.reduce((sum: number, t: any) => sum + (Number(t.story_points) || 0), 0);

    // Formula: blockedWorkPercentage = (blockedStoryPoints / remainingStoryPoints) * 100
    const blocked_work_percentage =
      remaining_sp > 0 ? Number(((blocked_sp / remaining_sp) * 100).toFixed(1)) : 0;

    // Task and story counts from eligible leaves
    const total_tasks = eligibleLeaves.length;
    const completed_tasks = eligibleLeaves.filter((t: any) => t.status === WorkItemStatus.COMPLETED).length;
    const overdueTasksList = unfinishedLeaves.filter(
      (t: any) => t.due_date && new Date(t.due_date) < now
    );
    const overdue_tasks = overdueTasksList.length;

    const completed_stories_count = storyItems.filter(
      (s) => s.status === WorkItemStatus.COMPLETED || (s.total_sp > 0 && s.completed_sp === s.total_sp)
    ).length;
    const blocked_stories_count = storyItems.filter((s) => s.is_blocked).length;
    const overdue_stories_count = storyItems.filter((s) => s.is_overdue).length;

    // Overdue days calculation
    let maxTaskOverdueDays = 0;
    if (overdueTasksList.length > 0) {
      maxTaskOverdueDays = Math.max(
        ...overdueTasksList.map((t) =>
          Math.max(1, Math.floor((now.getTime() - new Date(t.due_date!).getTime()) / (1000 * 60 * 60 * 24)))
        )
      );
    }

    const projectEndDatePassed = Boolean(
      project.end_date && new Date(project.end_date) < now && (has_estimated_work ? remaining_sp > 0 : total_tasks > completed_tasks)
    );
    let projectOverdueDays = 0;
    if (projectEndDatePassed && project.end_date) {
      projectOverdueDays = Math.max(
        1,
        Math.floor((now.getTime() - new Date(project.end_date).getTime()) / (1000 * 60 * 60 * 24))
      );
    }

    // Schedule / Sprint deadlines calculation
    const activeSprint = sprints.find((s) => s.status === 'ACTIVE');
    const sprintOverdue = Boolean(
      activeSprint &&
        activeSprint.end_date &&
        new Date(activeSprint.end_date) < now &&
        (has_estimated_work ? remaining_sp > 0 : total_tasks > completed_tasks)
    );

    let daysUntilDeadline: number | null = null;
    if (project.end_date && new Date(project.end_date) >= now) {
      daysUntilDeadline = Math.floor((new Date(project.end_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Classify blocked items by sprint scope & estimation
    const blockedInActiveSprint: any[] = [];
    const blockedInCompletedSprint: any[] = [];
    const blockedInPlannedOrBacklog: any[] = [];
    const unestimatedBlockers: any[] = [];

    for (const t of blockedLeaves) {
      let itemSprintId = t.sprint_id;
      if (!itemSprintId && t.parent_id) {
        const parent = workItems.find((w: any) => w.id === t.parent_id);
        if (parent?.sprint_id) itemSprintId = parent.sprint_id;
      }
      const itemSprint = itemSprintId ? sprintMap.get(itemSprintId) : null;
      const sprintLifecycle = itemSprint ? itemSprint.status : 'BACKLOG';

      if (sprintLifecycle === 'ACTIVE') {
        blockedInActiveSprint.push(t);
      } else if (sprintLifecycle === 'COMPLETED') {
        blockedInCompletedSprint.push(t);
      } else {
        blockedInPlannedOrBacklog.push(t);
      }

      if (!t.story_points || Number(t.story_points) === 0) {
        unestimatedBlockers.push(t);
      }
    }
    const unestimated_blockers_count = unestimatedBlockers.length;

    // Collect non-blocking data quality and lifecycle warnings
    const warnings: string[] = [];
    if (blockedInCompletedSprint.length > 0) {
      warnings.push(
        `${blockedInCompletedSprint.length} unresolved blocked deliverable(s) in completed sprint · Flagged for review / rollover`
      );
    }
    if (unestimated_blockers_count > 0) {
      warnings.push(
        `${unestimated_blockers_count} blocked deliverable(s) with 0 estimated SP · Delivery impact unknown (estimation required)`
      );
    }
    const hasExplicitSchedule = Boolean(project.end_date || activeSprint);
    if (remaining_sp > 0 && !hasExplicitSchedule) {
      warnings.push('Missing schedule data: No project deadline or active sprint scheduled');
    }

    // 5. Insufficient Data / Not Assessed check:
    // If no eligible estimated work defined, return NOT_ASSESSED with null progress percentage
    if (!has_estimated_work || total_tasks === 0) {
      return {
        health: 'NOT_ASSESSED',
        reasons: ['No estimated work defined for this project'],
        warnings,
        has_estimated_work: false,
        total_sp: 0,
        completed_sp: 0,
        remaining_sp: 0,
        blocked_sp: 0,
        blocked_work_percentage: null,
        unestimated_blockers_count,
        progress_percentage: null,
        completion_percentage: null,
        story_count: stories.length,
        completed_stories_count: 0,
        blocked_stories_count: 0,
        overdue_stories_count: 0,
        total_tasks,
        completed_tasks,
        overdue_tasks,
        blocked_tasks: 0,
        critical_tasks: 0,
        project_overdue_days: projectOverdueDays,
        max_task_overdue_days: maxTaskOverdueDays,
        stories: storyItems,
      };
    }

    // 6. Evaluate Health Separately from Progress:
    const criticalReasons: string[] = [];
    const atRiskReasons: string[] = [];

    // --- CRITICAL THRESHOLDS ---

    // Rule 1: High/Urgent priority deliverable overdue
    const critOverdueTasks = overdueTasksList.filter(
      (t) => t.priority === WorkItemPriority.URGENT || t.priority === WorkItemPriority.HIGH
    );
    const critOverdueStories = storyItems.filter(
      (s) => (s.priority === WorkItemPriority.URGENT || s.priority === WorkItemPriority.HIGH) && s.is_overdue
    );
    if (critOverdueTasks.length > 0 || critOverdueStories.length > 0) {
      const count = Math.max(critOverdueStories.length, critOverdueTasks.length);
      criticalReasons.push(
        `${count} high-priority deliverable(s) overdue (${maxTaskOverdueDays}d delay)`
      );
    }

    // Rule 2: Severe Blocker / High-Priority Deliverable Blocked
    // Blockers in completed sprints are excluded from severe immediate threats
    const severeBlockedDeliverables = blockedLeaves.filter((t: any) => {
      let sId = t.sprint_id;
      if (!sId && t.parent_id) {
        const p = workItems.find((w: any) => w.id === t.parent_id);
        if (p?.sprint_id) sId = p.sprint_id;
      }
      const sObj = sId ? sprintMap.get(sId) : null;
      if (sObj?.status === 'COMPLETED') return false;

      if (t.priority === WorkItemPriority.URGENT) return true;
      if (t.priority === WorkItemPriority.HIGH) {
        if (t.due_date) {
          const diffDays = Math.floor((new Date(t.due_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          return diffDays <= 3;
        }
        if (daysUntilDeadline !== null && daysUntilDeadline <= 3) return true;
        if (sObj?.status === 'ACTIVE' && sObj.end_date) {
          const sprintDays = Math.floor((new Date(sObj.end_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (sprintDays <= 3) return true;
        }
      }
      return false;
    });

    if (severeBlockedDeliverables.length > 0) {
      criticalReasons.push(
        `${severeBlockedDeliverables.length} high-priority deliverable(s) blocked · Urgent resolution required`
      );
    }

    // Rule 3: High Delivery Risk (More than 50% of remaining SP blocked)
    if (blocked_work_percentage > BLOCKED_RISK_THRESHOLDS.HIGH_RISK_MIN) {
      criticalReasons.push(
        `High delivery risk: ${blocked_sp} of ${remaining_sp} remaining SP blocked (${Math.round(blocked_work_percentage)}%)`
      );
    } else if (blocked_work_percentage === BLOCKED_RISK_THRESHOLDS.HIGH_RISK_MIN) {
      // At exactly 50%, evaluate for CRITICAL if severe factors or widespread task count apply
      const hasCriticalFactors =
        severeBlockedDeliverables.length > 0 ||
        critOverdueTasks.length > 0 ||
        blockedInActiveSprint.length > 0 ||
        blocked_tasks >= 3;
      if (hasCriticalFactors) {
        criticalReasons.push(
          `High delivery risk: ${blocked_sp} of ${remaining_sp} remaining SP blocked (50%)`
        );
      }
    }

    // Rule 4: Significant schedule slippage
    if (projectEndDatePassed) {
      if (
        progress_percentage === 0 ||
        projectOverdueDays >= 14 ||
        (projectOverdueDays >= 7 && (progress_percentage ?? 0) < 50)
      ) {
        criticalReasons.push(
          `Project deadline passed ${projectOverdueDays} days ago · ${remaining_sp} SP pending`
        );
      }
    }

    // Rule 5: Critical volume of overdue work
    if (overdue_tasks >= 4 || (overdue_tasks >= 3 && overdue_tasks / total_tasks >= 0.4)) {
      criticalReasons.push(`${overdue_tasks} deliverables overdue · Significant delivery risk`);
    }

    if (criticalReasons.length > 0) {
      return {
        health: 'CRITICAL',
        reasons: criticalReasons,
        warnings,
        has_estimated_work: true,
        total_sp,
        completed_sp,
        remaining_sp,
        blocked_sp,
        blocked_work_percentage,
        unestimated_blockers_count,
        progress_percentage,
        completion_percentage: progress_percentage,
        story_count: stories.length,
        completed_stories_count,
        blocked_stories_count,
        overdue_stories_count,
        total_tasks,
        completed_tasks,
        overdue_tasks,
        blocked_tasks,
        critical_tasks: critOverdueTasks.length + severeBlockedDeliverables.length,
        project_overdue_days: projectOverdueDays,
        max_task_overdue_days: maxTaskOverdueDays,
        stories: storyItems,
      };
    }

    // --- AT_RISK THRESHOLDS ---

    // Rule A: Moderate project-level delay
    if (projectEndDatePassed) {
      atRiskReasons.push(
        `Project deadline passed ${projectOverdueDays} ${projectOverdueDays === 1 ? 'day' : 'days'} ago · ${remaining_sp} SP pending`
      );
    }

    // Rule B: Active sprint deadline passed
    if (sprintOverdue) {
      atRiskReasons.push('Active sprint deadline passed · Delivery delayed');
    }

    // Rule C: Story-Point-Based Blocker Impact (Configurable thresholds)
    if (blocked_work_percentage >= BLOCKED_RISK_THRESHOLDS.HIGH_RISK_MIN) {
      // Exactly 50% without critical factors evaluated to AT_RISK
      atRiskReasons.push(
        `${blocked_sp} of ${remaining_sp} remaining SP blocked (${Math.round(blocked_work_percentage)}%) · Significant delivery risk`
      );
    } else if (blocked_work_percentage >= BLOCKED_RISK_THRESHOLDS.POTENTIAL_RISK_MIN) {
      // 25% to below 50%: Potential delivery risk
      atRiskReasons.push(
        `${blocked_sp} of ${remaining_sp} remaining SP blocked (${Math.round(blocked_work_percentage)}%) · Potential delivery risk`
      );
    } else {
      // Below 25%: Low exposure; do NOT classify as AT_RISK solely on percentage!
      // But check if a high-priority blocker threatens an active sprint:
      const highPriorityActiveBlockers = blockedInActiveSprint.filter(
        (t: any) => t.priority === WorkItemPriority.HIGH || t.priority === WorkItemPriority.URGENT
      );
      if (highPriorityActiveBlockers.length > 0) {
        atRiskReasons.push(
          `High-priority deliverable blocked in active sprint · Immediate delivery risk`
        );
      } else {
        // High-priority unestimated blocker in active sprint
        const urgentUnestimatedActive = unestimatedBlockers.filter((t: any) => {
          let sId = t.sprint_id;
          if (!sId && t.parent_id) {
            const p = workItems.find((w: any) => w.id === t.parent_id);
            if (p?.sprint_id) sId = p.sprint_id;
          }
          const sObj = sId ? sprintMap.get(sId) : null;
          return (
            (t.priority === WorkItemPriority.HIGH || t.priority === WorkItemPriority.URGENT) &&
            sObj?.status === 'ACTIVE'
          );
        });
        if (urgentUnestimatedActive.length > 0) {
          atRiskReasons.push(
            `High-priority unestimated deliverable blocked in active sprint · Attention required`
          );
        }
      }
    }

    // Rule D: Task-level overdue deliverables
    if (overdue_tasks > 0) {
      atRiskReasons.push(`${overdue_tasks} deliverable(s) overdue (${maxTaskOverdueDays}d delay)`);
    }

    // Rule E: Imminent project deadline (< 7 days) with low progress (< 40%)
    if (daysUntilDeadline !== null && daysUntilDeadline <= 7 && (progress_percentage ?? 0) < 40 && remaining_sp > 0) {
      atRiskReasons.push(`Upcoming deadline in ${daysUntilDeadline}d with ${remaining_sp} SP remaining`);
    }

    if (atRiskReasons.length > 0) {
      return {
        health: 'AT_RISK',
        reasons: atRiskReasons,
        warnings,
        has_estimated_work: true,
        total_sp,
        completed_sp,
        remaining_sp,
        blocked_sp,
        blocked_work_percentage,
        unestimated_blockers_count,
        progress_percentage,
        completion_percentage: progress_percentage,
        story_count: stories.length,
        completed_stories_count,
        blocked_stories_count,
        overdue_stories_count,
        total_tasks,
        completed_tasks,
        overdue_tasks,
        blocked_tasks,
        critical_tasks: critOverdueTasks.length + severeBlockedDeliverables.length,
        project_overdue_days: projectOverdueDays,
        max_task_overdue_days: maxTaskOverdueDays,
        stories: storyItems,
      };
    }

    // --- HEALTHY ---
    let healthyReason = 'On schedule · 0 overdue · 0 active blockers';
    if (remaining_sp === 0) {
      healthyReason = 'All deliverables completed';
    } else if (!hasExplicitSchedule) {
      if (blockedInCompletedSprint.length > 0) {
        healthyReason = `No active delivery blockers · ${blockedInCompletedSprint.length} item in completed sprint flagged for review`;
      } else {
        healthyReason = 'No active delivery blockers · Schedule dates not set';
      }
    } else if (blocked_work_percentage > 0 && blocked_work_percentage < BLOCKED_RISK_THRESHOLDS.POTENTIAL_RISK_MIN) {
      healthyReason = `On track · Low blocker exposure (${blocked_sp} of ${remaining_sp} SP blocked)`;
    }

    return {
      health: 'HEALTHY',
      reasons: [healthyReason],
      warnings,
      has_estimated_work: true,
      total_sp,
      completed_sp,
      remaining_sp,
      blocked_sp,
      blocked_work_percentage,
      unestimated_blockers_count,
      progress_percentage,
      completion_percentage: progress_percentage,
      story_count: stories.length,
      completed_stories_count,
      blocked_stories_count: 0,
      overdue_stories_count: 0,
      total_tasks,
      completed_tasks,
      overdue_tasks: 0,
      blocked_tasks,
      critical_tasks: 0,
      project_overdue_days: 0,
      max_task_overdue_days: 0,
      stories: storyItems,
    };
  }

  /**
   * Get portfolio health overview across all projects in the manager/user's organization scope
   */
  static async getPortfolioHealth(
    user: any,
    filters?: { cohort_id?: string }
  ): Promise<PortfolioHealthResponse> {
    const orgId = await this.getEffectiveOrgId(user);
    if (!orgId) {
      return {
        summary: { total: 0, assessed: 0, healthy: 0, at_risk: 0, critical: 0, not_assessed: 0, insufficient_data: 0, attention_required: 0, attention_rate: 0 },
        distribution: {
          healthy: { count: 0, percentage: 0 },
          at_risk: { count: 0, percentage: 0 },
          critical: { count: 0, percentage: 0 },
          not_assessed: { count: 0, percentage: 0 },
          insufficient_data: { count: 0, percentage: 0 },
        },
        projects: [],
      };
    }

    const where: any = { organization_id: orgId };

    // Optional cohort filter
    if (filters?.cohort_id) {
      where.members = {
        some: {
          user: {
            cohort_id: filters.cohort_id,
          },
        },
      };
    }

    // Single non-N+1 query with work items and sprints
    const dbProjects = await prisma.project.findMany({
      where,
      select: {
        id: true,
        name: true,
        status: true,
        start_date: true,
        end_date: true,
        work_items: {
          select: {
            id: true,
            title: true,
            type: true,
            status: true,
            priority: true,
            due_date: true,
            story_points: true,
            parent_id: true,
            sprint_id: true,
          },
        },
        sprints: {
          select: {
            id: true,
            status: true,
            start_date: true,
            end_date: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const classifiedProjects: ProjectHealthItem[] = dbProjects.map((p) => {
      const evaluation = this.classifyProjectHealth(p);
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        health: evaluation.health,
        reasons: evaluation.reasons,
        warnings: evaluation.warnings,
        completion_percentage: evaluation.completion_percentage,
        progress_percentage: evaluation.progress_percentage,
        has_estimated_work: evaluation.has_estimated_work,
        total_sp: evaluation.total_sp,
        completed_sp: evaluation.completed_sp,
        remaining_sp: evaluation.remaining_sp,
        blocked_sp: evaluation.blocked_sp,
        blocked_work_percentage: evaluation.blocked_work_percentage,
        unestimated_blockers_count: evaluation.unestimated_blockers_count,
        story_count: evaluation.story_count,
        completed_stories_count: evaluation.completed_stories_count,
        blocked_stories_count: evaluation.blocked_stories_count,
        overdue_stories_count: evaluation.overdue_stories_count,
        completed_tasks: evaluation.completed_tasks,
        total_tasks: evaluation.total_tasks,
        overdue_tasks: evaluation.overdue_tasks,
        blocked_tasks: evaluation.blocked_tasks,
        critical_tasks: evaluation.critical_tasks,
        project_overdue_days: evaluation.project_overdue_days,
        max_task_overdue_days: evaluation.max_task_overdue_days,
        stories: evaluation.stories,
      };
    });

    const total = classifiedProjects.length;
    const healthyCount = classifiedProjects.filter((p) => p.health === 'HEALTHY').length;
    const atRiskCount = classifiedProjects.filter((p) => p.health === 'AT_RISK').length;
    const criticalCount = classifiedProjects.filter((p) => p.health === 'CRITICAL').length;
    const notAssessedCount = classifiedProjects.filter(
      (p) => p.health === 'NOT_ASSESSED' || (p.health as any) === 'INSUFFICIENT_DATA'
    ).length;

    const assessedCount = healthyCount + atRiskCount + criticalCount;
    const attentionRequiredCount = atRiskCount + criticalCount;

    const roundPct = (num: number, den: number) => {
      if (den <= 0) return 0;
      return Number(((num / den) * 100).toFixed(1));
    };

    const summary: PortfolioHealthSummary = {
      total,
      assessed: assessedCount,
      healthy: healthyCount,
      at_risk: atRiskCount,
      critical: criticalCount,
      not_assessed: notAssessedCount,
      insufficient_data: notAssessedCount,
      attention_required: attentionRequiredCount,
      attention_rate: roundPct(attentionRequiredCount, assessedCount),
    };

    const distribution: PortfolioHealthDistribution = {
      healthy: {
        count: healthyCount,
        percentage: roundPct(healthyCount, assessedCount),
      },
      at_risk: {
        count: atRiskCount,
        percentage: roundPct(atRiskCount, assessedCount),
      },
      critical: {
        count: criticalCount,
        percentage: roundPct(criticalCount, assessedCount),
      },
      not_assessed: {
        count: notAssessedCount,
        percentage: roundPct(notAssessedCount, total),
      },
      insufficient_data: {
        count: notAssessedCount,
        percentage: roundPct(notAssessedCount, total),
      },
    };

    return {
      summary,
      distribution,
      projects: classifiedProjects,
    };
  }
}
